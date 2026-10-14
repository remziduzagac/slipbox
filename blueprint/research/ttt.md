---
status: current
created: "2026-10-14"
---

# Research: ttt, a code editor in the terminal

[`eugenioenko/ttt`](https://github.com/eugenioenko/ttt), noted by the user on 2026-10-14 as a competitor or
alternative. Read on 2026-10-14 from its README, docs, source tree, GitHub's data and issues; not installed or run, so
nothing here says how well it works. Its ideas for slipbox are in [ideas.md](../ideas.md) § Editing, § Process, § Extensibility and
§ Distribution.

## Summary

- **Adjacent, not a competitor.** ttt is a general code editor in the terminal, "a real alternative to VS Code, Zed,
  and Sublime" (*read*: README): for writing code, with language servers, multi-cursor editing, a terminal of its own,
  git staging and pull request review. slipbox is for reading, reviewing and editing what an agent writes, with a
  command line and a skill for the agent. Someone would use ttt instead of nvim or VS Code, not instead of slipbox.
- **Rendered Markdown isn't its subject.** Its core renders Markdown only in popups (hover, plugins); a reading view is
  a community plugin, "markdown-preview" (*read*). It has no links between notes, no backlinks, no search across notes.
- **Agents drive its screen, not its content.** `--exec` scripts the UI (keys, typing, a click, waiting for text, a
  screenshot), "a fast Playwright for the terminal", and `--listen` takes the same commands over HTTP on 127.0.0.1
  (*read*: README). No command reads or writes a file for an agent; there is no skill and no capture (*read*).
- **Where it's ahead:** multi-cursor editing, format on save, plugins in a sandbox, packaging (AUR, Nix, Windows) and
  testing (a scripted binary, random-input fuzzing).

## What it is

| What | ttt |
| --- | --- |
| Language and stack | Go 1.25, tcell v3, goldmark (*read*: go.mod) |
| Highlighting | its own Go port of VS Code's TextMate engine, 124 languages (*read*: README) |
| Terminal | a terminal of its own, on its own fork of xterm-go (*read*: README) |
| Keys | VS Code's by default; vim and emacs modes are plugins (*read*: README) |
| Pictures | the Kitty protocol only, not inside tmux; offered to plugins (*read*: plugin-authoring.md) |
| Licence | MIT (*read*: LICENSE) |

**Editing** (*read*: README): multi-cursor, folding, find and replace, `.editorconfig`, and from language servers
completion, rename, references and formatting on save.

**Git** (*read*: README, git log): a Changes panel (stage, commit, pull, push, sync), side-by-side or unified diffs
edited in place, blame in the status bar, history, change marks in the scrollbar (#895, 2026-10-14), and GitHub pull
request review from a URL.

**Plugins** (*read*: README, `community-plugins.json`): Lua, in a sandbox, a permission asked before each capability;
a community registry (a notepad, aspell, a TODO scanner, the Markdown preview). Also a terminal, folders opened
together, and themes and keys in JSON.

**Agents** (*read*: README, `herdr-plugin/README.md`): `--exec`, `--listen`, and a herdr plugin that opens ttt in a
pane. An open issue, #760, asks for AI inline suggestions.

**Tests** (*read*: README): unit tests, tests on a simulated screen, tests driving the real binary through `--exec`,
terminal tests with real language servers, and random-input fuzzing in Docker with replayable logs.

## Distribution and activity

**Installs** (*read*: README): a Homebrew tap, a curl installer, AUR, a Nix flake, `go install`, binaries for Linux,
macOS and Windows; documentation at tttedit.dev.

**Activity** (*read*: GitHub's API, 2026-10-14): created 2026-01-16; 565 stars, 59 forks; 27 releases, the latest
v1.7.1 (2026-10-09); 603 pull requests, 41 open issues; one main author (1431 contributions, the next 34); commits
daily.

## Beside slipbox

| Area | slipbox | ttt |
| --- | --- | --- |
| Its job | read, review and edit what an agent writes | write code, as VS Code does |
| Rendered Markdown | the core: tables, code, diagrams, maths, pictures | a plugin's panel; popups in the core |
| Links and notes | links, backlinks, renames that fix links, search | none |
| For agents | a command line and a skill: search, write, capture, context | `--exec` and `--listen` drive the screen |
| Editing | vim's keys and a desktop editor's, the lens | VS Code's keys, multi-cursor; vim a plugin |
| Language servers | yes | yes, servers managed by plugins |
| A terminal of its own | no (`:!cmd`; herdr beside it) | yes |
| Extending it | settings, themes, keys | Lua plugins in a sandbox, a registry |
| Installs | installer, Homebrew, channels | Homebrew, AUR, Nix, `go install`, Windows |

## Not found out

How good the Markdown preview plugin is (tables, diagrams, links); speed; how well it runs on Windows; how many use it
beyond its stars. Its plugin's source wasn't read, and nothing was run.

## Sources

- [`eugenioenko/ttt`](https://github.com/eugenioenko/ttt): README, `go.mod`, `LICENSE`, `community-plugins.json`,
  `docs/plugin-authoring.md`, `herdr-plugin/README.md`, `internal/widgets/markdown.go`,
  `internal/app/commands_plugin.go`, git log, issues #760 and #895; GitHub's API for the figures (2026-10-14).
