# FitFlow 7 — Backlog / Next Steps

Forward-looking work list, written to be picked up **with zero prior context**. For current state read `STATUS.md` (esp. the "Session 6" block) and `HANDOFF.md` first.

## Orientation (read once)
- **Stack:** Vite + React 19 + TypeScript + Tailwind v4 (CSS-first `@theme` in `src/index.css`; tokens: `accent`, `surface`, `card`, `card-hover`, `edge`) + Zustand + react-router-dom v7. Backend = Vercel `/api` + Turso (libSQL). Private MCP server in `mcp/`.
- **Local-first:** `src/lib/storage.ts` is the single localStorage seam (CRUD + `dirty`/`deletedAt` tombstones + export/import). Pure logic in `src/lib/*` with Vitest in `test/`. Pages re-read storage via a `useSyncStore` `dataVersion` + `location.key` memo idiom.
- **Verify (must stay green):** `npx tsc -b && npm run lint && npm run test && npm run build` (+ `cd mcp && npm run typecheck`). **100 tests** today. CI (`.github/workflows/ci.yml`) now runs the whole pipeline on push/PR.
- **Lint gotchas:** the repo enforces `react-hooks/set-state-in-effect` (don't `setState` directly in an effect — derive, or key the component) and `react-hooks/exhaustive-deps` (the storage-read memos use an inline `// eslint-disable-next-line` on the dep array). `/api` ESM imports need explicit `.js`.
- **Invariants:** signed-out app is fully offline; cloud tables are `user_id`-scoped, sync is LWW by `updatedAt`; new body/weight/challenge data is **local-only by design** (see item B1). Don't widen `/api/sync` to serve other users.
- **Testing /api:** handlers are Vercel-style `(req, res)`; `test/api/handlers.test.ts` drives them with hand-rolled stubs against an in-memory libSQL DB (`TURSO_DATABASE_URL=:memory:`). Page render smokes (`test/pages.smoke.test.tsx`) use `react-dom/server` (no jsdom — node env only).

**Recently shipped (don't redo — see `git log`):** 71 exercises + 6 routines, Stats/BMI page, Calendar, Challenges + auto-completion, mobile-first Dashboard, responsive bottom-nav, exercise detail modal, icon set, color pass, touch-target sweep, review correctness bugs.

**Shipped this session (don't redo — see `git log`):**
- **P1-1** per-exercise concise cues (`Exercise.cue`, ~71 authored, outline + modal).
- **P1-2** first-run / empty states (Dashboard weight CTA + welcome nudge; Stats setup prompt).
- **P1-3** goal-weight progress + 7/30-day trend deltas (`body.ts` helpers + Stats summary).
- **B2** `/api` request-harness tests + GitHub Actions CI.
- **B3** Player empty-routine guard (store refuses an empty list; Player shows a guard screen).
- **B4** render-smoke tests for Dashboard/Stats/Calendar/Challenges.
- **C2** route code-splitting (initial JS ~120 KB → ~104 KB gzip).
- **C4** dropped unused `BodyProfile.sex`/`birthDate`.
- **C5** RoutineEditor mobile add-panel + stable per-row keys.
- **C6** review P2 cleanups (Player title/wake-lock, settings LWW `updatedAt`, import body-profile message, Insights stray class).

---

## P2 — durability & correctness

### B1 · Cloud sync for body profile + weight log + challenge progress
**Why:** these are **local-only** today (deliberately). Once a user signs in, weight history won't follow them across devices. **Effort:** L. **Depends on:** real sign-in verification (F1).
**Files:** `src/lib/storage.ts` (`getPendingSync` only drains routines+sessions — extend it + add `applyRemoteWeightLog/BodyProfile/ChallengeProgress` + `markSynced` clearers; LWW by `updatedAt`, keyed by `id`/singleton/`challengeId`), `src/lib/sync.ts` (POST body + apply), `api/sync.ts` + Turso schema (new tables/columns, `user_id`-scoped). Local e2e with `vercel dev` + a `file:` Turso DB before deploy. The storage seam already stamps `dirty`/tombstones for these (forward-looking groundwork) and export/import already round-trips them. **Now that `/api` has a request-harness (B2), extend `test/api/handlers.test.ts` to cover the new collections' LWW/scoping.**
**Acceptance:** add a weigh-in on device A → appears on device B on focus; delete propagates; single-user invariant preserved.

---

## P3 — polish & content

### C1 · Expand free exercise images (no paid APIs)
**Why:** ~58 of 71 exercises are still emoji; visuals are the biggest perceived-quality lever, now showcased in the modal. **Effort:** M.
**Sources (free only):** **free-exercise-db** (Unlicense / public-domain — no attribution, already used for 13) — prefer this; **wger** / **Everkinetic** illustrations are **CC-BY-SA-4.0** (require a Credits line + ShareAlike). **Do NOT** use MuscleWiki (proprietary) or paid ExerciseDB.
**Files:** `public/exercises/<slug>.jpg` (+ `-2.jpg`), the `IMAGE_SLUGS` set in `src/data/exercises.ts`; if any CC-BY-SA asset is used, add a Settings "Credits" section.
**Acceptance:** image coverage materially up; licensing honored; emoji remains the fallback.

### C3 · Light theme / theme toggle
**Why:** colors are centralized in `src/index.css` `@theme`, so a light palette is feasible; owner is actively tuning the look. **Effort:** M. **Note:** confirm the palette direction with the owner before building — this is a visual/product call, not pure cleanup.
**Files:** `src/index.css` (light token set under a `[data-theme="light"]` or `prefers-color-scheme`), a toggle in `src/pages/Settings.tsx` (persist via settings).
**Acceptance:** legible light + dark; toggle persists; no hard-coded slate colors break contrast.

---

## Security / sharing (gates any social features)

### S1 · Harden Community before non-owner use (carryover T4)
**Why:** access tokens are full-account/1-yr with no revocation; publish/report lack rate limiting + dedup. **Effort:** M. **Gate:** only build when sharing/social is actually wanted.
**Files:** `api/_lib/auth.ts` (scoped + revocable tokens), `api/routines/{publish,report}.ts` (rate limit, one-report-per-user, server-side `exerciseIds` validation).
**Acceptance:** tokens revocable + scoped; abuse paths bounded. Blocks Phase 4. (B2's `test/api/handlers.test.ts` already exercises publish/report — extend it alongside.)

### S2 · MCP token UX (carryover T6)
Copy button + token list/revoke in Settings once revocation lands (S1). **Effort:** S.

---

## Owner-only / ops (not code an agent can finish alone)

- **F1 · Real-device sign-in verification (T1):** sign in on two browsers, confirm routine/session propagation + delete tombstones; agent confirms in Turso. **Unblocks B1.**
- **F2 · Android APK (T2):** `VITE_NATIVE=true npm run build` → `npx cap add android` → manifest perm → Android Studio → sideload (`ANDROID.md`).
- **F3 · Deploy this work:** push `main` to GitHub + `vercel --prod --yes` (CLI authed; re-`vercel link --yes --project fitflow7` after a fresh clone). Owner-trigger only.

---

## Bigger bets (decision required — don't build without a go)
- **Phase 4 social** (follows, leaderboards, public profiles) — large data-model + moderation jump; gated behind S1.
- **Challenge variety / custom challenges** — let users pick a start date or build a challenge from their own routines. **Effort:** M–L.
- **Monetization** — currently "no subscriptions." Revisit only on a product decision.

---

### Suggested order for a fresh session
1. **F1** (owner) → then **B1** (cloud-sync body/weight/challenge, now testable via B2's harness).
2. **C1** (images) any time; **C3** (light theme) after an owner palette sign-off.
3. **S1** only if/when sharing is wanted, then **S2**.
