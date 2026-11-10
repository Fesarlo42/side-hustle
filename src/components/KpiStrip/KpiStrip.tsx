'use client'
import { useShallow } from 'zustand/react/shallow'
import { Tooltip } from '@iubenda/lumen-next'
import type { ReactNode } from 'react'
import { CountUp } from '@/components/ui/CountUp'
import { dayTime } from '@/lib/format'
import { kpis } from '@/store/selectors'
import { useDash } from '@/store/store'

function Kpi({
  label,
  value,
  unit,
  note,
  hint,
}: {
  label: string
  value: ReactNode
  unit?: string
  note?: string
  hint?: string
}) {
  const body = (
    <div className="sh-panel" style={{ padding: '14px 18px' }}>
      <div className="sh-muted">{label}</div>
      <div className="sh-big">
        {value}
        {unit && <span style={{ fontSize: 18, fontWeight: 400 }}> {unit}</span>}
      </div>
      {note && (
        <div className="sh-muted" style={{ fontSize: 14 }}>
          {note}
        </div>
      )}
    </div>
  )
  return hint ? <Tooltip content={hint}>{body}</Tooltip> : body
}

export function KpiLeft() {
  const k = useDash(useShallow(kpis))
  return (
    <div style={{ display: 'grid', gap: 12 }} aria-label="Key numbers">
      <Kpi
        label="People in the pool"
        value={<CountUp value={k.people} />}
        note={`${k.giving} giving this week`}
      />
      <Kpi
        label="Pledge left"
        value={<CountUp value={k.pledgeLeftSeatWeeks} digits={1} />}
        unit="seat-weeks"
        note="100% of one weekly limit = 1 seat-week"
      />
      <Kpi
        label="Pledge used this week"
        value={<CountUp value={k.pledgeUsedSeatWeeks} digits={1} />}
        unit="seat-weeks"
        note="On other people's tasks"
      />
    </div>
  )
}

export function KpiRight() {
  const k = useDash(useShallow(kpis))
  const resetAt = useDash((s) => s.week?.resetAt)
  return (
    <div style={{ display: 'grid', gap: 12 }} aria-label="Key numbers">
      <Kpi
        label="Tasks in flight"
        value={<CountUp value={k.tasksInFlight} />}
        note="In Doing or To Review"
      />
      <Kpi
        label="Unused at reset"
        value={<CountUp value={k.leftAtResetPct} />}
        unit="% of pool"
        note={`Forecast · resets ${resetAt ? dayTime(resetAt) : 'soon'}`}
        hint="Pledge expected to go unused when weekly limits reset, at this week's pace. Unused pledge doesn't carry over."
      />
    </div>
  )
}
