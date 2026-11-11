// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Dashboard } from '@/components/Dashboard'
import { Header } from '@/components/Header/Header'
import { MockEngine } from '@/data/mock/engine'
import type { DataSource } from '@/data/source'
import { snapshot } from './fixtures'
import { seedStore } from './store-helpers'

const source = (engine: MockEngine): DataSource => ({
  getSnapshot: async () => engine.snapshot(),
  subscribe(onMessage, onStatus) {
    onStatus('live')
    return engine.subscribe(onMessage)
  },
})

describe('brand', () => {
  it('shows the "You Token to Me?" logo in the header, with the product name as text', () => {
    seedStore(snapshot())
    render(<Header />)
    expect(screen.getByRole('img', { name: 'You Token to Me? · Side hustle' })).toBeInTheDocument()
    expect(screen.getByText('No token left unused.')).toBeInTheDocument()
  })

  it('opens each section group with its banner, in order', async () => {
    render(<Dashboard source={source(new MockEngine())} />)
    await screen.findByRole('img', { name: 'You Token to Me? · Side hustle' })
    const banners = screen.getAllByRole('img', { name: /Token$/ }).map((i) => i.getAttribute('alt'))
    expect(banners).toEqual(['Look who’s Token', 'Now we’re Token', 'Keep on Token'])
    // Each banner sits right before the panels it introduces.
    const look = screen.getByRole('img', { name: 'Look who’s Token' }).closest('section')
    expect(look).toContainElement(document.getElementById('members'))
    const now = screen.getByRole('img', { name: 'Now we’re Token' }).closest('section')
    expect(now).toContainElement(document.getElementById('work'))
    const keep = screen.getByRole('img', { name: 'Keep on Token' }).closest('section')
    expect(keep).toContainElement(document.getElementById('flow'))
  })
})
