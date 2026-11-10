import { describe, expect, it } from 'vitest'
import { HEALTH_RULES, computeHealth } from '@/config/health'

const now = Date.parse('2026-11-15T17:00:00Z')
const base = { poolTotalPct: 100, poolUsedPct: 10, tasks: [], insights: [], now }

describe('health rules', () => {
  it('is calm by default', () => expect(computeHealth(base)).toBe('calm'))
  it('is strained from 70% used', () =>
    expect(computeHealth({ ...base, poolUsedPct: 70 })).toBe('strained'))
  it('is critical over 90% used', () =>
    expect(computeHealth({ ...base, poolUsedPct: 91 })).toBe('critical'))
  it('is strained with an orphaned task', () =>
    expect(computeHealth({ ...base, tasks: [{ flag: 'orphaned', section: 'doing' }] })).toBe(
      'strained',
    ))
  it('is critical with an open attention insight', () =>
    expect(
      computeHealth({
        ...base,
        insights: [
          { severity: 'attention', state: 'handling', openedAt: new Date(now).toISOString() },
        ],
      }),
    ).toBe('critical'))
  it('is strained only once a heads-up has been open long enough', () => {
    const fresh = new Date(now - 30_000).toISOString()
    const old = new Date(now - (HEALTH_RULES.headsUpStrainedAfterMin + 1) * 60_000).toISOString()
    expect(
      computeHealth({
        ...base,
        insights: [{ severity: 'heads_up', state: 'open', openedAt: fresh }],
      }),
    ).toBe('calm')
    expect(
      computeHealth({
        ...base,
        insights: [{ severity: 'heads_up', state: 'open', openedAt: old }],
      }),
    ).toBe('strained')
  })
})
