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
# runtime whole, generated client included, so the runtime never overlays
# dev-install Prisma packages on top of a prod install.
FROM base AS server-deps
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev
COPY server/prisma ./prisma
COPY server/prisma.config.ts ./
RUN npx prisma generate

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

# Prisma schema + CLI config. `migrate deploy` reads the connection URL from
# prisma.config.ts, not from the schema.
COPY server/prisma ./prisma
COPY server/prisma.config.ts ./

# Most-often-changing layers last.
COPY --from=server-build /app/server/dist ./dist
COPY --from=client-build /app/client/dist ./static

# Create uploads directory
RUN mkdir -p /app/uploads

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

ENTRYPOINT ["/usr/bin/tini", "--"]

# Drops root to PUID:PGID (default 1000:1000) before the app starts; see the
# script for how it treats volumes left root-owned by earlier versions.
COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
ENTRYPOINT ["/usr/bin/tini", "--", "docker-entrypoint.sh"]

# Prisma's update check writes under $HOME, which the unprivileged user
# cannot write to.
ENV CHECKPOINT_DISABLE=1

# Run migrations then start the server. `exec` replaces the shell with node,
# so the SIGTERM tini forwards reaches the app rather than a shell that
# neither handles nor passes it on. The prisma binary is called directly
# because npx wants a writable npm cache in $HOME.
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && exec node dist/main.js"]
