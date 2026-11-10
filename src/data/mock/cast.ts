/**
 * Mock cast: 15 fictional members across 4 teams, 6 projects.
 * Replace with real people later by swapping the server data source
 * (see src/server/source.ts). Nothing in the UI depends on these names.
 */
import type { PledgeSource, TaskSize } from '@/types'

export type Persona = 'busy_owner' | 'generous_picker' | 'balanced' | 'silent'

export interface CastMember {
  id: string
  name: string
  team: string
  persona: Persona
  pledgePct: number
  pledgeSource: PledgeSource
  /** Pledge already used by the demo start (Sunday 17:00). */
  usedAtStart: number
  /** Max tasks the agent holds at once. */
  maxConcurrency: number
  joinedAt: string
}

export const TEAMS = ['Design', 'Payments', 'Platform', 'Support'] as const

const OLD = '2026-10-05T09:00:00Z'

export const CAST: CastMember[] = [
  // Busy owners: publish most tasks, small pledges
  {
    id: 'm_sofia',
    name: 'Sofia Almeida',
    team: 'Payments',
    persona: 'busy_owner',
    pledgePct: 3,
    pledgeSource: 'answered',
    usedAtStart: 0,
    maxConcurrency: 1,
    joinedAt: OLD,
  },
  {
    id: 'm_tiago',
    name: 'Tiago Mendes',
    team: 'Platform',
    persona: 'busy_owner',
    pledgePct: 2,
    pledgeSource: 'answered',
    usedAtStart: 0,
    maxConcurrency: 1,
    joinedAt: OLD,
  },
  {
    id: 'm_ines',
    name: 'Inês Rocha',
    team: 'Design',
    persona: 'busy_owner',
    pledgePct: 5,
    pledgeSource: 'answered',
    usedAtStart: 0,
    maxConcurrency: 1,
    joinedAt: OLD,
  },
  {
    id: 'm_pedro',
    name: 'Pedro Santos',
    team: 'Support',
    persona: 'busy_owner',
    pledgePct: 4,
    pledgeSource: 'answered',
    usedAtStart: 0,
    maxConcurrency: 1,
    joinedAt: OLD,
  },
  // Generous pickers: pledge 25–40%, claim most tasks
  {
    id: 'm_ana',
    name: 'Ana Silva',
    team: 'Design',
    persona: 'generous_picker',
    pledgePct: 30,
    pledgeSource: 'answered',
    usedAtStart: 24,
    maxConcurrency: 1,
    joinedAt: OLD,
  },
  {
    id: 'm_rita',
    name: 'Rita Ferreira',
    team: 'Platform',
    persona: 'generous_picker',
    pledgePct: 40,
    pledgeSource: 'answered',
    usedAtStart: 22,
    maxConcurrency: 2,
    joinedAt: OLD,
  },
  {
    id: 'm_rui',
    name: 'Rui Carvalho',
    team: 'Platform',
    persona: 'generous_picker',
    pledgePct: 30,
    pledgeSource: 'answered',
    usedAtStart: 12,
    maxConcurrency: 2,
    joinedAt: OLD,
  },
  {
    id: 'm_joao',
    name: 'João Pereira',
    team: 'Support',
    persona: 'generous_picker',
    pledgePct: 25,
    pledgeSource: 'answered',
    usedAtStart: 12,
    maxConcurrency: 2,
    joinedAt: OLD,
  },
  // Balanced: pledge 5–15%
  {
    id: 'm_bruno',
    name: 'Bruno Costa',
    team: 'Payments',
    persona: 'balanced',
    pledgePct: 10,
    pledgeSource: 'answered',
    usedAtStart: 5,
    maxConcurrency: 1,
    joinedAt: OLD,
  },
  {
    id: 'm_carla',
    name: 'Carla Nunes',
    team: 'Support',
    persona: 'balanced',
    pledgePct: 15,
    pledgeSource: 'answered',
    usedAtStart: 4,
    maxConcurrency: 1,
    joinedAt: OLD,
  },
  {
    id: 'm_diogo',
    name: 'Diogo Lopes',
    team: 'Payments',
    persona: 'balanced',
    pledgePct: 8,
    pledgeSource: 'answered',
    usedAtStart: 3,
    maxConcurrency: 1,
    joinedAt: OLD,
  },
  {
    id: 'm_helena',
    name: 'Helena Matos',
    team: 'Design',
    persona: 'balanced',
    pledgePct: 12,
    pledgeSource: 'answered',
    usedAtStart: 2,
    maxConcurrency: 1,
    joinedAt: OLD,
  },
  {
    id: 'm_miguel',
    name: 'Miguel Sousa',
    team: 'Platform',
    persona: 'balanced',
    pledgePct: 5,
    pledgeSource: 'answered',
    usedAtStart: 0,
    maxConcurrency: 1,
    joinedAt: OLD,
  },
  // Silent: no answer this week
  {
    id: 'm_marta',
    name: 'Marta Ribeiro',
    team: 'Support',
    persona: 'silent',
    pledgePct: 10,
    pledgeSource: 'carried_over',
    usedAtStart: 2,
    maxConcurrency: 1,
    joinedAt: OLD,
  },
  {
    id: 'm_leo',
    name: 'Leo Martins',
    team: 'Payments',
    persona: 'silent',
    pledgePct: 0,
    pledgeSource: 'default_zero',
    usedAtStart: 0,
    maxConcurrency: 1,
    joinedAt: '2026-11-11T14:20:00Z',
  },
]

