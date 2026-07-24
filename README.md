# Zaindari

A self-hosted, multi-user plant care scheduler. Zaindari tracks watering, fertilization,
misting and repotting for every plant in your home, reminds the right person at the hour
*they* asked to be reminded, and lets housemates share a plant so either of them can mark
it done.

It ships as a single Docker image: a NestJS API that also serves the built Vue PWA, plus a
Postgres container. There is no separate web server to configure.

## Features

- **Four task types** — watering, fertilization, misting, repotting, on per-plant or global
  intervals (defaults: 3 / 30 / 2 / 365 days).
- **Plants with photo history** — name, location, free-text instructions and a picture you
  can take straight from a phone camera. Replacing a photo keeps the old one.
- **Task lifecycle** — complete, skip with a reason, snooze, or undo. Overdue tasks stay
  pending rather than silently rolling forward.
- **Sharing** — invite another account to a plant and its tasks are shared too.
- **Web push reminders** — delivered per person, in each recipient's own language, at each
  recipient's own preferred time.
- **Installable PWA** — responsive, offline-capable app shell, installable on mobile.
- **Three languages** — English, Spanish and Basque, stored on the account so the choice
  follows the user across devices.
- **OIDC or local accounts** — signup can be disabled by the admin.

## Quick start (Docker)

```bash
cp .env.example .env
# edit .env — at minimum set DB_PASSWORD and JWT_SECRET
docker compose up --build
```

The app is on <http://localhost:3000>. Migrations run automatically on boot, and a VAPID
keypair for push notifications is generated into the database on first start.

Generate a real JWT secret with `openssl rand -base64 48`. Keep it stable across upgrades —
changing it invalidates every issued access token.

### Creating the first admin

Only an admin can appoint another admin, so a fresh install needs one bootstrap step. Set
the username you are about to claim **before** creating the account:

```bash
ZAINDARI_ADMIN_USERNAME=your-username
```

Then register through the web UI (or sign in through OIDC) with that username, and the
account is created with admin rights. The match ignores casing and surrounding whitespace.

This applies at account creation only — setting it later does not promote an account that
already exists, and clearing it does not demote one. Once you are set up, the admin panel is
the authority: use it to appoint and demote everyone else, including the bootstrap account.

If you already registered before setting the variable, promote that account directly
instead:

```bash
docker compose exec postgres \
  psql -U zaindari -d zaindari \
  -c "UPDATE users SET is_admin = true WHERE username = 'your-username';"
```

Either way, sign out and back in afterwards — the flag is read when the token is issued.

## Configuration

Settings live in three places, by design:

| Where | What | Edited how |
| --- | --- | --- |
| Environment | port, `DATABASE_URL`, JWT settings, cookie mode, signup toggle, bootstrap admin, `TZ` | `.env` |
| Database (`AppConfig`, `OidcConfig`) | VAPID keys, OIDC provider, default schedule intervals | admin panel |
| Per user | locale, reminder times | Settings screen |

See `.env.example` for the annotated environment variables. Anything a user should be able
to differ on lives on the account rather than in global config — a shared plant means two
people can legitimately want different answers from the same row of data.

`ZAINDARI_COOKIE_SECURE=auto` mirrors the request protocol, so plain-HTTP access over a LAN
keeps working. Set it to `true` if TLS is terminated by a proxy that doesn't forward
`X-Forwarded-Proto`.

> **Note on time:** all due-date and reminder math is done in UTC. `TZ` affects logs, not
> when a reminder fires — an hour configured as 09:00 means 09:00 UTC.

## Development

Two **independent** npm projects. There is no root `package.json` and no workspaces, so
`cd` into one first.

```bash
docker compose up postgres      # easiest local database

cd server
npm install
npx prisma generate
npm run start:dev               # watch mode, port 3000

cd client
npm install
npm run dev                     # vite on :5173, proxies /api → localhost:3000
```

The server needs `DATABASE_URL` in its environment.

### Tests

```bash
cd server && npm test           # vitest — *.spec.ts colocated with sources
cd client && npm test           # vitest + happy-dom — src/**/__tests__/*.test.ts
```

Server specs mock `PrismaService` with hand-rolled `vi.fn()`s, so no test database is
needed. CI runs both suites plus `npm run lint:check` (server) and a Docker image build.

### Other commands

```bash
cd server && npm run lint                        # eslint --fix, applies prettier
cd server && npx prisma migrate dev --name <desc> # author a migration
cd client && npm run build                       # vue-tsc typecheck + vite build
./scripts/build.sh                               # non-Docker prod build
```

There is no linter in the client; `vue-tsc -b` via `npm run build` is the only static check.

## Architecture

```
client/  Vue 3 + Vite + Pinia + vue-i18n, hand-written service worker
server/  NestJS 11 + Prisma 6 + PostgreSQL 17, serves ./static in production
```

A few things that are easy to get wrong and worth knowing before you change them:

- **One process serves both halves.** In production the server serves the built client plus
  an SPA fallback for every path that isn't `/api/*` or `/uploads/*`, so client routes must
  never collide with those prefixes.
- **Split access/refresh auth.** Short-lived JWT in `localStorage`; an opaque refresh token
  in an httpOnly cookie scoped to `/api/auth`, stored only as a SHA-256 hash and rotated on
  every use. Replaying a consumed token is treated as theft and revokes the whole token
  family. The client single-flights refreshes so parallel 401s can't trip that detection.
- **Authorization is layered.** `JwtAuthGuard` → `PlantAccessGuard` → an explicit owner
  check for owner-only mutations. Endpoints with no `:id` plant param can't use the guard
  and re-implement the owner-or-shared rule in the service.
- **Two things create tasks** — completing one, and the every-minute scheduler that fills
  gaps — sharing the invariant that a (plant, taskType) pair has at most one pending or
  snoozed task. Change one path, check the other.
- **Creating a task and notifying about it are separate events.** A task becomes pending
  the moment its interval elapses, at whatever clock time that lands on; the push waits for
  the recipient's configured hour. "Already notified" is a fact about a (task, user) pair,
  not a boolean on the task, because collaborators are due at different times.
- **The client owns all wording.** The server translates exactly one thing — push
  notification bodies — because that's the one string the client never renders. Everything
  else crosses the wire as an error code.

`CLAUDE.md` goes into all of this in depth. `REQUIREMENTS.md` is the product spec and the
source of truth for intended behaviour; `FUTURE_DEVELOPMENTS.md` lists deliberately
out-of-scope work.
