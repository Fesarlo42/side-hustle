import { describe, expect, it } from 'vitest'
import { DEMO_LENGTH_S, MockEngine } from '@/data/mock/engine'
import { applyMessage, applySnapshot, initialData } from '@/store/reducer'
import type { DashEvent, StreamMessage } from '@/types'

function run(seconds = DEMO_LENGTH_S + 5, seed?: number) {
  const engine = new MockEngine({ seed })
  const events: (DashEvent & { demoS: number })[] = []
  engine.subscribe((m) => {
    if (m.kind === 'event' && m.event.type !== 'task.heartbeat')
      events.push({ ...m.event, demoS: engine.demoTime })
  })
  const pulses: { demoS: number; health: string; inFlight: number; status: string }[] = []
  for (let t = 0; t < seconds; t += 1) {
    engine.advance(1)
    const p = engine.pulse()
    pulses.push({
      demoS: engine.demoTime,
      health: p.health,
      inFlight: p.tasksInFlight,
      status: p.statusLine,
    })
  }
  return { engine, events, pulses }
}

const find = (events: ReturnType<typeof run>['events'], pred: (e: DashEvent) => boolean) =>
  events.find(pred)

describe('mock engine', () => {
  it('has the cast from the spec', () => {
    const s = new MockEngine().snapshot()
    expect(s.members).toHaveLength(15)
    expect(new Set(s.members.map((m) => m.team))).toEqual(
      new Set(['Design', 'Payments', 'Platform', 'Support']),
    )
    expect(s.projects).toHaveLength(6)
    expect(s.agents.filter((a) => a.role === 'picker')).toHaveLength(15)
    expect(s.agents.filter((a) => a.role === 'reviewer')).toHaveLength(2)
    expect(s.members.filter((m) => m.pledgeSource === 'carried_over')).toHaveLength(1)
    expect(s.members.filter((m) => m.pledgeSource === 'default_zero')).toHaveLength(1)
  })

  it('starts calm with 3 tasks in Doing and 2 in Open', () => {
    const s = new MockEngine().snapshot()
    expect(s.tasks.filter((t) => t.section === 'doing')).toHaveLength(3)
    expect(s.tasks.filter((t) => t.section === 'open')).toHaveLength(2)
    expect(s.pulse.health).toBe('calm')
  })

  it('pledge used matches what the agents spent on tasks', () => {
    const s = new MockEngine().snapshot()
    for (const m of s.members) {
      const spent = s.tasks.filter((t) => t.pickerId === m.id).reduce((a, t) => a + t.usedPct, 0)
      expect(spent).toBeCloseTo(m.pledgeUsedPct, 1)
    }
  })

  it('is deterministic for a seed', () => {
    const a = run(60).events.map((e) => e.text)
    const b = run(60).events.map((e) => e.text)
    expect(a).toEqual(b)
    expect(run(60, 7).events.map((e) => e.text)).not.toEqual(a)
  })

  it('plays every scripted demo moment on time', () => {
    const { events, pulses } = run()
    const near = (e: { demoS: number } | undefined, s: number, tol = 6) => {
      expect(e).toBeDefined()
      expect(Math.abs((e?.demoS ?? -99) - s)).toBeLessThanOrEqual(tol)
    }
    // 0:20 burst: 6 published and claimed, busy
    const published = events.filter(
      (e) => e.type === 'task.published' && e.demoS >= 20 && e.demoS < 30,
    )
    expect(published).toHaveLength(6)
    expect(
      events.filter((e) => e.type === 'task.claimed' && e.demoS >= 20 && e.demoS < 35).length,
    ).toBeGreaterThanOrEqual(6)
    expect(
      Math.max(...pulses.filter((p) => p.demoS <= 45).map((p) => p.inFlight)),
    ).toBeGreaterThanOrEqual(7)
    // 0:50 Asana down, strained; 1:15 back
    near(
      find(events, (e) => e.type === 'insight.opened' && e.text.includes('Asana')),
      50,
      0,
    )
    expect(pulses.some((p) => p.demoS > 50 && p.demoS < 75 && p.health === 'strained')).toBe(true)
    near(
      find(events, (e) => e.type === 'insight.resolved' && e.text.includes('Asana')),
      75,
      0,
    )
    expect(pulses.find((p) => p.demoS === 76)?.health).toBe('calm')
    // 1:30 Bruno goes quiet, task released and claimed by Rita
    near(
      find(events, (e) => e.type === 'member.status' && e.text.startsWith('Bruno')),
      90,
      0,
    )
    near(
      find(events, (e) => e.type === 'task.flagged'),
      99,
    )
    near(
      find(events, (e) => e.type === 'task.released' && e.data?.reason === 'orphaned'),
      101,
    )
    near(
      find(
        events,
        (e) => e.type === 'task.claimed' && e.text.startsWith('Rita') && e.text.includes('Bruno'),
      ),
      104,
    )
    // 1:50 scope failure, review 2 of 3
    const scope = find(
      events,
      (e) =>
        e.type === 'review.failed' &&
        e.data?.check === 'scope' &&
        e.text.includes('Split checkout'),
    )
    near(scope, 110, 0)
    expect(scope?.data?.attempt).toBe(2)
    // 2:10 Ana's pledge runs out, Rui takes over
    near(
      find(
        events,
        (e) =>
          e.type === 'task.released' &&
          e.data?.reason === 'pledge_exhausted' &&
          e.text.startsWith('Ana'),
      ),
      130,
      0,
    )
    near(
      find(
        events,
        (e) => e.type === 'task.claimed' && e.text.startsWith('Rui') && e.text.includes('Ana'),
      ),
      133,
    )
    // 2:25 approval
    near(
      find(events, (e) => e.type === 'task.approved' && e.text.includes('Audit focus states')),
      145,
      0,
    )
    // 2:40 Marta
    near(
      find(events, (e) => e.type === 'pledge.answered' && e.text.startsWith('Marta')),
      160,
      0,
    )
    // 2:55 opportunity + status line
    near(
      find(events, (e) => e.type === 'insight.opened' && e.text.includes('reset unused')),
      175,
      0,
    )
    expect(pulses.find((p) => p.demoS === 176)?.status).toMatch(/^Reset in 6 h\./)
  })

  it('stays consistent when replayed through the reducer', () => {
    const engine = new MockEngine()
    let state = applySnapshot(initialData, engine.snapshot())
    engine.subscribe((m: StreamMessage) => {
      state = applyMessage(state, m)
    })
    engine.advance(DEMO_LENGTH_S)
    const truth = applySnapshot(initialData, engine.snapshot())
    expect(Object.keys(state.tasks).sort()).toEqual(Object.keys(truth.tasks).sort())
    for (const id of Object.keys(truth.tasks))
      expect(state.tasks[id]?.section).toBe(truth.tasks[id]?.section)
    for (const id of Object.keys(truth.members))
      expect(state.members[id]?.pledgeUsedPct).toBeCloseTo(
        truth.members[id]?.pledgeUsedPct ?? -1,
        0,
      )
  })
})
