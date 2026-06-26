# FitFlow 7 — Private MCP Server

Exposes **your own** FitFlow workout data to an MCP-capable AI client (Claude
Desktop, Claude Code, etc.). It is a thin client of the Phase 1 sync API: every
tool calls `POST /api/sync` authenticated with a personal access token, so there
is no second database and no extra trust boundary.

## Tools

| Tool | What it does |
|------|--------------|
| `get_workout_history` | Recent sessions, newest first (`limit`, default 20) |
| `get_stats` | Totals, current/longest streak, workouts this month |
| `list_routines` | Your saved (non-system) routines |
| `log_session` | Record a completed workout done outside the app |
| `compare_periods` | This week vs last week and this month vs last month (counts, minutes, deltas) |
| `get_personal_records` | Personal bests: total workouts, longest streak, longest session, best week |
| `get_routine_detail` | Timing, exercise count, and estimated active time for one routine (`name`) |

## Prerequisites

Cloud sync must be **turned on** (see `../SETUP_SYNC.md`) and you must be signed
in — the server reads *your* account's data. Until sync is configured the tools
return a clear "cloud sync is not configured yet" error.

## Setup

```bash
cd mcp
npm install
```

1. In the app: **Settings → Account → Generate** an access token. Choose the
   **Read + write** scope (the default) so `log_session` works — a **Read only**
   token can read your data but can't record workouts. Copy the secret (it's
   shown once). You can revoke it any time from the same screen.
2. Add the server to your MCP client config (examples below), setting:
   - `FITFLOW_TOKEN` — the token you just generated (treat it like a password)
   - `FITFLOW_API_URL` — optional, defaults to `https://fitflow7.vercel.app`

### Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "fitflow7": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/fitflow7/mcp/src/server.ts"],
      "env": { "FITFLOW_TOKEN": "paste-your-token-here" }
    }
  }
}
```

### Claude Code

```bash
claude mcp add fitflow7 \
  --env FITFLOW_TOKEN=paste-your-token-here \
  -- npx tsx /absolute/path/to/fitflow7/mcp/src/server.ts
```

Then ask things like *"How many workouts have I done this month?"*, *"What's my
current streak?"*, or *"Log the 7-minute workout I just finished."*

## Local development / verification

The server can be exercised without the production backend, against
`vercel dev` + a local file DB (how it was validated):

```bash
# from the repo root, with a local .env (TURSO_DATABASE_URL=file:..., SESSION_SECRET=...)
vercel dev
# mint a PAT signed with the same SESSION_SECRET, then:
FITFLOW_API_URL=http://localhost:3001 FITFLOW_TOKEN=<pat> npm start
```

`npm run typecheck` type-checks the server.

## Notes

- stdout is the MCP transport; all logging goes to stderr.
- Tokens are signed (1-year expiry) **and** tracked server-side in a registry, so
  they're individually revocable — revoke one from Settings → Account and this
  server stops authenticating with it immediately (no need to rotate the secret).
  Tokens are scoped: `read` (pull only) or `readwrite` (also `log_session`).
