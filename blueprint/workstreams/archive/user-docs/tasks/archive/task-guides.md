---
status: done
assignee: claude-guides2
blocked_by: []
created: "2026-10-11"
---

# DOC-T10: The agents, code and git, Obsidian or zk, and exporting guides

`docs/guides/agents.md`, `docs/guides/code-and-git.md`, `docs/guides/from-obsidian-or-zk.md` and
`docs/guides/exporting.md`: a guide for each thing people come to slipbox to do.

## Description

**agents.md**: slipbox beside an agent: both see the same files (disk is the contract), and what you see when an
agent writes; the CLI and `--json`; the skill, and installing it; safe writes (`--if-unchanged`); the scratch and
capture, from nvim too; the context bundle; letting an agent see what you're reading.

**code-and-git.md**: opening a repository: the code view, trusting the folder or not, language servers and `slipbox
doctor`, problems, the changed lines in the gutter, committing, reviewing a branch before merging it.

**from-obsidian-or-zk.md**: opening an Obsidian vault or a zk notebook as it is: what slipbox reads (wikilinks,
embeds, tags, front matter, callouts), how it follows their conventions, what it doesn't do (plugins, the apps' own
settings), naming the folder, converting its links to plain paths if you want them.

**exporting.md**: a note as Word or PDF, several notes as one document, a web page, an e-book, Markdown to take
elsewhere; where each goes; what to check before sending it.

## Acceptance criteria

- Written as requirements.md § How they are written says: no roadmap or decision ID, no links into `blueprint/`.
- Each step checked against the code; the CLI steps run as written on the reference set (`scripts/build-home.ts`),
  noted in the Log. The TUI steps are tried live in DOC-T12.
- It sends the reader to the manual for the rest: links to chapters by file; to a section only where the section is
  certain, which DOC-T11 checks.
- Clean under markdownlint at 120 columns.

## Out of scope

- The manual (DOC-T1–DOC-T8), `docs/README.md` and the project README (DOC-T11).
- Trying the TUI steps live (DOC-T12).

## References

- Delivers: requirements.md § The documents (`guides/agents.md`, `guides/code-and-git.md`,
  `guides/from-obsidian-or-zk.md`, `guides/exporting.md`).
- Rests on: DOC-D2, DOC-D3, DOC-D4.
- Sources: `README.md`, `docs/cli.md`, `docs/keymap.md`, `skills/slipbox/SKILL.md`, `blueprint/design/` (links,
  roots, trust, code-view, lsp, export, tui § Git), `src/`.

## Log

- 2026-10-11: claude-guides2 picked it up.
- 2026-10-11: Read the brief, the workstream, the sources (README, docs/cli.md, docs/keymap.md, the skill,
  `scripts/install-local.sh`, design: export, trust, code-view, links, roots, tui § Git and § Switching roots) and the
  code they name (`src/tui/keys.ts`, `src/core/command-specs.ts`, `src/core/config.ts`, the TUI's export, scratch,
  context, trust, git and conflict code in `src/tui/app.ts` and `actions.ts`). Built the reference set in my scratch
  folder, slipbox's state there too.
- 2026-10-11: Tried on the reference set, CLI: `info` on the Obsidian vault (`hobbies/cooking`: "wikilinks, by name,
  without .md — Obsidian's .obsidian/app.json") and the zk notebook (`hobbies/cycling`: "markdown links, relative,
  without .md — zk's .zk/config.toml"); `render`, `links`, `resolve`, `link` there; `convert-links --dry-run` (36
  changes in 8 files); `init --name kitchen` on a copy, then `link slipbox://kitchen/Pantry.md --from inbox.md` from
  another root and `folders`. On a copy of `notes/`: `write --create`, `read --json` (sha), `write --stdin
  --if-unchanged` (written, then refused with exit 5 on the old sha), `write --append`; `capture`, `capture --ref
  … --snippet`, `scratch path|show|clear --if-unchanged` (a wrong sha refused, exit 5), `context`, `history` (empty:
  no TUI ran), `send` (no nvim: exit 3, "no nvim is running with a server"). In `work/kestrel`: `changed`,
  `worktrees`, `diff` in the `agent/sync-retry` worktree, `merge-review` of four branches (none, 18, none, 1 link
  broken), `doctor` and `doctor src/sync/retry.ts` (not trusted: eslint not run, said). `export` to every format,
  two notes as one document with `-o`, Markdown with its pictures beside it (`Home.export.assets/`), over a note
  (exit 5), an unknown format (exit 2).
