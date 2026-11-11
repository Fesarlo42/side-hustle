'use client'
import type { CSSProperties } from 'react'
import { targetPeriod } from '@/components/Core/Core'
import { CorePanel } from '@/components/Core/CorePanel'
import { KpiLeft, KpiRight } from '@/components/KpiStrip/KpiStrip'
import { useReducedMotionPref } from '@/hooks/useReducedMotionPref'
import { useDash } from '@/store/store'
import { EventToasts } from './EventToasts'
import { healthTint } from '@/theme'

/**
 * Everything above the fold: the core with the key numbers either side.
 * Behind it, an aura in the health colour breathes at the core's own pace,
 * and a slow sweep circles it, so the whole band feels alive.
 */
export function Hero() {
  const health = useDash((s) => s.pulse?.health ?? 'calm')
  const heartbeats = useDash((s) => s.pulse?.heartbeatsPerMin ?? 0)
  const reduced = useReducedMotionPref()
  const tint = healthTint[health]
  const style = {
    '--sh-breath': `${targetPeriod(heartbeats, health).toFixed(2)}s`,
    '--sh-tint': tint.fill,
    '--sh-tint-soft': tint.soft,
  } as CSSProperties

  return (
    <section
      className={`sh-hero${reduced ? ' is-still' : ''}`}
      aria-label="Right now"
      data-health={health}
      style={style}
    >
      <div className="sh-top sh-hero__grid">
        <KpiLeft />
        <CorePanel />
        <div className="sh-hero__right">
          <KpiRight />
          <EventToasts />
        </div>
      </div>
      <a className="sh-hero__more" href="#details">
        Work, people and flow <span aria-hidden>↓</span>
      </a>
    </section>
  )
}
