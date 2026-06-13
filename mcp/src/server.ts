#!/usr/bin/env -S npx tsx
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

// ---------------------------------------------------------------------------
// FitFlow 7 — private MCP server.
//
// Exposes your own workout data to an MCP-capable AI client (Claude Desktop /
// Claude Code). It is a thin, read-mostly client of the Phase 1 sync API: every
// tool calls POST /api/sync authenticated with your personal access token, so
// there is no second copy of the database and no extra trust boundary.
//
// Config (env):
//   FITFLOW_API_URL   default https://fitflow7.vercel.app
//   FITFLOW_TOKEN     required — generate in the app: Settings -> Account -> "Access token"
// ---------------------------------------------------------------------------

const API_URL = (process.env.FITFLOW_API_URL ?? 'https://fitflow7.vercel.app').replace(/\/$/, '')
const TOKEN = process.env.FITFLOW_TOKEN

if (!TOKEN) {
  console.error('FITFLOW_TOKEN is not set. Generate one in the app (Settings) and put it in the MCP config.')
  process.exit(1)
}

// --- Minimal shapes mirroring the /api/sync response (camelCase) ------------
interface Session {
  id: string
  routineId?: string
  routineName: string
  startedAt: string
  completedAt?: string
  durationSeconds: number
  completed: boolean
  exercisesCompleted: number
  totalExercises: number
  updatedAt?: string
  deletedAt?: string
}
interface Routine {
  id: string
  name: string
  description?: string
  exerciseIds: string[]
  workSeconds: number
  restSeconds: number
  rounds: number
  updatedAt?: string
  deletedAt?: string
}
interface SyncResponse {
  serverTime: string
  routines: Routine[]
  sessions: Session[]
  settings: unknown
}

