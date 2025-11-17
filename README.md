# Our World

Private couple's web app with a zero-dependency Node backend, file-based persistence, PBKDF2-protected login, and a dark purple multi-page UI.

## Setup

No external npm packages are required, so installs succeed even in locked-down environments:

```bash
npm install  # installs nothing but records the lockfile
npm start
```

The server defaults to port **3000**. Sessions are HTTP-only cookies that last one week with `sameSite=lax` and are validated entirely in-process.

### Environment variables

- `OURWORLD_PASSWORD` – shared password (defaults to `starlight`)
- `PORT` – optional port override
- `OURWORLD_PASSWORD` remains the shared secret (PBKDF2-hashed at runtime)

## Features

- **Authentication**: `/api/session/login` uses PBKDF2-hashed passwords; `/api/session/logout` clears the session and cookie.
- **Health checks**: `/api/health` confirms storage availability.
- **Protected content**: Memories, blog posts, date planners, special days, notes, and Fun Zone voting require an active session. Protected pages redirect to `index.html` when the session is missing.
- **Home**: Add and view upcoming events via `/api/home/events`.
- **Memories**: Authenticated photo uploads stored in `/uploads` with metadata in the local data store.
- **Blog**: Create and read posts through `/api/blog`.
- **Dates**: Manage date ideas and bucket-list items at `/api/dates`, `/api/dates/ideas`, and `/api/dates/bucket`.
- **Special Days**: Store milestones and countdowns through `/api/special-days`.
- **Notes**: Authenticated love notes with newest-first ordering via `/api/notes`.
- **Fun Zone**: Wheel ideas, quiz Q&A, and polls with voting at `/api/fun` and `/api/fun/polls/:id/vote`.

## Deploying on Render

The included `render.yaml` configures a Node 18 web service that runs `npm install` (no downloads needed) and `node server.js`. Set `OURWORLD_PASSWORD` in the dashboard. Once deployed, Render's public HTTPS URL is your shareable link.
