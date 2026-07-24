# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Zaindari is a self-hosted, multi-user plant care scheduler: a NestJS + Prisma/PostgreSQL API and an installable Vue 3 PWA that consumes it. `REQUIREMENTS.md` is the product spec (it is the source of truth for intended behaviour); `FUTURE_DEVELOPMENTS.md` lists deliberately out-of-scope work.

## Repo layout

Two **independent** npm projects — there is no root `package.json` and no workspaces. Always `cd server` or `cd client` before running npm.

## Commands

### Server (`cd server`)
```bash
npm run start:dev              # watch mode (port 3000)
npm run build                  # nest build → dist/
npm run lint                   # eslint --fix (also applies prettier)
npm test                       # vitest run — all *.spec.ts
npx vitest run src/tasks/tasks.service.spec.ts        # single file
npx vitest run -t "revokes the family"               # single test by name
npm run test:cov               # coverage (v8)

npx prisma generate                        # after any schema.prisma change
npx prisma migrate dev --name <desc>       # author a migration locally
npx prisma migrate deploy                  # apply (what the container runs on boot)
```
Needs `DATABASE_URL`; the easiest local database is `docker compose up postgres`.

### Client (`cd client`)
```bash
npm run dev                    # vite on :5173, proxies /api → localhost:3000
npm run build                  # vue-tsc -b (typecheck) + vite build
npm test                       # vitest run — src/**/*.test.ts (happy-dom)
npx vitest run src/views/__tests__/TasksView.test.ts
```
There is no linter in the client; `vue-tsc -b` via `npm run build` is the only static check.

### Full stack
```bash
cp .env.example .env && docker compose up --build    # app + postgres
./scripts/build.sh                                   # non-Docker prod build (client dist → server/static)
```

## Architecture

### One process serves both halves
In production `server/src/main.ts` serves `./static` (the built client) plus an SPA fallback for every path that is not `/api/*` or `/uploads/*`. The Dockerfile builds the client in its own stage and copies `client/dist` → `/app/static`. So there is no separate web server, and client routes must never collide with `/api` or `/uploads`.

### Auth: split access/refresh
- **Access token**: short-lived JWT (15m default) in `localStorage`, sent as `Authorization: Bearer`.
- **Refresh token**: opaque 256-bit random value in an httpOnly cookie scoped to path `/api/auth`, stored server-side only as a SHA-256 hash (`RefreshToken` table). Rotated on every use with sliding expiry; presenting an already-consumed token is treated as theft and revokes the whole token *family* (`refresh-token.service.ts`).
- `client/src/api/client.ts` single-flights the refresh: parallel 401s must not each attempt a rotation, or the second one trips reuse detection and kills the session it was rescuing. It also distinguishes `NetworkError` from `ApiError` — an unreachable server must not be mistaken for an expired session.
- `ZAINDARI_COOKIE_SECURE=auto` mirrors the request protocol so plain-HTTP LAN deployments still work; see `session-cookie.ts`.

### Authorization is layered, and one layer does not cover everything
`JwtAuthGuard` → `PlantAccessGuard` (owner-or-shared, reads `request.params.id`) → an explicit `plant.ownerId !== user.id` check in the controller for owner-only mutations (update/delete). Endpoints with **no `:id` plant param** — `GET /api/images/:imageId`, the cross-plant task queries — cannot use `PlantAccessGuard` and re-implement the owner-or-shared rule inside the service (`ImagesService.serve`, `TasksService.getTasksForUser`). New cross-plant endpoints must do the same.

### Task lifecycle: two creators, one invariant
The invariant is **at most one `pending`/`snoozed` task per (plant, taskType)**. Two code paths create tasks and both depend on it:
- `TasksService.complete()` / `.skip()` create the next task immediately (`now + intervalDays`), and `.undo()` deletes that follow-up again.
- `SchedulerService.createDueTasks` (`@Cron('* * * * *')`) is the gap-filler: it un-snoozes due snoozes, then creates a task only when nothing pending/snoozed exists and the interval has elapsed since the last done/skipped one.

Overdue tasks intentionally stay `pending` rather than rolling forward. When changing either path, check the other.

### Creating a task and notifying about it are separate events
A task becomes `pending` the moment its interval elapses — which is the clock time of the last completion, so it lands at arbitrary hours. The push waits. `SchedulerService.dispatchNotifications` runs as the second phase of the same tick and asks `shouldNotifyNow` (`tasks/notification-window.ts`, pure) whether each reminder is due yet.

The gate anchors on `max(createdAt, dueAt)` and fires at the first occurrence of the recipient's time at or after it. Both halves matter, one per creator: `SchedulerService` backdates `dueAt` to an hour that may already be past, so `createdAt` is when the task became real; `TasksService` creates the follow-up immediately with a `dueAt` one interval out, so anchoring on `createdAt` would push days early. A task that appears after today's time has passed waits for tomorrow rather than firing that evening.

**Reminders are per person, not per task.** Collaborators on a shared plant can be due at different times, so "already notified" is a fact about a pair: `TaskNotification(taskId, userId)`, written whether or not the push succeeded (at-most-once — a dead endpoint must not retry every minute forever). Any new notification path needs its own latch row; a boolean on `Task` cannot express this.

### Schedule resolution
Intervals resolve in exactly one place — `SchedulesService.getMergedSchedules(plantId)`: hardcoded `DEFAULTS` in `schedules.service.ts` → `DefaultSchedule` rows (upserted on `onModuleInit`) → per-plant `PlantSchedule` override (which alone can be `enabled: false`). Anything that needs an interval should call `getMergedSchedules`, not read the tables.

