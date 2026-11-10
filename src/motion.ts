/** Our motion tokens (Lumen has none). */
export const motion = {
  fast: { duration: 0.15, ease: 'easeOut' },
  base: { duration: 0.25, ease: 'easeOut' },
  slow: { duration: 0.6, ease: 'easeInOut' },
} as const

export const breath = {
  /** Seconds per cycle at rest. */
  idle: 4,
  /** Seconds per cycle at peak activity. */
  busy: 1,
} as const
