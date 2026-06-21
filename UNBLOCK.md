# UNBLOCK — turn the cloud on (do this together, ~15 min)

> ✅ **DONE (2026-06-20).** Turso + GitHub OAuth + SESSION_SECRET are set in Vercel
> and deployed; GitHub sign-in is live. Kept as reference (e.g. to add Google or
> rotate secrets later). Only the real sign-in verification remains — see `STATUS.md`.

One-time setup. Everything cloud-dependent is **built, tested, and deployed but
dormant**; it all lights up the moment these env vars exist. Until then the app
is byte-identical to the local-only MVP.

**This single step unblocks four already-built features:**
- Phase 1 — accounts + cross-device sync
- Phase 1.5 — the MCP server returning **your real data**
- Phase 3b — MCP coaching tools (compare periods, personal records, routine detail)
- Phase 3c — the community routine library (publish / browse / clone / report)

> Reference: `SETUP_SYNC.md` (underlying detail), `STATUS.md` (full state).
> **Never commit secrets** — `.env` is gitignored; env vars live only in Vercel.

---

## Collect 5 values (3 sources)

Tip: you can run the CLI bits in the Claude Code session with a leading `!`
(e.g. `! turso db create fitflow7`) so the output lands in chat and the agent
can grab the values.

### ☐ 1. Session secret (1 value)
```
openssl rand -base64 32
```
→ **SESSION_SECRET** (any long random string; the agent can also generate this).

### ☐ 2. Turso database (2 values)
Install + sign in (skip if already set up):
```
curl -sSfL https://get.tur.so/install.sh | bash    # or: brew install tursodatabase/tap/turso
turso auth signup                                   # or: turso auth login
```
Create + read credentials:
```
turso db create fitflow7
turso db show fitflow7 --url        # → TURSO_DATABASE_URL  (libsql://fitflow7-xxxx.turso.io)
turso db tokens create fitflow7     # → TURSO_AUTH_TOKEN    (long eyJ... token)
```
The schema (users / routines / sessions / settings / public_routines) auto-creates
on the first request — no manual migration.

### ☐ 3. GitHub OAuth app (2 values)
**https://github.com/settings/developers → "New OAuth App"**, enter **exactly**:
- Application name: `FitFlow 7` (anything)
- Homepage URL: `https://fitflow7.vercel.app`
- Authorization callback URL: `https://fitflow7.vercel.app/api/auth/callback`

Register → copy **Client ID** → "Generate a new client secret" → copy **Client Secret**.
→ **GITHUB_CLIENT_ID**, **GITHUB_CLIENT_SECRET**

*(Optional: Google — https://console.cloud.google.com/apis/credentials → OAuth client
ID (Web application), same redirect URI → GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET.
GitHub alone fully works; skip Google for now if you like.)*

---

## Hand off the values

**Option A (fastest):** paste the values into the session; the agent sets them in
Vercel and redeploys:
```
echo -n "<value>" | vercel env add TURSO_DATABASE_URL production
echo -n "<value>" | vercel env add TURSO_AUTH_TOKEN   production
echo -n "<value>" | vercel env add SESSION_SECRET     production
echo -n "<value>" | vercel env add GITHUB_CLIENT_ID   production
echo -n "<value>" | vercel env add GITHUB_CLIENT_SECRET production
# optional: APP_URL = https://fitflow7.vercel.app  (pins the OAuth redirect host)
vercel --prod --yes
```

**Option B (you'd rather not paste secrets):** add the same keys yourself in
**Vercel → Project → Settings → Environment Variables** (Production scope), then
tell the agent "done" and it redeploys.

---

## Verify it's live (go-live checklist)

Once redeployed:
- ☐ `curl -s "https://fitflow7.vercel.app/api/auth/login?provider=github" -o /dev/null -w "%{http_code}"` returns **302** (was 501 while dormant).
- ☐ App → **Settings → Sign in with GitHub** → redirects back, nav shows a green **Synced** pill.
- ☐ **Cross-device:** create a routine in browser A; open the app signed-in as the same account in browser B → it appears after focus.
- ☐ **Tombstones:** delete that routine (or Clear history) in A → it disappears in B.
- ☐ **MCP (optional):** Settings → "Generate access token" → put it in the MCP config (`mcp/README.md`) → ask your AI "how many workouts this month?".
- ☐ **Community (optional):** Settings → Community → Publish a routine → it shows in the list; Clone it.

If sign-in fails with a redirect-URI mismatch: confirm the GitHub callback is
exactly `https://fitflow7.vercel.app/api/auth/callback`, and/or set `APP_URL`.

---

## Not required for the above — Android (separate track)
Needs your machine (Android Studio + JDK 17 + a phone with Health Connect).
Follow `ANDROID.md`: `VITE_NATIVE=true npm run build` → `npx cap add android` →
manifest permission → build APK → sideload. Cannot be done from CI.
