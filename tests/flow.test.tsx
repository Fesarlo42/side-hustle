// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Flow } from '@/components/Flow/Flow'
import { member, snapshot, task } from './fixtures'
import { seedStore } from './store-helpers'

const NOW = '2026-11-15T18:00:00.000Z'
const ago = (min: number) => new Date(Date.parse(NOW) - min * 60_000).toISOString()

const seed = () =>
  seedStore(
    snapshot({
      pulse: { ...snapshot().pulse, at: NOW },
      members: [
        member({ id: 'm_bruno', name: 'Bruno Costa' }),
        member({ id: 'm_tiago', name: 'Tiago Mendes' }),
      ],
      tasks: [
        task({ id: 'o1', section: 'open' }),
        task({ id: 'o2', section: 'open' }),
        task({ id: 'd1', section: 'doing' }),
        task({
          id: 'orph',
          title: 'Cache node_modules',
          section: 'doing',
          flag: 'orphaned',
          pickerId: 'm_bruno',
          lastHeartbeatAt: ago(4),
        }),
        task({
          id: 'stall',
          title: 'Write runbook',
          section: 'needs_info',
          flag: 'stalled',
          ownerId: 'm_tiago',
          sectionSince: ago(600),
          reminderSentAt: ago(120),
        }),
        task({ id: 'qa', section: 'qa_review', sectionSince: ago(300) }),
        task({ id: 'n1', section: 'next' }),
        task({
          id: 'done1',
          section: 'done',
          createdAt: ago(600),
          doneAt: ago(60),
          sectionLog: [
            { section: 'open', enteredAt: ago(600), leftAt: ago(540) },
            { section: 'doing', enteredAt: ago(540), leftAt: ago(420) },
            { section: 'to_review', enteredAt: ago(420), leftAt: ago(400) },
            { section: 'qa_review', enteredAt: ago(400), leftAt: ago(340) },
            { section: 'needs_info', enteredAt: ago(340), leftAt: ago(280) },
            { section: 'done', enteredAt: ago(60) },
          ],
        }),
      ],
    }),
  )

const column = (name: string) => screen.getByRole('listitem', { name: new RegExp(`^${name}`) })

describe('Flow', () => {
  it('shows a count per section, with Next and Needs Info as side lanes', () => {
    seed()
    render(<Flow />)
    expect(column('Open')).toHaveTextContent('2')
    expect(column('Doing')).toHaveTextContent('2')
    expect(column('To Review')).toHaveTextContent('0')
    expect(column('QA Review')).toHaveTextContent('1')
    expect(column('Done')).toHaveTextContent('1')
    const lanes = screen.getByRole('list', { name: 'Side lanes' })
    expect(within(lanes).getByRole('listitem', { name: /^Next/ })).toHaveTextContent('1')
    expect(within(lanes).getByRole('listitem', { name: /^Needs Info/ })).toHaveTextContent('1')
  })

  it('shows average time per section and Open → Done', () => {
    seed()
    render(<Flow />)
    expect(column('Open')).toHaveTextContent('avg 1 h')
    expect(column('Doing')).toHaveTextContent('avg 2 h')
    expect(screen.getByText(/Open → Done/).parentElement).toHaveTextContent('9 h')
  })

  it('highlights bottlenecks when tasks wait longer than the week’s average', () => {
    seed()
    render(<Flow />)
    expect(column('QA Review')).toHaveTextContent('Bottleneck')
    expect(
      within(screen.getByRole('list', { name: 'Side lanes' })).getByRole('listitem', {
        name: /^Needs Info/,
      }),
    ).toHaveTextContent('Bottleneck')
    expect(column('Doing')).not.toHaveTextContent('Bottleneck')
  })

  it('lists stalled and orphaned tasks with the time since the heartbeat or reminder', () => {
    seed()
    render(<Flow />)
    const stuck = screen.getByRole('list', { name: 'Stalled and orphaned tasks' })
    expect(stuck).toHaveTextContent('Cache node_modules')
    expect(stuck).toHaveTextContent('Orphaned · no heartbeat for 4 min')
    expect(stuck).toHaveTextContent('Write runbook')
    expect(stuck).toHaveTextContent('Stalled · 2 h since the owner’s reminder')
  })

  it('draws a moving connector between each pipeline stage', () => {
    seed()
    render(<Flow />)
    expect(
      screen.getByRole('list', { name: 'Pipeline' }).querySelectorAll('.sh-flow-link'),
    ).toHaveLength(4)
  })

  it('says so when nothing is stuck', () => {
    seedStore(snapshot({ tasks: [task({ id: 'a', section: 'doing' })] }))
    render(<Flow />)
    expect(screen.getByText(/Nothing stalled or orphaned/)).toBeInTheDocument()
  })
})