async function syncPost(body: Record<string, unknown>): Promise<SyncResponse> {
  const res = await fetch(`${API_URL}/api/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(body),
  })
  if (res.status === 401) throw new Error('Unauthorized — FITFLOW_TOKEN is missing, expired, or invalid.')
  if (res.status === 501 || res.status === 500) {
    throw new Error('FitFlow cloud sync is not configured yet (the backend env vars are unset).')
  }
  if (!res.ok) throw new Error(`Sync request failed: HTTP ${res.status}`)
  return (await res.json()) as SyncResponse
}

/** Live (non-tombstoned) sessions, newest first. */
async function getSessions(): Promise<Session[]> {
  const data = await syncPost({}) // since omitted -> full pull
  return data.sessions
    .filter((s) => !s.deletedAt)
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
}

async function getRoutines(): Promise<Routine[]> {
  const data = await syncPost({})
  return data.routines.filter((r) => !r.deletedAt)
}

// --- Stats (mirrors src/lib/stats.ts; kept compact and dependency-free) ------
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function prevDayKey(key: string): string {
  const [y, m, d] = key.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() - 1)
  return dayKey(date)
}
function computeStats(sessions: Session[]) {
  const completed = sessions.filter((s) => s.completed)
  const days = new Set(completed.map((s) => dayKey(new Date(s.startedAt))))

  const today = dayKey(new Date())
  const yKey = prevDayKey(today)
  let currentStreak = 0
  let cursor = days.has(today) ? today : days.has(yKey) ? yKey : null
  while (cursor && days.has(cursor)) {
    currentStreak++
    cursor = prevDayKey(cursor)
  }

  let longestStreak = 0
  let run = 0
  let prev: string | null = null
  for (const key of [...days].sort().reverse()) {
    if (prev === null || prevDayKey(prev) === key) run++
    else {
      longestStreak = Math.max(longestStreak, run)
      run = 1
    }
    prev = key
  }
  longestStreak = Math.max(longestStreak, run)

  const now = new Date()
  const monthMatch = (s: Session) => {
    const d = new Date(s.startedAt)
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  }
  return {
    totalWorkouts: completed.length,
    totalMinutes: Math.round(completed.reduce((sum, s) => sum + s.durationSeconds, 0) / 60),
    currentStreak,
    longestStreak,
    workoutsThisMonth: completed.filter(monthMatch).length,
    lastWorkout: completed.length ? dayKey(new Date(completed[0].startedAt)) : null,
  }
}

function text(value: string) {
  return { content: [{ type: 'text' as const, text: value }] }
}

// ---------------------------------------------------------------------------
// Server + tools
// ---------------------------------------------------------------------------
const server = new McpServer({ name: 'fitflow7', version: '1.0.0' })

server.registerTool(
  'get_workout_history',
  {
    title: 'Get workout history',
    description: 'List recent completed and abandoned workout sessions, newest first.',
    inputSchema: { limit: z.number().int().min(1).max(200).optional() },
  },
  async ({ limit }) => {
    const sessions = (await getSessions()).slice(0, limit ?? 20)
    if (sessions.length === 0) return text('No workout sessions recorded yet.')
    const lines = sessions.map((s) => {
      const when = new Date(s.startedAt).toLocaleString()
      const mins = Math.round(s.durationSeconds / 60)
      const status = s.completed ? 'completed' : 'abandoned'
      return `- ${when} — ${s.routineName} (${mins} min, ${s.exercisesCompleted}/${s.totalExercises} exercises, ${status})`
    })
    return text(`${sessions.length} session(s):\n${lines.join('\n')}`)
  },
)

server.registerTool(
  'get_stats',
  {
    title: 'Get workout stats',
    description: 'Summary stats: total workouts and minutes, current and longest streak, workouts this month.',
    inputSchema: {},
  },
  async () => {
    const s = computeStats(await getSessions())
    return text(
      [
        `Total workouts: ${s.totalWorkouts}`,
        `Total minutes: ${s.totalMinutes}`,
        `Current streak: ${s.currentStreak} day(s)`,
        `Longest streak: ${s.longestStreak} day(s)`,
        `Workouts this month: ${s.workoutsThisMonth}`,
        `Last workout: ${s.lastWorkout ?? 'never'}`,
      ].join('\n'),
    )
  },
)

server.registerTool(
  'list_routines',
  {
    title: 'List routines',
    description: 'List the saved (non-system) workout routines on the account.',
    inputSchema: {},
  },
  async () => {
    const routines = await getRoutines()
    if (routines.length === 0) return text('No saved routines.')
    const lines = routines.map(
      (r) =>
        `- ${r.name}: ${r.exerciseIds.length} exercise(s), ${r.workSeconds}s work / ${r.restSeconds}s rest x ${r.rounds} round(s)`,
    )
    return text(`${routines.length} routine(s):\n${lines.join('\n')}`)
  },
)

server.registerTool(
  'log_session',
  {
    title: 'Log a workout session',
    description:
      'Record a completed workout. Use when the user says they finished a workout outside the app.',
    inputSchema: {
      routineName: z.string().min(1),
      durationSeconds: z.number().int().min(1),
      exercisesCompleted: z.number().int().min(0).optional(),
      totalExercises: z.number().int().min(0).optional(),
      completed: z.boolean().optional(),
      startedAt: z.string().optional(),
    },
  },
  async (args) => {
    const startedAt = args.startedAt ?? new Date().toISOString()
    const completedAt = new Date().toISOString()
    const session: Session = {
      id: crypto.randomUUID(),
      routineName: args.routineName,
      startedAt,
      completedAt,
      durationSeconds: args.durationSeconds,
      completed: args.completed ?? true,
      exercisesCompleted: args.exercisesCompleted ?? 0,
      totalExercises: args.totalExercises ?? args.exercisesCompleted ?? 0,
      updatedAt: completedAt,
    }
    await syncPost({ sessions: [session] })
    return text(`Logged "${session.routineName}" (${Math.round(session.durationSeconds / 60)} min).`)
  },
)

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  // stderr only — stdout is the MCP transport.
  console.error(`FitFlow MCP server running against ${API_URL}`)
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
