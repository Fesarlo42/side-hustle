/**
 * Client data source. The store is the only consumer; no panel touches it.
 * Swapping the backend (mock → harness + Slack + Asana) happens on the server,
 * behind the same /api/state and /api/stream contract.
 */
import type { DemoCommand, Snapshot, StreamMessage } from '@/types'

export type ConnectionStatus = 'connecting' | 'live' | 'offline'

export interface DataSource {
  getSnapshot(): Promise<Snapshot>
  /** Returns an unsubscribe function. */
  subscribe(
    onMessage: (msg: StreamMessage) => void,
    onStatus: (status: ConnectionStatus) => void,
  ): () => void
  /** Demo controls; undefined for real sources. */
  command?(cmd: DemoCommand): Promise<void>
}

export class HttpSource implements DataSource {
  constructor(private base = '') {}

  async getSnapshot(): Promise<Snapshot> {
    const res = await fetch(`${this.base}/api/state`, { cache: 'no-store' })
    if (!res.ok) throw new Error(`Snapshot failed: ${res.status}`)
    return (await res.json()) as Snapshot
  }

  subscribe(
    onMessage: (msg: StreamMessage) => void,
    onStatus: (status: ConnectionStatus) => void,
  ): () => void {
    onStatus('connecting')
    const es = new EventSource(`${this.base}/api/stream`)
    es.onopen = () => onStatus('live')
    es.onerror = () => onStatus(es.readyState === EventSource.CLOSED ? 'offline' : 'connecting')
    es.onmessage = (e: MessageEvent<string>) => {
      try {
        onMessage(JSON.parse(e.data) as StreamMessage)
      } catch {
        // ignore malformed messages
      }
    }
    return () => es.close()
  }

  async command(cmd: DemoCommand): Promise<void> {
    await fetch(`${this.base}/api/demo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cmd),
    })
  }
}
