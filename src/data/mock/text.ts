/**
 * Voice for log lines, insights and the status line.
 * Human, warm, plain, a little playful. About the agents, never "I". No jargon.
 * People are referred to by name, never by pronoun.
 */
import type { ReviewCheck, Section } from '@/types'

export const SECTION_LABEL: Record<Section, string> = {
  open: 'Open',
  doing: 'Doing',
  to_review: 'To Review',
  qa_review: 'QA Review',
  next: 'Next',
  needs_info: 'Needs Info',
  done: 'Done',
}

export const CHECK_LABEL: Record<ReviewCheck, string> = {
  compliance: 'acceptance criteria',
  scope: 'scope',
  non_destructive: 'non-destructive',
  harness: 'tests and lint',
}

const q = (title: string) => `“${title}”`

export const say = {
  published: (owner: string, title: string, project: string) =>
    `${owner} published ${q(title)} in ${project}`,
  claimed: (picker: string, title: string) => `${picker}’s agent claimed ${q(title)}`,
  claimedHandover: (picker: string, title: string, prev: string) =>
    `${picker}’s agent picked up ${q(title)} where ${prev}’s agent left off`,
  toReview: (picker: string, title: string) =>
    `${picker}’s agent finished ${q(title)} and sent it to review`,
  reviewPassed: (title: string, owner: string) =>
    `The reviewer passed ${q(title)}. It’s with ${owner} for a final look`,
  reviewFailed: (title: string, check: ReviewCheck, attempt: number, max: number) =>
    `The reviewer sent ${q(title)} back: the ${CHECK_LABEL[check]} check failed. Review ${attempt} of ${max} next`,
  attemptsExhausted: (title: string) =>
    `${q(title)} failed review too many times, so it moved to Needs Info for the owner`,
  approved: (owner: string, title: string) => `${owner} approved ${q(title)}. Done!`,
  rejected: (owner: string, title: string) =>
    `${owner} sent ${q(title)} back to Next with notes in Asana`,
  releasedOrphaned: (title: string, prev: string) =>
    `${q(title)} was released to Next after ${prev}’s agent missed the heartbeat timeout`,
  releasedPledge: (picker: string, title: string) =>
    `${picker}’s pledge ran out, so ${picker}’s agent documented ${q(title)} in Asana and released it to Next`,
  flaggedOrphaned: (picker: string, title: string, min: number) =>
    `${picker}’s agent went quiet on ${q(title)}. No heartbeat for ${min} min`,
  infoCompleted: (owner: string, title: string) =>
    `${owner}’s agent filled in the missing details on ${q(title)}. Back to Open`,
  agentOffline: (name: string) => `${name}’s agent stopped sending heartbeats`,
  pledgeAnswered: (name: string, pct: number, prev: number) =>
    prev === pct
      ? `${name} answered the weekly check-in: ${pct}% this week`
      : `${name} answered the weekly check-in: ${pct}% this week (was ${prev}%)`,
  serviceDown: (service: string) =>
    `${service} isn’t answering. The agents are holding their updates`,
  serviceUp: (service: string) => `${service} is back. The agents are catching up`,
  insightOpened: (title: string) => `Noticed: ${title}`,
  insightResolved: (title: string) => `Sorted: ${title}`,
}

export function partOfDay(d: Date): string {
  const h = d.getUTCHours()
  if (h < 12) return 'morning'
  if (h < 18) return 'afternoon'
  return 'evening'
}

export function weekday(d: Date): string {
  return d.toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' })
}

export function joinNames(names: string[]): string {
  if (names.length === 0) return ''
  if (names.length === 1) return `${names[0]}’s`
  const head = names.slice(0, -1).map((n) => `${n}’s`)
  return `${head.join(', ')} and ${names[names.length - 1]}’s`
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}
