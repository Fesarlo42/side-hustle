// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PledgeFlow } from '@/components/PledgeFlow/PledgeFlow'
import type { UsageBucket } from '@/types'
import { T0, member, snapshot } from './fixtures'
import { seedStore } from './store-helpers'

const b = (
  pickerId: string,
  ownerId: string,
  projectId: string,
  usedPct: number,
  taskId = `${pickerId}-${ownerId}-${projectId}`,
): UsageBucket => ({ hour: T0, pickerId, ownerId, projectId, taskId, usedPct })

const seed = (selectedMemberId?: string) =>
  seedStore(
    snapshot({
      projects: [
        { id: 'p_checkout', name: 'Checkout revamp', team: 'Payments' },
        { id: 'p_tokens', name: 'Design tokens audit', team: 'Design' },
        { id: 'p_billing', name: 'Billing emails', team: 'Payments' },
      ],
      members: [
        member({ id: 'm_ana', name: 'Ana Silva' }),
        member({ id: 'm_rita', name: 'Rita Ferreira' }),
        member({ id: 'm_sofia', name: 'Sofia Almeida' }),
        member({ id: 'm_ines', name: 'Inês Rocha' }),
      ],
      usage: [
        b('m_ana', 'm_sofia', 'p_checkout', 6),
        b('m_rita', 'm_sofia', 'p_billing', 3),
        b('m_rita', 'm_ines', 'p_tokens', 4.5),
      ],
    }),
    { selectedMemberId },
  )

describe('Where pledges go', () => {
  it('shows pledge used per project, biggest first', () => {
    seed()
    render(<PledgeFlow />)
    const rows = within(screen.getByRole('list', { name: 'Pledge used by project' })).getAllByRole(
      'listitem',
    )
    expect(rows.map((r) => r.textContent)).toEqual([
      'Checkout revamp6.0%',
      'Design tokens audit4.5%',
      'Billing emails3.0%',
    ])
  })

  it('switches to teams', () => {
    seed()
    render(<PledgeFlow />)
    fireEvent.click(screen.getByRole('radio', { name: 'By team' }))
    const rows = within(screen.getByRole('list', { name: 'Pledge used by team' })).getAllByRole(
      'listitem',
    )
    expect(rows.map((r) => r.textContent)).toEqual(['Payments9.0%', 'Design4.5%'])
  })

  it('draws picker → owner flows with a text alternative', () => {
    seed()
    render(<PledgeFlow />)
    expect(
      screen.getByRole('img', { name: /Pledge flowing from pickers to owners/ }),
    ).toBeInTheDocument()
    const links = within(screen.getByRole('table', { name: 'Picker to owner' }))
      .getAllByRole('row')
      .slice(1)
      .map((r) => r.textContent)
    expect(links).toEqual([
      'Ana SilvaSofia Almeida6.0%',
      'Rita FerreiraInês Rocha4.5%',
      'Rita FerreiraSofia Almeida3.0%',
    ])
  })

  it('highlights the selected member’s flows', () => {
    seed('m_ines')
    render(<PledgeFlow />)
    const paths = screen
      .getByRole('img', { name: /Pledge flowing/ })
      .querySelectorAll('path[data-link]')
    const lit = [...paths]
      .filter((p) => p.getAttribute('data-lit') === 'true')
      .map((p) => p.getAttribute('data-link'))
    expect(lit).toEqual(['m_rita>m_ines'])
  })

  it('says so when no pledge has been used yet', () => {
    seedStore(snapshot())
    render(<PledgeFlow />)
    expect(screen.getByText(/No pledge used yet this week/)).toBeInTheDocument()
  })
})
