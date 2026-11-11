// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EventToasts } from '@/components/Hero/EventToasts'
import { applyMessage } from '@/store/reducer'
import { useDash } from '@/store/store'
import type { DashEvent } from '@/types'
import { member, snapshot, task } from './fixtures'
import { seedStore } from './store-helpers'

const base = () =>
  snapshot({
    members: [member({ id: 'm_a', name: 'Ana Silva', pledgePct: 30, pledgeUsedPct: 10 })],
    tasks: [task({ id: 't1', section: 'doing', pickerId: 'm_a' })],
    pulse: { ...snapshot().pulse, statusLine: 'All calm. 1 task running on Ana’s share.' },
  })

const push = (e: Partial<DashEvent> & Pick<DashEvent, 'id' | 'type' | 'text'>) =>
  act(() => {
    useDash.setState((s) => applyMessage(s, { kind: 'event', event: { at: '2026-11-15T17:00:00.000Z', actor: { type: 'system', id: 's' }, related: [], ...e } }))
  })

afterEach(() => vi.useRealTimers())

describe('Event toasts', () => {
  it('pops up notable new events and lets them go after a few seconds', () => {
    vi.useFakeTimers()
    seedStore(base())
    render(<EventToasts />)
    push({ id: 'e1', type: 'task.claimed', text: 'Rita’s agent claimed “Cache node_modules”' })
    expect(screen.getByRole('status', { name: 'Latest events' })).toHaveTextContent('Rita’s agent claimed “Cache node_modules”')
    act(() => {
      vi.advanceTimersByTime(7000)
    })
    expect(screen.getByRole('status', { name: 'Latest events' })).not.toHaveTextContent('Rita’s agent claimed')
  })

  it('skips noise and events that were already there', () => {
    seedStore({ ...base(), events: [{ id: 'old', at: '2026-11-15T16:00:00.000Z', type: 'task.claimed', text: 'Old news', actor: { type: 'system', id: 's' }, related: [] }] })
    render(<EventToasts />)
    push({ id: 'e2', type: 'insight.updated', text: 'The agents paused 2 tasks' })
    expect(screen.getByRole('status', { name: 'Latest events' })).not.toHaveTextContent(/Old news|paused/)
  })

  it('keeps at most three', () => {
    seedStore(base())
    render(<EventToasts />)
    for (let i = 1; i <= 5; i++) push({ id: `e${i}`, type: 'task.approved', text: `Approved ${i}` })
    const box = screen.getByRole('status', { name: 'Latest events' })
    expect(box).toHaveTextContent('Approved 5')
    expect(box).not.toHaveTextContent('Approved 2')
  })
})


describe('Hero with toasts', () => {
  it('shows the latest events next to the key numbers', async () => {
    const { Hero } = await import('@/components/Hero/Hero')
    seedStore(base())
    render(<Hero />)
    expect(screen.getByRole('status', { name: 'Latest events' })).toBeInTheDocument()
  })
})
