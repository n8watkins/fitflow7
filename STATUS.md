# FitFlow 7 — Project Status

Snapshot of everything done, everything left (technical), and the blockers that
are on the owner (you). Updated 2026-06-20.

- **Live:** https://fitflow7.vercel.app (public, deployed). Repo: `main`, all pushed.
- **Verify pipeline:** `npx tsc -b` + `npm run lint` + `npm run test` (37 tests) + `npm run build` — all green. `/api` is type-checked via `tsconfig.api.json`; `mcp/` has its own `npm run typecheck`.
- **Core principle held throughout:** the app stays fully usable **signed-out / offline**; every cloud feature ships **dormant** (does nothing until env vars are set) and is **verified locally** against `vercel dev` + a file DB before deploy.

---

## 1. What's done

### MVP (V1) — shipped
7-minute workout web app: timer engine (Zustand, drift-corrected, wake-lock), 24 exercises, Classic 7 + custom routines, history, stats/streaks, audio cues, PWA offline shell (service worker + manifest). localStorage is the source of truth via one seam (`src/lib/storage.ts`).

### Phase 0 — Sync foundations — shipped
Schema version + idempotent migration runner, soft-delete tombstones (`deletedAt`), per-record `dirty` queue, `updatedAt` stamps. No behavior change.

### Phase 1 — Accounts + cloud sync — **built, DORMANT**
- Turso (libSQL) via `@libsql/client`; Vercel serverless functions in `/api`; schema auto-creates (`api/_lib/db.ts`).
- Hand-rolled OAuth (GitHub + Google), HMAC-signed session cookie — no auth SDK (`api/_lib/auth.ts`, `api/auth/*`, `api/me.ts`).
- `api/sync.ts`: one bidirectional endpoint, last-write-wins by `updatedAt`, tombstone-aware, scoped `WHERE user_id = ?`.
- Client engine `src/lib/sync.ts` + `src/store/syncStore.ts`; sign-in UI in Settings; sync pill in nav.
- **Verified locally** (push/pull/LWW/tombstone/isolation, 14/14) but **never run against a live backend** — see blockers.

### Phase 1.5 — Private MCP server — built, dormant
- `mcp/` self-contained package (`@modelcontextprotocol/sdk`, stdio). Thin client of `/api/sync` via a **personal access token** (`createAccessToken` + `getAuthedUserId` Bearer path; `POST /api/token`; "Generate access token" in Settings).
- Tools: `get_workout_history`, `get_stats`, `list_routines`, `log_session` (1.5) + `compare_periods`, `get_personal_records`, `get_routine_detail` (3b).
- Verified end-to-end via a real MCP stdio client (1.5: 5/5, 3b: 4/4). See `mcp/README.md`.

### Phase 2 — Android + Health Connect — **code complete (APK is user-run)**
- Capacitor 5 + `capacitor-health-connect` installed; `capacitor.config.json`; `src/lib/healthConnect.ts` (build-safe seam, called from `timerStore` on complete); `src/native-health.ts` (real writer, `ActiveCaloriesBurned` — the plugin has no `ExerciseSession`), gated by `VITE_NATIVE` so it never enters the web bundle. Both builds verified (web excludes plugin; native bundles it). Full `ANDROID.md`.

### Phase 3a — Insights — **shipped (live, works signed-out)**
`/insights` page: weekly activity, GitHub-style heatmap, weekday distribution, top routines, completion rate. `computeInsights()` in `src/lib/stats.ts`; hand-rolled SVG charts (no chart dep). Unit + render tests.

### Phase 3b — MCP coaching tools — shipped (dormant)
See Phase 1.5 — three new tools added to the MCP server.

### Phase 3c — Community routine library — **built, dormant**
Publish / browse / clone / report — content-only (not social). `public_routines` table; endpoints `POST /api/routines/publish` (auth, per-owner cap 25, snapshot, no PII), `GET /api/routines/public` (no auth, safe shape, blocked excluded), `POST /api/routines/report` (auth, auto-block at 3). `/community` page + `src/lib/community.ts`. Verified locally 12/12 (auth gating, no PII leak, report→block).

### Cross-cutting — shipped
- **Vitest** + 37 tests (sync merge/tombstones/migrations, dirty queue, stats/insights, export/import, render smokes).
- **JSON export/import** (Settings → Data): LWW merge, marks imported records dirty, skips stale.
- Review fixes this session: ESM `.js` import crash, concurrent-edit dirty drop, stale sync cursor, `decodeToken` fail-closed, OAuth open-redirect.

---

## 2. What we need to do (technical)

