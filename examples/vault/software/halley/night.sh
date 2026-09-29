#!/usr/bin/env bash
# Start and stop a night of halley: what the cookbook's "Start and stop a night" runs.
# See software/pipeline-cookbook.md and reduce.py for the reduction itself.
set -euo pipefail

ROOT=/srv/raw/$(date +%F)

start_night() {
  mkdir -p "$ROOT"
  cat <<NOTE > "$ROOT/README"
Raw frames for $(date +%F).
# not a comment: this is a heredoc
NOTE
  halley watch "$ROOT" &
}

stop_night() {
  pkill -f "halley watch" || true
  python3 "$(dirname "$0")/reduce.py"
}

case "${1:-}" in
  start) start_night ;;
  stop) stop_night ;;
  *) echo "usage: night.sh start|stop" >&2; exit 2 ;;
esac
