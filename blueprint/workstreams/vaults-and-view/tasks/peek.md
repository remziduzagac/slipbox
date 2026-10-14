---
status: proposed
assignee: null
blocked_by: [VV-T1]
created: "2026-10-15"
---

# VV-T7: The peek

Another vault's file read in place, going there a choice (VV-D7).

## Description

- The peek window: rendered, read-only, `/`, copying; `esc`, `o`, `t`, `z`; `ctrl+o` inside it.
- Links inside it, by where they lead; a click peeks, `ctrl+click` goes.
- Used by a link into another vault, a backlink from one, another vault's search result, a no-vault file; its backlinks
  when that vault has an index.

## Acceptance criteria

- Terminal checks for each way in and each key; D50's switch on following a link gone, a regression test holding it.
