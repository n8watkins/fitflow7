# FitFlow 7 — Phase 3 Proposal: "Platform"

Status: DRAFT for decision. Author: planning pass, 2026-06-20.
Prereq read: `ROADMAP.md`, `HANDOFF.md`, `PLAN.md`, `mcp/README.md`, `SETUP_SYNC.md`.

---

## 1. Where we are, and what "platform" could mean

FitFlow 7 today is a **single-player, local-first** app with an optional cloud tail:

- The MVP is the product: a 7-minute workout timer. localStorage is the source of truth, mediated by one seam (`src/lib/storage.ts`). The signed-out app is byte-identical to the original MVP.
- Phase 1 (accounts + cloud sync) is **built but dormant** — Turso + hand-rolled OAuth + one bidirectional sync endpoint (`api/sync.ts`). It does nothing until env vars are set (`SETUP_SYNC.md`).
- Phase 1.5 (private MCP, `mcp/`) is a *thin client of `/api/sync`* — it has no second database; it reads your own account via a PAT.
- Phase 2 (Android/Health Connect) is code-complete; the user builds the APK.

Critically, **every cloud capability we have is single-user by construction.** Look at the schema (`api/_lib/db.ts`) and the sync contract (`api/sync.ts`):

- Every table is scoped by `user_id`. Every query is `WHERE user_id = ?`. The `ON CONFLICT` upserts even re-assert `routines.user_id = excluded.user_id` so one user can never write another's row.
- There is exactly one read path (`/api/sync`, your records since a cursor) and one write path (push your dirty queue). There is no concept of "another user," "public," "shared," or "follow."
- Reconciliation is **last-write-wins by `updatedAt`** with tombstones (`deletedAt`). LWW is correct for *one person on many devices*. It is the wrong model the instant two people can touch the same record.

So "platform" is the open question. Realistically it means one of three things, and they are very different amounts of work:

1. **Platform as reach** — the same single-user app on more surfaces / with more insight (web dashboard, richer analytics, AI coaching). *Builds on the existing single-user model. Low architectural risk.*
2. **Platform as network** — multiple users who can see and share each other's content (social, leaderboards, a routine library, following). *Breaks the single-user-LWW model. This is the expensive, risky direction.*
3. **Platform as business** — monetization layered on either of the above (subscriptions, premium routines). *Orthogonal; mostly billing + an entitlement flag, but only worth doing once there's something people would pay for.*

The honest framing: we have a very clean **single-user** foundation. Phase 3 is a decision about whether to *exploit* it (reach) or *fork* it (network). The rest of this doc argues for exploiting it first.

---

## 2. Candidate directions

Each candidate is scored on what it is, why it matters, rough effort (S/M/L/XL), and exactly how it touches the *current* code.

### A. Web dashboard / richer analytics — **HIGH VALUE, LOW RISK**

**What it is.** A real analytics surface for data we already collect and already sync: trends over time (workouts/week, minutes, streak history), per-routine breakdowns, completion-rate (we store `completed` and `exercisesCompleted/totalExercises` on every session), time-of-day patterns, calendar heatmap. This is a *new page*, e.g. `/insights`, plus charts.

**Why it matters.** It is the single highest value-per-effort item. The data exists, the sync to get it cross-device exists, the MCP server already re-implements `computeStats` to answer "how many workouts this month" — clearly the user already wants this lens. It deepens retention for the people already dogfooding, with zero new trust boundary.

**Effort: S–M.** No backend change. No schema change. No auth-scope change. The sync endpoint is untouched. It is a `src/lib/stats.ts` extension (new aggregations) plus one page that reads `getSessions()` and re-renders on `dataVersion` bumps (the `syncStore` already exposes `bumpData()`/`dataVersion` for exactly this — `History.tsx`/`Dashboard.tsx` already use the `location.key` reactive-read pattern). The only judgement call is charts: hand-roll SVG to honor the "no new deps" instinct, or relax it for one charting lib (the no-deps rule was already relaxed for `@libsql/client`).

