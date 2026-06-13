# FitFlow 7 — Roadmap

Status doc for post-MVP work. The MVP is feature-complete, deployed, and being
dogfooded. **Nothing below is built yet.** The user's standing decision: dogfood
daily for ~a week before starting V1, and let real use pick the first feature.
The one exception that is safe to start anytime is **Phase 0** (pure local
groundwork, no backend).

See `HANDOFF.md` for current session state and `PLAN.md` for the agent/build
contract.

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

## Phase 0 — Sync foundations (safe to start now; no backend)

- Add `schemaVersion` + a small migration runner in `src/lib/storage.ts`.
- Add soft-delete tombstones (`deletedAt`) to routines; add `updatedAt` to sessions.
- Introduce a local "dirty/pending" marker per record (a sync queue concept) so
  writes can later be replayed to a server. No behavior change yet.
- Acceptance: existing app behaves identically; stored data gains version +
  tombstone + dirty fields; `tsc`/`lint`/`build` clean.

## Phase 1 — Accounts + Cloud Sync (the deferred "V1")

- Backend: Turso (libSQL) + thin API: auth + `GET/PUT /routines`, `/sessions`,
  `/settings` with `updatedAt` cursors.
- Auth: passwordless magic link or OAuth — no password storage.
- Sync engine: offline-first, last-write-wins by `updatedAt`, tombstone-aware.
  Background push of the dirty queue + pull on app focus.
- UI: optional sign-in (app fully usable signed-out), sync status indicator.
- Adds the first dependency(ies) — revisit PLAN.md's "no new deps" rule here.

## Phase 1.5 — Private MCP layer (user calls this the highest-value item)

- Requires the Phase 1 API. Expose own data over MCP: `get_workout_history`,
  `get_stats`, `start_routine`, `log_session`. Auth-scoped to the user.

## Phase 2 — Android + Health Connect

- PWA is already installable (service worker + manifest shipped). Decide: TWA
  (wrap the PWA, fastest) vs. native shell.
- Health Connect: write completed workouts (duration, calorie estimate) to the
  device health store.

## Cross-cutting (any phase)

- Add a test framework once a backend exists — sync logic is where bugs hide and
  the "no tests" MVP stance stops paying off there.
- API rate limiting / abuse protection.
- JSON data export/import — cheap, useful, a migration safety net before sync ships.

## Recommended sequencing

Phase 0 → Phase 1 → Phase 1.5 → Phase 2. Phase 0 de-risks everything after and
does not commit to a backend.
