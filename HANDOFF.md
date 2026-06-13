# FitFlow 7 — Session Handoff (2026-06-12, session 4)

Zero-context handoff. Read this file and `PLAN.md` in full before doing anything.

## Session 4 update (2026-06-12): Phase 0 + Phase 1 built

The user directed building ROADMAP Phases 0 and 1. Both are done and committed
on `main` (not yet pushed/deployed at time of writing — verify with `git log`).

- **Phase 0** (`5bc9781`): schema version + migration runner, routine tombstones,
  session `updatedAt`, per-record `dirty` queue. No behavior change.
- **Phase 1** (5 commits): accounts + cloud sync, shipped **dormant**.
  - Backend in `/api` (Vercel functions) + Turso (`@libsql/client`). Schema
    auto-creates. `api/sync.ts` = bidirectional LWW/tombstone-aware sync.
  - Hand-rolled OAuth (GitHub + Google), HMAC-signed session cookie. No auth SDK.
  - Client engine `src/lib/sync.ts` + `src/store/syncStore.ts`; sign-in UI in
    Settings; sync pill in nav.
  - **Deps added** (PLAN's "no new deps" relaxed for Phase 1): `@libsql/client`,
    `@vercel/node`.
- **To go live:** follow `SETUP_SYNC.md` — provision Turso + an OAuth app, set
  env vars in Vercel, redeploy, then verify cross-device sync on real devices.
  Until env vars are set the API is inert and the signed-out app is unchanged.
- **Commit trailer is now `Claude Opus 4.8`** (this session), not Sonnet 4.6.
- `tsc -b`, `npm run lint`, `npm run build` all clean. `/api` is type-checked via
  `tsconfig.api.json` (referenced from root tsconfig) and linted with Node globals.

## Project summary

FitFlow 7 is a desktop-first, mobile-responsive 7-minute workout web app. MVP scope: local-first, **no backend, no auth, no sync** — localStorage is the database. Future roadmap (V1 Turso sync → V1.5 MCP → V2 Android/Health Connect → V3 platform) is explicitly deferred; do not build any of it.

- **Stack:** Vite + React 19 + TypeScript + Tailwind v4 (`@tailwindcss/vite` plugin, theme tokens in `src/index.css`) + Zustand + react-router-dom v7. No other deps — **do not add dependencies.**
- **Deployed:** https://fitflow7.vercel.app (public). Deploy with `vercel --prod --yes` from this directory (CLI authed as natkins23). The longer `*-projects.vercel.app` URLs 401 behind Vercel deployment protection — that's expected; only the short alias is public. `vercel.json` has the SPA rewrite.
- **Repo:** https://github.com/n8watkins/fitflow7 (public). Branch `main`. Push after every session. Commit after every logical change with trailer `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`.
- **Verify:** `npx tsc -b` (must be clean), `npm run lint` (must be clean — now green), `npm run test` (Vitest; pure-logic unit tests in `test/`), and `npm run build` (must succeed). Dev: `npm run dev`.

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

Phase 0 and Phase 1 are built (see Session 4 update above). The immediate
open items:

1. **Turn sync on (user task + verify):** follow `SETUP_SYNC.md` to provision
   Turso + an OAuth app and set Vercel env vars. Then do a **real-device check**:
   sign in on two browsers, confirm a routine/session created on one appears on
   the other after focus, and that delete/clear-history tombstones propagate.
   This is the main untested path — there is no test framework yet.
2. **Push + deploy:** commits are local only. `git push` then `vercel --prod --yes`.
3. **Then resume dogfooding.** Phase 1.5 (private MCP, needs the live Phase 1
   API) and Phase 2 (Android/Health Connect) remain not started — don't build
   speculatively. See `ROADMAP.md`.

Sync-engine caveats worth knowing before changing it: LWW by `updatedAt`;
sign-out keeps local data (multi-account-per-browser merges sets); merge writes
in `storage.ts` (`applyRemote*`) intentionally bypass the `fitflow:localwrite`
event to avoid a sync loop.

## Conventions & gotchas

- **Tailwind v4:** theme tokens live in `src/index.css` under `@theme` (no tailwind.config). Custom tokens: `bg-surface`, `bg-card`, `bg-card-hover`, `border-edge`, `text-accent`, `bg-accent`, `accent-dim` (cyan accent).
- **`verbatimModuleSyntax` is on** — use `import type` for type-only imports or `tsc` fails.
- **StrictMode double-mount in dev:** Player mount effect runs twice; store `start()` must stay idempotent.
- **Settings "Clear history"** calls `clearSessions()` in `storage.ts` (no longer hardcodes the key).
- **PWA/offline:** `public/sw.js` (hand-rolled service worker) + `public/manifest.webmanifest` + `public/icon.svg`. SW registered in `main.tsx` **production-only** (`import.meta.env.PROD`). To force all clients onto a new build, bump the `CACHE` constant in `sw.js`. Vercel serves these static files before the SPA rewrite, so they aren't swallowed.
- **Lint must stay clean:** `npm run lint` is now green and part of verification. `.claude` is in eslint's ignore list — do not remove it, or stray agent worktrees will crash the parser again.
- **Deploy:** `vercel --prod --yes` (not `vercel deploy`). The `*-projects.vercel.app` preview URLs 401 — only `fitflow7.vercel.app` is public.
- **Parallel agents:** use `isolation: "worktree"` for disjoint file sets. After both return, `cp` their files into the main working directory, run `npx tsc -b && npm run build`, then commit and push in the main working directory. Agents must NOT run git commands.
- **Commit trailer:** session 4 used `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Earlier sessions used Sonnet 4.6 — match whichever model is running.
- **`/api` ESM imports need `.js`:** `package.json` is `"type": "module"`, so Vercel runs the compiled functions as ESM and Node's resolver demands explicit extensions on **relative** imports. Always write `import … from './_lib/auth.js'` (tsc's `bundler` resolution maps `.js`→`.ts`). Extensionless specifiers compile fine but crash at runtime with `ERR_MODULE_NOT_FOUND` → 500 `FUNCTION_INVOCATION_FAILED` on *every* call, before any handler/env-var check (fixed in `550207c`). `import type` specifiers are erased and don't need the extension.
- **`/api` build/lint:** functions are type-checked via `tsconfig.api.json` (referenced from root `tsconfig.json`, so `npx tsc -b` covers them) and linted with Node globals (`api/**` block in `eslint.config.js`). Shared code lives in `api/_lib/` (underscore = not a route). Vercel bundles each non-`_` `.ts` under `/api` as a function.
- **SW + API:** `sw.js` must never cache `/api` (auth/sync stale otherwise) — there's an early return for it; bump `CACHE` when changing the SW. `vercel.json` rewrite excludes `/api` so functions aren't swallowed.
- **Sync is dormant until configured:** no env vars => API returns "not configured" and the signed-out app is byte-identical to the MVP. Enable via `SETUP_SYNC.md`. Never commit `.env` (gitignored; `.env.example` is the template).
- **Sync gotchas:** LWW by `updatedAt`; `applyRemote*` writes bypass `emitWrite()` to avoid a loop; sign-out keeps local data.
- **timerStore phaseEndsAt:** wall-clock ms timestamp set on every phase transition and on `resume()`. `tick()` re-derives `secondsLeft` from it. `visibilitychange` handler fast-forwards overdue phases. `_visCleanup` stored on the store and called at `start()`/`reset()`.

## File map

- `PLAN.md` — agent contracts: file ownership, module APIs, routes, design language. Read before dispatching agents.
- `ROADMAP.md` — post-MVP plan; Phase 0 + Phase 1 now marked done. Read before any roadmap work.
- `SETUP_SYNC.md` — **the to-do list to make sync live** (Turso, OAuth, env vars, verify). Read first if enabling sync.
- `.env.example` — every sync env var + how to generate it.
- `api/_lib/db.ts` — Turso client + auto schema bootstrap. `api/_lib/auth.ts` — OAuth providers + signed-cookie sessions.
- `api/auth/{login,callback,logout}.ts`, `api/me.ts` — auth endpoints. `api/sync.ts` — bidirectional LWW/tombstone sync.
- `src/lib/sync.ts` — client sync engine (push/pull, triggers, login/logout, `requestAccessToken`). `src/store/syncStore.ts` — auth/sync zustand state.
- `mcp/` — Phase 1.5 private MCP server (self-contained package, own deps, eslint-ignored). `mcp/src/server.ts` + `mcp/README.md`. Auth via PAT: `api/token.ts` + `getAuthedUserId`/`createAccessToken` in `api/_lib/auth.ts`. Dormant until Phase 1 is configured; verify locally with `vercel dev` + a minted PAT.
- `tsconfig.api.json` — type-checks `/api`. `vercel.json` — SPA rewrite (excludes `/api`).
- `public/sw.js` — hand-rolled service worker (offline, skips `/api`). `public/manifest.webmanifest` + `public/icon.svg` — PWA install.
- `src/types.ts` — shared type contract (orchestrator-owned; don't change shapes). Now carries `deletedAt`/`updatedAt`/`dirty` sync fields.
- `src/store/timerStore.ts` — Zustand workout engine (phase machine, interval, session save, cueEvent, drift correction).
- `src/lib/storage.ts` — localStorage CRUD (`fitflow.*` keys); also sync merge (`applyRemote*`), the dirty queue, and JSON `exportData`/`importData`/`isExportBundle` (Settings → "Data").
- `src/lib/stats.ts` — streaks/stats.
- `src/lib/healthConnect.ts` — Phase 2 seam: `writeWorkoutToHealth()` (no-op on web; native build registers `window.fitflowNativeHealth`). Called from `timerStore` on complete. `capacitor.config.json` + `ANDROID.md` cover the native sideload build (user-run).
- `src/lib/format.ts` — shared formatters: `fmtDuration`, `dayKey`, `formatDateTime`, `formatRelativeDay`.
- `src/lib/audio.ts` — WebAudio cues (singleton AudioContext, closes on beforeunload).
- `src/data/exercises.ts` — 24 exercises + EXERCISE_MAP.
- `src/data/routines.ts` — CLASSIC_7 + SYSTEM_ROUTINES.
- `src/pages/` — Player, Dashboard, History, Settings, RoutineEditor, Library.
- `src/App.tsx` — routes + nav shell (orchestrator-owned, don't change).
- `vercel.json` — SPA rewrite (required for deep links in production).
