---
status: current
created: "2026-10-24"
---

# Research: a bug report filled in from outside GitHub

What a prefilled address to the bug form can carry, how long it can be, and what slipbox already knows about itself
and its terminal. GitHub's documentation read on 2026-10-24 (through a fetched page's summary); the length measured
the same day with plain `curl` GETs, signed out; slipbox's code and OpenTUI 0.5.14's types read in this worktree.

## Summary

- **The form's text fields fill from the address:** `issues/new?template=bug_report.yml&<field id>=<text>`; a
  field's `id` is its name there (*summary*). Dropdowns aren't said to fill this way: assumed not to, until checked
  in a browser (*summary*, gap below).
- **About 5,500 characters is as long as the address can be:** signed out, GitHub sends it on to sign in and back,
  and a longer address breaks on the way (502, 500), then is refused outright (414) from about 9,000 (*ran*). A screen
  as text (236×60 cells is up to 14,000 characters before encoding) never fits: it has to travel another way.
- **`labels` in the address needs the right to label** (*summary*): a reporter's is ignored or refused, so the
  address carries none; the form adds `bug` itself.
- **slipbox already knows most of the facts:** its version, how it was installed and its channel (`core/install.ts`,
  `core/release.ts`), and the terminal's own answer to who it is, its multiplexer and whether it's remote, as OpenTUI
  asked it at start (*read*).
- **slipbox never opened a browser:** a link to the web is copied, "opening a browser over SSH would be wrong"
  (design/tui.md § Following links) (*read*).

## The address

- `https://github.com/<owner>/<repo>/issues/new` takes `title`, `body`, `labels`, `milestone`, `assignees`,
  `projects` and `template`; "you must have the proper permissions for any action to use the equivalent query
  parameter"; an address too long for the server is answered `414 URI Too Long` (*summary*: docs.github.com, Creating
  an issue, § Creating an issue from a URL query).
- Issue forms: the query can "fill custom text fields that you have defined in issue form templates", and the
  parameters pass through the template chooser too (*summary*: the same page).
- "If provided, the `id` is the canonical identifier for the field in URL query parameter prefills"; ids are
  letters, digits, `-` and `_` (*summary*: docs.github.com, Syntax for GitHub's form schema).
- slipbox's form, `.github/ISSUE_TEMPLATE/bug_report.yml`: `version`, `platform`, `terminal` (inputs), `install` (a
  dropdown: "the installer (install.sh)", "Homebrew", "from source"), `happened`, `expected`, `steps`, `output`
  (textareas; `output` is `render: text`, put in a code block by GitHub) (*read*).
- How long (*ran*, 2026-10-24, signed out, `template=bug_report.yml&happened=<n × "a">`): up to 5,500 characters of
  text, 302 (to sign in); 5,800 to 6,500, 502; 7,000 and 7,500, 500; 8,000, the connection dropped; 9,000 and more,
  414. Signed in, the redirect doesn't happen, so it may reach further; unmeasured.

## What slipbox knows

- **Version:** `VERSION` (`src/version.ts`); a preview's carries `-preview.<time>.g<hash>` (`PREVIEW_VERSION`,
  `core/release.ts`) (*read*).
- **Installed by:** `installedBy(execPath, data, version)` — `installer` (its `versions/<v>/slipbox`), `homebrew` (a
  Cellar path), `other`; `RELEASE` null means run from source or built by hand (*read*: `core/install.ts`,
  `core/release.ts`).
- **Channel:** `readChannel(data)` for the installer's install; Homebrew's and source's have none (`noChannel`)
  (*read*).
- **The terminal, in the TUI:** OpenTUI's `renderer.capabilities` holds `terminal: { name, version, from_xtversion }`,
  `multiplexer` (`none`, `tmux`, `zellij`, `screen`, `unknown`) and `remote` (*read*: `@opentui/core` 0.5.14,
  `types.d.ts`); it reads `SSH_CONNECTION`, `SSH_CLIENT`, `SSH_TTY` for that (*read*: its bundled source).
- **The environment:** `TERM_PROGRAM` and `TERM_PROGRAM_VERSION` name the innermost program that set them, a
  multiplexer included: under herdsman, `TERM_PROGRAM=herdsman`, `TERM=xterm-ghostty` (*ran*, this pane); herdsman and
  herdr set `HERDSMAN_ENV` / `HERDR_ENV`, tmux `TMUX`, zellij `ZELLIJ`, screen `STY` (*ran* for herdsman; *memory* for
  the others).
- **The screen as text:** `drawApp(app, canvas)` draws onto any `Canvas`; `TextCanvas` (the unit tests') keeps the
  characters, and `toString()` gives the rows, trailing blanks cut (*read*: `tui/draw.ts`, `tui/canvas.ts`).
- **The clipboard:** OSC 52 first (the only way to the local clipboard over SSH), then the system's tool, then a file
  in the state folder, said (*read*: `core/clipboard.ts`, plan `8.5`).

## Gaps

- Whether a dropdown (`install`) fills from the address: not in the documentation read. The design passes it anyway
  and says how it was installed in the version's text too, so nothing is lost either way; checked in a browser before
  the docs promise it.
- How long the address may be when signed in: not measured (no session here); 5,000 is kept for everyone.
- `gh issue create` by someone who can't label: `--label` left out rather than tested against another account.

## Sources

- docs.github.com: Creating an issue (§ Creating an issue from a URL query); Syntax for GitHub's form schema;
  Syntax for issue forms (2026-10-24).
- github.com/remziduzagac/slipbox/issues/new, measured with `curl` (2026-10-24).
- This repository: `.github/ISSUE_TEMPLATE/bug_report.yml`, `src/core/install.ts`, `src/core/release.ts`,
  `src/core/clipboard.ts`, `src/tui/draw.ts`, `src/tui/canvas.ts`, `src/tui/run.ts`; `@opentui/core` 0.5.14.
