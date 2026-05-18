#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

echo "==> Building client..."
cd "$ROOT_DIR/client"
npm ci
npm run build

echo "==> Copying client build to server/static..."
rm -rf "$ROOT_DIR/server/static"
cp -r "$ROOT_DIR/client/dist" "$ROOT_DIR/server/static"

echo "==> Building server..."
cd "$ROOT_DIR/server"
npm ci
npx prisma generate
npm run build

echo "==> Build complete!"
echo "    Run:  cd server && npm run start:prod"
