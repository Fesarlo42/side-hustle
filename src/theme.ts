/**
 * The only place colours live. Every value maps a Lumen token, so brand and
 * theme overrides flow through. Light theme only.
 */
import type { Health } from '@/types'

const v = (token: string) => `var(--lumen-${token})`

export const color = {
  surface: v('color-surface-default'),
  surfaceSubtle: v('color-surface-subtle'),
  surfaceRaised: v('color-surface-raised'),
  text: v('color-text-primary'),
  textSecondary: v('neutral-700'),
  border: v('color-border-default'),
  borderSubtle: v('color-border-subtle'),
  borderStrong: v('color-border-strong'),
  action: v('color-action-primary'),
  actionSubtle: v('blue-25'),
  success: v('green-500'),
  successStrong: v('green-900'),
  successSubtle: v('green-200'),
  warning: v('yellow-500'),
  warningStrong: v('yellow-900'),
  warningSubtle: v('yellow-100'),
  danger: v('red-500'),
  dangerStrong: v('red-800'),
  dangerSubtle: v('red-100'),
  muted: v('neutral-500'),
  mutedSubtle: v('neutral-100'),
  /** Header band and hero wash. */
  brand: v('blue-500'),
  brandDeep: v('blue-900'),
  brandNight: v('blue-950'),
  onBrand: v('neutral-0'),
  heroWash: v('blue-50'),
  lavender: v('lavender-100'),
} as const

/** Core tint per health state: fill, stroke (strong, for contrast) and a soft halo. */
export const healthTint: Record<Health, { fill: string; stroke: string; soft: string }> = {
  calm: { fill: '#2B0BD8', stroke: '#14075E', soft: '#EFECFF' },
  strained: { fill: v('yellow-500'), stroke: v('yellow-900'), soft: v('yellow-100') },
  critical: { fill: v('red-500'), stroke: v('red-800'), soft: v('red-100') },
}

export const font = {
  body: v('font-body'),
} as const

/**
 * Accent palette: softer, jewel-toned colours beside Lumen's brand blue, so
 * teams and sections don't read as primary blue / green / red / yellow.
 * Outside Lumen on purpose; this is the only place these values live.
 */
export const accent = {
  indigo: '#2B0BD8',
  mint: '#1FC9A3',
  violet: '#7B61FF',
  cyan: '#00B4D8',
  pink: '#FF5FA2',
  amber: '#FFB020',
  lavender: '#A99BFF',
  teal: '#0E8F7E',
} as const

/** The "You Token to Me?" brand: electric indigo, mint and white. */
export const brand = {
  indigo: '#2B0BD8',
  mint: '#5CEFCB',
  mintDeep: '#1FC9A3',
  night: '#14075E',
  lilac: '#F4F2FF',
} as const

/** Team (department) colours. Teams are always named too. */
export const teamPalette = [
  accent.indigo,
  accent.mint,
  accent.pink,
  accent.amber,
  accent.violet,
  accent.cyan,
  accent.lavender,
  accent.teal,
] as const
