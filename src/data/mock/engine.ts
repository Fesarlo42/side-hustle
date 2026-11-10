/**
 * Seeded mock engine: the cast, a believable week, and the scripted demo.
 *
 * Time model
 * - "Demo seconds" follow the spec's timeline at 10× (the 3-minute demo).
 * - One demo second = SIM_PER_DEMO_S simulated seconds (20), so the demo spans
 *   about an hour of simulated time: Sun 15 Nov 17:00 → 18:00 UTC, 6 h before reset.
 * - Speed 10 plays one demo second per wall second. 1× is ten times slower, 60× six times faster.
 *
 * The engine is pure and deterministic: `advance(demoSeconds)` steps in fixed
 * increments, so the same seed always produces the same events. Timers live in
 * src/server/hub.ts, not here.
 */
import { computeHealth } from '@/config/health'
import type {
  Agent,
  Changes,
  DashEvent,
  DemoState,
  EventData,
  EventType,
  Insight,
  InsightKind,
  InsightSeverity,
  Member,
  Project,
  Pulse,
  Ref,
  ReviewCheck,
  Section,
  Snapshot,
  StreamMessage,
  Task,
  TaskSize,
  UsageBucket,
  Week,
  WorkflowConfig,
} from '@/types'
import {
  ASANA_PROJECT_URL,
  BUDGET_BY_SIZE,
  CAST,
  type CastMember,
  MODELS,
  PROJECTS,
  firstName,
} from './cast'
import { createRng, type Rng } from './rng'
import { joinNames, partOfDay, plural, say, weekday } from './text'

// ---------- Constants ----------

export const SIM_PER_DEMO_S = 20
export const DEMO_STEP_S = 0.25
export const DEMO_LENGTH_S = 180
export const DEFAULT_SEED = 46
export const START_AT = Date.parse('2026-11-15T17:00:00Z')
const WEEK_START = Date.parse('2026-11-09T00:00:00Z')
const RESET_AT = Date.parse('2026-11-16T00:00:00Z')
const PLEDGE_DEADLINE = Date.parse('2026-11-09T17:00:00Z')

const MIN = 60_000
const HOUR = 60 * MIN
const HEARTBEAT_EVERY_MS = 20_000
const EVENTS_KEPT = 300
const SNAPSHOT_EVENTS = 100

export const CONFIG: WorkflowConfig = {
  maxReviewAttempts: 3,
  heartbeatTimeoutMin: 3,
  needsInfoTimeoutH: 24,
  budgetBySize: BUDGET_BY_SIZE,
}

const iso = (ms: number) => new Date(ms).toISOString()
const demoToMs = (demoS: number) => demoS * SIM_PER_DEMO_S * 1000
const round2 = (n: number) => Math.round(n * 100) / 100
const IN_FLIGHT: ReadonlySet<Section> = new Set(['doing', 'to_review'])
const HOLDING: ReadonlySet<Section> = new Set(['doing', 'to_review'])

// ---------- Internal simulation state per task ----------

interface TaskSim {
  /** Usage at which the picker's agent hands the task to review. */
  target: number
  /** % per simulated second while in Doing. */
  rate: number
  /** Sim ms when the next automatic step happens (claim, review, approval). */
  nextAt?: number
  /** Only this picker may claim it (scripted moments). Bypasses concurrency. */
  reservedFor?: string
  /** Scripted: the task stays where it is until a script moves it. */
  pinned?: boolean
  /** Scripted review outcome for the next review. */
  forceReview?: { pass: true } | { pass: false; check: ReviewCheck }
  nextHeartbeatAt: number
  /** Usage accrued since the last heartbeat (sent with it). */
  pendingUsage: number
  orphanFlaggedAt?: number
  /** Sim ms: catch-up after an outage is staggered so the log stays readable. */
  holdUntil?: number
}

interface StatusOverride {
  text: string
  ref?: Ref
  /** Sim ms; undefined = until replaced. */
  until?: number
}

type Listener = (msg: StreamMessage) => void

interface Moment {
  at: number
  name: string
  run: (e: MockEngine) => void
}

// ---------- Engine ----------

export class MockEngine {
  readonly seed: number
  private rng: Rng
  private now = START_AT
  private demoSeconds = 0
  private carry = 0
  speed = 10
  running = true

  private members = new Map<string, Member>()
  private cast = new Map<string, CastMember>()
  private projects = new Map<string, Project>()
  private agents = new Map<string, Agent>()
  private tasks = new Map<string, Task>()
  private sims = new Map<string, TaskSim>()
  private insights = new Map<string, Insight>()
  private usage = new Map<string, UsageBucket>()
  private events: DashEvent[] = []
  private week: Week
  private heartbeats: number[] = []
  private listeners = new Set<Listener>()
  private eventSeq = 9000
  private taskSeq = 1041
  private insightSeq = 70
  private reviewerTurn = 0
  private titleCursor = new Map<string, number>()
  private nextAmbientPublishAt: number
  private asanaDown = false
  private pausedTasks = new Set<string>()
  private asanaInsightId?: string
  private override?: StatusOverride
  private momentsFired = new Set<string>()
  private moments: Moment[]
  private queue: { at: number; fn: () => void }[] = []
  private reserveOnNext = new Map<string, string>()
  private scopeTaskId?: string
  private qaTaskId?: string

  constructor(opts: { seed?: number } = {}) {
    this.seed = opts.seed ?? DEFAULT_SEED
    this.rng = createRng(this.seed)
    this.week = {
      number: 46,
      startsAt: iso(WEEK_START),
      resetAt: iso(RESET_AT),
      pledgeDeadline: iso(PLEDGE_DEADLINE),
      answeredCount: CAST.filter((c) => c.pledgeSource === 'answered').length,
      memberCount: CAST.length,
    }
    this.nextAmbientPublishAt = START_AT + demoToMs(70)
    this.seedCast()
    this.seedHistory()
    this.seedLive()
    this.seedInsights()
    this.seedLog()
    this.refreshStatuses()
    this.moments = buildTimeline()
  }

  // ---------- Public API ----------

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  get simNow(): number {
    return this.now
  }

  get demoTime(): number {
    return this.demoSeconds
  }

  demoState(): DemoState {
    return {
      speed: this.speed,
      seed: this.seed,
      demoSeconds: round2(this.demoSeconds),
      running: this.running,
    }
  }

  /** Advance by demo seconds (10× timeline), in fixed steps. */
  advance(demoS: number): void {
    if (!this.running) return
    this.carry += demoS
    while (this.carry >= DEMO_STEP_S - 1e-9) {
      this.carry -= DEMO_STEP_S
      this.step()
    }
  }

  /** Advance by wall-clock milliseconds at the current speed. */
  advanceWall(ms: number): void {
    this.advance((ms / 1000) * (this.speed / 10))
  }

  snapshot(): Snapshot {
    return {
      members: [...this.members.values()],
      projects: [...this.projects.values()],
      agents: [...this.agents.values()],
      tasks: [...this.tasks.values()],
      insights: [...this.insights.values()],
      events: this.events.slice(-SNAPSHOT_EVENTS),
      pulse: this.pulse(),
      usage: [...this.usage.values()],
      week: { ...this.week },
      config: CONFIG,
      demo: this.demoState(),
    }
  }

  pulseMessage(): StreamMessage {
    return { kind: 'pulse', pulse: this.pulse(), demo: this.demoState() }
  }

  // ---------- Step ----------

