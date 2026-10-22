#!/bin/sh
# slipbox's installer at a fixed address, on the repository's GitHub Pages site (GR-D14), made by scripts/bootstrap.ts
# with the repository and the site written in:
#
#   curl -fsSL @PAGES@/install.sh | sh                    # the latest release
#   curl -fsSL @PAGES@/install.sh | sh -s -- --preview    # the newest preview
#
# (On Alpine, without curl: wget -qO- @PAGES@/install.sh | sh.)
#
# It installs nothing itself. It reads the channel's file from the site — stable or preview, one line: a release's
# tag and the SHA-256 of that release's own install.sh — downloads that installer, checks its sum, and runs it with
# the arguments left and SLIPBOX_CHANNEL set, so the install follows that channel (GR-D15). The release's installer
# checks each pack against the sums written into it. Nothing runs as root.
#
# --preview, or SLIPBOX_CHANNEL=preview, picks previews; stable is the default. SLIPBOX_CHANNELS_URL reads the
# channels' files from elsewhere, and SLIPBOX_RELEASES_URL the releases, laid out as GitHub's are
# (<base>/download/<tag>/install.sh): a mirror, a test's folder.

set -eu

REPO="@REPO@"
PAGES="@PAGES@"

say() { printf 'slipbox: %s\n' "$*"; }
fail() {
  printf 'slipbox: %s\n' "$*" >&2
  exit 1
}

sha256() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | cut -d' ' -f1
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | cut -d' ' -f1
  else
    openssl dgst -sha256 "$1" | sed 's/^.*= *//'
  fi
}

# A download, https only (file: a mirror, a test's folder); `fetched_by` says which tool, for its exit codes.
fetched_by=""
fetch() {
  if command -v curl >/dev/null 2>&1; then
    fetched_by=curl
    curl --proto '=https,file' --proto-redir '=https' -fsSL -o "$2" "$1"
  elif command -v wget >/dev/null 2>&1; then
    fetched_by=wget
    wget -q -O "$2" "$1"
  else
    fail "needs curl or wget to download"
  fi
}

# Whether a download's failure was the file not being there: curl's HTTP error or missing file, GNU wget's error
# response. Busybox's wget says 1 for every failure.
not_there() {
  case "$fetched_by:$1" in
    curl:22 | curl:37 | wget:8) return 0 ;;
    *) return 1 ;;
  esac
}

tmp=""
cleanup() {
  if [ -n "$tmp" ] && [ -d "$tmp" ]; then rm -rf "$tmp"; fi
}

main() {
  channel=${SLIPBOX_CHANNEL:-stable}
  # --preview picks previews; every other argument goes to the release's installer, in order.
  n=$#
  while [ "$n" -gt 0 ]; do
    arg=$1
    shift
    n=$((n - 1))
    if [ "$arg" = --preview ]; then channel=preview; else set -- "$@" "$arg"; fi
  done
  case "$channel" in
    stable | preview) ;;
    *) fail "SLIPBOX_CHANNEL is stable or preview, not $channel" ;;
  esac

  pages=${SLIPBOX_CHANNELS_URL:-$PAGES}
  pages=${pages%/}
  releases=${SLIPBOX_RELEASES_URL:-https://github.com/$REPO/releases}
  releases=${releases%/}
  tmp=$(mktemp -d "${TMPDIR:-/tmp}/slipbox-bootstrap.XXXXXX")
  trap cleanup EXIT
  trap 'cleanup; exit 130' INT
  trap 'cleanup; exit 143' TERM

  # The channel's release: its tag, and its installer's sum. None when the channel has no release.
  status=0
  fetch "$pages/$channel" "$tmp/channel" 2>"$tmp/error" || status=$?
  if [ "$status" -ne 0 ]; then
    if not_there "$status"; then
      [ "$channel" = stable ] || fail "there's no preview now: the latest release installs without --preview"
      fail "there's no stable release yet: the newest preview installs with --preview" \
        "(curl -fsSL $PAGES/install.sh | sh -s -- --preview)"
    fi
    fail "couldn't download $pages/$channel: $(cat "$tmp/error")"
  fi
  # One line, `<tag> <sha256>`, the tag of the channel's own kind: it goes into an address.
  tag="" sum="" more=""
  read -r tag sum more <"$tmp/channel" || true
  form='^v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.]+)?$'
  [ "$channel" = stable ] || form='^preview-[0-9]{12}-[0-9a-f]{7}$'
  if ! printf '%s\n' "$tag" | grep -Eq "$form" || ! printf '%s\n' "$sum" | grep -Eq '^[0-9a-f]{64}$' ||
    [ -n "$more" ]; then
    fail "$pages/$channel isn't a channel's file (a release's tag and a SHA-256): nothing installed"
  fi

  say "the $channel channel's release: $tag"
  url="$releases/download/$tag/install.sh"
  fetch "$url" "$tmp/install.sh" 2>"$tmp/error" || fail "couldn't download $url: $(cat "$tmp/error")"
  got=$(sha256 "$tmp/install.sh")
  [ "$got" = "$sum" ] || fail "the installer's SHA-256 is $got, not the channel's $sum: nothing installed"
  SLIPBOX_CHANNEL=$channel sh "$tmp/install.sh" "$@"
}

main "$@"
