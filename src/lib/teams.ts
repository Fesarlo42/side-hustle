import { useMemo } from 'react'
import { useDash } from '@/store/store'
import { teamPalette } from '@/theme'

export const TEAM_PALETTE = teamPalette

/** One colour per team, assigned in alphabetical order so it's stable across renders and pages. */
export function teamColors(teams: Iterable<string>): Record<string, string> {
  const sorted = [...new Set(teams)].sort((a, b) => a.localeCompare(b))
  return Object.fromEntries(
    sorted.map((t, i) => [t, TEAM_PALETTE[i % TEAM_PALETTE.length] as string]),
  )
}

/** Team colours for everyone currently in the pool. */
export function useTeamColors(): Record<string, string> {
  const members = useDash((s) => s.members)
  return useMemo(() => teamColors(Object.values(members).map((m) => m.team)), [members])
}
