#!/usr/bin/env bash
# Temporary, never merged: #6's diagnostic. The tests that failed at random on CI, run again and again on its runners,
# their failures counted.
#   unit:     the picture test and three others in tests/tui.test.ts, about 100 times, three runs at once
#   terminal: the change list's terminal check, 100 times
set -u
case "${1:-}" in
unit)
  pat="the oldest of more than 48 let go|a link's target that matches nothing keeps its list while typed|a file's linters: findings beside their lines as it opens|:!cmd: run in the root's folder"
  mkdir -p diag
  loop() {
    for i in $(seq 1 "$2"); do
      bun test --timeout 30000 tests/tui.test.ts -t "$pat" >"diag/$1-$i.log" 2>&1 || echo "a run failed: $1-$i"
    done
  }
  loop a 34 &
  loop b 33 &
  loop c 33 &
  wait
  echo "── passed, by test"
  grep -h "^(pass)" diag/*.log | sed 's/ \[[0-9.]*ms\]$//' | sort | uniq -c
  echo "── failed, by test"
  grep -h "^(fail)" diag/*.log | sed 's/ \[[0-9.]*ms\]$//' | sort | uniq -c
  for f in $(grep -l "^(fail)" diag/*.log); do
    echo "── $f"
    cat "$f"
  done
  ;;
terminal)
  bun tests/terminal/run.ts --repeat 100 "the change list"
  ;;
*)
  echo "usage: diag-6.sh unit|terminal" >&2
  exit 2
  ;;
esac
exit 0
