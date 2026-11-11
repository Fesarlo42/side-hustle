'use client'
import { AnimatePresence, motion as m } from 'framer-motion'
import { useMemo } from 'react'
import { Core } from './Core'
import { useNow } from '@/hooks/useNow'
import { useReducedMotionPref } from '@/hooks/useReducedMotionPref'
import { ago } from '@/lib/format'
import { motion } from '@/motion'
import { coreInputs, kpis } from '@/store/selectors'
import { focusRef, useData, useDash } from '@/store/store'

const WORD = { calm: 'Calm', strained: 'Strained', critical: 'Critical' } as const

/** The core, its status line (ready-made by the source) and the latest thing that happened. */
export function CorePanel() {
  const data = useData()
  const selected = useDash((s) => s.selectedMemberId)
  const reduced = useReducedMotionPref()
  const now = useNow(15_000)
  const inputs = useMemo(() => coreInputs(data), [data])
  const k = useMemo(() => kpis(data), [data])
  const members = useMemo(
    () =>
      inputs.members.map((mm) => ({
        ...mm,
        name: data.members[mm.id]?.name ?? mm.id,
        avatarUrl: data.members[mm.id]?.avatarUrl,
      })),
    [inputs, data.members],
  )
  const latest = useMemo(
    () => [...data.events].reverse().find((e) => e.type !== 'task.heartbeat'),
    [data.events],
  )
  const pulse = data.pulse
  if (!pulse) return null
  const n = k.tasksInFlight
  const label = `${WORD[pulse.health]} · ${n} ${n === 1 ? 'task' : 'tasks'} in flight · pool ${Math.round(k.poolLeftRatio * 100)}% free`
  const simNow = Date.parse(pulse.at) || now

  return (
    <div className="sh-core">
      <div className="sh-core__fig">
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
      <p role="status" aria-live="polite" className="sh-core__status">
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
      {latest && (
        <div className="sh-ticker" aria-label="Latest">
          <span className="sh-ticker__k">Latest</span>
          <AnimatePresence mode="wait" initial={false}>
            <m.span
              key={latest.id}
              className="sh-ticker__v"
              initial={reduced ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduced ? undefined : { opacity: 0, y: -12 }}
              transition={motion.base}
            >
              {latest.text}
              <span className="sh-ticker__t"> · {ago(latest.at, simNow)}</span>
            </m.span>
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}
