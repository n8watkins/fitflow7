# FitFlow 7 — Project Status

Living snapshot: what's done, what's left, and what's on the owner. Updated 2026-06-29.

- **Live:** https://fitflow7.vercel.app (public, deployed). Repo `main`; **pushed + redeployed 2026-06-29 (session 9)** — origin/main is current. Prod verified: home 200, GitHub login 302, `/api/me` 200 `{user:null}`. Working tree clean.
- **Cloud sync is now CONFIGURED + LIVE** — Turso DB + GitHub OAuth + `SESSION_SECRET` are set in Vercel and deployed. `…/api/auth/login?provider=github` returns 302 → GitHub. (Google OAuth intentionally **not** configured; its sign-in button is hidden.)
- **Verify pipeline:** `npx tsc -b` + `npm run lint` + `npm run test` (**154 tests**) + `npm run build` — all green. `/api` type-checked via `tsconfig.api.json`; `mcp/` has its own `npm run typecheck`. **CI** (`.github/workflows/ci.yml`) now runs the full pipeline on push/PR.
- **Design principle still holds:** the signed-out app is byte-identical to the local-only MVP; cloud features only activate when signed in. (The "dormant when unconfigured" behavior remains the fail-closed default.)

> **One thing unverified:** nobody has actually signed in yet — the Turso `users` table is still empty. The last open go-live step is the owner doing a real two-browser sign-in test (then I confirm the data landed server-side).

---

## 1. What's done

### MVP (V1) + Phase 0 — shipped
7-minute workout app: timer engine (drift-corrected, wake-lock), 24 exercises, Classic 7 + custom routines, history, stats/streaks, audio cues, PWA offline shell. localStorage via one seam (`storage.ts`). Phase 0 added schema versioning/migrations, tombstones, the dirty queue, `updatedAt`.

### Phase 1 — Accounts + cloud sync — **LIVE (configured)**
Turso (libSQL) + Vercel `/api` (auto-creating schema); hand-rolled GitHub/Google OAuth + HMAC session cookie; `api/sync.ts` bidirectional LWW + tombstones, user-scoped. Client engine `lib/sync.ts` + `syncStore.ts`; sign-in in Settings; sync pill in nav. Locally verified 14/14; **prod backend configured + deployed**, pending the owner's first real sign-in.

### Phase 1.5 + 3b — Private MCP server — **live**
`mcp/` stdio server, token-authed (`POST /api/token`, "Generate access token" in Settings). Tools: `get_workout_history`, `get_stats`, `list_routines`, `log_session`, `compare_periods`, `get_personal_records`, `get_routine_detail`. Verified e2e (5/5 + 4/4). Returns your real data once you've signed in + generated a token. See `mcp/README.md`.

### Phase 2 — Android + Health Connect — **code complete (APK is owner-run)**
Capacitor 5 + `capacitor-health-connect`; `healthConnect.ts` seam (called on workout complete) + `native-health.ts` (`ActiveCaloriesBurned`), gated by `VITE_NATIVE` so it never enters the web bundle. Both builds verified. Build/sideload steps in `ANDROID.md`.

### Phase 3a — Insights — **shipped (live, works signed-out)**
`/insights`: weekly activity, GitHub-style heatmap, weekday distribution, top routines, completion rate. `computeInsights()` + hand-rolled SVG charts (no chart dep).

### Phase 3c — Community routine library — **live (configured)**
`/community`: publish / browse / clone / report (content-only). `public_routines` table; `POST /api/routines/publish` (auth, per-owner cap 25, snapshot, no PII), `GET /api/routines/public` (no auth, safe shape, blocked excluded), `POST /api/routines/report` (auth, auto-block at 3). Verified locally 12/12.

### Newer features — shipped this session
- **Add-to-Calendar** — a "Schedule" popover on each Dashboard routine → downloadable `.ics` + "Add to Google Calendar" link (optional weekly repeat). Zero backend, works offline (`lib/calendar.ts`, `components/ScheduleWorkout.tsx`).
- **Real exercise visuals** — 13 of 24 exercises show **public-domain photos that animate** (start↔end frames from free-exercise-db); the other 11 keep their emoji. Emoji fallback on missing/broken image (`components/ExerciseVisual.tsx`, `public/exercises/`).
- **Data-driven sign-in** — Settings shows only *configured* providers (GitHub only now), so the dead "Sign in with Google" button is gone; add Google later and it returns automatically.

