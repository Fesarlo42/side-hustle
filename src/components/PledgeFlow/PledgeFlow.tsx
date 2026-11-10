'use client'
import { Segment, Segmented } from '@iubenda/lumen-next'
import { sankey, sankeyLinkHorizontal, type SankeyLink, type SankeyNode } from 'd3-sankey'
import { useMemo, useState } from 'react'
import { Bar, Empty, Panel } from '@/components/ui/ui'
import { firstName, pct } from '@/lib/format'
import {
  OTHERS,
  pickerOwnerLinks,
  usageByProject,
  usageByTeam,
  type FlowLink,
} from '@/store/selectors'
import { useData, useDash } from '@/store/store'
import { color } from '@/theme'

type By = 'project' | 'team'

interface N {
  id: string
  memberId: string
  side: 'picker' | 'owner'
}
interface L {
  source: string
  target: string
  value: number
  key: string
  pickerId: string
  ownerId: string
}

const W = 560
const H = 300
const LABEL = 110

function Bars({ by }: { by: By }) {
  const data = useData()
  const rows = useMemo(
    () =>
      by === 'project'
        ? usageByProject(data).map((r) => ({
            key: r.projectId,
            label: data.projects[r.projectId]?.name ?? r.projectId,
            value: r.usedPct,
          }))
        : usageByTeam(data).map((r) => ({ key: r.team, label: r.team, value: r.usedPct })),
    [data, by],
  )
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <ul
      aria-label={`Pledge used by ${by}`}
      style={{ margin: 0, padding: 0, display: 'grid', gap: 8 }}
    >
      {rows.map((r) => (
        <li
          key={r.key}
          style={{
            listStyle: 'none',
            display: 'grid',
            gridTemplateColumns: '1fr auto',
            gap: '2px 12px',
          }}
        >
          <span>{r.label}</span>
          <strong className="sh-num">{pct(r.value, 1)}</strong>
          <span style={{ gridColumn: '1 / -1' }} aria-hidden>
            <Bar value={r.value} max={max} label={`${r.label}: ${pct(r.value, 1)}`} height={8} />
          </span>
        </li>
      ))}
    </ul>
  )
}

function Sankey({ links }: { links: FlowLink[] }) {
  const data = useData()
  const selected = useDash((s) => s.selectedMemberId)
  const name = (id: string) => (id === OTHERS ? 'Others' : (data.members[id]?.name ?? id))

  const graph = useMemo(() => {
    const nodes = new Map<string, N>()
    const ls: L[] = []
    for (const l of links) {
      const s = `p:${l.pickerId}`
      const t = `o:${l.ownerId}`
      nodes.set(s, { id: s, memberId: l.pickerId, side: 'picker' })
      nodes.set(t, { id: t, memberId: l.ownerId, side: 'owner' })
      ls.push({
        source: s,
        target: t,
        value: l.usedPct,
        key: `${l.pickerId}>${l.ownerId}`,
        pickerId: l.pickerId,
        ownerId: l.ownerId,
      })
    }
    const layout = sankey<N, L>()
      .nodeId((d) => d.id)
      .nodeWidth(12)
      .nodePadding(10)
      .extent([
        [LABEL, 6],
        [W - LABEL, H - 6],
      ])
    return layout({
      nodes: [...nodes.values()].map((n) => ({ ...n })),
      links: ls.map((l) => ({ ...l })),
    })
  }, [links])

  const path = sankeyLinkHorizontal<N, L>()
  const lit = (l: SankeyLink<N, L>) =>
    !selected || l.pickerId === selected || l.ownerId === selected

  return (
    <>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Pledge flowing from pickers to owners. Details in the table below."
        style={{ width: '100%', height: 'auto' }}
      >
        <text x={4} y={14} fontSize={13} fill={color.textSecondary}>
          Pledge from
        </text>
        <text x={W - 4} y={14} fontSize={13} fill={color.textSecondary} textAnchor="end">
          Task owner
        </text>
        {graph.links.map((l) => (
          <path
            key={l.key}
            data-link={l.key}
            data-lit={String(lit(l))}
            d={path(l) ?? undefined}
            fill="none"
            stroke={color.action}
            strokeOpacity={lit(l) ? 0.35 : 0.08}
            strokeWidth={Math.max(1, l.width ?? 1)}
            style={{ transition: 'stroke-opacity 0.6s ease-in-out' }}
          >
            <title>{`${name(l.pickerId)} → ${name(l.ownerId)}: ${pct(l.value, 1)}`}</title>
          </path>
        ))}
        {graph.nodes.map((n: SankeyNode<N, L>) => {
          const x0 = n.x0 ?? 0
          const x1 = n.x1 ?? 0
          const y0 = n.y0 ?? 0
          const y1 = n.y1 ?? 0
          const left = n.side === 'picker'
          return (
            <g key={n.id}>
              <rect
                x={x0}
                y={y0}
                width={x1 - x0}
                height={Math.max(1, y1 - y0)}
                fill={color.action}
                rx={2}
              />
              <text
                x={left ? x0 - 6 : x1 + 6}
                y={(y0 + y1) / 2 + 5}
                fontSize={14}
                textAnchor={left ? 'end' : 'start'}
                fill={color.text}
              >
                {n.memberId === OTHERS ? 'Others' : firstName(name(n.memberId))}
              </text>
            </g>
          )
        })}
      </svg>
      <table aria-label="Picker to owner" className="sh-sr">
        <thead>
          <tr>
            <th>Pledge from</th>
            <th>Task owner</th>
            <th>Used</th>
          </tr>
        </thead>
        <tbody>
          {links.map((l) => (
            <tr key={`${l.pickerId}>${l.ownerId}`}>
              <td>{name(l.pickerId)}</td>
              <td>{name(l.ownerId)}</td>
              <td>{pct(l.usedPct, 1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

export function PledgeFlow() {
  const data = useData()
  const [by, setBy] = useState<By>('project')
  const links = useMemo(() => pickerOwnerLinks(data, 8), [data])

  return (
    <Panel
      id="pledges"
      title="Where pledges go"
      aside={
        <Segmented label="Group" size="sm" value={by} onChange={({ value }) => setBy(value as By)}>
          <Segment value="project">By project</Segment>
          <Segment value="team">By team</Segment>
        </Segmented>
      }
    >
      {links.length === 0 ? (
        <Empty>
          No pledge used yet this week. It shows up here as soon as an agent starts a task.
        </Empty>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(200px, 1fr) minmax(300px, 1.6fr)',
            gap: 20,
            alignItems: 'start',
          }}
        >
          <Bars by={by} />
          <Sankey links={links} />
        </div>
      )}
    </Panel>
  )
}
