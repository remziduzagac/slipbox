---
status: review
assignee: claude-export
blocked_by: []
created: "2026-10-11"
---

# DOC-T8: The export, privacy and troubleshooting chapters

`docs/manual/export.md`, `docs/manual/privacy.md` and `docs/manual/troubleshooting.md`.

## Description

**export.md**: asking for an export, in the TUI and with `slipbox export`; each format (Word, PDF, a web page, an
e-book, Markdown) and what it keeps (chapters, links between the notes exported, pictures, diagrams and maths, code);
where it goes; what it never does (write over a note, fetch anything); its limits.

**privacy.md**: what slipbox sends over the network, and when: the daily update check and how to turn it off;
language servers installed from npm when first needed; a picture on the internet only as `images_remote` says. What
it never sends: no telemetry, Bun's crash reports turned off. What it runs (trust, briefly, linking code.md). What it
keeps on your machine, and where; removing it all.

**troubleshooting.md**: `slipbox doctor` and `slipbox info`; the usual problems and their fixes: keys a terminal or
multiplexer swallows, pictures not drawn, icons or colours wrong, the clipboard over SSH, a language server not found,
config warnings, the TUI refusing to start without a terminal, a note changed on disk while you edited it, search out
of date, WSL; `SLIPBOX_DEBUG`; what to include when reporting a problem.

## Acceptance criteria

- Written as requirements.md § How they are written says: no roadmap or decision ID, no links into `blueprint/`.
- Every claim checked against the code, not the design alone. Where the two disagree, the doc says what the code
  does, and the Log names the difference for the coordinator; neither the code nor the blueprint is changed here.
- Every key, setting and CLI command a chapter names exists, as the chapter names it.
- Clean under markdownlint at 120 columns; every relative link and anchor in it resolves, but those into chapters
  written in parallel, which DOC-T11 checks.
- Every network access the code makes is in privacy.md (`fetch`, `curl`, npm installs, git's remotes), checked by
  a search of `src/`, listed in the Log.

## Out of scope

- The other chapters and guides (their tasks), `docs/README.md` and the project README (DOC-T11).

## References

- Delivers: requirements.md § The documents (`manual/export.md`, `manual/privacy.md`, `manual/troubleshooting.md`).
- Rests on: DOC-D2, DOC-D3.
- Sources: `blueprint/design/export.md`, `distribution.md`, `trust.md`, `how-it-works.md` § Storage,
  `rendering.md` (pictures), `docs/configuration.md` § Environment, `docs/cli.md`, `src/`.

## Log

- 2026-10-11: Started (claude-export).
- 2026-10-11: Network access, by a search of `src/` (`fetch`, `node:net`/`http`/`https`/`dns`/`tls`, `Bun.serve`/
  `listen`/`connect`, `WebSocket`, URLs, every `spawn`/`execFile`): `fetch` in `src/core/update.ts` (the TUI's daily
  check, `slipbox upgrade`'s download) and in `src/tui/app.ts` through `src/tui/images.ts` (pictures on the internet);
  npm installs by `Bun.spawn([execPath, "install", "--frozen-lockfile", "--ignore-scripts"])` in
  `src/core/servers/install.ts`, from `servers/manager.ts` (servers, TUI and `slipbox diagnostics`) and `lint.ts`
  (markdownlint-cli2, TUI, `diagnostics`, `problems --lint`). git: no `fetch`/`pull`/`push`/`clone`/`ls-remote`
  anywhere; remotes only read from config text (`remotes.ts`); git itself may reach a remote in a partial clone, or for
  LFS in a trusted root. `curl`/`wget` only in the installer script, not `src/`. Servers' own network is theirs:
  yaml-language-server's telemetry set off, `telemetry/event` dropped (`client.ts`). All in privacy.md.
- 2026-10-11: Programs run (privacy.md § What slipbox runs): git (gitops, gitlog, gitstage, mergereview, rename,
  vault), the editor (`run.ts`), nvim `--server` (`nvim.ts`), `send`'s commands (`cli.ts`), clipboard tools
  (`clipboard.ts`), `$SHELL` for `:!` (`shell.ts`), servers (`client.ts`), linters (`linters.ts`, `sh -c`),
  markdownlint-cli2 (`lint.ts`), Bun to install, `tar` and the new binary in `upgrade` (`update.ts`).
- 2026-10-11: Tried on the reference set (copy in my scratch, own XDG folders): `export` of
  `research/route-cost-models.md` + `projects/sync-rewrite.md` to all five formats, and of test notes of my own
  (links, wikilinks, tags, inline HTML, callout, table, tasks, code, Mermaid, maths, PNG/WebP/JPEG, `![[x|240]]`, a
  web picture, a section embed); refusals (a note: exit 5; `--to rtf`: exit 2; missing note: exit 3); aliases,
  `-o` extension, folders made; `info`, `doctor`, `doctor <file>`, `index`, `index --refresh`, `uninstall --purge`
  (listing only); config warnings (unknown key, bad value, bad TOML: file skipped); `loadConfig` with a folder config.
- 2026-10-11: BUG (privacy): a folder's `.slipbox/config.toml` sets `render.images_remote` and `lsp.auto_install` over
  your own (only `update.check` is read from your config alone). Checked: your `images_remote = "never"`,
  `auto_install = false` came out `show` and `true`. A cloned folder can make the TUI fetch every web picture as its
  notes are drawn, or turn npm installs back on. privacy.md says so as it is; the fix would be to make both yours only
  (or let a folder only make them stricter).
- 2026-10-11: BUG (export): the Markdown export copies whatever file a picture's link names into `.export.assets/`,
  a non-picture and a file outside the root alike (`![a chart](../private/secret.txt)` copied it; the reference set's
  `projects/sync-rewrite.md` copies `route-sharing.md`). Other formats make a non-picture its words. export.md's Limits
  say so.
- 2026-10-11: BUG (export, CLI): `-o dir/` for a folder that doesn't exist writes a file named `dir` (the slash
  ignored); a second export replaces it. export.md says a folder must exist.
- 2026-10-11: Difference: an export refuses only a note of the root it's made from; from the CLI, `-o` over a note of
  another root replaces it without a word (checked). The TUI asks before replacing any file. Said in Limits.
- 2026-10-11: Difference: the CLI exports any file named (a CSV, read as Markdown); the TUI refuses a non-note. Said.
- 2026-10-11: Finding: slipbox's trash can't be emptied (no command, no expiry: `core/files.ts`); a deleted note stays
  in the state folder until restored or removed by hand. privacy.md says how; files.md's writer may want it too.
- 2026-10-11: Minor: a block id after an embed in a paragraph (`![x](n.md#^b) ^id`) stays as text in exports; and a
  footnote of an embedded section defined outside it is left dangling, as the design's known limit says.
- 2026-10-11: The docs quote three messages holding an em dash (`… is there — replace it?`, `… is a note — …`,
  `clipboard unavailable — wrote …`, the no-terminal refusal): quoted as the code says them.
- 2026-10-11: Done (claude-export): `docs/manual/export.md`, `privacy.md`, `troubleshooting.md`, lint clean at 120
  columns; every key, setting and command named checked in `keys.ts`, `config.ts`, `cli.ts`. Links into other
  chapters are to files, but one anchor: `configuration.md#where-slipbox-keeps-things` (there now).