**Architecture fit.** Pure additive. New page in `src/pages/`, new route in `App.tsx` (orchestrator-owned), new functions in `src/lib/stats.ts`. The `storage.ts` seam and `api/sync.ts` do not change.

### B. AI coaching built on the MCP/data layer — **MEDIUM-HIGH VALUE, LOW-MEDIUM RISK**

**What it is.** Two flavors, very different in cost:
- **B1 (cheap, real):** lean harder into the MCP server we already shipped. Add read tools (`get_routine_detail`, `suggest_progression` driven by `easierVariationId`/`harderVariationId` already in `Exercise`) and let the user's *own* AI client (Claude Desktop/Code) do the coaching. This is "platform as a data API," and it's almost free — `mcp/src/server.ts` is the only file that grows.
- **B2 (expensive, founder-toy risk):** an in-app AI coach — a chat surface inside FitFlow that calls an LLM server-side. This needs a new `/api` endpoint, a model provider + API key, per-user rate limiting and cost controls, and prompt/abuse handling.

**Why it matters.** B1 is a genuine differentiator that costs almost nothing because the MCP plumbing (PAT auth, `getAuthedUserId` accepting `Bearer`, the thin-client pattern) is done. B2 is where most "AI fitness app" energy goes and where most of it is wasted: a generic "do more push-ups" chatbot is a classic founder-toy. Only pursue B2 if there's a concrete coaching loop the user actually wants in-app.

**Effort.** B1: S. B2: L (provider integration + cost/abuse controls + a chat UI + the fact that the app is otherwise local-first and stateless — an in-app coach forces a server round-trip into the core loop).

**Architecture fit.** B1 reuses everything; no new trust boundary (`mcp/README.md` is explicit that the MCP server adds none). B2 adds a server dependency, an API key to protect, and per-user metering — the first time we'd need real rate limiting (flagged as a cross-cutting TODO in `ROADMAP.md`, currently unbuilt).

### C. Public accounts + social/sharing — **MEDIUM VALUE, HIGH RISK / HIGH COST**

**What it is.** Public profiles, sharing a routine, following friends, leaderboards by streak/volume. This is "platform as network."

**Why it matters.** It's the most ambitious and the most likely to drive growth *if it works* — but it's also where the current architecture stops helping and starts fighting. Honest read: **this is the biggest single jump in the whole roadmap**, bigger than Phase 1 was.

