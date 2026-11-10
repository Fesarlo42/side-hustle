'use client'
/**
 * The single store. Fed by a DataSource (snapshot, then stream messages).
 * Every panel reads from here.
 */
import { create } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import type { ConnectionStatus, DataSource } from '@/data/source'
import type { DemoCommand } from '@/types'
import { applyMessage, applySnapshot, initialData, type DataState } from './reducer'

export interface UiState {
  connection: ConnectionStatus
  /** Wall-clock ms of the last message from the source. */
  lastMessageAt?: number
  selectedMemberId?: string
  /** Manual reduced-motion toggle; OS setting is combined with it in useReducedMotionPref. */
  reducedMotionOverride?: boolean
  devBarHidden: boolean
}

export interface DashStore extends DataState, UiState {
  connect(source: DataSource): () => void
  selectMember(id?: string): void
  setReducedMotion(value?: boolean): void
  toggleDevBar(): void
  command(cmd: DemoCommand): Promise<void>
}

let activeSource: DataSource | undefined

export const useDash = create<DashStore>()((set, get) => ({
  ...initialData,
  connection: 'connecting',
  devBarHidden: false,

  connect(source) {
    activeSource = source
    let closed = false
    const load = async () => {
      try {
        const snap = await source.getSnapshot()
        if (!closed) set((s) => ({ ...applySnapshot(s, snap), lastMessageAt: Date.now() }))
      } catch {
        if (!closed) set({ connection: 'offline' })
      }
    }
    let wasDown = false
    const unsubscribe = source.subscribe(
      (msg) => {
        set((s) => ({ ...applyMessage(s, msg), lastMessageAt: Date.now() }))
        if (get().needsSnapshot) void load()
      },
      (status) => {
        set({ connection: status })
        // After a drop, ask for a fresh snapshot (spec: "Connection lost").
        if (status !== 'live') wasDown = true
        else if (wasDown) {
          wasDown = false
          void load()
        }
      },
    )
    void load()
    return () => {
      closed = true
      unsubscribe()
    }
  },

  selectMember(id) {
    set((s) => ({ selectedMemberId: s.selectedMemberId === id ? undefined : id }))
  },

  setReducedMotion(value) {
    set({ reducedMotionOverride: value })
  },

  toggleDevBar() {
    set((s) => ({ devBarHidden: !s.devBarHidden }))
  },

  async command(cmd) {
    await activeSource?.command?.(cmd)
  },
}))

const DATA_KEYS = [
  'loaded',
  'members',
  'projects',
  'agents',
  'tasks',
  'insights',
  'events',
  'usage',
  'pulse',
  'week',
  'config',
  'demo',
  'rippleSeq',
  'needsSnapshot',
] as const satisfies readonly (keyof DataState)[]

/** The data part of the store, stable while nothing changes. Feed it to selectors with useMemo. */
export function useData(): DataState {
  return useDash(
    useShallow((s) => {
      const out = {} as Record<string, unknown>
      for (const k of DATA_KEYS) out[k] = s[k]
      return out as unknown as DataState
    }),
  )
}

/** Point at the thing a status line, insight or log row is about. */
export function focusRef(ref: { type: string; id: string } | undefined): void {
  if (!ref) return
  if (ref.type === 'member') {
    useDash.getState().selectMember(ref.id)
    return
  }
  const el = document.getElementById(`${ref.type}-${ref.id}`)
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  el.animate?.(
    [{ outlineColor: 'var(--lumen-color-action-primary)' }, { outlineColor: 'transparent' }],
    { duration: 1600 },
  )
  el.style.outline = '3px solid transparent'
}
