/**
 * Parsers for the comments the harness skills write on Asana tasks.
 * Formats: templates/task-description.md and skills/usage-reporting/SKILL.md
 * in jacogaz/side-hustle-harness.
 */
import type { ReviewCheck, TransitionReason } from '@/types'

const WEEK = '(\\d{4}-W\\d{2})'
const PCT = '([\\d.]+)%'
const SEP = '\\s*·\\s*'

const PLEDGE = new RegExp(`^Side hustle pledge:\\s*(.+?)${SEP}${PCT}${SEP}${WEEK}`)
const CLAIM = new RegExp(`^Side hustle claim:\\s*(.+?)${SEP}${PCT}${SEP}${WEEK}`)
const USAGE_HEAD = new RegExp(`^Side hustle usage:\\s*(.+?)${SEP}${WEEK}`)
const USAGE_LINE = /^(implementation|review|communication)\s*·\s*([^·]+?)\s*·.*?~([\d.]+)%/

export interface PledgeMarker {
  name: string
  pct: number
  week: string
}
export interface ClaimMarker {
  name: string
  pct: number
  week: string
}
export interface UsageLine {
  phase: 'implementation' | 'review' | 'communication'
  model: string
  pct: number
}
export interface UsageMarker {
  name: string
  week: string
  lines: UsageLine[]
}
export interface ReviewMarker {
  pass: boolean
  outcome: 'pass' | 'retry' | 'attempts_exhausted' | 'destructive' | 'unknown'
  attempt?: number
  check?: ReviewCheck
}

const firstLine = (text: string) => text.split('\n')[0]?.trim() ?? ''

export function parsePledge(text: string): PledgeMarker | undefined {
  const m = PLEDGE.exec(firstLine(text))
  return m ? { name: m[1]!, pct: Number(m[2]), week: m[3]! } : undefined
}

export function parseClaim(text: string): ClaimMarker | undefined {
  const m = CLAIM.exec(firstLine(text))
  return m ? { name: m[1]!, pct: Number(m[2]), week: m[3]! } : undefined
}

export function parseUsage(text: string): UsageMarker | undefined {
  const lines = text.split('\n').map((l) => l.trim())
  const head = USAGE_HEAD.exec(lines[0] ?? '')
  if (!head) return undefined
  const parsed: UsageLine[] = []
  for (const l of lines.slice(1)) {
    const m = USAGE_LINE.exec(l)
    if (m) parsed.push({ phase: m[1] as UsageLine['phase'], model: m[2]!, pct: Number(m[3]) })
  }
  return { name: head[1]!, week: head[2]!, lines: parsed }
}

/** `Side hustle released: <reason>` → the dashboard's transition reason. */
export function parseReleased(text: string): TransitionReason | undefined {
  const m = /^Side hustle released:\s*(.+)$/i.exec(firstLine(text))
  if (!m) return undefined
  const why = m[1]!.toLowerCase()
  if (why.includes('orphan')) return 'orphaned'
  if (why.includes('pledge')) return 'pledge_exhausted'
  if (why.includes('budget')) return 'budget_exhausted'
  return 'released'
}

export function parseReviewStarted(text: string): string | undefined {
  const m = /^Side hustle review started:\s*(.+)$/.exec(firstLine(text))
  return m?.[1]?.trim()
}

const CHECKS: [RegExp, ReviewCheck][] = [
  [/non[- ]?destructive/i, 'non_destructive'],
  [/scope/i, 'scope'],
  [/harness|tests?\b|lint/i, 'harness'],
  [/compliance|acceptance/i, 'compliance'],
]

export function parseReview(text: string): ReviewMarker | undefined {
  const m = /^Side hustle review:\s*(PASS|FAIL)\b/i.exec(firstLine(text))
  if (!m) return undefined
  const pass = m[1]!.toUpperCase() === 'PASS'
  const o =
    /Outcome:\s*(pass|retry\s*\(attempt\s*(\d+)\s*of\s*\d+\)|attempts exhausted|destructive)/i.exec(
      text,
    )
  let outcome: ReviewMarker['outcome'] = pass ? 'pass' : 'unknown'
  let attempt: number | undefined
  if (o) {
    const v = o[1]!.toLowerCase()
    if (v.startsWith('retry')) {
      outcome = 'retry'
      attempt = Number(o[2])
    } else if (v === 'attempts exhausted') outcome = 'attempts_exhausted'
    else if (v === 'destructive') outcome = 'destructive'
    else outcome = 'pass'
  }
  let check: ReviewCheck | undefined
  if (!pass) {
    // The report lists each check with its result; take the first one marked FAIL.
    for (const line of text.split('\n').slice(1)) {
      if (!/fail/i.test(line) || /^outcome:/i.test(line.trim())) continue
      const hit = CHECKS.find(([re]) => re.test(line))
      if (hit) {
        check = hit[1]
        break
      }
    }
    check ??= outcome === 'destructive' ? 'non_destructive' : 'compliance'
  }
  return { pass, outcome, attempt, check }
}

export type StalledMarker = 'stalled' | 'cleared'
export function parseStalled(text: string): StalledMarker | undefined {
  const l = firstLine(text)
  if (/^Side hustle stalled cleared\b/i.test(l)) return 'cleared'
  if (/^Side hustle stalled\b/i.test(l)) return 'stalled'
  return undefined
}

/** ISO 8601 week of a UTC time: label (2026-W46), and the Monday 00:00 UTC it starts. */
export function isoWeek(ms: number): { label: string; number: number; startsAt: number } {
  const d = new Date(ms)
  const day = (d.getUTCDay() + 6) % 7 // Monday = 0
  const monday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day)
  const thursday = new Date(monday + 3 * 86_400_000)
  const year = thursday.getUTCFullYear()
  const jan1 = Date.UTC(year, 0, 1)
  const number = Math.floor((thursday.getTime() - jan1) / (7 * 86_400_000)) + 1
  return { label: `${year}-W${String(number).padStart(2, '0')}`, number, startsAt: monday }
}
