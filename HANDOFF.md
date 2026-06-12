# FitFlow 7 — Session Handoff (2026-06-12, session 2)

Zero-context handoff. Read this file and `PLAN.md` in full before doing anything.

## Project summary

FitFlow 7 is a desktop-first, mobile-responsive 7-minute workout web app. MVP scope: local-first, **no backend, no auth, no sync** — localStorage is the database. Future roadmap (V1 Turso sync → V1.5 MCP → V2 Android/Health Connect → V3 platform) is explicitly deferred; do not build any of it.

- **Stack:** Vite + React 19 + TypeScript + Tailwind v4 (`@tailwindcss/vite` plugin, theme tokens in `src/index.css`) + Zustand + react-router-dom v7. No other deps — **do not add dependencies.**
- **Deployed:** https://fitflow7.vercel.app (public). Deploy with `vercel --prod --yes` from this directory (CLI authed as natkins23). The longer `*-projects.vercel.app` URLs 401 behind Vercel deployment protection — that's expected; only the short alias is public. `vercel.json` has the SPA rewrite.
- **Repo:** https://github.com/n8watkins/fitflow7 (public). Branch `main`. Push after every session. Commit after every logical change with trailer `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`.
- **Verify:** `npx tsc -b` (must be clean) and `npm run build` (must succeed). Dev: `npm run dev`. No test framework (intentional for MVP).

## How this project is built (user's standing instruction)

The user wants Claude to act as an **orchestrator**: plan, define contracts, then dispatch subagents on lesser models (Haiku for content, Sonnet for code/QA) to do the implementation, integrating and committing between phases. `PLAN.md` is the agent contract: file-ownership map, module contracts, routes, and design language. Keep using disjoint file sets per parallel agent, and have agents run `npx tsc -b` before reporting done.

## State

**All 20 code-review findings are fixed, committed, pushed, and deployed.**

### This session's commits (2026-06-12)
- `04258af` — Fix P0-P1 engine/player findings (1-5, 9, 10, 14, 15): End Workout complete screen, sessionSaved in store, wall-clock drift correction, Screen Wake Lock, "Up Next" during prepare, previous() restart, endWorkout() guard, keyboard hint contrast.
- `1bac9cb` — Fix P1-P3 pages/data findings (7, 8, 11, 12, 13, 17, 18): Dashboard/History reactive reloads, Library filter reset on jump, hip-hinge icon dedupe, calendar-day relative dates, touch target sizes, shared formatters.
- P3 engine findings (16, 19, 20) were included in `04258af`: buildAndStart() dedup, AudioContext beforeunload, document.title updates.

### All 20 findings — status
| # | File(s) | Description | Status |
|---|---------|-------------|--------|
| 1 | Player.tsx | End Workout shows complete screen (not navigate away) | ✅ `04258af` |
| 2 | timerStore.ts | sessionSaved in Zustand state (not module scope) | ✅ `04258af` |
| 3 | Player.tsx | elapsedSeconds computed fresh on complete screen | ✅ `04258af` |
| 4 | timerStore.ts | visibilitychange wall-clock drift correction | ✅ `04258af` |
| 5 | Player.tsx | Screen Wake Lock acquired/released | ✅ `04258af` |
| 6 | App.tsx | NavLink `end` prop | ✅ `35431c9` |
| 7 | Dashboard.tsx | Reactive storage reads via useEffect+useLocation | ✅ `1bac9cb` |
| 8 | Library.tsx | handleJump resets filters before expanding | ✅ `1bac9cb` |
| 9 | Player.tsx | "Up Next" suppressed during prepare phase | ✅ `04258af` |
| 10 | timerStore.ts | previous() during prepare restarts countdown | ✅ `04258af` |
| 11 | exercises.ts | hip-hinge icon changed to 🔁 (was dup of 🔄) | ✅ `1bac9cb` |
| 12 | Dashboard.tsx | formatRelativeDay uses calendar-day boundaries | ✅ `1bac9cb` |
| 13 | RoutineEditor.tsx | Touch targets increased to h-10 w-10 (40px) | ✅ `1bac9cb` |
| 14 | timerStore.ts | endWorkout() guards idle/complete phase | ✅ `04258af` |
| 15 | Player.tsx | Keyboard hint contrast → text-slate-400 | ✅ `04258af` |
| 16 | Player.tsx | buildAndStart() deduplicates exercise-building loop | ✅ `04258af` |
| 17 | Dashboard/History/RoutineEditor | All local formatters deleted; import from lib/format | ✅ `1bac9cb` |
| 18 | History.tsx | Reactive storage reads via useEffect+useLocation | ✅ `1bac9cb` |
| 19 | audio.ts | AudioContext closed on beforeunload | ✅ `04258af` |
| 20 | Player.tsx | document.title updated on phase/exercise change | ✅ `04258af` |