  private step(): void {
    const dtMs = DEMO_STEP_S * SIM_PER_DEMO_S * 1000
    this.now += dtMs
    this.demoSeconds = round2(this.demoSeconds + DEMO_STEP_S)

    for (const m of this.moments) {
      if (m.at <= this.demoSeconds && !this.momentsFired.has(m.name)) {
        this.momentsFired.add(m.name)
        m.run(this)
      }
    }

    const due = this.queue.filter((q) => q.at <= this.demoSeconds)
    if (due.length > 0) {
      this.queue = this.queue.filter((q) => q.at > this.demoSeconds)
      for (const q of due) q.fn()
    }

    if (this.override?.until !== undefined && this.override.until <= this.now)
      this.override = undefined

    for (const task of [...this.tasks.values()]) this.stepTask(task, dtMs / 1000)

    if (this.now >= this.nextAmbientPublishAt) {
      this.ambientPublish()
      this.nextAmbientPublishAt = this.now + demoToMs(this.rng.range(30, 45))
    }

    const cutoff = this.now - MIN
    while (this.heartbeats.length > 0 && (this.heartbeats[0] ?? 0) < cutoff) this.heartbeats.shift()
  }

  private stepTask(task: Task, dtS: number): void {
    const sim = this.sims.get(task.id)
    if (!sim) return
    switch (task.section) {
      case 'doing':
        return this.stepDoing(task, sim, dtS)
      case 'to_review':
        return this.stepToReview(task, sim)
      case 'qa_review':
        return this.stepQa(task, sim)
      case 'open':
      case 'next':
        return this.stepClaim(task, sim)
      case 'needs_info':
        return this.stepNeedsInfo(task, sim)
      default:
        return
    }
  }

  private stepDoing(task: Task, sim: TaskSim, dtS: number): void {
    const agent = task.pickerAgentId ? this.agents.get(task.pickerAgentId) : undefined
    const picker = task.pickerId ? this.members.get(task.pickerId) : undefined
    if (!agent || !picker) return

    if (agent.status === 'offline') {
      const silentMs = this.now - Date.parse(task.lastHeartbeatAt ?? task.sectionSince)
      const timeoutMs = CONFIG.heartbeatTimeoutMin * MIN
      if (silentMs >= timeoutMs && !task.flag) {
        task.flag = 'orphaned'
        sim.orphanFlaggedAt = this.now
        sim.pinned = false
        this.emit(
          'task.flagged',
          this.agentRef(agent),
          say.flaggedOrphaned(firstName(picker.name), task.title, CONFIG.heartbeatTimeoutMin),
          [this.taskRef(task), this.memberRef(picker)],
          { reason: 'orphaned' },
          { tasks: [task] },
        )
        this.openInsight(
          'device',
          'heads_up',
          `${firstName(picker.name)}’s agent went quiet`,
          `No heartbeat from ${firstName(picker.name)}’s laptop for ${CONFIG.heartbeatTimeoutMin} min while working on “${task.title}”.`,
          'Releasing it to Next after the heartbeat timeout, so another agent can pick it up',
          [this.taskRef(task), this.memberRef(picker)],
        )
        this.setOverride(
          `${firstName(picker.name)}’s laptop went quiet. The agents are moving the task to Next.`,
          this.taskRef(task),
        )
      }
      if (
        task.flag === 'orphaned' &&
        sim.orphanFlaggedAt !== undefined &&
        this.now - sim.orphanFlaggedAt >= demoToMs(3)
      ) {
        if (this.blockedByAsana(task)) return
        this.release(task, 'orphaned')
      }
      return
    }

    // Accrue usage while working.
    const left = Math.max(0, picker.pledgePct - picker.pledgeUsedPct)
    const want = Math.min(sim.rate * dtS, Math.max(0, sim.target - task.usedPct))
    const used = Math.min(want, left)
    if (used > 0) {
      task.usedPct += used
      picker.pledgeUsedPct += used
      sim.pendingUsage += used
      this.addUsage(task, used)
    }

    if (this.now >= sim.nextHeartbeatAt) {
      sim.nextHeartbeatAt = this.now + HEARTBEAT_EVERY_MS
      this.heartbeat(task, agent, picker, sim)
    }

    if (picker.pledgeUsedPct >= picker.pledgePct - 1e-6 && task.usedPct < sim.target) {
      if (this.blockedByAsana(task)) return
      this.release(task, 'pledge_exhausted')
      return
    }

    if (!sim.pinned && task.usedPct >= sim.target - 1e-6) {
      if (this.blockedByAsana(task)) return
      this.moveToReview(task, sim)
    }
  }

  private stepToReview(task: Task, sim: TaskSim): void {
    if (sim.pinned || sim.nextAt === undefined || this.now < sim.nextAt) return
    if (this.blockedByAsana(task)) return
    const forced = sim.forceReview
    sim.forceReview = undefined
    const pass = forced ? forced.pass : this.rng.chance(0.86)
    const reviewer = task.reviewerAgentId ? this.agents.get(task.reviewerAgentId) : undefined
    const actor: Ref = reviewer ? this.agentRef(reviewer) : { type: 'system', id: 'reviewer' }
    if (reviewer) {
      reviewer.status = 'idle'
      reviewer.currentTaskId = undefined
    }
    const owner = this.mustMember(task.ownerId)

    if (pass) {
      this.moveSection(task, 'qa_review')
      sim.nextAt = this.now + demoToMs(this.rng.range(14, 28))
      this.emit(
        'review.passed',
        actor,
        say.reviewPassed(task.title, firstName(owner.name)),
        [this.taskRef(task), this.memberRef(owner)],
        { from: 'to_review', to: 'qa_review', reason: 'review_passed' },
        { tasks: [task], agents: reviewer ? [reviewer] : [] },
      )
      return
    }

    const check: ReviewCheck =
      forced && !forced.pass
        ? forced.check
        : this.rng.pick(['compliance', 'scope', 'harness', 'compliance', 'scope'] as const)
    task.reviewFailures.push({ check, at: iso(this.now), destructive: check === 'non_destructive' })
    if (check === 'non_destructive' || task.reviewAttempts >= task.maxReviewAttempts) {
      this.moveSection(task, 'needs_info')
      this.unassign(task)
      sim.nextAt = this.now + demoToMs(this.rng.range(25, 40))
      this.emit(
        'review.failed',
        actor,
        say.attemptsExhausted(task.title),
        [this.taskRef(task)],
        {
          from: 'to_review',
          to: 'needs_info',
          reason: check === 'non_destructive' ? 'review_destructive' : 'attempts_exhausted',
          check,
        },
        { tasks: [task], agents: reviewer ? [reviewer] : [] },
      )
      this.refreshStatuses()
      return
    }
    task.reviewAttempts += 1
    this.moveSection(task, 'doing')
    sim.target = task.usedPct + task.budgetPct * this.rng.range(0.15, 0.3)
    sim.rate = task.budgetPct / (this.rng.range(25, 40) * SIM_PER_DEMO_S)
    const picker = task.pickerId ? this.members.get(task.pickerId) : undefined
    const agent = task.pickerAgentId ? this.agents.get(task.pickerAgentId) : undefined
    if (agent) {
      agent.status = 'working'
      agent.currentTaskId = task.id
    }
    this.emit(
      'review.failed',
      actor,
      say.reviewFailed(task.title, check, task.reviewAttempts, task.maxReviewAttempts),
      [this.taskRef(task), ...(picker ? [this.memberRef(picker)] : [])],
      {
        from: 'to_review',
        to: 'doing',
        reason: 'review_failed',
        check,
        attempt: task.reviewAttempts,
      },
      { tasks: [task], agents: [reviewer, agent].filter((a): a is Agent => !!a) },
    )
    this.refreshStatuses()
  }

  private stepQa(task: Task, sim: TaskSim): void {
    if (sim.pinned || sim.nextAt === undefined || this.now < sim.nextAt) return
    if (this.blockedByAsana(task)) return
    const owner = this.mustMember(task.ownerId)
    if (this.rng.chance(0.1) && task.rejections === 0) {
      task.rejections += 1
      this.moveSection(task, 'next')
      this.unassign(task)
      sim.nextAt = this.now + demoToMs(this.rng.range(3, 6))
      this.emit(
        'task.rejected',
        this.memberRef(owner),
        say.rejected(firstName(owner.name), task.title),
        [this.taskRef(task)],
        { from: 'qa_review', to: 'next', reason: 'rejected' },
        { tasks: [task] },
      )
      return
    }
    this.approve(task)
  }

