'use client'
import { useMemo } from 'react'
import { Avatar, Empty, Panel } from '@/components/ui/ui'
import { leaderboard, type Ranked } from '@/store/selectors'
import { useData } from '@/store/store'

function List({ label, items, unit }: { label: string; items: Ranked[]; unit?: string }) {
  const data = useData()
  return (
    <div>
      <h3 style={{ margin: '0 0 8px', fontSize: 17 }}>{label}</h3>
      {items.length === 0 ? (
        <Empty>No one yet.</Empty>
      ) : (
        <ol aria-label={label} style={{ margin: 0, padding: 0, display: 'grid', gap: 6 }}>
          {items.map((r) => {
            const m = data.members[r.memberId]
            return (
              <li
                key={r.memberId}
                style={{ listStyle: 'none', display: 'flex', alignItems: 'center', gap: 8 }}
              >
                <Avatar member={m} size={26} />
                <span style={{ flex: 1, minWidth: 0 }}>{m?.name ?? r.memberId}</span>
                <strong className="sh-num">
                  {r.value}
                  {unit ?? ''}
                </strong>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}

/** Top 5 only: friendly, not competitive. */
export function Leaderboard() {
  const data = useData()
  const lb = useMemo(() => leaderboard(data), [data])
  return (
    <Panel
      id="leaderboard"
      title="Leaderboard"
      aside={<span className="sh-muted">Top 5 this week</span>}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: 24,
        }}
      >
        <List label="Published" items={lb.published} />
        <List label="Picked up" items={lb.pickedUp} />
        <List label="Completed" items={lb.completed} />
        <List label="Biggest pledges" items={lb.pledges} unit="%" />
      </div>
    </Panel>
  )
}
