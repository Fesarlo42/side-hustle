'use client'
/** Small building blocks Lumen doesn't ship: avatar, progress bar, panel shell. */
import { Icon } from '@iubenda/lumen-next'
import type { IconName } from '@iubenda/lumen'
import type { ReactNode } from 'react'
import { initials } from '@/components/Core/Core'
import { color } from '@/theme'
import type { Member } from '@/types'

export function Avatar({
  member,
  size = 32,
  title,
}: {
  member?: Pick<Member, 'name' | 'avatarUrl' | 'status'>
  size?: number
  title?: string
}) {
  const label = title ?? member?.name ?? 'Nobody yet'
  const style = {
    width: size,
    height: size,
    borderRadius: '50%',
    display: 'inline-grid',
    placeItems: 'center',
    flex: 'none',
    fontSize: Math.round(size * 0.38),
    fontWeight: 700,
    background: member ? color.actionSubtle : color.mutedSubtle,
    color: color.text,
    border: `2px ${member?.status === 'offline' ? 'dashed' : 'solid'} ${member ? color.borderStrong : color.border}`,
    opacity: member?.status === 'offline' ? 0.6 : 1,
  } as const
  if (member?.avatarUrl)
    return (
      // Slack avatars are external and tiny; next/image adds nothing here.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={member.avatarUrl}
        alt={label}
        title={label}
        style={{ ...style, objectFit: 'cover' }}
      />
    )
  return (
    <span role="img" aria-label={label} title={label} style={style}>
      {member ? initials(member.name) : '?'}
    </span>
  )
}

/** A fill inside a track. `over` turns it amber and adds a word, so colour isn't the only signal. */
export function Bar({
  value,
  max,
  over = false,
  label,
  height = 10,
}: {
  value: number
  max: number
  over?: boolean
  label: string
  height?: number
}) {
  const ratio = max > 0 ? Math.min(1, value / max) : 0
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuenow={Math.round(value * 10) / 10}
      aria-valuemin={0}
      aria-valuemax={max}
      style={{ height, background: color.mutedSubtle, borderRadius: height, overflow: 'hidden' }}
    >
      <div
        style={{
          width: `${ratio * 100}%`,
          height: '100%',
          background: over ? color.warning : color.action,
          borderRadius: height,
          transition: 'width 0.25s ease-out',
        }}
      />
    </div>
  )
}

export function Panel({
  id,
  title,
  aside,
  children,
  className,
}: {
  id: string
  title: string
  aside?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className={`sh-panel ${className ?? ''}`}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 12,
        }}
      >
        <h2 id={`${id}-h`} style={{ margin: 0, fontSize: 22, lineHeight: 1.3 }}>
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

export function IconText({
  icon,
  children,
  tone,
}: {
  icon: IconName
  children: ReactNode
  tone?: string
}) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: tone }}>
      <Icon name={icon} size="sm" />
      <span>{children}</span>
    </span>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="sh-muted" style={{ margin: '8px 0' }}>
      {children}
    </p>
  )
}
