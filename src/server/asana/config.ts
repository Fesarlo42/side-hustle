/**
 * Where the side hustle lives in Asana, and the shared workflow settings.
 *
 * Mirrors `config/global.yaml` in jacogaz/side-hustle-harness (main, 10 Nov 2026).
 * Change it there first, then here.
 */
import type { Section, TaskSize, WorkflowConfig } from '@/types'

export const ASANA = {
  projectGid: process.env.SIDE_HUSTLE_ASANA_PROJECT ?? '1220379119011503',
  /** "Side hustle ledger (system, do not pick up)": holds the pledge records. */
  ledgerTaskGid: process.env.SIDE_HUSTLE_ASANA_LEDGER ?? '1220392106821888',
  sections: {
    '1220379100159455': 'open',
    '1220379121415094': 'doing',
    '1220379100149619': 'to_review',
    '1220378651843995': 'qa_review',
    '1220379121354363': 'next',
    '1220379034141540': 'needs_info',
    '1220378955636623': 'done',
  } as Record<string, Section>,
  fields: {
    estimate: '1220385930092876',
    /** A fraction: 0.05 = 5% of the weekly limit. */
    budget: '1220385930092881',
    lastHeartbeat: '1220385930092883',
  },
} as const

export const BUDGET_BY_SIZE: Record<TaskSize, number> = { S: 2, M: 5, L: 10 }

export const WORKFLOW: WorkflowConfig = {
  maxReviewAttempts: 3,
  heartbeatTimeoutMin: 2 * 60,
  needsInfoTimeoutH: 24,
  budgetBySize: BUDGET_BY_SIZE,
}

/** Section names as Asana shows them, for stories that only carry a name. */
export const SECTION_BY_NAME: Record<string, Section> = {
  open: 'open',
  doing: 'doing',
  'to review': 'to_review',
  'qa review': 'qa_review',
  next: 'next',
  'needs info': 'needs_info',
  done: 'done',
}

/** Shown as the project and team when a task names no target we recognise. */
export const DEFAULT_PROJECT = { id: 'p_side_hustle', name: 'Side Hustle', team: 'iubenda' }
