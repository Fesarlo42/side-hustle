import { applySnapshot, initialData } from '@/store/reducer'
import { useDash } from '@/store/store'
import type { Snapshot } from '@/types'

/** Load a snapshot straight into the store for a component test. */
export function seedStore(
  snap: Snapshot,
  ui: Partial<ReturnType<typeof useDash.getState>> = {},
): void {
  useDash.setState({
    ...applySnapshot(initialData, snap),
    connection: 'live',
    lastMessageAt: Date.now(),
    selectedMemberId: undefined,
    reducedMotionOverride: true,
    ...ui,
  })
}
