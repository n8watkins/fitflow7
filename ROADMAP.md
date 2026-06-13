# FitFlow 7 — Roadmap

Status doc for post-MVP work. The MVP is feature-complete and deployed.

**Status (2026-06-12, session 4): Phase 0 and Phase 1 are built.** Phase 1
(accounts + cloud sync) ships dormant — the backend exists but does nothing
until env vars are provided (see `SETUP_SYNC.md`). The signed-out app is
unchanged. Phases 1.5 and 2 remain not started.

See `HANDOFF.md` for current session state, `SETUP_SYNC.md` to enable sync, and
`PLAN.md` for the agent/build contract.

## Readiness assessment (as of 2026-06-12)

**In our favor:**
- One clean persistence seam — every read/write goes through `src/lib/storage.ts`.
  Sync layers in there; pages don't change.
- Sync-friendly IDs: `crypto.randomUUID()` everywhere → no merge collisions.
- Typed data contracts in `src/types.ts` → ready-made API schema.
- Routines carry `createdAt`/`updatedAt`; sessions are append-only.

**Gaps that block V1 (close in Phase 0 first):**
1. No backend, no auth, no user identity — nothing to sync *to*.
2. No delete tombstones — `deleteRoutine` drops the record, so a delete on one
   device resurrects from another on sync. Needs soft-delete (`deletedAt`) or
   server authority.
3. No schema versioning on stored blobs — migrations during sync rollout are risky.
4. Storage is synchronous — fine for offline-first (local write + background
   push), but the seam doesn't reconcile remote changes yet.

## Phase 0 — Sync foundations ✅ DONE (commit 5bc9781)

- `schemaVersion` key + idempotent migration runner in `src/lib/storage.ts`
  (runs at startup in `main.tsx`).
- Soft-delete tombstones (`deletedAt`) on routines; `updatedAt` on sessions.
- Per-record `dirty` marker + `getPendingSync()`/`markSynced()` queue seam.
- No behavior change; `tsc`/`lint`/`build` clean.

## Phase 1 — Accounts + Cloud Sync ✅ BUILT (dormant until configured)

Built across commits in session 4. Enable via `SETUP_SYNC.md`.
- Backend: Turso (libSQL) via `@libsql/client`; Vercel serverless functions in
  `/api` (auto-created schema). `api/sync.ts` is one bidirectional endpoint.
- Auth: hand-rolled OAuth (GitHub + Google), HMAC-signed session cookie. No
  password storage, no auth SDK. `/api/auth/login|callback|logout`, `/api/me`.
- Sync engine (`src/lib/sync.ts`): offline-first, last-write-wins by `updatedAt`,
  tombstone-aware. Push dirty queue + pull on load/focus/visibility/local-write.
- UI: optional sign-in in Settings (app fully usable signed-out), sync status
  pill in the nav.
- Deps added (PLAN.md "no new deps" relaxed here): `@libsql/client`,
  `@vercel/node` (types).
- **Remaining to go live:** provision Turso + OAuth app, set env vars, redeploy.
  Then real-device verification of cross-device sync + tombstones.

## Phase 1.5 — Private MCP layer (user calls this the highest-value item)

- Requires the Phase 1 API. Expose own data over MCP: `get_workout_history`,
  `get_stats`, `start_routine`, `log_session`. Auth-scoped to the user.

## Phase 2 — Android + Health Connect

- PWA is already installable (service worker + manifest shipped). Decide: TWA
  (wrap the PWA, fastest) vs. native shell.
- Health Connect: write completed workouts (duration, calorie estimate) to the
  device health store.

## Cross-cutting (any phase)

- ✅ Test framework added (Vitest). Pure-logic unit tests in `test/` cover the
  sync-critical paths: storage tombstone/LWW `applyRemote*`, the migration runner,
  the dirty queue (incl. the mid-sync concurrent-edit guard), and stats/format.
  Run with `npm run test`. Next: add coverage for the client sync engine
  (`lib/sync.ts`) and the `/api` handlers (would need a request harness).
- API rate limiting / abuse protection.
- ✅ JSON data export/import — done. Settings → "Data": exports a versioned
  bundle (routines incl. tombstones, sessions, settings); import merges
  last-write-wins, marks records dirty so they push on next sign-in, and skips
  records older than local. Logic in `storage.ts` (`exportData`/`importData`/
  `isExportBundle`), covered by unit tests.

## Recommended sequencing

Phase 0 → Phase 1 → Phase 1.5 → Phase 2. Phase 0 de-risks everything after and
does not commit to a backend.
