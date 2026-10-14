<p align="center"><img src="assets/logo.svg" alt="" width="96"></p>
<h1 align="center">slipbox</h1>
<p align="center">
  <a href="https://github.com/remziduzagac/slipbox/actions/workflows/ci.yml"><img
    src="https://github.com/remziduzagac/slipbox/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI status"></a>
</p>

**The terminal companion for coding agents.**

Read, review and edit what your agent writes. Markdown and code are rendered cleanly, the editor is necessary and
sufficient, and agent integration is built in.

![slipbox on a repository's design doc: the agent's change marked beside its lines, the lens open on its new line
while you type, and the scratch on the right holding the code and the decision it cited](docs/images/readme-hero.png)

slipbox sits beside Claude Code, Codex, or any agent that runs shell commands. Follow an idea from the first plan to
the code that implements it. Read comfortably, review what changed, and make edits of your own. Tables fit the window,
and code is highlighted. Pictures, diagrams and maths sit alongside your writing. Themes, keys and settings make the
workspace yours.

Editing is **intuitive yet innovative**. The lens opens the Markdown around your cursor for editing, while the rest
stays rendered. Stay where you were reading, keep the surrounding document in view, and focus on the change.

The editor is **necessary and sufficient**. It has the everyday editing tools, from selections, undo and
find-and-replace to completion, language servers, linters and spelling. Your own editor is a key away whenever you
want more.

Use the arrow keys and the shortcuts you know from other editors, or vim's keys, and discover the rest as you go.
`space` opens a menu of actions, `?` shows every key, and `:` opens the command palette. Everything is clickable too.

The agent works on the same files, through slipbox's command line and bundled skill. It searches, follows links and
makes changes. Its writes are guarded: they refuse to replace a file changed since the agent read it. What the agent
saves appears at once. If a file changes while you have unsaved edits, slipbox asks what to keep.

Gather references and excerpts in the scratch, each with its file path and line numbers. Build your next prompt while
keeping your document focused.

Open the folder you already have: a repository, an Obsidian vault, a zk notebook or an ordinary folder. Opening it
writes nothing there. Your notes and code stay in their files, alongside the tools you already use.

- **Start here:** get slipbox on your machine with [Installing slipbox](docs/guides/install.md). Then the
  [Quick start](docs/guides/quick-start.md) takes two minutes. The documentation is a website, with search:
  <https://remziduzagac.github.io/slipbox/docs/>.
- **Status:** every phase on the [roadmap](blueprint/roadmap.md) is built: reading, editing, search, vaults and named
  folders, git and merge review, language servers and linters, and export. Releases are published, with previews of
  the next one between them. slipbox is before 1.0. [Versions](docs/manual/versions.md) says what may still change.
