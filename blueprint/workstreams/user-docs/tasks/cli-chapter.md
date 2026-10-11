---
status: review
assignee: claude-cli
blocked_by: []
created: "2026-10-11"
---

# DOC-T3: The CLI chapter, and the skill checked

`docs/manual/cli.md`: every command, from today's `docs/cli.md`; the agent skill checked against it.

## Description

Rewrite `docs/cli.md` as the manual's CLI chapter, for people and for whoever writes an agent's or a script's use of
it: disk as the contract, the output contract and exit codes, what is stable, how notes are named, every command with
its flags and its `--json` data, installing for agents. Code paths (`core/stale.ts`), IDs, plan references and
history ("a launcher written before 2026-10-07") go.

Check it against `src/cli/`: `slipbox help` and each command's own help, the flags each parses. Then check
`skills/slipbox/SKILL.md` against the chapter and the code: where the skill is wrong, or misses a command an agent
needs, fix the skill (it stays the agents' guide, DOC-D4) and say so in the Log.

## Acceptance criteria

- Every command `slipbox help` lists is in the chapter, with every flag it takes.
- The chapter's examples run as written on the reference set (`scripts/build-home.ts`), noted in the Log.
- The skill names no command, flag or behaviour the chapter contradicts.
- Written as requirements.md § How they are written says: no roadmap or decision ID, no links into `blueprint/`.
- Every claim checked against the code, not the design alone. Where the two disagree, the doc says what the code
  does, and the Log names the difference for the coordinator; neither the code nor the blueprint is changed here.
- Clean under markdownlint at 120 columns; every relative link and anchor in it resolves, but those into chapters
  written in parallel, which DOC-T11 checks.

## Out of scope

- The other chapters and guides (their tasks), `docs/README.md` and the project README (DOC-T11).
- Removing the old reference, and the links to it (DOC-T11).

## References

- Delivers: requirements.md § The documents (`manual/cli.md`), § Acceptance criteria (the skill).
- Rests on: DOC-D2, DOC-D3, DOC-D4.
- Sources: `docs/cli.md`, `src/cli/`, `skills/slipbox/SKILL.md`, `blueprint/design/how-it-works.md`.

## Log

- 2026-10-11: claude-cli picked it up.
- 2026-10-11: Read the brief, the workstream, `docs/cli.md`, the skill, the README, `how-it-works.md` (the disk
  contract, storage), D15–D18, and the code: all of `src/cli/` (`HELP`, `FLAGS`, `GLOBAL_FLAGS`, `MAX_ARGS`, every
  handler), `src/main.ts`, `src/tui/run.ts`'s start, and what the handlers return from `src/core/` (graph, links,
  context, clipboard, footnotes, doctypes, install, update, rename). The test list of `tests/cli.test.ts` and
  `tests/docs.test.ts`'s checks.
- 2026-10-11: Tried every command on the reference set in my scratch folder, with `HOME`, settings and state of its
  own, `--json` shapes printed for each. Then ran the chapter's examples in order (113 lines) on a fresh build: all
  exit 0, with this setup between them: `ideas/coffee.md` made by the chapter's own `write --create`, then given two
  tasks, a line with "finer" and the tag `#coffee`; `ideas` made a plain folder
  again after the `init` and `deinit` examples; the real plan id for `apply <id>`. Git examples in `~/work/kestrel`
  and its worktree `~/work/kestrel-agent-sync-retry`. Not run as written: `send` (it reaches a running nvim outside
  the sandbox: tried once, with `--line`), `upgrade` (it fetches), `uninstall --purge --yes` (only the listing),
  `diagnostics` on a code file (it installs servers; the examples are on notes).
- 2026-10-11: Wrote `docs/manual/cli.md`: running a command, the root, naming a note, output (human, `--json`, exit
  codes, `stale`, columns, what stays stable), the shared flags, a table of every command, then each command with its
  flags, examples and `--json` data, grouped by what you do. Lint clean; the docs test's checks run on it alone:
  every command and flag named, no IDs, every own anchor lands (`reading.md` and `troubleshooting.md` not written yet).
- 2026-10-11: Differences, the chapter saying what the code does:
  - `slipbox help`'s "Global options" leave out `--plain` and `--from`, which every command takes (`GLOBAL_FLAGS`).
  - No command has help of its own: `--help` anywhere prints the whole list.
  - A name several notes share goes to the one in the exact case, then in the fewest folders; only a real tie is exit
    4. The skill said exit 4 for any shared name. `--from` only breaks a real tie.
  - JSON the old reference left out or gave short: `context`'s `chars` and `left[{path, why, from, reason}]`,
    `search`'s `scope` and `roots`, `replace`'s `column`, `text`, `textAfter`, `backlinks`' `block` and `alias`,
    `history`'s `exists`, `activeTab`, `current`, `types <type>`'s `source` and `paths`, `info`'s `version`,
    `markerVersion`, `background`, `search`, `stale`, `index --home`'s fields.
  - `index` builds the search index, `index --refresh` the link index: the old reference called both "the index".
  - A file that isn't a note: `task` and `spell` exit 2, `footnotes` exit 5.
  - JSON and messages still say vault: `info`'s `mode: "vault"`, the change kinds `vault`, `make-vault`,
    `unmake-vault`, "nothing to undo … in this vault", `info`'s "nested vault". `themes` says `builtin`, `types`
    `built-in`.
  - `search --scope vault` is still read as `here`, with a warning: left out of the chapter as history.
- 2026-10-11: Bugs found, not fixed:
  - `slipbox mv ideas/globe.md ideas/drinks/` (an existing folder, a trailing `/`) renames the note to
    `ideas/drinks.md` beside the folder, rather than moving it in or refusing. The chapter says the new path is the
    whole path.
  - `undo` after `apply` of a move warns `ideas/drinks/coffee.md: unreadable: ENOENT`: the path it just moved the note
    from.
  - The test "every command in the skill runs as written" times out at 30 s here, with the committed skill too (the
    machine busy with the other writers); the skill's new lines make it longer.
- 2026-10-11: The skill checked against the chapter and the code, and changed: a shared name goes to the one in the
  fewest folders (two places, and `shadows`); `spell`'s languages are `[spell]`'s, not English always; `changed`
  compares with the base, not `main` always; reference forms no longer said to follow GitHub; a section on moving,
  renaming and deleting (`mv`, `--plan` and `apply`, `rename-heading`, `rm`, `trash`, `undo`), which agents need and
  it lacked. Its new lines run on the demo vault with the test's placeholders, none a usage error. Lint clean.
- 2026-10-11: For DOC-T11: the blueprint points at `docs/cli.md` (D15's § Stability, D16's § Installing for agents,
  D17, `how-it-works.md`); the stable list is now the chapter's "What stays stable". Done: review.
