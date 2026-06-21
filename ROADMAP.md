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

## Phase 1 — Accounts + Cloud Sync ✅ LIVE (configured 2026-06-20)

> Turso + GitHub OAuth + SESSION_SECRET are set in Vercel and deployed; GitHub
> sign-in is active. Pending only the owner's first real two-browser verification.
> (Original "dormant" build notes below.)

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

## Phase 1.5 — Private MCP layer ✅ BUILT (dormant until Phase 1 is configured)

- Lives in `mcp/` (self-contained package). Stdio MCP server
  (`@modelcontextprotocol/sdk`) with tools `get_workout_history`, `get_stats`,
  `list_routines`, `log_session`. (`start_routine` dropped — a data server can't
  press play on a device.)
- Auth-scoped to the user via a **personal access token**: `createAccessToken`
  in `api/_lib/auth.ts`, issued by `POST /api/token` (generated in Settings),
  accepted by `getAuthedUserId` on `/api/sync` as `Authorization: Bearer`.
- Verified end-to-end locally (real MCP stdio client + `vercel dev` + file DB +
  minted PAT): all four tools, read + write round-trip. Lights up for real data
  once Phase 1 sync is configured. See `mcp/README.md`.

## Phase 2 — Android + Health Connect 🟢 CODE COMPLETE (APK build is user-run)

Decision (user): Capacitor native shell + **Health Connect write**, sideloaded —
no Play Store. The PWA is also already installable as-is.

- **In the repo, verified:** Capacitor 5 + `capacitor-health-connect` deps
  installed; `capacitor.config.json`; `src/lib/healthConnect.ts` seam called from
  `timerStore` on complete; `src/native-health.ts` (real writer) gated by
  `VITE_NATIVE` in `main.tsx`. Both builds verified — web bundle excludes the
  plugin (byte-identical), `VITE_NATIVE=true` build bundles it cleanly.
- **Record type:** plugin v0.7 has no `ExerciseSession`, so workouts are written
  as `ActiveCaloriesBurned` (duration-based kcal estimate; tune in
  `native-health.ts`).
