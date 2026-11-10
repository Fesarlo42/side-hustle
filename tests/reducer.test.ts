import { describe, expect, it } from 'vitest'
import { LOG_LIMIT, applyMessage, applySnapshot, initialData } from '@/store/reducer'
import type { DashEvent } from '@/types'
import { T0, member, snapshot, task } from './fixtures'

const ev = (id: string, type: DashEvent['type'] = 'task.claimed'): DashEvent => ({
  id,
  at: T0,
  type,
  actor: { type: 'system', id: 's' },
  text: id,
  related: [],
})

describe('reducer', () => {
  it('loads a snapshot into maps', () => {
    const s = applySnapshot(
      initialData,
      snapshot({ members: [member({ id: 'm_a' })], tasks: [task({ id: 't1' })] }),
    )
    expect(s.loaded).toBe(true)
    expect(s.members.m_a?.id).toBe('m_a')
    expect(s.tasks.t1?.id).toBe('t1')
  })

  it('ignores events before the snapshot', () => {
    const s = applyMessage(initialData, {
      kind: 'event',
      event: ev('e1'),
      changes: { tasks: [task({ id: 't1' })] },
    })
    expect(s).toBe(initialData)
  })

  it('upserts changed entities and appends the event to the log', () => {
    let s = applySnapshot(initialData, snapshot({ tasks: [task({ id: 't1' })] }))
    s = applyMessage(s, {
      kind: 'event',
      event: ev('e1'),
      changes: { tasks: [task({ id: 't1', section: 'doing', pickerId: 'm_b' })] },
    })
    expect(s.tasks.t1?.section).toBe('doing')
    expect(s.tasks.t1?.pickerId).toBe('m_b')
    expect(s.events.map((e) => e.id)).toEqual(['e1'])
  })

  it('does not log heartbeats but applies their changes', () => {
    let s = applySnapshot(initialData, snapshot({ tasks: [task({ id: 't1', usedPct: 1 })] }))
    s = applyMessage(s, {
      kind: 'event',
      event: ev('e2', 'task.heartbeat'),
      changes: { tasks: [task({ id: 't1', usedPct: 2 })] },
    })
    expect(s.events).toHaveLength(0)
    expect(s.tasks.t1?.usedPct).toBe(2)
  })

  it('does not log the same event twice', () => {
    let s = applySnapshot(initialData, snapshot())
    s = applyMessage(s, { kind: 'event', event: ev('e1') })
    s = applyMessage(s, { kind: 'event', event: ev('e1') })
    expect(s.events).toHaveLength(1)
  })

  it('caps the log', () => {
    let s = applySnapshot(initialData, snapshot())
    for (let i = 0; i < LOG_LIMIT + 10; i++)
      s = applyMessage(s, { kind: 'event', event: ev(`e${i}`) })
    expect(s.events).toHaveLength(LOG_LIMIT)
    expect(s.events[0]?.id).toBe('e10')
  })

  it('ripples on approvals, pledge answers and resolved insights only', () => {
    let s = applySnapshot(initialData, snapshot())
    s = applyMessage(s, { kind: 'event', event: ev('a', 'task.claimed') })
    expect(s.rippleSeq).toBe(0)
    s = applyMessage(s, { kind: 'event', event: ev('b', 'task.approved') })
    s = applyMessage(s, { kind: 'event', event: ev('c', 'pledge.answered') })
    s = applyMessage(s, { kind: 'event', event: ev('d', 'insight.resolved') })
    expect(s.rippleSeq).toBe(3)
  })

  it('replaces the pulse and flags a reset', () => {
    let s = applySnapshot(initialData, snapshot())
    const pulse = { ...snapshot().pulse, heartbeatsPerMin: 12 }
    s = applyMessage(s, { kind: 'pulse', pulse })
    expect(s.pulse?.heartbeatsPerMin).toBe(12)
    s = applyMessage(s, { kind: 'reset' })
    expect(s.needsSnapshot).toBe(true)
  })
})
