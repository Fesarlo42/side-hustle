// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Dashboard } from '@/components/Dashboard'
import { useDash } from '@/store/store'
import { MockEngine } from '@/data/mock/engine'
import type { DataSource } from '@/data/source'
import type { StreamMessage } from '@/types'

/** A DataSource backed by the mock engine in-process (no network). */
function engineSource(engine: MockEngine): DataSource {
  return {
    getSnapshot: async () => engine.snapshot(),
    subscribe(onMessage, onStatus) {
      onStatus('live')
      return engine.subscribe((m: StreamMessage) => onMessage(m))
    },
  }
}

describe('Dashboard', () => {
  it('shows every panel in spec order, fed only by the store', async () => {
    const engine = new MockEngine()
    render(<Dashboard source={engineSource(engine)} />)
    expect(await screen.findByText('Side hustle')).toBeInTheDocument()
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(headings).toEqual([
      'Members (15)',
      'Work in progress',
      'Flow',
      'Where pledges go',
      'Quality',
      'Insights',
      'Leaderboard',
      'Activity log',
    ])
    expect(screen.getByText('Unused at reset')).toBeInTheDocument()
    // Members and work each get the full width.
    expect(document.getElementById('work')?.parentElement).not.toHaveClass('sh-two')
    expect(document.getElementById('members')?.parentElement).not.toHaveClass('sh-two')
    expect(screen.getByText(/^All calm./)).toBeInTheDocument()
  })

  it('updates live as the engine plays the demo', async () => {
    const engine = new MockEngine()
    render(<Dashboard source={engineSource(engine)} />)
    await screen.findByText('Side hustle')
    act(() => engine.advance(30))
    expect(screen.getAllByText(/Add retry to card tokenisation/).length).toBeGreaterThan(0)
  })

  it('stops CSS animations too when the reduced-motion toggle is on', async () => {
    useDash.setState({ reducedMotionOverride: true })
    render(<Dashboard source={engineSource(new MockEngine())} />)
    await screen.findByText('Side hustle')
    expect(screen.getByRole('main')).toHaveClass('sh-reduced')
    act(() => useDash.setState({ reducedMotionOverride: false }))
    expect(screen.getByRole('main')).not.toHaveClass('sh-reduced')
  })
})
