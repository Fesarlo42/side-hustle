'use client'
import { Segment, Segmented } from '@iubenda/lumen-next'
import { motion as m } from 'framer-motion'
import { useMemo, useState } from 'react'
import { initials } from '@/components/Core/Core'
import { IconText, Panel } from '@/components/ui/ui'
import { useReducedMotionPref } from '@/hooks/useReducedMotionPref'
import { pct } from '@/lib/format'
import { useTeamColors } from '@/lib/teams'
import { leftPct, sortedMembers, type MemberSort } from '@/store/selectors'
import { useData, useDash } from '@/store/store'
import { color } from '@/theme'
import type { Member, MemberStatus } from '@/types'

const STATUS: Record<
  MemberStatus,
  { text: string; icon: 'play' | 'clock' | 'x-circle'; tone: string }
> = {
  working: { text: 'Working', icon: 'play', tone: color.successStrong },
  idle: { text: 'Idle', icon: 'clock', tone: color.textSecondary },
  offline: { text: 'Offline', icon: 'x-circle', tone: color.dangerStrong },
}

const fmt = (n: number) => pct(n, n % 1 === 0 ? 0 : 1)

/** The pledge as a ring: the whole ring is the pledge, the filled arc is what's been used. */
function PledgeRing({ m: member, size = 68 }: { m: Member; size?: number }) {
  const stroke = 6
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const ratio = member.pledgePct > 0 ? Math.min(1, member.pledgeUsedPct / member.pledgePct) : 0
  const offline = member.status === 'offline'
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="meter"
      aria-label={`${member.name}: ${fmt(member.pledgeUsedPct)} of ${fmt(member.pledgePct)} used`}
      aria-valuenow={member.pledgeUsedPct}
      aria-valuemin={0}
      aria-valuemax={member.pledgePct}
      className={member.status === 'working' ? 'sh-ring-working' : undefined}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill={color.actionSubtle}
        stroke={color.mutedSubtle}
        strokeWidth={stroke}
        strokeDasharray={offline ? '4 4' : undefined}
      />
      {member.pledgePct > 0 && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={offline ? color.muted : 'var(--team)'}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c * ratio} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dasharray 0.6s ease-out' }}
        />
      )}
      {member.avatarUrl ? (
        <>
          <clipPath id={`ring-face-${member.id}`}>
            <circle cx={size / 2} cy={size / 2} r={r - stroke / 2 - 1} />
          </clipPath>
          <image
            href={member.avatarUrl}
            x={stroke + 1}
            y={stroke + 1}
            width={size - 2 * (stroke + 1)}
            height={size - 2 * (stroke + 1)}
            preserveAspectRatio="xMidYMid slice"
            clipPath={`url(#ring-face-${member.id})`}
            style={offline ? { filter: 'grayscale(1)' } : undefined}
          />
        </>
      ) : (
        <text
          x="50%"
          y="50%"
          dy="0.35em"
          textAnchor="middle"
          fontSize={17}
          fontWeight={700}
          fill={color.text}
        >
          {initials(member.name)}
        </text>
      )}
    </svg>
  )
}

function Person({
  m: member,
  selected,
  dim,
  team,
  onSelect,
}: {
  m: Member
  selected: boolean
  dim: boolean
  /** The member's team colour. */
  team: string
  onSelect: () => void
}) {
  const changed = member.pledgePrevPct !== undefined && member.pledgePrevPct !== member.pledgePct
  const status = STATUS[member.status]
  const detailsId = `member-${member.id}-details`
  return (
    <button
      id={`member-${member.id}`}
      data-name={member.name}
      aria-label={member.name}
      aria-describedby={detailsId}
      aria-pressed={selected}
      onClick={onSelect}
      className={`sh-person ${dim ? 'sh-dim' : 'sh-lit'}`}
      data-selected={selected}
      style={{
        ['--team' as string]: team,
        opacity: member.status === 'offline' && !selected ? 0.75 : undefined,
      }}
    >
      <PledgeRing m={member} size={52} />
      <span className="sh-person__who">
        <span style={{ fontWeight: 700, lineHeight: 1.2 }}>
          {member.name}
          {changed && (
            <span
              title={`Changed this week (was ${member.pledgePrevPct}%)`}
              style={{ marginLeft: 4, color: color.action }}
            >
              ▲
            </span>
          )}
        </span>
        <span className="sh-team" style={{ fontSize: 13 }}>
          {member.team}
        </span>
      </span>
      <span id={detailsId} className="sh-person__nums">
        <strong className="sh-num" style={{ fontSize: 17 }}>
          {fmt(leftPct(member))} left
        </strong>
        <span className="sh-muted sh-num" style={{ fontSize: 13 }}>
          {fmt(member.pledgeUsedPct)} of {fmt(member.pledgePct)}
        </span>
        <span style={{ fontSize: 13 }}>
          <IconText icon={status.icon} tone={status.tone}>
            {status.text}
          </IconText>
        </span>
      </span>
    </button>
  )
}

export function Members() {
  const data = useData()
  const reduced = useReducedMotionPref()
  const [sort, setSort] = useState<MemberSort>('left')
  const selected = useDash((s) => s.selectedMemberId)
  const select = useDash((s) => s.selectMember)
  const members = useMemo(() => sortedMembers(data, sort), [data, sort])
  const teams = useTeamColors()

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
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '6px 18px',
          alignItems: 'center',
          margin: '0 0 12px',
        }}
      >
        <span className="sh-muted" style={{ fontSize: 14 }}>
          Ring = this week’s pledge · filled = used on other people’s tasks
        </span>
        <ul aria-label="Teams" className="sh-legend">
          {Object.entries(teams).map(([team, c]) => (
            <li key={team} className="sh-team" style={{ ['--team' as string]: c }}>
              {team}
            </li>
          ))}
        </ul>
      </div>
      <ul aria-label="Members of the pool" className="sh-people-col sh-fill">
        {members.map((mm) => (
          <m.li
            key={mm.id}
            layout={!reduced}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            style={{ listStyle: 'none' }}
          >
            <Person
              m={mm}
              selected={selected === mm.id}
              dim={!!selected && selected !== mm.id}
              team={teams[mm.team] ?? color.action}
              onSelect={() => select(mm.id)}
            />
          </m.li>
        ))}
      </ul>
    </Panel>
  )
}
