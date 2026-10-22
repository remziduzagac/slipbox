#!/usr/bin/env bash
# The onboarding kata in bash. Siblings: ./greeter.ts (the index), greeter.go, greeter.js, greeter.lua,
# greeter.py, greeter.rs, greeter.tsx. A greeter with greet and shout, and greet_all.
GREETING="${GREETING:-Hello}"

greet() {
  echo "$GREETING, $1!"
}

shout() {
  greet "$1" | tr '[:lower:]' '[:upper:]'
}

greet_all() {
  for n in "$@"; do
    greet "$n"
  done
}
