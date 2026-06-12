# FitFlow 7 ⚡

**The no-excuses workout timer.** Seven minutes. Twenty-four exercises. Zero subscriptions.

> Live at **[fitflow7.vercel.app](https://fitflow7.vercel.app)** — just open and go.

---

## What is it?

FitFlow 7 is a fast, distraction-free workout app that gets you moving in seconds. Pick a routine, hit start, and follow along. The app calls out every phase with audio cues, tracks your streaks, and saves your history — all without an account or an internet connection after the first load.

No login. No ads. No upsell. Just work.

---

## Features

### The Workout Player
- Giant countdown timer you can read from across the room
- Color-coded phases — **amber** to prepare, **cyan** to work, **emerald** to rest, **violet** when you're done
- Audio cues on every phase transition + 3-second countdown ticks
- **Focus mode** strips the UI down to just the timer
- Pause, skip, or go back at any point

### Keyboard Shortcuts
| Key | Action |
|-----|--------|
| `Space` | Pause / Resume |
| `→` | Skip to next exercise |
| `←` | Go back |
| `M` | Mute audio |
| `F` | Toggle focus mode |

### Build Your Own Routines
- Start from the built-in **Classic 7** (12 exercises, ~7 minutes) or create from scratch
- Reorder, add, and remove exercises however you like
- Adjust work time, rest time, and number of rounds
- Routines save locally — always there when you come back

### Exercise Library
- 24 exercises with full instructions, muscle groups, difficulty levels, and common mistakes
- Easier and harder variations linked for every exercise
- Filter by category (cardio, core, upper body, lower body, mobility) or difficulty

### Stats & Streaks
- Daily streak tracker — don't break the chain
- Total workouts, total minutes, this week, this month, longest streak ever
- Full session history with date, duration, and exercises completed

---

## Running Locally

```bash
git clone https://github.com/n8watkins/fitflow7.git
cd fitflow7
npm install
npm run dev
```

Then open [http://localhost:5173](http://localhost:5173).

**Build for production:**
```bash
npm run build
```

---

## Stack

| Layer | Tech |
|-------|------|
| UI | React 19 + TypeScript |
| Build | Vite 8 |
| Routing | React Router 7 |
| State | Zustand |
| Styling | Tailwind CSS v4 |
| Audio | Web Audio API (no assets) |
| Storage | localStorage |
| Deploy | Vercel |

No backend. No database. No API keys. It all lives in the browser.

---

## What's Next

A few rough edges are being smoothed out before V1:

- **Tab backgrounding fix** — timer drifts when you switch tabs; moving to wall-clock timestamps
- **Screen wake lock** — keep the screen on during workouts on mobile
- **"End Workout" flow** — show the summary card instead of jumping straight to dashboard
- **Dashboard refresh** — stats update live after a workout without needing a reload
- **Accessibility** — larger touch targets, better contrast on keyboard hints

After that: cloud sync, accounts, and maybe an Android app.

---

## Contributing

Issues and PRs welcome. The codebase is intentionally lean — no test framework, no mocks, no abstractions for their own sake. If you're adding something, keep it that way.

---

Made with 💪 by [n8watkins](https://github.com/n8watkins)
