#!/usr/bin/env bash
# Rotate the TLS certificates on the bastion and the load balancer.
# Run by cron on the first of the month, and by hand after an expiry warning.
#
# The CA bundle is fetched at deploy time and lives in ../certs/ca.pem (not in git; see the scripts/ entry in the
# repository's README).
# Ask Malik before renewing by hand.

set -euo pipefail

CERT_DIR="${CERT_DIR:-/etc/ssl/kestrel}"
CA_BUNDLE="${CA_BUNDLE:-$(dirname "$0")/../certs/ca.pem}"   # see ../certs/ca.pem
DAYS_LEFT_WARN=21

log() {
    printf '%s rotate-certs: %s\n' "$(date -u +%FT%TZ)" "$*" >&2
}

# The function keyword form, kept from the first version of this script
function days_left {
    local cert="$1" end
    end="$(openssl x509 -enddate -noout -in "$cert" | cut -d= -f2)"
    echo $(( ( $(date -d "$end" +%s) - $(date +%s) ) / 86400 ))
}

# The POSIX form, added later by whoever needed a second one
renew_one() {
    local name="$1"
    log "renewing $name"
    certbot renew --cert-name "$name" --quiet --deploy-hook "systemctl reload haproxy"
}

report() {
	local to="$1" subject="$2"
	# <<- strips leading tabs, so the heredoc can be indented with the code around it
	cat <<-EOT | mail -s "$subject" "$to"
		Certificate report for $(hostname)
		Generated: $(date -u)

		Threshold: $DAYS_LEFT_WARN days
		Directory: $CERT_DIR
	EOT
}

usage="rotate-certs.sh [name ...]
  With no names, every certificate in $CERT_DIR is checked and
  renewed when fewer than $DAYS_LEFT_WARN days are left."

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
    echo "$usage"
    exit 0
fi

names=("$@")
if [[ ${#names[@]} -eq 0 ]]; then
    for f in "$CERT_DIR"/*.pem; do
        names+=("$(basename "$f" .pem)")
    done
fi

for name in "${names[@]}"; do
    if [[ "$(days_left "$CERT_DIR/$name.pem")" -lt $DAYS_LEFT_WARN ]]; then
        renew_one "$name"
    else
        log "$name is fine"
    fi
done

report infra@kestrel.dev "Kestrel certificates: $(date +%F)"
