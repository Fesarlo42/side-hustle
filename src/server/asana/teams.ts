/**
 * Departments for the Asana source. Asana has no department field, so a small
 * git-ignored file maps names to departments: data/teams.json, e.g.
 *   { "Fernanda Gomes": "Engineering", "Aert Hulsebos": "Product" }
 * It can be written by hand or by Claude from Slack profile titles.
 * People it doesn't list stay in the default team.
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'

export type TeamMap = Record<string, string>

export const TEAMS_FILE =
  process.env.SIDE_HUSTLE_TEAMS_FILE ?? path.join(process.cwd(), 'data', 'teams.json')

const key = (name: string) =>
  name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase()

/** The department for a person, matched by name ignoring case, accents and spacing. */
export function teamFor(name: string, map: TeamMap): string | undefined {
  const k = key(name)
  for (const [n, team] of Object.entries(map)) if (key(n) === k && team.trim()) return team.trim()
  return undefined
}

/** Reads the map; a missing or broken file means "no departments". */
export async function readTeams(file = TEAMS_FILE): Promise<TeamMap> {
  try {
    const json = JSON.parse(await readFile(file, 'utf8')) as unknown
    if (!json || typeof json !== 'object' || Array.isArray(json)) return {}
    return Object.fromEntries(
      Object.entries(json).filter((e): e is [string, string] => typeof e[1] === 'string'),
    )
  } catch {
    return {}
  }
}
