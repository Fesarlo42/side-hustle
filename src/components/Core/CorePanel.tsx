'use client'
import { useMemo } from 'react'
import { Core } from './Core'
import { useReducedMotionPref } from '@/hooks/useReducedMotionPref'
import { coreInputs, kpis } from '@/store/selectors'
import { focusRef, useData, useDash } from '@/store/store'

const WORD = { calm: 'Calm', strained: 'Strained', critical: 'Critical' } as const

/** The core plus its status line (ready-made by the source). */
export function CorePanel() {
  const data = useData()
  const selected = useDash((s) => s.selectedMemberId)
  const reduced = useReducedMotionPref()
  const inputs = useMemo(() => coreInputs(data), [data])
  const k = useMemo(() => kpis(data), [data])
  const members = useMemo(
    () => inputs.members.map((m) => ({ ...m, name: data.members[m.id]?.name ?? m.id })),
    [inputs, data.members],
  )
  const pulse = data.pulse
  if (!pulse) return null
  const n = k.tasksInFlight
  const label = `${WORD[pulse.health]} · ${n} ${n === 1 ? 'task' : 'tasks'} in flight · pool ${Math.round(k.poolLeftRatio * 100)}% free`

  return (
    <div className="sh-core" style={{ display: 'grid', justifyItems: 'center', gap: 12 }}>
      <div style={{ width: 'min(100%, 460px)' }}>
        <Core
          heartbeatsPerMin={inputs.heartbeatsPerMin}
          poolLeft={inputs.poolLeft}
          health={inputs.health}
          members={members}
          flows={inputs.flows}
          rippleSeq={data.rippleSeq}
          wobble={inputs.wobble}
          reducedMotion={reduced}
          label={label}
          selectedMemberId={selected}
        />
      </div>
      <p
        role="status"
        aria-live="polite"
        style={{ margin: 0, fontSize: 20, fontWeight: 600, textAlign: 'center', maxWidth: 620 }}
      >
        {pulse.statusRef ? (
          <button
            className="sh-linkbtn"
            onClick={() => focusRef(pulse.statusRef)}
            title="Show what this is about"
          >
            {pulse.statusLine}
          </button>
        ) : (
          pulse.statusLine
        )}
      </p>
    </div>
  )
}
