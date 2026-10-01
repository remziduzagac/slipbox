# The LSP face

`slipbox lsp` serves vaults to an editor over the Language Server Protocol (plan `11.x`; why, in the plan's "Phase 5
decided 2026-10-01"): nvim, or any editor, gets slipbox's graph — the same core the TUI and the CLI answer from. Later
this document also covers slipbox's own client for code languages (`19.x`), below.

## Starting it

`slipbox lsp` speaks on stdio. `--config <file>` names the user config, as for the CLI; `--stdio` and
`--clientProcessId` are taken and ignored, since editors pass them by habit. Nothing but the protocol reaches stdout:
slipbox's own news — a config problem, a walk error, a watcher falling back to polling — goes to the editor's log
(`window/logMessage`), never a pop-up.

## Vaults only

A file belongs to the nearest folder above it with `.slipbox/`, as in the TUI and the CLI. A file outside every vault
gets nothing from slipbox: markdown elsewhere is left to whatever else the editor runs there (marksman). The workspace
folders the editor names at `initialize` are opened once it says it's ready (`initialized`), so its first request
doesn't wait on a walk; any other vault opens when a file of it first comes up. Each one opened is recorded as seen on
this machine (`17.6`), as the TUI and the CLI record theirs.

Each vault's graph is the TUI's: the persisted index read and refreshed, other vaults reached through the machine's
list (`17.8`), an alias counted whichever note was parsed first (`17.7`). The TUI's watcher keeps it current, and
`core/vault-feed.ts` — the TUI's own handling of git, shared — holds the watcher's news while git writes and doesn't
take a branch switch's files for moves (`5.9`, `5.10`). A server and a TUI on one vault see the same vault.

## The session

- **`initialize`** answers with `serverInfo` (`slipbox` and its version) and incremental document sync: open, change,
  close and save.
- **Ending it:** `shutdown` then `exit` is exit 0; `exit` without `shutdown`, or the editor's pipe closing, is 1, as
  the protocol has it.
- **An editor gone without a word:** the process id `initialize` gives is looked at every 3 seconds, and the server
  ends when it's no longer there.

## Unsaved text

An editor's open note stands for the note as the editor has it (`11.8`): its links, headings, tags and names count —
for this note's requests and for others', so a link typed and not yet saved is already a backlink. Its text counts as
soon as it opens, then again once typing pauses for 150 ms: a parse per pause, not per key, and a request about the
note asks for its latest text first. Closing it gives the file back.

Only the server's answers see it. The persisted index keeps the file's entry, moves are known by the file's text, and
the file changing under an open note (an agent's write) leaves the editor's text standing until the editor reloads. So
"disk is the contract" (`9.4`) still holds for the CLI and the TUI, which the editor's unsaved text never reaches.

## What it serves

Every answer is about a note as the editor has it, and a request takes its latest text first.

- **Definition** (`11.3`): on a link — `[[note]]`, `[[note#Heading]]`, `[[note#^block]]`, `![[embed]]`, `[x](path.md#heading)`,
  `[[vault:note]]` — its note (or file), at the heading's or the block's line; each candidate of an ambiguous link, so
  the editor offers the list; this note's heading for `[[#Heading]]` and `[x](#heading)`. A link holds the position of
  each of its characters, the last included; external and unresolved links go nowhere.
- **References** (`11.3`): anywhere in a note, every link to it — its title heading included, which stands for the
  note; on another heading's line, the links to that heading (a markdown link's `#fragment` by its slug), this note's
  own `[[#Heading]]` among them; on a link, the links to where it goes. With the declaration asked for, the note's top
  or the heading's line comes first.
- **Hover** (`11.3`): on a link, where it lands as the note has it now — its start without the frontmatter, a
  heading's section (up to the next heading as high), or a block with its `^id` taken off — fenced, at most 20 lines
  and `…`; with the note's path, and how it was reached when not by name (an alias, a previous name, a redirect). An
  ambiguous link lists its candidates, an unresolved one says why (`no note named x yet`, an unknown vault), and an
  external one shows its URL.
- **Completion** (`11.3`), on `[`, `#` and `^` as they're typed:
  - after `[[`, the notes whose name, title, alias or path holds every word typed — each written the way a link from
    here reaches it (its name, or its path when another note shares the name), an alias as `name|alias`; after
    `![[`, the vault's other files too. At most 100 at a time, the list marked incomplete so typing asks again;
  - after `[[note#`, its headings; after `[[note#^`, its blocks, each previewed; `[[#` is this note's;
  - after a `#` that starts a word, the tags notes carry, with how many — not the one being typed, and not after a
    `#` alone at a line's start, where a heading begins;
  - `]]` is added unless the editor put it there already.

  Notes are parsed in the background once a vault opens, a little at a time, so their titles and aliases are known
  by the time `[[` is typed; a completion before then reads the rest first.
- **Diagnostics** (`11.5`), sent for each open note as it opens, once typing pauses, and again whenever its vault
  changes — a note made or gone on disk, a heading typed in another open note — then cleared when it closes:

  | Problem | Severity | Code |
  | --- | --- | --- |
  | `[[name]]` with no note yet (a note to write, in a vault) | information | `unresolved` |
  | `[x](missing.md)`, an unknown vault (`[[nowhere:x]]`) | warning | `unresolved` |
  | a link several notes answer to, with them named | warning | `ambiguous` |
  | `#Heading` or `#^block` its note hasn't (a markdown link's `#slug` too) | warning | `no-heading`, `no-block` |
  | git's conflict markers, `<<<<<<<` to `>>>>>>>` | error | `conflict` |

  With `[lsp] lint = true`, the lint surface's findings (`3.21`) join them as warnings from `markdownlint`, run when
  a note opens and when it's saved, and shown only while its text is what was linted. Off by default: the editor
  most likely runs that linter already.
