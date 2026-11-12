#!/usr/bin/env bash
# Run a Playwright script inside the official image (no host browser deps needed).
# Usage: scripts/pw.sh scripts/shots.mjs <args...>
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
V=$(node -p "require('$ROOT/node_modules/@playwright/test/package.json').version")
OUT_MOUNT=()
[[ -n "${SHOT_DIR:-}" ]] && OUT_MOUNT=(-v "$SHOT_DIR:$SHOT_DIR")
exec docker run --rm --network host --ipc=host -u "$(id -u):$(id -g)" -e HOME=/tmp \
  -e BASE_URL="${BASE_URL:-http://127.0.0.1:2112}" -v "$ROOT:$ROOT" "${OUT_MOUNT[@]}" -w "$ROOT" \
  "mcr.microsoft.com/playwright:v$V-noble" node "$@"
