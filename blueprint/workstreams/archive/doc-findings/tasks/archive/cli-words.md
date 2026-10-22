---
status: done
assignee: claude-cli
blocked_by: []
created: "2026-10-11"
---

# DF-T2: The CLI's words and small fixes

The CLI says root, keeps web addresses whole, predicts its refusals in dry runs, warns only when it should, and can
make an empty note.

## Description

- **A19 (DF-D9):** "root" for vault in the CLI's messages and JSON (`mode`, the change kinds `root`, `make-root`,
  `unmake-root`, "nothing to undo … in this root"), and `built-in` in `themes`; schema stays 1; the skill
  (`skills/slipbox/SKILL.md`) and `docs/manual/cli.md` with it. Search the code for other user-facing "vault".
- **A7:** `slipbox links` keeps a web address whole (`https:/` today; `graph.abs` near `src/cli/cli.ts`'s links).
- **A9:** `slipbox init --name x --dry-run` refuses as the run would when the name is taken (exit 5).
- **A10:** `slipbox undo` after an `apply` of a move: no `unreadable: ENOENT` warning about the path it moved from.
- **C4 (DF-D16):** `slipbox write <note> --create --allow-empty` with no text makes an empty note.

## Acceptance criteria

- Each fix with a regression test beside the related tests, that fails without it (mutation-checked, in the Log).
- Tried on the reference set with the CLI, or headlessly as `tests/tui.test.ts` drives the TUI (D209), in the Log.
- The user docs that describe it changed in the same task (`docs/manual/`, `docs/guides/`, the skill for the CLI),
  without IDs; `tests/docs.test.ts` passes.
- The new design text written under its entry in DF's [design.md](../../design.md), never in the root's design files.
- The typecheck and the test files touched pass; the whole suite once at the end.

## References

- Delivers: DF-D9, DF-D16.
- Docs: docs/manual/cli.md, the skill, docs/guides/agents.md.

## Log

- 2026-10-11 (A19): Swept the CLI's output on the reference set (`info`, `folders`, `themes`, `types`, `ls`,
  `problems`, `links --all`, `search`, `undo`, `name`, `relink`, `commands`, `context` and more, `--json` and human)
  and the source's string literals for "vault". Said to users: `info`'s `mode` and its human `(vault)`; a change's
  `kind` (`vault`, `make-vault`, `unmake-vault`) in `mv`/`name`/`init`/`deinit`/`undo`/`apply` and in `apply`'s list
  of plans; the walk's skip reasons `nested vault` and `symlink to …, already in the vault` (in `info`, and the TUI's
  folder info); `rename.ts`'s refusals ("isn't inside the vault", "no vault nested at", "isn't a vault", "is already a
  vault", "hidden folders aren't the vault's", "nothing to undo … in this vault"); `themes`' `builtin` (the TUI's theme
  picker shows it too). The kinds stay `vault`… in the code, the renames log and the saved plans (state on disk):
  the CLI says them as root as it prints them (`kindWord` in `cli/cli.ts`). The skip reason is a sentinel compared in
  `walk.ts`, `reach.ts`, `graph.ts`, `autoindex.ts` and the TUI's explorer: renamed in all five. Left as they are,
  per design/terms.md § Retired ("stays in code and config"): the `[vault]` identity table (and its two messages),
  `capture.location = "vault"`, the command ids (`vault.init`, `find.vault`…) `commands` lists, and the keymap's
  `rename_vault`, `make_vault`, `unmake_vault`, the theme role `sidebar_vault`; and the warning for the retired
  `--scope vault`, which names the user's own word (its roadmap number is A18's). The note text "this vault" in the
  reference set and the demo is content, not slipbox's words. The skill said no "vault": nothing to change there.
- 2026-10-11 (A19): Regression test, `tests/cli.test.ts` "the CLI says root, never vault (DF-D9)": `info`'s `mode`
  and human line, the `nested root` skip, `themes`' `built-in`, `init`/`deinit`'s `make-root`/`unmake-root`, `name
  --plan`'s `root`, `apply`'s list and run, the machine's list learning the applied name, nothing to undo "in this
  root". Mutation-checked: each of `mode`, the skip reason, the themes' spelling, `kindWord` whole and each of its
  arms, `apply`'s list, `relearnRenamedRoots`' kind and the undo message undone in turn, the test fails each time.
  The tests that pinned `vault`, `make-vault` and `unmake-vault` (cli.test.ts, vault.test.ts) now say root.
