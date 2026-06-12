# FitFlow 7 — Session Handoff (2026-06-11)

Zero-context handoff. Read this file and `PLAN.md` in full before doing anything.

## Project summary

FitFlow 7 is a desktop-first, mobile-responsive 7-minute workout web app (per a detailed PRD the user provided). MVP scope only: local-first, **no backend, no auth, no sync** — localStorage is the database. Future roadmap (V1 Turso sync → V1.5 MCP → V2 Android/Health Connect → V3 platform) is explicitly deferred; do not build any of it.

- **Stack:** Vite + React 19 + TypeScript + Tailwind v4 (`@tailwindcss/vite` plugin, theme tokens in `src/index.css`) + Zustand + react-router-dom v7. No other deps — **do not add dependencies.**
- **Deployed:** https://fitflow7.vercel.app (public). Deploy with `vercel --prod --yes` from this directory (CLI authed as natkins23). The longer `*-projects.vercel.app` URLs 401 behind Vercel deployment protection — that's expected; only the short alias is public. `vercel.json` has the SPA rewrite.
- **Repo:** local only, **no git remote**. Branch `main`. Commit after every logical change with trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- **Verify:** `npx tsc -b` (must be clean) and `npm run build` (must succeed). Dev: `npm run dev`. No test framework (intentional for MVP).

## How this project is built (user's standing instruction)

The user wants Claude to act as an **orchestrator**: plan, define contracts, then dispatch subagents on lesser models (Haiku for content, Sonnet for code/QA) to do the implementation, integrating and committing between phases. `PLAN.md` is the agent contract: file-ownership map, module contracts (storage/stats/timerStore/audio), routes, and design language (dark theme, cyan accent, emoji icons as MVP exercise visuals, phase colors: prepare amber / work cyan / rest emerald / complete violet). Keep using disjoint file sets per parallel agent, and have agents run `npx tsc -b` before reporting done.

## State

All MVP acceptance criteria shipped, deployed, and committed:

- `c2f364f` scaffold + shared types + routes + PLAN.md
- `f1e42e1` 24-exercise dataset, Classic 7 routine, timer engine, storage + stats libs
- `1c10bd4` all six pages (Player, Dashboard, History, Settings, RoutineEditor, Library)
- `375d178` QA fixes (audio setting init, `previous()` during rest) + Vercel SPA rewrites
- `35431c9` shared `src/lib/format.ts` helpers; NavLink `end` fix (= review **finding 6 done**, **finding 17 partially done** — the lib exists but pages still use their local copies)

A fresh-eyes Sonnet review audit produced 20 prioritized findings (below). **The user has approved fixing ALL of them (P0 through P3).** That work has NOT been done yet (except 6 and partial 17). Nothing else is in flight.

## Next steps (in order)

