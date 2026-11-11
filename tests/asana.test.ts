import { describe, expect, it } from 'vitest'
import {
  build,
  buildPulse,
  type AsanaData,
  type RawStory,
  type RawTask,
} from '@/server/asana/build'
import { ASANA } from '@/server/asana/config'
import { isoWeek, parseClaim, parsePledge, parseReview, parseUsage } from '@/server/asana/markers'
import { applySnapshot, initialData } from '@/store/reducer'

// Shapes and texts copied from the live Side Hustle project (11 Nov 2026).
const JUAN = { gid: '1209701618570331', name: 'Juan Garcia' }
const AERT = { gid: '1206285995549339', name: 'Aert Hulsebos' }
const KEES = { gid: '1209397260650422', name: 'Kees van den Bos' }
const SEC = Object.fromEntries(
  Object.entries(ASANA.sections).map(([gid, s]) => [s, { gid, name: s }]),
)
const NOW = Date.parse('2026-11-11T11:00:00Z')

function task(p: Partial<RawTask> & { gid: string; section: string }): RawTask {
  const { section, ...rest } = p
  return {
    name: p.gid,
    created_at: '2026-11-10T09:00:00Z',
    created_by: JUAN,
    completed: section === 'done',
    assignee: JUAN,
    memberships: [{ project: { gid: ASANA.projectGid }, section: SEC[section] }],
    custom_fields: [],
    permalink_url: `https://app.asana.com/x/${p.gid}`,
    modified_at: '2026-11-11T10:00:00Z',
    ...rest,
  }
}
const comment = (gid: string, at: string, text: string, by = JUAN): RawStory => ({
  gid,
  created_at: at,
  created_by: by,
  resource_subtype: 'comment_added',
  type: 'comment',
  text,
})
const move = (gid: string, at: string, from: string, to: string, by = JUAN): RawStory => ({
  gid,
  created_at: at,
  created_by: by,
  resource_subtype: 'section_changed',
  type: 'system',
  text: `moved this task from "${from}" to "${to}"`,
  old_section: SEC[from],
  new_section: SEC[to],
})

const data: AsanaData = {
  project: {
    gid: ASANA.projectGid,
    name: 'Side Hustle',
    created_at: '2026-11-10T09:53:30Z',
    members: [JUAN, AERT, KEES],
  },
  tasks: [
    task({
      gid: 'review1',
      section: 'to_review',
      name: 'Create 2 test tasks in Side Hustle Test Target',
      notes:
        '## Target resource\nhttps://app.asana.com/1/13327221380952/project/1220418695007591\n',
      created_at: '2026-11-11T10:39:47Z',
      custom_fields: [
        { gid: ASANA.fields.estimate, display_value: 'S', enum_value: { name: 'S' } },
        { gid: ASANA.fields.budget, display_value: '0.02', number_value: 0.02 },
        {
          gid: ASANA.fields.lastHeartbeat,
          display_value: '2026-11-11T10:48:00.000Z',
          date_value: { date: '2026-11-11', date_time: '2026-11-11T10:48:00.000Z' },
        },
      ],
    }),
    task({
      gid: 'done1',
      section: 'done',
      name: 'Harness: reviewer skill',
      notes: '## Target resource\nhttps://github.com/jacogaz/side-hustle-harness\n',
      created_by: AERT,
      assignee: KEES,
      custom_fields: [
        { gid: ASANA.fields.estimate, display_value: 'M', enum_value: { name: 'M' } },
      ],
    }),
    task({
      gid: ASANA.ledgerTaskGid,
      section: 'done',
      name: 'Side hustle ledger (system, do not pick up)',
    }),
    task({ gid: 'stale', section: 'doing', name: 'Forgotten task', created_by: AERT }),
  ],
  stories: {
    review1: [
      move('s1', '2026-11-11T10:46:40Z', 'open', 'doing'),
      comment('c1', '2026-11-11T10:46:48Z', 'Side hustle claim: Juan Garcia · 2% · 2026-W46'),
      move('s2', '2026-11-11T10:47:10Z', 'doing', 'to_review'),
      comment('c2', '2026-11-11T10:47:17Z', 'Side hustle review started: Juan Garcia'),
    ],
    done1: [
      move('d1', '2026-11-10T12:00:00Z', 'open', 'doing', KEES),
      comment(
        'd2',
        '2026-11-10T12:00:05Z',
        'Side hustle claim: Kees van den Bos · 5% · 2026-W46',
        KEES,
      ),
      move('d3', '2026-11-10T13:00:00Z', 'doing', 'to_review', KEES),
      comment(
        'd4',
        '2026-11-10T13:10:00Z',
        'Side hustle review: FAIL\nOutcome: retry (attempt 1 of 3)\n1. Compliance: PASS\n2. Scope: FAIL, touched an unrelated file\n3. Non-destructive: PASS\n4. Harness: PASS',
        JUAN,
      ),
      move('d5', '2026-11-10T13:10:05Z', 'to_review', 'doing', JUAN),
      move('d6', '2026-11-10T14:00:00Z', 'doing', 'to_review', KEES),
      comment('d7', '2026-11-10T14:05:00Z', 'Side hustle review: PASS\nOutcome: pass', JUAN),
      move('d8', '2026-11-10T14:05:05Z', 'to_review', 'qa_review', JUAN),
      comment(
        'd9',
        '2026-11-10T14:30:00Z',
        'Side hustle usage: Kees van den Bos · 2026-W46 · 2026-11-10T12:00Z\nimplementation · claude-sonnet-5-5 · 1200000 tokens (measured) · ~$4 · ~2.4% of weekly limit (estimate)\nreview · claude-opus-5-5 · 300000 tokens (measured) · n/a · ~0.6% of weekly limit (estimate)',
        KEES,
      ),
      move('d10', '2026-11-10T15:49:52Z', 'qa_review', 'done', AERT),
    ],
    [ASANA.ledgerTaskGid]: [
      comment('l1', '2026-11-04T09:00:00Z', 'Side hustle pledge: Juan Garcia · 20% · 2026-W45'),
      comment('l2', '2026-11-11T10:47:31Z', 'Side hustle pledge: Juan Garcia · 10% · 2026-W46'),
      comment(
        'l3',
        '2026-11-11T09:00:00Z',
        'Side hustle pledge: Kees van den Bos · 30% · 2026-W46',
        KEES,
      ),
    ],
    stale: [move('x1', '2026-11-11T06:00:00Z', 'open', 'doing', AERT)],
  },
}

