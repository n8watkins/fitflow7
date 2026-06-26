# FitFlow 7 — Backlog / Next Steps

Forward-looking work list, written to be picked up **with zero prior context**. For current state read `STATUS.md` first.

## Orientation (read once)
- **Stack:** Vite + React 19 + TypeScript + Tailwind v4 (CSS-first `@theme` in `src/index.css`; tokens: `accent`, `surface`, `card`, `card-hover`, `edge`; **light theme** via `html[data-theme='light']` overrides) + Zustand + react-router-dom v7. Backend = Vercel `/api` + Turso (libSQL). Private MCP server in `mcp/`.
- **Local-first:** `src/lib/storage.ts` is the single localStorage seam (CRUD + `dirty`/`deletedAt` tombstones + export/import). Pure logic in `src/lib/*` with Vitest in `test/`. Pages re-read storage via a `useSyncStore` `dataVersion` + `location.key` memo idiom.
- **Verify (must stay green):** `npx tsc -b && npm run lint && npm run test && npm run build` (+ `cd mcp && npm run typecheck`). **107 tests** today. CI (`.github/workflows/ci.yml`) runs the whole pipeline on push/PR.
- **Lint gotchas:** the repo enforces `react-hooks/set-state-in-effect` (don't `setState` directly in an effect — derive, or do it in an async callback) and `react-hooks/exhaustive-deps` (storage-read memos use an inline `// eslint-disable-next-line`). `/api` ESM imports need explicit `.js`.
- **Invariants:** signed-out app is fully offline; cloud tables are `user_id`-scoped, sync is LWW by `updatedAt`; new body/weight/challenge data is **local-only by design** (see B1). Don't widen `/api/sync` to serve other users.
- **Auth/tokens (post-S1):** PATs carry a `jti` and live in the `access_tokens` registry — valid only while a non-revoked row exists; `scope` is `read`|`readwrite`. `api/_lib/tokens.ts` `resolveAuth(req)` is the single auth entry for sync/publish/report (cookie = full access, PAT = registry-checked). Manage tokens via `/api/token` GET/POST/DELETE (cookie-authed) and Settings → Account.
- **Testing /api:** handlers are Vercel-style `(req, res)`; `test/api/handlers.test.ts` drives them with hand-rolled stubs against an in-memory libSQL DB (`TURSO_DATABASE_URL=:memory:`). Page render smokes (`test/pages.smoke.test.tsx`) use `react-dom/server` (no jsdom).
- **Exercise images:** `public/exercises/<slug>.jpg` (+ `-2.jpg`, two frames that animate); slugs registered in `IMAGE_SLUGS` (`src/data/exercises.ts`). Source: free-exercise-db (Unlicense). 29/71 covered; emoji is the fallback.

**Shipped recently (don't redo — see `git log`):** 71 exercises + cues, Stats/BMI, Calendar, Challenges + auto-completion, mobile-first Dashboard, responsive nav, exercise modal, first-run empty states, goal-weight/trend deltas, player empty-routine guard, route code-splitting, render + `/api` tests + CI, **29 real exercise images**, **light theme + toggle**, **revocable/scoped tokens + community hardening (S1)**, **token management UX (S2)**.

---

## P2 — durability & correctness

### B1 · Cloud sync for body profile + weight log + challenge progress
**Why:** these are **local-only** today (deliberately). Once a user signs in, weight history won't follow them across devices. **Effort:** L. **Soft-depends on:** F1 (prove the existing routine/session sync works on real devices before stacking new data on it) — but B1 can be written + locally tested now (`vercel dev` + a `file:` Turso DB, plus the B2 harness). Reaching users still needs F3 (deploy).
**Files:** `src/lib/storage.ts` (`getPendingSync` only drains routines+sessions — extend it + add `applyRemoteWeightLog/BodyProfile/ChallengeProgress` + `markSynced` clearers; LWW by `updatedAt`, keyed by `id`/singleton/`challengeId`), `src/lib/sync.ts` (POST body + apply), `api/sync.ts` + Turso schema (new tables/columns, `user_id`-scoped). The storage seam already stamps `dirty`/tombstones for these and export/import already round-trips them. Extend `test/api/handlers.test.ts` to cover the new collections' LWW/scoping.
**Acceptance:** add a weigh-in on device A → appears on device B on focus; delete propagates; single-user invariant preserved.

---

## Owner-only / ops (not code an agent can finish alone)

- **F1 · Real-device sign-in verification:** sign in on two browsers, confirm routine/session propagation + delete tombstones; agent confirms in Turso. De-risks **B1**. (Soft gate — not a hard block on writing B1.)
- **F2 · Android APK:** `VITE_NATIVE=true npm run build` → `npx cap add android` → manifest perm → Android Studio → sideload (`ANDROID.md`).
- **F3 · Deploy:** push `main` to GitHub + `vercel --prod --yes` (re-`vercel link --yes --project fitflow7` after a fresh clone). Owner-trigger only. **Note:** S1 added Turso tables (`access_tokens`, `routine_reports`) — they auto-create on first request, no migration step.

---

## Bigger bets (decision required — don't build without a go)
- **Phase 4 social** (follows, leaderboards, public profiles) — **no longer gated** now that S1 hardened tokens + community abuse paths; still a large data-model + moderation jump. Needs a product go.
- **Challenge variety / custom challenges** — let users pick a start date or build a challenge from their own routines. **Effort:** M–L.
- **Monetization** — currently "no subscriptions." Revisit only on a product decision.

---

## Polish / nice-to-haves (low priority)
- **Light-theme visual pass:** the palette is a token remap verified for contrast in code, not yet eyeballed on every screen. Flip System/Light/Dark in Settings → Appearance and tune any screen that reads off (owner is the taste authority).
- **More exercise images:** 42 of 71 are still emoji (no confident bodyweight match in free-exercise-db). Could fill gaps with Everkinetic/wger (CC-BY-SA — needs a Credits line + ShareAlike) if desired.

---

### Suggested order for a fresh session
1. **F1** (owner) → then **B1** (cloud-sync body/weight/challenge, now testable via the /api harness).
2. **F3** to ship everything that's accumulated locally (this work isn't deployed yet).
3. **Phase 4** only on a product go; **challenge variety** any time after.
