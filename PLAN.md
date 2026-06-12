# FitFlow 7 — MVP Build Plan (agent contract)

Desktop-first 7-minute workout web app. Local-only MVP: no backend, no auth.
Stack: Vite + React 19 + TypeScript + Tailwind v4 (via `@tailwindcss/vite`) + Zustand + react-router-dom.

## Hard rules for all agents

- Code against `src/types.ts` exactly. Do NOT change type shapes.
- Do NOT add npm dependencies. Do NOT touch package.json, vite.config.ts, index.css, main.tsx, App.tsx.
- Only create/edit the files assigned to you.
- Dark theme. Tailwind theme tokens available: `bg-surface`, `bg-card`, `bg-card-hover`, `border-edge`, `text-accent`, `bg-accent`, `accent-dim`. Accent is cyan. Rounded cards (`rounded-2xl`), large readable typography.
- Do not run git commands; the orchestrator commits.
- Verify your work compiles: `npx tsc -b` from the project root.

## File ownership map

```
src/types.ts                shared contract (orchestrator-owned, read-only)
src/App.tsx                 routes + layout shell (orchestrator-owned)
src/data/exercises.ts       Agent DATA: EXERCISES: Exercise[] (24 items) + EXERCISE_MAP: Record<string, Exercise>
src/data/routines.ts        Agent DATA: CLASSIC_7: Routine (id 'classic-7', isSystem true)
src/lib/storage.ts          Agent ENGINE: localStorage persistence
src/lib/stats.ts            Agent ENGINE: streaks + stats
src/store/timerStore.ts     Agent ENGINE: Zustand workout timer engine
src/lib/audio.ts            Agent PLAYER: WebAudio cue beeps
src/pages/Player.tsx        Agent PLAYER
src/pages/Dashboard.tsx     Agent DASH
src/pages/History.tsx       Agent DASH
src/pages/Settings.tsx      Agent DASH
src/pages/RoutineEditor.tsx Agent EDITOR
src/pages/Library.tsx       Agent EDITOR
```

## Routes (already wired in App.tsx)

- `/` Dashboard
- `/workout/:routineId` Player (`routineId` is a Routine id; falls back to classic-7 if unknown)
- `/routines/:routineId/edit` RoutineEditor (`new` = create new routine starting from Classic 7)
- `/library` Library
- `/history` History
- `/settings` Settings

## Module contracts

### src/lib/storage.ts (Agent ENGINE)

```ts
getRoutines(): Routine[]            // user-saved only; callers merge CLASSIC_7 themselves
getRoutine(id: string): Routine | undefined   // checks system routines too
saveRoutine(r: Routine): void
deleteRoutine(id: string): void
getSessions(): WorkoutSession[]     // sorted newest first
saveSession(s: WorkoutSession): void
getSettings(): UserSettings        // merged over DEFAULT_SETTINGS
saveSettings(s: UserSettings): void
getLastRoutineId(): string | undefined
setLastRoutineId(id: string): void
newId(): string                     // crypto.randomUUID()
```
localStorage keys prefixed `fitflow.` — JSON, resilient to parse errors (return defaults).

### src/lib/stats.ts (Agent ENGINE)

```ts
computeStats(sessions: WorkoutSession[]): Stats
```
Streak rules: ≥1 completed session per local calendar day = workout day; consecutive days = streak; current streak survives if today has no workout yet (counts from yesterday); longest streak computed from history.

### src/store/timerStore.ts (Agent ENGINE)

Zustand store driving the workout. Suggested shape:

```ts
type TimerState = {
  routine?: Routine
  exercises: Exercise[]          // resolved, repeated per round
  phase: WorkoutPhase            // idle | prepare | work | rest | complete
  currentIndex: number           // index into exercises
  secondsLeft: number
  totalSeconds: number           // of current phase, for progress ring
  isPaused: boolean
  isMuted: boolean
  startedAt?: string
  exercisesCompleted: number
  start(routine: Routine, exercises: Exercise[], settings: UserSettings): void
  tick(): void                   // called by 1s interval inside the store (setInterval managed by store)
  pause(): void; resume(): void; togglePause(): void
  skip(): void; previous(): void
  endWorkout(): void             // abandon -> phase complete, completed=false
  toggleMute(): void
  reset(): void
}
```
Engine behavior: prepare(countdownSeconds) → [work → rest]×n → complete (no rest after last exercise). On complete/abandon, build a `WorkoutSession` and `saveSession` + `setLastRoutineId`. Expose a way for the Player to react to phase changes for audio (e.g. a `cueEvent` field or subscribe).
Timer must be drift-resistant enough for MVP (1s setInterval fine, clear on pause/unmount).

### src/lib/audio.ts (Agent PLAYER)

WebAudio oscillator beeps, no asset files: `cueWorkStart()`, `cueRestStart()`, `cueCountdownTick()` (last 3s), `cueComplete()`, `cueStart()`. Handle AudioContext resume-on-gesture.

## Design language

- Dark, energetic, minimal. Big numbers (timer ~ `text-8xl`/`text-9xl` tabular-nums).
- Phase colors: prepare = amber, work = accent cyan, rest = emerald, complete = violet.
- Exercise visual = its `icon` emoji rendered very large on a `bg-card` rounded tile.
- Desktop-first layouts, but everything must remain usable at 375px wide.
```
