# Side hustle · control dashboard (PoC)

A read-only, real-time page that shows who pledged spare Claude usage, what the agents are doing with it, where it goes and what needs attention. A living core in the middle shows the system's pulse.

Built for the Athens hackathon 2026. By default it shows the live [Side Hustle project](https://app.asana.com/1/13327221380952/project/1220379119011503) in Asana (see [The Asana source](#the-asana-source)). A seeded mock with a scripted 3-minute demo is still there for rehearsals.

## Run it

Needs Node 24+ and read access to the team.blue GitLab npm registry (for the Lumen design system).

```bash
# Lumen comes from the private registry; .npmrc reads the token from GITLAB_TOKEN
export GITLAB_TOKEN=<personal access token with read_api>
npm install
npm run dev                              # live Asana data, http://localhost:3000
SIDE_HUSTLE_SOURCE=mock npm run dev      # the scripted demo instead
```

With the mock, the page plays the scripted 3-minute demo at 10× (see below), and a demo bar in the bottom-right corner changes speed (1×, 10×, 60×), pauses and restarts it. The bar doesn't show with real data. `/dev/core` is a tuning page for the core with a slider per input.

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm test` | Unit and component tests (Vitest, Testing Library) |
| `npm run test:e2e` | Playwright smoke test (starts its own server on the mock, port 3100): runs the demo for 30 s and saves screenshots at 1280×720 and 1920×1080 to `e2e/screenshots/` |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm run build` | Production build |

## How it fits together

```
Mock engine (server) ──► /api/state  (snapshot)  ──► store (one reducer) ──► every panel
                     └─► /api/stream (SSE: events + pulse every 2 s)
                         /api/demo   (demo controls only)
```

- **`src/types.ts`**: the data contract (members, projects, agents, tasks, insights, events, pulse, usage, week). Differences from the harness spec are in `docs/data-contract-diff.md`.
- **`src/data/mock/`**: the seeded mock. `cast.ts` holds 15 fictional members, 4 teams and 6 projects; `engine.ts` plays a believable week plus the scripted demo; `text.ts` holds the voice for log lines and the status line.
- **`src/server/`**: the hub that runs the engine on a timer, and `getServerSource()`, the one place the data source is chosen.
- **`src/store/`**: `reducer.ts` (snapshot plus stream messages, pure) and `selectors.ts` (every derived number: left, flow, quality, leaderboard, where pledges go, core inputs). Nothing derived is stored.
- **`src/components/`**: the core (custom SVG) and the panels. Panels only read the store.
- **`src/config/health.ts`**: calm / strained / critical rules, tunable before the demo.
- **`src/theme.ts`**: the only place colours live; every value maps a Lumen token. **`src/motion.ts`**: our motion tokens.

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

## Plugging in real data

The browser talks to `/api/state` and `/api/stream` only, so the swap happens on the server:

1. Implement `ServerSource` (`src/server/source.ts`): `snapshot()` returns a `Snapshot`, `subscribe()` emits `StreamMessage`s (one per event, with the changed entities, plus a `pulse` every 2 s, including the ready-made status line).
2. Feed it from the harness usage reports, Slack (members, pledges) and Asana (tasks, sections).
3. Return it from `getServerSource()` for a new `SIDE_HUSTLE_SOURCE` value. Leave out `command()`: the demo bar then disappears.

The mock cast in `src/data/mock/cast.ts` is fictional and is replaced by real people the same way.

### The Asana source

This is the default source (`SIDE_HUSTLE_SOURCE=asana`): it reads the live [Side Hustle project](https://app.asana.com/1/13327221380952/project/1220379119011503). It needs an Asana personal access token (Asana → Settings → Apps → Developer apps) that can see the project:

```bash
# .env.local (git-ignored)
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

Asana doesn't hold teams or a check-in deadline, so everyone is in team "iubenda" and the week closes at the reset. A task's project is the repo named in its "Target resource", or "Side Hustle". People without a pledge this week show as offline with 0%. If Asana stops answering, the dashboard keeps the last data and shows a service insight until it's back.

## Rules the page keeps

- **Read-only.** The only controls are the demo bar and view settings (sort, filters, reduced motion).
- **Minimum information.** Tasks show their title, project and Asana link. People show name, team, pledge, pledge used and left, and status. Nobody's own weekly usage, tokens or cost is ever shown.
- **Everything is a % of a weekly limit.** Task budgets: S = 2%, M = 5%, L = 10%. Totals are in seat-weeks (100% = one full weekly limit).
- **Reduced motion** (OS setting or the header toggle): the core is still and labelled with its state, and numbers update without counting up.
- **Readable on a projector:** 1280×720 and up, 16 px body text, key numbers at 28 px or more, and colour never carries meaning alone.
- **Light theme only.** Lumen follows the OS into dark mode, so `<html data-theme="light">` pins it.
