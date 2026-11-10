'use client'
import { Badge, Icon, Toggle } from '@iubenda/lumen-next'
import { useReducedMotionPref } from '@/hooks/useReducedMotionPref'
import { useNow } from '@/hooks/useNow'
import { duration, shortDate } from '@/lib/format'
import { nowOf } from '@/store/selectors'
import { useDash } from '@/store/store'
import { color } from '@/theme'

export function Header() {
  const week = useDash((s) => s.week)
  const simNow = useDash(nowOf)
  const connection = useDash((s) => s.connection)
  const lastMessageAt = useDash((s) => s.lastMessageAt)
  const setReducedMotion = useDash((s) => s.setReducedMotion)
  const reduced = useReducedMotionPref()
  const wallNow = useNow(1000)
  if (!week) return null

  const resetIn = Date.parse(week.resetAt) - simNow
  const deadline = Date.parse(week.pledgeDeadline)
  const deadlineDay = new Date(week.pledgeDeadline).toLocaleString('en-GB', {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
  const ago = lastMessageAt ? Math.max(0, Math.round((wallNow - lastMessageAt) / 1000)) : undefined
  const live = connection === 'live' && ago !== undefined && ago < 10

  return (
    <header
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
      }}
    >
      <div>
        <div style={{ fontSize: 30, fontWeight: 700, lineHeight: 1.1 }}>Side hustle</div>
        <div className="sh-muted">No token left unused.</div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 20 }}>
        <span>
          <strong>Week {week.number}</strong> · resets {shortDate(week.resetAt)} ·{' '}
          {/* Fixed width so the minute countdown never shifts the header. */}
          <span className="sh-num" style={{ display: 'inline-block', minWidth: '7.5em' }}>
            in {duration(resetIn)}
          </span>
        </span>
        <span>
          <strong className="sh-num">
            {week.answeredCount} of {week.memberCount}
          </strong>{' '}
          answered · {simNow > deadline ? 'closed' : 'closes'} {deadlineDay}
        </span>
        {/* A steady label; the exact time of the last update is in the tooltip. */}
        <span
          role="status"
          title={
            lastMessageAt
              ? `Last update ${new Date(lastMessageAt).toLocaleTimeString('en-GB')}`
              : 'Waiting for data'
          }
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 210 }}
        >
          <span
            aria-hidden
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: live ? color.success : color.muted,
            }}
          />
          {live ? (
            'Live'
          ) : (
            <Badge variant="neutral">
              <Icon name="arrow-clockwise" size="sm" />{' '}
              {connection === 'offline' ? 'Offline · reconnecting' : 'Reconnecting…'}
            </Badge>
          )}
        </span>
        <Toggle
          label={`Reduced motion: ${reduced ? 'on' : 'off'}`}
          checked={reduced}
          onChange={({ checked }) => setReducedMotion(checked)}
        />
      </div>
    </header>
  )
}
