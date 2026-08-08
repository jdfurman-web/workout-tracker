# Ruck + Iron

Personal PWA for the **FORGE** 8-week strength + row/ruck + daily core block.

**Live:** https://workout.furmans.me  
**Data (private):** [jdfurman-web/workout-data](https://github.com/jdfurman-web/workout-data)

## Features

- Flexible 4-session weeks (strength A/B, cardio A/B — any days)
- Set logging with progressive load suggestions (per-hand aware)
- Rest timer (iOS audio unlock + vibrate + flash)
- Daily rotating core + streak
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
