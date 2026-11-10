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
} as const

/** Core tint per health state: fill, stroke (strong, for contrast) and a soft halo. */
export const healthTint: Record<Health, { fill: string; stroke: string; soft: string }> = {
  calm: { fill: v('blue-500'), stroke: v('blue-900'), soft: v('blue-50') },
  strained: { fill: v('yellow-500'), stroke: v('yellow-900'), soft: v('yellow-100') },
  critical: { fill: v('red-500'), stroke: v('red-800'), soft: v('red-100') },
}

export const font = {
  body: v('font-body'),
} as const