**Effort: XL.** Every assumption in the cloud layer is single-user:
- **Data model.** The Turso schema (`api/_lib/db.ts`) has no notion of relationships between users. New tables needed: `follows (follower_id, followee_id)`, `shares`/`public_routines (routine_id, owner_id, visibility, slug)`, and likely a denormalized `leaderboard` projection (you cannot compute a global leaderboard by scanning every user's `sessions` per request). `users` currently exposes only `provider`, `provider_id`, `email`, `name`, `avatar_url` — a public profile needs a chosen handle, a `public` flag, and a privacy default (email/provider id must never leak).
- **Sync contract.** `api/sync.ts` is fundamentally "give me *my* rows since a cursor." Social reads (someone else's public routine, a leaderboard) are a *different access pattern* and must be **new endpoints**, not bolted onto `/api/sync`. Do not generalize the sync endpoint to serve other users' data — that's how you accidentally make `WHERE user_id = ?` optional.
- **Auth scope.** Today a token (cookie or PAT) means "full read/write of one account." Sharing introduces *read access to data you don't own*, which needs visibility checks on every social endpoint, and the PAT (currently full-account, 1-year, **no revocation list** per `mcp/README.md`) becomes a real liability the moment accounts are public.
- **`storage.ts` seam.** The local seam assumes all routines/sessions belong to "me." A followed friend's routine or a public library entry is *read-only, not-mine* data — it can't go in the same `fitflow.routines` blob without a `dirty`/tombstone/LWW model that doesn't apply to it. This needs a separate local cache namespace, or these stay server-only (never cached locally). The clean single-seam invariant gets messier here.
- **New surfaces.** Profile page, friends/feed, leaderboard, share dialog + public routine view (ideally server-rendered for link previews — the app is currently a pure SPA with a Vercel SPA rewrite in `vercel.json`).

**The risk that dwarfs the rest: abuse/moderation.** Public handles, shared routine names/descriptions, and profiles are all user-generated content. That means moderation, reporting, rate limiting, and a person (the user) on the hook for what's posted. The codebase has **zero** of this today and `ROADMAP.md` lists rate limiting as an unbuilt cross-cutting concern.

### D. Routine marketplace / community routine library — **MEDIUM VALUE, HIGH RISK (subset of C)**

**What it is.** A browsable library of community-published routines you can clone into your account. A focused slice of C — sharing *content*, not *social graph*.

**Why it matters.** Higher value-to-risk than full social: routines are small, structured, low-moderation-surface objects (a name + an ordered list of *known* exercise ids + timings). Cloning is trivial because routines already use `crypto.randomUUID()` ids and the editor already supports "start from Classic 7" / duplicate. It does NOT require a social graph, a feed, or leaderboards.

**Effort: L** (vs XL for full social). Needs: a `public_routines` table (or a `visibility` column + a `slug`), a publish endpoint, a browse/read endpoint (new, *not* `/api/sync`), and a "clone to my account" action (which is just `saveRoutine` with a `newId()` — already supported by the seam). Moderation surface is real but bounded (routine names/descriptions only). A "marketplace" (i.e. *paid* routines) is a further step that pulls in monetization (E) and is not worth it yet.

**Architecture fit.** Reuses the routine type and the editor wholesale. The risky parts are the same new-endpoint + visibility + moderation concerns as C, but smaller. Validate that published routines reference only known `EXERCISE_MAP` ids (the exercise dataset is shipped client-side and shared), so a cloned routine never has dangling exercises.

### E. Monetization (subscriptions / premium routines) — **LOW PRIORITY NOW**

**What it is.** Paid tier: subscriptions, or premium/pro routines.

**Why it matters.** It matters *eventually*, but the README's whole pitch is "Zero subscriptions. No login. No ads. No upsell." There is nothing today that's worth paying for, and monetizing before there's network value or premium content is premature. Mechanically it's not huge — a billing provider + an `entitlement`/`plan` column on `users` + a server-checked gate — but it should *follow* a value-creating phase (A, then D), not lead.

**Effort: M** once there's something to sell. **Skip for Phase 3.**

### Honest scorecard

| Candidate | Value | Risk/Cost | New trust boundary? | Touches sync/schema? | Verdict |
|---|---|---|---|---|---|
| A. Web dashboard / analytics | High | Low (S–M) | No | No | **Do first** |
| B1. MCP/data-API coaching | High | Low (S) | No | No | **Do first (cheap)** |
| B2. In-app AI coach | Med | Med-High (L) | Yes (LLM key, cost) | New endpoint | Defer / only if wanted |
| D. Community routine library | Med | High (L) | Yes (public content) | Yes (new tables + endpoints) | **Phase 3b** |
| C. Full social/leaderboards | Med | Very High (XL) | Yes | Yes (deep) | Defer to Phase 4 |
| E. Monetization | Med (later) | Med | Billing | `users` column | Out of scope |

---

## 3. Recommended Phase 3 scope (opinionated)

**Recommendation: Phase 3 = "Insight first, then content — not social."**

Exploit the single-user foundation before forking it. Ship the high-value, low-risk lens on data we already have, deepen the data-API/AI angle for nearly free, and only *then* take the first careful step toward a network with a bounded, content-only routine library. Defer full social and monetization.

This sequencing also respects the hard prerequisite: **everything past 3a-local requires Phase 1 cloud sync to actually be turned on.** Today it's dormant.

### Phase 3a — Insights (the MVP) [S–M]

The concrete deliverable:

- A new `/insights` route + page. Reactive reads via the existing `dataVersion`/`location.key` pattern (mirror `Dashboard.tsx`/`History.tsx`).
- New aggregations in `src/lib/stats.ts`: workouts-per-week series, minutes-per-week, streak history, completion rate (we already store `completed` + `exercisesCompleted/totalExercises`), per-routine counts, weekday/time-of-day distribution, a calendar heatmap.
- Visualization: hand-rolled SVG charts (preferred, keeps the no-deps spirit) or one charting dep if the user okays it.
- **No backend changes. Works fully offline/local-only.** Cross-device "insights follow you" comes for free *if* sync is on, but the page does not require it.

**Why this is the MVP:** it's the smallest thing that delivers real value, ships without turning sync on, and de-risks nothing else while proving the "platform = deeper product" thesis.

### Phase 3b — Data API + AI coaching (B1) [S]

- Extend `mcp/src/server.ts` with richer read tools (`get_routine_detail`, a progression suggester using `easier/harderVariationId`, "compare this week vs last").
- Optionally surface a "Generate access token" polish pass in Settings (the endpoint `api/token.ts` exists).
- **Prereq: Phase 1 sync must be live** (the MCP server is a client of `/api/sync`). No schema change; no new trust boundary.

### Phase 3c — Community routine library (D, bounded) [L] — *gated*

Only if 3a/3b land well and there's appetite. Scope strictly:

- New table `public_routines` (or `visibility` + `slug` on `routines`) in `api/_lib/db.ts`.
- New endpoints **separate from `/api/sync`**: `POST /api/routines/publish`, `GET /api/routines/public` (browse), `GET /api/routines/public/:slug` (read one). Never route other-user reads through the user-scoped sync endpoint.
- "Clone to my account" = `saveRoutine(newId(), …)` — already supported.
- Validation: published routines reference only known `EXERCISE_MAP` ids.
- Minimum viable moderation: a report action + a server-side block flag + rate limiting on publish. No public *social graph*, no feed, no leaderboards.

Explicitly **NOT** in Phase 3: following/friends, leaderboards, public profiles, in-app AI chat (B2), payments (E).

---

## 4. Architecture & risk

### The biggest change: single-user-LWW → anything multi-user

This is the watershed and it only appears in 3c. Be honest that 3a/3b are *safe* precisely because they never cross it.

- **LWW is wrong for shared rows.** `applyRemoteRoutines`/`applyRemoteSessions` (`storage.ts`) and the `ON CONFLICT … WHERE excluded.updated_at > …` upserts (`api/sync.ts`) assume one owner per record. Shared/public content must be **copy-on-clone** (each user gets their own `newId()` copy), never a co-edited row. Do not let two users point at one routine id.
- **`/api/sync` must stay single-user.** It is the crown jewel of the current design (`WHERE user_id = ?` everywhere). Social/library reads go through *new* endpoints with their own visibility checks. Resist the temptation to add an optional "other user" param to sync.
- **The local seam gets a second category.** Not-mine, read-only data (a public routine you're browsing) does not fit the `dirty`/tombstone/LWW model in `storage.ts`. Either keep it server-only (don't cache it locally) or give it a separate namespace. Keeping the single-owner invariant on `fitflow.routines` is worth defending.

### Risk register

- **Abuse / moderation (3c).** First time we accept user content others can see. Needs reporting + a block flag + publish rate limiting. None exists today; rate limiting is a known-unbuilt item in `ROADMAP.md`. This is the top reason to keep 3c content-only and small.
- **Privacy.** `users` holds `email` and `provider_id`. Any public surface must expose only a chosen handle/display name — never email, never provider id. Public profiles (deferred) would force a deliberate opt-in privacy model.
- **PAT blast radius.** PATs are full-account, 1-year, signed-stateless with **no revocation list** (only `SESSION_SECRET` rotation invalidates them, nuking everyone). Fine for a private single-user MCP. The moment accounts are public/social, we need scoped + revocable tokens. Acceptable to leave as-is through 3a/3b; must be addressed before C.
- **Cost.** Today cost ≈ Turso free tier + Vercel functions, dormant. 3a/3b add ~nothing. B2 (in-app AI) adds per-request LLM spend that scales with usage and needs metering — a real reason to defer it. A leaderboard (C) needs a denormalized projection or it becomes an expensive full-scan per request.
- **SPA/link-preview gap.** Sharing a public routine link wants OG/server-rendered previews; the app is a pure SPA behind a Vercel rewrite (`vercel.json`). 3c would need a minimal server-rendered route for `/r/:slug`. Another reason it's a distinct, later sub-phase.
- **No request-harness tests for `/api`.** `ROADMAP.md` notes the sync engine and `/api` handlers lack tests. New endpoints in 3c should arrive with a request harness.

### Explicit prerequisites

1. **Phase 1 cloud sync must be turned on first** for anything beyond 3a-local. Follow `SETUP_SYNC.md` (provision Turso, an OAuth app, set Vercel env vars), redeploy, and do the untested real-device cross-device + tombstone verification that `HANDOFF.md` flags as the main unverified path. *3a Insights can ship before this; 3b and 3c cannot.*
2. **Verify the dormant pipeline end-to-end** (sign-in on two browsers, routine/session propagation, delete/clear tombstones) — this has never run against a live backend.
3. Add a `/api` request-harness test pattern before introducing new endpoints (3c).
4. Decide the no-deps stance for charts (3a) up front.

---

## 5. What we are NOT doing yet (out of scope for Phase 3)

- **Following / friends / social graph.** Deferred to Phase 4. New relationship tables, feed, abuse surface — too big now.
- **Leaderboards.** Deferred. Requires a denormalized projection and a real anti-cheat/privacy story.
- **Public user profiles.** Deferred. Forces an opt-in privacy model on `users` (which holds email/provider id today).
- **In-app AI chat coach (B2).** Deferred. The cheap MCP/data-API angle (B1) gets most of the value with none of the cost/abuse/server-dependency. Revisit only with a concrete in-app coaching loop.
- **Monetization — subscriptions, paid/premium routines, a paid marketplace (E).** Out of scope. Contradicts the current "no subscriptions, no upsell" positioning and there's nothing worth charging for yet. Revisit after 3a + 3c create value.
- **Scoped/revocable PATs and full rate-limiting infra.** Not built in 3a/3b; a hard prerequisite before any public/social phase (C), not before Insights.
- **Server-side rendering / link previews.** Only relevant to 3c sharing; not a Phase 3 commitment unless 3c is greenlit.
- **Changing `/api/sync` to serve other users' data.** Explicitly forbidden. Sync stays single-user; social reads get new endpoints.

---

### Bottom line

Phase 3 should mean **"deeper product on the foundation we have,"** not **"a social network we don't."** Ship Insights (3a) — high value, no backend change, no risk, works today. Extend the MCP data API + AI angle (3b) for nearly free once sync is live. Treat a *content-only, copy-on-clone* routine library (3c) as the single, carefully-bounded step toward a network — and gate it on Phase 1 actually being turned on, a moderation/rate-limiting baseline, and a test harness for `/api`. Defer full social, profiles, leaderboards, in-app AI chat, and monetization.

---

### Critical files for implementation

- `src/lib/stats.ts` — 3a: new aggregations for the insights page; current `computeStats` is the starting point.
- `src/lib/storage.ts` — the single seam; 3a reads through it, 3c forces the not-mine/read-only data decision here.
- `api/sync.ts` — the single-user contract that must NOT absorb social reads; reference for the upsert/LWW pattern.
- `api/_lib/db.ts` — the Turso schema; 3c adds `public_routines`/visibility here.
- `mcp/src/server.ts` — 3b: where the data-API/AI coaching tools grow, reusing PAT auth.
