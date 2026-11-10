// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Leaderboard } from '@/components/Leaderboard/Leaderboard'
import { Quality } from '@/components/Quality/Quality'
import { T0, member, snapshot, task } from './fixtures'
import { seedStore } from './store-helpers'

const seed = () =>
  seedStore(
    snapshot({
      members: [
        member({ id: 'm_a', name: 'Ana Silva', pledgePct: 30 }),
        member({ id: 'm_b', name: 'Bruno Costa', pledgePct: 10 }),
        member({ id: 'm_s', name: 'Sofia Almeida', pledgePct: 3 }),
      ],
      tasks: [
        task({
          id: 't1',
          section: 'done',
          ownerId: 'm_s',
          pickerId: 'm_a',
          size: 'S',
          budgetPct: 2,
          usedPct: 2.5,
        }),
        task({
          id: 't2',
          section: 'done',
          ownerId: 'm_s',
          pickerId: 'm_a',
          size: 'S',
          budgetPct: 2,
          usedPct: 1,
          rejections: 1,
        }),
        task({
          id: 't3',
          section: 'done',
          ownerId: 'm_s',
          pickerId: 'm_b',
          model: 'Opus 5.5',
          reviewFailures: [{ check: 'scope', at: T0, destructive: false }],
        }),
        task({
          id: 't4',
          section: 'done',
          ownerId: 'm_b',
          pickerId: 'm_a',
          size: 'L',
          budgetPct: 10,
          usedPct: 4,
        }),
        task({
          id: 't5',
          section: 'doing',
          ownerId: 'm_b',
          pickerId: 'm_a',
          reviewFailures: [{ check: 'harness', at: T0, destructive: false }],
        }),
      ],
    }),
  )

describe('Quality', () => {
  it('shows first-pass approval and rejections', () => {
    seed()
    render(<Quality />)
    expect(screen.getByText('First-pass approval').parentElement).toHaveTextContent('75%')
    expect(screen.getByText('First-pass approval').parentElement).toHaveTextContent(
      '3 of 4 approved without being sent back',
    )
    expect(screen.getByText('Sent back to Next').parentElement).toHaveTextContent('1')
  })

  it('shows reviewer failures by check', () => {
    seed()
    render(<Quality />)
    const list = screen.getByRole('list', { name: 'Reviewer failures by check' })
    expect(within(list).getByText('Scope').parentElement).toHaveTextContent('1')
    expect(within(list).getByText('Tests and lint').parentElement).toHaveTextContent('1')
    expect(within(list).getByText('Non-destructive').parentElement).toHaveTextContent('0')
  })

  it('shows how often each size goes over budget', () => {
    seed()
    render(<Quality />)
    const list = screen.getByRole('list', { name: 'Over budget by size' })
    const item = (size: string) =>
      within(list)
        .getAllByRole('listitem')
        .find((li) => li.textContent?.startsWith(`${size} (`))
    expect(item('S')).toHaveTextContent('1 of 2 · 50%')
    expect(item('L')).toHaveTextContent('0 of 1 · 0%')
  })

  it('shows success per model', () => {
    seed()
    render(<Quality />)
    const list = screen.getByRole('list', { name: 'First-pass success by model' })
    expect(within(list).getByText('Sonnet 5.5').parentElement).toHaveTextContent('67% · 3 tasks')
    expect(within(list).getByText('Opus 5.5').parentElement).toHaveTextContent('0% · 1 task')
  })
})

describe('Leaderboard', () => {
  it('shows the top 5 publishers, pickers, completers and pledges with names', () => {
    seed()
    render(<Leaderboard />)
    const first = (label: string) =>
      within(screen.getByRole('list', { name: label })).getAllByRole('listitem')[0]
    expect(first('Published')).toHaveTextContent('Sofia Almeida3')
    expect(first('Picked up')).toHaveTextContent('Ana Silva4')
    expect(first('Completed')).toHaveTextContent('Ana Silva3')
    expect(first('Biggest pledges')).toHaveTextContent('Ana Silva30%')
  })
})
