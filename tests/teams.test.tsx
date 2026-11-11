// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Members } from '@/components/Members/Members'
import { TEAM_PALETTE, teamColors } from '@/lib/teams'
import { member, snapshot } from './fixtures'
import { seedStore } from './store-helpers'

describe('team colours', () => {
  it('gives every team its own colour, stable by name', () => {
    const c = teamColors(['Support', 'Design', 'Platform', 'Payments', 'Design'])
    expect(Object.keys(c)).toEqual(['Design', 'Payments', 'Platform', 'Support'])
    expect(new Set(Object.values(c)).size).toBe(4)
    expect(teamColors(['Design', 'Support']).Design).toBe(c.Design)
  })

  it('cycles the palette when there are more teams than colours', () => {
    const teams = Array.from(
      { length: TEAM_PALETTE.length + 1 },
      (_, i) => `T${String(i).padStart(2, '0')}`,
    )
    const c = teamColors(teams)
    expect(c[teams[TEAM_PALETTE.length] as string]).toBe(c[teams[0] as string])
  })

  it('colours each person by team, with a legend that names the teams', () => {
    seedStore(
      snapshot({
        members: [
          member({
            id: 'm_ana',
            name: 'Ana Silva',
            team: 'Design',
            pledgePct: 30,
            pledgeUsedPct: 10,
          }),
          member({
            id: 'm_rui',
            name: 'Rui Carvalho',
            team: 'Platform',
            pledgePct: 30,
            pledgeUsedPct: 10,
          }),
        ],
      }),
    )
    render(<Members />)
    const legend = screen.getByRole('list', { name: 'Teams' })
    expect(
      within(legend)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Design', 'Platform'])
    const colors = teamColors(['Design', 'Platform'])
    const ana = screen.getByRole('button', { name: 'Ana Silva' })
    expect(ana.style.getPropertyValue('--team')).toBe(colors.Design)
    const rui = screen.getByRole('button', { name: 'Rui Carvalho' })
    expect(rui.style.getPropertyValue('--team')).toBe(colors.Platform)
  })
})

describe('team colours elsewhere', () => {
  it('rings each dot in the core with its team colour', async () => {
    const { Core } = await import('@/components/Core/Core')
    render(
      <Core
        heartbeatsPerMin={0}
        poolLeft={0.5}
        health="calm"
        members={[
          {
            id: 'a',
            name: 'Ana Silva',
            ring: 'outer',
            offline: false,
            faded: false,
            teamColor: 'var(--lumen-green-500)',
          },
        ]}
        flows={[]}
        rippleSeq={0}
        wobble={false}
        reducedMotion
        label="Calm"
      />,
    )
    const rings = document.querySelectorAll('[data-team-ring]')
    expect(rings).toHaveLength(1)
    expect(rings[0]).toHaveAttribute('stroke', 'var(--lumen-green-500)')
  })

  it('rings avatars on work cards with the team colour', async () => {
    const { WorkCards } = await import('@/components/WorkCards/WorkCards')
    const { task } = await import('./fixtures')
    seedStore(
      snapshot({
        members: [
          member({ id: 'm_ana', name: 'Ana Silva', team: 'Design' }),
          member({ id: 'm_rui', name: 'Rui Carvalho', team: 'Platform' }),
        ],
        tasks: [
          task({
            id: 't1',
            title: 'A task',
            section: 'doing',
            ownerId: 'm_ana',
            pickerId: 'm_rui',
          }),
        ],
      }),
    )
    render(<WorkCards />)
    const colors = teamColors(['Design', 'Platform'])
    // jsdom normalises colours (hex → rgb), so compare through the same parser.
    const norm = (c?: string) => {
      const el = document.createElement('div')
      el.style.borderColor = c ?? ''
      return el.style.borderColor
    }
    expect(screen.getByRole('img', { name: 'Owner: Ana Silva' }).style.borderColor).toBe(
      norm(colors.Design),
    )
    expect(screen.getByRole('img', { name: 'Picker: Rui Carvalho' }).style.borderColor).toBe(
      norm(colors.Platform),
    )
  })
})

describe('palette', () => {
  it('avoids the primary blue / green / red / yellow look', () => {
    const primaries = /--lumen-(blue|green|red|yellow)-500/
    for (const c of TEAM_PALETTE) expect(c).not.toMatch(primaries)
    expect(new Set(TEAM_PALETTE).size).toBe(TEAM_PALETTE.length)
    expect(TEAM_PALETTE.length).toBeGreaterThanOrEqual(6)
  })
})
