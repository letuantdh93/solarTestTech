#!/usr/bin/env bash
# Run Playwright E2E tests inside the official container against a running server (port 2112).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
V=$(node -p "require('$ROOT/node_modules/@playwright/test/package.json').version")
exec docker run --rm --network host --ipc=host -u "$(id -u):$(id -g)" -e HOME=/tmp -e CI=1 \
  -e BASE_URL="${BASE_URL:-http://127.0.0.1:2112}" -v "$ROOT:$ROOT" -w "$ROOT" \
  "mcr.microsoft.com/playwright:v$V-noble" npx playwright test "$@"
