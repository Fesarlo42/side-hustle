import { describe, expect, it } from 'vitest'
import { sourceKind } from '@/server/source'

describe('data source choice', () => {
  it('uses the real Asana project by default', () => {
    expect(sourceKind({})).toBe('asana')
  })
  it('can still run the scripted mock demo', () => {
    expect(sourceKind({ SIDE_HUSTLE_SOURCE: 'mock' })).toBe('mock')
  })
  it('ignores case and spaces', () => {
    expect(sourceKind({ SIDE_HUSTLE_SOURCE: ' Mock ' })).toBe('mock')
  })
})