  private stepClaim(task: Task, sim: TaskSim): void {
    if (sim.nextAt === undefined || this.now < sim.nextAt) return
    if (this.blockedByAsana(task)) return
    const picker = this.findPicker(task, sim)
    if (!picker) {
      sim.nextAt = this.now + demoToMs(4)
      return
    }
    this.claim(task, sim, picker)
  }

  private stepNeedsInfo(task: Task, sim: TaskSim): void {
    if (sim.pinned || sim.nextAt === undefined || this.now < sim.nextAt) return
    if (this.blockedByAsana(task)) return
    const owner = this.mustMember(task.ownerId)
    task.flag = undefined
    this.moveSection(task, 'open')
    sim.nextAt = this.now + demoToMs(this.rng.range(3, 6))
    this.emit(
      'task.section_changed',
      this.agentRef(this.pickerAgent(owner.id)),
      say.infoCompleted(firstName(owner.name), task.title),
      [this.taskRef(task), this.memberRef(owner)],
      { from: 'needs_info', to: 'open', reason: 'info_completed' },
      { tasks: [task] },
    )
  }

  // ---------- Transitions ----------

  private claim(task: Task, sim: TaskSim, picker: Member): void {
    const from = task.section
    const prev = task.previousPickerId ? this.members.get(task.previousPickerId) : undefined
    const agent = this.pickerAgent(picker.id)
    task.pickerId = picker.id
    task.pickerAgentId = agent.id
    task.flag = undefined
    task.lastHeartbeatAt = iso(this.now)
    if (task.reviewAttempts === 0) task.reviewAttempts = 1
    this.moveSection(task, 'doing')
    sim.reservedFor = undefined
    sim.nextAt = undefined
    sim.nextHeartbeatAt = this.now + HEARTBEAT_EVERY_MS
    if (task.id === this.scopeTaskId && !this.momentsFired.has('scope_fail')) {
      // Scripted: reaches To Review around 1:35 and fails the scope check at 1:50.
      sim.target = task.usedPct + task.budgetPct * 0.7
      sim.rate = (task.budgetPct * 0.7) / (Math.max(10, 95 - this.demoSeconds) * SIM_PER_DEMO_S)
    } else if (sim.target <= task.usedPct || prev) {
      sim.target = Math.max(sim.target, task.usedPct + task.budgetPct * this.rng.range(0.35, 0.7))
      sim.rate = task.budgetPct / (this.rng.range(25, 40) * SIM_PER_DEMO_S)
    }
    agent.status = 'working'
    agent.currentTaskId = task.id
    agent.lastHeartbeatAt = iso(this.now)
    this.refreshStatuses()
    const text = prev
      ? say.claimedHandover(firstName(picker.name), task.title, firstName(prev.name))
      : say.claimed(firstName(picker.name), task.title)
    this.emit(
      'task.claimed',
      this.agentRef(agent),
      text,
      [this.taskRef(task), this.memberRef(picker), ...(prev ? [this.memberRef(prev)] : [])],
      { from, to: 'doing', reason: 'claimed' },
      { tasks: [task], agents: [agent], members: [picker] },
    )
    this.resolveInsightsAbout(task.id)
  }

  private moveToReview(task: Task, sim: TaskSim): void {
    const picker = this.mustMember(task.pickerId)
    const agent = this.pickerAgent(picker.id)
    const reviewer = this.nextReviewer()
    task.reviewerAgentId = reviewer.id
    reviewer.status = 'working'
    reviewer.currentTaskId = task.id
    reviewer.lastHeartbeatAt = iso(this.now)
    agent.status = 'idle'
    agent.currentTaskId = undefined
    this.moveSection(task, 'to_review')
    sim.nextAt = this.now + demoToMs(this.rng.range(6, 12))
    if (task.id === this.scopeTaskId && !this.momentsFired.has('scope_fail')) sim.pinned = true
    this.refreshStatuses()
    this.emit(
      'task.section_changed',
      this.agentRef(agent),
      say.toReview(firstName(picker.name), task.title),
      [this.taskRef(task), this.memberRef(picker)],
      { from: 'doing', to: 'to_review', reason: 'implemented' },
      { tasks: [task], agents: [agent, reviewer], members: [picker] },
    )
  }

  private release(task: Task, reason: 'orphaned' | 'pledge_exhausted'): void {
    const picker = this.mustMember(task.pickerId)
    const agent = this.pickerAgent(picker.id)
    const from = task.section
    task.previousPickerId = picker.id
    this.moveSection(task, 'next')
    this.unassign(task)
    task.flag = undefined
    const sim = this.sims.get(task.id)
    if (sim) {
      sim.nextAt = this.now + demoToMs(3)
      sim.orphanFlaggedAt = undefined
      const who = this.reserveOnNext.get(task.id)
      if (who) {
        sim.reservedFor = who
        this.reserveOnNext.delete(task.id)
      }
    }
    if (agent.status !== 'offline') {
      agent.status = 'idle'
      agent.currentTaskId = undefined
    }
    this.refreshStatuses()
    const text =
      reason === 'orphaned'
        ? say.releasedOrphaned(task.title, firstName(picker.name))
        : say.releasedPledge(firstName(picker.name), task.title)
    const actor: Ref =
      reason === 'orphaned' ? { type: 'system', id: 'workflow' } : this.agentRef(agent)
    this.emit(
      'task.released',
      actor,
      text,
      [this.taskRef(task), this.memberRef(picker)],
      { from, to: 'next', reason },
      { tasks: [task], agents: [agent], members: [picker] },
    )

    if (reason === 'pledge_exhausted') {
      this.openInsight(
        'pledge',
        'heads_up',
        `${firstName(picker.name)}’s pledge is used up`,
        `${firstName(picker.name)}’s agent stopped mid-task on “${task.title}” when the ${picker.pledgePct}% pledge ran out.`,
        'Documented the state in Asana and released it to Next, so another agent can finish it',
        [this.taskRef(task), this.memberRef(picker)],
      )
      this.setOverride(
        `${firstName(picker.name)}’s pledge is used up. The task went to Next for another agent to finish.`,
        this.taskRef(task),
      )
    }
  }

  private approve(task: Task): void {
    const owner = this.mustMember(task.ownerId)
    this.moveSection(task, 'done')
    task.doneAt = iso(this.now)
    const sim = this.sims.get(task.id)
    if (sim) {
      sim.nextAt = undefined
      sim.pinned = false
    }
    this.emit(
      'task.approved',
      this.memberRef(owner),
      say.approved(firstName(owner.name), task.title),
      [
        this.taskRef(task),
        this.memberRef(owner),
        ...(task.pickerId ? [{ type: 'member' as const, id: task.pickerId }] : []),
      ],
      { from: 'qa_review', to: 'done', reason: 'approved' },
      { tasks: [task] },
    )
  }

  private publish(
    ownerId: string,
    projectId: string,
    size: TaskSize,
    opts: { title?: string; reservedFor?: string; claimInDemoS?: number; pinned?: boolean } = {},
  ): Task {
    const owner = this.mustMember(ownerId)
    const project = this.projects.get(projectId)
    if (!project) throw new Error(`unknown project ${projectId}`)
    const task = this.newTask({
      ownerId,
      projectId,
      size,
      section: 'open',
      since: this.now,
      title: opts.title,
    })
    this.sims.set(task.id, {
      target: 0,
      rate: 0,
      nextAt: this.now + demoToMs(opts.claimInDemoS ?? this.rng.range(3, 7)),
      reservedFor: opts.reservedFor,
      pinned: opts.pinned,
      nextHeartbeatAt: this.now,
      pendingUsage: 0,
    })
    this.emit(
      'task.published',
      this.memberRef(owner),
      say.published(firstName(owner.name), task.title, project.name),
      [this.taskRef(task), this.memberRef(owner), { type: 'project', id: projectId }],
      { to: 'open', reason: 'published' },
      { tasks: [task] },
    )
    return task
  }