- **Help:** the documentation, and its [troubleshooting chapter](docs/manual/troubleshooting.md) for the usual
  problems. Questions and ideas go in [Discussions](https://github.com/remziduzagac/slipbox/discussions). A bug goes
  in an [issue](https://github.com/remziduzagac/slipbox/issues/new/choose). A security problem goes privately, as
  [SECURITY.md](SECURITY.md) says, never in an issue.
- **Contributing:** anyone may open an issue. Pull requests come from collaborators. [MAINTAINING.md](MAINTAINING.md)
  says how slipbox is maintained.

## Install

On macOS and Linux (and Windows through WSL), one line installs slipbox, with nothing else needed:

```bash
curl -fsSL https://remziduzagac.github.io/slipbox/install.sh | sh                   # the latest release
curl -fsSL https://remziduzagac.github.io/slipbox/install.sh | sh -s -- --preview   # the newest preview
```

The first line installs the latest release. The second installs the newest preview, a build of what the next release
will hold.

`slipbox upgrade` keeps it current. `slipbox channel` says whether it follows previews, and changes that.

With Homebrew, from 0.3.0 on, run `brew install remziduzagac/tap/slipbox`.

[Installing slipbox](docs/guides/install.md) has the rest: previews, Windows through WSL, upgrading and removing it,
and running it from source.

## Try it

Open a folder you already have, your notes or a repository your agent works in:

```bash
slipbox ~/notes
```

![slipbox with the explorer, a note's properties and headings, and its outline](docs/images/screen-map.png)

A reading cursor moves with the arrow keys and the usual editor shortcuts, or with vim's keys. `space` opens a menu of
everything else, and `?` lists every key. These are the keys to start with:

| To | Press |
| --- | --- |
| Move | the arrows or `h` `j` `k` `l` |
| Move by word | `ctrl+right`/`ctrl+left` or `w`/`b` |
| Move by heading | `alt+up`/`alt+down` or `[ [` / `] ]` |
| Follow the link under the cursor | `enter` |
| Go back | `ctrl+o` (or `space h p`) |
| Go forward | `space h n` |
| Switch notes | `ctrl+p` |
| Find | `ctrl+f` |
| Find and replace | `ctrl+h` (or vim's `:%s/old/new/g`) |
| Find and replace in every note | `ctrl+shift+h` |
| Open the command palette | `:` |
| Select, then copy | `shift` with an arrow, then `ctrl+c` (or `v`, then `y`) |
| Open, then focus, then close the explorer | `space e` |
| Open, then focus, then close the outline | `space o` |
| Return to the note from the explorer or the outline | `esc` |
| Split the window | `ctrl+w v` |
| Open a new tab | `ctrl+t c` |
| Open the lens, then start typing there | `i`, `a` or `o`, then the same key again |
| Show the whole note as Markdown (source mode), and back | `ctrl+k` (or `space n v`) |
| Save | `ctrl+s` |
| Tick a task | `ctrl+l` (or `space n t`, or a click) |
| Hand the note to your editor | `space n e` |
| Hand the note to a running nvim | `space n s` |
| Quit | `ctrl+q` |

Everything is clickable too.

The lens shows the Markdown around the cursor between two rules, with the rest left rendered. The vim commands work
(`dw`, `ciw`, `p`, `u`, `.`), and autosave saves after a pause. When you quit, slipbox remembers where you were.

[Keys you already know](docs/guides/keys-you-know.md) lists the shortcuts from other editors. Every key is in
[Keys](docs/manual/keys.md), and all of them are configurable
([Configuration](docs/manual/configuration.md)). The configuration reloads itself when you save it.

[Getting started](docs/guides/getting-started.md) walks through a first session.
[Links and vaults](docs/manual/links-and-vaults.md) explains how links find their notes, across folders too.

## For agents

These commands run on the demo folder. Go there with `cd examples/vault`. If `slipbox` isn't installed, use
`bun ../../src/main.ts` in its place.

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

With `--json`, each call gives one JSON object. The exit codes are stable.

The skill in [skills/slipbox/SKILL.md](skills/slipbox/SKILL.md) teaches the surface to agents, and slipbox carries
it. `slipbox skill --install ~/.claude/skills` installs the one matching the binary.

For you, the same ground is in [Working with agents](docs/guides/agents.md) and
[The command line](docs/manual/cli.md).

## Documentation

- [docs/](docs/README.md): the user documentation, with guides to start with, and a manual covering every key,
  setting and command. It's also on its website, <https://remziduzagac.github.io/slipbox/docs/>.
- [CHANGELOG.md](CHANGELOG.md): what each release changed.
- [ARCHITECTURE.md](ARCHITECTURE.md): a map of the code, for whoever changes it.
- [ACCESSIBILITY.md](ACCESSIBILITY.md): what the TUI does for accessibility, and its limits.
- [CONTRIBUTING.md](CONTRIBUTING.md): how to report a bug, ask a question or suggest an idea, and the [code of
  conduct](CODE_OF_CONDUCT.md).
- [blueprint/](blueprint/README.md): the design, with its requirements, how it works, the decisions behind it and the
  roadmap.

## Development

To run slipbox from source, you need [Bun](https://bun.sh) 1.4.2 or later:

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

[blueprint/design/testing.md](blueprint/design/testing.md) describes the test strategy, the demo folder
(`examples/vault`) and the terminal tests.

## Thanks

slipbox's rendering was measured against [leaf](https://github.com/RivoLink/leaf), RivoLink's lightweight Markdown
reader for the terminal: it set the bar for how Markdown should look there. If reading is all you need, leaf is the
one to use.

## Licence

slipbox is licensed under the [Apache License 2.0](LICENSE). Each release carries the licence and `NOTICES.txt`.
`NOTICES.txt` lists the third-party software built into the binary, and their licences. Beside each build, its SBOM
lists the same in CycloneDX's format.
