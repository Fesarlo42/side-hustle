/**
 * One reducer for the whole dashboard: snapshot in, then stream messages.
 * Pure functions, so they're easy to test.
 */
import type {
  Agent,
  Changes,
  DashEvent,
  DemoState,
  EventType,
  Insight,
  Member,
  Project,
  Pulse,
  Snapshot,
  StreamMessage,
  Task,
  UsageBucket,
  Week,
  WorkflowConfig,
} from '@/types'

export const LOG_LIMIT = 200

export interface DataState {
  loaded: boolean
  members: Record<string, Member>
  projects: Record<string, Project>
  agents: Record<string, Agent>
  tasks: Record<string, Task>
  insights: Record<string, Insight>
  /** Oldest first. Heartbeats are not logged. */
  events: DashEvent[]
  usage: Record<string, UsageBucket>
  pulse: Pulse | null
  week: Week | null
  config: WorkflowConfig | null
  demo?: DemoState
  /** Increments on events that make the core ripple. */
  rippleSeq: number
  /** Set when the source asks for a fresh snapshot. */
  needsSnapshot: boolean
}

export const initialData: DataState = {
  loaded: false,
  members: {},
  projects: {},
  agents: {},
  tasks: {},
  insights: {},
  events: [],
  usage: {},
  pulse: null,
  week: null,
  config: null,
  rippleSeq: 0,
  needsSnapshot: false,
}

/** Events that make the core ripple (spec: "Ripple"). */
export const RIPPLE_EVENTS: ReadonlySet<EventType> = new Set([
  'task.approved',
  'member.joined',
  'pledge.answered',
  'insight.resolved',
])

const byId = <T extends { id: string }>(items: T[]): Record<string, T> =>
  Object.fromEntries(items.map((i) => [i.id, i]))

export const usageKey = (b: Pick<UsageBucket, 'hour' | 'taskId' | 'pickerId'>) =>
  `${b.hour}|${b.taskId}|${b.pickerId}`

export function applySnapshot(state: DataState, snap: Snapshot): DataState {
  return {
    ...state,
    loaded: true,
    needsSnapshot: false,
    members: byId(snap.members),
    projects: byId(snap.projects),
    agents: byId(snap.agents),
    tasks: byId(snap.tasks),
    insights: byId(snap.insights),
    events: snap.events.slice(-LOG_LIMIT),
    usage: Object.fromEntries(snap.usage.map((b) => [usageKey(b), b])),
    pulse: snap.pulse,
    week: snap.week,
    config: snap.config,
    demo: snap.demo,
  }
}

function upsert<T extends { id: string }>(
  current: Record<string, T>,
  items?: T[],
): Record<string, T> {
  if (!items || items.length === 0) return current
  const next = { ...current }
  for (const item of items) next[item.id] = item
  return next
}

export function applyChanges(state: DataState, changes: Changes): DataState {
  let usage = state.usage
  if (changes.usage && changes.usage.length > 0) {
    usage = { ...usage }
    for (const b of changes.usage) usage[usageKey(b)] = b
  }
  return {
    ...state,
    members: upsert(state.members, changes.members),
    agents: upsert(state.agents, changes.agents),
    tasks: upsert(state.tasks, changes.tasks),
    insights: upsert(state.insights, changes.insights),
    projects: upsert(state.projects, changes.projects),
    usage,
    week: changes.week ?? state.week,
  }
}

export function applyMessage(state: DataState, msg: StreamMessage): DataState {
  switch (msg.kind) {
    case 'reset':
      return { ...state, needsSnapshot: true }
    case 'pulse':
      return { ...state, pulse: msg.pulse, demo: msg.demo ?? state.demo }
    case 'event': {
      // Ignore stream messages until the snapshot has arrived.
      if (!state.loaded) return state
      let next = msg.changes ? applyChanges(state, msg.changes) : state
      if (msg.event.type !== 'task.heartbeat') {
        if (next.events.some((e) => e.id === msg.event.id)) return next
        const events = [...next.events, msg.event]
        next = { ...next, events: events.length > LOG_LIMIT ? events.slice(-LOG_LIMIT) : events }
      }
      if (RIPPLE_EVENTS.has(msg.event.type)) next = { ...next, rippleSeq: next.rippleSeq + 1 }
      return next
    }
  }
}