  private ambientPublish(): void {
    const owners = CAST.filter(
      (c) => c.persona === 'busy_owner' || (c.persona === 'balanced' && this.rng.chance(0.3)),
    )
    const owner = this.rng.pick(owners)
    const teamProjects = PROJECTS.filter((p) => p.team === owner.team)
    const project = this.rng.pick(teamProjects.length > 0 ? teamProjects : PROJECTS)
    const size = this.rng.pick(['S', 'S', 'M', 'M', 'L'] as const)
    this.publish(owner.id, project.id, size)
  }

  // ---------- Helpers: tasks ----------

  private newTask(p: {
    ownerId: string
    projectId: string
    size: TaskSize
    section: Section
    since: number
    title?: string
    createdAt?: number
  }): Task {
    const id = `t_${++this.taskSeq}`
    const task: Task = {
      id,
      asanaUrl: `${ASANA_PROJECT_URL}?mock=${id}`,
      title: p.title ?? this.nextTitle(p.projectId),
      projectId: p.projectId,
      ownerId: p.ownerId,
      section: p.section,
      sectionSince: iso(p.since),
      sectionLog: [{ section: p.section, enteredAt: iso(p.createdAt ?? p.since) }],
      size: p.size,
      budgetPct: BUDGET_BY_SIZE[p.size],
      usedPct: 0,
      reviewAttempts: 0,
      maxReviewAttempts: CONFIG.maxReviewAttempts,
      reviewFailures: [],
      rejections: 0,
      model: this.pickModel(),
      createdAt: iso(p.createdAt ?? p.since),
    }
    this.tasks.set(id, task)
    return task
  }

  private nextTitle(projectId: string): string {
    const project = PROJECTS.find((p) => p.id === projectId)
    if (!project) return 'Untitled task'
    const used = new Set(
      [...this.tasks.values()]
        .filter((t) => t.projectId === projectId && t.section !== 'done')
        .map((t) => t.title),
    )
    const start = this.titleCursor.get(projectId) ?? 0
    for (let i = 0; i < project.titles.length; i++) {
      const title = project.titles[(start + i) % project.titles.length] as string
      if (!used.has(title)) {
        this.titleCursor.set(projectId, start + i + 1)
        return title
      }
    }
    this.titleCursor.set(projectId, start + 1)
    return `${project.titles[start % project.titles.length]} (follow-up)`
  }

  private pickModel(): string {
    const r = this.rng.next()
    return r < 0.6 ? MODELS[0] : r < 0.85 ? MODELS[1] : MODELS[2]
  }

  private moveSection(task: Task, to: Section, at = this.now): void {
    const last = task.sectionLog[task.sectionLog.length - 1]
    if (last && !last.leftAt) last.leftAt = iso(at)
    task.section = to
    task.sectionSince = iso(at)
    task.sectionLog.push({ section: to, enteredAt: iso(at) })
  }

  private unassign(task: Task): void {
    task.pickerId = undefined
    task.pickerAgentId = undefined
    task.reviewerAgentId = undefined
  }

  private findPicker(task: Task, sim: TaskSim): Member | undefined {
    if (sim.reservedFor) {
      const m = this.members.get(sim.reservedFor)
      if (m && this.canClaim(m, task, true)) return m
      return undefined
    }
    const candidates = [...this.members.values()].filter(
      (m) =>
        m.id !== task.ownerId && m.id !== task.previousPickerId && this.canClaim(m, task, false),
    )
    if (candidates.length === 0) return undefined
    // Agents with the most pledge left tend to get there first.
    const weights = candidates.map((m) => Math.max(0.5, m.pledgePct - m.pledgeUsedPct))
    const total = weights.reduce((a, b) => a + b, 0)
    let r = this.rng.next() * total
    for (let i = 0; i < candidates.length; i++) {
      r -= weights[i] ?? 0
      if (r <= 0) return candidates[i]
    }
    return candidates[candidates.length - 1]
  }

  private canClaim(m: Member, task: Task, reserved: boolean): boolean {
    const agent = this.pickerAgent(m.id)
    if (agent.status === 'offline') return false
    // The budget still to spend must fit the pledge left (a released task already spent part of it).
    const need = Math.max(0.5, task.budgetPct - task.usedPct)
    if (m.pledgePct - m.pledgeUsedPct < need) return false
    if (reserved) return true
    const holding = [...this.tasks.values()].filter(
      (t) => t.pickerId === m.id && HOLDING.has(t.section),
    ).length
    return holding < (this.cast.get(m.id)?.maxConcurrency ?? 1)
  }

  private blockedByAsana(task: Task): boolean {
    const hold = this.sims.get(task.id)?.holdUntil
    if (hold !== undefined && this.now < hold) return true
    if (!this.asanaDown) return false
    if (!this.pausedTasks.has(task.id)) {
      this.pausedTasks.add(task.id)
      const insight = this.asanaInsightId ? this.insights.get(this.asanaInsightId) : undefined
      if (insight) {
        insight.detail = `${plural(this.pausedTasks.size, 'task')} can’t update ${this.pausedTasks.size === 1 ? 'its' : 'their'} Asana ticket yet.`
        insight.related = [...this.pausedTasks].map((id) => ({ type: 'task' as const, id }))
        this.emit(
          'insight.updated',
          { type: 'system', id: 'workflow' },
          `The agents paused ${plural(this.pausedTasks.size, 'task')} while Asana is away`,
          insight.related,
          undefined,
          { insights: [insight] },
        )
        this.setOverride(
          `Asana isn’t answering. The agents paused ${plural(this.pausedTasks.size, 'task')} and will retry in 5 min.`,
          { type: 'insight', id: insight.id },
        )
      }
    }
    return true
  }

  private heartbeat(task: Task, agent: Agent, picker: Member, sim: TaskSim): void {
    task.lastHeartbeatAt = iso(this.now)
    agent.lastHeartbeatAt = iso(this.now)
    picker.lastSeenAt = iso(this.now)
    this.heartbeats.push(this.now)
    const bucket = this.usage.get(this.usageKey(task, this.now))
    sim.pendingUsage = 0
    this.emit(
      'task.heartbeat',
      this.agentRef(agent),
      '',
      [this.taskRef(task)],
      undefined,
      { tasks: [task], agents: [agent], members: [picker], usage: bucket ? [bucket] : [] },
      false,
    )
  }

  private usageKey(task: Task, at: number): string {
    const hour = Math.floor(at / HOUR) * HOUR
    return `${iso(hour)}|${task.id}|${task.pickerId}`
  }

  private addUsage(task: Task, used: number, at = this.now): void {
    if (!task.pickerId) return
    const key = this.usageKey(task, at)
    const existing = this.usage.get(key)
    if (existing) {
      existing.usedPct += used
      return
    }
    this.usage.set(key, {
      hour: iso(Math.floor(at / HOUR) * HOUR),
      pickerId: task.pickerId,
      ownerId: task.ownerId,
      projectId: task.projectId,
      taskId: task.id,
      usedPct: used,
    })
  }

  private nextReviewer(): Agent {
    const id = this.reviewerTurn++ % 2 === 0 ? 'a_reviewer_1' : 'a_reviewer_2'
    return this.agents.get(id) as Agent
  }

  private pickerAgent(memberId: string): Agent {
    const agent = this.agents.get(`a_${memberId.slice(2)}_picker`)
    if (!agent) throw new Error(`no agent for ${memberId}`)
    return agent
  }

  private mustMember(id: string | undefined): Member {
    const m = id ? this.members.get(id) : undefined
    if (!m) throw new Error(`unknown member ${id}`)
    return m
  }

  private refreshStatuses(): void {
    for (const m of this.members.values()) {
      const agent = this.pickerAgent(m.id)
      if (agent.status === 'offline') {
        m.status = 'offline'
        continue
      }
      const working = [...this.tasks.values()].some(
        (t) => t.pickerId === m.id && t.section === 'doing',
      )
      m.status = working ? 'working' : 'idle'
      agent.status = working ? 'working' : 'idle'
      if (!working) agent.currentTaskId = undefined
    }
  }

