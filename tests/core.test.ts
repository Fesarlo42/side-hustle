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