1. **Fix all 20 review findings below** (minus the done ones). Suggested split into two parallel Sonnet agents with disjoint files, per PLAN.md ownership:
   - Agent A (engine/player): `src/store/timerStore.ts`, `src/pages/Player.tsx`, `src/lib/audio.ts` → findings 1, 2, 3, 4, 5, 9, 10, 14, 15, 16, 19, 20.
   - Agent B (pages/data): `src/pages/Dashboard.tsx`, `src/pages/History.tsx`, `src/pages/Library.tsx`, `src/pages/RoutineEditor.tsx`, `src/data/exercises.ts` → findings 7, 8, 11, 12, 13, 18, and finish 17 by migrating pages to `src/lib/format.ts` (`fmtDuration`, `formatDateTime`, `formatRelativeDay` already exist there — use them, don't reinvent).
   - Acceptance: `tsc -b` clean, `npm run build` green, each finding verifiably addressed; then a QA re-review agent pass over the diff, commit, deploy with `vercel --prod --yes`, and curl-check https://fitflow7.vercel.app returns 200.
2. After fixes: the user should dogfood daily for a week. The agreed product call: do **not** start V1 (auth/Turso/sync) until daily use proves which feature is missed first. Highest-value later item for this user is the V1.5 private MCP layer (needs V1 API foundation first).

### Implementation guidance for the tricky findings

- **Finding 1 (End Workout):** the End button must NOT navigate; let `endWorkout()` put the store in `complete` phase and render the same summary card (with an "ended early" note when `exercisesCompleted < totalExercises`). Session saving already happens in the store — never save from the Player.
- **Finding 4 (background-tab drift):** store a `phaseEndsAt` wall-clock timestamp when each phase starts/resumes; ticks and a `visibilitychange` handler re-derive `secondsLeft` from `Date.now()`. If the tab returns multiple phases overdue, fast-forward through the missed phases (incrementing `exercisesCompleted`) without firing a cue per skipped phase. Pause stores remaining seconds; resume recomputes `phaseEndsAt`.
- **Finding 2 (sessionSaved):** move the module-level `let sessionSaved` into Zustand state, reset in `start()`/`reset()`.
- **StrictMode warning:** `main.tsx` uses StrictMode — mount effects run mount→cleanup→mount in dev. The store's `start()` is already idempotent (clears interval first); keep it that way.

## Review findings (verbatim from the audit — fix all; 6 done, 17 partial)

### P0 — Blockers

**1. `src/pages/Player.tsx:383-384` — "End Workout" abandons silently, user never sees the complete/summary screen.**
`endWorkout()` sets `phase='complete'` and immediately `navigate('/')` is called; Player unmounts and the cleanup `reset()` fires before the complete screen can render. The session IS saved but the user gets no feedback — they're just dumped on the Dashboard wondering what happened.
**Fix:** Navigate to `'/'` from inside an `onTransitionComplete` callback, or show the complete screen first and let the user dismiss it (same pattern as natural finish), rather than calling both actions synchronously.

**2. `src/store/timerStore.ts:107` — `sessionSaved` is a module-level `let`, not store state; it survives across Zustand store resets and React HMR reloads.**
In development (StrictMode + HMR), if the module is evaluated multiple times or the store is re-initialized, the flag could be `true` from a previous session, silently blocking the save of the next workout.
**Fix:** Move `sessionSaved` into the Zustand store state (initialized/reset in `start()` and `reset()`), not module scope.

**3. `src/pages/Player.tsx:250-252` — `elapsedSeconds` on the complete screen is frozen at first render, never ticks.**
It's a plain derived value computed once at render — if the complete screen is reached quickly the number is correct, but it is a stale snapshot rather than a live display (and doesn't match what was actually saved to `durationSeconds`, which is wall-clock from `buildSession`).
**Fix:** Minor in practice (complete screen is static), but for the abandonment case (never shown anyway — see P0 #1) the duration displayed would be wrong. Fix P0 #1 first; this then becomes display-only accuracy.

### P1 — Daily-Use Pain

**4. `src/store/timerStore.ts` — No `visibilitychange` / Page Visibility handling; background-tab throttling will silently desync the timer.**
Browsers throttle `setInterval` in backgrounded tabs to roughly 1 fire/minute. A user who mid-workout checks a message will return to find the timer 30+ seconds ahead of the actual exercise. There is no correction mechanism.
**Fix:** Record `Date.now()` when the tab hides (via `document.addEventListener('visibilitychange', ...)`) and on restore re-derive `secondsLeft` from wall clock rather than the tick count. Alternatively use a `requestAnimationFrame` loop with drift correction.

**5. `src/pages/Player.tsx` — No Screen Wake Lock; phone screen will sleep mid-workout.**
There is no `navigator.wakeLock.request('screen')` call. The screen will dim/lock after 30–60 s on most phones, leaving the user unable to see the timer.
**Fix:** Call `navigator.wakeLock.request('screen')` in the mount effect (guarded with feature detection) and release it on unmount or when `phase === 'complete'`.

**6. `src/App.tsx:29` — NavLink `to="/"` without `end` prop; "Dashboard" nav item is highlighted on every page.** ✅ **DONE in `35431c9`.**

**7. `src/pages/Dashboard.tsx` — Page reads localStorage at render time only; stats/routines are permanently stale after navigating away from `/`.**
Dashboard has no `useState`/`useEffect` — it calls `getSessions()`, `getRoutines()` etc. synchronously at render. After completing a workout and pressing "Back to Dashboard", react-router reuses the existing Dashboard component without re-mounting, so the streak counter and session count are not refreshed.
**Fix:** Either wrap Dashboard reads in `useState` + a `useEffect` that re-fetches on route focus, or use a `key` on the route to force re-mount.

**8. `src/pages/Library.tsx:282-288` — "Jump to variation" silently fails when active filters exclude the target exercise.**
`handleJump` sets `expandedId` to the variation's id, but if the variation doesn't match the active category or difficulty filter it won't be in `filtered` and its card won't render — the scroll target `#ex-card-${id}` doesn't exist and nothing happens.
**Fix:** Reset the category and difficulty filters (and clear search) inside `handleJump` before setting `expandedId`.

**9. `src/pages/Player.tsx:444` — "Up Next" block during PREPARE shows `exercises[1]` (2nd exercise), but the user is preparing for `exercises[0]` (1st exercise).**
During prepare phase `currentIndex=0` so `nextExercise = exercises[1]`. The current-exercise tile shows `exercises[0]` which is correct, but the "Up Next" label next to `exercises[1]` misleads the user into thinking they're about to do the second exercise.
**Fix:** During prepare phase suppress the "Up Next" block (there's no completed exercise yet; the main tile already shows what's coming), or relabel it "First Up".

### P2 — Polish

**10. `src/store/timerStore.ts:327-336` — `previous()` during `prepare` phase jumps directly to `work` instead of restarting the countdown.**
If the user hits ← during the prepare countdown, the code clears prepare and starts work immediately at `currentIndex=0`, which could be a surprise mid-countdown.
**Fix:** When `phase === 'prepare'`, restart prepare with the original `countdownSeconds` value (needs it stored in state) rather than jumping to work.

**11. `src/data/exercises.ts:289,628` — `hip-hinge` and `push-up-rotation` both use the `🔄` icon; they will look identical in the exercise tiles and progress bar.**
**Fix:** Assign a distinct icon to one of them (e.g. `⤵️` or `🔁` for hip-hinge, or `🤸` variant for push-up-rotation).

**12. `src/pages/Dashboard.tsx:10-20` — `formatRelativeDate` uses continuous milliseconds, not calendar-day boundaries.**
A workout at 11:30pm on Monday checked at 12:30am Tuesday shows as "today" (only 1 hour ago in ms, diffDays=0). Cross-midnight workouts get the wrong label.
**Fix:** Use `formatRelativeDay` from `src/lib/format.ts` (already implemented with local calendar-day keys).

**13. `src/pages/RoutineEditor.tsx:143,152,160` — Move-up, Move-down, and Remove buttons are 28×28px (`h-7 w-7`).**
WCAG 2.5.5 recommends 44×44px touch targets; 28px is too small to reliably hit when winded or on a small phone screen.
**Fix:** Increase to `h-9 w-9` minimum (36px) or `h-10 w-10` (40px) with adequate spacing.

**14. `src/store/timerStore.ts:366` — `endWorkout()` has no guard for `phase === 'idle'`.**
If called while the store is idle (e.g. via a race condition or future keyboard shortcut wiring), it will set `phase='complete'` and attempt to save a malformed session (no `routine`, `startedAt`, or `exercises`).
**Fix:** Add `if (state.phase === 'idle' || state.phase === 'complete') return` as the first line.

**15. `src/pages/Player.tsx:547-551` — Keyboard hint line uses `text-slate-600` on `bg-surface` (#0b0f17).**
~3.1:1 contrast — fails WCAG AA at that text size and is genuinely unreadable in practice.
**Fix:** Bump to `text-slate-500` or `text-slate-400`.

### P3 — Nice-to-Have / Code Quality

**16. `src/pages/Player.tsx:293-302` and `:121-130` — "Go Again" button duplicates the exercise-building loop from the mount `useEffect`.**
Exact same 6-line loop in two places; "Go Again" also re-reads settings/routine from storage directly, so it won't pick up in-session mute state.
**Fix:** Extract a `buildAndStart(routineId)` helper and call it from both places.

**17. Duration/date formatters duplicated across History, Dashboard, and Player.** ⚠️ **PARTIAL:** `src/lib/format.ts` now exists (`fmtDuration`, `dayKey`, `formatDateTime`, `formatRelativeDay`) — but the pages still use their local copies. Migrate all three pages to import from it and delete the local copies.

**18. `src/pages/History.tsx` and `src/pages/Dashboard.tsx` — Both read `getSessions()` + `computeStats()` at render time with no reactive wrapper (same root cause as finding 7).**
**Fix:** Same pattern as Dashboard — `useState` initialized from `getSessions()` or a route key reset.

**19. `src/lib/audio.ts` — Module-level `AudioContext` singleton is never closed.**
Acceptable for MVP; browsers limit simultaneous AudioContexts.
**Fix:** Add `window.addEventListener('beforeunload', () => ctx?.close())`.

**20. `src/pages/Player.tsx` — No document title update during workout.**
**Fix:** `useEffect` setting `document.title = \`${phase.toUpperCase()} — ${exercise} | FitFlow 7\`` on phase/exercise change; restore default on unmount.

## File map

- `PLAN.md` — agent contracts: file ownership, module APIs, routes, design language. Read before dispatching agents.
- `src/types.ts` — shared type contract (orchestrator-owned; don't change shapes casually).
- `src/store/timerStore.ts` — Zustand workout engine (phase machine, interval, session save, cueEvent).
- `src/lib/storage.ts` — localStorage CRUD (`fitflow.*` keys); `src/lib/stats.ts` — streaks/stats; `src/lib/format.ts` — shared formatters (new); `src/lib/audio.ts` — WebAudio cues.
- `src/data/exercises.ts` — 24 exercises + EXERCISE_MAP; `src/data/routines.ts` — CLASSIC_7 + SYSTEM_ROUTINES.
- `src/pages/` — Player, Dashboard, History, Settings, RoutineEditor, Library (one route each, see App.tsx).
- `vercel.json` — SPA rewrite; required for deep links in production.

## Gotchas already learned

- Tailwind v4: theme tokens live in `src/index.css` under `@theme` (no tailwind.config). Custom tokens: `bg-surface`, `bg-card`, `bg-card-hover`, `border-edge`, `accent` (cyan).
- `verbatimModuleSyntax` is on — use `import type` for type-only imports or tsc fails.
- StrictMode double-mount in dev: Player mount effect runs twice; store `start()` must stay idempotent.
- Settings "Clear history" intentionally hardcodes the `'fitflow.sessions'` key — it must match `KEY.sessions` in storage.ts if either changes.
- User decisions already made (do not re-ask): fix all 20 findings; stay in MVP scope; orchestrate via subagents on lesser models; commit per logical change; deploy to Vercel prod when green.
