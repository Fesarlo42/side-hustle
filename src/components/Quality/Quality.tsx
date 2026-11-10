'use client'
import { useMemo } from 'react'
import { Bar, Panel } from '@/components/ui/ui'
import { quality } from '@/store/selectors'
import { useData } from '@/store/store'
import type { ReviewCheck, TaskSize } from '@/types'

const CHECKS: { check: ReviewCheck; label: string }[] = [
  { check: 'compliance', label: 'Acceptance criteria' },
  { check: 'scope', label: 'Scope' },
  { check: 'non_destructive', label: 'Non-destructive' },
  { check: 'harness', label: 'Tests and lint' },
]
const SIZES: TaskSize[] = ['S', 'M', 'L']
const BUDGET: Record<TaskSize, string> = { S: '2%', M: '5%', L: '10%' }
const pc = (r: number) => `${Math.round(r * 100)}%`

const row = {
  listStyle: 'none',
  display: 'grid',
  gridTemplateColumns: '1fr auto',
  gap: '2px 12px',
  alignItems: 'center',
} as const

export function Quality() {
  const data = useData()
  const q = useMemo(() => quality(data), [data])
  const maxFail = Math.max(1, ...Object.values(q.failuresByCheck))

  return (
    <Panel id="quality" title="Quality" aside={<span className="sh-muted">This week</span>}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div>
          <div className="sh-muted">First-pass approval</div>
          <div className="sh-big">{pc(q.firstPassApproval)}</div>
          <div className="sh-muted" style={{ fontSize: 14 }}>
            {q.doneCount - Math.round(q.doneCount * (1 - q.firstPassApproval))} of {q.doneCount}{' '}
            approved without being sent back
          </div>
        </div>
        <div>
          <div className="sh-muted">Sent back to Next</div>
          <div className="sh-big">{q.rejections}</div>
          <div className="sh-muted" style={{ fontSize: 14 }}>
            Owner rejections, with notes in Asana
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 20,
        }}
      >
        <div>
          <h3 style={{ margin: '0 0 8px', fontSize: 17 }}>Reviewer failures</h3>
          <ul
            aria-label="Reviewer failures by check"
            style={{ margin: 0, padding: 0, display: 'grid', gap: 8 }}
          >
            {CHECKS.map(({ check, label }) => (
              <li key={check} style={row}>
                <span>{label}</span>
                <strong className="sh-num">{q.failuresByCheck[check]}</strong>
                <span style={{ gridColumn: '1 / -1' }}>
                  <Bar
                    value={q.failuresByCheck[check]}
                    max={maxFail}
                    label={`${label}: ${q.failuresByCheck[check]} failures`}
                    height={6}
                  />
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 style={{ margin: '0 0 8px', fontSize: 17 }}>Over budget</h3>
          <ul
            aria-label="Over budget by size"
            style={{ margin: 0, padding: 0, display: 'grid', gap: 8 }}
          >
            {SIZES.map((size) => {
              const { over, total } = q.overBudgetBySize[size]
              const ratio = total > 0 ? over / total : 0
              return (
                <li key={size} style={row}>
                  <span>
                    {size} <span className="sh-muted">({BUDGET[size]})</span>
                  </span>
                  <strong className="sh-num">
                    {over} of {total} · {pc(ratio)}
                  </strong>
                  <span style={{ gridColumn: '1 / -1' }}>
                    <Bar
                      value={over}
                      max={Math.max(1, total)}
                      over={ratio >= 0.5}
                      label={`${size} tasks over budget: ${over} of ${total}`}
                      height={6}
                    />
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
        <div>
          <h3 style={{ margin: '0 0 8px', fontSize: 17 }}>Success by model</h3>
          <ul
            aria-label="First-pass success by model"
            style={{ margin: 0, padding: 0, display: 'grid', gap: 8 }}
          >
            {q.successByModel.map((m) => (
              <li key={m.model} style={row}>
                <span>{m.model}</span>
                <strong className="sh-num">
                  {pc(m.rate)} · {m.total} {m.total === 1 ? 'task' : 'tasks'}
                </strong>
                <span style={{ gridColumn: '1 / -1' }}>
                  <Bar
                    value={m.rate}
                    max={1}
                    label={`${m.model}: ${pc(m.rate)} first-pass success`}
                    height={6}
                  />
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Panel>
  )
}
