# FitFlow 7 — Full Project Review

**Date:** 2026-06-27
**Scope:** Entire codebase — `src/` (frontend, ~11K LOC), `api/` (12 Vercel serverless endpoints), `mcp/` (stdio MCP server), `test/` (12 suites).
**Method:** Multi-agent review (29 agents). Two agents inventoried what was built; four audit dimensions (frontend correctness, backend correctness, security, quality+tests) hunted for issues; **every finding was independently re-read and adversarially verified** before it counted. 23 raw findings → **22 confirmed**, 1 rejected (an "all controls intact" info-note with nothing to fix).

---

## 0. Resolution status (2026-06-27)

**All 20 distinct findings below are fixed**, in five commits, each with tests + green CI (build/lint/tsc + 154 vitest tests):

| Commit | Findings |
|---|---|
| `4e96ea3` fix(timer) | H1, M3, L1, L7 |
| `a7ec0ba` fix(sync/storage) | M1, M2, M4, L9, L10 (+ a `deleteRoutine` tombstone-propagation bug found while testing) |
| `0bd768d` fix(sync) | **H2** |
| `c9e7270` fix(api) | L2, L3, L4, L5, L6, L12 |
| `af6111d` test(sync)+refactor(pages) | M5, L8 |

(The 22 confirmed findings include two that were each reported by two dimensions — the OAuth host-header item, fixed as L3, and tombstone-GC, fixed as M4 — so 20 distinct fixes.) The detail below is retained as the record of what was found and why.

> **Note on exercise photos:** the inventory states 29/71 exercises have real photos. As of this date that is still accurate in code — `IMAGE_SLUGS` wires 29 slugs and `public/exercises/` holds 58 files (29 two-frame pairs); the other 42 use the emoji fallback. Wiring up the rest needs the image files on disk + the slugs added to `IMAGE_SLUGS`.

---

## 1. Executive summary

FitFlow 7 is a **local-first 7-minute-workout PWA** (Vite + React 19 + TypeScript + Tailwind v4 + Zustand) with an **optional cloud-sync backend** (Vercel `/api` + Turso/libSQL), a **private MCP server**, and **Android/Health Connect** packaging via Capacitor. It is **feature-complete and deployed to production** at `fitflow7.vercel.app`; the build/lint/typecheck/test pipeline is green (123 vitest tests) and CI runs it on every push.

The security posture is **solid**: the recent PAT-as-cookie fix holds, `resolveAuth` is the single fail-closed auth path, all sync is `user_id`-scoped, community sharing is copy-on-clone with PII stripped, SQL is fully parameterized, and cookies are `HttpOnly`/`Secure`/`SameSite=Lax`. No exploitable vulnerability was found.

**However, the headline "no engineering blockers / all green" status needs two asterisks.** The review surfaced **two high-severity correctness bugs in the two most important subsystems** — the workout timer and cloud sync — that current tests do not catch:

1. **Timer drift catch-up is broken** — returning to a backgrounded workout (the normal case on mobile, the primary target) leaves the timer stuck phases behind reality, and a workout that finishes while backgrounded is saved as `completed: false`.
2. **Sync watermark mixes server and client clocks** — a device with a slow clock can silently and permanently lose its own writes across devices; a far-future client timestamp can freeze a record so no device can edit or delete it.

Neither is a security issue and both are recoverable, but both undermine the two features the whole app is built around. They are the recommended first fixes.

---

## 2. What we've built (outline)

### 2a. Frontend (`src/`) — React 19 + Vite + Zustand + Tailwind v4, local-first PWA

