# FitFlow 7 — Backlog / Next Steps

Forward-looking work list, written to be picked up **with zero prior context**. For current state read `STATUS.md` (esp. the "Session 6" block) and `HANDOFF.md` first.

## Orientation (read once)
- **Stack:** Vite + React 19 + TypeScript + Tailwind v4 (CSS-first `@theme` in `src/index.css`; tokens: `accent`, `surface`, `card`, `card-hover`, `edge`) + Zustand + react-router-dom v7. Backend = Vercel `/api` + Turso (libSQL). Private MCP server in `mcp/`.
- **Local-first:** `src/lib/storage.ts` is the single localStorage seam (CRUD + `dirty`/`deletedAt` tombstones + export/import). Pure logic in `src/lib/*` with Vitest in `test/`. Pages re-read storage via a `useSyncStore` `dataVersion` + `location.key` memo idiom.
- **Verify (must stay green):** `npx tsc -b && npm run lint && npm run test && npm run build` (+ `cd mcp && npm run typecheck`). **77 tests** today.
- **Lint gotchas:** the repo enforces `react-hooks/set-state-in-effect` (don't `setState` directly in an effect — derive, or key the component) and `react-hooks/exhaustive-deps` (the storage-read memos use an inline `// eslint-disable-next-line` on the dep array). `/api` ESM imports need explicit `.js`.
- **Invariants:** signed-out app is fully offline; cloud tables are `user_id`-scoped, sync is LWW by `updatedAt`; new body/weight/challenge data is **local-only by design** (see item B1). Don't widen `/api/sync` to serve other users.

**Recently shipped (don't redo — see `git log`):** 71 exercises + 6 routines, Stats/BMI page, Calendar, Challenges + auto-completion, mobile-first Dashboard, responsive bottom-nav, exercise detail modal (hover-only animation, focus-trap, reduced-motion), icon set, color pass, mobile touch-target sweep, and the review's correctness bugs (weight-row dedupe, system-routine copy, `?rounds` clamp, case-insensitive search).

---

## P1 — do next (highest value for a mobile user)

### P1-1 · Per-exercise concise cues
**Why:** the Dashboard outline + modal currently show `instructions[0]`, which is sometimes a full sentence. A dedicated one-liner reads better and is the Seven-Minute-Workout feel. **Effort:** M.
**Files:** `src/types.ts` (add optional `cue?: string` to `Exercise`), `src/data/exercises.ts` (author ~71 short cues), `src/pages/Dashboard.tsx` (`OutlineRow` uses `cue ?? instructions[0]`), `src/components/ExerciseModal.tsx`.
**Acceptance:** every exercise has a ≤8-word cue; outline rows show it; falls back to `instructions[0]` if absent.

### P1-2 · First-run / empty states + onboarding nudge
**Why:** a brand-new user lands on a statless home (no weight, no streak, no challenge). **Effort:** S.
**Files:** `src/pages/Dashboard.tsx` (empty chips → "Add your first weigh-in" linking `/stats`; no-challenge already has a banner), `src/pages/Stats.tsx` (prompt to set height+units), maybe a one-time dismissible card.
**Acceptance:** with empty storage the home page guides the user to a first action; nothing renders as a bare "—" without a CTA.

### P1-3 · Goal-weight progress + trend delta
**Why:** turns the weight log into motivation; cheap now that weight is on the home page. **Effort:** S.
**Files:** `src/lib/body.ts` (helper for "X to goal" + 7/30-day delta), `src/pages/Stats.tsx` (progress toward `goalWeightKg`), optional Dashboard chip.
**Acceptance:** Stats shows distance to goal and a 30-day weight change when ≥2 weigh-ins exist; unit-correct.

---

## P2 — durability & correctness (do before/with backend growth)

### B1 · Cloud sync for body profile + weight log + challenge progress
**Why:** these are **local-only** today (deliberately). Once a user signs in, weight history won't follow them across devices. **Effort:** L. **Depends on:** real sign-in verification (F1).
**Files:** `src/lib/storage.ts` (`getPendingSync` only drains routines+sessions — extend it + add `applyRemoteWeightLog/BodyProfile/ChallengeProgress` + `markSynced` clearers; LWW by `updatedAt`, keyed by `id`/singleton/`challengeId`), `src/lib/sync.ts` (POST body + apply), `api/sync.ts` + Turso schema (new tables/columns, `user_id`-scoped). Local e2e with `vercel dev` + a `file:` Turso DB before deploy. The storage seam already stamps `dirty`/tombstones for these (forward-looking groundwork) and export/import already round-trips them.
**Acceptance:** add a weigh-in on device A → appears on device B on focus; delete propagates; single-user invariant preserved.

### B2 · `/api` request-harness tests + CI
**Why:** **zero `/api` tests and no CI** (`.github/workflows` absent) — every push is verified by hand. Risk grows as sync expands (B1). **Effort:** M.
**Files:** new `test/api/*` (auth gating, LWW, tombstones, no-PII on `routines/public`), `.github/workflows/ci.yml` running `tsc -b` + lint + test + build (+ mcp typecheck).
**Acceptance:** CI green on PRs; api endpoints covered for auth + merge semantics.

### B3 · Player empty-routine guard (carryover T5)
**Why:** an all-unknown-exercise routine (cloned/imported) can record a 0-exercise "completed" session — which now also auto-completes a challenge day. **Effort:** S.
**Files:** `src/store/timerStore.ts` / `src/pages/Player.tsx` — refuse to start / don't save a session when the resolved exercise list is empty.
**Acceptance:** starting an empty routine shows a guard instead of logging a junk session.

### B4 · Render-smoke tests for new pages
**Why:** Stats/Calendar/Challenges/Dashboard have **no component tests** (only pure-logic libs are covered). **Effort:** S.
**Files:** `test/*.test.tsx` with jsdom render smokes (mount with empty + seeded storage; assert no throw + key text).
**Acceptance:** each new page has a render smoke; suite stays green.

---

## P3 — polish & content

### C1 · Expand free exercise images (no paid APIs)
**Why:** ~58 of 71 exercises are still emoji; visuals are the biggest perceived-quality lever, now showcased in the modal. **Effort:** M.
**Sources (free only):** **free-exercise-db** (Unlicense / public-domain — no attribution, already used for 13) — prefer this; **wger** / **Everkinetic** illustrations are **CC-BY-SA-4.0** (require a Credits line + ShareAlike). **Do NOT** use MuscleWiki (proprietary) or paid ExerciseDB.
**Files:** `public/exercises/<slug>.jpg` (+ `-2.jpg`), the `IMAGE_SLUGS` set in `src/data/exercises.ts`; if any CC-BY-SA asset is used, add a Settings "Credits" section.
**Acceptance:** image coverage materially up; licensing honored; emoji remains the fallback.

### C2 · Route code-splitting
**Why:** JS bundle is ~117 KB gzip and climbing; lazy-loading heavy routes improves first mobile paint. **Effort:** S–M.
**Files:** `src/App.tsx` — `React.lazy` + `Suspense` for `Player`, `Library`, `Insights`, `Community` (keep Dashboard eager).
**Acceptance:** initial chunk shrinks; routes still work; no layout flash.

### C3 · Light theme / theme toggle
**Why:** colors are centralized in `src/index.css` `@theme`, so a light palette is feasible; owner is actively tuning the look. **Effort:** M.
**Files:** `src/index.css` (light token set under a `[data-theme="light"]` or `prefers-color-scheme`), a toggle in `src/pages/Settings.tsx` (persist via settings).
**Acceptance:** legible light + dark; toggle persists; no hard-coded slate colors break contrast.

### C4 · Use-or-remove `sex` / `birthDate`
**Why:** `BodyProfile.sex`/`birthDate` are stored (Stats has no UI for them) but unused. Either wire into calorie/age estimates or drop to avoid dead state. **Effort:** S.
**Files:** `src/types.ts`, `src/lib/storage.ts`, `src/pages/Stats.tsx`.

### C5 · RoutineEditor mobile flow
**Why:** below `lg`, the "Add exercise" picker renders *below* the whole exercise list — poor on phones. **Effort:** S.
**Files:** `src/pages/RoutineEditor.tsx` — reorder so the picker is reachable above the list on mobile (e.g. a collapsible/sticky add panel).

### C6 · Review P2 cleanups
Small, low-risk leftovers from the code review. **Effort:** S total.
- `src/pages/Player.tsx`: the document-title `complete` branch is unreachable (reorder to check `complete` first); Wake-Lock effect re-acquires on every `phase` change (split into mount-acquire + complete-release).
- `src/lib/storage.ts`: empty-string `updatedAt` LWW hazards in `getPendingSettings`/import (treat empty as oldest; stamp real `updatedAt` at write).
- `src/pages/Settings.tsx`: `ImportResult.bodyProfile` is computed but never surfaced after a restore.
- `src/pages/Insights.tsx`: stray `fill-accent` class on a non-SVG `<span>` (relies on inline style — harmless, remove for clarity).
- `src/pages/RoutineEditor.tsx`: list key `${id}-${idx}` changes on reorder — move to stable per-row uids if row-local state is ever added.

---

## Security / sharing (gates any social features)

### S1 · Harden Community before non-owner use (carryover T4)
**Why:** access tokens are full-account/1-yr with no revocation; publish/report lack rate limiting + dedup. **Effort:** M.
**Files:** `api/_lib/auth.ts` (scoped + revocable tokens), `api/routines/{publish,report}.ts` (rate limit, one-report-per-user, server-side `exerciseIds` validation).
**Acceptance:** tokens revocable + scoped; abuse paths bounded. Blocks Phase 4.

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
- **Challenge variety / custom challenges** — let users pick a start date or build a challenge from their own routines. **Effort:** M–L; do after auto-completion (done) settles.
- **Monetization** — currently "no subscriptions." Revisit only on a product decision.

---

### Suggested order for a fresh session
1. P1-1 → P1-2 → P1-3 (front-door polish).
2. B2 (CI) before B1 (so the backend grows under test); then B1.
3. C1 (images) any time; C2/C3 when bandwidth allows.
4. S1 only if/when sharing is wanted.
