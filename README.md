# Side hustle · control dashboard (PoC)

A read-only, real-time page that shows who pledged spare Claude usage, what the agents are doing with it, where it goes and what needs attention. A living core in the middle shows the system's pulse.

Built for the Athens hackathon 2026. It shows the live [Side Hustle project](https://app.asana.com/1/13327221380952/project/1220379119011503) in Asana, as written by the agents of the [side hustle harness](https://github.com/jacogaz/side-hustle-harness) (see [The Asana source](#the-asana-source)). A seeded mock with a scripted 3-minute demo is there for rehearsals.

## Run it

Needs Node 24+ and read access to the team.blue GitLab npm registry (for the Lumen design system).

```bash
# Lumen comes from the private registry; .npmrc reads the token from GITLAB_TOKEN
export GITLAB_TOKEN=<personal access token with read_api>
npm install
npm run dev:live      # live Asana, token from the macOS keychain (see below), http://localhost:3000
npm run dev           # Asana from data/asana-export.json when there's no token
npm run dev:mock      # the scripted demo instead
```

For `dev:live`, create an Asana personal access token (Asana → Settings → Apps → Developer apps → Create new token) and store it once in the keychain; it is read when the server starts and never written to a file:

```bash
security add-generic-password -a "$USER" -s asana-pat -w   # prompts for the token
```

Another keychain item name works too: `ASANA_KEYCHAIN_ITEM=<name> npm run dev:live`.

With the mock, the page plays the scripted 3-minute demo at 10× (see below), and a demo bar in the bottom-right corner changes speed (1×, 10×, 60×), pauses and restarts it. The bar doesn't show with real data. `/dev/core` is a tuning page for the core with a slider per input.

| Command | What it does |
| --- | --- |
| `npm run dev:live` | Dev server on live Asana (token from the keychain) |
| `npm run dev` | Dev server on Asana; without a token it reads `data/asana-export.json` |
| `npm run dev:mock` | Dev server on the mock, with the scripted demo |
| `npm test` | Unit and component tests (Vitest, Testing Library) |
| `npm run test:e2e` | Playwright smoke test (starts its own server on the mock, port 3100): runs the demo for 30 s and saves screenshots at 1280×720 and 1920×1080 to `e2e/screenshots/` |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm run build` | Production build |

**Good to know**

- Next.js runs one dev server per project folder. Stop yours before `npm run test:e2e`, which starts its own on the mock.
- If the page keeps reloading itself in dev, the `.next` cache is stale (it happens after switching sources or a second dev server tried to start): stop the server, `rm -rf .next`, start again.

## How it fits together

```
Asana (or the mock) ──► server source ──► /api/state  (snapshot)  ──► store (one reducer) ──► every panel
                                     └─► /api/stream (SSE: events + pulse every 2 s)
                                         /api/demo   (mock only: demo controls)
```

- **`src/types.ts`**: the data contract (members, projects, agents, tasks, insights, events, pulse, usage, week). Differences from the harness spec are in `docs/data-contract-diff.md`.
- **`src/data/mock/`**: the seeded mock. `cast.ts` holds 15 fictional members, 4 teams and 6 projects; `engine.ts` plays a believable week plus the scripted demo; `text.ts` holds the voice for log lines and the status line.
- **`src/server/`**: `source.ts` with `getServerSource()`, the one place the data source is chosen (`SIDE_HUSTLE_SOURCE`: `asana` by default, or `mock`); `asana/` reads Asana and turns it into the data contract; `hub.ts` runs the mock engine on a timer.
- **`src/store/`**: `reducer.ts` (snapshot plus stream messages, pure) and `selectors.ts` (every derived number: left, flow, quality, leaderboard, where pledges go, core inputs). Nothing derived is stored.
- **`src/components/`**: the hero (core, key numbers, live events) and the panels. Panels only read the store.
- **`src/lib/teams.ts`**: one colour per team, stable by name.
- **`src/config/health.ts`**: calm / strained / critical rules, tunable before the demo.
- **`src/theme.ts`**: the only place colours live: Lumen tokens for the base, plus a small jewel-toned accent palette (outside Lumen on purpose) for teams and task sections. **`src/motion.ts`**: our motion tokens.

### What's on the page

1. **Header bar:** week, reset countdown, pledge answers, live indicator, reduced-motion toggle.
2. **Hero:** the living core: an aura that breathes in the health colour, a radar sweep, people as dots (with their Asana photos and a ring in their team colour), and particles with trails carrying pledge from picker to owner. Key numbers on either side, live event pop-ups, the status line and a "Latest" ticker.
3. **People and where their pledges go:** one column of people (pledge ring, team, left, used, status) beside the usage per project or team and the picker → owner flow. Clicking a person highlights their tasks and flows everywhere.
4. **Work in progress:** a board, left to right through Doing, To Review, QA Review, Needs Info and Done.
5. **Flow:** counts and average time per section, bottlenecks, stalled and orphaned tasks.
6. **Quality and leaderboard:** first-pass approval, rejections, reviewer failures, over-budget tasks, success per model; top 5 publishers, pickers, completers and pledges.
7. **Insights and activity log:** what the agents noticed and what they're doing about it; every event, folded to the latest few.

### The mock and the demo script

The engine is deterministic: the same seed (`SIDE_HUSTLE_SEED`, default 46) plays the same week every time. Time runs on a "demo clock": one demo second is 20 simulated seconds, so the 3-minute demo covers Sunday 17:00–18:00 UTC, 6 hours before the weekly reset.

| At (10×) | Moment |
| --- | --- |
| 0:00 | Calm start: 3 tasks in Doing, 2 in Open |
| 0:20 | Payments publishes 6 tasks; pickers' agents claim them |
| 0:50 | Asana goes down: service insight, core strained |
| 1:15 | Asana is back: insight resolves, ripple, calm |
| 1:30 | Bruno's agent goes quiet; the task is released to Next and Rita's agent takes over |
| 1:50 | The reviewer fails a task on scope: back to Doing, review 2 of 3 |
| 2:10 | Ana's pledge runs out mid-task; Rui's agent takes over |
| 2:25 | An owner approves a task: Done, ripple, leaderboard changes |
| 2:40 | Marta answers the weekly check-in and raises her pledge from 10% to 30% |
| 2:55 | "Reset in 6 h": opportunity insight and status line |

`tests/engine.test.ts` checks that every moment happens on time.

## Data sources

The browser talks to `/api/state` and `/api/stream` only, so sources are swapped on the server. To add one:

1. Implement `ServerSource` (`src/server/source.ts`): `snapshot()` returns a `Snapshot`, `subscribe()` emits `StreamMessage`s (one per event, with the changed entities, plus a `pulse` every 2 s, including the ready-made status line).
2. Return it from `getServerSource()` for a new `SIDE_HUSTLE_SOURCE` value. Leave out `command()`: the demo bar then disappears.

### The Asana source

This is the default source (`SIDE_HUSTLE_SOURCE=asana`): it reads the live [Side Hustle project](https://app.asana.com/1/13327221380952/project/1220379119011503). It needs an Asana personal access token that can see the project. Create it in the Developer console (Asana → Settings → Apps → Developer apps → **Personal access tokens → Create new token**; not "Create new app"), store it in the keychain as shown in [Run it](#run-it), and start with `npm run dev:live`. On other systems, put it in `.env.local` (git-ignored) instead:

```bash
ASANA_TOKEN=<personal access token>
```

**No token?** Leave `ASANA_TOKEN` out and the server reads an export instead: `data/asana-export.json` (git-ignored; another path via `SIDE_HUSTLE_ASANA_FILE`). It has the shape the API returns (`exportedAt`, `project`, `tasks`, and `stories` per task gid), so anyone with Asana access through Claude's Asana connector can ask Claude to write it. The server picks up a new export within 5 s and shows how old it is once it's more than 15 minutes old.

With a token, the server reads Asana every 20 s (`SIDE_HUSTLE_ASANA_POLL_MS`), only fetching comments again for tasks that changed, and streams what's new. It is read-only. It reads what the harness skills write (`config/global.yaml` and `templates/task-description.md` in jacogaz/side-hustle-harness), the same way the harness's dashboard skill does:

| Dashboard | Comes from |
| --- | --- |
| Tasks, sections, time per section | The project's tasks and their section moves |
| Owner | The task's creator |
| Picker, hand-over | `Side hustle claim:` and `Side hustle released:` comments |
| Size, budget, heartbeat | The Estimate, Budget (a fraction) and Last heartbeat fields |
| Reviews, attempts, failed checks | `Side hustle review: PASS/FAIL` comments |
| Task usage and model | `Side hustle usage:` comments (estimates), 0 until the first report |
| Pledges | `Side hustle pledge:` comments on the ledger task, this ISO week only |
| Pledge used, where pledges go | This week's claim records (reserved budgets), as in the harness |
| Stalled, orphaned | `Side hustle stalled` comments; no heartbeat for 2 h in Doing or To Review |

Asana doesn't hold departments or a check-in deadline. The week closes at the reset, and departments come from `data/teams.json` (git-ignored, because it holds colleagues' names), a name → department map:

```json
{ "Fernanda Gomes": "Engineering", "Aert Hulsebos": "Product" }
```

Names are matched ignoring case and accents; anyone not listed is in "iubenda". Edit it by hand, or ask Claude to rebuild it from Slack profile titles. The server reads it on every poll (`SIDE_HUSTLE_TEAMS_FILE` for another path). A task's project is the repo named in its "Target resource", or "Side Hustle". People without a pledge this week show as offline with 0%. If Asana stops answering, the dashboard keeps the last data and shows a service insight until it's back.

## Rules the page keeps

- **Read-only.** The only controls are the demo bar and view settings (sort, filters, reduced motion).
- **Minimum information.** Tasks show their title, project and Asana link. People show name, team, pledge, pledge used and left, and status. Nobody's own weekly usage, tokens or cost is ever shown.
- **Everything is a % of a weekly limit.** Task budgets: S = 2%, M = 5%, L = 10%. Totals are in seat-weeks (100% = one full weekly limit).
- **Reduced motion** (OS setting or the header toggle): the core is still and labelled with its state, numbers update without counting up, and every CSS animation stops.
- **Readable on a projector:** 1280×720 and up, 16 px body text, key numbers at 28 px or more, and colour never carries meaning alone.
- **Light theme only.** Lumen follows the OS into dark mode, so `<html data-theme="light">` pins it.

## Tests

Built test-first: every component and selector has Vitest tests (Testing Library + jsdom for components), and `tests/engine.test.ts` replays the whole scripted demo. `npm test` runs all of them; `npm run test:e2e` adds the Playwright smoke test in a real browser.
