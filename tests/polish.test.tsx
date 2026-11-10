// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DevBar } from '@/components/DevBar/DevBar'
import { Header } from '@/components/Header/Header'
import { CountUp } from '@/components/ui/CountUp'
import { useDash } from '@/store/store'
import { snapshot } from './fixtures'
import { seedStore } from './store-helpers'

const demo = { speed: 10, seed: 46, demoSeconds: 75.5, running: true }

describe('Demo bar', () => {
  it('shows demo time and speed, and sends commands', () => {
    seedStore({ ...snapshot(), demo })
    const command = vi.fn(async () => {})
    useDash.setState({ command })
    render(<DevBar />)
    expect(screen.getByRole('toolbar', { name: 'Demo controls' })).toHaveTextContent('1:15')
    expect(screen.getByRole('button', { name: '10×' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: '60×' }))
    expect(command).toHaveBeenCalledWith({ action: 'speed', value: 60 })
    fireEvent.click(screen.getByRole('button', { name: 'Restart' }))
    expect(command).toHaveBeenCalledWith({ action: 'restart' })
  })

  it('can be hidden and shown again', () => {
    seedStore({ ...snapshot(), demo })
    render(<DevBar />)
    fireEvent.click(screen.getByRole('button', { name: 'Hide demo controls' }))
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show demo controls' }))
    expect(screen.getByRole('toolbar')).toBeInTheDocument()
  })

  it('is absent for real data sources', () => {
    seedStore(snapshot())
    render(<DevBar />)
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument()
  })
})

describe('Reduced motion', () => {
  it('the toggle says whether it is on or off', () => {
    seedStore(snapshot(), { reducedMotionOverride: false })
    render(<Header />)
    expect(screen.getByText('Reduced motion: off')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('switch', { name: /Reduced motion/ }))
    expect(screen.getByText('Reduced motion: on')).toBeInTheDocument()
    expect(useDash.getState().reducedMotionOverride).toBe(true)
  })

  it('numbers update without counting up', () => {
    useDash.setState({ reducedMotionOverride: true })
    const { rerender } = render(<CountUp value={3} />)
    rerender(<CountUp value={12} />)
    expect(screen.getByText('12', { selector: '[aria-hidden]' })).toBeInTheDocument()
  })

  it('numbers count up with motion on', async () => {
    vi.useFakeTimers()
    useDash.setState({ reducedMotionOverride: false })
    const { rerender } = render(<CountUp value={0} />)
    rerender(<CountUp value={100} />)
    expect(screen.queryByText('100', { selector: '[aria-hidden]' })).not.toBeInTheDocument()
    await act(async () => {
      vi.advanceTimersByTime(1000)
    })
    vi.useRealTimers()
    expect(screen.getByText('100', { selector: '.sh-sr' })).toBeInTheDocument()
  })
})
