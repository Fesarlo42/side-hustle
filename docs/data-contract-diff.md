# Data contract diff: dashboard spec vs. side-hustle-harness

Checked 10 Nov 2026 against `jacogaz/side-hustle-harness@84bb19a` (main).

## What the harness actually contains

The repo has **one file, `SPEC.md`**: the functional spec (same text as Juan's Asana task "Spec: Side Hustle PoC"). There are **no skills yet**: no usage-reporting skill, no heartbeat format, no Slack pledge flow, no published field names, event names or endpoints. So there is nothing concrete to align field names with. This diff compares the dashboard contract with the *concepts* in the functional spec, and the dashboard contract stays the proposal the harness should implement.

The dashboard spec's "Decisions" section already overrides tokens/cost and the usage threshold with weekly pledges in %. Rows marked **Decided** are covered by it.

## Differences and proposed mapping

| # | Topic | Harness (functional spec) | Dashboard contract | Proposed mapping |
|---|---|---|---|---|
| 1 | Unit of usage | Tokens and cost, per person, model, task and phase | % of one person's weekly limit, no tokens or cost | **Decided.** Harness reports `usedPct` per task; dashboard ignores tokens/cost. |
| 2 | Eligibility | Usage threshold (% of window) + usage window (weekly or 5 h) | `pledgePct`, `pledgeUsedPct` (weekly only) | **Decided.** Margin = `pledgePct − pledgeUsedPct`. 5 h window not modelled. |
| 3 | Opt-in | "Side hustle mode" on/off per user | Being a Member (joined Slack channel) | Member exists ⇔ mode on. Optional `member.left` when turned off. |
| 4 | Budget | Token budget per task, default per size | `budgetPct`, S 2 / M 5 / L 10 | **Decided.** Field `budgetPct`; default from `size`. |
| 5 | Size | Asana "Estimate" (S/M/L), optional | `size` required | `size = estimate ?? 'M'`; mock always sets it. |
| 6 | Threshold crossed mid-task | Per-user policy `finish` or `release` | Always release to Next | **Decided** (release). Missing: `finish`. Propose optional `Member.onExhausted: 'finish' \| 'release'`, not shown in the UI. |
| 7 | Budget exhausted mid-task | Doing → **Needs Info** (E7) | Not modelled; only pledge-out → Next | Add to mock and log: `task.section_changed` to `needs_info` with `reason: 'budget_exhausted'`. |
| 8 | Reason for a transition | Many triggers (release, orphaned, rejection, destructive fail…) | `task.section_changed` has no reason | Add `reason?: 'claimed' \| 'released' \| 'orphaned' \| 'pledge_exhausted' \| 'budget_exhausted' \| 'review_failed' \| 'review_destructive' \| 'attempts_exhausted' \| 'rejected' \| 'approved' \| 'info_completed'` to the event. Needed for "explain every decision". |
| 9 | Destructive review failure | Straight to Needs Info, no retries | `reviewFailures[].check` only | Add `destructive: boolean` to each review failure (non_destructive check failing ⇒ true). |
| 10 | Needs Info reminder | Single reminder after timeout, then "stalled" | `flag: 'stalled'` only | Add `Task.reminderSentAt?`. Flow panel shows "time since the owner's reminder". |
| 11 | Orphaned | No heartbeat for timeout in Doing/To Review | `flag: 'orphaned'`, `lastHeartbeatAt` | Same. Add global config `heartbeatTimeoutMin` (mock: ~2 min at 1×). |
| 12 | Global config | Max reviewer attempts, heartbeat timeout, Needs Info timeout, default budgets | Only `maxReviewAttempts` on Task | Add a `Config` object to the snapshot: `{ maxReviewAttempts, heartbeatTimeoutMin, needsInfoTimeoutH, budgetBySize }`. |
| 13 | Max concurrency | Per user | Not in contract | Not shown. Mock uses 1–2 per member internally. |
| 14 | Usage phase | implementation / review / communication | Not in contract | Drop (minimum information). Reviewer usage is not billed to anyone's pledge in the PoC. **Confirm** who pays for the reviewer agent. |
| 15 | Model | "Cost and success rate per model" | `Task.model` | Same. Harness must report it per task. |
| 16 | Deliverable type, target, priority | Asana template fields | Not in contract | Drop (minimum information). |
| 17 | Owner agent | Fills Needs Info, moves back to Open | `Agent.role: 'owner'` | Same; mock emits `task.section_changed needs_info → open` by the owner agent. |
| 18 | Claim race (E1) | Loser discards silently | Nothing | Nothing to show. Not logged. |
| 19 | Pledge flow in Slack | Not in harness at all | `pledgeSource`, `pledge.answered`, `pledge.changed`, `Week.pledgeDeadline` | Harness/Slack skill must add it. Contract stays as proposed. |
| 20 | Week reset | Not in harness | `resetAt` per member + `Week.resetAt` | Open question (same or per-person reset). Mock: everyone resets Mon 00:00 UTC. |
| 21 | Done by non-owner (E17) | Not valid | Nothing | Nothing to show; `task.approved.actor` is always the owner. |

## Asks for the harness side

1. Usage-reporting skill publishes the Event shape (plus changed entity) and a pulse every 2 s.
2. Task heartbeats emitted as `task.heartbeat` (drives the core's pulse).
3. Every `task.section_changed` carries a `reason` (row 8).
4. Slack skill publishes pledge answers and changes (row 19).