  // ---------- Helpers: insights, events, status ----------

  private openInsight(
    kind: InsightKind,
    severity: InsightSeverity,
    title: string,
    detail: string,
    agentAction: string,
    related: Ref[],
    state: 'open' | 'handling' = 'handling',
  ): Insight {
    const insight: Insight = {
      id: `i_${++this.insightSeq}`,
      kind,
      severity,
      title,
      detail,
      agentAction,
      state,
      openedAt: iso(this.now),
      related,
    }
    this.insights.set(insight.id, insight)
    this.emit(
      'insight.opened',
      { type: 'system', id: 'insights' },
      say.insightOpened(title),
      [{ type: 'insight', id: insight.id }, ...related],
      undefined,
      { insights: [insight] },
    )
    return insight
  }

  private resolveInsight(insight: Insight, agentAction?: string): void {
    if (insight.state === 'resolved') return
    insight.state = 'resolved'
    insight.resolvedAt = iso(this.now)
    if (agentAction) insight.agentAction = agentAction
    this.emit(
      'insight.resolved',
      { type: 'system', id: 'insights' },
      say.insightResolved(insight.title),
      [{ type: 'insight', id: insight.id }, ...insight.related],
      undefined,
      { insights: [insight] },
    )
  }

  private resolveInsightsAbout(taskId: string): void {
    const task = this.tasks.get(taskId)
    for (const insight of this.insights.values()) {
      if (insight.state === 'resolved' || (insight.kind !== 'device' && insight.kind !== 'pledge'))
        continue
      if (!insight.related.some((r) => r.type === 'task' && r.id === taskId)) continue
      const picker = task?.pickerId ? this.members.get(task.pickerId) : undefined
      this.resolveInsight(
        insight,
        picker ? `Released to Next; ${firstName(picker.name)}’s agent picked it up` : undefined,
      )
      if (picker && task) {
        const prev = task.previousPickerId ? this.members.get(task.previousPickerId) : undefined
        if (insight.kind === 'device' && prev)
          this.setOverride(
            `${firstName(prev.name)}’s laptop went quiet. ${firstName(prev.name)}’s task moved to ${firstName(picker.name)}.`,
            this.taskRef(task),
            10,
          )
        if (insight.kind === 'pledge' && prev)
          this.setOverride(
            `${firstName(prev.name)}’s pledge ran out mid-task. ${firstName(picker.name)}’s agent took over “${task.title}”.`,
            this.taskRef(task),
            10,
          )
      }
    }
  }

  private later(demoS: number, fn: () => void): void {
    this.queue.push({ at: this.demoSeconds + demoS, fn })
  }

  private setOverride(text: string, ref?: Ref, forDemoS?: number): void {
    this.override = {
      text,
      ref,
      until: forDemoS === undefined ? undefined : this.now + demoToMs(forDemoS),
    }
  }

  private emit(
    type: EventType,
    actor: Ref,
    text: string,
    related: Ref[],
    data?: EventData,
    changes?: Changes,
    log = true,
  ): void {
    const event: DashEvent = {
      id: `e_${++this.eventSeq}`,
      at: iso(this.now),
      type,
      actor,
      text,
      related,
      ...(data ? { data } : {}),
    }
    if (log) {
      this.events.push(event)
      if (this.events.length > EVENTS_KEPT) this.events.splice(0, this.events.length - EVENTS_KEPT)
    }
    const msg: StreamMessage = {
      kind: 'event',
      event,
      ...(changes ? { changes: clone(changes) } : {}),
    }
    for (const fn of this.listeners) fn(msg)
  }

  private memberRef(m: Member): Ref {
    return { type: 'member', id: m.id }
  }
  private agentRef(a: Agent): Ref {
    return { type: 'agent', id: a.id }
  }
  private taskRef(t: Task): Ref {
    return { type: 'task', id: t.id }
  }

  // ---------- Pulse ----------

  pulse(): Pulse {
    const members = [...this.members.values()]
    const tasks = [...this.tasks.values()]
    const poolTotalPct = members.reduce((s, m) => s + m.pledgePct, 0)
    const poolUsedPct = members.reduce((s, m) => s + Math.min(m.pledgeUsedPct, m.pledgePct), 0)
    const tasksInFlight = tasks.filter((t) => IN_FLIGHT.has(t.section)).length
    const health = computeHealth({
      poolTotalPct,
      poolUsedPct,
      tasks,
      insights: [...this.insights.values()],
      now: this.now,
    })
    const forecast = this.forecast(poolTotalPct, poolUsedPct)
    const status = this.statusLine(tasks, poolTotalPct, poolUsedPct, forecast)
    return {
      at: iso(this.now),
      heartbeatsPerMin: this.heartbeats.length,
      poolTotalPct: round2(poolTotalPct),
      poolUsedPct: round2(poolUsedPct),
      tasksInFlight,
      health,
      statusLine: status.text,
      ...(status.ref ? { statusRef: status.ref } : {}),
      forecastUnusedPct: forecast.unusedPct,
      ...(forecast.emptyAt ? { forecastEmptyAt: iso(forecast.emptyAt) } : {}),
    }
  }

  /** Pace = pledge used so far this week, per hour. "At this week's pace…" */
  private forecast(total: number, used: number): { unusedPct: number; emptyAt?: number } {
    const elapsedH = Math.max(1, (this.now - WEEK_START) / HOUR)
    const perHour = used / elapsedH
    const left = Math.max(0, total - used)
    const hoursToReset = Math.max(0, (RESET_AT - this.now) / HOUR)
    const unused = Math.max(0, left - perHour * hoursToReset)
    const emptyAt =
      perHour > 0 && left / perHour < hoursToReset ? this.now + (left / perHour) * HOUR : undefined
    return { unusedPct: total > 0 ? Math.round((unused / total) * 100) : 0, emptyAt }
  }

  private statusLine(
    tasks: Task[],
    total: number,
    used: number,
    forecast: { unusedPct: number; emptyAt?: number },
  ): { text: string; ref?: Ref } {
    if (this.override) return this.override
    const now = new Date(this.now)
    const doing = tasks.filter((t) => t.section === 'doing')
    const inFlight = tasks.filter((t) => IN_FLIGHT.has(t.section))
    const freePct = total > 0 ? Math.round(((total - used) / total) * 100) : 0
    if (forecast.emptyAt) {
      const d = new Date(forecast.emptyAt)
      return { text: `Heads up: at this pace the pool runs dry ${weekday(d)} ${partOfDay(d)}.` }
    }
    if (inFlight.length >= 7) {
      const projects = new Set(inFlight.map((t) => t.projectId)).size
      return {
        text: `Busy ${partOfDay(now)}: ${plural(inFlight.length, 'task')} in flight across ${plural(projects, 'project')}. The pool is holding up fine.`,
      }
    }
    if (doing.length === 0)
      return {
        text: `Quiet ${weekday(now)} ${partOfDay(now)}. Nothing running, ${freePct}% of pledges still free.`,
      }
    const names = [
      ...new Set(
        doing
          .map((t) => (t.pickerId ? firstName(this.mustMember(t.pickerId).name) : ''))
          .filter(Boolean),
      ),
    ]
    const shown = names.length > 3 ? [...names.slice(0, 2), 'others'] : names
    const share = shown.includes('others')
      ? `${shown[0]}’s, ${shown[1]}’s and others’`
      : joinNames(shown)
    return {
      text: `All calm. ${plural(doing.length, 'task')} running on ${share} share, ${freePct}% of pledges still free.`,
    }
  }

  // ---------- Scripted moments (called by the timeline) ----------

