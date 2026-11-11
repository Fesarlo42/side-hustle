import { describe, expect, it } from 'vitest'
import { beat, initials, targetPeriod } from '@/components/Core/Core'
import { breath } from '@/motion'

describe('core pulse', () => {
  it('breathes every 4 s at rest and up to 1 s at peak', () => {
    expect(targetPeriod(0, 'calm')).toBe(breath.idle)
    expect(targetPeriod(30, 'calm')).toBe(breath.busy)
    expect(targetPeriod(300, 'calm')).toBe(breath.busy)
    expect(targetPeriod(15, 'calm')).toBeCloseTo(2.5)
  })

  it('beats quicker when strained or critical', () => {
    expect(targetPeriod(10, 'strained')).toBeLessThan(targetPeriod(10, 'calm'))
    expect(targetPeriod(10, 'critical')).toBeLessThan(targetPeriod(10, 'strained'))
  })

  it('keeps the beat between 0 and 1 for every state', () => {
    for (const h of ['calm', 'strained', 'critical'] as const)
      for (let p = 0; p < 2; p += 0.01) {
        const b = beat(p, h)
        expect(b).toBeGreaterThanOrEqual(0)
        expect(b).toBeLessThanOrEqual(1)
      }
  })

  it('has a double beat when critical', () => {
    const peaks = [0.18, 0.42].map((p) => beat(p, 'critical'))
    expect(peaks[0]).toBeGreaterThan(0.9)
    expect(peaks[1]).toBeGreaterThan(0.4)
    expect(beat(0.3, 'critical')).toBeLessThan(peaks[1] ?? 0)
  })

  it('makes initials from names', () => {
    expect(initials('Ana Silva')).toBe('AS')
    expect(initials('Inês Rocha')).toBe('IR')
    expect(initials('Leo')).toBe('L')
  })
})

import { stepSim, newSim } from '@/components/Core/Core'

describe('core animation frames', () => {
  const props = {
    heartbeatsPerMin: 20,
    poolLeft: 0.5,
    health: 'calm' as const,
    members: [
      { id: 'a', name: 'Ana Silva', ring: 'outer' as const, offline: false, faded: false },
      { id: 'b', name: 'Bruno Costa', ring: 'inner' as const, offline: false, faded: false },
    ],
    flows: [{ taskId: 't1', from: 'a', to: 'b' }],
    rippleSeq: 0,
    wobble: false,
    reducedMotion: false,
    label: 'x',
  }

  it('sends particles from picker to owner, each with a short trail', () => {
    const sim = newSim(props)
    let view = stepSim(sim, props, 0.05)
    for (let i = 0; i < 60; i++) view = stepSim(sim, props, 0.05)
    expect(view.particles.length).toBeGreaterThan(0)
    for (const p of view.particles) expect(p.trail).toHaveLength(3)
  })

  it('stops spawning when the task leaves Doing', () => {
    const sim = newSim(props)
    for (let i = 0; i < 60; i++) stepSim(sim, props, 0.05)
    const idle = { ...props, flows: [] }
    let view = stepSim(sim, idle, 0.05)
    for (let i = 0; i < 80; i++) view = stepSim(sim, idle, 0.05)
    expect(view.particles).toHaveLength(0)
  })
})
