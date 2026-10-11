---
status: review
assignee: claude-privacy
blocked_by: []
created: "2026-10-11"
---

# DF-T1: Privacy settings yours alone; the launcher; no roadmap numbers in messages

A folder can no longer widen what reaches the network; the source launcher never writes through a link; users never
see slipbox's internal numbers.

## Description

- **A1 (DF-D1):** `render.images_remote` and `lsp.auto_install` read from your own config only, a folder's warned
  of and ignored (`USER_ONLY` in `src/core/config.ts`, beside `update.check`'s handling).
- **A11 (DF-D7):** `scripts/install-local.sh` removes a link at the launcher's path and writes a file of its own,
  saying it replaced a release's link; tested as the script's other behaviour is (`tests/distribution.test.ts`).
- **A18:** no roadmap number in a user-facing message: the retired `[rename]` warning (`RETIRED` in
  `src/core/config.ts`), the installer's Windows error (`scripts/release.ts`'s `install.sh`), and a test that
  searches the messages slipbox prints for one.

## Acceptance criteria

- Each fix with a regression test beside the related tests, that fails without it (mutation-checked, in the Log).
- Tried on the reference set with the CLI, or headlessly as `tests/tui.test.ts` drives the TUI (D209), in the Log.
- The user docs that describe it changed in the same task (`docs/manual/`, `docs/guides/`, the skill for the CLI),
  without IDs; `tests/docs.test.ts` passes.
- The new design text written under its entry in DF's [design.md](../design.md), never in the root's design files.
- The typecheck and the test files touched pass; the whole suite once at the end.

## References

- Delivers: DF-D1, DF-D7; the root's design/trust.md § What runs, design/distribution.md § Installing.
- Docs: docs/manual/privacy.md, configuration.md (what only your own file can set), reading.md (pictures on the
  internet), code.md, docs/guides/install.md.

## Log

- 2026-10-12, claude-privacy: **A1.** `USER_ONLY` (`src/core/config.ts`) is now a table of key and reason, and takes
  `render.images_remote` and `lsp.auto_install` ("what reaches the network is yours to allow"): a folder's file that
  sets either, any value, has it dropped before the merge, with the warning the program settings get. Every reader
  (the TUI's start and root switches, the CLI, the language servers' installs, the linter's) reads the merged config,
  so nothing else changed. `update.check` is left as it was: read from your own file where it's used, a folder's not
  warned of (DF-D1 doesn't say to warn of it; configuration.md says it isn't).
- A1 test: core.test.ts, "what reaches the network is yours alone …" beside the editor.command one: yours stands over
  a folder's, an enclosing root's file too, a folder's stricter value too, two warnings each. Mutation-checked: the
  two entries taken out, it fails (`Expected "never"`, received `"show"`); restored, it passes.
- A1 tried (D209): a copy of the reference set in my scratch folder, photography's `.slipbox/config.toml` given
  `images_remote = "show"` and `auto_install = true`, my own config (`SLIPBOX_CONFIG`, in scratch) `never` and
  `false`. `slipbox info` there warns of both; `slipbox doctor site/Dockerfile` says docker-langserver is "not found,
  and installing is off", as my own config says. The TUI's own load (`loadConfig` with `configFilesFor`, as `run.ts`
  and a root switch call it) gives `never` and `false`; without a config of mine, the defaults `ask` and `true`. The
  guard here refuses `XDG_CONFIG_HOME` in a command, so the user file was given by `SLIPBOX_CONFIG`.
- A1 reference set: kestrel's `.slipbox/config.toml` now tries both, and CASES.md lists the case.
- A1 docs: configuration.md (What only your own file can set, and the two keys' lines in Every key), privacy.md (both
  sections said a folder's applied over yours), reading.md (pictures on the internet), code.md (installing servers),
  guides/making-it-yours.md (what a folder's settings can't choose; it also said the update check is warned of,
  which it isn't: now said apart). Design text in DF's design.md under trust.md § What runs, with the lines for
  rendering.md and lsp.md.
- **A11.** `scripts/install-local.sh` removes a link at the launcher's path before writing (never `cat >` through it),
  and says `replaced the link <path> -> <target> (a release's, which stays installed) with this launcher`; a link not
  to `*/current/slipbox` is said as "what it pointed to is left as it is".
- A11 test: cli.test.ts, beside the launcher's other test (the task names distribution.test.ts, but the launcher's
  behaviour is tested in cli.test.ts's "the launcher (scripts/install-local.sh)"): the installer's layout faked in a
  sandbox; the release's binary keeps its bytes, the path is a file, the message; run again, nothing said of a link;
  another link's target untouched. Mutation-checked: the `if [[ -L … ]]` block taken out, the release's binary is
  overwritten and it fails; restored, it passes.
- A11 tried: a fake release in scratch (`versions/0.1.0/slipbox`, `current`, `bin-link`, the link), the launcher
  installed over it with `SLIPBOX_BIN_DIR`: the message, the release's file unchanged, a file at the path. Then the
  launcher's own `slipbox uninstall` (scratch `XDG_DATA_HOME`) lists the release's files, says the launcher "isn't
  slipbox's link any more: left as it is"; with `--yes` the release is gone and the launcher stays. install.md says so.
- A11 design text in DF's design.md under distribution.md § Installing.
- **A18.** Besides the two named (the retired `[rename]` warning's `(21.12)`, the installer's `plan 14.12`), the new
  test found five more, all fixed: the `--scope vault` warning's `(21.10)` (cli.ts), and command descriptions shown in
  which-key and the palette: the indent and outdent operators' `(25.1)`, `folders.open`'s `(21.6)`, `root.trust`'s
  and `root.untrust`'s `(23.x)` (command-specs.ts).
- A18 test: docs.test.ts, "no roadmap step or decision ID in a message slipbox prints, nor in its installers'", beside
  the docs' own ID test: every string in `src/` (parsed with slipbox's own TypeScript grammar, a template's
  substitutions left out, comments never read) and in the installer, the Homebrew formula and the launcher (bash,
  Ruby), searched for a cited step (`(21.12)`, `(20.16, 21.10)`, `(23.x)`, `plan 14.12`), a decision or a task; and
  checks of the check (versions such as `nvim (0.9 or later)`, `git 2.42`, `1.1.414` pass). Mutation-checked:
  `(21.12)` and `plan 14.12` put back, it fails naming both; the HEAD's command-specs.ts and cli.ts put back, it fails
  naming all five; restored, it passes.
- A18 tried: on the reference set, `slipbox search coffee --scope vault` with a config holding `[rename]` says
  `"rename" is retired — renames no longer write a note's old name into it; …` and `--scope vault is --scope here
  now`, no numbers.
- A18: no docs quote these messages; no design text (a bug, no decision).
- Checks: the typecheck and the boundary pass; core.test.ts, docs.test.ts pass. cli.test.ts: all mine pass; two
  fail here, neither from this work: "stat: which root a note is in" (run in a worktree, the demo's root is named
  `halden@<branch>`) and "every command in the skill runs as written" (30 s spent on ~40 CLI runs, the machine at a
  load of 18–25; it timed out alone too). Before the coordinator's word, render, vault, servers, export, home,
  regressions and distribution ran together: one failure, render's "pipeline-cookbook.md @ 80" snapshot ("mermaid —
  too wide to draw"), which passes alone (order-dependent; nothing of rendering touched). The first whole-suite run
  was killed (out of memory, seven agents' runs at once); per the coordinator, no whole suite since.
- A1 tried again on a fresh build of the reference set: `slipbox info --json` in `work/kestrel` warns of both new
  keys beside the program settings' warnings.
