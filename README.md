<p align="center"><img src="assets/logo.svg" alt="" width="96"></p>
<h1 align="center">slipbox</h1>
<p align="center">
  <a href="https://github.com/remziduzagac/slipbox/actions/workflows/ci.yml"><img
    src="https://github.com/remziduzagac/slipbox/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI status"></a>
</p>

**The terminal companion for coding agents.**

Read, review and edit what your agent writes — with Markdown and code rendered cleanly, an editor that's necessary
and sufficient, and agent integration built in.

slipbox sits beside Claude Code, Codex, or any agent that runs shell commands. Follow an idea from the first plan to
the code that implements it. Read comfortably, review what changed, and make edits of your own. Tables fit the window
and code is highlighted; pictures, diagrams and maths sit alongside your writing; themes, keys and settings make the
workspace yours.

Editing is **intuitive yet innovative**: the lens opens the Markdown around your cursor for editing while the rest
stays rendered. Stay where you were reading, keep the surrounding document in view, and focus on the change.

The editor is **necessary and sufficient**: the everyday editing tools, from selections, undo and find-and-replace to
completion, language servers, linters and spelling. Your own editor is a key away whenever you want more.

Use vim's keys or familiar editor shortcuts, and discover the rest as you go: `space` opens a menu of actions, `?`
shows every key, and `:` opens the command palette. Everything is clickable too.

The agent works on the same files through slipbox's command line and bundled skill: searching, following links and
making changes, with guarded writes that refuse to replace a file changed since the agent read it. What the agent
saves appears at once; if a file changes while you have unsaved edits, slipbox asks what to keep.

Gather references and excerpts in the scratch, each with its file path and line numbers. Build your next prompt while
keeping your document focused.

Open the folder you already have — a repository, an Obsidian vault, a zk notebook or an ordinary folder. Opening it
writes nothing there: your notes and code stay in their files, alongside the tools you already use.

- **Start here:** [Getting started](docs/guides/getting-started.md), a first session of about ten minutes, once
  [Installing slipbox](docs/guides/install.md) has it on your machine. [The documentation](docs/README.md) has the
  rest.
- **Status:** every phase on the [roadmap](blueprint/roadmap.md) is built: reading, editing, search, roots and named
  folders, git and merge review, language servers and linters, export. Releases are published, with previews of the
  next one between them. slipbox is before 1.0: [Versions](docs/manual/versions.md) says what may still change.