- 2026-10-11 (A7): `links` built `shown` (and `root`) from `graph.abs(url)`, which joins the root and normalizes
  `//` away. An external link now has no file: `shown`, `root` and `name` `null`, as `resolve` gives them, its `path`
  the address whole; the human line prints the address. Test "links keeps a web address whole" beside the links
  tests, mutation-checked (the `external` guard, and the human fallback, each undone: fails). Tried on the reference
  set: `links reading/bookmarks.md` printed `https:/…` before, `https://…` now.
- 2026-10-11 (A9): `init --dry-run` returned before any check. The refusals moved out of `initVault` into
  `checkInit` (vault.ts), which both the run and the dry run call: a home folder or `/`, a name that can't be one or
  that a different folder has, another name already, and a `[vault]` table the textual edit can't follow (predicted
  with `withIdentity` and `identityReadsBack`, as `name --dry-run` does). Test beside the names test in vault.test.ts:
  the dry run's exit 5 and message equal to the run's, nothing written; mutation-checked (the CLI's `checkInit`
  call, the identity check, the another-name check: each undone, fails). Tried on the reference set in
  `hobbies/cycling`: `init --name notes --dry-run` exit 5, "a different folder is called "notes"…"; a free name
  previews, nothing written.
- 2026-10-11 (A10): Not apply's alone: any `undo` of a move warned. `planUndo` parses nothing, so the CLI's graph
  holds the moved note's old path unparsed; `applyPlan` then `removeFile`s it, whose look for namesakes (the CLI is
  thorough) parses every note left unparsed, the gone file among them: ENOENT. `removeFile` now drops the file from
  the unparsed set first. Test beside the undo tests in vault.test.ts (a move undone, and a planned move applied and
  undone: no warnings), which failed with `archive/plan.md: unreadable: ENOENT` before the fix; mutation-checked.
  Tried on the reference set: `mv` and `undo`, `mv --plan`, `apply`, `undo`: only `locked.md`'s own EACCES remains
  (the reference set's unreadable note).
- 2026-10-11 (C4): `write` refused no text before looking at `--allow-empty`. With `--create --allow-empty` and no
  text it makes an empty file; without `--allow-empty`, or on a note that's there, no text is refused as before, the
  usage message now naming the way. Test beside the `--allow-empty` test in cli.test.ts, mutation-checked (the guard
  undone, `--create` or `--allow-empty` dropped from it: fails). Tried on the reference set: `write ideas/later
  --create --allow-empty` made a 0-byte `ideas/later.md`; again, exit 5; `--create` alone, exit 2. No design text:
  the CLI's flags are the CLI chapter's (D18), which the design defers to.
- 2026-10-11 (docs): cli.md (the change kinds, `info`'s example and `mode`, `init`'s and `deinit`'s kinds, `name`'s,
  `themes`' `built-in`, an external link in `links`' JSON, `init --dry-run`, `--allow-empty` with `--create`);
  files.md's command table (an empty note); the skill (an empty note, in the commands and under Writing). The design
  text for DF-D9 under its entry in DF's design.md (roots.md § How a root is named and shown, terms.md § Retired).
- 2026-10-11 (checks): the typecheck and the boundary pass; `tests/vault.test.ts` 298 pass; `tests/docs.test.ts`
  passes; the TUI's nested-root tests (`-t nested`, 5) pass. `tests/cli.test.ts`: 103 pass, 2 fail, neither mine.
  "stat: which root a note is in" expects the demo's label `halden`, and in a worktree it is `halden@<branch>` (D77):
  it fails the same in any linked worktree. "every command in the skill runs as written" timed out at 30 s under a
  machine load of 20 (seven agents' runs); its lines, run by a scratch copy of the test without the limit, gave no
  usage error, the new `write <path> --create --allow-empty` among them. A whole-suite run, begun, was stopped at the
  coordinator's word (the machine saturated); what it had reached failed only on timeouts, a Mermaid diagram not
  ready in time, and `servers.test.ts`' lock list seeing another run's `fake-mdl`: none in code this task touches.
- 2026-10-12: accepted on the coordinator's recommendation, the user having said to take them as answers until done; done.
