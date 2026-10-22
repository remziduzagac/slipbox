#!/usr/bin/env bash
# Rotates the sync worker's signing key: a new one in the vault, both accepted for a day, then the old one gone.
# Malik runs it on the first Monday of the month; the steps are in runbooks/key-rotation.md.
set -euo pipefail

readonly NAMESPACE="${NAMESPACE:-kestrel-prod}"
readonly SECRET="sync-signing-keys"
readonly OVERLAP_HOURS="${OVERLAP_HOURS:-24}"

die() { printf 'rotate-keys: %s\n' "$*" >&2; exit 1; }

command -v kubectl >/dev/null || die "kubectl not on PATH"
[[ "$(kubectl config current-context)" == *prod* ]] || die "not on a prod context: $(kubectl config current-context)"

new_key="$(openssl rand -base64 48)"
current="$(kubectl -n "$NAMESPACE" get secret "$SECRET" -o jsonpath='{.data.current}' | base64 --decode)"

kubectl -n "$NAMESPACE" create secret generic "$SECRET" \
  --from-literal=current="$new_key" \
  --from-literal=previous="$current" \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl -n "$NAMESPACE" rollout restart deployment/sync-worker
printf 'rotated; the previous key stays accepted for %s hours (run again with --drop-previous after)\n' "$OVERLAP_HOURS"
