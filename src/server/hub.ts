/**
 * Runs the mock engine on a timer and fans its messages out to every open
 * stream. One instance per server process (kept on globalThis so dev reloads
 * don't start a second engine).
 */
import { MockEngine } from '@/data/mock/engine'
import type { DemoCommand, Snapshot, StreamMessage } from '@/types'
import type { ServerSource } from './source'

const TICK_MS = 250
const PULSE_MS = 2000

class MockHub implements ServerSource {
  private engine: MockEngine
  private unbind: () => void
  private listeners = new Set<(msg: StreamMessage) => void>()
  private last = Date.now()

  constructor() {
    this.engine = new MockEngine({ seed: Number(process.env.SIDE_HUSTLE_SEED ?? 46) })
    this.unbind = this.bind()
    setInterval(() => this.tick(), TICK_MS).unref?.()
    setInterval(() => this.broadcast(this.engine.pulseMessage()), PULSE_MS).unref?.()
  }

  snapshot(): Snapshot {
    return this.engine.snapshot()
  }

  subscribe(fn: (msg: StreamMessage) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  command(cmd: DemoCommand): void {
    switch (cmd.action) {
      case 'speed':
        this.engine.speed = cmd.value
        break
      case 'pause':
        this.engine.running = false
        break
      case 'resume':
        this.engine.running = true
        break
      case 'restart': {
        const speed = this.engine.speed
        this.unbind()
        this.engine = new MockEngine({ seed: this.engine.seed })
        this.engine.speed = speed
        this.unbind = this.bind()
        this.broadcast({ kind: 'reset' })
        break
      }
    }
    this.broadcast(this.engine.pulseMessage())
  }

  private bind(): () => void {
    return this.engine.subscribe((msg) => this.broadcast(msg))
  }

  private tick(): void {
    const now = Date.now()
    const dt = now - this.last
    this.last = now
    this.engine.advanceWall(Math.min(dt, 2000))
  }

  private broadcast(msg: StreamMessage): void {
    for (const fn of this.listeners) {
      try {
        fn(msg)
      } catch {
        this.listeners.delete(fn)
      }
    }
  }
}

const g = globalThis as unknown as { __sideHustleHub?: MockHub }

export function getMockHub(): MockHub {
  g.__sideHustleHub ??= new MockHub()
  return g.__sideHustleHub
}