- **Help:** the documentation, and its [troubleshooting chapter](docs/manual/troubleshooting.md) for the usual
  problems. Questions and ideas go in [Discussions](https://github.com/remziduzagac/slipbox/discussions); a bug in an
  [issue](https://github.com/remziduzagac/slipbox/issues/new/choose); a security problem privately, as
  [SECURITY.md](SECURITY.md) says, never in an issue.
- **Contributing:** anyone may open an issue; pull requests come from collaborators. [MAINTAINING.md](MAINTAINING.md)
  says how slipbox is maintained.

## Install

On macOS and Linux (Windows through WSL), one line, and nothing else needed:

```bash
curl -fsSL https://remziduzagac.github.io/slipbox/install.sh | sh                   # the latest release
curl -fsSL https://remziduzagac.github.io/slipbox/install.sh | sh -s -- --preview   # the newest preview
```

The first installs the latest release; the second, the newest preview, a build of what the next release will hold.
`slipbox upgrade` keeps it current, and `slipbox channel` says, and changes, whether it follows previews. With
Homebrew, from 0.3.0 on: `brew install remziduzagac/tap/slipbox`.
[Installing slipbox](docs/guides/install.md) has the rest: previews, Windows through WSL, upgrading and removing it,
and running it from source.

## Try it

Open a folder you already have, your notes or a repository your agent works in:

```bash
slipbox ~/notes
```

![slipbox with the explorer, a note's properties and headings, and its outline](docs/images/screen-map.png)

A reading cursor moves with vim keys or the usual editor keys. `space` opens a menu of everything else, and `?` lists
every key:

- **Moving:** `h` `j` `k` `l` or the arrows; `w`/`b` or `ctrl+right`/`ctrl+left` by word; `[ [` / `] ]` or
  `alt+up`/`alt+down` by heading.
- **Links:** `enter` follows the link under the cursor; `ctrl+o` (or `space h p`) goes back, `space h n` forward.
- **Finding and copying:** `ctrl+p` switches notes, `ctrl+f` finds, `ctrl+h` finds and replaces (or vim's
  `:%s/old/new/g`), `ctrl+shift+h` in every note, `:` opens the command palette, and `v` selects then `y` copies.
- **Panes:** `space e` explorer and `space o` outline (each opens, then focuses, then closes; `esc` returns to the
  note), `ctrl+w v` split, `ctrl+t c` new tab. Everything is clickable too.
- **Editing:** `i`, `a` or `o` open the lens, the Markdown around the cursor between two rules with the rest left
  rendered, and the key again starts typing there; `ctrl+k` (or `space n v`) shows the whole note as Markdown, source
  mode, and back. The vim commands work (`dw`, `ciw`, `p`, `u`, `.`); `ctrl+s` saves, and autosave does after a pause.
  `ctrl+l` (or `space n t`, or a click) ticks a task; `space n e` hands the note to your editor, `space n s` to a
  running nvim.
- **Quitting:** `ctrl+q`, and slipbox remembers where you were.

Every key is in [Keys](docs/manual/keys.md), and all of them are configurable
([Configuration](docs/manual/configuration.md)). The configuration reloads itself when you save it.

[Getting started](docs/guides/getting-started.md) walks through a first session, and
[Links and roots](docs/manual/links-and-roots.md) explains how links find their notes, across folders too.

## For agents

On the demo folder (`cd examples/vault`; `bun ../../src/main.ts` if `slipbox` isn't installed):

```bash
slipbox resolve 'equipment/telescope-comparison.md#Summary' --from home.md --json
slipbox backlinks telescope-comparison --json
slipbox find 'Aster' --json                  # a note's text, or every note's
slipbox read home --json                     # the raw text and its sha
slipbox write home --stdin --if-unchanged <sha> < new.md
slipbox replace home Aster Astra --dry-run --json
slipbox task 2026-09-14-weekly 17 --check
slipbox write observing-log-2026 --append -- '- 22:10 seeing 2"'
slipbox stat home --json                     # size, dates, title, link counts
slipbox links --all --json                   # every link, and whether it resolves and how
slipbox link telescope-comparison --from home --json   # a link to write, in this folder's convention
slipbox resolve slipbox://halden/home.md --json        # a named folder's file, wherever it is here
slipbox capture --ref ../../src/main.ts:1-3 --snippet
slipbox render home --plain
```

One JSON object per call with `--json`; stable exit codes. The skill in
[skills/slipbox/SKILL.md](skills/slipbox/SKILL.md) teaches the surface to agents, and slipbox carries it:
`slipbox skill --install ~/.claude/skills` installs the one matching the binary;
[Working with agents](docs/guides/agents.md) and [The command line](docs/manual/cli.md) are the people's side.

## Documentation

- [docs/](docs/README.md): the user documentation: guides to start with, and a manual covering every key, setting
  and command.
- [CHANGELOG.md](CHANGELOG.md): what each release changed.
- [ARCHITECTURE.md](ARCHITECTURE.md): a map of the code, for whoever changes it.
- [ACCESSIBILITY.md](ACCESSIBILITY.md): what the TUI does for accessibility, and its limits.
- [blueprint/](blueprint/README.md): the design: requirements, how it works, the decisions behind it, the roadmap.

## Development

From source, with [Bun](https://bun.sh) 1.4.2 or later:

```bash
bun install
bun src/main.ts examples/vault   # the TUI, on the demo folder
scripts/install-local.sh         # a `slipbox` launcher in ~/.local/bin
```

To check a change:

```bash
bun run check          # typecheck, the core-never-imports-tui boundary, dependencies, lint, the docs' lint,
                       # spelling and links, tests
bun run test:terminal  # the terminal tests: slipbox itself, driven by keys in headless terminals
```

The test strategy, the demo folder (`examples/vault`) and the terminal tests are in
[blueprint/design/testing.md](blueprint/design/testing.md).

## Licence

slipbox is licensed under the [Apache License 2.0](LICENSE). Each release carries the licence and `NOTICES.txt`, the
third-party software built into the binary and their licences; beside each build, its SBOM lists the same in
CycloneDX's format.