  /** @internal */
  script = {
    burst: (): void => {
      const plan: {
        owner: string
        project: string
        size: TaskSize
        title: string
        picker: string
        scope?: boolean
      }[] = [
        {
          owner: 'm_sofia',
          project: 'p_checkout',
          size: 'M',
          title: 'Add retry to card tokenisation',
          picker: 'm_rita',
        },
        {
          owner: 'm_diogo',
          project: 'p_checkout',
          size: 'S',
          title: 'Localise payment error messages',
          picker: 'm_joao',
        },
        {
          owner: 'm_sofia',
          project: 'p_checkout',
          size: 'M',
          title: 'Split checkout summary component',
          picker: 'm_carla',
          scope: true,
        },
        {
          owner: 'm_bruno',
          project: 'p_billing',
          size: 'M',
          title: 'Rewrite invoice email template',
          picker: 'm_helena',
        },
        {
          owner: 'm_leo',
          project: 'p_billing',
          size: 'S',
          title: 'Fix currency format in receipts',
          picker: 'm_rui',
        },
        {
          owner: 'm_sofia',
          project: 'p_checkout',
          size: 'S',
          title: 'Clean up checkout feature flags',
          picker: 'm_miguel',
        },
      ]
      plan.forEach((p, i) =>
        this.later(i * 1.25, () => {
          const t = this.publish(p.owner, p.project, p.size, {
            title: p.title,
            reservedFor: p.picker,
            claimInDemoS: 2.5,
          })
          if (p.scope) this.scopeTaskId = t.id
        }),
      )
      this.setOverride(
        'Payments is publishing 6 tasks. The agents are lining up to claim them.',
        { type: 'project', id: 'p_checkout' },
        10,
      )
    },
    asanaDown: (): void => {
      this.asanaDown = true
      this.pausedTasks.clear()
      const insight = this.openInsight(
        'service',
        'heads_up',
        'Asana isn’t answering',
        'The agents can’t update Asana tickets right now.',
        'Retrying every 5 min. Work keeps going; only Asana updates wait',
        [],
      )
      this.asanaInsightId = insight.id
      this.emit(
        'service.status',
        { type: 'system', id: 'asana' },
        say.serviceDown('Asana'),
        [{ type: 'insight', id: insight.id }],
        { service: 'asana', up: false },
      )
      this.setOverride(
        'Asana isn’t answering. The agents will hold their updates and retry in 5 min.',
        { type: 'insight', id: insight.id },
      )
    },
    asanaUp: (): void => {
      this.asanaDown = false
      const count = this.pausedTasks.size
      ;[...this.pausedTasks].forEach((id, i) => {
        const sim = this.sims.get(id)
        if (sim) sim.holdUntil = this.now + demoToMs(1.2 * (i + 1))
      })
      this.pausedTasks.clear()
      const insight = this.asanaInsightId ? this.insights.get(this.asanaInsightId) : undefined
      this.emit(
        'service.status',
        { type: 'system', id: 'asana' },
        say.serviceUp('Asana'),
        insight ? [{ type: 'insight', id: insight.id }] : [],
        { service: 'asana', up: true },
      )
      if (insight)
        this.resolveInsight(
          insight,
          count > 0 ? `Retried and caught up on ${plural(count, 'task')}` : 'Retried and caught up',
        )
      this.setOverride(
        count > 0
          ? `Asana is back. The agents caught up on ${plural(count, 'task')}.`
          : 'Asana is back. Nothing was lost.',
        insight ? { type: 'insight', id: insight.id } : undefined,
        8,
      )
    },
    brunoOffline: (): void => {
      const agent = this.pickerAgent('m_bruno')
      agent.status = 'offline'
      agent.currentTaskId = undefined
      const bruno = this.mustMember('m_bruno')
      bruno.status = 'offline'
      const task = [...this.tasks.values()].find(
        (t) => t.pickerId === 'm_bruno' && t.section === 'doing',
      )
      // Scripted: once released, Rita's agent claims it.
      if (task) this.reserveOnNext.set(task.id, 'm_rita')
      this.emit(
        'member.status',
        this.agentRef(agent),
        say.agentOffline(firstName(bruno.name)),
        [this.memberRef(bruno), ...(task ? [this.taskRef(task)] : [])],
        { status: 'offline' },
        { members: [bruno], agents: [agent] },
      )
    },
    scopeFail: (): void => {
      const id = this.scopeTaskId
      const task = id ? this.tasks.get(id) : undefined
      const sim = id ? this.sims.get(id) : undefined
      if (!task || !sim) return
      if (task.section === 'doing') {
        sim.target = task.usedPct
        this.moveToReview(task, sim)
      }
      if (task.section !== 'to_review') return
      sim.pinned = false
      sim.nextAt = this.now
      sim.forceReview = { pass: false, check: 'scope' }
      this.stepToReview(task, sim)
      sim.forceReview = { pass: true }
    },
    anaRunsOut: (): void => {
      const ana = this.mustMember('m_ana')
      const task = [...this.tasks.values()].find(
        (t) => t.pickerId === 'm_ana' && t.section === 'doing',
      )
      if (!task) return
      const top = Math.max(0, ana.pledgePct - ana.pledgeUsedPct)
      task.usedPct += top
      ana.pledgeUsedPct = ana.pledgePct
      this.addUsage(task, top)
      this.release(task, 'pledge_exhausted')
    },
    ownerApproves: (): void => {
      const task = this.qaTaskId ? this.tasks.get(this.qaTaskId) : undefined
      if (!task || task.section !== 'qa_review') return
      this.approve(task)
    },
    martaAnswers: (): void => {
      const marta = this.mustMember('m_marta')
      const prev = marta.pledgePct
      marta.pledgePrevPct = prev
      marta.pledgePct = 30
      marta.pledgeSource = 'answered'
      marta.pledgeUpdatedAt = iso(this.now)
      this.week.answeredCount += 1
      this.emit(
        'pledge.answered',
        this.memberRef(marta),
        say.pledgeAnswered(firstName(marta.name), 30, prev),
        [this.memberRef(marta)],
        { pledgePct: 30, previousPledgePct: prev },
        { members: [marta], week: { ...this.week } },
      )
      this.setOverride(
        `Marta raised the pledge from ${prev}% to 30% this week. The pool just grew.`,
        this.memberRef(marta),
        8,
      )
    },
    resetSoon: (): void => {
      const p = this.pulseRaw()
      const open = [...this.tasks.values()].filter(
        (t) => t.section === 'open' || t.section === 'next',
      ).length
      const hours = Math.round((RESET_AT - this.now) / HOUR)
      this.openInsight(
        'opportunity',
        'info',
        `${p.forecast.unusedPct}% of pledges will reset unused`,
        `Reset is in ${hours} h and, at this pace, the agents won’t get through what’s left.`,
        'Nothing automatic. Owners can publish more tasks to use it',
        [],
        'open',
      )
      const tail =
        open > 0
          ? ` and ${plural(open, 'task')} ${open === 1 ? 'is' : 'are'} waiting in Open. Good time to pick them up.`
          : '. Good time to publish a few more tasks.'
      this.setOverride(`Reset in ${hours} h. ${p.freePct}% of pledges are still free${tail}`)
    },
  }

  private pulseRaw() {
    const members = [...this.members.values()]
    const total = members.reduce((s, m) => s + m.pledgePct, 0)
    const used = members.reduce((s, m) => s + Math.min(m.pledgeUsedPct, m.pledgePct), 0)
    return {
      forecast: this.forecast(total, used),
      freePct: total > 0 ? Math.round(((total - used) / total) * 100) : 0,
    }
  }

  // ---------- Seeding ----------

