# FitFlow 7 — Session Handoff (2026-06-12, session 2)

Zero-context handoff. Read this file and `PLAN.md` in full before doing anything.

## Project summary

FitFlow 7 is a desktop-first, mobile-responsive 7-minute workout web app. MVP scope: local-first, **no backend, no auth, no sync** — localStorage is the database. Future roadmap (V1 Turso sync → V1.5 MCP → V2 Android/Health Connect → V3 platform) is explicitly deferred; do not build any of it.

- **Stack:** Vite + React 19 + TypeScript + Tailwind v4 (`@tailwindcss/vite` plugin, theme tokens in `src/index.css`) + Zustand + react-router-dom v7. No other deps — **do not add dependencies.**
- **Deployed:** https://fitflow7.vercel.app (public). Deploy with `vercel --prod --yes` from this directory (CLI authed as natkins23). The longer `*-projects.vercel.app` URLs 401 behind Vercel deployment protection — that's expected; only the short alias is public. `vercel.json` has the SPA rewrite.
- **Repo:** https://github.com/n8watkins/fitflow7 (public). Branch `main`. Push after every session. Commit after every logical change with trailer `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`.
- **Verify:** `npx tsc -b` (must be clean), `npm run lint` (must be clean — now green), and `npm run build` (must succeed). Dev: `npm run dev`. No test framework (intentional for MVP).

## How this project is built (user's standing instruction)

The user wants Claude to act as an **orchestrator**: plan, define contracts, then dispatch subagents on lesser models (Haiku for content, Sonnet for code/QA) to do the implementation, integrating and committing between phases. `PLAN.md` is the agent contract: file-ownership map, module contracts, routes, and design language. Keep using disjoint file sets per parallel agent, and have agents run `npx tsc -b` before reporting done.

## State

**All 20 code-review findings are fixed. Session 3 (2026-06-12) added a deep-dive cleanup + offline support — all committed (not yet pushed/deployed at time of writing).**

### Session 3 commits (2026-06-12)
- `29bf060` — Fix lint pipeline + React 19 purity bug: pruned stale agent worktrees that crashed ESLint, ignored `.claude` in eslint config; Player complete-screen elapsed now derives from a `completedAt` timestamp in the store (no `Date.now()` during render); Dashboard/History reactive reads moved to `useMemo` keyed on `location.key`; misc lint nits. `tsc`/`lint`/`build` all clean.
- `4831bab` — Catch-all `*` 404 route; richer `index.html` meta (theme-color, description, OG); `clearSessions()` helper replaces the hardcoded key in Settings.
- `5599e5e` — **Offline support (no deps):** `public/sw.js` + `public/manifest.webmanifest` + `public/icon.svg`; SW registered prod-only in `main.tsx`. Makes the README's offline claim real + enables Add to Home Screen.
- Docs: README "What's Next" rewritten (old list was all-done items); added Install section. This handoff updated.

**Pushed and deployed.** `c5b167f` is on `origin/main`; production deployed via `vercel --prod --yes` and `fitflow7.vercel.app` confirmed serving `/sw.js`, `/manifest.webmanifest`, `/icon.svg` (200, correct content-types). **Still worth a real-browser check:** DevTools → Application → Service Workers, then toggle Offline and reload to confirm the offline shell works on a real device.

### Roadmap
A full post-MVP plan now lives in `ROADMAP.md` (readiness assessment + phased outline). Highlights: the persistence seam (`lib/storage.ts`) and UUIDs make sync viable, but V1 is blocked on no backend/auth, no delete tombstones, and no schema versioning. **Phase 0** (local groundwork — schema version, tombstones, dirty-queue marker) is the only roadmap work safe to start before the dogfood week ends.

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

If a new session is started before the dogfood period, the acceptable work is:
1. **Bug fixes** discovered during real use — address with the same parallel-agent pattern.
2. **UX micro-polish** the user explicitly requests.
3. **README / docs** updates.
4. **Phase 0 of `ROADMAP.md`** — local-only sync groundwork (schema version + migration runner, soft-delete tombstones on routines, `updatedAt` on sessions, a per-record dirty/pending marker). No backend, no behavior change. This is the one roadmap-adjacent item the user is OK starting early. Acceptance: app behaves identically; `tsc -b`, `npm run lint`, `npm run build` all clean.

Do NOT start Phase 1+ (auth/Turso/sync, MCP, Android, Health Connect) until daily use reveals which feature is missed first. See `ROADMAP.md` for the full plan and rationale.

## Conventions & gotchas

- **Tailwind v4:** theme tokens live in `src/index.css` under `@theme` (no tailwind.config). Custom tokens: `bg-surface`, `bg-card`, `bg-card-hover`, `border-edge`, `text-accent`, `bg-accent`, `accent-dim` (cyan accent).
- **`verbatimModuleSyntax` is on** — use `import type` for type-only imports or `tsc` fails.
- **StrictMode double-mount in dev:** Player mount effect runs twice; store `start()` must stay idempotent.
- **Settings "Clear history"** calls `clearSessions()` in `storage.ts` (no longer hardcodes the key).
- **PWA/offline:** `public/sw.js` (hand-rolled service worker) + `public/manifest.webmanifest` + `public/icon.svg`. SW registered in `main.tsx` **production-only** (`import.meta.env.PROD`). To force all clients onto a new build, bump the `CACHE` constant in `sw.js`. Vercel serves these static files before the SPA rewrite, so they aren't swallowed.
- **Lint must stay clean:** `npm run lint` is now green and part of verification. `.claude` is in eslint's ignore list — do not remove it, or stray agent worktrees will crash the parser again.
- **Deploy:** `vercel --prod --yes` (not `vercel deploy`). The `*-projects.vercel.app` preview URLs 401 — only `fitflow7.vercel.app` is public.
- **Parallel agents:** use `isolation: "worktree"` for disjoint file sets. After both return, `cp` their files into the main working directory, run `npx tsc -b && npm run build`, then commit and push in the main working directory. Agents must NOT run git commands.
- **Commit trailer:** `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>` on every commit.
- **timerStore phaseEndsAt:** wall-clock ms timestamp set on every phase transition and on `resume()`. `tick()` re-derives `secondsLeft` from it. `visibilitychange` handler fast-forwards overdue phases. `_visCleanup` stored on the store and called at `start()`/`reset()`.

## File map

- `PLAN.md` — agent contracts: file ownership, module APIs, routes, design language. Read before dispatching agents.
- `ROADMAP.md` — post-MVP plan: readiness assessment + phased outline (Phase 0 groundwork → V1 sync/auth → V1.5 MCP → V2 Android). Read before any roadmap work.
- `public/sw.js` — hand-rolled service worker (offline). `public/manifest.webmanifest` + `public/icon.svg` — PWA install.
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
