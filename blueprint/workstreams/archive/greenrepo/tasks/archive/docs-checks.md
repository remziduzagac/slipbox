---
status: done
assignee: claude-cli
blocked_by: [GR-T4]
created: "2026-10-12"
---

# GR-T6: The docs checked: lint, spelling, links

Markdown is checked on every change (greenrepo DOC-05, the Markdown profile).

## Description

- markdownlint-cli2 as an exact dev dependency, with a project config holding the rules of the user's
  `~/.markdownlint-cli2.jsonc` (120 columns everywhere); typos with a project word list; lychee `--offline` for the
  links between files. `bun run check` runs all three. The fixtures and examples that are wrong on purpose are left
  out, each exclusion with its reason.
- What they find in the repository's Markdown and code, fixed.
- The blueprint's README § Conventions says the config is the project's now.

## Acceptance criteria

- `bun run check` passes; a misspelling, a broken link and a long line each fail it.

## Design text

### blueprint/README.md § Conventions, the Markdown bullet

MODIFIED: "**Markdown** is wrapped at 120 columns, tables and code included. `bun run check:docs` checks it: markdownlint
by the project's `.markdownlint-cli2.jsonc`, spelling by typos, the links between files by lychee. markdownlint-cli2
reads its config from the directory it runs in only, so it runs from the repository's top. A clean lint is no proof an
edit landed where it was meant to: read the result."

Previously: "It is checked by markdownlint-cli2 with `~/.markdownlint-cli2.jsonc`, given as `--config`, since the tool
reads a config from the current directory only and doesn't walk up."

### blueprint/README.md § Conventions, the Checks bullet

MODIFIED: "`bun run check` (the typecheck, the boundary, the supply chain's gates, Biome, the docs' lint, spelling and
links, the tests) runs freely." The rest of the bullet as it is; Biome is GR-T4's.

Previously: "`bun run check` (the typecheck, the boundary, the supply chain's gates, the tests) runs freely."

### design/testing.md § Strategy

The table gains a row: "`tests/check-docs.test.ts` | the docs' check (`scripts/check-docs.ts`) on a repository of its
own: a misspelling, a broken link or heading, a long line each fail it; only what git tracks is read".

ADDED, after **Isolation**:

"**The docs are checked too** (`bun run check:docs`, `scripts/check-docs.ts`; DOC-05). Over the text files git tracks,
less what is wrong on purpose (the reference set, the demo vault and the tests' fixtures, `LEFT_OUT`, each with its
reason): markdownlint-cli2 lints the Markdown by `.markdownlint-cli2.jsonc`, 120 columns everywhere and the rules that
are only style off; typos spells the code and the docs by `_typos.toml`, its list the project's own words, each saying
where it's from, the licence texts and snapshots left out; lychee follows the links between files and into their
headings, offline: the web's links are the weekly health check's. A test's misspelling on purpose sits between
`// typos: off` and `// typos: on`, or ends its line with `// typos: ignore-line`. Each file is given to the tools as a
path, never a glob: markdownlint-cli2 and lychee both read `plan (v2).md` or `plan [x].md` as a pattern matching
nothing, and passed, silently."

**Isolation** gains: "A test that finds a tool on `PATH` sets its own (`/usr/bin:/bin`): `bun run` puts the
repository's `node_modules/.bin` first, markdownlint-cli2 among them, which slipbox would find before its own."

### design/repository.md, the check command

"`check:docs` (`scripts/check-docs.ts`): markdownlint-cli2, an exact dev dependency at the version slipbox installs
for notes (`MARKDOWNLINT` in `src/core/lint.ts`, 0.23.3), run by Bun; typos and lychee, pinned in `mise.toml`, from
`PATH`, so the check runs where mise is active or as `mise x -- bun run check`. The configs are the repository's:
`.markdownlint-cli2.jsonc` (the maintainer's own rules, copied, so nothing depends on a home file) and `_typos.toml`.
The weekly health check's web links (GR-T11) can take the same files from the script's `checked()`."

## Log

- 2026-10-12: markdownlint-cli2 0.23.3 added with `bun add -d --exact` (MIT, published 2026-09-20; `check:deps` passes,
  204 packages). `.markdownlint-cli2.jsonc` holds the rules of `~/.markdownlint-cli2.jsonc`, each with its comment's
  intent; both parsed as JSONC and compared: equal, 24 rules.
- `_typos.toml`: ten words of the project's own (`opf`, `ratatui`, `devlop`, `multline`, `hom`, `viw`, `sav`, `flate`,
  `alikes`, `bre`), each read where it stands first, with where it's from; patterns for the leader's keys (`␣fo`), a
  theme's sixteen-colour palette, and the `typos: off`/`on` and `ignore-line` markers; `notices/` and
  `tests/__snapshots__/` left out. typos found no real misspelling in the code or the docs: every finding was a word
  of the project's, a test's input misspelt on purpose (the spell checker's tests, a flag and a config field spelt
  wrong to be refused, typed prefixes), a fragment cut by a column (the snapshots) or a licence's own text. Marked: the
  spell checker's describe blocks (core, TUI, CLI), the config-field test, two short blocks (a snippet's choice, a
  typed prefix) and six lines; a temporary folder's abbreviated prefix became `slipbox-nodrive-` (only its uniqueness
  counts).
- lychee found 19 broken links, all in the archived DF workstream: its tasks moved into `tasks/archive/` (`../design.md`
  became `../../design.md`) and it into `workstreams/archive/`; its design text quoted links as the root's design files
  have them. Each made to resolve from where it sits, the link text unchanged, two lines rewrapped. With fragments on,
  lychee read GitHub's heading anchors right (`§`, apostrophes, a repeated heading's `-1`), and skipped code.
- markdownlint found nothing outside `examples/home/`, `examples/vault/` and `tests/fixtures/` (632 findings in 101
  files there, all on purpose); those three are the script's `LEFT_OUT`. The examples' own CASES.md and README stay out
  with their sets: lychee can't read CASES.md's escaped `\<https://…\>`.
- Found while building it: markdownlint-cli2 globs its arguments even after `--`, and lychee its inputs, so `plan (v2).md`
  and `plan [x].md` were linted as zero files, exit 0. The script passes `:path` to the one and escapes `[`, `*`, `?` for
  the other; the test covers three such names. typos, given a binary by name, reads it (it found "typos" in the docs'
  screenshots): the script takes git's own view of what is text (`ls-files --eol`), which leaves out symlinks too.
- `bun run` puts `node_modules/.bin` on `PATH`, so under `bun run check` the servers test "lint's markdownlint-cli2
  behind" found the repository's new markdownlint-cli2 before slipbox's own copy, and failed (run: `bun run test
  tests/servers.test.ts -t "markdownlint-cli2 behind"`). It now sets its own `PATH`, as its sibling in core.test.ts
  does; any machine with markdownlint-cli2 on `PATH` would have failed it before.
- `scripts/check-docs.ts` and `check:docs`, in `check` before the tests; AGENTS.md (the rule and the command) and the
  README's development lines say so.
- Checked: `mise x -- bun run check:docs` passes (131 Markdown files, 355 files spelt, 851 links, 3 s);
  `tests/check-docs.test.ts` passes (11 tests), and fails under each of eight mutations of the script (no `:`, no
  escaping, binaries read, symlinks read, nothing left out, typos' excludes not forced, no fragments, markdownlint's
  failure ignored); `tests/servers.test.ts`, `tests/regressions.test.ts`, `tests/docs.test.ts` and the renamed drive
  test pass; Biome and the typecheck clean. Not run: the whole suite, for the coordinator.
