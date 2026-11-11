/**
 * Server-side data source. The API routes only talk to this interface.
 *
 * Today: the mock engine. Later: a source that reads the harness usage
 * reports, Slack (members, pledges) and Asana (tasks), and emits the same
 * Snapshot and StreamMessage shapes. Swap it in getServerSource(); the UI
 * needs no changes.
 */
import type { DemoCommand, Snapshot, StreamMessage } from '@/types'
import { getAsanaHub } from './asana/hub'
import { getMockHub } from './hub'

export interface ServerSource {
  snapshot(): Snapshot
  subscribe(onMessage: (msg: StreamMessage) => void): () => void
  /** Only the mock supports demo commands. */
  command?(cmd: DemoCommand): void
}

export function getServerSource(): ServerSource {
  const kind = process.env.SIDE_HUSTLE_SOURCE ?? 'mock'
  switch (kind) {
    case 'mock':
      return getMockHub()
    case 'asana':
      return getAsanaHub()
    default:
      throw new Error(`Unknown SIDE_HUSTLE_SOURCE "${kind}"`)
  }
}
