# FitFlow 7 — Handoff (2026-06-29, session 8)

Zero-context handoff. **Read these first, in order, and don't re-ask anything they answer:**
1. `STATUS.md` — living detailed status (done / TODO / owner items / invariants / file map). Session 8 entry is current.
2. `REVIEW.md` — the full-project review this session acted on; §0 is the finding→commit resolution table.
3. `BACKLOG.md` — forward work list (owner-gated + decision-gated items).
4. This file — orientation, what session 8 changed, and the ordered next steps.

## Project summary
FitFlow 7 is a desktop-first, mobile-responsive **7-minute workout web app**. Local-first: `localStorage` is the source of truth through one seam (`src/lib/storage.ts`); the signed-out app works fully offline. Optional cloud sync + accounts + a private MCP server layer on top.

- **Stack:** Vite + React 19 + TypeScript + Tailwind v4 (CSS-first `@theme` in `src/index.css`) + Zustand + react-router-dom v7. Backend = Vercel serverless funcs in `/api` + Turso (libSQL). MCP server in `mcp/`.
- **Deployed:** https://fitflow7.vercel.app (public, live). Deploy: `vercel --prod --yes` (CLI authed; project linked as `fitflow7`; re-`vercel link --yes --project fitflow7` after a fresh clone). Repo: https://github.com/n8watkins/fitflow7, branch `main`.
- **Verify (must stay green):** `npx tsc -b && npm run lint && npm run test && npm run build` (+ `cd mcp && npm run typecheck`). **154 tests.** CI (`.github/workflows/ci.yml`) runs the whole pipeline on push/PR.

## State (session 8)

This session ran a 29-agent review (→ `REVIEW.md`, commit `5abfe98` from the prior turn) and then **fixed all 20 distinct findings**. Tests 123 → **154**; `tsc`/`lint`/`build` green; production build verified.

**⚠️ These 7 commits are LOCAL ONLY — `main` is ahead of `origin/main` by 7 and was NOT pushed (and prod was NOT redeployed). The next agent must decide push timing with the owner.**

This session's commits (newest first):
- `e770b11` docs(review): resolution table in `REVIEW.md` + exercise-photo note
- `af6111d` test(sync)+refactor(pages): client `sync.ts` tests (M5) + `useLiveData` hook (L8)
- `c9e7270` fix(api): publish range-validation (L2) + atomic caps (L4) + OAuth trusted host (L3) + cookie fail-closed (L5) + registration allow-list (L6) + audio guard (L12)
- `0bd768d` fix(sync): **server-authoritative sync watermark (H2)** + future-timestamp clamp
- `a7ec0ba` fix(sync/storage): settings round-trip (M1) + challenge unmark (M2) + tombstone GC (M4) + merge tests (L9) + date-helper dedupe (L10) + `deleteRoutine` propagation bug
- `4e96ea3` fix(timer): **multi-phase drift catch-up (H1)** + unified `advancePhase` reducer (M3) + countdown (L1) + cast cleanup (L7)
- `5abfe98` docs: the review itself (`REVIEW.md`)

**Verified working:** full pipeline green locally (154 tests incl. new H1/H2/M1/M2/M4/M5/M6/L9/L11 coverage); `npm run build` succeeds. **Not yet verified in production** (not pushed/deployed) and **not exercised by a real multi-device sign-in** (Turso `users` table is still empty — same owner-gated step that predates this session).

**In flight / half-done:** nothing code-wise — every queued finding is fixed and committed. The only loose ends are decisions/ops (push, deploy, owner sign-in test) and the exercise-photo gap (below).

## Next steps (ordered)

