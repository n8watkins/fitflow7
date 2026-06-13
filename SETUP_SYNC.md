# Enabling Cloud Sync (Phase 1)

The sync backend is built and deployed, but **dormant until you provide
credentials**. With no env vars set, the API returns "not configured", the
sign-in buttons get a 501, and the app behaves exactly like the local-only MVP.
This doc is the checklist to turn it on.

Everything below is a one-time setup. The code reads it all from env vars — no
code changes needed.

## 1. Provision the Turso database

```bash
# Install the CLI if needed: https://docs.turso.tech/cli/installation
turso auth signup            # or: turso auth login
turso db create fitflow7
turso db show fitflow7 --url           # -> TURSO_DATABASE_URL
turso db tokens create fitflow7        # -> TURSO_AUTH_TOKEN
```

The schema (users / routines / sessions / settings) is created automatically on
the first API request — no manual migration step.

## 2. Make a session secret

```bash
openssl rand -base64 32                # -> SESSION_SECRET
```

## 3. Register at least one OAuth app

You only need one provider; set up both if you want both buttons to work.

**GitHub** — https://github.com/settings/developers -> "New OAuth App"
- Homepage URL: `https://fitflow7.vercel.app`
- Authorization callback URL: `https://fitflow7.vercel.app/api/auth/callback`
- Copy Client ID + a generated Client Secret -> `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`

**Google** — https://console.cloud.google.com/apis/credentials -> "Create
Credentials" -> "OAuth client ID" -> Application type "Web application"
- Authorized redirect URI: `https://fitflow7.vercel.app/api/auth/callback`
- Copy Client ID + Secret -> `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`

For local testing with `vercel dev`, also add
`http://localhost:3000/api/auth/callback` as a callback/redirect URI.

## 4. Set the env vars

- **Production:** Vercel dashboard -> Project -> Settings -> Environment
  Variables. Add each key from `.env.example`. Redeploy.
- **Local:** `cp .env.example .env`, fill it in, run `vercel dev`.

## 5. Verify

1. Open the app -> Settings -> "Sign in with GitHub/Google".
2. After the redirect back, the nav shows a green "Synced" pill.
3. Create a routine, then load the app in another browser/device signed in as
   the same account — it appears after focus (sync runs on window focus).
4. Delete a routine or clear history on one device; it disappears on the other
   (tombstones propagate).

## Notes / limitations (V1)

- Conflict resolution is last-write-wins by `updatedAt`. Fine for a single user
  across devices; not designed for concurrent multi-user editing.
- Sessions are append-only; "Clear history" tombstones them so the clear syncs.
- Sign-out clears the session cookie but leaves local data in the browser. On a
  shared browser, the next account's first sync merges both sets (acceptable for
  a personal app; revisit if multi-user-per-browser becomes a real case).
- No automated tests yet — see ROADMAP "Cross-cutting": add a test framework now
  that sync logic exists.
