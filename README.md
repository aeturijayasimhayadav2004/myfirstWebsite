# Our World

Private couple's web app with a zero-dependency Node backend, file-based persistence, PBKDF2-protected login, and a dark purple multi-page UI.

## Tech stack

- **Runtime:** Node.js 18+ using built-in `http`, `fs`, and `crypto` modules (no runtime npm dependencies).
- **Persistence:** Atomic JSON store at the first writable directory in `DATA_DIR`, `DATA_PATH`, Render's `/var/data/ourworld` mount, or a local `./data` fallback. Point `DATA_DIR` to a persistent path (e.g., `/var/data/ourworld`) on Render; if that mount is unavailable or not writable the server logs a warning and automatically falls back to `./data/store.json` to stay online.
- **Auth:** PBKDF2 password verification salted with `SESSION_SECRET`, with HttpOnly cookies that become `Secure` in production.
- **Frontend:** Static HTML/CSS/JS served from `/public`, with responsive layouts and authenticated fetch calls to the API.

## Setup

No external npm packages are required, so installs succeed even in locked-down environments:

```bash
npm install  # installs nothing but records the lockfile
npm start
```

An empty `requirements.txt` is included to satisfy platforms that automatically run `pip install -r requirements.txt` during deploys; no Python dependencies are needed.

The server defaults to port **3000**. Sessions are HTTP-only cookies that last one week with `sameSite=lax`; when `NODE_ENV=production` (including Render) cookies are also marked `Secure` so they travel only over HTTPS.

### Environment variables

- `OURWORLD_PASSWORD` – required shared password (set it in the environment so it never appears in client code)
- `SESSION_SECRET` – salt used for PBKDF2 hashing and cookie secrets (set this to a long random value in Render)
- `PORT` – optional port override

## Features

- **Authentication**: `/api/session/login` uses PBKDF2-hashed passwords; `/api/session/logout` clears the session and cookie.
- **Health checks**: `/api/health` confirms storage availability.
- **Protected content**: All app pages (except `/login.html`) require an active session; missing or expired sessions redirect to the login page, and every data API (events, memories, blog, dates, special days, favorites) enforces authentication.
- **Home**: Add and view upcoming events via `/api/home/events` (auth required).
- **Memories**: Authenticated photo uploads with captions stored in `/uploads` with metadata in the local data store.
- **Blog**: Create and read posts through `/api/blog` (auth required).
- **Dates**: Manage date ideas and bucket-list items at `/api/dates`, `/api/dates/ideas`, and `/api/dates/bucket` (auth required).
- **Special Days**: Store milestones and countdowns through `/api/special-days` with achieved items separated once the date passes (auth required).
- **Weekly Picks**: Capture weekly favorite songs/movies via `/api/favorites` (auth required).
- **Mr. Bablu**: A sunflower-themed page that surfaces a new love quote on each visit.

## Deploying on Render

Use the included `render.yaml` so Render provisions a **Node** web service that runs `npm install` and starts the app with `node server.js`. A `.nvmrc` is checked in to pin Node **18** for consistent PBKDF2 behavior across deploys. Render health checks call `/api/health` (already configured in the manifest). To keep entries across redeploys, mount a persistent disk at `/var/data/ourworld` (already set as `DATA_DIR` in the manifest) so the JSON store survives restarts; if your Render environment blocks writes to that path, update `DATA_DIR` to the writable mount you provisioned. On boot the server logs the selected data directory, so you can confirm the mounted path is active (or see when it falls back to `./data`).

If you previously created the service as Python (because `requirements.txt` exists for compatibility), update the Render dashboard start command to `node server.js`—or keep it as `python server.py`, which delegates to the Node entrypoint. Set `OURWORLD_PASSWORD` and `SESSION_SECRET` in the dashboard. Once deployed, Render's public HTTPS URL is your shareable link.
