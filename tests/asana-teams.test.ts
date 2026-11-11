import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { build, type AsanaData } from '@/server/asana/build'
import { readTeams, teamFor } from '@/server/asana/teams'

const NOW = Date.parse('2026-11-11T12:00:00Z')
const data: AsanaData = {
  project: {
    gid: 'p1',
    name: 'Side Hustle',
    members: [
      { gid: '1', name: 'Fernanda Gomes' },
      { gid: '2', name: 'Inês Rocha' },
      { gid: '3', name: 'Someone New' },
    ],
  },
  tasks: [],
  stories: {},
}

describe('departments for the Asana source', () => {
  it('uses the teams map for each person, matched by name', () => {
    const b = build(data, NOW, { 'Fernanda Gomes': 'Engineering', 'ines rocha': 'Design' })
    const team = (name: string) => b.members.find((m) => m.name === name)?.team
    expect(team('Fernanda Gomes')).toBe('Engineering')
    expect(team('Inês Rocha')).toBe('Design')
    expect(team('Someone New')).toBe('iubenda')
  })

  it('keeps everyone in iubenda without a map', () => {
    expect(new Set(build(data, NOW).members.map((m) => m.team))).toEqual(new Set(['iubenda']))
  })

  it('matches names ignoring case, accents and extra spaces', () => {
    const map = { 'Inês  Rocha': 'Design' }
    expect(teamFor('ines rocha', map)).toBe('Design')
    expect(teamFor('INÊS ROCHA', map)).toBe('Design')
    expect(teamFor('Nobody', map)).toBeUndefined()
  })

  it('reads data/teams.json and treats a missing or broken file as empty', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'sh-teams-'))
    const file = path.join(dir, 'teams.json')
    expect(await readTeams(file)).toEqual({})
    writeFileSync(file, JSON.stringify({ 'Fernanda Gomes': 'Engineering' }))
    expect(await readTeams(file)).toEqual({ 'Fernanda Gomes': 'Engineering' })
    writeFileSync(file, '{ not json')
    expect(await readTeams(file)).toEqual({})
  })
})
