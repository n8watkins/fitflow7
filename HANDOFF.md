# FitFlow 7 — Handoff (2026-06-20, session 5)

Zero-context handoff. **Read these first, in order, and don't re-ask anything they answer:**
1. `STATUS.md` — the living, detailed status (done / TODO / blockers / invariants / file map).
2. `ROADMAP.md` — phases + exploratory ideas (Android publishing, calendar, Google integrations, exercise images).
3. This file — orientation, this session's changes, and the ordered next steps.

## Project summary
FitFlow 7 is a desktop-first, mobile-responsive **7-minute workout web app**. Local-first: `localStorage` is the source of truth through one seam (`src/lib/storage.ts`); the signed-out app works fully offline. Optional cloud sync + accounts layer on top.

- **Stack:** Vite + React 19 + TypeScript + Tailwind v4 + Zustand + react-router-dom v7. Backend = Vercel serverless funcs in `/api` + Turso (libSQL). Private MCP server in `mcp/`.
- **Deployed:** https://fitflow7.vercel.app (public). Deploy: `vercel --prod --yes` (CLI authed; project linked as `natkins23s-projects/fitflow7`). Repo: https://github.com/n8watkins/fitflow7, branch `main`.
- **Verify (must stay green):** `npx tsc -b && npm run lint && npm run test && npm run build` (+ `cd mcp && npm run typecheck`). 49 tests.

## State (this session)
**Cloud sync is now LIVE/configured** (Turso + GitHub OAuth + `SESSION_SECRET` set in Vercel, deployed; GitHub sign-in returns 302). Everything below is committed + pushed on `main` (`git log` for full list; key commits):

- Phase 1.5 MCP server + PAT auth (`0a898be`, `d39405e`); Phase 2 Android/Health Connect code-complete (`40ba13b`, `327c107`).
- Phase 3a Insights (`81b7357`), 3b MCP coaching tools (`9dc8d7b`), 3c Community library (`a5c19b9`, `cbabfff`).
- Add-to-Calendar (`c8b973f`); data-driven sign-in / hide dead Google button (`21b4ae8`); animated exercise photos (`5a74395`, `ce329c8`).
- Code-review hardening (`2167085`, `3b0696a`, `b9387f1`); Vitest + tests (`288721d`); export/import (`668226f`); docs refresh (`0814f09`).

**Verified:** all phases verified locally (sync 14/14, MCP 5/5 + 4/4, community 12/12) and the production OAuth redirect is correct. **In flight / unverified:** nobody has signed in on prod yet — the Turso `users` table is empty, so the live cross-device loop is unproven end-to-end.

## Next steps (ordered)
1. **Real-device sign-in verification** *(owner action + agent confirm)* — owner signs in at the live site on two browsers (same GitHub account), creates a routine in A, confirms it appears in B on focus, deletes it and confirms it disappears. Agent confirms server-side by querying Turso. **Acceptance:** `users` ≥ 1 and the routine row appears/tombstones in Turso. *Note: Turso creds live only in Vercel — `vercel env pull .env.local` to get them locally for a node check; never commit that file.*
2. **Android APK** *(owner machine)* — `ANDROID.md`: `VITE_NATIVE=true npm run build` → `npx cap add android` → manifest perm → Android Studio build → sideload. Can't run from CI.
3. **`/api` request-harness tests** — endpoints (`api/sync.ts`, `api/routines/*`) have only manual e2e. Add automated coverage. **Acceptance:** tests cover auth gating + LWW + no-PII on `routines/public`.
4. **Harden Community (3c) before anyone but the owner uses it** — scoped + revocable access tokens (today: full-account/1-yr, `api/_lib/auth.ts`), rate limiting, report-dedup (one per user), server-side `exerciseIds` validation in `api/routines/publish.ts`.
5. **Player empty-routine guard** — `src/store/timerStore.ts` / `Player.tsx`: refuse an all-unknown-exercise routine instead of recording a 0-exercise "completed" session (clone already filters unknown ids in `Community.tsx`).
- **Open decisions (B3 in STATUS.md):** Phase 4 social go/no-go; monetization; pay for ExerciseDB GIFs vs keep free photos; charts lib. Don't build these without a decision.

## Conventions & gotchas (hard-won)
- **`/api` ESM imports need `.js`** — `package.json` is `type: module`, Vercel runs funcs as ESM; extensionless relative imports compile but crash at runtime (`ERR_MODULE_NOT_FOUND`). Always `from './_lib/db.js'`.
- **After a fresh clone, re-link Vercel** before `vercel env`/deploy: `vercel link --yes --project fitflow7` (the `.vercel/` link is gitignored, so a clone loses it).
- **Env vars are set in Vercel (Production), not in the repo.** 5 keys: `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `SESSION_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`. Never commit `.env*`. Google OAuth deliberately unset (its button is hidden via the configured-providers list).
- **Cloud changes get a local e2e** (`vercel dev` + a `file:` Turso DB + a self-minted PAT) before deploy — pattern used all session.
- **Single-user invariant:** every cloud table scoped by `user_id`; sync is LWW by `updatedAt`. Sharing = copy-on-clone via separate endpoints; never widen `/api/sync`.
- **Exercise images:** 13 of 24 have bundled public-domain photos in `public/exercises/<slug>.jpg` (+ `-2.jpg` end frame) that animate; emoji is the fallback. Mapping is the `IMAGE_SLUGS` set in `src/data/exercises.ts`.
- **`PHASE3.md`** lives on the `phase-3-draft` branch (not `main`).

## File map (beyond what STATUS.md §5 lists)
- `api/_lib/auth.ts` — OAuth + sessions + PAT + `getConfiguredProviders` + `sanitizeReturnTo`.
- `api/me.ts` — returns `{ user, providers }` (drives the sign-in UI).
- `src/components/ExerciseVisual.tsx` — image-with-emoji-fallback + 2-frame animation.
- `src/components/ScheduleWorkout.tsx` + `src/lib/calendar.ts` — Add-to-Calendar.
- `UNBLOCK.md` / `SETUP_SYNC.md` — sync setup (done; reference for adding Google / rotating secrets).
