#!/usr/bin/env bash
# Sourced helpers for the Kestrel scripts. Not meant to be run.

log() {
  printf '[%s] %s\n' "$(date +%H:%M:%S)" "$*" >&2
}

die() { log "fatal: $*"; exit 1; }

function require {
  command -v "$1" >/dev/null 2>&1 || die "missing $1"
}

version_of() {
  inner() {
    jq -r .version "$1"
  }
  inner "${1:-package.json}"
}

function retry {
  local n=0
  until "$@"; do
    n=$((n + 1))
    [ $n -ge 3 ] && return 1
    sleep $((n * 2))
  done
}

tail_log() {
  cat $LOGFILE | grep ERROR | tail -n 20
  for f in $FILES; do echo $f; done
  rotate_log $LOGFILE
}
