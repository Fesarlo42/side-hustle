import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(path.join(import.meta.dirname, '..', 'app', 'globals.css'), 'utf8')
const value = (token: string) => new RegExp(`--lumen-${token}:\\s*([^;]+);`, 'g')
const last = (token: string) => [...css.matchAll(value(token))].at(-1)?.[1]?.trim().toLowerCase()

describe('blues follow the banner indigo', () => {
  it('retunes Lumen’s blue scale around #2B0BD8', () => {
    expect(last('blue-500')).toBe('#2b0bd8')
    for (const step of ['25', '50', '100', '600', '900', '950']) expect(last(`blue-${step}`)).toMatch(/^#[0-9a-f]{6}$/)
  })
})
