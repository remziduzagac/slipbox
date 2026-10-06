#!/usr/bin/env bash
# Replay what a coding agent does to a folder, to test editor integrations: append, prepend, rename, delete,
# recreate, a write through a temp file and a rename, and a burst. Edits ../../../../Downloads/ (the casual folder).
set -eu

dir="${1:-$(cd "$(dirname "$0")/../../../../Downloads" && pwd)}"
note="$dir/agent-scratch.md"
pause() { sleep "${PAUSE:-1}"; }

echo "# agent scratch" > "$note"
pause

echo "appending"
printf '\n- [ ] first pass\n' >> "$note"
pause

echo "prepending"
{ echo "---"; echo "title: Agent scratch"; echo "---"; cat "$note"; } > "$note.new" && mv "$note.new" "$note"
pause

echo "renaming"
mv "$note" "$dir/agent-scratch-renamed.md"
pause

echo "deleting"
rm "$dir/agent-scratch-renamed.md"
pause

echo "recreating"
echo "# agent scratch again" > "$note"
pause

echo "temp-and-rename write (what most editors and agents do)"
tmp=$(mktemp "$dir/.agent.XXXXXX")
printf '# agent scratch\n\nrewritten atomically\n' > "$tmp"
mv "$tmp" "$note"
pause

echo "burst: ten writes in a second"
for i in 1 2 3 4 5 6 7 8 9 10; do
  echo "line $i" >> "$note"
  sleep 0.1
done

rm -f "$note"
echo done
