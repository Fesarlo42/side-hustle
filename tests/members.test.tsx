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
        }),
        member({
          id: 'm_bruno',
          name: 'Bruno Costa',
          team: 'Payments',
          pledgePct: 10,
          pledgeUsedPct: 5,
          status: 'offline',
        }),
        member({ id: 'm_leo', name: 'Leo Martins', team: 'Payments', pledgePct: 0 }),
      ],
    }),
  )

const people = () =>
  within(screen.getByRole('list', { name: 'Members of the pool' })).getAllByRole('listitem')
const names = () => people().map((li) => within(li).getByRole('button').getAttribute('data-name'))
const person = (name: string) =>
  people().find((li) => li.textContent?.includes(name)) as HTMLElement

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

  it('shows pledge, used, left and status in words', () => {
    seed()
    render(<Members />)
    const ana = person('Ana Silva')
    expect(ana).toHaveTextContent('Design')
    expect(ana).toHaveTextContent('6% left')
    expect(ana).toHaveTextContent('24% of 30%')
    expect(ana).toHaveTextContent('Working')
    expect(
      within(ana).getByRole('meter', { name: 'Ana Silva: 24% of 30% used' }),
    ).toBeInTheDocument()
    expect(person('Bruno Costa')).toHaveTextContent('Offline')
    expect(document.body).not.toHaveTextContent(/Answered|Carried over/)
  })

  it('shows the photo inside the ring when there is one', () => {
    seedStore(
      snapshot({
        members: [
          member({ id: 'm_ana', name: 'Ana Silva', avatarUrl: 'https://example.test/ana.png' }),
        ],
      }),
    )
    render(<Members />)
    expect(person('Ana Silva').querySelector('image')).toHaveAttribute(
      'href',
      'https://example.test/ana.png',
    )
  })

  it('marks a pledge changed mid-week', () => {
    seed()
    render(<Members />)
    expect(
      within(person('Marta Ribeiro')).getByTitle('Changed this week (was 10%)'),
    ).toBeInTheDocument()
  })

  it('never shows anyone’s own weekly usage, tokens or cost', () => {
    seed()
    render(<Members />)
    expect(document.body.textContent).not.toMatch(/\btokens?\b|\bcosts?\b|€|\$/i)
  })

  it('selects a member on click and clears on second click', () => {
    seed()
    render(<Members />)
    const btn = () => within(person('Rui Carvalho')).getByRole('button')
    fireEvent.click(btn())
    expect(useDash.getState().selectedMemberId).toBe('m_rui')
    expect(btn()).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(btn())
    expect(useDash.getState().selectedMemberId).toBeUndefined()
  })
})
