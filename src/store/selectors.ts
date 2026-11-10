/**
 * Derived numbers. Everything here is calculated from tasks, members and
 * usage; nothing derived is stored.
 */
import type { Health, Insight, InsightSeverity, Member, Section, Task, TaskSize } from '@/types'
import type { DataState } from './reducer'

const MIN = 60_000
const HOUR = 60 * MIN

export const ms = (iso: string | undefined) => (iso ? Date.parse(iso) : NaN)

/** Simulated "now" from the latest pulse (falls back to the wall clock). */
export function nowOf(state: DataState): number {
  return state.pulse ? ms(state.pulse.at) : Date.now()
}

// ---------- Members ----------

export const leftPct = (m: Pick<Member, 'pledgePct' | 'pledgeUsedPct'>) =>
  Math.max(0, m.pledgePct - m.pledgeUsedPct)

export type MemberSort = 'left' | 'pledge' | 'name'

export function sortedMembers(state: DataState, by: MemberSort = 'left'): Member[] {
  const list = Object.values(state.members)
  const cmp: Record<MemberSort, (a: Member, b: Member) => number> = {
    left: (a, b) => leftPct(b) - leftPct(a) || a.name.localeCompare(b.name),
    pledge: (a, b) => b.pledgePct - a.pledgePct || a.name.localeCompare(b.name),
    name: (a, b) => a.name.localeCompare(b.name),
  }
  return list.sort(cmp[by])
}

// ---------- KPIs ----------

export interface Kpis {
  people: number
  giving: number
  /** Seat-weeks: 100% = one full weekly limit. */
  pledgeLeftSeatWeeks: number
  pledgeUsedSeatWeeks: number
  poolTotalPct: number
  poolLeftRatio: number
  tasksInFlight: number
  leftAtResetPct: number
}

export function kpis(state: DataState): Kpis {
  const members = Object.values(state.members)
  const total = members.reduce((s, m) => s + m.pledgePct, 0)
  const used = members.reduce((s, m) => s + Math.min(m.pledgeUsedPct, m.pledgePct), 0)
  const left = members.reduce((s, m) => s + leftPct(m), 0)
  const tasks = Object.values(state.tasks)
  return {
    people: members.length,
    giving: members.filter((m) => m.pledgePct > 0).length,
    pledgeLeftSeatWeeks: left / 100,
    pledgeUsedSeatWeeks: used / 100,
    poolTotalPct: total,
    poolLeftRatio: total > 0 ? left / total : 0,
    tasksInFlight: tasks.filter((t) => t.section === 'doing' || t.section === 'to_review').length,
    leftAtResetPct: state.pulse?.forecastUnusedPct ?? 0,
  }
}

// ---------- Work in progress ----------

const CARD_ORDER: Section[] = ['doing', 'to_review', 'qa_review', 'needs_info', 'done']
export const DONE_VISIBLE_MS = 15 * MIN

export function workCards(state: DataState): Task[] {
  const now = nowOf(state)
  return Object.values(state.tasks)
    .filter((t) => {
      if (t.section === 'done') return now - ms(t.doneAt) <= DONE_VISIBLE_MS
      return CARD_ORDER.includes(t.section)
    })
    .sort(
      (a, b) =>
        CARD_ORDER.indexOf(a.section) - CARD_ORDER.indexOf(b.section) ||
        ms(b.sectionSince) - ms(a.sectionSince),
    )
}

export function overBudget(t: Pick<Task, 'usedPct' | 'budgetPct'>): boolean {
  return t.usedPct > t.budgetPct
}

export function tasksForMember(state: DataState, memberId: string): Set<string> {
  return new Set(
    Object.values(state.tasks)
      .filter(
        (t) => t.ownerId === memberId || t.pickerId === memberId || t.previousPickerId === memberId,
      )
      .map((t) => t.id),
  )
}

// ---------- Flow ----------

export const PIPELINE: Section[] = ['open', 'doing', 'to_review', 'qa_review', 'done']
export const SIDE_LANES: Section[] = ['next', 'needs_info']

export function sectionCounts(state: DataState): Record<Section, number> {
  const counts = {
    open: 0,
    doing: 0,
    to_review: 0,
    qa_review: 0,
    next: 0,
    needs_info: 0,
    done: 0,
  } as Record<Section, number>
  for (const t of Object.values(state.tasks)) counts[t.section] += 1
  return counts
}

/** Average time per finished stay in each section this week, in ms. */
export function avgTimeInSection(state: DataState): Partial<Record<Section, number>> {
  const weekStart = state.week ? ms(state.week.startsAt) : 0
  const sums: Partial<Record<Section, { total: number; n: number }>> = {}
  for (const t of Object.values(state.tasks)) {
    for (const stay of t.sectionLog) {
      if (!stay.leftAt || stay.section === 'done') continue
      if (ms(stay.leftAt) < weekStart) continue
      const s = (sums[stay.section] ??= { total: 0, n: 0 })
      s.total += ms(stay.leftAt) - ms(stay.enteredAt)
      s.n += 1
    }
  }
  const out: Partial<Record<Section, number>> = {}
  for (const [section, v] of Object.entries(sums))
    if (v && v.n > 0) out[section as Section] = v.total / v.n
  return out
}

