# syntax=docker/dockerfile:1

# ── Base: node + openssl ─────────────────────────────────────────────
# openssl must be present *before* `prisma generate`: Prisma picks its query
# engine from the OpenSSL version it detects, and with no openssl binary it
# silently falls back to debian-openssl-1.1.x, which then fails to load in the
# runtime stage (openssl 3.x). Every stage that generates or runs Prisma
# derives from this one so they all agree on what they detect.
FROM node:24-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

# ── Stage 1: Build client ─────────────────────────────────────────────
FROM node:24-slim AS client-build
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
# The npm cache lives in a BuildKit cache mount, not a layer: it speeds up
# reinstalls after a lockfile change and never ends up in an image.
RUN --mount=type=cache,target=/root/.npm npm ci
COPY client/ ./
RUN npm run build

# ── Stage 2: Build server ─────────────────────────────────────────────
FROM base AS server-build
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
# Generate from the schema alone, before the sources arrive, so editing a
# .ts file does not re-run `prisma generate`.
COPY server/prisma ./prisma
COPY server/prisma.config.ts ./
RUN npx prisma generate
COPY server/ ./
RUN npm run build

# ── Stage 3: Production dependencies ─────────────────────────────────
# Built in its own stage (in parallel with the two above) and copied into the
# runtime whole.
#
# The Prisma CLI is a devDependency — migrations run through dist/migrate.js —
# but `--omit=dev` alone does not remove it: @prisma/client lists it as an
# optional peer, so npm marks it and its whole tree (Studio, a bundled
# TypeScript, the schema engine; ~250 MB) `devOptional` and installs it
# anyway. The lockfile's `devOptional` flag names exactly that tree, so delete
# it by that flag, then prove the native modules the app does need survived:
# nothing in CI boots the image, so a wrong prune would otherwise first show
# up as a crash on someone's server.
FROM node:24-slim AS server-deps
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev
RUN node -e "const fs = require('fs'); \
      for (const [path, pkg] of Object.entries(require('./package-lock.json').packages)) \
        if (path && pkg.devOptional) fs.rmSync(path, { recursive: true, force: true });" \
    && node -e "require('sharp'); require('bcrypt'); require('pg'); require('@prisma/adapter-pg')" \
    && test ! -e node_modules/prisma

# ── Stage 4: Production runtime ──────────────────────────────────────
FROM base AS runtime
# tini runs as PID 1. The kernel drops any signal PID 1 has not installed a
# handler for, and Nest's shutdown hooks re-raise SIGTERM on the process once
# cleanup is done, so node itself must not be PID 1 or that final signal is
# ignored and `docker stop` waits out its timeout before a SIGKILL.
RUN apt-get update && apt-get install -y --no-install-recommends tini \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY --from=server-deps /app/node_modules ./node_modules
COPY server/package.json ./

# The generated client comes from the build stage, the only one with the CLI
# to generate it. It is derived from the schema alone, so it is the same file
# whichever install produced it.
COPY --from=server-build /app/server/node_modules/.prisma ./node_modules/.prisma

# dist/migrate.js applies these on boot; the schema itself is not needed.
COPY server/prisma/migrations ./prisma/migrations

# Most-often-changing layers last.
COPY --from=server-build /app/server/dist ./dist
COPY --from=client-build /app/client/dist ./static

# Create uploads directory
RUN mkdir -p /app/uploads

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

ENTRYPOINT ["/usr/bin/tini", "--"]

# Run migrations then start the server. `exec` replaces the shell with node,
# so the SIGTERM tini forwards reaches the app rather than a shell that
# neither handles nor passes it on.
CMD ["sh", "-c", "node dist/migrate.js && exec node dist/main.js"]
