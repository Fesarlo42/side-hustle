/**
 * The live source: reads Asana every POLL_MS, turns it into a Snapshot, and
 * streams what changed as events, plus a pulse every 2 s.
 *
 * One instance per server process (kept on globalThis so dev reloads don't poll twice).
 */
import type { Changes, DashEvent, Insight, Snapshot, StreamMessage } from '@/types'
import type { ServerSource } from '../source'
import { build, buildPulse, type AsanaData, type Built } from './build'
import { AsanaReader } from './client'
import { ASANA } from './config'
import { EXPORT_FILE, ExportReader } from './export'
import { readTeams } from './teams'

const POLL_MS = Number(process.env.SIDE_HUSTLE_ASANA_POLL_MS ?? 20_000)
/** The export is a local file: checking it is cheap. */
const EXPORT_POLL_MS = 5000
const STALE_EXPORT_MS = 15 * 60_000
const PULSE_MS = 2000

interface Reader {
  read(): Promise<AsanaData>
}

/** Before the first read: no people or tasks yet, but the right week. */
const empty = (): Built =>
  build(
    {
      project: { gid: ASANA.projectGid, name: 'Side Hustle', members: [] },
      tasks: [],
      stories: {},
    },
    Date.now(),
  )

class AsanaHub implements ServerSource {
  private reader: Reader
  private current: Built = empty()
  private loaded = false
  private outage?: Insight
  private listeners = new Set<(msg: StreamMessage) => void>()
  private polling = false

  constructor() {
    const token = process.env.ASANA_TOKEN?.trim()
    // With a token: read Asana's API. Without: read an export written by Claude's Asana connector.
    this.reader = token ? new AsanaReader(token) : new ExportReader(EXPORT_FILE)
    void this.poll()
    setInterval(() => void this.poll(), token ? POLL_MS : EXPORT_POLL_MS).unref?.()
    setInterval(() => this.broadcast({ kind: 'pulse', pulse: this.pulse() }), PULSE_MS).unref?.()
  }

  snapshot(): Snapshot {
    const c = this.current
    return {
      members: c.members,
      projects: c.projects,
      agents: c.agents,
      tasks: c.tasks,
      insights: this.insights(),
      events: c.events,
      pulse: this.pulse(),
      usage: c.usage,
      week: c.week,
      config: c.config,
    }
  }

  subscribe(fn: (msg: StreamMessage) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private insights(): Insight[] {
    const extra: Insight[] = []
    if (this.outage) extra.push(this.outage)
    const at = this.reader instanceof ExportReader ? this.reader.exportedAt : undefined
    if (at && Date.now() - at > STALE_EXPORT_MS) {
      const min = Math.round((Date.now() - at) / 60_000)
      extra.push({
        id: 'i_export_age',
        kind: 'service',
        severity: 'info',
        title: `This is Asana as of ${min < 120 ? `${min} min` : `${Math.round(min / 60)} h`} ago`,
        detail: 'The dashboard reads an export of the Side Hustle project, not Asana itself.',
        agentAction: 'Ask Claude to refresh the export to catch up.',
        state: 'open',
        openedAt: new Date(at + STALE_EXPORT_MS).toISOString(),
        related: [{ type: 'system', id: 'asana' }],
      })
    }
    return [...this.current.insights, ...extra]
  }

  private pulse() {
    const p = buildPulse(this.current, this.insights(), Date.now())
    if (!this.loaded) p.statusLine = 'Reading the Side Hustle project in Asana…'
    return p
  }

  private problem(title: string, detail: string, agentAction: string): Insight {
    return {
      id: 'i_asana',
      kind: 'service',
      severity: 'heads_up',
      title,
      detail,
      agentAction,
      state: 'open',
      openedAt: new Date().toISOString(),
      related: [{ type: 'system', id: 'asana' }],
    }
  }

  private async poll(): Promise<void> {
    if (this.polling) return
    this.polling = true
    try {
      const [data, teams] = await Promise.all([this.reader.read(), readTeams()])
      const next = build(data, Date.now(), teams)
      const first = !this.loaded
      const prev = this.current
      this.current = next
      this.loaded = true
      if (this.outage) {
        const resolved: Insight = {
          ...this.outage,
          state: 'resolved',
          resolvedAt: new Date().toISOString(),
        }
        this.outage = undefined
        this.broadcast({
          kind: 'event',
          event: this.serviceEvent(true),
          changes: { insights: [resolved] },
        })
      }
      if (first) this.broadcast({ kind: 'reset' })
      else this.diff(prev, next)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (!this.outage) {
        this.outage = this.problem(
          'Asana isn’t answering',
          `The last read of the Side Hustle project failed: ${message}.`,
          'The dashboard keeps showing the last data it read and tries again every few seconds.',
        )
        this.broadcast({
          kind: 'event',
          event: this.serviceEvent(false),
          changes: { insights: [this.outage] },
        })
      }
      console.error('[side-hustle] Asana read failed:', message)
    } finally {
      this.polling = false
    }
  }

  private serviceEvent(up: boolean): DashEvent {
    return {
      id: `e_asana_${up ? 'up' : 'down'}_${Date.now()}`,
      at: new Date().toISOString(),
      type: 'service.status',
      actor: { type: 'system', id: 'asana' },
      text: up
        ? 'Asana is answering again. The dashboard is up to date'
        : 'Asana isn’t answering. The dashboard shows the last data it read',
      related: [{ type: 'system', id: 'asana' }],
      data: { service: 'Asana', up },
    }
  }

  /** New events go out one by one; every changed entity rides along with the first. */
  private diff(prev: Built, next: Built): void {
    const changed = <T extends { id: string }>(a: T[], b: T[]) => {
      const old = new Map(a.map((x) => [x.id, JSON.stringify(x)]))
      return b.filter((x) => old.get(x.id) !== JSON.stringify(x))
    }
    const changes: Changes = {
      members: changed(prev.members, next.members),
      agents: changed(prev.agents, next.agents),
      tasks: changed(prev.tasks, next.tasks),
      insights: changed(prev.insights, next.insights),
      projects: changed(prev.projects, next.projects),
      usage: next.usage,
      week: next.week,
    }
    const seen = new Set(prev.events.map((e) => e.id))
    const fresh = next.events.filter((e) => !seen.has(e.id))
    // Something disappeared (a task deleted, an insight gone): start from a clean snapshot.
    const gone =
      prev.week.number !== next.week.number ||
      prev.tasks.some((x) => !next.tasks.some((y) => y.id === x.id)) ||
      prev.insights.some((x) => !next.insights.some((y) => y.id === x.id))
    if (gone) return this.broadcast({ kind: 'reset' })
    const anyChange =
      fresh.length > 0 ||
      [changes.members, changes.agents, changes.tasks, changes.insights, changes.projects].some(
        (l) => l!.length > 0,
      ) ||
      JSON.stringify(prev.week) !== JSON.stringify(next.week)
    if (!anyChange) return
    if (fresh.length === 0) return this.broadcast({ kind: 'reset' })
    fresh.forEach((event, i) =>
      this.broadcast({ kind: 'event', event, ...(i === 0 ? { changes } : {}) }),
    )
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

const g = globalThis as unknown as { __sideHustleAsana?: AsanaHub }

export function getAsanaHub(): AsanaHub {
  g.__sideHustleAsana ??= new AsanaHub()
  return g.__sideHustleAsana
}