export function avgOpenToDone(state: DataState): number | undefined {
  const done = Object.values(state.tasks).filter((t) => t.section === 'done' && t.doneAt)
  if (done.length === 0) return undefined
  return done.reduce((s, t) => s + (ms(t.doneAt) - ms(t.createdAt)), 0) / done.length
}

export interface StuckTask {
  task: Task
  /** Time since the last heartbeat (orphaned) or the owner's reminder (stalled). */
  sinceMs: number
}

export function stuckTasks(state: DataState): StuckTask[] {
  const now = nowOf(state)
  return Object.values(state.tasks)
    .filter((t) => t.flag && t.section !== 'done')
    .map((t) => ({
      task: t,
      sinceMs:
        now -
        ms(
          t.flag === 'stalled'
            ? (t.reminderSentAt ?? t.sectionSince)
            : (t.lastHeartbeatAt ?? t.sectionSince),
        ),
    }))
}

/** Needs Info and QA Review are bottlenecks when a task waits there longer than the week's average. */
export function bottlenecks(state: DataState): Set<Section> {
  const avg = avgTimeInSection(state)
  const now = nowOf(state)
  const out = new Set<Section>()
  for (const section of ['needs_info', 'qa_review'] as const) {
    const a = avg[section]
    if (a === undefined) continue
    if (
      Object.values(state.tasks).some((t) => t.section === section && now - ms(t.sectionSince) > a)
    )
      out.add(section)
  }
  return out
}

// ---------- Quality ----------

export interface Quality {
  doneCount: number
  /** 0–1. Approved by the owner without being sent back. */
  firstPassApproval: number
  rejections: number
  failuresByCheck: Record<'compliance' | 'scope' | 'non_destructive' | 'harness', number>
  /** Per size: share of finished tasks that went over budget (0–1). */
  overBudgetBySize: Record<TaskSize, { over: number; total: number }>
  /** Per model: share of finished tasks done on the first pass (no review failure, no rejection). */
  successByModel: { model: string; rate: number; total: number }[]
}

export function quality(state: DataState): Quality {
  const tasks = Object.values(state.tasks)
  const done = tasks.filter((t) => t.section === 'done')
  const failuresByCheck = { compliance: 0, scope: 0, non_destructive: 0, harness: 0 }
  for (const t of tasks) for (const f of t.reviewFailures) failuresByCheck[f.check] += 1
  const overBudgetBySize: Quality['overBudgetBySize'] = {
    S: { over: 0, total: 0 },
    M: { over: 0, total: 0 },
    L: { over: 0, total: 0 },
  }
  for (const t of done) {
    overBudgetBySize[t.size].total += 1
    if (overBudget(t)) overBudgetBySize[t.size].over += 1
  }
  const models = new Map<string, { ok: number; total: number }>()
  for (const t of done) {
    const m = models.get(t.model) ?? { ok: 0, total: 0 }
    m.total += 1
    if (t.reviewFailures.length === 0 && t.rejections === 0) m.ok += 1
    models.set(t.model, m)
  }
  return {
    doneCount: done.length,
    firstPassApproval:
      done.length > 0 ? done.filter((t) => t.rejections === 0).length / done.length : 0,
    rejections: tasks.reduce((s, t) => s + t.rejections, 0),
    failuresByCheck,
    overBudgetBySize,
    successByModel: [...models.entries()]
      .map(([model, v]) => ({ model, rate: v.ok / v.total, total: v.total }))
      .sort((a, b) => b.rate - a.rate),
  }
}

// ---------- Leaderboard ----------

export interface Ranked {
  memberId: string
  value: number
}

const top = (counts: Map<string, number>, n = 5): Ranked[] =>
  [...counts.entries()]
    .filter(([, v]) => v > 0)
    .map(([memberId, value]) => ({ memberId, value }))
    .sort((a, b) => b.value - a.value || a.memberId.localeCompare(b.memberId))
    .slice(0, n)

export function leaderboard(state: DataState): {
  published: Ranked[]
  pickedUp: Ranked[]
  completed: Ranked[]
  pledges: Ranked[]
} {
  const published = new Map<string, number>()
  const pickedUp = new Map<string, number>()
  const completed = new Map<string, number>()
  const inc = (m: Map<string, number>, id?: string) => id && m.set(id, (m.get(id) ?? 0) + 1)
  for (const t of Object.values(state.tasks)) {
    inc(published, t.ownerId)
    if (t.pickerId) inc(pickedUp, t.pickerId)
    if (t.previousPickerId && t.previousPickerId !== t.pickerId) inc(pickedUp, t.previousPickerId)
    if (t.section === 'done') inc(completed, t.pickerId)
  }
  const pledges = new Map(Object.values(state.members).map((m) => [m.id, m.pledgePct]))
  return {
    published: top(published),
    pickedUp: top(pickedUp),
    completed: top(completed),
    pledges: top(pledges),
  }
}