### Prior commits
- `35431c9` shared `src/lib/format.ts`; NavLink fix (finding 6)
- `375d178` audio setting init fix, previous() during rest, Vercel SPA rewrites
- `1c10bd4` all six pages
- `f1e42e1` exercise dataset, Classic 7, timer engine, storage + stats
- `c2f364f` scaffold + shared types + routes + PLAN.md

## Next steps

**The user's agreed next action: dogfood daily for a week.** Do NOT start V1 (auth/Turso/sync) until daily use reveals which feature is missed first. The agreed product call: the highest-value later item is V1.5 private MCP layer (requires V1 API foundation first). Do not build any of this speculatively.

If a new session is started before the dogfood period, the only acceptable work is:
1. **Bug fixes** discovered during real use — address with the same parallel-agent pattern.
2. **UX micro-polish** the user explicitly requests.
3. **README / docs** updates.

Nothing from the deferred roadmap (sync, auth, MCP, Android, Health Connect).

## Conventions & gotchas

- **Tailwind v4:** theme tokens live in `src/index.css` under `@theme` (no tailwind.config). Custom tokens: `bg-surface`, `bg-card`, `bg-card-hover`, `border-edge`, `text-accent`, `bg-accent`, `accent-dim` (cyan accent).
- **`verbatimModuleSyntax` is on** — use `import type` for type-only imports or `tsc` fails.
- **StrictMode double-mount in dev:** Player mount effect runs twice; store `start()` must stay idempotent.
- **Settings "Clear history"** intentionally hardcodes `'fitflow.sessions'` key — must match `KEY.sessions` in `storage.ts` if either changes.
- **Deploy:** `vercel --prod --yes` (not `vercel deploy`). The `*-projects.vercel.app` preview URLs 401 — only `fitflow7.vercel.app` is public.
- **Parallel agents:** use `isolation: "worktree"` for disjoint file sets. After both return, `cp` their files into the main working directory, run `npx tsc -b && npm run build`, then commit and push in the main working directory. Agents must NOT run git commands.
- **Commit trailer:** `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>` on every commit.
- **timerStore phaseEndsAt:** wall-clock ms timestamp set on every phase transition and on `resume()`. `tick()` re-derives `secondsLeft` from it. `visibilitychange` handler fast-forwards overdue phases. `_visCleanup` stored on the store and called at `start()`/`reset()`.

## File map

- `PLAN.md` — agent contracts: file ownership, module APIs, routes, design language. Read before dispatching agents.
- `src/types.ts` — shared type contract (orchestrator-owned; don't change shapes).
- `src/store/timerStore.ts` — Zustand workout engine (phase machine, interval, session save, cueEvent, drift correction).
- `src/lib/storage.ts` — localStorage CRUD (`fitflow.*` keys).
- `src/lib/stats.ts` — streaks/stats.
- `src/lib/format.ts` — shared formatters: `fmtDuration`, `dayKey`, `formatDateTime`, `formatRelativeDay`.
- `src/lib/audio.ts` — WebAudio cues (singleton AudioContext, closes on beforeunload).
- `src/data/exercises.ts` — 24 exercises + EXERCISE_MAP.
- `src/data/routines.ts` — CLASSIC_7 + SYSTEM_ROUTINES.
- `src/pages/` — Player, Dashboard, History, Settings, RoutineEditor, Library.
- `src/App.tsx` — routes + nav shell (orchestrator-owned, don't change).
- `vercel.json` — SPA rewrite (required for deep links in production).