  private seedCast(): void {
    for (const c of CAST) {
      this.cast.set(c.id, c)
      this.members.set(c.id, {
        id: c.id,
        name: c.name,
        team: c.team,
        slackUserId: `U0${c.id.slice(2, 6).toUpperCase()}`,
        joinedAt: c.joinedAt,
        status: 'idle',
        resetAt: iso(RESET_AT),
        pledgePct: c.pledgePct,
        pledgeSource: c.pledgeSource,
        pledgeUpdatedAt:
          c.pledgeSource === 'answered'
            ? iso(WEEK_START + this.rng.range(8, 16.5) * HOUR)
            : iso(WEEK_START),
        pledgeUsedPct: 0,
        lastSeenAt: iso(START_AT - this.rng.range(1, 30) * MIN),
      })
      this.agents.set(`a_${c.id.slice(2)}_picker`, {
        id: `a_${c.id.slice(2)}_picker`,
        name: `${firstName(c.name)}’s agent`,
        role: 'picker',
        memberId: c.id,
        status: 'idle',
        lastHeartbeatAt: iso(START_AT - this.rng.range(1, 30) * MIN),
      })
    }
    for (const id of ['a_reviewer_1', 'a_reviewer_2'])
      this.agents.set(id, {
        id,
        name: id === 'a_reviewer_1' ? 'Reviewer agent 1' : 'Reviewer agent 2',
        role: 'reviewer',
        status: 'idle',
        lastHeartbeatAt: iso(START_AT - 5 * MIN),
      })
    this.agents.set('a_slack', {
      id: 'a_slack',
      name: 'Slack agent',
      role: 'slack',
      status: 'idle',
      lastHeartbeatAt: iso(START_AT - MIN),
    })
    for (const p of PROJECTS) this.projects.set(p.id, { id: p.id, name: p.name, team: p.team })
  }

  /** Done tasks earlier in the week, adding up to each member's pledge used at the start. */
  private seedHistory(): void {
    const live: Record<string, number> = { m_ana: 3, m_bruno: 1.5, m_joao: 0.8, m_rita: 4.6 }
    const owners = CAST.filter((c) => c.persona === 'busy_owner').map((c) => c.id)
    const others = CAST.filter((c) => c.persona === 'balanced').map((c) => c.id)
    for (const c of CAST) {
      let remaining = c.usedAtStart - (live[c.id] ?? 0)
      while (remaining > 0.3) {
        const size: TaskSize =
          remaining >= 7 && this.rng.chance(0.35)
            ? 'L'
            : remaining >= 3 && this.rng.chance(0.6)
              ? 'M'
              : 'S'
        const budget = BUDGET_BY_SIZE[size]
        const overChance = size === 'S' ? 0.5 : size === 'M' ? 0.25 : 0.15
        const factor = this.rng.chance(overChance)
          ? this.rng.range(1.05, 1.35)
          : this.rng.range(0.55, 0.98)
        const used = Math.min(remaining, budget * factor)
        remaining -= used
        let ownerId = this.rng.chance(0.75) ? this.rng.pick(owners) : this.rng.pick(others)
        if (ownerId === c.id) ownerId = this.rng.pick(owners.filter((o) => o !== c.id))
        const owner = CAST.find((o) => o.id === ownerId) as CastMember
        const teamProjects = PROJECTS.filter((p) => p.team === owner.team)
        const project = this.rng.pick(teamProjects.length > 0 ? teamProjects : PROJECTS)
        this.historyTask(c.id, ownerId, project.id, size, used)
      }
    }
  }

  private historyTask(
    pickerId: string,
    ownerId: string,
    projectId: string,
    size: TaskSize,
    used: number,
  ): void {
    const doneAt = WEEK_START + this.rng.range(30, 160) * HOUR
    const failed = this.rng.chance(0.25)
    const rejected = !failed && this.rng.chance(0.1)
    const stays: [Section, number][] = []
    stays.push(['open', this.rng.range(0.3, 5) * HOUR])
    stays.push(['doing', this.rng.range(0.8, 3) * HOUR])
    stays.push(['to_review', this.rng.range(10, 40) * MIN])
    if (failed) {
      stays.push(['doing', this.rng.range(0.3, 1) * HOUR])
      stays.push(['to_review', this.rng.range(10, 30) * MIN])
    }
    if (rejected) {
      stays.push(['qa_review', this.rng.range(2, 18) * HOUR])
      stays.push(['next', this.rng.range(0.3, 3) * HOUR])
      stays.push(['doing', this.rng.range(0.5, 1.5) * HOUR])
      stays.push(['to_review', this.rng.range(10, 30) * MIN])
    }
    stays.push(['qa_review', this.rng.range(1, 20) * HOUR])
    const totalMs = stays.reduce((s, [, d]) => s + d, 0)
    const createdAt = doneAt - totalMs
    const task = this.newTask({
      ownerId,
      projectId,
      size,
      section: 'open',
      since: createdAt,
      createdAt,
    })
    task.sectionLog = []
    let t = createdAt
    const doingSpans: [number, number][] = []
    for (const [section, d] of stays) {
      task.sectionLog.push({ section, enteredAt: iso(t), leftAt: iso(t + d) })
      if (section === 'doing') doingSpans.push([t, t + d])
      t += d
    }
    task.sectionLog.push({ section: 'done', enteredAt: iso(doneAt) })
    task.section = 'done'
    task.sectionSince = iso(doneAt)
    task.doneAt = iso(doneAt)
    task.pickerId = pickerId
    task.pickerAgentId = `a_${pickerId.slice(2)}_picker`
    task.usedPct = round2(used)
    task.reviewAttempts = failed ? 2 : 1
    task.rejections = rejected ? 1 : 0
    if (failed) {
      const check = this.rng.pick(['compliance', 'scope', 'harness', 'scope'] as const)
      task.reviewFailures.push({
        check,
        at: task.sectionLog[2]?.leftAt ?? iso(doneAt),
        destructive: false,
      })
    }
    task.lastHeartbeatAt = iso(doingSpans[doingSpans.length - 1]?.[1] ?? doneAt)
    // Spread usage over the Doing spans, hour by hour.
    const doingTotal = doingSpans.reduce((s, [a, b]) => s + (b - a), 0)
    for (const [a, b] of doingSpans) {
      let cursor = a
      while (cursor < b) {
        const hourEnd = Math.min(b, Math.floor(cursor / HOUR) * HOUR + HOUR)
        this.addUsage(task, (used * (hourEnd - cursor)) / doingTotal, cursor)
        cursor = hourEnd
      }
    }
    const picker = this.members.get(pickerId)
    if (picker) picker.pledgeUsedPct += used
  }