// ---------- Where pledges go ----------

export function usageByProject(state: DataState): { projectId: string; usedPct: number }[] {
  const sums = new Map<string, number>()
  for (const b of Object.values(state.usage))
    sums.set(b.projectId, (sums.get(b.projectId) ?? 0) + b.usedPct)
  return [...sums.entries()]
    .map(([projectId, usedPct]) => ({ projectId, usedPct }))
    .sort((a, b) => b.usedPct - a.usedPct)
}

export function usageByTeam(state: DataState): { team: string; usedPct: number }[] {
  const sums = new Map<string, number>()
  for (const b of Object.values(state.usage)) {
    const team = state.projects[b.projectId]?.team ?? 'Other'
    sums.set(team, (sums.get(team) ?? 0) + b.usedPct)
  }
  return [...sums.entries()]
    .map(([team, usedPct]) => ({ team, usedPct }))
    .sort((a, b) => b.usedPct - a.usedPct)
}

export interface FlowLink {
  pickerId: string
  ownerId: string
  usedPct: number
}

export const OTHERS = 'others'

/** Picker → owner links. Keeps the top `limit` links and groups the rest as "others". */
export function pickerOwnerLinks(state: DataState, limit = 8): FlowLink[] {
  const sums = new Map<string, FlowLink>()
  for (const b of Object.values(state.usage)) {
    const key = `${b.pickerId}>${b.ownerId}`
    const link = sums.get(key) ?? { pickerId: b.pickerId, ownerId: b.ownerId, usedPct: 0 }
    link.usedPct += b.usedPct
    sums.set(key, link)
  }
  const sorted = [...sums.values()].sort((a, b) => b.usedPct - a.usedPct)
  if (sorted.length <= limit) return sorted
  const rest = sorted.slice(limit).reduce((s, l) => s + l.usedPct, 0)
  return [...sorted.slice(0, limit), { pickerId: OTHERS, ownerId: OTHERS, usedPct: rest }]
}

// ---------- Insights ----------

const SEVERITY_RANK: Record<InsightSeverity, number> = { attention: 0, heads_up: 1, info: 2 }
export const RESOLVED_VISIBLE_MS = 24 * HOUR

/** Newest and most severe first; resolved items at the bottom, gone after 24 h. */
export function visibleInsights(state: DataState): Insight[] {
  const now = nowOf(state)
  return Object.values(state.insights)
    .filter((i) => i.state !== 'resolved' || now - ms(i.resolvedAt) <= RESOLVED_VISIBLE_MS)
    .sort((a, b) => {
      const ra = a.state === 'resolved' ? 1 : 0
      const rb = b.state === 'resolved' ? 1 : 0
      if (ra !== rb) return ra - rb
      if (ra === 1) return ms(b.resolvedAt) - ms(a.resolvedAt)
      return (
        SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || ms(b.openedAt) - ms(a.openedAt)
      )
    })
}

// ---------- Core inputs ----------

export interface CoreInputs {
  heartbeatsPerMin: number
  /** 0–1 share of all pledges still free. */
  poolLeft: number
  health: Health
  members: { id: string; ring: 'outer' | 'inner' | 'none'; offline: boolean; faded: boolean }[]
  /** Picker → owner pairs for tasks in Doing (particles). */
  flows: { taskId: string; from: string; to: string }[]
  wobble: boolean
}

export function coreInputs(state: DataState): CoreInputs {
  const tasks = Object.values(state.tasks)
  const ownersInProgress = new Set(
    tasks
      .filter((t) => ['doing', 'to_review', 'qa_review'].includes(t.section))
      .map((t) => t.ownerId),
  )
  const orphanedPickers = new Set(tasks.filter((t) => t.flag === 'orphaned').map((t) => t.pickerId))
  const k = kpis(state)
  return {
    heartbeatsPerMin: state.pulse?.heartbeatsPerMin ?? 0,
    poolLeft: k.poolLeftRatio,
    health: state.pulse?.health ?? 'calm',
    members: Object.values(state.members).map((m) => ({
      id: m.id,
      ring: ownersInProgress.has(m.id) ? 'inner' : leftPct(m) > 0 ? 'outer' : 'none',
      offline: m.status === 'offline',
      faded: orphanedPickers.has(m.id),
    })),
    flows: tasks
      .filter((t) => t.section === 'doing' && t.pickerId)
      .map((t) => ({ taskId: t.id, from: t.pickerId as string, to: t.ownerId })),
    wobble: Object.values(state.insights).some(
      (i) => i.severity === 'attention' && i.state !== 'resolved',
    ),
  }
}