- 2026-10-11: Found: Obsidian's `==highlight==` and `%%comment%%` show as typed, a folded callout (`[!note]-`) is
  drawn open, a Dataview block is a code block; `![[pantry.csv]]` (a data file embedded) is a reference, not drawn
  in. Only `.obsidian/app.json`'s `useMarkdownLinks` and `newLinkFormat` and `.zk/config.toml`'s `link-format` and
  `link-drop-extension` are read (`src/core/convention.ts`); nothing else of either app's config.
- 2026-10-11: Gap: a release install has no way to install the agent skill (`install.sh` and the Homebrew formula
  don't ship `skills/`); only `scripts/install-local.sh --skill` from a checkout. The guide says so.
- 2026-10-11: Bug (not fixed): `slipbox export <note> -o <folder>/`, the folder not existing, writes a file named
  after the folder (no extension, the slash dropped: `-o newdir/` gave a file `newdir`) instead of a folder holding
  `<note>.<ext>`, or a refusal. An existing folder works; a missing parent of a file path is made.
- 2026-10-11: Not a bug, noted: `slipbox scratch clear` prints nothing on success (its `--json` says `cleared`).
- 2026-10-11: Found: the convert-links warning calls picture files notes (`![[dal.png|300]] matches 3 notes
  (…/dal.png, …)`), a wording slip. And a Markdown export inside a root puts same-named copies of its pictures in
  `name.export.assets/`, which then answer an Obsidian-style `![[dal.png]]` too (after exporting `Home.md` to Markdown,
  `dal.png` had 3 candidates, not 2): by design as it stands, a trap the exporting guide warns of; whether the walk
  should leave an export's assets out of name lookup is for the coordinator.
- 2026-10-11: TUI facts checked in the code for the steps: messages float at the top right (not the status line); the
  conflict prompt's title and its l/k/d/m; the scratch's and the context's messages; the trust question's text
  (`limitsOf`) and when it's asked; source control's keys (the explorer's, read its way: `s`, `u`, `a`, `d`, `.`, `l`,
  `c`, `shift+c`), the commit message; `space g w`/`c`/`m` lists and their titles; the export's format list, its Save As
  window (focus on the name, `enter` exports), the pick list for several notes; `:convert-links`'s preview and its pick
  rows. Every key, `:` alias, setting and command named in the four guides checked against `DEFAULT_KEYS` and the
  other keymaps, `DEFAULT_ALIASES`, `DEFAULT_CONFIG` and `CLI_COMMANDS`/`FLAGS` (a script in my scratch folder).
- 2026-10-11: The agents guide's CLI steps run as written on a folder made as getting-started.md makes it (`inbox.md`,
  `ideas/coffee.md`): `info`, `write --append --paragraph`, `search`, `find`, `links`, `backlinks`, `link`, `capture`,
  `capture --ref ideas/coffee.md:3-5 --snippet`, `scratch show`, `context` (and `--depth 2 --limit 40 --no-backlinks`
  on `notes/`). The exporting guide's three commands on the same and on `notes/`. Not run: `scripts/install-local.sh`
  (read: it writes into `~/.local/bin` and `~/.claude`), `slipbox diagnostics` (it installs servers), `send` with an
  nvim running. The code guide's examples are generic (`~/src/app`, `fix/retry`): in the reference set,
  `work/kestrel` and its `agent/sync-retry` worktree, `refactor/docs-layout` for a review with breaks.
- 2026-10-11: Done: `docs/guides/agents.md`, `code-and-git.md`, `from-obsidian-or-zk.md`, `exporting.md`, lint clean at
  120 columns; links to manual chapters by file only, no section anchors into other files. Status review.
- 2026-10-11: accepted by the user; done.
