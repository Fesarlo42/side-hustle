// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { WorkCards } from '@/components/WorkCards/WorkCards'
import { member, snapshot, task } from './fixtures'
import { seedStore } from './store-helpers'

const NOW = '2026-11-15T18:00:00.000Z'
const ago = (min: number) => new Date(Date.parse(NOW) - min * 60_000).toISOString()

const seed = (selectedMemberId?: string) =>
  seedStore(
    snapshot({
      pulse: { ...snapshot().pulse, at: NOW },
      projects: [{ id: 'p_checkout', name: 'Checkout revamp', team: 'Payments' }],
      members: [
        member({ id: 'm_sofia', name: 'Sofia Almeida' }),
        member({ id: 'm_ana', name: 'Ana Silva' }),
        member({ id: 'm_rui', name: 'Rui Carvalho' }),
      ],
      agents: [
        {
          id: 'a_rui_picker',
          name: 'Rui’s agent',
          role: 'picker',
          memberId: 'm_rui',
          status: 'working',
          lastHeartbeatAt: NOW,
        },
        {
          id: 'a_reviewer_1',
          name: 'Reviewer agent 1',
          role: 'reviewer',
          status: 'working',
          lastHeartbeatAt: NOW,
        },
      ],
      tasks: [
        task({
          id: 't_doing',
          title: 'Type the payment provider client',
          projectId: 'p_checkout',
          ownerId: 'm_sofia',
          pickerId: 'm_rui',
          pickerAgentId: 'a_rui_picker',
          previousPickerId: 'm_ana',
          section: 'doing',
          sectionSince: ago(12),
          size: 'L',
          budgetPct: 10,
          usedPct: 9.4,
          reviewAttempts: 1,
          asanaUrl: 'https://app.asana.com/x',
        }),
        task({
          id: 't_review',
          title: 'Split checkout summary',
          projectId: 'p_checkout',
          ownerId: 'm_sofia',
          pickerId: 'm_ana',
          section: 'to_review',
          sectionSince: ago(3),
          reviewerAgentId: 'a_reviewer_1',
          reviewAttempts: 2,
          size: 'S',
          budgetPct: 2,
          usedPct: 2.6,
        }),
        task({
          id: 't_orphan',
          title: 'Cache node_modules',
          projectId: 'p_checkout',
          ownerId: 'm_sofia',
          pickerId: 'm_ana',
          section: 'doing',
          sectionSince: ago(40),
          flag: 'orphaned',
        }),
        task({ id: 't_open', title: 'Not started', section: 'open' }),
        task({ id: 't_done_old', title: 'Old news', section: 'done', doneAt: ago(30) }),
        task({
          id: 't_done_new',
          title: 'Just finished',
          projectId: 'p_checkout',
          ownerId: 'm_sofia',
          pickerId: 'm_ana',
          section: 'done',
          doneAt: ago(2),
          sectionSince: ago(2),
        }),
      ],
    }),
    { selectedMemberId },
  )

const card = (title: string) =>
  screen.getByRole('heading', { name: title }).closest('article') as HTMLElement

describe('Work in progress', () => {
  it('shows active tasks and recent Done, Doing first', () => {
    seed()
    render(<WorkCards />)
    const titles = screen
      .getAllByRole('article')
      .map((a) => within(a).getByRole('heading').textContent)
    expect(titles).toEqual([
      'Type the payment provider client',
      'Cache node_modules',
      'Split checkout summary',
      'Just finished',
    ])
  })

  it('lays sections out side by side, all five always visible', () => {
    seed()
    render(<WorkCards />)
    const groups = screen.getAllByRole('group').map((g) => g.getAttribute('aria-label'))
    expect(groups).toEqual(['Doing: 2', 'To Review: 1', 'QA Review: 0', 'Needs Info: 0', 'Done: 1'])
    expect(screen.getByTestId('work-board')).toHaveClass('sh-kanban')
    expect(
      within(screen.getByRole('group', { name: 'QA Review: 0' })).getByText('Nothing here'),
    ).toBeInTheDocument()
    expect(
      within(screen.getByRole('group', { name: 'Doing: 2' })).getAllByRole('article'),
    ).toHaveLength(2)
  })

  it('shows title, project and the Asana link only', () => {
    seed()
    render(<WorkCards />)
    const c = card('Type the payment provider client')
    expect(c).toHaveTextContent('Checkout revamp')
    expect(within(c).getByRole('link', { name: /Open in Asana/ })).toHaveAttribute(
      'href',
      'https://app.asana.com/x',
    )
  })

  it('shows owner → picker, the agent and the hand-over', () => {
    seed()
    render(<WorkCards />)
    const c = card('Type the payment provider client')
    expect(within(c).getByRole('img', { name: 'Owner: Sofia Almeida' })).toBeInTheDocument()
    expect(within(c).getByRole('img', { name: 'Picker: Rui Carvalho' })).toBeInTheDocument()
    expect(c).toHaveTextContent('Rui’s agent')
    expect(c).toHaveTextContent('Taken over from Ana')
  })

  it('shows section with time there, review attempt and the reviewer', () => {
    seed()
    render(<WorkCards />)
    expect(card('Type the payment provider client')).toHaveTextContent('Doing · 12 min')
    const r = card('Split checkout summary')
    expect(r).toHaveTextContent('To Review · 3 min')
    expect(r).toHaveTextContent('Review 2 of 3')
    expect(r).toHaveTextContent('Reviewer agent 1')
  })

  it('flags orphaned tasks', () => {
    seed()
    render(<WorkCards />)
    expect(card('Cache node_modules')).toHaveTextContent('Orphaned')
  })

  it('shows pledge used against the budget, and says when it is over', () => {
    seed()
    render(<WorkCards />)
    expect(
      within(card('Type the payment provider client')).getByRole('meter', {
        name: '9.4% of 10% budget used',
      }),
    ).toBeInTheDocument()
    expect(card('Type the payment provider client')).not.toHaveTextContent('Over budget')
    expect(card('Split checkout summary')).toHaveTextContent('Over budget')
  })

  it('dims tasks that are not the selected member’s', () => {
    seed('m_rui')
    render(<WorkCards />)
    expect(card('Type the payment provider client')).toHaveClass('sh-lit')
    expect(card('Split checkout summary')).toHaveClass('sh-dim')
  })

  it('scrolls long columns on their own', () => {
    seed()
    render(<WorkCards />)
    for (const g of screen.getAllByRole('group'))
      expect(g.querySelector('.sh-lane-body')).not.toBeNull()
  })

  it('says so when nothing is running', () => {
    seedStore(snapshot())
    render(<WorkCards />)
    expect(screen.getByText(/Nothing in progress right now/)).toBeInTheDocument()
  })
})
