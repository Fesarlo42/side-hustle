import { describe, expect, it } from 'vitest'
import { applySnapshot, initialData } from '@/store/reducer'
import {
  OTHERS,
  avgTimeInSection,
  kpis,
  leaderboard,
  leftPct,
  pickerOwnerLinks,
  quality,
  sectionCounts,
  sortedMembers,
  visibleInsights,
  workCards,
} from '@/store/selectors'
import type { Insight, UsageBucket } from '@/types'
import { T0, member, snapshot, task } from './fixtures'

const at = (min: number) => new Date(Date.parse(T0) + min * 60_000).toISOString()

describe('members and KPIs', () => {
  const state = applySnapshot(
    initialData,
    snapshot({
      members: [
        member({ id: 'm_a', name: 'Ana', pledgePct: 30, pledgeUsedPct: 24 }),
        member({ id: 'm_b', name: 'Bruno', pledgePct: 10, pledgeUsedPct: 2 }),
        member({ id: 'm_c', name: 'Leo', pledgePct: 0, pledgeUsedPct: 0 }),
      ],
      tasks: [
        task({ id: 't1', section: 'doing' }),
        task({ id: 't2', section: 'to_review' }),
        task({ id: 't3', section: 'qa_review' }),
      ],
    }),
  )

  it('left is pledge minus used, never negative', () => {
    expect(leftPct({ pledgePct: 10, pledgeUsedPct: 4 })).toBe(6)
    expect(leftPct({ pledgePct: 10, pledgeUsedPct: 12 })).toBe(0)
  })

  it('sorts by left by default', () => {
    expect(sortedMembers(state).map((m) => m.id)).toEqual(['m_b', 'm_a', 'm_c'])
    expect(sortedMembers(state, 'pledge').map((m) => m.id)).toEqual(['m_a', 'm_b', 'm_c'])
    expect(sortedMembers(state, 'name').map((m) => m.name)).toEqual(['Ana', 'Bruno', 'Leo'])
  })

  it('computes KPIs in seat-weeks', () => {
    const k = kpis(state)
    expect(k.people).toBe(3)
    expect(k.giving).toBe(2)
    expect(k.pledgeLeftSeatWeeks).toBeCloseTo(0.14)
    expect(k.pledgeUsedSeatWeeks).toBeCloseTo(0.26)
    expect(k.tasksInFlight).toBe(2)
  })
})

describe('work cards and flow', () => {
  const state = applySnapshot(
    initialData,
    snapshot({
      pulse: { ...snapshot().pulse, at: at(60) },
      tasks: [
        task({ id: 'open', section: 'open' }),
        task({ id: 'review', section: 'to_review', sectionSince: at(50) }),
        task({ id: 'doing', section: 'doing', sectionSince: at(40) }),
        task({ id: 'done_recent', section: 'done', doneAt: at(50) }),
        task({ id: 'done_old', section: 'done', doneAt: at(10) }),
        task({
          id: 'history',
          section: 'done',
          doneAt: at(-60),
          sectionLog: [
            { section: 'open', enteredAt: at(-300), leftAt: at(-240) },
            { section: 'doing', enteredAt: at(-240), leftAt: at(-120) },
            { section: 'qa_review', enteredAt: at(-120), leftAt: at(-60) },
            { section: 'done', enteredAt: at(-60) },
          ],
        }),
      ],
    }),
  )

  it('shows active tasks, Doing first, and Done only for 15 minutes', () => {
    expect(workCards(state).map((t) => t.id)).toEqual(['doing', 'review', 'done_recent'])
  })

  it('counts tasks per section', () => {
    const c = sectionCounts(state)
    expect(c.open).toBe(1)
    expect(c.done).toBe(3)
  })

  it('averages finished stays per section', () => {
    const avg = avgTimeInSection(state)
    expect(avg.open).toBe(60 * 60_000)
    expect(avg.doing).toBe(120 * 60_000)
    expect(avg.qa_review).toBe(60 * 60_000)
  })
})

