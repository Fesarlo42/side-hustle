// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ActivityLog } from '@/components/ActivityLog/ActivityLog'
import { Insights } from '@/components/Insights/Insights'
import { useDash } from '@/store/store'
import type { DashEvent, Insight } from '@/types'
import { member, snapshot, task } from './fixtures'
import { seedStore } from './store-helpers'

const NOW = '2026-11-15T18:00:00.000Z'
const ago = (min: number) => new Date(Date.parse(NOW) - min * 60_000).toISOString()

const insight = (p: Partial<Insight> & Pick<Insight, 'id'>): Insight => ({
  kind: 'service',
  severity: 'info',
  title: p.id,
  detail: 'detail',
  agentAction: 'Nothing automatic',
  state: 'open',
  openedAt: ago(5),
  related: [],
  ...p,
})

const ev = (p: Partial<DashEvent> & Pick<DashEvent, 'id' | 'type' | 'text'>): DashEvent => ({
  at: ago(1),
  actor: { type: 'system', id: 's' },
  related: [],
  ...p,
})

describe('Insights', () => {
  const seed = () =>
    seedStore(
      snapshot({
        pulse: { ...snapshot().pulse, at: NOW },
        insights: [
          insight({
            id: 'i_info',
            kind: 'quality',
            severity: 'info',
            title: 'S tasks go over budget 50% of the time',
            agentAction: 'Nothing automatic; owners can size these as M',
          }),
          insight({
            id: 'i_asana',
            kind: 'service',
            severity: 'heads_up',
            title: 'Asana isn’t answering',
            detail: '2 tasks can’t update their Asana ticket yet.',
            agentAction: 'Retrying every 5 min',
            state: 'handling',
            openedAt: ago(2),
          }),
          insight({
            id: 'i_done',
            kind: 'device',
            severity: 'heads_up',
            title: 'Bruno’s agent went quiet',
            state: 'resolved',
            resolvedAt: ago(10),
            openedAt: ago(20),
          }),
        ],
      }),
    )

  it('lists most severe first, resolved at the bottom', () => {
    seed()
    render(<Insights />)
    const titles = screen
      .getAllByRole('article')
      .map((a) => within(a).getByRole('heading').textContent)
    expect(titles).toEqual([
      'Asana isn’t answering',
      'S tasks go over budget 50% of the time',
      'Bruno’s agent went quiet',
    ])
  })

  it('shows severity, kind, meaning, what the workflow is doing and state, in words', () => {
    seed()
    render(<Insights />)
    const a = screen
      .getByRole('heading', { name: 'Asana isn’t answering' })
      .closest('article') as HTMLElement
    expect(a).toHaveTextContent('Heads-up')
    expect(a).toHaveTextContent('Service')
    expect(a).toHaveTextContent('2 tasks can’t update their Asana ticket yet.')
    expect(a).toHaveTextContent('What the agents are doing: Retrying every 5 min')
    expect(a).toHaveTextContent('Being handled')
    const r = screen
      .getByRole('heading', { name: 'Bruno’s agent went quiet' })
      .closest('article') as HTMLElement
    expect(r).toHaveTextContent(/Resolved at \d\d:\d\d/)
  })

  it('scrolls inside its panel so it matches the panel next to it', () => {
    seed()
    render(<Insights />)
    expect(screen.getByTestId('insights-scroll')).toHaveClass('sh-fill')
  })

  it('has no buttons that change anything', () => {
    seed()
    render(<Insights />)
    expect(
      screen.queryByRole('button', { name: /dismiss|resolve|apply|fix/i }),
    ).not.toBeInTheDocument()
  })
})

describe('Activity log', () => {
  const seed = () =>
    seedStore(
      snapshot({
        pulse: { ...snapshot().pulse, at: NOW },
        members: [member({ id: 'm_ana', name: 'Ana Silva' })],
        tasks: [task({ id: 't1', title: 'Type the payment provider client' })],
        events: [
          ev({
            id: 'e1',
            type: 'task.claimed',
            text: 'Ana’s agent claimed “Type the payment provider client”',
            at: ago(3),
            related: [
              { type: 'task', id: 't1' },
              { type: 'member', id: 'm_ana' },
            ],
          }),
          ev({ id: 'e2', type: 'review.failed', text: 'The reviewer sent it back', at: ago(2) }),
          ev({
            id: 'e3',
            type: 'pledge.answered',
            text: 'Marta answered the weekly check-in',
            at: ago(1),
          }),
          ev({
            id: 'e4',
            type: 'insight.opened',
            text: 'Noticed: Asana isn’t answering',
            at: ago(0),
          }),
        ],
      }),
    )

  it('shows every event newest first with time and text', () => {
    seed()
    render(<ActivityLog />)
    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(4)
    expect(rows[0]).toHaveTextContent('Noticed: Asana isn’t answering')
    expect(rows[3]).toHaveTextContent(/\d\d:\d\d.*Ana’s agent claimed/)
  })

  it('filters by type', () => {
    seed()
    render(<ActivityLog />)
    fireEvent.click(screen.getByRole('radio', { name: 'Reviews' }))
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    expect(screen.getByRole('listitem')).toHaveTextContent('The reviewer sent it back')
    fireEvent.click(screen.getByRole('radio', { name: 'Pledges & people' }))
    expect(screen.getByRole('listitem')).toHaveTextContent('Marta answered')
  })

  it('links rows to the person', () => {
    seed()
    render(<ActivityLog />)
    fireEvent.click(screen.getByRole('button', { name: 'Ana Silva' }))
    expect(useDash.getState().selectedMemberId).toBe('m_ana')
  })
})