### Session 6 (2026-06-25) — Seven Minute Workout parity — shipped (local-only)
- **Body stats + BMI** (`/stats`, `src/pages/Stats.tsx` + `src/lib/body.ts`): weight log (one upsert per day), height + goal weight, BMI card with a colored WHO category scale + healthy-weight range, a standalone non-persisting **BMI calculator**, a weight-trend SVG chart, plus **last-7-day / last-30-day** windows and a streak panel (current / longest / total / last-3-days). Dual units (imperial default) via a Settings toggle; stored canonically in kg/cm.
- **Calendar** (`/calendar`, `src/pages/Calendar.tsx`): navigable month grid (tap a day → that day's sessions) + a last-12-months overview.
- **Challenges** (`/challenges`, `src/pages/Challenges.tsx` + `src/data/challenges.ts`): 30-Day Challenge + 7-Day Kickstart, 14-Day Abs, 21-Day Full Body, with per-day progress (mark/unmark/reset) and an "up next" CTA. Days can pass `?rounds=N` to the Player to scale intensity.
- **Exercises + routines**: 24 → **71 exercises** (authored instructions/muscles/icons; emoji fallback) covering the source app's Abs/Butt/Leg/Arm/Stretching sets; **5 new system routines** join Classic 7. Library gains a Stretching filter.
- **Navigation**: responsive — desktop top nav lists all destinations; mobile gets a fixed bottom tab bar (Workouts · Calendar · Stats · Challenges) + a "More" sheet.
- **Storage**: new local-first data (body profile, weight log, challenge progress) rides the existing `dirty`/tombstone seam + export/import. (Cloud sync for these landed later — see B1 in session 7.) `unitSystem` is a device-local preference. Tests 49 → **76**.

### Session 7 (2026-06-26) — backlog burn-down — shipped (local + tests + CI)
- **Front-door polish:** per-exercise concise cues (`Exercise.cue`, ~71 authored; outline + modal), first-run/empty states (Dashboard weight CTA + welcome nudge that vanishes after first action; Stats setup prompt), and goal-weight progress + 7/30-day trend deltas on Stats (`body.ts` helpers).
- **Durability:** Player **empty-routine guard** (the timer refuses an all-unknown routine instead of logging a junk 0-exercise session / auto-completing a challenge day); `/api` **request-harness tests** (auth gating, sync LWW + tombstones + user-scoping, community no-PII + block threshold) via an in-memory libSQL DB; **render smokes** for the Session-6 pages; first **CI** workflow.
- **Polish:** route **code-splitting** (initial JS ~120 KB → ~104 KB gzip); RoutineEditor mobile add-panel + stable per-row keys; dropped dead `BodyProfile.sex`/`birthDate`; assorted review cleanups (Player document-title/wake-lock, settings LWW `updatedAt`, import body-profile message).
- **Content + theming + sharing (later in session 7):** **29/71 real exercise images** (free-exercise-db, Unlicense; emoji fallback); **light theme** + System/Light/Dark toggle (`html[data-theme='light']` token remap, no-flash boot script); **community hardening (S1)** — revocable + scoped (`read`/`readwrite`) PATs via an `access_tokens` registry (`resolveAuth`), one-report-per-user dedup (block on 3 *distinct* reporters), publish rate-limit + exercise-id validation; **token management UX (S2)** — list/revoke/copy + scope choice in Settings.
- **Cloud sync for body stats (B1):** body profile + weight log + challenge progress now sync (Turso `weight_log`/`body_profile`/`challenge_progress`, user-scoped LWW + tombstones) on the same dirty-queue contract as routines/sessions; read-only tokens can't push them.
- **Deep-dive review + fixes (end of session 7):** a 5-agent review found and fixed — a **PAT-as-cookie auth bypass** (session tokens now `sid`-tagged; a PAT in the cookie no longer becomes a full readwrite session skipping revocation) + **fail-closed `resolveAuth`**; an **app-wide light-theme legibility pass** (a `light:` Tailwind variant adapts every dark tint — badges, session pills, BMI category, Player/Settings/Community/etc. — not just the Player phase tiles); **B1 multi-device convergence** (same-day weigh-in dedup; challenge-day **union** instead of clobber); 403 **pull-only** fallback; wake-lock + modal-focus-trap race fixes. Tests 77 → **123**. **Pushed to `main` + deployed to prod.**

### Session 9 (2026-06-29) — review verification + ship — **pushed + deployed**
Adversarially re-reviewed the session-8 diff (7-agent, 5 risk areas, double-verified findings): **zero functional/correctness/security bugs** — the S8 fixes are sound. One low test-coverage gap found and fixed: the `H1 + M3` block only tested the pure reducer, so the M3 invariant (a backgrounded workout that finishes saves `completed:true`) was unguarded; added a `visibilitychange`-driven integration test (mutation-verified). Wired **7 more exercise photos (29 → 36/71)** from free-exercise-db (Unlicense), each visually QA'd against the movement (rejected 4 keyword-plausible mismatches). Tests 154 → **155**. Pushed all 10 pending commits to `origin/main` and `vercel --prod` redeployed; acceptance verified.

### Session 8 (2026-06-29) — full-project review + fix-everything — **shipped (pushed in S9)**
A 29-agent multi-agent review (committed as `REVIEW.md`, commit `5abfe98`) inventoried the whole app and adversarially verified 22 findings; **all 20 distinct issues were then fixed** across 5 commits, tests 123 → **154**, CI-green. Two were genuinely high-severity:
- **H2 — sync watermark made server-authoritative (`0bd768d`):** the pull cursor was the server clock but pulls filtered on the *client*-supplied `updatedAt`, so a device with a slow clock could write a row that sorted before another device's saved cursor and be **silently lost forever**. Every synced table now carries a server-stamped `server_updated_at`; pulls + the returned cursor use it (client `updatedAt` kept only for LWW). Also clamps a runaway-future client timestamp so it can't freeze a row. **This resolves the "LWW cursor skew (known)" caveat that used to be in §4.**
- **H1 — timer drift catch-up (`4e96ea3`):** returning to a backgrounded workout only advanced ONE phase (it rebased on a fixed `now`); now a pure `advancePhase` reducer (shared by `tick()` + the visibility handler) fast-forwards through every elapsed phase, and a workout that finishes while backgrounded saves `completed:true`.
- **Mediums/lows:** settings-edit-during-sync no longer dropped (M1); challenge-day unmark survives cross-device merge via per-day `clearedDays` tombstones + a new server `cleared_days` column (M2); tombstone GC reaps synced+aged soft-deletes so localStorage can't grow unbounded (M4); `deleteRoutine` now bumps `updatedAt` so routine deletes actually propagate (bonus bug); publish range-validation + atomic caps (L2/L4); OAuth redirect prefers a trusted host (L3); cookie parsing fails closed on a malformed cookie (L5); optional `ALLOWED_EMAILS`/`ALLOWED_PROVIDER_IDS` registration allow-list (L6); `audio.ts` window-guard (L12); a `useLiveData` hook replacing the per-page storage-read memo idiom (L8); + new tests for the client sync engine (M5), OAuth callback (M6), `/api/me` (L11), and merge edge cases (L9). Full ledger + commit map in `REVIEW.md` §0.

### Cross-cutting — shipped
- **Vitest, 49 tests** (sync merge/tombstones/migrations, dirty queue, stats/insights, calendar, export/import, auth open-redirect, render smokes).
- **JSON export/import** (Settings → Data).
- **Code-review fixes:** ESM `.js` import crash, concurrent-edit dirty drop, stale sync cursor, `decodeToken` fail-closed, OAuth open-redirect, publish input caps, report block-filter, clone-time unknown-exercise filter, `randomUUID` import.

---

## 2. What we need to do (technical)

| # | Item | Status / notes | Owner |
|---|------|----------------|-------|
| T1 | Real-device sign-in verification | Sync is live but **0 users so far** — sign in on two browsers, confirm routine/session propagation + delete/clear tombstones; I'll confirm in Turso. | **You** |
| T2 | Build + sideload the Android APK | `VITE_NATIVE=true npm run build` → `cap add android` → manifest perm → Android Studio → sideload (`ANDROID.md`). | **You** |
| T3 | `/api` request-harness tests | ✅ **DONE** — `test/api/handlers.test.ts` (auth gating, sync LWW/tombstones/scoping, community no-PII + dedup) + CI. | me |
| T4 | Harden 3c before it's used by anyone but you | ✅ **DONE (S1)** — revocable + scoped (`read`/`readwrite`) tokens via the `access_tokens` registry; publish rate-limit; one-report-per-user dedup; server-side exercise-id validation. **Unblocks T7.** | me |
| T5 | Player empty-routine guard | ✅ **DONE** — store refuses an empty list; Player shows a guard screen instead of logging a junk session. | me |
| T6 | MCP token UX | ✅ **DONE (S2)** — copy button + token list/revoke/scope in Settings → Account. | me |
| T7 | Phase 4 (deferred) | Full social: follows, leaderboards, public profiles. **No longer gated** (T4 done); still a big data-model + moderation jump. Only if the network direction is wanted. | decision |
| — | (Optional) richer exercise images | 36/71 now have free 2-frame photos (S9 added 7 visually-QA'd free-exercise-db matches). Remaining 35 have no confident free-exercise-db bodyweight photo; fill with Everkinetic/wger (CC-BY-SA — Credits + ShareAlike, illustrations clash with photos) or pay for ExerciseDB GIFs. Current set may be enough. | decision |
| — | (Optional) Google login | Intentionally off; add a Google OAuth app + 2 env vars to re-enable the button. | decision |

---

## 3. On the owner (you)

| # | Item | State |
|---|------|-------|
| **B1** | Provision + turn on cloud sync | ✅ **DONE** — Turso + GitHub OAuth + secret set in Vercel, deployed. Only the **real sign-in verification (T1)** remains. |
| **B2** | Android APK build | Open — needs Android Studio + JDK 17 + a phone w/ Health Connect (`ANDROID.md`). |
| **B3** | Product decisions | Open — (a) Phase 4 social go/no-go; (b) monetization (still "no subscriptions"?); (c) pay for ExerciseDB GIFs or keep free photos; (d) charts: keep SVG or adopt a lib. |

---

## 4. Key invariants (don't break)

- **Single-user by construction.** Cloud tables scoped by `user_id`; sync is LWW by `updatedAt`. Sharing (3c, Phase 4) is **copy-on-clone** via **separate endpoints** — never widen `/api/sync` to serve other users.
- **Fail closed when unconfigured.** No env vars → clean 401 / `{user:null}` / "unavailable". Never commit `.env`.
- **`/api` ESM imports need `.js`** (`type: module` + Vercel ESM runtime).
- **PAT model (post-S1):** PATs carry a `jti` and are valid only while a non-revoked row exists in the `access_tokens` registry; `scope` is `read`|`readwrite`. Revoke from Settings → Account (or `DELETE /api/token`). `resolveAuth` (api/_lib/tokens.ts) is the single auth path for sync/publish/report.
- **Sync watermark is server-authoritative (S8/H2):** every synced table has a server-stamped `server_updated_at`; pulls filter and the cursor advances on *that*, never the client `updatedAt` (which is kept only for LWW tie-breaking). Added idempotently via CREATE + ALTER + backfill in `ensureSchema` (`api/_lib/db.ts`) — the deployed empty DB needs no manual migration. (Replaces the old "LWW cursor skew" caveat.) `challenge_progress` also gained a `cleared_days` column for per-day unmark tombstones (M2).
- **Optional single-tenant lock-down (S8/L6):** set `ALLOWED_EMAILS` and/or `ALLOWED_PROVIDER_IDS` (comma-separated) to restrict who can register; **unset = open registration (default)**, so leaving them blank never locks the owner out.
- **Verify** with `tsc -b` + `lint` + `test` + `build` (+ `mcp` typecheck); cloud changes get a local `vercel dev` + file-DB e2e before deploy.

---

## 5. File map

- `src/lib/storage.ts` — localStorage seam: CRUD, migrations, tombstones, dirty queue, `applyRemote*` LWW, export/import.
- `src/lib/sync.ts` / `src/store/syncStore.ts` — client sync + auth/sync state (incl. configured-providers list).
- `src/lib/stats.ts` (`computeStats`/`computeInsights`) · `src/pages/Insights.tsx`.
- `src/lib/calendar.ts` · `src/components/ScheduleWorkout.tsx` — Add-to-Calendar.
- `src/components/ExerciseVisual.tsx` · `public/exercises/` — animated exercise photos.
- `src/lib/community.ts` · `src/pages/Community.tsx` — Phase 3c client.
- `src/lib/healthConnect.ts` · `src/native-health.ts` · `capacitor.config.json` · `ANDROID.md` — Phase 2.
- `api/_lib/{auth,db}.ts` · `api/{sync,me,token}.ts` · `api/auth/*` · `api/routines/*`.
- `src/hooks/useLiveData.ts` — shared "read storage, recompute on nav + sync" hook (S8/L8); used by the data-display pages.
- `mcp/` — MCP server (`src/server.ts`, `README.md`).
- Docs: `HANDOFF.md` (current zero-context handoff — read first), `REVIEW.md` (full-project review + fix-resolution table), `ROADMAP.md` (phases + exploratory ideas), `SETUP_SYNC.md` / `UNBLOCK.md` (sync setup — now done), `PHASE3.md` (on the `phase-3-draft` branch).
