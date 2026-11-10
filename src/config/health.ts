import type { Health, Insight, Task } from '@/types'

/**
 * Health rules for the core (spec: "Health states"). Tune here before the demo.
 */
export const HEALTH_RULES = {
  /** Strained from this share of all pledges used (0–1). */
  strainedUsedRatio: 0.7,
  /** Critical above this share of all pledges used (0–1). */
  criticalUsedRatio: 0.9,
  /**
   * A heads-up insight makes the core strained once it has been open this long.
   * The spec says 15 min. Lowered to 2 so the short Asana outage in the scripted
   * demo (about 8 simulated minutes) shows as strained. Raise it for real data.
   */
  headsUpStrainedAfterMin: 2,
} as const

export interface HealthInput {
  poolTotalPct: number
  poolUsedPct: number
  tasks: Pick<Task, 'flag' | 'section'>[]
  insights: Pick<Insight, 'severity' | 'state' | 'openedAt'>[]
  now: number
}

const ACTIVE_SECTIONS = new Set(['doing', 'to_review', 'qa_review', 'needs_info', 'next', 'open'])

export function computeHealth(input: HealthInput, rules = HEALTH_RULES): Health {
  const ratio = input.poolTotalPct > 0 ? input.poolUsedPct / input.poolTotalPct : 0
  const openInsights = input.insights.filter((i) => i.state !== 'resolved')

  if (ratio > rules.criticalUsedRatio) return 'critical'
  if (openInsights.some((i) => i.severity === 'attention')) return 'critical'

  if (ratio >= rules.strainedUsedRatio) return 'strained'
  if (input.tasks.some((t) => t.flag && ACTIVE_SECTIONS.has(t.section))) return 'strained'
  const strainAfterMs = rules.headsUpStrainedAfterMin * 60_000
  if (
    openInsights.some(
      (i) => i.severity === 'heads_up' && input.now - Date.parse(i.openedAt) >= strainAfterMs,
    )
  )
    return 'strained'

  return 'calm'
}
