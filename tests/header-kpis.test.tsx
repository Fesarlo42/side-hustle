// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CorePanel } from '@/components/Core/CorePanel'
import { Header } from '@/components/Header/Header'
import { KpiLeft, KpiRight } from '@/components/KpiStrip/KpiStrip'
import { useDash } from '@/store/store'
import { member, snapshot, task } from './fixtures'
import { seedStore } from './store-helpers'

const base = () =>
  snapshot({
    members: [
      member({ id: 'm_a', name: 'Ana Silva', pledgePct: 30, pledgeUsedPct: 10 }),
      member({ id: 'm_b', name: 'Leo Martins', pledgePct: 0 }),
    ],
    tasks: [task({ id: 't1', section: 'doing', pickerId: 'm_a', ownerId: 'm_b' })],
    week: { ...snapshot().week, answeredCount: 13, memberCount: 15 },
    pulse: {
      ...snapshot().pulse,
      at: '2026-11-15T18:00:00.000Z',
      forecastUnusedPct: 38,
      statusLine: 'Reset in 6 h. Good time to pick them up.',
      statusRef: { type: 'member', id: 'm_a' },
    },
  })

describe('Header', () => {
  it('shows the week, reset countdown, pledge answers and live state', () => {
    seedStore(base())
    render(<Header />)
    expect(screen.getByText('Side hustle')).toBeInTheDocument()
    expect(screen.getByText(/Week 46/)).toBeInTheDocument()
    expect(screen.getByText(/in 6 h/)).toBeInTheDocument()
    expect(screen.getByText('13 of 15')).toBeInTheDocument()
    expect(screen.getByText(/closed/)).toBeInTheDocument()
    expect(screen.getByText(/Live · updated/)).toBeInTheDocument()
  })

  it('goes grey when the stream drops', () => {
    seedStore(base(), { connection: 'offline' })
    render(<Header />)
    expect(screen.getByText(/Offline · reconnecting/)).toBeInTheDocument()
    expect(screen.queryByText(/Live · updated/)).not.toBeInTheDocument()
  })
})

describe('KPI strip', () => {
  it('shows people, pledge in seat-weeks, tasks in flight and unused at reset', () => {
    seedStore(base())
    render(
      <>
        <KpiLeft />
        <KpiRight />
      </>,
    )
    expect(screen.getByText('1 giving this week')).toBeInTheDocument()
    expect(screen.getByText('People in the pool').parentElement).toHaveTextContent('2')
    expect(screen.getByText('Pledge left').parentElement).toHaveTextContent('0.2 seat-weeks')
    expect(screen.getByText('Tasks in flight').parentElement).toHaveTextContent('1')
    expect(screen.getByText('Unused at reset').parentElement).toHaveTextContent('38 % of pool')
    expect(screen.getByText(/^Forecast · resets [A-Z][a-z]{2} \d{2}:\d{2}$/)).toBeInTheDocument()
  })
})

describe('Core panel', () => {
  it('shows the ready-made status line and links it to its source', () => {
    seedStore(base())
    render(<CorePanel />)
    fireEvent.click(screen.getByRole('button', { name: /Reset in 6 h/ }))
    expect(useDash.getState().selectedMemberId).toBe('m_a')
  })

  it('labels the still core in reduced motion', () => {
    seedStore(base(), { reducedMotionOverride: true })
    render(<CorePanel />)
    expect(
      screen.getByRole('img', { name: /^Calm · 1 task in flight · pool 67% free$/ }),
    ).toBeInTheDocument()
  })
})
