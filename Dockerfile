# ── Stage 1: Build client ─────────────────────────────────────────────
FROM node:22-alpine AS client-build
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# ── Stage 2: Build server ─────────────────────────────────────────────
FROM node:22-alpine AS server-build
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci
COPY server/ ./
RUN npx prisma generate
RUN npm run build

# ── Stage 3: Production runtime ──────────────────────────────────────
FROM node:22-slim AS runtime
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy server production dependencies
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

# Copy built server
COPY --from=server-build /app/server/dist ./dist

# Copy Prisma schema + generated client
COPY server/prisma ./prisma
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
CMD ["sh", "-c", "npx prisma migrate deploy --schema=./prisma/schema.prisma && node dist/main.js"]
