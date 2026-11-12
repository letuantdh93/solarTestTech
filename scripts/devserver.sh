#!/usr/bin/env bash
# Start/stop the API+SPA server in the background (PID file based).
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PIDF="$ROOT/.server.pid"
LOG="${SERVER_LOG:-/tmp/solar-exam-server.log}"
case "$1" in
  stop)
    if [[ -f "$PIDF" ]]; then kill "$(cat "$PIDF")" 2>/dev/null; rm -f "$PIDF"; fi
    for p in $(ss -ltnp 2>/dev/null | awk '/:2112 /{print $NF}' | grep -o 'pid=[0-9]*' | cut -d= -f2); do kill "$p" 2>/dev/null; done
    sleep 1 ;;
  start)
    "$0" stop
    cd "$ROOT/apps/server" && nohup node --import tsx --env-file=../../.env src/index.ts > "$LOG" 2>&1 &
    echo $! > "$PIDF"
    for i in $(seq 1 30); do curl -sf http://127.0.0.1:2112/api/health >/dev/null && { echo "server up (pid $(cat "$PIDF"))"; exit 0; }; sleep 0.5; done
    echo "server failed to start"; tail -20 "$LOG"; exit 1 ;;
esac
