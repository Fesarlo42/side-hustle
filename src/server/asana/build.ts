/**
 * Turns what Asana holds about the side hustle into the dashboard's Snapshot.
 * Pure: the same Asana data and clock always give the same result.
 *
 * Sources (as the harness's dashboard skill reads them):
 * - tasks: name, creator (= owner), assignee, section, custom fields;
 * - task stories: section moves plus the harness markers in comments
 *   (claim, review, released, stalled, usage);
 * - the ledger task: `Side hustle pledge:` records.
 *
 * What Asana can't tell, and how it's filled in:
 * - Pledge used = the claim records of this ISO week (reserved budgets), as in the harness.
 *   "Where pledges go" uses the same claims, so the numbers agree.
 * - A task's "used" = the `~n%` of its usage reports (an estimate), 0 until the first report.
 * - Members without a pledge record this week have pledge 0 ("pending") and show as offline.
 * - Teams aren't in Asana: departments come from data/teams.json (see teams.ts); everyone else is in "iubenda". Projects come from the task's target resource.
 */
import { teamFor, type TeamMap } from './teams'
import { computeHealth } from '@/config/health'
import { SECTION_LABEL, joinNames, partOfDay, plural, say, weekday } from '@/data/mock/text'
import type {
  Agent,
  DashEvent,
  EventType,
  Insight,
  Member,
  Project,
  Pulse,
  Ref,
  ReviewFailure,
  Section,
  SectionStay,
  Task,
  TaskFlag,
  TaskSize,
  TransitionReason,
  UsageBucket,
  Week,
  WorkflowConfig,
} from '@/types'
import { ASANA, BUDGET_BY_SIZE, DEFAULT_PROJECT, SECTION_BY_NAME, WORKFLOW } from './config'
import {
  isoWeek,
  parseClaim,
  parsePledge,
  parseReleased,
  parseReview,
  parseReviewStarted,
  parseStalled,
  parseUsage,
  type ReviewMarker,
} from './markers'

// ---------- Raw Asana shapes (only the fields we request) ----------

export interface RawRef {
  gid: string
  name?: string | null
}
export interface RawUser extends RawRef {
  email?: string | null
  photo?: { image_60x60?: string | null } | null
}
export interface RawStory {
  gid: string
  created_at: string
  created_by?: RawRef | null
  resource_subtype?: string
  type?: string
  text?: string | null
  new_section?: RawRef | null
  old_section?: RawRef | null
}
export interface RawCustomField {
  gid: string
  display_value?: string | null
  number_value?: number | null
  date_value?: { date?: string | null; date_time?: string | null } | null
  enum_value?: { name?: string | null } | null
}
export interface RawTask {
  gid: string
  name: string
  notes?: string | null
  created_at: string
  created_by?: RawRef | null
  completed?: boolean
  completed_at?: string | null
  assignee?: RawRef | null
  memberships?: { project?: RawRef | null; section?: RawRef | null }[]
  custom_fields?: RawCustomField[]
  permalink_url?: string | null
  modified_at?: string | null
  parent?: RawRef | null
}
export interface RawProject {
  gid: string
  name: string
  created_at?: string | null
  members?: RawUser[]
}
export interface AsanaData {
  project: RawProject
  tasks: RawTask[]
  /** Stories per task gid, any order. */
  stories: Record<string, RawStory[]>
}

export interface Built {
  members: Member[]
  projects: Project[]
  agents: Agent[]
  tasks: Task[]
  insights: Insight[]
  events: DashEvent[]
  usage: UsageBucket[]
  week: Week
  config: WorkflowConfig
}

// ---------- Helpers ----------

const HOUR = 3_600_000
const DAY = 24 * HOUR
const SNAPSHOT_EVENTS = 100
const HOLDING: ReadonlySet<Section> = new Set(['doing', 'to_review'])
const UNCLAIMED: ReadonlySet<Section> = new Set(['open', 'next'])

