'use client'
import { Icon } from '@iubenda/lumen-next'
import type { IconName } from '@iubenda/lumen'
import { AnimatePresence, motion as m } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { useReducedMotionPref } from '@/hooks/useReducedMotionPref'
import { useDash } from '@/store/store'
import { color } from '@/theme'
import type { DashEvent, EventType } from '@/types'

/** Events worth a pop-up. Everything is still in the activity log. */
const NOTABLE: Partial<Record<EventType, IconName>> = {
  'task.claimed': 'play',
  'task.released': 'arrow-counter-clockwise',
  'task.approved': 'check-circle',
  'review.failed': 'x-circle',
  'task.flagged': 'warning',
  'pledge.answered': 'chart-line',
  'insight.opened': 'info',
  'insight.resolved': 'check',
  'task.published': 'plus',
}
const SHOW_MS = 6000
const MAX = 3

const boxStyle = { display: 'grid', gap: 8, alignContent: 'start', minHeight: 150 } as const
const pillStyle = {
  display: 'flex',
  gap: 10,
  alignItems: 'center',
  padding: '8px 14px',
  borderRadius: 999,
  background: color.surface,
  border: `1px solid ${color.border}`,
  boxShadow: '0 10px 30px -18px rgb(43 11 216 / 45%)',
  fontSize: 15,
  lineHeight: 1.3,
} as const

function Pill({ e }: { e: DashEvent }) {
  return (
    <>
      <Icon name={NOTABLE[e.type] ?? 'info'} size="sm" />
      <span>{e.text}</span>
    </>
  )
}

/** Live pop-ups for what just happened. */
export function EventToasts() {
  const events = useDash((s) => s.events)
  const reduced = useReducedMotionPref()
  const [toasts, setToasts] = useState<DashEvent[]>([])
  const seen = useRef<Set<string> | null>(null)
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  useEffect(() => {
    // The first render only remembers what was already there.
    if (seen.current === null) {
      seen.current = new Set(events.map((e) => e.id))
      return
    }
    const known = seen.current
    const notable = events.filter((e) => !known.has(e.id) && NOTABLE[e.type])
    for (const e of events) known.add(e.id)
    if (notable.length === 0) return
    setToasts((t) => [...t, ...notable].slice(-MAX))
    // Each toast expires on its own timer, so new events don't keep old ones alive.
    for (const e of notable)
      timers.current.set(
        e.id,
        setTimeout(() => {
          timers.current.delete(e.id)
          setToasts((t) => t.filter((x) => x.id !== e.id))
        }, SHOW_MS),
      )
  }, [events])

  useEffect(() => {
    const all = timers.current
    return () => all.forEach((t) => clearTimeout(t))
  }, [])

  return (
    <div role="status" aria-label="Latest events" aria-live="polite" style={boxStyle}>
      {reduced ? (
        toasts.map((e) => (
          <div key={e.id} style={pillStyle}>
            <Pill e={e} />
          </div>
        ))
      ) : (
        <AnimatePresence initial={false}>
          {toasts.map((e) => (
            <m.div
              key={e.id}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24 }}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              style={pillStyle}
            >
              <Pill e={e} />
            </m.div>
          ))}
        </AnimatePresence>
      )}
    </div>
  )
}