export interface CastProject {
  id: string
  name: string
  team: string
  titles: string[]
}

export const PROJECTS: CastProject[] = [
  {
    id: 'p_checkout',
    name: 'Checkout revamp',
    team: 'Payments',
    titles: [
      'Refactor payment form tests',
      'Add retry to card tokenisation',
      'Split checkout summary component',
      'Localise payment error messages',
      'Remove legacy coupon endpoint',
      'Add VAT line to order summary',
      'Clean up checkout feature flags',
      'Type the payment provider client',
    ],
  },
  {
    id: 'p_billing',
    name: 'Billing emails',
    team: 'Payments',
    titles: [
      'Rewrite invoice email template',
      'Add dunning reminder copy',
      'Fix currency format in receipts',
      'Snapshot tests for billing emails',
      'Move email strings to translations',
    ],
  },
  {
    id: 'p_tokens',
    name: 'Design tokens audit',
    team: 'Design',
    titles: [
      'List hard-coded colours in the app',
      'Map spacing values to tokens',
      'Document icon sizes',
      'Replace custom shadows with tokens',
      'Audit focus states on buttons',
    ],
  },
  {
    id: 'p_status',
    name: 'Status page',
    team: 'Platform',
    titles: [
      'Add incident history view',
      'Health check for the mail queue',
      'Status badge for the help center',
      'Write runbook for status updates',
    ],
  },
  {
    id: 'p_ci',
    name: 'CI speedups',
    team: 'Platform',
    titles: [
      'Cache node_modules between jobs',
      'Split slow e2e suite in shards',
      'Drop unused Docker layers',
      'Flaky test report in the pipeline',
      'Parallelise lint and typecheck',
    ],
  },
  {
    id: 'p_help',
    name: 'Help center search',
    team: 'Support',
    titles: [
      'Synonyms for billing searches',
      'Track searches with no results',
      'Index the new refund articles',
      'Highlight matches in results',
      'Tidy up the search analytics page',
    ],
  },
]

export const MODELS = ['Sonnet 5.5', 'Opus 5.5', 'Haiku 5.5'] as const

export const BUDGET_BY_SIZE: Record<TaskSize, number> = { S: 2, M: 5, L: 10 }

/** Link target for mock tasks: the Side Hustle Asana project (no real task behind it). */
export const ASANA_PROJECT_URL = 'https://app.asana.com/1/13327221380952/project/1220379119011503'

export function firstName(name: string): string {
  return name.split(' ')[0] ?? name
}