const iso = (ms: number) => new Date(ms).toISOString()
const t = (s: string) => Date.parse(s)
const round2 = (n: number) => Math.round(n * 100) / 100
const memberId = (gid: string) => `u_${gid}`
const first = (name: string) => name.trim().split(/\s+/)[0] ?? name
const q = (title: string) => `“${title}”`

function sectionOf(ref: RawRef | null | undefined): Section | undefined {
  if (!ref) return undefined
  return ASANA.sections[ref.gid] ?? SECTION_BY_NAME[(ref.name ?? '').trim().toLowerCase()]
}

function field(task: RawTask, gid: string): RawCustomField | undefined {
  return task.custom_fields?.find((f) => f.gid === gid)
}

function sizeOf(task: RawTask): TaskSize | undefined {
  const f = field(task, ASANA.fields.estimate)
  const v = (f?.enum_value?.name ?? f?.display_value ?? '').trim().toUpperCase()
  return v === 'S' || v === 'M' || v === 'L' ? v : undefined
}

function budgetOf(task: RawTask, size: TaskSize): number {
  const f = field(task, ASANA.fields.budget)
  const n = f?.number_value ?? (f?.display_value ? Number(f.display_value) : NaN)
  return Number.isFinite(n) ? round2(n * 100) : BUDGET_BY_SIZE[size]
}

function heartbeatOf(task: RawTask): string | undefined {
  const f = field(task, ASANA.fields.lastHeartbeat)
  const v = f?.date_value?.date_time ?? f?.date_value?.date ?? f?.display_value
  if (!v) return undefined
  const ms = t(v.length === 10 ? `${v}T00:00:00Z` : v)
  return Number.isFinite(ms) ? iso(ms) : undefined
}

/**
 * The repo or tool a task delivers to, from its "Target resource": the template's
 * "## Target resource" heading with a URL below, or an older "Target resource: GitHub repo owner/name" line.
 */
