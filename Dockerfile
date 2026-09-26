# ── Stage 1: Build client ─────────────────────────────────────────────
FROM node:24-slim AS client-build
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# ── Stage 2: Build server ─────────────────────────────────────────────
FROM node:24-slim AS server-build
# openssl must be present *before* `prisma generate`: Prisma picks its query
# engine from the OpenSSL version it detects, and with no openssl binary it
# silently falls back to debian-openssl-1.1.x, which then fails to load in the
# runtime stage (openssl 3.x).
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci
COPY server/ ./
RUN npx prisma generate
RUN npm run build

# ── Stage 3: Production runtime ──────────────────────────────────────
FROM node:24-slim AS runtime
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy server production dependencies
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

# Copy built server
COPY --from=server-build /app/server/dist ./dist

# Copy Prisma schema, CLI config + generated client. `migrate deploy` reads
# the connection URL from prisma.config.ts, not from the schema.
COPY server/prisma ./prisma
COPY server/prisma.config.ts ./
COPY --from=server-build /app/server/node_modules/.prisma ./node_modules/.prisma
COPY --from=server-build /app/server/node_modules/@prisma ./node_modules/@prisma

# Copy built client into static/
COPY --from=client-build /app/client/dist ./static

# Create uploads directory
RUN mkdir -p /app/uploads

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Run migrations then start the server
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