**Capabilities delivered**
- **Workout timer/player** — prepare/work/rest/complete phases, WebAudio cues (no assets), wake-lock, fullscreen focus mode, keyboard shortcuts (Space/←/→/M/F/Esc), wall-clock drift correction (`src/pages/Player.tsx`, `src/store/timerStore.ts`).
- **Routines** — 6 built-in systems (Classic 7, Abs, Butt, Leg, Arm, Stretch) + user-created/cloned routines via a full editor with reorderable exercises and duplicates (`src/data/routines.ts`, `src/pages/RoutineEditor.tsx`).
- **Exercise library** — 71 exercises, search by name/muscle/tag, category + difficulty filters, focus-trapped detail modal, two-frame photo animation with emoji fallback honoring `prefers-reduced-motion` (`src/pages/Library.tsx`, `src/components/ExerciseModal.tsx`, `ExerciseVisual.tsx`, `src/data/exercises.ts`).
- **Body stats** — daily weight log (one entry/day, upsert), height/goal profile, BMI + WHO category scale + healthy range, weight-trend SVG chart, 7/30-day deltas, imperial/metric (`src/pages/Stats.tsx`, `src/lib/body.ts`).
- **Analytics** — streaks, this-week/this-month, weekly bars, GitHub-style activity heatmap, weekday distribution, top routines, completion rate, month calendar + last-12-months mini-grids — all hand-rolled SVG, no chart dependency (`src/lib/stats.ts`, `src/pages/Insights.tsx`, `Calendar.tsx`).
- **Challenges** — 30-day, 7-day, 14-day abs, 21-day full-body; deterministic day-builder, per-day completion auto-marked on full workout completion, progress rings, reset (`src/data/challenges.ts`, `src/pages/Challenges.tsx`).
- **Scheduling** — RFC-5545 `.ics` generation + Google Calendar template URLs, zero backend (`src/lib/calendar.ts`, `src/components/ScheduleWorkout.tsx`).
- **Cloud sync + account** — OAuth sign-in, MCP token mint/list/revoke, JSON export/import backup that merges by most-recent edit (`src/lib/sync.ts`, `src/pages/Settings.tsx`).
- **Community** — publish a routine, browse, clone (filters unknown exercise ids), report; degrades gracefully when backend absent (`src/pages/Community.tsx`, `src/lib/community.ts`).
- **Theming/PWA/native** — system/light/dark with pre-paint boot script, service worker + manifest, Android Health Connect mirroring dropped from the web bundle via `VITE_NATIVE` dynamic import (`src/lib/theme.ts`, `index.html`, `healthConnect.ts`, `native-health.ts`).

**Key modules**
- `src/lib/storage.ts` (772 lines) — the single local-first storage seam: 11 localStorage keys, resilient read/write, schema-version migrations, tombstone-aware getters, the dirty-queue, `markSynced` (only clears `dirty` if `updatedAt` survived the round-trip), `applyRemote*` LWW merges (weight date-collapse, challenge `completedDays` union), and export/import. Emits `fitflow:localwrite`.
- `src/lib/sync.ts` — client sync engine: posts dirty queue + cursor to `/api/sync`, coalesces concurrent calls, handles 401 (sign out) / 403 (pull-only), debounced + focus/visibility triggers.
- `src/store/timerStore.ts` (553 lines) — Zustand timer engine: single module-level interval, wall-clock `phaseEndsAt`, visibility fast-forward, seq-deduped cue events, idempotent session save, Health Connect mirror.
- `src/lib/{stats,body,calendar,community,audio,theme,format}.ts` — pure helper libraries (see inventory above).

**Data model** — `src/types.ts` defines `Exercise`, `Routine`, `WorkoutSession`, `UserSettings`, `BodyProfile`, `WeightEntry`, `Challenge`/`ChallengeProgress`, `Stats`. Every persisted record carries optional sync fields (`updatedAt` / `deletedAt` / `dirty`). 11 localStorage keys under `fitflow.*`; canonical body storage is metric (kg/cm); `unitSystem` and `theme` are device-local (never synced).

**Core invariants**
- Local-first: every write hits localStorage and emits `fitflow:localwrite`; the app works fully signed-out; sync is purely additive (no-op when signed out).
- Storage is the single seam — pages never touch localStorage directly; they re-read on `location.key` + `dataVersion`.
- Soft-delete only (tombstones) so deletes propagate; LWW by `updatedAt`; challenge days unioned; weight collapses duplicate dates deterministically.
- `markSynced` only clears `dirty` if `updatedAt` is unchanged through the round-trip (prevents dropping mid-flight edits — **except settings, see Finding M1**).
- Timer is wall-clock-anchored, not tick-counted; single interval guaranteed; session save idempotent; refuses to start a 0-exercise routine.

### 2b. Backend (`api/`) + MCP (`mcp/`) — Vercel serverless over Turso/libSQL

