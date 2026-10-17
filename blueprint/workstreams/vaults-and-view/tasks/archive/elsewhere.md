---
status: done
assignee: claude-cli
blocked_by: [VV-T2]
created: "2026-10-15"
---

# VV-T3: No-vault, shown as Elsewhere

Everything outside home and the vaults: its own tabs, no index (VV-D3).

## Description

- No-vault's one set of tabs for the machine; "Elsewhere" on the status line and in messages.
- What needs an index (backlinks, search across, link checks by name) said to be unavailable there, not empty.
- The plain folder and the loose file retired from the code's paths that users reach.

## Acceptance criteria

- A terminal check: `slipbox` on a folder outside home opens Elsewhere; a note there says it has no backlinks; going
  back to a vault brings its own tabs.

## Done (2026-10-17)

No-vault is mode `folder` still, the code's and the JSON's word, now one place for the machine: `elsewhereAt` in
`core/vault.ts`, its key `elsewhere` whatever folder it's opened from, never in `roots.json`, listed a folder at a time
(`isListed` is Elsewhere). Its buffers are keyed by their whole paths; `rootLabel` names it `Elsewhere` (`ELSEWHERE` in
`core/names.ts`), on the status line, in going in, in a peek's title and in `info` and `stat`. Backlinks, search, tags
and the link check say it has no index (the TUI's messages and Info view; the CLI's exit 5, `needsIndex`), and a peek
at its note says so under it. Choosing its file from a vault goes into it (`intoOther`, `goThere`); a peek's `t` keeps
it read-only, marked `Elsewhere`. The terminal check "vaults: Elsewhere". The text for roots.md is in the workstream's
design.md. Left for later: Windows' drives (one Elsewhere for the machine, its folders by their drive).

