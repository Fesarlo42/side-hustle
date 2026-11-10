/**
 * Data contract for the Side hustle dashboard.
 *
 * Source: side-hustle-dashboard-spec.md ("Data contract"), adjusted by
 * docs/data-contract-diff.md. All usage values are a % of one person's weekly
 * limit (0–100). Times are ISO 8601 strings in UTC. IDs are strings.
 */

export type ISODate = string

// ---------- Enums ----------

export type MemberStatus = 'working' | 'idle' | 'offline'
export type PledgeSource = 'answered' | 'carried_over' | 'pending' | 'default_zero'
export type AgentRole = 'picker' | 'reviewer' | 'owner' | 'slack'
export type AgentStatus = 'idle' | 'working' | 'offline'

export const SECTIONS = [
  'open',
  'doing',
  'to_review',
  'qa_review',
  'next',
  'needs_info',
  'done',
] as const
export type Section = (typeof SECTIONS)[number]

export type TaskFlag = 'stalled' | 'orphaned'
export type TaskSize = 'S' | 'M' | 'L'
export type ReviewCheck = 'compliance' | 'scope' | 'non_destructive' | 'harness'

export type InsightKind = 'service' | 'device' | 'flow' | 'quality' | 'pledge' | 'opportunity'
export type InsightSeverity = 'info' | 'heads_up' | 'attention'
export type InsightState = 'open' | 'handling' | 'resolved'

export type Health = 'calm' | 'strained' | 'critical'

/** Why a task changed section. Diff row 8. */
export type TransitionReason =
  | 'published'
  | 'claimed'
  | 'implemented'
  | 'review_passed'
  | 'review_failed'
  | 'review_destructive'
  | 'attempts_exhausted'
  | 'released'
  | 'orphaned'
  | 'pledge_exhausted'
  | 'budget_exhausted'
  | 'rejected'
  | 'approved'
  | 'info_missing'
  | 'info_completed'

export type EventType =
  | 'member.joined'
  | 'member.left'
  | 'member.status'
  | 'pledge.answered'
  | 'pledge.changed'
  | 'task.published'
  | 'task.claimed'
  | 'task.section_changed'
  | 'task.heartbeat'
  | 'task.released'
  | 'task.flagged'
  | 'review.passed'
  | 'review.failed'
  | 'task.approved'
  | 'task.rejected'
  | 'insight.opened'
  | 'insight.updated'
  | 'insight.resolved'
  | 'week.reset'
  | 'service.status'

// ---------- Refs ----------

export type RefType = 'member' | 'task' | 'project' | 'agent' | 'insight' | 'system'
export interface Ref {
  type: RefType
  id: string
}

// ---------- Entities ----------

export interface Member {
  id: string
  name: string
  avatarUrl?: string
  team: string
  slackUserId: string
  joinedAt: ISODate
  status: MemberStatus
  resetAt: ISODate
  pledgePct: number
  pledgeSource: PledgeSource
  pledgeUpdatedAt: ISODate
  /** Previous pledge, set when it changed mid-week (for the "changed" marker). */
  pledgePrevPct?: number
  pledgeUsedPct: number
  lastSeenAt: ISODate
}

export interface Project {
  id: string
  name: string
  team: string
  colour?: string
}

export interface Agent {
  id: string
  name: string
  role: AgentRole
  memberId?: string
  status: AgentStatus
  currentTaskId?: string
  lastHeartbeatAt: ISODate
}

export interface ReviewFailure {
  check: ReviewCheck
  at: ISODate
  /** Diff row 9: a destructive failure goes straight to Needs Info. */
  destructive: boolean
}

/** One stay in a section. Diff extension, needed for "time per section". */
export interface SectionStay {
  section: Section
  enteredAt: ISODate
  leftAt?: ISODate
}

export interface Task {
  id: string
  asanaUrl: string
  title: string
  projectId: string
  ownerId: string
  pickerId?: string
  pickerAgentId?: string
  reviewerAgentId?: string
  /** Picker who held the task before the last release (for the hand-over on the card). */
  previousPickerId?: string
  section: Section
  sectionSince: ISODate
  sectionLog: SectionStay[]
  flag?: TaskFlag
  size: TaskSize
  budgetPct: number
  usedPct: number
  reviewAttempts: number
  maxReviewAttempts: number
  reviewFailures: ReviewFailure[]
  rejections: number
  model: string
  lastHeartbeatAt?: ISODate
  /** Diff row 10. */
  reminderSentAt?: ISODate
  createdAt: ISODate
  doneAt?: ISODate
}

export interface Insight {
  id: string
  kind: InsightKind
  severity: InsightSeverity
  title: string
  detail: string
  agentAction: string
  state: InsightState
  openedAt: ISODate
  resolvedAt?: ISODate
  related: Ref[]
}

export interface EventData {
  from?: Section
  to?: Section
  reason?: TransitionReason
  check?: ReviewCheck
  attempt?: number
  pledgePct?: number
  previousPledgePct?: number
  status?: MemberStatus | AgentStatus
  service?: string
  up?: boolean
}

export interface DashEvent {
  id: string
  at: ISODate
  type: EventType
  actor: Ref
  text: string
  related: Ref[]
  data?: EventData
}

export interface Pulse {
  at: ISODate
  heartbeatsPerMin: number
  poolTotalPct: number
  poolUsedPct: number
  tasksInFlight: number
  health: Health
  statusLine: string
  statusRef?: Ref
  forecastUnusedPct: number
  forecastEmptyAt?: ISODate
}

export interface UsageBucket {
  hour: ISODate
  pickerId: string
  ownerId: string
  projectId: string
  taskId: string
  usedPct: number
}

export interface Week {
  number: number
  startsAt: ISODate
  resetAt: ISODate
  pledgeDeadline: ISODate
  answeredCount: number
  memberCount: number
}

/** Diff row 12. Global settings of the workflow. */
export interface WorkflowConfig {
  maxReviewAttempts: number
  heartbeatTimeoutMin: number
  needsInfoTimeoutH: number
  budgetBySize: Record<TaskSize, number>
}

/** Demo controls state. Only present when the source is the mock. */
export interface DemoState {
  speed: number
  seed: number
  /** Seconds into the scripted demo, on the 10× timeline. */
  demoSeconds: number
  running: boolean
}

// ---------- Transport ----------

export interface Snapshot {
  members: Member[]
  projects: Project[]
  agents: Agent[]
  /** All of this week's tasks (flow, quality and leaderboard are calculated from them). */
  tasks: Task[]
  insights: Insight[]
  /** Newest last, up to 100. */
  events: DashEvent[]
  pulse: Pulse
  usage: UsageBucket[]
  week: Week
  config: WorkflowConfig
  demo?: DemoState
}

/** Entities that changed with an event. Upserted by id. */
export interface Changes {
  members?: Member[]
  agents?: Agent[]
  tasks?: Task[]
  insights?: Insight[]
  projects?: Project[]
  usage?: UsageBucket[]
  week?: Week
}

export type StreamMessage =
  | { kind: 'event'; event: DashEvent; changes?: Changes }
  | { kind: 'pulse'; pulse: Pulse; demo?: DemoState }
  /** The source restarted (demo restart, week reset): fetch a fresh snapshot. */
  | { kind: 'reset' }

export type DemoCommand =
  | { action: 'speed'; value: 1 | 10 | 60 }
  | { action: 'restart' }
  | { action: 'pause' }
  | { action: 'resume' }