1. **Decide push + redeploy.** `main` is 7 commits ahead of `origin/main`, unpushed. When the owner is ready: `git push origin main` then `vercel --prod --yes`. The H2 schema change (new `server_updated_at` columns + `challenge_progress.cleared_days`) is applied **automatically** by `ensureSchema` (CREATE + idempotent ALTER + backfill) on the first request after deploy — no manual migration. Acceptance: prod home 200, `…/api/auth/login?provider=github` 302, no 500s in Vercel logs.
2. **Owner sign-in verification (F1/T1 — owner-gated, unchanged).** Owner signs in on two browsers on the live site; confirm routines/sessions **and** B1 data (weigh-ins / body profile / challenge progress) propagate and that deletes/unmarks tombstone across devices. Agent then confirms rows landed in Turso. This is the long-standing last go-live step.
3. **Exercise photos (owner has the assets?).** The owner stated "all exercises have accurate photos," but the code is still **29/71**: `IMAGE_SLUGS` in `src/data/exercises.ts` wires 29 slugs and `public/exercises/` holds 58 files (29 two-frame pairs). To cover the other 42: drop `<slug>.jpg` + `<slug>-2.jpg` into `public/exercises/` and add each slug to `IMAGE_SLUGS`. Acceptance: `EXERCISES` entries get `imageUrl`/`imageUrl2`, `ExerciseVisual` shows photos not emoji. **Needs the image files from the owner — confirm they exist before starting.**
4. **(Optional) Adversarial review of the session-8 diff.** A multi-agent verification pass over `git diff 5abfe98^..HEAD` before pushing — the user was offered this and it needs an explicit go (it spends tokens). Skip if confident.
5. **Decision-gated (don't build without a product go):** Phase 4 social (follows/leaderboards/public profiles); custom/variable challenges; monetization. See `BACKLOG.md`.

## Conventions & gotchas (hard-won)

- **Commit per logical change** with the trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. Conventional-commit style (`fix(scope): …`, `test: …`, `docs: …`). Commit/push only when the owner asks — this session deliberately did **not** push.
- **`/api` ESM imports need explicit `.js`** (Vercel ESM runtime), e.g. `import { resolveAuth } from './_lib/tokens.js'`.
- **Lint traps:** `react-hooks/exhaustive-deps` on storage-read memos — now centralized in `useLiveData` (one disable there); don't reintroduce per-page `useMemo(() => getX(), [location.key, dataVersion])`, use `useLiveData(() => getX(), [extraDeps])`. Custom hooks wrapping `useMemo` with a spread dep list also trip `react-hooks/use-memo` (disable both rules on that line).
- **Sync watermark (H2 — important):** pulls filter and the cursor advances on the **server-stamped `server_updated_at`**, never the client `updatedAt`. When adding a new synced table/column: stamp `server_updated_at = serverTime` in the upsert, add the column to CREATE + `ALTERS` + `BACKFILLS` in `api/_lib/db.ts`, and filter pulls on it. Keep `updatedAt` only for LWW conflict resolution. Client `updated_at` is clamped server-side if it's >24h in the future.
- **Tombstone GC (M4):** `gcTombstones()` runs once at startup (`src/main.tsx`) and only reaps soft-deletes that are **synced (`dirty:false`) and older than 90 days** — never drop that guard or pending deletes won't propagate.
- **Single-user invariant:** cloud tables are `user_id`-scoped; sharing is copy-on-clone via separate endpoints — **never widen `/api/sync`** to serve other users. Fail closed when env unconfigured (no `SESSION_SECRET`/`TURSO_*` → 401 / `{user:null}`). Never commit `.env`.
- **Optional registration lock-down (L6):** `ALLOWED_EMAILS` / `ALLOWED_PROVIDER_IDS` env (comma-separated) restrict who can sign in; **leave unset for open registration** (default — won't lock the owner out). `PROVIDERS` reads its client id/secret at import time, so tests mutate the object directly (see `test/api/handlers.test.ts`).
- **Testing `/api`:** Vercel-style `(req,res)` handlers driven by hand-rolled stubs against in-memory libSQL (`TURSO_DATABASE_URL=:memory:`). The `mockRes` helper now has `redirect`. Time-sensitive tests use `vi.useFakeTimers()` + `vi.setSystemTime`. Client `sync.ts` tests use `vi.resetModules()` per test to reset its module-level `inFlight`/`pushForbidden`.
- **`Date.now`/`new Date()` cannot be used in workflow scripts** (unrelated to app code, but relevant if you run the optional review workflow).

## File map (what matters for the next steps)

- `REVIEW.md` — full review + §0 finding→commit table (the canonical record of session 8).
- `src/store/timerStore.ts` — timer engine; `advancePhase` pure reducer is the shared phase machine (H1/M3).
- `src/lib/storage.ts` — localStorage seam: CRUD, migrations, tombstones, dirty queue, `applyRemote*` LWW, `gcTombstones` (M4), `markSettingsSynced` (M1), challenge `clearedDays` merge (M2).
- `src/lib/sync.ts` — client sync engine (push/pull/coalesce/401/403); tested in `test/sync.test.ts` (M5).
- `src/hooks/useLiveData.ts` — shared storage-read-on-nav+sync hook (L8); used by Dashboard/Stats/Challenges/Calendar/History/Insights/Community.
- `api/sync.ts` — server sync; `server_updated_at` stamping + `clampStamp` (H2); `cleared_days` round-trip (M2).
- `api/_lib/db.ts` — schema + `ALTERS`/`BACKFILLS` (apply new columns idempotently).
- `api/_lib/auth.ts` — sessions/PATs/cookies; `getBaseUrl` trusted-host (L3), `parseCookies` fail-closed (L5), `isAllowedIdentity` (L6).
- `api/auth/callback.ts` — OAuth callback; allow-list gate (L6); tested in `test/api/handlers.test.ts` (M6).
- `api/routines/publish.ts` — range validation (L2) + atomic caps (L4).
- `src/data/exercises.ts` — `IMAGE_SLUGS` (29/71) for next-step #3; `public/exercises/` holds the JPGs.
- `test/{timer,storage,sync,api/handlers}.test.ts` — where the new coverage lives.
