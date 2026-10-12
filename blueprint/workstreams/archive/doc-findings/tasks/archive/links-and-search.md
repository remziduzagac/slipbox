---
status: done
assignee: claude-links
blocked_by: []
created: "2026-10-11"
---

# DF-T5: Clones open the default copy; search leaves worktrees out; a missing heading

The code brought in line with the design in three places.

## Description

- **A8:** a repository and a clone of it (one remote), the clone with a `.slipbox/` name of its own: a pointer by the
  remote's name, and a hosting URL to it, open this machine's default copy, as design/roots.md § Named folders' table
  says; an error, where one remains, names each copy by its path, never the same name twice. The reference set has the
  case (`work/kestrel`, `route-engine-spike`).
- **B1:** search's linked scope leaves worktrees out, as design/roots.md § Search scope says, even one a note links
  into by `@branch` (`scopeRoots`, `src/core/scope.ts`).
- **B2:** a link whose heading or block isn't there opens the note at its top and says what's missing, heading and
  block alike, as design/links.md § Where a link lands says (TUI and `slipbox resolve`).

## Acceptance criteria

- Each fix with a regression test beside the related tests, that fails without it (mutation-checked, in the Log).
- Tried on the reference set with the CLI, or headlessly as `tests/tui.test.ts` drives the TUI (D209), in the Log.
- The user docs that describe it changed in the same task (`docs/manual/`, `docs/guides/`, the skill for the CLI),
  without IDs; `tests/docs.test.ts` passes.
- The new design text written under its entry in DF's [design.md](../design.md), never in the root's design files.
- The typecheck and the test files touched pass; the whole suite once at the end.

## References

- Delivers: design/roots.md § Named folders, § Search scope; design/links.md § Where a link lands (unchanged).
- Docs: docs/manual/links-and-roots.md, finding.md.

## Log

- 2026-10-12 (claude-links): reproduced on the reference set (scratch HOME, `slipbox index --home`): `folders` lists
  `engine-spike` (the spike, `.slipbox/` named, kestrel's remote) found before `kestrel`. A8: `resolve
  slipbox://github.com/kestrel-labs/kestrel/…` is exit 4, "2 repositories are called github.com/kestrel-labs/kestrel",
  the candidates that remote twice; a hosting URL to kestrel from `notes` resolves `external`. Cause: `lookupFolder`
  counts the two lookup entries (keys `slipbox:<id>` and `remote:…`) as different folders, where the table makes them
  copies of one repository. B1: `search --scope linked` from `notes` searches `work/kestrel-agent-sync-retry` (5
  hits), reached by link-styles.md's `slipbox://kestrel@agent/sync-retry/…`: `scopeRoots` adds any root a link
  reaches. B2: `resolve …route-sharing.md#pricing` and `#^trim-decision` (feedback-synthesis's broken fragments) print
  the path and say nothing; `resolve` doesn't land blocks at all (`#^retry-plan`, which is there, gives `line: null`,
  `href` without its `^`): it looks the fragment up with `findHeading` alone, not `landing.ts`.
- 2026-10-12 (claude-links): A8, a first try preferred the lookup entry keyed by the remote (`remote:…`) within a
  repository's copies: on the reference set the qualified pointer then opened the spike, since kestrel is named in
  its own `.slipbox/` too (`kestrel`, an id of its own) and the spike was found first. The rule kept: in
  `lookupFolder`, the folders of one remote are one repository (`byRepository`), the copy called by the remote's name
  (its last part, as `.slipbox/` name, alias or the remote's own) first, else the first found; its copy gone, another
  copy of the repository, said so. An error that remains lists each folder once, by its path (the candidates), the
  remotes in the reason. `pointerNaming` no longer counts a copy of the same repository as a clash, since following
  reads them as one (links.md § Pointers: "as following reads one").
- 2026-10-12 (claude-links): B1, `scopeRoots` adds no root inside a linked worktree (`checkoutOf(root).worktree`), as
  `all` already left out the worktrees `readRoots` marks. B2: the TUI's follow lands every fragment through one helper
  (`fragmentAnchor` in `tui/actions.ts`: lines, a block, else a heading); one that lands nowhere opens the note at
  `TOP`, saying `no heading "x" in <path>: opened at its top` or `no block ^x in …` (before, no anchor: the position
  remembered, and a block said nothing). `slipbox resolve` lands the fragment with `landing.ts` (a block's and lines'
  `line` now, their `href` as written) and warns `no heading "x" in <path>: the link lands at its top`, or the block's.
- 2026-10-12 (claude-links): tests, each beside its kin: vault.test.ts "a repository and a clone of it with a
  .slipbox/ name of its own are copies of one…" (and the different-folders test's candidates, now paths), "a scope
  leaves worktrees out, even one a note links into by @branch or by path…", "resolve lands a block and lines as a
  heading; a heading or block that isn't there…"; tui.test.ts "a heading or block that isn't there opens the note at
  its top…". Mutation-checked with a runner that undoes each fix and restores the file: the grouping, the copy order,
  another copy of the repository, candidates by path, the naming's clash, the worktree filter, the TUI's heading and
  block, resolve's warning, its landing and its href: each of the 11 fails its test.
- 2026-10-12 (claude-links): tried on the reference set (scratch HOME and state, `slipbox index --home`): `resolve
  slipbox://github.com/kestrel-labs/kestrel/docs/architecture.md` → `~/work/kestrel/…`; the hosting URL from `notes`
  and product's README's `https://github.com/kestrel-labs/kestrel` → kestrel's copy; `slipbox://engine-spike/…` →
  the spike. `search --scope linked` from `notes`: `kestrel-agent-sync-retry` gone, kestrel kept. `resolve` of
  feedback-synthesis's `#pricing` and `#^trim-decision`: the PRD, and the warning; `sync-rewrite.md#^retry-plan` →
  `:37`. The TUI headlessly: product's PRD read to line 108, then from notes `#pricing` and `#^trim-decision` open it
  at line 1 (the root switched), the warning's box on screen beside the switch's; the qualified pointer and the
  hosting URL switch into `~/work/kestrel`.
- 2026-10-12 (claude-links): left as they were, for the coordinator: `slipbox folders default <full name> <path>`
  takes only a copy of the folder that answers (kestrel's), not the renamed clone; `init` and `name` still refuse a
  clone the repository's own name. The hover (`shift+k`) on a link to a missing heading still shows "(nothing there)",
  not the note's top. A data file's `#section` not there keeps its old way (the file where it was, `no heading … here`).
  No e2e scenario covers these three fixes.
- 2026-10-12 (claude-links): checks, on a machine saturated by the other agents' runs (load 12–22 on 10 cores): the
  typecheck and the boundary pass; vault.test.ts, cli.test.ts and docs.test.ts pass but for timeouts rerun alone
  (docs' links, the skill's commands: pass alone) and `stat`'s `root halden`, which reads `halden@<branch>` in any git
  worktree of this repository (not this change); tui.test.ts: 633 of 645, the 12 failures timeouts and timing, all
  but one passing rerun alone; that one, "the background index parses a big note on other threads" (a slice under 250
  ms; 391 and 454 ms here), is a timing test of the parser, which this task doesn't touch. The whole suite is the
  coordinator's, after the merge.
- 2026-10-12: accepted on the coordinator's recommendation, the user having said to take them as answers until done; done.
