#!/bin/sh
# slipbox's installer (plan 14.7), made for one release by scripts/release.ts: its version, the repository it's from,
# and each pack's SHA-256 are written in below, so a pack that isn't the one released is refused.
#
#   curl -fsSL https://github.com/@REPO@/releases/latest/download/install.sh | sh
#
# (On Alpine, without curl: wget -qO- …/install.sh | sh.)
#
# It installs into slipbox's data folder — ${XDG_DATA_HOME:-~/.local/share}/slipbox: versions/<version>/, and current,
# a link to the version in use — and links ${SLIPBOX_BIN_DIR:-~/.local/bin}/slipbox to it. Nothing runs as root, and
# nothing outside those two places is touched. `slipbox upgrade` installs a later one the same way; `slipbox
# uninstall` lists every path before it removes anything.
#
# SLIPBOX_RELEASES_URL fetches the packs from elsewhere laid out as GitHub's releases are (a mirror, a test's folder):
# <base>/download/v<version>/<pack>. Their sums are still these.

set -eu

VERSION="@VERSION@"
REPO="@REPO@"

# Each pack's SHA-256, by platform.
sum_of() {
  case "$1" in
@SUMS@
    *) return 1 ;;
  esac
}

say() { printf 'slipbox: %s\n' "$*"; }
fail() {
  printf 'slipbox: %s\n' "$*" >&2
  exit 1
}

# This machine, as the packs are named.
target() {
  case "$(uname -s)" in
    Darwin) os=darwin ;;
    Linux) os=linux ;;
    *) fail "no release for $(uname -s) yet: macOS and Linux (Windows is to come)" ;;
  esac
  case "$(uname -m)" in
    x86_64 | amd64) arch=x64 ;;
    arm64 | aarch64) arch=arm64 ;;
    *) fail "no release for $(uname -m) processors: x64 and arm64" ;;
  esac
  # A terminal under Rosetta says x64 on an Apple processor: the arm64 build is the one to run.
  if [ "$os" = darwin ] && [ "$arch" = x64 ] && [ "$(sysctl -n sysctl.proc_translated 2>/dev/null || true)" = 1 ]; then
    arch=arm64
  fi
  # Linux whose C library is musl (Alpine): its own build.
  libc=""
  if [ "$os" = linux ] && { ls /lib/ld-musl-* >/dev/null 2>&1 || ldd --version 2>&1 | grep -qi musl; }; then
    libc=-musl
  fi
  echo "$os-$arch$libc"
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

fetch() {
  if command -v curl >/dev/null 2>&1; then
    curl --proto '=https,file' --proto-redir '=https' -fsSL -o "$2" "$1"
  elif command -v wget >/dev/null 2>&1; then
    wget -q -O "$2" "$1"
  else
    fail "needs curl or wget to download"
  fi
}

tmp=""
cleanup() {
  if [ -n "$tmp" ] && [ -d "$tmp" ]; then rm -rf "$tmp"; fi
}

# An absolute path, as XDG asks; else the default.
absolute_or() {
  case "${1:-}" in
    /*) echo "$1" ;;
    *) echo "$2" ;;
  esac
}

main() {
  [ -n "${HOME:-}" ] || fail "HOME isn't set"
  plat=$(target)
  want=$(sum_of "$plat") || fail "this release ($VERSION) has no $plat build"
  data="$(absolute_or "${XDG_DATA_HOME:-}" "$HOME/.local/share")/slipbox"
  bin_dir=$(absolute_or "${SLIPBOX_BIN_DIR:-}" "$HOME/.local/bin")
  link="$bin_dir/slipbox"

  # A slipbox there already that isn't this installer's — a launcher, another install — is left as it is, and said.
  if [ -e "$link" ] || [ -L "$link" ]; then
    if [ ! -L "$link" ] || [ "$(readlink "$link")" != "$data/current/slipbox" ]; then
      fail "$link is there already, and isn't this installer's: remove it (or set SLIPBOX_BIN_DIR), then run this again"
    fi
  fi

  name="slipbox-$VERSION-$plat"
  base="${SLIPBOX_RELEASES_URL:-https://github.com/$REPO/releases}/download"
  tmp=$(mktemp -d "${TMPDIR:-/tmp}/slipbox-install.XXXXXX")
  trap cleanup EXIT
  trap 'cleanup; exit 130' INT
  trap 'cleanup; exit 143' TERM

  say "downloading $name"
  fetch "$base/v$VERSION/$name.tar.gz" "$tmp/pack.tar.gz" || fail "couldn't download $base/v$VERSION/$name.tar.gz"
  got=$(sha256 "$tmp/pack.tar.gz")
  [ "$got" = "$want" ] || fail "the download's SHA-256 is $got, not the release's $want: nothing installed"
  tar -xzf "$tmp/pack.tar.gz" -C "$tmp"
  [ -x "$tmp/$name/slipbox" ] || fail "the pack has no slipbox in it: nothing installed"
  said=$("$tmp/$name/slipbox" --version 2>&1) || fail "the binary doesn't run here: $said"
  [ "$said" = "slipbox $VERSION" ] || fail "the binary says \"$said\", not \"slipbox $VERSION\": nothing installed"

  mkdir -p "$data/versions" "$bin_dir"
  rm -rf "$data/versions/$VERSION.new"
  mv "$tmp/$name" "$data/versions/$VERSION.new"
  if [ -d "$data/versions/$VERSION" ]; then rm -rf "$data/versions/$VERSION"; fi
  mv "$data/versions/$VERSION.new" "$data/versions/$VERSION"
  ln -sfn "versions/$VERSION" "$data/current"
  [ -L "$link" ] || ln -s "$data/current/slipbox" "$link"
  # Where the link is, for `slipbox uninstall`.
  printf '%s\n' "$link" >"$data/bin-link"

  say "$VERSION installed: $link -> $data/versions/$VERSION"
  case ":${PATH:-}:" in
    *":$bin_dir:"*) ;;
    *) say "$bin_dir isn't on your PATH: add it in your shell's profile, e.g. export PATH=\"$bin_dir:\$PATH\"" ;;
  esac
}

main "$@"
