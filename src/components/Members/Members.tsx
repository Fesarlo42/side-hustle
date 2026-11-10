'use client'
import {
  Badge,
  Segment,
  Segmented,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from '@iubenda/lumen-next'
import type { BadgeVariant } from '@iubenda/lumen'
import { useMemo, useState } from 'react'
import { Avatar, IconText, Panel } from '@/components/ui/ui'
import { pct } from '@/lib/format'
import { leftPct, sortedMembers, type MemberSort } from '@/store/selectors'
import { useData, useDash } from '@/store/store'
import { color } from '@/theme'
import type { Member, MemberStatus, PledgeSource } from '@/types'

const ANSWER: Record<PledgeSource, { text: string; variant: BadgeVariant }> = {
  answered: { text: 'Answered', variant: 'success' },
  carried_over: { text: 'Carried over', variant: 'neutral' },
  pending: { text: 'Waiting', variant: 'warning' },
  default_zero: { text: 'New · 0%', variant: 'info' },
}

const STATUS: Record<
  MemberStatus,
  { text: string; icon: 'play' | 'clock' | 'x-circle'; tone: string }
> = {
  working: { text: 'Working', icon: 'play', tone: color.successStrong },
  idle: { text: 'Idle', icon: 'clock', tone: color.textSecondary },
  offline: { text: 'Offline', icon: 'x-circle', tone: color.dangerStrong },
}

function PledgeCell({ m }: { m: Member }) {
  const changed = m.pledgePrevPct !== undefined && m.pledgePrevPct !== m.pledgePct
  const ratio = m.pledgePct > 0 ? Math.min(1, m.pledgeUsedPct / m.pledgePct) : 0
  return (
    <div style={{ display: 'grid', gap: 4, minWidth: 120 }}>
      <span className="sh-num">
        <strong>{pct(m.pledgePct)}</strong>
        {changed && (
          <span
            title={`Changed this week (was ${m.pledgePrevPct}%)`}
            style={{ marginLeft: 6, color: color.action }}
          >
            ▲ changed
          </span>
        )}
      </span>
      {/* Used is a fill inside the pledge */}
      <div
        role="meter"
        aria-label={`${m.name}: ${pct(m.pledgeUsedPct, 1)} of ${pct(m.pledgePct)} used`}
        aria-valuenow={m.pledgeUsedPct}
        aria-valuemin={0}
        aria-valuemax={m.pledgePct}
        style={{ height: 10, borderRadius: 10, background: color.mutedSubtle, overflow: 'hidden' }}
      >
        <div
          style={{
            width: `${ratio * 100}%`,
            height: '100%',
            background: color.action,
            transition: 'width 0.25s ease-out',
          }}
        />
      </div>
      <span className="sh-muted sh-num" style={{ fontSize: 14 }}>
        {pct(m.pledgeUsedPct, m.pledgeUsedPct % 1 === 0 ? 0 : 1)} used
      </span>
    </div>
  )
}

export function Members() {
  const data = useData()
  const [sort, setSort] = useState<MemberSort>('left')
  const selected = useDash((s) => s.selectedMemberId)
  const select = useDash((s) => s.selectMember)
  const members = useMemo(() => sortedMembers(data, sort), [data, sort])

  return (
    <Panel
      id="members"
      title={`Members (${members.length})`}
      aside={
        <Segmented
          label="Sort by"
          size="sm"
          value={sort}
          onChange={({ value }) => setSort(value as MemberSort)}
        >
          <Segment value="left">Left</Segment>
          <Segment value="pledge">Pledge</Segment>
          <Segment value="name">Name</Segment>
        </Segmented>
      }
    >
      <div style={{ overflowX: 'auto' }}>
        <Table label="Members of the pool">
          <TableHead>
            <TableRow>
              <TableCell>Person</TableCell>
              <TableCell>Pledge</TableCell>
              <TableCell align="end">Left</TableCell>
              <TableCell>Answer</TableCell>
              <TableCell>Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {members.map((m) => {
              const isSel = selected === m.id
              const status = STATUS[m.status]
              return (
                <TableRow key={m.id} className={selected && !isSel ? 'sh-dim' : 'sh-lit'}>
                  <TableCell>
                    <span
                      id={`member-${m.id}`}
                      style={{ display: 'flex', alignItems: 'center', gap: 10 }}
                    >
                      <Avatar member={m} />
                      <span style={{ display: 'grid' }}>
                        <button
                          className="sh-linkbtn"
                          aria-pressed={isSel}
                          onClick={() => select(m.id)}
                          style={{ fontWeight: 700 }}
                        >
                          {m.name}
                        </button>
                        <span className="sh-muted" style={{ fontSize: 14 }}>
                          {m.team}
                        </span>
                      </span>
                    </span>
                  </TableCell>
                  <TableCell>
                    <PledgeCell m={m} />
                  </TableCell>
                  <TableCell align="end">
                    <strong className="sh-num">
                      {pct(leftPct(m), leftPct(m) % 1 === 0 ? 0 : 1)}
                    </strong>
                  </TableCell>
                  <TableCell>
                    <Badge variant={ANSWER[m.pledgeSource].variant}>
                      {ANSWER[m.pledgeSource].text}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <IconText icon={status.icon} tone={status.tone}>
                      {status.text}
                    </IconText>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </Panel>
  )
}