**The reminder time is not part of that merge**, because it depends on who is being reminded. `getMergedSchedules` returns `hour: null` unless the plant pins one; `resolveNotificationTime(plantOverride, userTimes, taskType)` answers the per-recipient question: a time pinned on the plant wins outright (the owner has decided this plant is watered at 07:00) → the user's `UserNotificationTime` row for that task type → their `User.notificationHour` base → 09:00.

`dueAt` is a different thing again: it is one shared fact about a task, so it cannot follow any individual's preference and falls back to `DEFAULT_DUE_TIME` when the plant pins nothing.

**All due-date math uses `setUTCDate`/`setUTCHours`**, so every hour/minute above is UTC regardless of the `TZ` env var.

### Configuration lives in three places
- **Env-only** (`common/config/configuration.ts`, read via `ConfigService`): port, `DATABASE_URL`, JWT settings, cookie mode, `signup.enabled`, `TZ`.
- **Database-backed**, editable in the admin UI: the `AppConfig` key/value table (the VAPID keypair is generated into it on first boot) and the single `OidcConfig` row (client secret is masked as `********` on read; sending that value back leaves it unchanged). Admin-editable schedules carry the interval only.
- **Per user**, under `/api/me`: `locale`, and the reminder times (`User.notificationHour`/`Minute` plus `UserNotificationTime` rows), edited in `SettingsView.vue`. Anything a user should be able to differ on belongs here rather than in `AppConfig` — a shared plant means two accounts can want different answers from the same row of data.

### Images
Uploaded through multer *memory* storage with a 10 MB `limits.fileSize` cap (the cap must stay in `image-upload.options.ts` — a pipe validator would run only after the file was fully buffered), re-encoded by sharp to WebP at ≤1200px into `uploads/<plantId>/`. Replacing a photo flips the old row's `isCurrent` to false instead of deleting it — the spec requires photo history. Files are served by the authenticated `GET /api/images/:imageId`, so the client cannot use a plain `<img src>`; it fetches blobs and hands over object URLs (`AuthedImage.vue`, `useAuthedImage.ts`).

### Internationalization: the client owns all wording
Three locales (`en` the source and fallback, `es`, `eu`), all bundled eagerly — a lazy locale chunk that misses the Workbox precache would render an offline app untranslated.

The user's locale lives on `User.locale`, read from `GET /api/me` and written by `PATCH /api/me` (validated against `SUPPORTED_LOCALES`; never stored as free text). `stores/auth.ts` adopts it on `persistSession`, so the account is the authority; `localStorage` only answers "what language is the login screen in?" before anyone is signed in, and survives logout on purpose.

**The server translates exactly one thing: push notification bodies** (`server/src/i18n/messages.ts`), because a notification is the one string the client never gets to render. `SchedulerService.dispatchNotifications` therefore renders the body once per recipient, inside the loop that already walks them one at a time for their own reminder times — a shared plant's collaborators can read different languages. `PushService.sendNotification` takes a finished payload for one user and knows nothing about plants.

**Everything else is an error code.** Server exceptions carry `apiError(ERROR_CODES.x, 'English for logs')` (`common/errors/api-error.ts`); `useApiError()` on the client turns the code into a sentence. Adding a code without an `errors.*` key in the catalogs is caught by `client/src/locales/__tests__/locales.test.ts`, which also enforces key parity, placeholder parity and plural-form parity across the three files.

`utils/date.ts` and `utils/agenda.ts` stay pure and return keys/descriptors (`{ kind: 'today' }`, `{ key, count }`) rather than prose — `composables/useTaskLabels.ts` is the only place that renders them. Don't pass `t` into those modules; it's what keeps their specs free of an i18n instance. Client tests mount with `createTestI18n()` from `src/test/i18n.ts`, which loads the real English catalog so assertions still read as English.

Sentences are translated whole, never assembled from fragments: Basque puts the object before the verb and Spanish doesn't inflect verbs by number the way English does, so `"task" + (n === 1 ? '' : 's')` cannot be translated at all.

### Service worker (hand-written)
`vite-plugin-pwa` runs in `injectManifest` mode against `client/src/sw.ts`, so nothing is generated for you — `skipWaiting()`/`clientsClaim()` and the navigation fallback are explicit, and omitting them leaves stale shells serving old builds. Two rules matter: `/api/auth/*` and `/api/me` are `NetworkOnly` (a cached identity would resurrect the previous user), and other `/api/` responses are `NetworkFirst` keyed per account by folding the JWT `sub` into the cache key (`sw-cache-key.ts`) because Workbox otherwise keys by URL alone. The `/api/me` test is an exact path match, so sub-paths like `/api/me/notification-times` deliberately fall into the `NetworkFirst` bucket — safe because of the per-account key, but check that reasoning still holds before adding an identity-shaped route under `/api/me`. Logout posts `CLEAR_API_CACHE`.

## Conventions

- **Server imports need explicit `.js` extensions** (`./foo.service.js`) even though sources are `.ts` — tsconfig is `nodenext`.
- Tests are colocated: server `*.spec.ts` next to the source, client `__tests__/*.test.ts`. Server specs build a `Test.createTestingModule` with a hand-rolled `vi.fn()` mock in place of `PrismaService` — no test database. Client tests mount components with `@vue/test-utils` and `vi.mock` the `src/api/*` module.
- Prettier settings differ per project: server uses semicolons, client does not. Match the file you are in.
- Prisma models are camelCase in TS and snake_case in Postgres via `@map`/`@@map`; keep that when adding fields.
- Commit messages are sentence-case imperative with no prefix or scope (e.g. "Stop the service worker serving a stale app shell on /").
- The `server/README.md` and `client/README.md` are untouched framework boilerplate — ignore them (`npm run test:e2e` mentioned there does not exist).
