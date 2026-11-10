import type { Member, Snapshot, Task } from '@/types'

export const T0 = '2026-11-15T17:00:00.000Z'

export function member(p: Partial<Member> & Pick<Member, 'id'>): Member {
  return {
    name: p.id,
    team: 'Design',
    slackUserId: 'U1',
    joinedAt: T0,
    status: 'idle',
    resetAt: '2026-11-16T00:00:00.000Z',
    pledgePct: 10,
    pledgeSource: 'answered',
    pledgeUpdatedAt: T0,
    pledgeUsedPct: 0,
    lastSeenAt: T0,
    ...p,
  }
}

export function task(p: Partial<Task> & Pick<Task, 'id'>): Task {
  return {
    asanaUrl: 'https://example.test',
    title: p.id,
    projectId: 'p1',
    ownerId: 'm_a',
    section: 'open',
    sectionSince: T0,
    sectionLog: [{ section: p.section ?? 'open', enteredAt: T0 }],
    size: 'M',
    budgetPct: 5,
    usedPct: 0,
    reviewAttempts: 0,
    maxReviewAttempts: 3,
    reviewFailures: [],
    rejections: 0,
    model: 'Sonnet 5.5',
    createdAt: T0,
    ...p,
  }
}

export function snapshot(p: Partial<Snapshot> = {}): Snapshot {
  return {
    members: [],
    projects: [{ id: 'p1', name: 'Project one', team: 'Design' }],
    agents: [],
    tasks: [],
    insights: [],
    events: [],
    usage: [],
    week: {
      number: 46,
      startsAt: '2026-11-09T00:00:00.000Z',
      resetAt: '2026-11-16T00:00:00.000Z',
      pledgeDeadline: '2026-11-09T17:00:00.000Z',
      answeredCount: 0,
      memberCount: 0,
    },
    config: {
      maxReviewAttempts: 3,
      heartbeatTimeoutMin: 3,
      needsInfoTimeoutH: 24,
      budgetBySize: { S: 2, M: 5, L: 10 },
    },
    pulse: {
      at: T0,
      heartbeatsPerMin: 0,
      poolTotalPct: 0,
      poolUsedPct: 0,
      tasksInFlight: 0,
      health: 'calm',
      statusLine: 'All calm.',
      forecastUnusedPct: 0,
    },
    ...p,
  }
}
