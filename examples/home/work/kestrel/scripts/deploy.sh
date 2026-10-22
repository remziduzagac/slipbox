#!/usr/bin/env bash
# Deploy Kestrel to an environment. Steps and rollback: /docs/runbooks/deploy.md
# Shared helpers: ./lib.sh
set -euo pipefail

source "$(dirname "$0")/lib.sh"

function usage() {
  cat <<EOF
usage: deploy.sh <env> [--dry-run]
  env: staging | production
Reads the version from ${VERSION_FILE:-package.json}; see https://kestrel.example/runbooks/deploy
EOF
}

function notify {
  local msg="$1"
  curl -s -X POST -H 'Content-Type: application/json' \
    -d "{\"text\": \"$msg\"}" "${SLACK_HOOK:-http://localhost:9/none}" >/dev/null || true
}

cleanup() {
  rm -f "${TMPDIR:-/tmp}/kestrel-deploy.$$"
}
trap cleanup EXIT
trap 'echo "interrupted"; exit 130' INT

env_name="${1:-}"
[[ -z "$env_name" ]] && { usage; exit 2; }

case "$env_name" in
  staging)    target="kestrel-stg" ;;
  production) target="kestrel-prod" ;;
  *)          echo "unknown env: $env_name" >&2; exit 2 ;;
esac

if [[ "$env_name" == "production" && "${2:-}" != "--dry-run" ]]; then
  read -r -p "deploy to production? [y/N] " yn
  [[ "$yn" == [yY] ]] || exit 1
fi

version=$(jq -r .version package.json)
cat <<'EOF'
Deploy $version to # kestrel-ops: see `kubectl rollout status`
EOF

# sanity: target name has kestrel in it
grep -c kestrel <<< "$target"

log "deploying $version to $target"
kubectl --context "$target" set image deploy/api api="ghcr.io/kestrel-labs/api:$version"
notify "kestrel $version is on $env_name"
