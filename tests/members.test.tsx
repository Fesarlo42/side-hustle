// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Members } from '@/components/Members/Members'
import { useDash } from '@/store/store'
import { member, snapshot } from './fixtures'
import { seedStore } from './store-helpers'

const seed = () =>
  seedStore(
    snapshot({
      members: [
        member({
          id: 'm_ana',
          name: 'Ana Silva',
          team: 'Design',
          pledgePct: 30,
          pledgeUsedPct: 24,
          status: 'working',
        }),
        member({
          id: 'm_rui',
          name: 'Rui Carvalho',
          team: 'Platform',
          pledgePct: 30,
          pledgeUsedPct: 12,
          status: 'idle',
        }),
        member({
          id: 'm_marta',
          name: 'Marta Ribeiro',
          team: 'Support',
          pledgePct: 30,
          pledgePrevPct: 10,
          pledgeUsedPct: 2,
          pledgeSource: 'answered',
        }),
        member({
          id: 'm_bruno',
          name: 'Bruno Costa',
          team: 'Payments',
          pledgePct: 10,
          pledgeUsedPct: 5,
          status: 'offline',
          pledgeSource: 'carried_over',
        }),
        member({
          id: 'm_leo',
          name: 'Leo Martins',
          team: 'Payments',
          pledgePct: 0,
          pledgeSource: 'default_zero',
        }),
      ],
    }),
  )

const names = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((r) => within(r).getByRole('button').textContent)

describe('Members', () => {
  it('lists everyone, sorted by pledge left', () => {
    seed()
    render(<Members />)
    expect(screen.getByRole('heading', { name: 'Members (5)' })).toBeInTheDocument()
    expect(names()).toEqual([
      'Marta Ribeiro',
      'Rui Carvalho',
      'Ana Silva',
      'Bruno Costa',
      'Leo Martins',
    ])
  })

  it('sorts by pledge or by name', () => {
    seed()
    render(<Members />)
    fireEvent.click(screen.getByRole('radio', { name: 'Name' }))
    expect(names()[0]).toBe('Ana Silva')
    fireEvent.click(screen.getByRole('radio', { name: 'Pledge' }))
    expect(names().slice(0, 3)).toEqual(['Ana Silva', 'Marta Ribeiro', 'Rui Carvalho'])
  })

  it('shows pledge, used, left, answer and status in words', () => {
    seed()
    render(<Members />)
    const ana = screen.getByRole('button', { name: 'Ana Silva' }).closest('tr') as HTMLElement
    expect(ana).toHaveTextContent('Design')
    expect(ana).toHaveTextContent('30%')
    expect(ana).toHaveTextContent('24% used')
    expect(ana).toHaveTextContent('6%')
    expect(ana).toHaveTextContent('Answered')
    expect(ana).toHaveTextContent('Working')
    const bruno = screen.getByRole('button', { name: 'Bruno Costa' }).closest('tr') as HTMLElement
    expect(bruno).toHaveTextContent('Carried over')
    expect(bruno).toHaveTextContent('Offline')
    const leo = screen.getByRole('button', { name: 'Leo Martins' }).closest('tr') as HTMLElement
    expect(leo).toHaveTextContent('New · 0%')
  })

  it('marks a pledge changed mid-week', () => {
    seed()
    render(<Members />)
    const marta = screen.getByRole('button', { name: 'Marta Ribeiro' }).closest('tr') as HTMLElement
    expect(within(marta).getByTitle('Changed this week (was 10%)')).toBeInTheDocument()
  })

  it('never shows anyone’s own weekly usage, tokens or cost', () => {
    seed()
    render(<Members />)
    expect(document.body.textContent).not.toMatch(/\btokens?\b|\bcosts?\b|€|\$/i)
  })

  it('selects a member on click and clears on second click', () => {
    seed()
    render(<Members />)
    fireEvent.click(screen.getByRole('button', { name: 'Rui Carvalho' }))
    expect(useDash.getState().selectedMemberId).toBe('m_rui')
    expect(screen.getByRole('button', { name: 'Rui Carvalho' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Rui Carvalho' }))
    expect(useDash.getState().selectedMemberId).toBeUndefined()
  })
})
