import { describe, expect, it } from 'vitest'
import { duration, firstName, pct } from '@/lib/format'

describe('format', () => {
  it('formats durations for people', () => {
    expect(duration(40_000)).toBe('40 s')
    expect(duration(5 * 60_000)).toBe('5 min')
    expect(duration(130 * 60_000)).toBe('2 h 10 min')
    expect(duration(120 * 60_000)).toBe('2 h')
    expect(duration(76 * 3_600_000)).toBe('3 d 4 h')
    expect(duration(-1)).toBe('—')
  })
  it('formats percentages', () => {
    expect(pct(12.345, 1)).toBe('12.3%')
    expect(pct(5)).toBe('5%')
  })
  it('takes first names', () => {
    expect(firstName('Ana Silva')).toBe('Ana')
    expect(firstName(undefined)).toBe('—')
  })
})