  /** The tasks on the board when the demo starts. */
  private seedLive(): void {
    const mk = (p: {
      owner: string
      project: string
      size: TaskSize
      title: string
      section: Section
      sinceMin: number
      picker?: string
      used?: number
      sim: Partial<TaskSim>
    }) => {
      const since = START_AT - p.sinceMin * MIN
      const created = since - this.rng.range(20, 120) * MIN
      const task = this.newTask({
        ownerId: p.owner,
        projectId: p.project,
        size: p.size,
        section: p.section,
        since,
        title: p.title,
        createdAt: created,
      })
      task.sectionLog =
        p.section === 'open'
          ? [{ section: 'open', enteredAt: iso(created) }]
          : [
              { section: 'open', enteredAt: iso(created), leftAt: iso(since) },
              { section: p.section, enteredAt: iso(since) },
            ]
      if (p.section === 'qa_review') {
        const doingAt = created + 15 * MIN
        task.sectionLog = [
          { section: 'open', enteredAt: iso(created), leftAt: iso(doingAt) },
          { section: 'doing', enteredAt: iso(doingAt), leftAt: iso(since - 20 * MIN) },
          { section: 'to_review', enteredAt: iso(since - 20 * MIN), leftAt: iso(since) },
          { section: 'qa_review', enteredAt: iso(since) },
        ]
        task.reviewerAgentId = 'a_reviewer_2'
      }
      if (p.picker) {
        task.pickerId = p.picker
        task.pickerAgentId = `a_${p.picker.slice(2)}_picker`
        task.reviewAttempts = 1
        task.lastHeartbeatAt = iso(START_AT - 10_000)
      }
      if (p.used) {
        task.usedPct = p.used
        // Usage before the demo, in the hour before it starts.
        this.addUsage(task, p.used, START_AT - 30 * MIN)
        const picker = p.picker ? this.members.get(p.picker) : undefined
        if (picker) picker.pledgeUsedPct += p.used
      }
      this.sims.set(task.id, {
        target: 0,
        rate: 0,
        nextHeartbeatAt: START_AT + this.rng.range(0, HEARTBEAT_EVERY_MS),
        pendingUsage: 0,
        ...p.sim,
      })
      return task
    }
    const perSec = (pct: number, demoS: number) => pct / (demoS * SIM_PER_DEMO_S)

    // Ana: L task, pledge runs out at 2:10 (130 demo s). Ana starts at 24 of 30.
    const ana = mk({
      owner: 'm_sofia',
      project: 'p_checkout',
      size: 'L',
      title: 'Type the payment provider client',
      section: 'doing',
      sinceMin: 40,
      picker: 'm_ana',
      used: 3,
      sim: { target: 9.9, rate: perSec(5.8, 130) },
    })
    this.reserveOnNext.set(ana.id, 'm_rui')
    // Bruno: stays in Doing until the laptop goes quiet at 1:30.
    mk({
      owner: 'm_tiago',
      project: 'p_ci',
      size: 'M',
      title: 'Cache node_modules between jobs',
      section: 'doing',
      sinceMin: 25,
      picker: 'm_bruno',
      used: 1.5,
      sim: { target: 5.6, rate: perSec(1.8, 90), pinned: true },
    })
    // João: small task that finishes normally.
    mk({
      owner: 'm_pedro',
      project: 'p_help',
      size: 'S',
      title: 'Synonyms for billing searches',
      section: 'doing',
      sinceMin: 12,
      picker: 'm_joao',
      used: 0.8,
      sim: { target: 1.9, rate: perSec(1.1, 22) },
    })
    // QA Review, approved by Inês at 2:25.
    const qa = mk({
      owner: 'm_ines',
      project: 'p_tokens',
      size: 'M',
      title: 'Audit focus states on buttons',
      section: 'qa_review',
      sinceMin: 95,
      picker: 'm_rita',
      used: 4.6,
      sim: { pinned: true },
    })
    this.qaTaskId = qa.id
    // Two in Open.
    mk({
      owner: 'm_pedro',
      project: 'p_help',
      size: 'S',
      title: 'Index the new refund articles',
      section: 'open',
      sinceMin: 6,
      sim: { nextAt: START_AT + demoToMs(8) },
    })
    mk({
      owner: 'm_ines',
      project: 'p_tokens',
      size: 'M',
      title: 'Document icon sizes',
      section: 'open',
      sinceMin: 3,
      sim: { nextAt: START_AT + demoToMs(14) },
    })
    // One waiting for details from its owner.
    mk({
      owner: 'm_tiago',
      project: 'p_status',
      size: 'M',
      title: 'Write runbook for status updates',
      section: 'needs_info',
      sinceMin: 180,
      sim: { nextAt: START_AT + demoToMs(62) },
    })
  }

  private seedInsights(): void {
    const done = [...this.tasks.values()].filter((t) => t.section === 'done')
    const small = done.filter((t) => t.size === 'S')
    const over = small.filter((t) => t.usedPct > t.budgetPct)
    if (small.length > 0) {
      const pct = Math.round((over.length / small.length) * 100)
      const ins: Insight = {
        id: `i_${++this.insightSeq}`,
        kind: 'quality',
        severity: 'info',
        title: `S tasks go over budget ${pct}% of the time`,
        detail: `${over.length} of ${small.length} small tasks this week used more than 2%. Their owners may be sizing them too small.`,
        agentAction: 'Nothing automatic; owners can size these as M',
        state: 'open',
        openedAt: iso(START_AT - 3 * HOUR),
        related: [],
      }
      this.insights.set(ins.id, ins)
    }
    const qaHours = done.map(
      (t) =>
        t.sectionLog
          .filter((s) => s.section === 'qa_review')
          .reduce(
            (s, x) => s + (Date.parse(x.leftAt ?? x.enteredAt) - Date.parse(x.enteredAt)),
            0,
          ) / HOUR,
    )
    const avg = qaHours.reduce((a, b) => a + b, 0) / Math.max(1, qaHours.length)
    const ins: Insight = {
      id: `i_${++this.insightSeq}`,
      kind: 'flow',
      severity: 'info',
      title: `Tasks wait ${Math.round(avg)} h in QA Review`,
      detail: 'QA Review is the slowest step this week. Owners are the bottleneck, not the agents.',
      agentAction: 'The Slack agent reminds owners once per task',
      state: 'open',
      openedAt: iso(START_AT - 5 * HOUR),
      related: [],
    }
    this.insights.set(ins.id, ins)
  }

  /** Log entries for the last few hours before the demo starts. */
  private seedLog(): void {
    const from = START_AT - 3 * HOUR
    const entries: DashEvent[] = []
    for (const task of this.tasks.values()) {
      const owner = this.mustMember(task.ownerId)
      const picker = task.pickerId ? this.members.get(task.pickerId) : undefined
      const project = this.projects.get(task.projectId)
      task.sectionLog.forEach((s, i) => {
        const at = Date.parse(s.enteredAt)
        if (at < from || at > START_AT) return
        const prevSection = task.sectionLog[i - 1]?.section
        const base = { id: '', at: s.enteredAt, related: [{ type: 'task' as const, id: task.id }] }
        if (i === 0 || s.section === 'open')
          entries.push({
            ...base,
            type: 'task.published',
            actor: { type: 'member', id: owner.id },
            text: say.published(firstName(owner.name), task.title, project?.name ?? ''),
            data: { to: 'open', reason: 'published' },
          })
        else if (s.section === 'doing' && picker)
          entries.push({
            ...base,
            type: 'task.claimed',
            actor: { type: 'agent', id: `a_${picker.id.slice(2)}_picker` },
            text: say.claimed(firstName(picker.name), task.title),
            data: { from: prevSection, to: 'doing', reason: 'claimed' },
          })
        else if (s.section === 'to_review' && picker)
          entries.push({
            ...base,
            type: 'task.section_changed',
            actor: { type: 'agent', id: `a_${picker.id.slice(2)}_picker` },
            text: say.toReview(firstName(picker.name), task.title),
            data: { from: 'doing', to: 'to_review', reason: 'implemented' },
          })
        else if (s.section === 'qa_review')
          entries.push({
            ...base,
            type: 'review.passed',
            actor: { type: 'agent', id: 'a_reviewer_1' },
            text: say.reviewPassed(task.title, firstName(owner.name)),
            data: { from: 'to_review', to: 'qa_review', reason: 'review_passed' },
          })
        else if (s.section === 'done')
          entries.push({
            ...base,
            type: 'task.approved',
            actor: { type: 'member', id: owner.id },
            text: say.approved(firstName(owner.name), task.title),
            data: { from: 'qa_review', to: 'done', reason: 'approved' },
          })
      })
    }
    entries.sort((a, b) => a.at.localeCompare(b.at))
    for (const e of entries) this.events.push({ ...e, id: `e_${++this.eventSeq}` })
  }
}

function clone<T>(v: T): T {
  return structuredClone(v)
}

/** Scripted demo moments, on the 10× timeline (spec: "Scripted demo moments"). */
export function buildTimeline(): Moment[] {
  return [
    { at: 20, name: 'burst', run: (e) => e.script.burst() },
    { at: 50, name: 'asana_down', run: (e) => e.script.asanaDown() },
    { at: 75, name: 'asana_up', run: (e) => e.script.asanaUp() },
    { at: 90, name: 'bruno_offline', run: (e) => e.script.brunoOffline() },
    { at: 110, name: 'scope_fail', run: (e) => e.script.scopeFail() },
    { at: 130, name: 'ana_runs_out', run: (e) => e.script.anaRunsOut() },
    { at: 145, name: 'owner_approves', run: (e) => e.script.ownerApproves() },
    { at: 160, name: 'marta_answers', run: (e) => e.script.martaAnswers() },
    { at: 175, name: 'reset_soon', run: (e) => e.script.resetSoon() },
  ]
}