function projectOf(task: RawTask): Project {
  const notes = task.notes ?? ''
  const m = /(?:##\s*)?Target resource:?[ \t]*\n*[ \t]*([^\n]+)/i.exec(notes)
  const url = m?.[1]?.trim() ?? ''
  const repo = /(?:github\.com\/|gitlab\.[^/\s]+\/|repo\s+)([\w.-]+)\/([\w.-]+)/i.exec(url)
  if (repo) {
    const name = repo[2]!.replace(/\.git$/, '')
    return { id: `p_${repo[1]!}_${name}`.toLowerCase(), name, team: DEFAULT_PROJECT.team }
  }
  if (/app\.asana\.com/i.test(url))
    return { id: 'p_asana', name: 'Asana', team: DEFAULT_PROJECT.team }
  return { ...DEFAULT_PROJECT }
}

// ---------- Build ----------

export function build(data: AsanaData, now: number, teams: TeamMap = {}): Built {
  const week = isoWeek(now)
  const resetAt = week.startsAt + 7 * DAY
  const timeoutMs = WORKFLOW.heartbeatTimeoutMin * 60_000

  // People: project members first, then anyone else who shows up.
  const users = new Map<string, RawUser>()
  for (const u of data.project.members ?? []) users.set(u.gid, u)
  const see = (r?: RawRef | null) => {
    if (r?.gid && !users.has(r.gid)) users.set(r.gid, { gid: r.gid, name: r.name ?? 'Someone' })
  }
  const byName = () =>
    new Map([...users.values()].map((u) => [(u.name ?? '').toLowerCase(), u.gid]))
  /** Markers carry a name; their author is the user whose session wrote them. */
  const who = (story: RawStory, name?: string): string | undefined => {
    if (story.created_by?.gid) {
      see(story.created_by)
      return memberId(story.created_by.gid)
    }
    const gid = name ? byName().get(name.toLowerCase()) : undefined
    return gid ? memberId(gid) : undefined
  }
  const lastSeen = new Map<string, number>()
  const touch = (id: string | undefined, at: number) => {
    if (id && (lastSeen.get(id) ?? 0) < at) lastSeen.set(id, at)
  }

  const events: DashEvent[] = []
  const insights: Insight[] = []
  const tasks: Task[] = []
  const projects = new Map<string, Project>()
  const claimsThisWeek: { memberId: string; pct: number; at: number; task: Task }[] = []
  const reviewers = new Map<string, { taskId?: string; at: number }>()
  const nameOf = (id?: string) => {
    const u = id ? users.get(id.slice(2)) : undefined
    return first(u?.name ?? 'Someone')
  }
  const push = (
    id: string,
    at: number,
    type: EventType,
    actor: Ref,
    text: string,
    related: Ref[],
    data?: DashEvent['data'],
  ) => events.push({ id, at: iso(at), type, actor, text, related, ...(data ? { data } : {}) })

  const sortedStories = (gid: string) =>
    [...(data.stories[gid] ?? [])].sort((a, b) => t(a.created_at) - t(b.created_at))

  for (const raw of data.tasks) {
    if (raw.gid === ASANA.ledgerTaskGid || raw.parent) continue
    see(raw.created_by)
    see(raw.assignee)
    const stories = sortedStories(raw.gid)
    const created = t(raw.created_at)
    const project = projectOf(raw)
    projects.set(project.id, project)

    const membership = raw.memberships?.find((m) => m.project?.gid === ASANA.projectGid)
    const section: Section = sectionOf(membership?.section) ?? (raw.completed ? 'done' : 'open')
    const ownerGid = raw.created_by?.gid ?? raw.assignee?.gid ?? data.project.members?.[0]?.gid
    const ownerId = ownerGid ? memberId(ownerGid) : 'u_unknown'
    if (!ownerGid) users.set('unknown', { gid: 'unknown', name: 'Unknown' })
    touch(ownerId, created)

    // Walk the stories once.
    const moves: { from?: Section; to: Section; at: number; story: RawStory }[] = []
    const claims: { memberId: string; pct: number; week: string; at: number; story: RawStory }[] =
      []
    const releases: { reason: TransitionReason; at: number; story: RawStory }[] = []
    const reviews: (ReviewMarker & { at: number; story: RawStory; by?: string })[] = []
    let reviewerId: string | undefined
    let stalled: 'stalled' | 'cleared' | undefined
    let reminderAt: number | undefined
    let usedPct = 0
    let implModel: string | undefined
    let anyModel: string | undefined

    for (const s of stories) {
      const at = t(s.created_at)
      if (s.created_by?.gid) touch(memberId(s.created_by.gid), at)
      if (s.resource_subtype === 'section_changed') {
        const to = sectionOf(s.new_section)
        if (to) moves.push({ from: sectionOf(s.old_section), to, at, story: s })
        continue
      }
      const text = s.text ?? ''
      if (!text.startsWith('Side hustle')) continue
      const claim = parseClaim(text)
      if (claim) {
        const id = who(s, claim.name)
        if (id) claims.push({ memberId: id, pct: claim.pct, week: claim.week, at, story: s })
        continue
      }
      const released = parseReleased(text)
      if (released) {
        releases.push({ reason: released, at, story: s })
        continue
      }
      const started = parseReviewStarted(text)
      if (started) {
        reviewerId = who(s, started)
        continue
      }
      const review = parseReview(text)
      if (review) {
        reviews.push({ ...review, at, story: s, by: who(s) })
        continue
      }
      const usage = parseUsage(text)
      if (usage) {
        for (const l of usage.lines) {
          usedPct += l.pct
          anyModel = l.model
          if (l.phase === 'implementation') implModel = l.model
        }
        continue
      }
      const st = parseStalled(text)
      if (st) stalled = st
      else if (/^Side hustle reminder\b/i.test(text)) reminderAt = at
    }

    // Section history: where it started, every move, and where it is now.
    const sectionLog: SectionStay[] = [
      { section: moves[0]?.from ?? section, enteredAt: iso(created) },
    ]
    const lastStay = () => sectionLog[sectionLog.length - 1]!
    for (const m of moves) {
      lastStay().leftAt = iso(m.at)
      sectionLog.push({ section: m.to, enteredAt: iso(m.at) })
    }
    if (lastStay().section !== section) {
      // A move Asana didn't report (or happened before the stories we read).
      const at = Math.max(t(lastStay().enteredAt), t(raw.modified_at ?? raw.created_at))
      lastStay().leftAt = iso(at)
      sectionLog.push({ section, enteredAt: iso(at) })
    }
    const sectionSince = lastStay().enteredAt

    // Who holds it: the latest claim, unless it was released after that.
    const lastClaim = claims.at(-1)
    const lastRelease = releases.at(-1)
    const held =
      lastClaim && (!lastRelease || lastClaim.at > lastRelease.at) && !UNCLAIMED.has(section)
    let pickerId: string | undefined
    let previousPickerId: string | undefined
    if (held) {
      pickerId = lastClaim.memberId
      const before = [...claims].reverse().find((c) => c.memberId !== pickerId)
      previousPickerId = before?.memberId
    } else if (lastClaim) {
      previousPickerId = lastClaim.memberId
    } else if (!UNCLAIMED.has(section) && raw.assignee?.gid) {
      pickerId = memberId(raw.assignee.gid)
    }

    const size = sizeOf(raw) ?? 'M'
    const heartbeat = heartbeatOf(raw)
    let flag: TaskFlag | undefined
    let orphanedSince: number | undefined
    if (stalled === 'stalled') flag = 'stalled'
    else if (HOLDING.has(section)) {
      const ref = Math.max(heartbeat ? t(heartbeat) : 0, t(sectionSince))
      if (now - ref > timeoutMs) {
        flag = 'orphaned'
        orphanedSince = ref + timeoutMs
      }
    }

    const fails = reviews.filter((r) => !r.pass)
    const reviewFailures: ReviewFailure[] = fails.map((r) => ({
      check: r.check ?? 'compliance',
      at: iso(r.at),
      destructive: r.outcome === 'destructive',
    }))
    const retries = fails.filter((r) => r.outcome === 'retry').length
    const doneMove = [...moves].reverse().find((m) => m.to === 'done')

    const task: Task = {
      id: `t_${raw.gid}`,
      asanaUrl: raw.permalink_url ?? `https://app.asana.com/0/${ASANA.projectGid}/${raw.gid}`,
      title: raw.name,
      projectId: project.id,
      ownerId,
      ...(pickerId ? { pickerId, pickerAgentId: `a_pick_${pickerId}` } : {}),
      ...(reviewerId ? { reviewerAgentId: `a_rev_${reviewerId}` } : {}),
      ...(previousPickerId ? { previousPickerId } : {}),
      section,
      sectionSince,
      sectionLog,
      ...(flag ? { flag } : {}),
      size,
      budgetPct: budgetOf(raw, size),
      usedPct: round2(usedPct),
      reviewAttempts: retries + (section === 'to_review' ? 1 : 0),
      maxReviewAttempts: WORKFLOW.maxReviewAttempts,
      reviewFailures,
      rejections: moves.filter((m) => m.from === 'qa_review' && m.to === 'next').length,
      model: implModel ?? anyModel ?? 'Not reported',
      ...(heartbeat ? { lastHeartbeatAt: heartbeat } : {}),
      ...(reminderAt ? { reminderSentAt: iso(reminderAt) } : {}),
      createdAt: iso(created),
      ...(section === 'done'
        ? { doneAt: iso(doneMove?.at ?? t(raw.completed_at ?? sectionSince)) }
        : {}),
    }
    tasks.push(task)
    if (reviewerId) {
      const prev = reviewers.get(reviewerId)
      const at = reviews.at(-1)?.at ?? t(sectionSince)
      if (!prev || prev.at < at)
        reviewers.set(reviewerId, { taskId: section === 'to_review' ? task.id : undefined, at })
    }
    for (const c of claims)
      if (c.week === week.label)
        claimsThisWeek.push({ memberId: c.memberId, pct: c.pct, at: c.at, task })

    // Events.
    const tRef: Ref = { type: 'task', id: task.id }
    const ownerRef: Ref = { type: 'member', id: ownerId }
    push(
      `e_pub_${raw.gid}`,
      created,
      'task.published',
      ownerRef,
      say.published(nameOf(ownerId), raw.name, project.name),
      [tRef, ownerRef],
      {
        to: sectionLog[0]!.section,
        reason: 'published',
      },
    )
    claims.forEach((c, i) => {
      const prev = claims
        .slice(0, i)
        .reverse()
        .find((p) => p.memberId !== c.memberId)
      const text = prev
        ? say.claimedHandover(nameOf(c.memberId), raw.name, nameOf(prev.memberId))
        : say.claimed(nameOf(c.memberId), raw.name)
      const pRef: Ref = { type: 'member', id: c.memberId }
      push(`e_${c.story.gid}`, c.at, 'task.claimed', pRef, text, [tRef, pRef], {
        reason: 'claimed',
      })
    })
    for (const m of moves) {
      const actorId = m.story.created_by?.gid ? memberId(m.story.created_by.gid) : undefined
      const actor: Ref = actorId ? { type: 'member', id: actorId } : { type: 'system', id: 'asana' }
      const picker = pickerId ?? previousPickerId
      const base = { from: m.from, to: m.to }
      if (m.from === 'qa_review' && m.to === 'done') {
        push(
          `e_${m.story.gid}`,
          m.at,
          'task.approved',
          ownerRef,
          say.approved(nameOf(ownerId), raw.name),
          [tRef, ownerRef],
          { ...base, reason: 'approved' },
        )
        continue
      }
      if (m.from === 'qa_review' && m.to === 'next') {
        push(
          `e_${m.story.gid}`,
          m.at,
          'task.rejected',
          ownerRef,
          say.rejected(nameOf(ownerId), raw.name),
          [tRef, ownerRef],
          { ...base, reason: 'rejected' },
        )
        continue
      }
      let reason: TransitionReason | undefined
      let text = `${q(raw.name)} moved from ${m.from ? SECTION_LABEL[m.from] : 'somewhere else'} to ${SECTION_LABEL[m.to]}`
      if (m.to === 'to_review') {
        reason = 'implemented'
        if (picker) text = say.toReview(nameOf(picker), raw.name)
      } else if (m.from === 'to_review' && m.to === 'qa_review') reason = 'review_passed'
      else if (m.from === 'to_review' && m.to === 'doing') reason = 'review_failed'
      else if (m.to === 'doing') reason = 'claimed'
      else if (m.to === 'needs_info') {
        const lastFail = fails.filter((f) => f.at <= m.at).at(-1)
        reason =
          lastFail?.outcome === 'attempts_exhausted'
            ? 'attempts_exhausted'
            : lastFail?.outcome === 'destructive'
              ? 'review_destructive'
              : 'info_missing'
        if (reason === 'attempts_exhausted') text = say.attemptsExhausted(raw.name)
      } else if (m.from === 'needs_info' && m.to === 'open') {
        reason = 'info_completed'
        text = say.infoCompleted(nameOf(ownerId), raw.name)
      } else if (m.to === 'next') reason = 'released'
      push(`e_${m.story.gid}`, m.at, 'task.section_changed', actor, text, [tRef], {
        ...base,
        ...(reason ? { reason } : {}),
      })
    }
    for (const r of reviews) {
      const actor: Ref = r.by
        ? { type: 'agent', id: `a_rev_${r.by}` }
        : { type: 'system', id: 'reviewer' }
      if (r.pass) {
        push(
          `e_${r.story.gid}`,
          r.at,
          'review.passed',
          actor,
          say.reviewPassed(raw.name, nameOf(ownerId)),
          [tRef],
        )
        continue
      }
      const failNo = fails.indexOf(r) + 1
      const text =
        r.outcome === 'attempts_exhausted'
          ? say.attemptsExhausted(raw.name)
          : r.outcome === 'destructive'
            ? `The reviewer stopped ${q(raw.name)}: the change could break something, so it went to Needs Info`
            : say.reviewFailed(
                raw.name,
                r.check ?? 'compliance',
                Math.min(failNo + 1, WORKFLOW.maxReviewAttempts),
                WORKFLOW.maxReviewAttempts,
              )
      push(`e_${r.story.gid}`, r.at, 'review.failed', actor, text, [tRef], {
        check: r.check,
        attempt: r.attempt ?? failNo,
        reason:
          r.outcome === 'destructive'
            ? 'review_destructive'
            : r.outcome === 'attempts_exhausted'
              ? 'attempts_exhausted'
              : 'review_failed',
      })
    }
    for (const r of releases) {
      const holder = [...claims].reverse().find((c) => c.at < r.at)?.memberId
      const name = holder ? nameOf(holder) : 'An'
      const text =
        r.reason === 'orphaned'
          ? say.releasedOrphaned(raw.name, holder ? name : 'the picker')
          : r.reason === 'pledge_exhausted' && holder
            ? say.releasedPledge(name, raw.name)
            : `${holder ? `${name}’s agent` : 'An agent'} documented ${q(raw.name)} and released it to Next`
      push(
        `e_${r.story.gid}`,
        r.at,
        'task.released',
        { type: 'system', id: 'harness' },
        text,
        [tRef],
        { to: 'next', reason: r.reason },
      )
    }

    // Flags become insights, so they're explained, not just coloured.
    if (flag === 'orphaned' && orphanedSince !== undefined) {
      const h = Math.floor((now - (orphanedSince - timeoutMs)) / HOUR)
      insights.push({
        id: `i_orphan_${raw.gid}`,
        kind: 'flow',
        severity: 'heads_up',
        title: `${q(raw.name)} has had no heartbeat for ${plural(h, 'hour')}`,
        detail: `It’s in ${SECTION_LABEL[section]} and its agent stopped checking in.`,
        agentAction:
          'The next agent that polls Asana releases it to Next, so someone else can pick it up.',
        state: 'open',
        openedAt: iso(orphanedSince),
        related: [tRef],
      })
    } else if (flag === 'stalled') {
      insights.push({
        id: `i_stalled_${raw.gid}`,
        kind: 'flow',
        severity: 'heads_up',
        title: `${q(raw.name)} is waiting on ${nameOf(ownerId)}`,
        detail: 'It’s in Needs Info, and the reminder got no answer.',
        agentAction: `${nameOf(ownerId)}’s agent releases it to Next unless the details arrive.`,
        state: 'open',
        openedAt: reminderAt ? iso(reminderAt) : sectionSince,
        related: [tRef, ownerRef],
      })
    }
  }

  // Pledges, from the ledger.
  const ledger = sortedStories(ASANA.ledgerTaskGid)
  const pledges = new Map<string, { pct: number; at: number }[]>()
  for (const s of ledger) {
    const p = parsePledge(s.text ?? '')
    if (!p) continue
    const id = who(s, p.name)
    if (!id) continue
    const at = t(s.created_at)
    touch(id, at)
    const list = pledges.get(id) ?? []
    const prev = list.at(-1)?.pct
    if (p.week === week.label) list.push({ pct: p.pct, at })
    pledges.set(id, list)
    const mRef: Ref = { type: 'member', id }
    push(
      `e_${s.gid}`,
      at,
      'pledge.answered',
      mRef,
      say.pledgeAnswered(nameOf(id), p.pct, prev ?? p.pct),
      [mRef],
      {
        pledgePct: p.pct,
        ...(prev !== undefined ? { previousPledgePct: prev } : {}),
      },
    )
  }

  // Members.
  const used = new Map<string, number>()
  for (const c of claimsThisWeek) used.set(c.memberId, (used.get(c.memberId) ?? 0) + c.pct)
  const working = new Set(
    tasks
      .filter((x) => HOLDING.has(x.section) && x.flag !== 'orphaned' && x.pickerId)
      .map((x) => x.pickerId!),
  )
  const projectCreated = t(data.project.created_at ?? '') || now
  const members: Member[] = [...users.values()].map((u) => {
    const id = memberId(u.gid)
    const list = pledges.get(id) ?? []
    const latest = list.at(-1)
    const prev = list.length > 1 ? list[list.length - 2]!.pct : undefined
    const seen = lastSeen.get(id) ?? projectCreated
    return {
      id,
      name: u.name ?? 'Someone',
      ...(u.photo?.image_60x60 ? { avatarUrl: u.photo.image_60x60 } : {}),
      team: teamFor(u.name ?? '', teams) ?? DEFAULT_PROJECT.team,
      slackUserId: '',
      joinedAt: iso(Math.min(projectCreated, seen)),
      status: working.has(id) ? 'working' : latest ? 'idle' : 'offline',
      resetAt: iso(resetAt),
      pledgePct: latest?.pct ?? 0,
      pledgeSource: latest ? 'answered' : 'pending',
      pledgeUpdatedAt: iso(latest?.at ?? week.startsAt),
      ...(prev !== undefined && prev !== latest?.pct ? { pledgePrevPct: prev } : {}),
      pledgeUsedPct: round2(used.get(id) ?? 0),
      lastSeenAt: iso(seen),
    }
  })

  // Agents: one picker agent per person who claimed, one reviewer agent per person who reviewed.
  const statusOf = (id: string) => members.find((m) => m.id === id)?.status ?? 'offline'
  const agents: Agent[] = []
  const pickers = new Set(
    tasks.flatMap((x) => [x.pickerId, x.previousPickerId]).filter(Boolean) as string[],
  )
  for (const id of pickers) {
    const current = tasks.find((x) => x.pickerId === id && HOLDING.has(x.section))
    agents.push({
      id: `a_pick_${id}`,
      name: `${nameOf(id)}’s agent`,
      role: 'picker',
      memberId: id,
      status: statusOf(id) === 'working' ? 'working' : statusOf(id) === 'idle' ? 'idle' : 'offline',
      ...(current ? { currentTaskId: current.id } : {}),
      lastHeartbeatAt: current?.lastHeartbeatAt ?? iso(lastSeen.get(id) ?? projectCreated),
    })
  }
  for (const [id, r] of reviewers) {
    agents.push({
      id: `a_rev_${id}`,
      name: `${nameOf(id)}’s reviewer`,
      role: 'reviewer',
      memberId: id,
      status: r.taskId ? 'working' : 'idle',
      ...(r.taskId ? { currentTaskId: r.taskId } : {}),
      lastHeartbeatAt: iso(r.at),
    })
  }

  // Where pledges go: this week's reserved budgets, per hour, picker → owner.
  const buckets = new Map<string, UsageBucket>()
  for (const c of claimsThisWeek) {
    const hour = iso(Math.floor(c.at / HOUR) * HOUR)
    const key = `${hour}|${c.task.id}|${c.memberId}`
    const b = buckets.get(key) ?? {
      hour,
      pickerId: c.memberId,
      ownerId: c.task.ownerId,
      projectId: c.task.projectId,
      taskId: c.task.id,
      usedPct: 0,
    }
    b.usedPct = round2(b.usedPct + c.pct)
    buckets.set(key, b)
  }

  events.sort((a, b) => t(a.at) - t(b.at) || a.id.localeCompare(b.id))

  return {
    members,
    projects: [...projects.values()],
    agents,
    tasks,
    insights,
    events: events.slice(-SNAPSHOT_EVENTS),
    usage: [...buckets.values()],
    week: {
      number: week.number,
      startsAt: iso(week.startsAt),
      resetAt: iso(resetAt),
      // The harness has no check-in deadline: the pledge is recorded at a person's first cycle of the week.
      pledgeDeadline: iso(resetAt),
      answeredCount: members.filter((m) => m.pledgeSource === 'answered').length,
      memberCount: members.length,
    },
    config: WORKFLOW,
  }
}

// ---------- Pulse ----------

export function buildPulse(
  b: Pick<Built, 'members' | 'tasks' | 'week'>,
  insights: Insight[],
  now: number,
): Pulse {
  const poolTotalPct = b.members.reduce((s, m) => s + m.pledgePct, 0)
  const poolUsedPct = b.members.reduce((s, m) => s + Math.min(m.pledgeUsedPct, m.pledgePct), 0)
  const inFlight = b.tasks.filter((x) => HOLDING.has(x.section))
  const timeoutMs = WORKFLOW.heartbeatTimeoutMin * 60_000
  const beating = inFlight.filter(
    (x) => x.lastHeartbeatAt && now - t(x.lastHeartbeatAt) < timeoutMs,
  ).length
  const health = computeHealth({ poolTotalPct, poolUsedPct, tasks: b.tasks, insights, now })

  // "At this week's pace…": pledge used so far per hour.
  const startsAt = t(b.week.startsAt)
  const resetAt = t(b.week.resetAt)
  const perHour = poolUsedPct / Math.max(1, (now - startsAt) / HOUR)
  const left = Math.max(0, poolTotalPct - poolUsedPct)
  const hoursToReset = Math.max(0, (resetAt - now) / HOUR)
  const unused = Math.max(0, left - perHour * hoursToReset)
  const emptyAt =
    perHour > 0 && left / perHour < hoursToReset ? now + (left / perHour) * HOUR : undefined
  const forecastUnusedPct = poolTotalPct > 0 ? Math.round((unused / poolTotalPct) * 100) : 0

  const d = new Date(now)
  const freePct =
    poolTotalPct > 0 ? Math.round(((poolTotalPct - poolUsedPct) / poolTotalPct) * 100) : 0
  const doing = b.tasks.filter((x) => x.section === 'doing')
  let statusLine: string
  if (poolTotalPct === 0)
    statusLine = `Nobody has pledged yet this week. Tasks wait in Open until someone does.`
  else if (emptyAt) {
    const e = new Date(emptyAt)
    statusLine = `Heads up: at this pace the pool runs dry ${weekday(e)} ${partOfDay(e)}.`
  } else if (inFlight.length === 0)
    statusLine = `Quiet ${weekday(d)} ${partOfDay(d)}. Nothing running, ${freePct}% of pledges still free.`
  else {
    const name = (id?: string) => first(b.members.find((m) => m.id === id)?.name ?? '')
    const names = [
      ...new Set((doing.length ? doing : inFlight).map((x) => name(x.pickerId)).filter(Boolean)),
    ]
    const shown = names.length > 3 ? [...names.slice(0, 2), 'others'] : names
    const share = shown.includes('others')
      ? `${shown[0]}’s, ${shown[1]}’s and others’`
      : joinNames(shown)
    const what = doing.length
      ? `${plural(doing.length, 'task')} running`
      : `${plural(inFlight.length, 'task')} in review`
    statusLine = share
      ? `All calm. ${what} on ${share} share, ${freePct}% of pledges still free.`
      : `All calm. ${what}, ${freePct}% of pledges still free.`
  }

  return {
    at: iso(now),
    heartbeatsPerMin: beating,
    poolTotalPct: round2(poolTotalPct),
    poolUsedPct: round2(poolUsedPct),
    tasksInFlight: inFlight.length,
    health,
    statusLine,
    forecastUnusedPct,
    ...(emptyAt ? { forecastEmptyAt: iso(emptyAt) } : {}),
  }
}
