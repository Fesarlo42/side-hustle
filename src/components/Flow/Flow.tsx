'use client'
import { Badge, Icon } from '@iubenda/lumen-next'
import { useMemo } from 'react'
import { CountUp } from '@/components/ui/CountUp'
import { Empty, Panel } from '@/components/ui/ui'
import { SECTION_LABEL } from '@/data/mock/text'
import { duration, firstName } from '@/lib/format'
import {
  PIPELINE,
  SIDE_LANES,
  avgOpenToDone,
  avgTimeInSection,
  bottlenecks,
  sectionCounts,
  stuckTasks,
} from '@/store/selectors'
import { useData } from '@/store/store'
import { color } from '@/theme'
import type { Section } from '@/types'

function Column({
  section,
  count,
  avg,
  bottleneck,
  link = false,
}: {
  section: Section
  count: number
  avg?: number
  bottleneck: boolean
  /** Draw a moving connector to the next stage. */
  link?: boolean
}) {
  return (
    <li
      aria-label={`${SECTION_LABEL[section]}: ${count}`}
      style={{
        listStyle: 'none',
        padding: '10px 12px',
        borderRadius: 12,
        border: `2px solid ${bottleneck ? color.warningStrong : color.border}`,
        background: bottleneck ? color.warningSubtle : color.surfaceSubtle,
        display: 'grid',
        gap: 2,
        minWidth: 0,
        position: 'relative',
      }}
    >
      {link && <span className="sh-flow-link" aria-hidden />}
      <span style={{ fontWeight: 600 }}>{SECTION_LABEL[section]}</span>
      <span className="sh-big">
        <CountUp value={count} />
      </span>
      <span className="sh-muted" style={{ fontSize: 14 }}>
        {avg !== undefined ? `avg ${duration(avg)}` : section === 'done' ? 'this week' : 'avg —'}
      </span>
      {bottleneck && (
        <span style={{ color: color.warningStrong, fontWeight: 700, fontSize: 14 }}>
          <Icon name="warning" size="sm" /> Bottleneck
        </span>
      )}
    </li>
  )
}

export function Flow() {
  const data = useData()
  const counts = useMemo(() => sectionCounts(data), [data])
  const avg = useMemo(() => avgTimeInSection(data), [data])
  const total = useMemo(() => avgOpenToDone(data), [data])
  const slow = useMemo(() => bottlenecks(data), [data])
  const stuck = useMemo(() => stuckTasks(data), [data])

  return (
    <Panel
      id="flow"
      title="Flow"
      aside={<span className="sh-muted">Asana sections · this week</span>}
    >
      <div
        style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 16, alignItems: 'start' }}
        className="sh-flow"
      >
        <ol
          aria-label="Pipeline"
          style={{
            margin: 0,
            padding: 0,
            display: 'grid',
            gridTemplateColumns: `repeat(${PIPELINE.length}, minmax(0, 1fr))`,
            gap: 8,
          }}
        >
          {PIPELINE.map((s, i) => (
            <Column
              key={s}
              link={i < PIPELINE.length - 1}
              section={s}
              count={counts[s]}
              avg={s === 'done' ? undefined : avg[s]}
              bottleneck={slow.has(s)}
            />
          ))}
        </ol>
        <ul
          aria-label="Side lanes"
          style={{
            margin: 0,
            padding: 0,
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(110px, 1fr))',
            gap: 8,
          }}
        >
          {SIDE_LANES.map((s) => (
            <Column key={s} section={s} count={counts[s]} avg={avg[s]} bottleneck={slow.has(s)} />
          ))}
        </ul>
      </div>
      <p style={{ margin: '12px 0' }}>
        <span className="sh-muted">Open → Done, on average: </span>
        <strong className="sh-num">{total !== undefined ? duration(total) : '—'}</strong>
      </p>
      <h3 style={{ margin: '8px 0', fontSize: 17 }}>Stalled and orphaned</h3>
      {stuck.length === 0 ? (
        <Empty>Nothing stalled or orphaned. Every task has a live agent or an answer.</Empty>
      ) : (
        <ul
          aria-label="Stalled and orphaned tasks"
          style={{ margin: 0, padding: 0, display: 'grid', gap: 6 }}
        >
          {stuck.map(({ task, sinceMs }) => (
            <li
              key={task.id}
              style={{
                listStyle: 'none',
                display: 'flex',
                gap: 8,
                alignItems: 'center',
                flexWrap: 'wrap',
              }}
            >
              <Badge variant="destructive">
                {task.flag === 'orphaned'
                  ? `Orphaned · no heartbeat for ${duration(sinceMs)}`
                  : `Stalled · ${duration(sinceMs)} since the owner’s reminder`}
              </Badge>
              <strong>{task.title}</strong>
              <span className="sh-muted">
                {task.flag === 'orphaned'
                  ? `${firstName(data.members[task.pickerId ?? '']?.name)}’s agent`
                  : `waiting on ${firstName(data.members[task.ownerId]?.name)}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}
