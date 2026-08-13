# Ruck + Iron

Personal PWA for the **FORGE** 8-week strength + row/ruck + core block (4–5 core days per week, not daily). Week windows are **7 days from startDate**.

**Live:** https://workout.furmans.me  
**Data (private):** [jdfurman-web/workout-data](https://github.com/jdfurman-web/workout-data)

## Features

- **Progress charts** — best-set weight trends + cardio distance (SVG, no deps)
- **Block archive** — FORGE 1 → FORGE 2 keeps history; progression scoped to current block

- Flexible 4-session weeks (strength A/B, cardio A/B — any days; miss slips, no stacking)
- Set logging with progressive load suggestions (per-hand aware; last weights carry into a new block)
- Rest timer (iOS audio unlock + vibrate + flash)
- Core 4–5 days/week (workout-day default, standalone allowed)
- Oura readiness card (from private data repo)
- Cloud sync to private GitHub repo (fine-grained PAT)
- Face ID / passcode lock (device convenience only — not multi-user auth)
- Offline app shell via service worker

## Deploy

GitHub Pages serves this repo from `main`. Custom domain: `workout.furmans.me` (`CNAME`).

## Passcode

Client-side SHA-256 gate only. To change:

```bash
echo -n 'newpass' | sha256sum
```

Paste the hex into `PASS_HASH` in `index.html`.

## Cloud sync PAT

1. GitHub → Settings → Developer settings → Fine-grained personal access token  
2. Resource owner: your account  
3. Only repository: **`workout-data`** (private)  
4. Permissions: **Contents: Read and write**  
5. In the app: Settings → Sync Up / Restore (prompts once; stored in `localStorage` on that device)

Auto-sync runs ~30s after edits when a PAT is present. Sync Up refuses to clobber a richer cloud copy from an empty device.

## Edit the program

All program data lives in the `PROGRAM` object in `index.html` (phases, workouts, core circuits). After editing, bump the version string in Settings and the `CACHE` name in `sw.js` so offline clients refresh.

## Privacy note

Workout logs sync only to the **private** `workout-data` repo. This app repo is public shell + program only — do not commit personal logs or PATs here.

## Blocks (FORGE N)

When an 8-week block ends (or you want a fresh program), use **Settings → Start New 8-Week Block** (or the completion CTA on Today).

- Archives the current block with a date range
- Keeps all logs forever
- Progress tab can filter **Current / All / FORGE N**
- Last weights carry into the new block (no invented numbers)

Legacy data without `blockId` is migrated into **FORGE 1** on first load after v2.6.
