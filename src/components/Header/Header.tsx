'use client'
import { Badge, Icon, Toggle } from '@iubenda/lumen-next'
import Image from 'next/image'
import logo from '@/assets/brand/you-token-to-me.png'
import { useReducedMotionPref } from '@/hooks/useReducedMotionPref'
import { useNow } from '@/hooks/useNow'
import { duration, shortDate } from '@/lib/format'
import { nowOf } from '@/store/selectors'
import { useDash } from '@/store/store'

/** The mark: a tiny core (membrane and nucleus), breathing slowly. */
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
  const answered = week.memberCount > 0 ? week.answeredCount / week.memberCount : 0

  return (
    <header className="sh-header">
      <div className="sh-header__in">
        <div className="sh-brand">
          <Image
            src={logo}
            alt="You Token to Me? · Side hustle"
            width={226}
            height={52}
            priority
            className="sh-logo"
          />
          <div>
            <div className="sh-brand__name sh-sr">Side hustle</div>
            <div className="sh-brand__tag">No token left unused.</div>
          </div>
        </div>

        <div className="sh-facts">
          <div className="sh-fact">
            <span className="sh-fact__k">This week</span>
            <span className="sh-fact__v">
              <strong>Week {week.number}</strong>
            </span>
          </div>
          <div className="sh-fact">
            <span className="sh-fact__k">Resets {shortDate(week.resetAt)}</span>
            {/* Fixed width so the minute countdown never shifts the header. */}
            <span className="sh-fact__v sh-num" style={{ minWidth: '7.5em' }}>
              in {duration(resetIn)}
            </span>
          </div>
          <div className="sh-fact">
            <span className="sh-fact__k">
              Pledges · {simNow > deadline ? 'closed' : 'closes'} {deadlineDay}
            </span>
            <span className="sh-fact__v">
              <strong className="sh-num">
                {week.answeredCount} of {week.memberCount}
              </strong>{' '}
              answered
            </span>
            <span className="sh-fact__bar" aria-hidden>
              <span style={{ width: `${Math.round(answered * 100)}%` }} />
            </span>
          </div>
        </div>

        <div className="sh-header__end">
          {/* A steady label; the exact time of the last update is in the tooltip. */}
          <span
            role="status"
            className={`sh-live${live ? ' is-live' : ''}`}
            title={
              lastMessageAt
                ? `Last update ${new Date(lastMessageAt).toLocaleTimeString('en-GB')}`
                : 'Waiting for data'
            }
          >
            <span aria-hidden className="sh-live__dot" />
            {live ? (
              'Live'
            ) : (
              <Badge variant="neutral">
                <Icon name="arrow-clockwise" size="sm" />{' '}
                {connection === 'offline' ? 'Offline · reconnecting' : 'Reconnecting…'}
              </Badge>
            )}
          </span>
          <div className="sh-header__toggle">
            <Toggle
              label={`Reduced motion: ${reduced ? 'on' : 'off'}`}
              checked={reduced}
              onChange={({ checked }) => setReducedMotion(checked)}
            />
          </div>
        </div>
      </div>
    </header>
  )
}