- **Symbols** (`11.6`): a note's outline is its headings, each holding the ones under it and spanning its section
  (to the next heading as high, or the note's end). Across the vault, a query finds the notes whose name, title or
  alias holds every word, then the headings that do — notes first, 200 at most; an empty query lists the notes.
- **Rename** (`11.4`): on a link to a note of this vault, that note — renamed in its own folder, or moved when the
  new name has a `/` (a path from the vault's root) — planned as the TUI and `slipbox mv` plan it: every link to it
  fixed in every vault reached, its old name kept in `previous_names`. The answer is an edit, each file's changed
  lines then the file's move, which the editor previews and applies; slipbox writes nothing, so it isn't in
  slipbox's undo (`7.4`) — the editor's undo and git have it. Refused, with why, when a file it changes has unsaved
  changes in the editor (the plan is made from the files), when the editor can't move a file in an edit, or when
  the new name is taken. On a heading's line, the heading (`11.9`): its text is what's offered, and the rename is
  `slipbox rename-heading`'s — its line and every link to it, in their forms — an edit with no move, so any editor
  can apply it. Elsewhere there's nothing to rename.
- **A file moved in the editor** (`11.10`): a note, a file or a folder moved in the editor's file tree — oil.nvim,
  snacks.nvim's rename (LazyVim's `space c shift+r`), neo-tree with nvim-lsp-file-operations, VS Code — is asked
  about first (`workspace/willRenameFiles`), and every link to it is fixed in an edit the editor applies before it
  moves anything; a lone note's old name is kept in its `previous_names`. The move itself is the editor's. A file
  with unsaved changes in the editor is left out of the edit and the editor told — `slipbox relink` fixes its links
  once it's saved — and a move out of the vault fixes nothing.
- **Code actions** (`11.11`): on a link to a note not written yet, *Make the note* — beside this one (from the vault's
  root when the link has a path), its name a heading, as the TUI makes it — when the editor makes files an edit names;
  on an ambiguous link, *Link to* each of its notes, the link rewritten with the path (its `#heading` and `|text`
  kept); anywhere, *Copy this note's context for an agent* (`slipbox.context`, `9.7`): the bundle written to the
  vault's state as `context.md`, copied by the system's clipboard tools when there are any — never OSC 52, whose
  sequence would land in the editor's own terminal — and opened in the editor when it can, the message saying
  where.

## Setting up nvim (`11.12`)

Two servers, each where it belongs: slipbox in a vault — a folder with `.slipbox/` above the file — and marksman (or
whatever else serves markdown) outside one. `workspace_required` keeps nvim from starting slipbox for a lone file
when no `.slipbox/` is found; marksman's `root_dir` declines a vault's files. `slipbox` must be on nvim's `PATH`
(`scripts/install-local.sh` puts a launcher in `~/.local/bin`). Checked with nvim 0.12, both ways.

With LazyVim, a plugin spec (`lua/plugins/slipbox.lua`); LazyVim hands each server's options to `vim.lsp.config`
and enables the ones Mason doesn't install:

```lua
return {
  "neovim/nvim-lspconfig",
  opts = {
    servers = {
      slipbox = {
        cmd = { "slipbox", "lsp" },
        filetypes = { "markdown" },
        root_markers = { ".slipbox" },
        workspace_required = true,
      },
      marksman = {
        root_dir = function(buf, on_dir)
          if vim.fs.root(buf, ".slipbox") then return end -- slipbox's
          on_dir(vim.fs.root(buf, { ".marksman.toml", ".git" }) or vim.fs.dirname(vim.api.nvim_buf_get_name(buf)))
        end,
      },
    },
  },
}
```

Without a distribution (nvim 0.11 or later), the same through `vim.lsp.config`:

```lua
vim.lsp.config("slipbox", {
  cmd = { "slipbox", "lsp" },
  filetypes = { "markdown" },
  root_markers = { ".slipbox" },
  workspace_required = true,
})
vim.lsp.enable("slipbox")
```

and marksman's `root_dir` as above. LazyVim's keys then reach slipbox: `gd` follows a link, `gr` lists what links
here, `K` previews where a link lands, `space c r` renames the note a link names or the heading under the cursor,
`space c a` offers the code actions, `space c shift+r` (snacks.nvim's rename) moves the file with its links fixed,
`space s s` and `space s shift+s` find headings and notes, and `[[` completes as it's typed.

## The client for code (`19.x`)

slipbox is a client of the language servers of the code it opens (the plan's "Phase 5 decided 2026-10-01").

**One server** (`19.1`, `core/servers/client.ts`) is started on stdio in the project's top folder, its stderr kept
(the last of it says why when it fails), and initialized as slipbox: positions in UTF-16, the capabilities slipbox
uses. Its settings answer its `workspace/configuration` questions, by section (`python.analysis`), and go with
`didChangeConfiguration` once it's ready — a server asked and answered nothing checks nothing. A file is sent whole
at each change, which every server takes. Its diagnostics come both ways: sent (`publishDiagnostics`), or asked for
after each open, change and save from a server that wants that (`textDocument/diagnostic`, LSP 3.17) — an answer
about an older text than the last sent is dropped. Its log and messages go to slipbox's; an edit it asks to make is
declined until slipbox makes edits for servers (`19.15`). Asked to ask again (`workspace/diagnostic/refresh`, which
pyright sends), it asks about every open file; anything else it's asked and doesn't know gets an empty answer, never
an error — pyright crashed on that error, unhandled. Stopping it is `shutdown` then `exit`, then a kill; an
exit that wasn't asked for is a crash, said with its last error line.

**Which servers** (`19.2`, `core/servers/languages.ts`): a file's language is its whole name (`Dockerfile`), else
its extension, and each language has root markers and servers — the first that applies and is found is its main
server, and add-ons, a linter's server each, run beside it where the project has that linter's config
(`eslint.config.js`, `biome.json`, `.stylelintrc`, `ruff.toml` or `[tool.ruff]` in `pyproject.toml`). Built in:

| Languages | Servers, the main first (npm: installed when missing) |
| --- | --- |
| TypeScript, JavaScript, TSX, JSX | TypeScript 7's own (npm), vtsls for an older TypeScript (npm); eslint, biome |
| Python | pyright (npm); ruff |
| Rust, Go, Lua | rust-analyzer, gopls, lua-language-server |
| bash | bash-language-server (npm) |
| JSON, YAML, TOML | vscode-json-language-server (npm), biome; yaml-language-server (npm); taplo |
| CSS, SCSS, Less, HTML | vscode-css-language-server (npm), stylelint, biome; vscode-html-language-server (npm) |
| Dockerfile, PHP | docker-langserver (npm); intelephense (npm) |
| Swift, C, C++, Ruby | sourcekit-lsp; clangd; ruby-lsp |

TypeScript 7 is native with its server built in (`tsc --lsp --stdio`): it's used where the project's TypeScript is
7 or there is none, and vtsls, its own TypeScript bundled, where the project's is older. Each server's settings by
default are nvim-lspconfig's where it has some. The user's config changes them in Helix's `languages.toml` shape —
`[language-server.<name>]` (`command`, `args`, `config`, `environment`, `required-root-patterns`) and
`[[language]]` (`name`, `language-servers`, `roots`, `file-types`, `language-id`), a server's `config` merged over
the defaults, the rest replaced, a new name added. A vault's config may tune a known server's `config` and a
language's lists, never name what runs: its `command`, `args`, `environment`, and any server slipbox doesn't
know, are ignored with a warning.

**Where its project is** (`19.3`): the nearest folder above the file holding the language's first root marker, then
its next — `tsconfig.json` before `package.json` before `.git` — as nvim's `root_markers` have it; never `~` or `/`;
else the file's own folder.

**Where its program is** (`19.4`), in order: the path the user's config gives; the project's own
(`node_modules/.bin`, `.venv/bin`, `venv/bin`, `vendor/bin`, from its folder up to its checkout's top); `PATH`; the
places the user installs tools (Mason's `bin`, `~/.cargo/bin`, `~/go/bin`, `~/.local/bin`); slipbox's own installs.
A program written for Node (`#!/usr/bin/env node`) runs on slipbox's own Bun — no Node needed. A server whose
program's name is common elsewhere is taken only from the project or slipbox's installs: a `tsc` on `PATH` may be an
older TypeScript with no server. Everything is trusted
(`19.6`): the project's own programs run, and its servers run its code, as under nvim or Helix.

**Installing** (`19.5`, `core/servers/install.ts`): a server published on npm and found nowhere is installed when a
file first needs it — `[lsp] auto_install = false` stops that — into slipbox's own package folder
(`$XDG_DATA_HOME/slipbox/tools`), at the version slipbox pins, with its install scripts off and nothing global, by
slipbox's own Bun (the compiled binary is Bun when told to be), one install at a time. A native server is never
installed: found, or named in the config — the system is the user's.

**The servers of open files** (`19.1`, `core/servers/manager.ts`): one client per server and project, started when a
file of its language in that project is first shown — installed first when it must be — and told about each such
file as it opens, again 150 ms after typing pauses (never per key), and when it's saved; a file gone with a vault
switch or a rename is closed in it. Its diagnostics become the file's problems, in the bar, the marks and the status
line ("Problems where they are" in [tui.md](tui.md)). A server that crashes is started again and told its files
again; one that crashes more than three times in five minutes is left stopped, and said so. A server that's missing
is said once: a native one to install yourself, an npm one when installing is off. Quitting kills them; `[lsp]
enabled = false` runs none.

