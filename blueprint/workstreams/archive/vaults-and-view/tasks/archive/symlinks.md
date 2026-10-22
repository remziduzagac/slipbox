---
status: done
assignee: claude-cli
blocked_by: [VV-T2]
created: "2026-10-15"
---

# VV-T6: Links followed only when the user says so

The trust prompt, its store, and the walk's, the watcher's, the writes' and the CLI's rules (VV-D6).

## Description

- The prompt on first opening a link out of a vault or home: follow, just look, no; the agents' warning for a hidden
  target or one outside home.
- The answers kept by link and target in the state folder; asked again when the target changes.
- The walk and the watcher following a trusted link (a slow target in the background, given up on); writes through a
  link out of a vault refused even trusted; home's trusted links written through; the CLI refusing untrusted links.
- Only links leading out of a vault or home ask; one within it is a second name, never asked about; in Elsewhere every
  link asks.

## Acceptance criteria

- A regression test for each rule, mutation-checked; a terminal check of the prompt, each answer and a changed target
  asked again.

## Done (2026-10-17)

`core/symlinks.ts` holds the rules: the answers (`links.json` in the state folder, by link and target), a link's scope
and state, the first link on a path's way not followed (`blockingLink`), what a write may do (`writesThrough`), the
agents' warning, and the targets' probe. The walk and the watcher take one verdict (`symlinkVerdict`); the CLI asks the
targets before each command and refuses a path through a link not followed (exit 5); the TUI asks (`tui/following.ts`),
the explorer's link rows saying where they lead and whether they're followed (VV-T5's columns take them). Unit and TUI
tests hold each rule, mutation-checked; the terminal check of the prompt and its answers comes with the workstream's
last pass of terminal checks. The text for roots.md and trust.md is in the workstream's design.md. Left for later:
un-following a link (its answer is kept until the link leads elsewhere), and a peek's links in another vault, read as
that vault has them.