| # | Item | Notes | Depends on |
|---|------|-------|------------|
| T1 | Turn Phase 1 sync **live** + real-device verification | Set env vars, redeploy, sign in on two browsers, confirm routine/session propagation + delete/clear tombstones. The main untested path. | **You** (B1) |
| T2 | Build + sideload the Android APK | `VITE_NATIVE=true npm run build` → `cap add android` → manifest perm → Android Studio build → sideload (`ANDROID.md`). | **You** (B2) |
| T3 | `/api` request-harness tests | The sync + routines endpoints have only local manual e2e, no committed automated coverage. Add before more endpoints. | — |
| T4 | 3c hardening before going wide | Scoped + **revocable** access tokens (today: full-account, 1-yr, only `SESSION_SECRET` rotation revokes); real per-IP/user **rate limiting**; **report dedup** (one report per user); server-side validation that published `exerciseIds` exist in the catalog. | T1 |
| T5 | Clone robustness | A cloned community routine with unknown exercise ids should degrade gracefully in the Player (skip/skip-with-notice), not error. | — |
| T6 | Settings polish for MCP | The "Generate access token" flow exists; consider copy-button + token list/revoke once revocation lands (T4). | T1 |
| T7 | Phase 4 (deferred) | Full social: following/friends, leaderboards, public profiles. Big data-model + moderation jump; only if the network direction is wanted. | T1 + T4 |

---

## 3. Blockers — on you (the owner)

| # | Blocker | Why only you | Unlocks |
|---|---------|--------------|---------|
| **B1** | **Provision cloud sync** — create a Turso DB, register a GitHub (and/or Google) OAuth app, set the env vars in Vercel (`SETUP_SYNC.md`). | Requires your accounts + secrets; I can wire the Vercel env vars once you share the values. | Phase 1 sync, MCP-with-your-real-data, 3b tools returning real data, 3c community — **all of it goes live**. |
| **B2** | **Android build** — install Android Studio + JDK 17, plug in a phone with Health Connect, build the APK and sideload (`ANDROID.md`). | Needs the Android SDK/Gradle + a physical device; cannot run from this environment/CI. | The Health Connect mirror of workouts. |
| **B3** | **Decisions** — (a) Phase 4 social: go / no-go? (b) Monetization: still "no subscriptions, no upsell"? (c) Insights/charts: keep hand-rolled SVG or adopt a charting lib? | Product calls. | Direction for the next phases. |

> The single highest-leverage action is **B1**. It's the one gate in front of four already-built, already-tested features.

---

## 4. Key architecture notes / invariants (don't break)

- **Single-user by construction.** Every cloud table is scoped by `user_id`; sync is LWW by `updatedAt`. Correct for one person on many devices; wrong for shared/co-edited rows. Sharing (3c, Phase 4) must be **copy-on-clone** with **new endpoints** — never widen `/api/sync` to serve other users.
- **Dormant pattern.** No env vars → API fails closed (clean 401 / `{user:null}` / "unavailable"), signed-out app byte-identical to MVP. Never commit `.env`.
- **`/api` ESM imports need `.js`** (`type: module` + Vercel ESM runtime) — extensionless relative imports compile but crash at runtime.
- **PAT limitation (known):** full-account, 1-year, stateless-signed, **no revocation list** — only rotating `SESSION_SECRET` invalidates (nukes all). Fine for a private MCP; must become scoped + revocable before public/social (T4).
- **LWW cursor skew (known):** the pull cursor is server wall-clock but records carry client `updatedAt`; a device whose clock lags the server can be missed on incremental pulls. Acceptable for one user's own devices.
- **Verify everything** with `tsc -b` + `lint` + `test` + `build` (and `mcp` typecheck); cloud changes get a local `vercel dev` + file-DB e2e before deploy.

---

## 5. File map (where things live)

- `src/lib/storage.ts` — localStorage seam: CRUD, migrations, tombstones, dirty queue, `applyRemote*` LWW merge, export/import.
- `src/lib/sync.ts` / `src/store/syncStore.ts` — client sync engine + auth/sync state.
- `src/lib/stats.ts` — `computeStats` + `computeInsights`. `src/pages/Insights.tsx` — SVG charts.
- `src/lib/community.ts` / `src/pages/Community.tsx` — Phase 3c client.
- `src/lib/healthConnect.ts` + `src/native-health.ts` — Phase 2 seam + native writer. `capacitor.config.json`, `ANDROID.md`.
- `api/_lib/{auth,db}.ts` — OAuth/sessions/PAT + Turso client/schema. `api/{sync,me,token}.ts`, `api/auth/*`, `api/routines/*`.
- `mcp/` — MCP server (`src/server.ts`, `README.md`).
- Docs: `ROADMAP.md` (phases), `HANDOFF.md` (session state), `SETUP_SYNC.md` (B1 checklist), `PHASE3.md` (on `phase-3-draft` branch), this file.