- **Remaining (needs Android Studio + a phone, can't run from CI):**
  `VITE_NATIVE=true npm run build` → `npx cap add android` → manifest permission
  → build APK → sideload. All steps in `ANDROID.md`.
- Future: read other apps' data back; better calorie model.

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

---

## Exploratory / future ideas (not committed)

The three sections below are surveys/outlines for later decisions — **not planned
work**. Each is honest about cost and dependencies.

## Android as a published app (paths + what Google requires)

Status: sideload is **code-complete** (Phase 2 + `ANDROID.md`); publishing to a
store is **not started**.

"Android app" is a ladder, and "a Google project" is actually two separate things
people conflate: a **Play Console developer account** (needed to *publish*) vs. a
**Google Cloud project** (needed only if you call *Google APIs*). They're independent.

| Path | What you get | Google requirement | Effort |
|---|---|---|---|
| **Sideload APK** | Install the built app directly | **None** — no account, no Cloud project, no store | Done (`ANDROID.md`); you run the build |
| **TWA → Play Store** | The PWA wrapped + listed in the Play Store | **Play Developer account ($25 one-time)** + `assetlinks.json` + a signing key | Low–med (but **no Health Connect** — a TWA can't write it) |
| **Capacitor native → Play Store** | Native shell (Health Connect etc.) + listed | Play Developer account ($25) **+ a Health Connect data-use declaration/review** | Med–high (the native build is already code-complete) |

To publish (either store path), beyond the build you'd need: **Play App Signing**,
an **AAB** build, a store listing (icon, screenshots, description), a **privacy
policy URL**, the **Data safety** form, a content-rating questionnaire, and
target-API-level compliance. If the app writes **Health Connect** data, Google
requires a declared health-data use-case and reviews it.

None of this needs a Google **Cloud** project — that's only for Google **APIs**
(Calendar, Google login, Maps). So: **sideload = zero Google; Play Store = the $25
developer account; Google-API features = a Cloud project** (separate, see below).

Recommendation: keep **sideloading** for now (done). To go to the Play Store,
**TWA is the fast path** unless you specifically need Health Connect — in which
case use the Capacitor build (already code-complete) and budget for the
health-data review.

## Schedule a Workout / Add to Calendar — standards-based, zero-backend

**Status: not started. Proposed. Effort: S (.ics + Google link) / M (with recurring + scheduling UI).**

A lightweight way to turn a routine into a real calendar entry, so the workout shows up where the user already looks for their day. The genuine value is adherence: a 7-minute workout fails on *remembering*, not on *doing*. A calendar event (with a native reminder) is the cheapest habit nudge we can ship, and it rides on infrastructure the user already trusts.

Crucially this is **client-only and standards-based** — it fits the "no new dependencies," local-first ethos exactly. No phase dependency: this works on the signed-out app today, with or without Phase 1 sync configured.

### What it is

Two interchangeable, well-supported mechanisms — give the user both and let the platform decide:

1. **Downloadable `.ics` file** (`VEVENT`) for a chosen routine at a chosen date/time. Opens natively in Apple Calendar, Outlook, and Google Calendar (import). Add an `RRULE` for a recurring weekly habit (e.g. "Mon/Wed/Fri 7:00am").
2. **"Add to Google Calendar" template link** — `https://calendar.google.com/calendar/render?action=TEMPLATE&text=...&dates=...&details=...&recur=...`. One click, prefilled event, user just hits save. Best for the Google-Calendar majority.

### UX

- A **"Schedule" button** on each routine card (Dashboard) and/or the routine detail page.
- Tapping opens a small inline form: **date + time**, estimated duration auto-filled from the routine (`(workSeconds + restSeconds) * rounds`, rounded up to whole minutes, min 7), optional **"repeat weekly"** toggle with day-of-week picker.
- Two actions: **Download .ics** (triggers a Blob download) and **Add to Google Calendar** (opens the render URL in a new tab). No persisted state required — pure derive-and-emit.

### Technical approach

- New **pure module `src/lib/calendar.ts`**, no React, no deps, fully unit-testable (matches the `lib/` convention alongside `storage.ts`): `buildIcs(routine, opts)`, `buildGoogleCalendarUrl(routine, opts)`, plus helpers `escapeIcsText`, `formatIcsDate` (UTC `YYYYMMDDTHHMMSSZ`), `foldLine` (75-octet folding).
- A tiny UI helper to turn the `.ics` string into a download (`Blob` + object URL + synthetic `<a>` click). The form is a normal component using existing routine data from `storage.ts`; nothing new in the storage seam.
- Vitest coverage for `calendar.ts` (deterministic with a fixed clock) — same pattern as the existing pure-logic tests.

### What it explicitly does NOT need

- No OAuth, no consent screen, no Google Cloud project, no API keys.
- No server, no new `/api` route, no Turso, no Phase 1 sync.
- No new npm dependencies. Works fully offline (the `.ics` download does).

### Edge cases (the honest list)

- **Timezones.** Cleanest is UTC (`...Z`); "floating"/local time keeps 7am at 7am across travel and is arguably better for a habit. Pick one deliberately; a full `VTIMEZONE` block is overkill. The Google link's `dates=` must be UTC.
- **Text escaping.** In `.ics`, escape `,` `;` `\` and newlines (`\n`) in `SUMMARY`/`DESCRIPTION`; for the Google URL, `encodeURIComponent`. Routine names are user input — escape both.
- **`UID` + `DTSTAMP`.** Every `VEVENT` needs a unique `UID` (`crypto.randomUUID()` + `@fitflow7`) and a `DTSTAMP`; without them some clients reject/dedupe the import.
- **Recurrence.** `RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR`; Google link uses a separate `recur=RRULE:...`. Weekly-only to start.
- **Line folding + CRLF.** RFC 5545 wants `\r\n` and 75-octet folding; Outlook is strictest.

### Heavier optional escalation (probably not worth it) — full Google Calendar API

Two-way managed events (reschedule in-app → reflect in Google) is a categorically heavier build: a **sensitive OAuth scope** (`calendar.events`) → Google verification; **server-side token storage + refresh** → only makes sense **after Phase 1 is live**; plus an SDK, quota, and revocation handling. For a personal app the `.ics` + template-link approach delivers ~95% of the value at ~5% of the cost. Treat the full API as "someday, only if multiple real users ask for two-way sync," gated behind Phase 1.

## Potential Google Integrations (menu — not committed)

A survey of Google integrations people ask for in fitness apps, scored honestly. Read this as a *menu*, not a plan. Two realities dominate the math:

1. **Most of these need a Google Cloud project + OAuth consent screen, and the useful scopes are "sensitive" or "restricted"** — which triggers Google's app-verification review (privacy policy, homepage, demo video; restricted scopes add a security assessment that can cost real money). For a one-person side project, **verification is the actual cost, not the code.**
2. **Anything that reads/writes Google user data continuously needs server-side refresh-token storage** — i.e. it depends on **Phase 1 cloud sync being live (B1)**. Our login flow currently stores only a session cookie; it does not persist Google refresh tokens or call Google APIs after callback.

The exception that proves the rule is sign-in, which needs neither.

| Integration | Needs verification? | Depends on Phase 1 live? | Effort | Value |
|---|---|---|---|---|
| Sign in with Google | No (basic scopes) | No | ~0 (env vars) | **High** |
| "Add to Calendar" (.ics, no Google API) | No | No | Low | **High** |
| Google Calendar API (two-way) | Yes (sensitive) | Yes | High | Medium |
| Google Drive (appDataFolder backup) | No (`drive.appdata` not sensitive) | Maybe | Medium | Medium |
| Google Sheets export | Yes (sensitive) | Yes | Medium | Founder-toy |
| Google Fit (web/REST) | Yes (restricted) | Yes | High | **Skip — dead end** |
| Google Tasks | Yes (sensitive) | Yes | Medium | Founder-toy |

**Sign in with Google — High, already done.** A second login provider beside GitHub (most non-developers lack GitHub). The path is **already coded** in `api/_lib/auth.ts` — needs only `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` + a Google OAuth client. Basic scopes (`openid email profile`) → **no verification review**. Ship it as part of B1; it's the only Google item with no API-verification tax.

**Workout scheduling — pick the cheap one.** (a) **".ics / Add to Calendar"** (the section above) — no API, no OAuth, no Cloud project, no verification, works with Google/Apple/Outlook; **this is the one to do** (don't build it twice). (b) **Google Calendar API two-way** — sensitive scope → verification, server-side refresh tokens → Phase 1 live; **skip** unless users ask for true two-way sync.

**Google Fit — dead end, skip.** Google is **deprecating the Fit REST/Android APIs** in favor of **Health Connect**, which the app already targets on Android (Phase 2). Fit scopes are **restricted** (most expensive tier). There is no web Google Fit work worth doing — cross it off permanently.

**Google Drive backup — Medium, the most defensible "data" integration.** Back up/restore the **existing versioned JSON export** (`exportData`/`importData`) to the user's own Drive via the **`drive.appdata`** scope (hidden appDataFolder) — **not classified sensitive**, so it largely sidesteps verification. Can be client-side (per-session consent, no Phase 1) or server-side (silent, needs Phase 1). It's a *convenience* over capabilities we already have (manual export + cloud sync), so do it only if "back up to *my* cloud" is wanted.

**Google Sheets / Google Tasks — Founder-toys, skip.** Each needs a sensitive scope → verification *and* server-side tokens (Phase 1), for value already covered by cheaper, built paths: CSV/JSON export and the MCP server (Sheets), and `.ics`/local PWA notifications (Tasks).

**Recommendation.** Do, in order: (1) **Sign in with Google** — bundle into B1 (zero code, no verification); (2) **".ics / Add to Calendar"** — highest value-per-effort, no Google project; (3) **Google Drive appData backup** — only if wanted. **Skip** Google Fit (permanent), and Calendar-API/Sheets/Tasks (sensitive-scope verification + Phase 1 for value cheaper paths already cover). The through-line: except sign-in and the no-API `.ics` link, every Google integration costs a **verification review** and **depends on Phase 1 being live (B1)**.

## Real exercise visuals — licensed-source survey + integration plan

*Status: not started, proposed. Effort: S–M. License facts verified against primary sources (license files/APIs), not memory.* The app ships an emoji per exercise (`Exercise.icon`); this is about optional real-movement visuals with the emoji kept as a guaranteed fallback.

**The constraint:** FitFlow's 24 exercises are almost all bodyweight/no-equipment, while most "exercise databases" are gym-equipment-heavy — so coverage of *our specific movements* matters more than database size. Honest reality: **no single free set cleanly covers all 24** — about **13–15** get an accurate image; the cardio/isometric/stability moves (jumping jacks, wall sit, high knees, dead bug, bird dog, shoulder taps, plank up-downs, knee push-up, march in place, push-up rotation) have no clean match and keep the emoji.

| Source | License — commercial? redistribute/bundle? | Format | Covers 24? | Notes |
|---|---|---|---|---|
| **yuhonas/free-exercise-db** | **Unlicense (public domain)** — commercial ✅, bundle ✅, **no attribution, no ShareAlike** | Photos (start/end), ~40 KB | ~13–15 | **The clean choice.** CDN-verified; hand-pick matches (don't fuzzy-map — it's equipment-heavy) |
| **Everkinetic** (upstream of wger) | **CC-BY-SA-4.0** — commercial ✅, bundle ✅ **but attribution + ShareAlike** | Illustrations: PNG + scalable SVG, multi-frame | good for strength moves | Real obligation; fine for personal, decide before a store/closed-source launch |
| **wger** media | per-image **CC-BY-SA 3.0/4.0** (verified via its license API) | mostly illustrations | decent | attribution + ShareAlike, **per-image** — verify each |
| **Pexels / Unsplash** | commercial ✅, attribution optional, **no re-publishing the library** | stock photos | hit-or-miss | unreliable for *named* movements; runtime nicety only |
| **MuscleWiki** | **proprietary, no redistribution license** | animated GIFs | high (technically) | **Do not use — infringement.** (Nice GIFs, but unlicensed.) |
| Feeel / Open Workout | **unconfirmed** (repo host blocked) | illustrations | bodyweight-focused | verify per-asset before use |

**Recommendation:** **yuhonas/free-exercise-db (Unlicense)**, bundled — public domain, no attribution/ShareAlike, tiny files. Hand-pick the ~13–15 images that genuinely match; leave the rest on the emoji. Optionally add **Everkinetic SVGs** for gaps *only* if accepting CC-BY-SA attribution + ShareAlike. **Skip** MuscleWiki (illegal), Pexels/Unsplash as primary, Feeel (license unconfirmed).

**Integration (grounded in the code):**
1. `src/types.ts`: add optional `imageUrl?: string` (+ `imageCredit?: string` for CC-BY-SA attribution) to `Exercise` — backward-compatible; keep `icon` as fallback (update PLAN.md per its contract note).
2. Bundle hand-picked JPGs in `public/exercises/<slug>.jpg` (offline-safe; survives PWA/Capacitor). ~15 × ~40 KB ≈ <1 MB, lazy-loaded.
3. `src/data/exercises.ts`: set `imageUrl` only on exercises with a verified-correct image.
4. Render: where `icon` shows large (player + cards), use `<img loading="lazy" onError={→ emoji}>` when present, else the emoji.
5. Attribution: **none** with free-exercise-db; if any CC-BY-SA asset is used, add a Settings "Credits" line and honor ShareAlike.

**Effort:** S for the free-exercise-db photos (optional field + ~15 curated files + render-with-fallback). M if adding Everkinetic illustrations (attribution/ShareAlike bookkeeping) or a runtime Pexels fallback. **Obligations:** none if it sticks to free-exercise-db; CC-BY-SA sources add attribution + ShareAlike (decide deliberately before any store/closed-source launch).