**Endpoints**
| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/api/auth/login` | GET | none | Validate provider, sign CSRF state cookie, 302 to consent |
| `/api/auth/callback` | GET | OAuth state | Verify state, exchange code, upsert user, set session |
| `/api/auth/logout` | POST | cookie | Clear session |
| `/api/me` | GET | cookie | `{user, providers}` or `{user:null}` |
| `/api/token` | POST/GET/DELETE | cookie only | Mint / list / revoke PATs |
| `/api/sync` | POST | cookie or PAT | Bidirectional LWW sync (6 collections) |
| `/api/routines/public` | GET | none | Browse 50 recent or one by slug (PII-stripped) |
| `/api/routines/publish` | POST | cookie/PAT (readwrite) | Publish immutable snapshot, caps enforced |
| `/api/routines/report` | POST | cookie/PAT (readwrite) | Report; auto-block at 3 distinct reporters |

**Auth/token model** (`api/_lib/auth.ts`, `tokens.ts`) — no auth SDK; hand-rolled OAuth authorization-code flow. Sessions and PATs are HMAC-SHA256-signed base64url JSON. `resolveAuth` is the single resolver: session cookie → full access; `Bearer` PAT → validated against the revocable `access_tokens` registry with DB-authoritative scope. Fails closed on any error.

**Sync protocol** (`api/sync.ts`) — one `db.batch` write transaction; every upsert applies only `WHERE excluded.updated_at > current.updated_at AND user_id matches`; pulls all 6 collections changed since the cursor, tombstones included.

**DB schema** (`api/_lib/db.ts`) — 9 tables (`users`, `routines`, `sessions`, `settings`, `public_routines`, `access_tokens`, `routine_reports`, `weight_log`, `body_profile`, `challenge_progress`) + 6 indexes, auto-created idempotently and memoized per warm instance.

**MCP server** (`mcp/src/server.ts`) — stdio `fitflow7` v1.0.0, PAT-authed thin client of `/api/sync`, 7 tools (history, stats, routines, log_session, compare_periods, PRs, routine_detail).

**Backend invariants**
- A PAT can never be replayed as a session (`getUserId` requires `sid`, rejects `pat`; `decodePat` reads only the `Authorization` header).
- DB scope is authoritative over the token claim → revocation/downgrade is immediate.
- Sync is strictly LWW and per-user isolated; deletes propagate as tombstones; system routines never sync.
- Community rows are content-only/PII-free; published snapshots immutable; abuse caps (25/owner, 10/hour, auto-block at 3 distinct reporters).
- Fully local-only until env configured; signatures verified in constant time; open-redirect-guarded `returnTo`.

---

## 3. Review findings

22 confirmed, each verified against the source. Severities are the post-verification (adjusted) values. (Two issues were each reported by two dimensions — the OAuth host-header item and the tombstone-GC item — and are merged here.)

### 🔴 High

**H1 — Timer drift catch-up only ever advances ONE phase** · `src/store/timerStore.ts` (`handleVisibility`, ~219–263)
The fast-forward loop that re-syncs the timer on foreground return rebases `phaseEndsAt = nowMs + duration` on the **fixed** `nowMs` captured before the loop. After the first transition `phaseEndsAt > nowMs`, so the `phaseEndsAt <= nowMs` guard is immediately false and the loop exits after a single step. Backgrounding mid-workout and returning later leaves the timer stuck phases behind real time; `tick()` can't recover (it replays each phase in full real time). On mobile/Capacitor (JS frozen while backgrounded) **any** app-switch mid-workout reproduces it. **Fix:** accumulate the boundary — `phaseEndsAt += duration*1000` inside each branch — so the loop walks every elapsed phase.

**H2 — Sync cursor compares server-clock `since` against client-clock `updated_at`** · `api/sync.ts` (cursor `serverTime` line ~269; pull filters ~272–292; client cursor `src/lib/sync.ts:127`)
The next-sync cursor returned to the client is the **server** clock (`new Date().toISOString()`), but every pull filters `WHERE updated_at > ?` against `updated_at`, which is the **client**-supplied value stored verbatim. If device A's clock runs behind, A can write a record whose `updated_at` is less than the cursor device B already saved; B's `updated_at > since` filter skips it and — because the cursor only advances — **never receives it again** without a full re-pull (logout/login). Separately, a far-future client `updated_at` makes a row impossible to edit or tombstone from any device (LWW `>` lockout) until real time passes it. MCP-logged sessions are subject to the same skew. **Fix:** add a server-assigned monotonic watermark (e.g. `server_seq` or server-stamped `server_updated_at`) per synced table; base the pull filter + returned cursor on it; keep client `updated_at` only for LWW tie-breaking.

### 🟠 Medium

**M1 — Settings edit during a sync round-trip is silently marked clean and never pushed** · `src/lib/storage.ts` (`markSettingsSynced`, ~331–333)
`markSettingsSynced()` clears `dirty` unconditionally — unlike `markSynced()` for every other record type, which guards on `updatedAt`. An edit made while the push is in flight gets its `dirty` flag cleared without being sent, and the newer local stamp blocks the pull from restoring it, so the device diverges from the cloud until the next unrelated settings change. **Fix:** mirror the `updatedAt` guard used everywhere else.

**M2 — Un-marking a challenge day does not survive sync** · `src/lib/storage.ts` (`applyRemoteChallengeProgress` ~442–463; `unmarkChallengeDay` ~730–736)
`completedDays` maps are **unioned** with no per-day tombstone, so a day the user unchecks on device A is re-added the moment a record that still contains it merges in. The unmark appears to work locally then silently reappears after sync. **Fix:** track per-day removals (per-day tombstone/`clearedDays`) and honor the later of mark vs unmark.

**M3 — Timer phase state machine is duplicated between `tick()` and the visibility handler** · `src/store/timerStore.ts` (`tick` ~276–364 vs `handleVisibility` ~210–263)
The work→rest→work→complete progression is implemented twice. They **already diverge**: `tick()` saves a natural finish with `naturalFinish=true`, but the visibility loop passes `false` — so a workout that completes while backgrounded is persisted with `completed:false`. Tied to H1. **Fix:** extract one pure `advancePhase(state, nowMs)` reducer; have `tick()` call it once and `handleVisibility` loop on it; unit-test the reducer directly.

**M4 — No tombstone garbage collection anywhere** · `src/lib/storage.ts` (deletes/`clearSessions`) + `api/_lib/db.ts` / `api/sync.ts` (pulls)
Soft-deletes only set `deletedAt`+`dirty`; nothing ever reaps tombstones. `clearSessions` rewrites the entire history as permanent tombstones; the server returns every tombstone newer than the cursor on each pull. For a heavy long-term user the localStorage blob and per-pull payload grow unbounded, and `writeJSON` silently swallows quota-exceeded errors → eventual silent write loss. **Fix:** age-based reaper that drops *synced* (`dirty:false`) tombstones older than a retention window, client and server.

**M5 — Client sync engine (`src/lib/sync.ts`) has zero test coverage**
The most logic-dense client module — `inFlight`/`rerunQueued` coalescing, the 401 sign-out path, the 403 pull-only latch, `markSynced`-before-`applyRemote` ordering, the debounce — has no test. A regression here would silently drop user writes. **Fix:** a `sync.test.ts` mocking `fetch` + the store, asserting push/pull body shape, 401→`setUser(null)`, 403→pull-only rerun omits the dirty payload, concurrent calls coalesce, and `storage.markSynced` is *not* called on the pull-only path.

**M6 — OAuth callback handler is completely untested, including its CSRF-state guard** · `api/auth/callback.ts` (~16–78)
`handlers.test.ts` never imports `callback.ts`/`login.ts`/`logout.ts`. The state-mismatch branch (pure, no network needed) and the user-upsert are untested; a regression that accepted a missing state would reopen CSRF/login-fixation with nothing to catch it. **Fix:** test no/mismatched state → 400 with no user row; seeded state + stubbed profile fetch → upsert + stable id reuse + session cookie set.

### 🟡 Low

- **L1 — Countdown beep fires only at 2s and 1s** despite the "last 3 seconds" comment/intent · `timerStore.ts` `tick()` ~286–294 (the `>= 0` half of the condition is dead). Audio nuance only.
- **L2 — Community publish accepts unbounded/negative/zero numeric fields** · `api/routines/publish.ts` — `workSeconds`/`restSeconds`/`rounds` checked only for finiteness; `rounds=0` or huge values persist into the public feed. Add integer range guards mirroring the editor's bounds. (Requires an authed write-scope user; bounded by the per-owner/hour caps.)
- **L3 — OAuth redirect base URL derived from client-controllable `Host`/`X-Forwarded-Host` when `APP_URL` is unset** · `api/_lib/auth.ts` `getBaseUrl`/`getRedirectUri`. Defense-in-depth only — GitHub/Google enforce exact-match `redirect_uri`. **Fix:** set `APP_URL` in production (the early-return already prefers it).
- **L4 — Publish caps have a check-then-insert race** · `api/routines/publish.ts` — concurrent publishes can overshoot the 25/owner and 10/hour caps. **Fix:** enforce atomically via `INSERT ... SELECT ... WHERE COUNT < limit`.
- **L5 — `resolveAuth` can throw on a malformed cookie**, violating its documented "never throw to the caller" fail-closed contract · `parseCookies` `decodeURIComponent` is unguarded; `getUserId` runs before the caller's try block → opaque 500 (still fails closed, attacker only breaks their own request). **Fix:** wrap the per-cookie decode in try/catch.
- **L6 — Open self-service registration** · `api/auth/callback.ts` — any GitHub/Google user can create an account and write to the deployer's Turso DB. Per-user isolation is intact, so this is a storage/cost-abuse vector vs the app's stated single-user intent. **Fix:** gate the callback on an email/provider-id allowlist if single-tenant.
- **L7 — Visibility-cleanup stashed on the store via an `as unknown as` cast** · `timerStore.ts` ~267–270, 534–535 (the only `as unknown as` in the app). **Fix:** a module-level `let visCleanup` + `clearVisListener()` mirroring `intervalHandle`/`clearTick()`.
- **L8 — Repeated storage-read `useMemo` pattern with ~16 eslint-disables and inconsistent deps** across 7 pages; `Stats` `settings` memo omits `location.key` (won't re-read on nav) while siblings include it. **Fix:** one `useLiveData(read, extraDeps)` hook carrying the single disable.
- **L9 — Convergence-critical sync merge branches untested** · same-day challenge earliest-wins, weight equal-`updatedAt` id-tiebreak, and `applyRemoteSessions` (no direct test). **Fix:** add the three cases; assert order-independence.
- **L10 — Duplicated local-date helpers** between `stats.ts`, `format.ts`, and `body.ts`. **Fix:** export from `format.ts`, delete the private copies.
- **L11 — Authenticated `/api/me` branch is untested** (only the unauthenticated path is) — the `avatar_url`→`avatarUrl` mapping and missing-row fallback could regress unnoticed. **Fix:** seed a user, call with `cookieFor(userId)`, assert the mapped object.
- **L12 — `audio.ts` registers a top-level `window` listener with no `typeof window` guard**, unlike `theme.ts`/`healthConnect.ts` — unsafe to import under the node test env / any future SSR. **Fix:** wrap in `if (typeof window !== 'undefined')`.

---

## 4. Verified healthy (no action)

The dedicated security pass confirmed — and adversarial verification agreed — that the core auth/data-boundary controls are **intact**:
- PAT-as-cookie bypass stays fixed (`auth.ts` rejects `pat` on the cookie path; `decodePat` reads only the `Authorization` header).
- `resolveAuth` is the single auth path, DB-scope-authoritative, fail-closed on any error.
- Every sync pull is `WHERE user_id = ?`; upserts guard `user_id = excluded.user_id` (cross-user overwrite no-ops).
- Community sharing is copy-on-clone; `owner_id`/email never echoed; `rowToSafe` strips PII.
- All SQL is parameterized (no string interpolation); no `dangerouslySetInnerHTML`.
- Cookies are `HttpOnly`/`Secure`/`SameSite=Lax`; OAuth state is signed, 10-min, provider-bound, double-submit compared.
- Regression tests back each control (`handlers.test.ts`).

Build/lint/typecheck/test pipeline is green (123 tests); CI runs it on every push; deployed to Vercel prod.

---

## 5. Recommended next steps (prioritized)

1. **Fix H1 + H2** — the timer catch-up and the sync clock-skew watermark. These are the two features the app is built on, both have silent failure modes, and both are currently untested. Add the regression tests (M3/M5/M6/L9) alongside the fixes.
2. **Fix the medium data-integrity trio** — M1 (settings round-trip), M2 (challenge unmark), M4 (tombstone GC).
3. **Close the test gaps** — M5 (`sync.ts`), M6 (OAuth callback), L9, L11; these guard the exact paths H1/H2/M1/M2 live in.
4. **Low-hanging hardening/cleanup** — L3 (set `APP_URL` in prod), L2/L4 (publish validation + atomic caps), L5 (cookie decode guard), L1/L7/L8/L10/L12 as a quality sweep.
5. **Decision-gated / owner-gated** (unchanged from STATUS/BACKLOG): real two-browser sign-in verification (T1), Android APK (T2), Phase 4 social (B3).

> Note: `STATUS.md`/`BACKLOG.md` currently state "no engineering blockers / all green." That remains true for *shipped, tested* behavior, but H1 and H2 are real defects in production code that tests don't yet exercise — worth reflecting there once triaged.