describe('quality and leaderboard', () => {
  const state = applySnapshot(
    initialData,
    snapshot({
      members: [member({ id: 'm_a', pledgePct: 30 }), member({ id: 'm_b', pledgePct: 5 })],
      tasks: [
        task({
          id: 't1',
          section: 'done',
          ownerId: 'm_b',
          pickerId: 'm_a',
          size: 'S',
          budgetPct: 2,
          usedPct: 2.5,
        }),
        task({
          id: 't2',
          section: 'done',
          ownerId: 'm_b',
          pickerId: 'm_a',
          size: 'S',
          budgetPct: 2,
          usedPct: 1,
          rejections: 1,
        }),
        task({
          id: 't3',
          section: 'done',
          ownerId: 'm_b',
          pickerId: 'm_a',
          model: 'Opus 5.5',
          reviewFailures: [{ check: 'scope', at: T0, destructive: false }],
        }),
        task({
          id: 't4',
          section: 'doing',
          ownerId: 'm_a',
          pickerId: 'm_b',
          previousPickerId: 'm_a',
        }),
      ],
    }),
  )

  it('computes first-pass approval, rejections and failures', () => {
    const q = quality(state)
    expect(q.doneCount).toBe(3)
    expect(q.firstPassApproval).toBeCloseTo(2 / 3)
    expect(q.rejections).toBe(1)
    expect(q.failuresByCheck.scope).toBe(1)
    expect(q.overBudgetBySize.S).toEqual({ over: 1, total: 2 })
  })

  it('computes success per model', () => {
    const q = quality(state)
    expect(q.successByModel).toEqual([
      { model: 'Sonnet 5.5', rate: 0.5, total: 2 },
      { model: 'Opus 5.5', rate: 0, total: 1 },
    ])
  })

  it('ranks publishers, pickers, completers and pledges', () => {
    const lb = leaderboard(state)
    expect(lb.published[0]).toEqual({ memberId: 'm_b', value: 3 })
    expect(lb.pickedUp[0]).toEqual({ memberId: 'm_a', value: 4 })
    expect(lb.completed[0]).toEqual({ memberId: 'm_a', value: 3 })
    expect(lb.pledges.map((r) => r.memberId)).toEqual(['m_a', 'm_b'])
  })
})

describe('where pledges go', () => {
  it('keeps the top links and groups the rest as others', () => {
    const usage: UsageBucket[] = Array.from({ length: 10 }, (_, i) => ({
      hour: T0,
      pickerId: `p${i}`,
      ownerId: 'o',
      projectId: 'p1',
      taskId: `t${i}`,
      usedPct: 10 - i,
    }))
    const state = applySnapshot(initialData, snapshot({ usage }))
    const links = pickerOwnerLinks(state, 8)
    expect(links).toHaveLength(9)
    expect(links[8]).toEqual({ pickerId: OTHERS, ownerId: OTHERS, usedPct: 2 + 1 })
  })
})

describe('insights', () => {
  const base: Omit<Insight, 'id' | 'severity' | 'state' | 'openedAt'> = {
    kind: 'flow',
    title: '',
    detail: '',
    agentAction: '',
    related: [],
  }
  it('orders open by severity then newest, resolved at the bottom, drops resolved after 24 h', () => {
    const state = applySnapshot(
      initialData,
      snapshot({
        pulse: { ...snapshot().pulse, at: at(0) },
        insights: [
          { ...base, id: 'info_new', severity: 'info', state: 'open', openedAt: at(-1) },
          { ...base, id: 'attn', severity: 'attention', state: 'handling', openedAt: at(-30) },
          { ...base, id: 'heads', severity: 'heads_up', state: 'open', openedAt: at(-5) },
          {
            ...base,
            id: 'resolved',
            severity: 'attention',
            state: 'resolved',
            openedAt: at(-90),
            resolvedAt: at(-60),
          },
          {
            ...base,
            id: 'gone',
            severity: 'info',
            state: 'resolved',
            openedAt: at(-3000),
            resolvedAt: at(-25 * 60),
          },
        ],
      }),
    )
    expect(visibleInsights(state).map((i) => i.id)).toEqual([
      'attn',
      'heads',
      'info_new',
      'resolved',
    ])
  })
})