describe('Asana markers', () => {
  it('parses pledge, claim, review and usage comments', () => {
    expect(parsePledge('Side hustle pledge: Juan Garcia · 10% · 2026-W46')).toEqual({
      name: 'Juan Garcia',
      pct: 10,
      week: '2026-W46',
    })
    expect(parseClaim('Side hustle claim: Juan Garcia · 2% · 2026-W46')?.pct).toBe(2)
    expect(
      parseReview('Side hustle review: FAIL\nOutcome: destructive\n3. Non-destructive: FAIL'),
    ).toMatchObject({ pass: false, outcome: 'destructive', check: 'non_destructive' })
    expect(parseUsage(data.stories.done1![8]!.text!)?.lines).toEqual([
      { phase: 'implementation', model: 'claude-sonnet-5-5', pct: 2.4 },
      { phase: 'review', model: 'claude-opus-5-5', pct: 0.6 },
    ])
  })

  it('computes ISO weeks', () => {
    expect(isoWeek(NOW).label).toBe('2026-W46')
    expect(new Date(isoWeek(NOW).startsAt).toISOString()).toBe('2026-11-09T00:00:00.000Z')
    expect(isoWeek(Date.parse('2027-01-01T12:00:00Z')).label).toBe('2026-W53')
  })
})

describe('build', () => {
  const b = build(data, NOW)
  const byId = (id: string) => b.tasks.find((x) => x.id === `t_${id}`)!

  it('leaves the ledger out of the tasks', () => {
    expect(b.tasks.map((x) => x.id).sort()).toEqual(['t_done1', 't_review1', 't_stale'])
  })

  it('maps a task in review', () => {
    const t = byId('review1')
    expect(t).toMatchObject({
      section: 'to_review',
      ownerId: `u_${JUAN.gid}`,
      pickerId: `u_${JUAN.gid}`,
      reviewerAgentId: `a_rev_u_${JUAN.gid}`,
      size: 'S',
      budgetPct: 2,
      reviewAttempts: 1,
      lastHeartbeatAt: '2026-11-11T10:48:00.000Z',
      projectId: 'p_asana',
    })
    expect(t.flag).toBeUndefined()
    expect(t.sectionLog.map((s) => s.section)).toEqual(['open', 'doing', 'to_review'])
  })

  it('maps a finished task with a failed review and usage', () => {
    const t = byId('done1')
    expect(t).toMatchObject({
      section: 'done',
      ownerId: `u_${AERT.gid}`,
      pickerId: `u_${KEES.gid}`,
      budgetPct: 5,
      usedPct: 3,
      model: 'claude-sonnet-5-5',
      doneAt: '2026-11-10T15:49:52.000Z',
      projectId: 'p_jacogaz_side-hustle-harness',
    })
    expect(t.reviewFailures).toEqual([
      { check: 'scope', at: '2026-11-10T13:10:00.000Z', destructive: false },
    ])
  })

  it('flags a task in Doing with no heartbeat past the timeout', () => {
    expect(byId('stale').flag).toBe('orphaned')
    expect(b.insights.map((i) => i.id)).toContain('i_orphan_stale')
  })

  it('takes this week’s pledges from the ledger and pledge used from claims', () => {
    const juan = b.members.find((m) => m.id === `u_${JUAN.gid}`)!
    const kees = b.members.find((m) => m.id === `u_${KEES.gid}`)!
    const aert = b.members.find((m) => m.id === `u_${AERT.gid}`)!
    expect(juan).toMatchObject({
      pledgePct: 10,
      pledgeSource: 'answered',
      pledgeUsedPct: 2,
      status: 'working',
    })
    expect(kees).toMatchObject({ pledgePct: 30, pledgeUsedPct: 5, status: 'idle' })
    expect(aert).toMatchObject({ pledgePct: 0, pledgeSource: 'pending', status: 'offline' })
    expect(b.week).toMatchObject({ number: 46, answeredCount: 2, memberCount: 3 })
    expect(b.usage.reduce((s, u) => s + u.usedPct, 0)).toBe(7)
  })

  it('turns stories into log events, oldest first', () => {
    const types = b.events.map((e) => e.type)
    expect(types).toContain('task.approved')
    expect(types).toContain('review.failed')
    expect(types).toContain('pledge.answered')
    const at = b.events.map((e) => Date.parse(e.at))
    expect([...at].sort((x, y) => x - y)).toEqual(at)
    expect(b.events.find((e) => e.id === 'e_d10')?.text).toBe(
      'Aert approved “Harness: reviewer skill”. Done!',
    )
  })

  it('gives a pulse and a snapshot the store accepts', () => {
    const pulse = buildPulse(b, b.insights, NOW)
    expect(pulse).toMatchObject({
      poolTotalPct: 40,
      poolUsedPct: 7,
      tasksInFlight: 2,
      health: 'strained',
    })
    const state = applySnapshot(initialData, { ...b, pulse })
    expect(Object.keys(state.tasks)).toHaveLength(3)
  })
})
