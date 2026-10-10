# Language servers for code

slipbox is a client of the language servers of the code it opens (`19.x`). It served notes to editors too, as `slipbox
lsp` (the LSP face, `11.x`), until links became plain paths (`20.23`, 2026-10-02): editors' own markdown servers follow
path links, a move made in an editor is repaired from the watcher, and agents use the CLI.

## The client for code (`19.x`)

slipbox is a client of the language servers of the code it opens (the plan's "Phase 5 decided 2026-10-01").

**One server** (`19.1`, `core/servers/client.ts`) is started on stdio in the project's top folder, its stderr kept
(the last of it says why when it fails), and initialized as slipbox: positions in UTF-16, the capabilities slipbox
uses. Its settings answer its `workspace/configuration` questions, by section (`python.analysis`), and go with
`didChangeConfiguration` once it's ready — a server asked and answered nothing checks nothing. A file is sent whole at
each change, which every server takes. Its diagnostics come both ways: sent (`publishDiagnostics`), or asked for after
each open, change and save from a server that wants that (`textDocument/diagnostic`, LSP 3.17) — an answer about an
older text than the last sent is dropped. Its log and messages go to slipbox's; an edit it asks to make (a code
action's command does) is made, through slipbox's own writes (`19.15`, `applyWorkspaceEdit`). Asked to ask again
(`workspace/diagnostic/refresh`, which pyright sends), it asks about every open file; so it does, a moment later,
when such a server says some work of its has ended (`$/progress`): rust-analyzer's first answer, before its workspace
loads, is empty, and without `cargo check` (a root you don't trust) it asks nothing after. Anything else it's asked and
doesn't know gets an empty answer, never an error — pyright crashed on that error, unhandled. Stopping it is
`shutdown` then `exit`, then a kill; an exit that wasn't asked for, once it is running, is a crash, said with its last
error line. One that exits before it answers `initialize`, or doesn't answer in 20 s, failed to start: said once, with
its last error line, and not started again.

**Which servers** (`19.2`, `core/servers/languages.ts`): a file's language is its whole name (`Dockerfile`), else
its extension, and each language has root markers and servers — the first that applies and is found is its main
server, and add-ons, a linter's server each, run beside it where the project has that linter's config
(`eslint.config.js`, `biome.json`, `.stylelintrc`, `ruff.toml` or `[tool.ruff]` in `pyproject.toml`). A linter's
server runs the project's linter: eslint's server loads the project's ESLint (8.57 or 9, flat config or `.eslintrc`,
as that ESLint decides), stylelint's reads the project's config and its plugins, and biome is the project's own
`node_modules/.bin/biome` when it has one. Their findings, fixes and rule suppressions come as any server's
(`space c a`). Built in:

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

TypeScript 7 is native with its server built in (`tsc --lsp --stdio`): it's used where the project's TypeScript is 7 or
there is none, and vtsls, its own TypeScript bundled, where the project's is older. Each server's settings by default
are nvim-lspconfig's where it has some. The user's config changes them in Helix's `languages.toml` shape —
`[language-server.<name>]` (`command`, `args`, `config`, `environment`, `required-root-patterns`) and `[[language]]`
(`name`, `language-servers`, `roots`, `file-types`, `language-id`), a server's `config` merged over the defaults (and
each config file's over the ones before it) all the way down, the rest replaced, a new name added; a field of the wrong
type is dropped with a warning, and so is a known field spelled with underscores (`file_types`). A field slipbox doesn't
read is kept without a warning, so a Helix section pastes in. A folder's config may tune a known server's `config` and a
language's lists, never name slipbox's command for it: its `command`, `args`, `environment`, and any server slipbox
doesn't know, are ignored with a warning. That `config` reaches the server in a root you trust — and some servers'
settings name programs (rust-analyzer's `check.overrideCommand`) — but not in one you don't ("Trust", below).

**A project's `.vscode/settings.json`** (`19.20`) answers its servers' settings too, in a root you trust, as VS Code
would: the nearest one
at or above the server's project folder (short of `~`), read when the server starts, as VS Code reads it — comments
and trailing commas allowed — its dotted keys nested (`"python.analysis.typeCheckingMode"` is
`python.analysis.typeCheckingMode`, merged with a nested form beside it). It goes over the config's, as VS Code puts a
workspace's settings over the user's: the defaults, then your config, then each enclosing root's
`.slipbox/config.toml` and the root's own (configuration.md's order), then the project's. VS Code's per-language
overrides (`"[python]": {…}`) are left out. Changed, it counts from the server's next start.

**Where its project is** (`19.3`): the nearest folder above the file holding the language's first root marker, then
its next — `tsconfig.json` before `package.json` before `.git` — as nvim's `root_markers` have it; never `~` or `/`;
else the file's own folder.

**Where its program is** (`19.4`), in order: the path the user's config gives; the project's own, in a root you trust
(`node_modules/.bin`, `.venv/bin`, `venv/bin`, `vendor/bin`, from its folder up to its checkout's top); `PATH`; the
places the user installs tools (Mason's `bin`, `~/.cargo/bin`, `~/go/bin`, `~/.local/bin`); slipbox's own installs.
A program written for Node (`#!/usr/bin/env node`) runs on slipbox's own Bun — no Node needed — with no
`bunfig.toml` and no `.env` (`--config=/dev/null --no-env-file`): it starts in its root, and Bun would otherwise run
the root's preload and read its `.env`, whichever program it was, slipbox's own install too. A server whose
program's name is common elsewhere is taken only from the project or slipbox's installs: a `tsc` on `PATH` may be an
older TypeScript with no server.

**Trust** (`23.x`, `core/trust.ts`; revises `19.6`). slipbox runs nothing a folder brings with it unless you trust its
root. You never edit a file for that: the TUI asks, the first time it matters — when a file's servers there would
otherwise run with something left out — `Trust ~/x? Its own tools would run code it holds — … Only a folder you
know (y trusts it; n keeps it safe)`. It asks about the root you opened (one answer for every project in it), else the
file's project; never while another window is open or you're typing (a typed `n` would answer it), but after your
next key. `y` trusts it — its servers start again at once as they'd run anywhere — `n` or `esc` keeps it safe; either
is kept in slipbox's state (`$XDG_STATE_HOME/slipbox/trust.json`), so it isn't asked again; `:trust` and `:untrust`
change it. A notes-only folder is never asked. Your config's `[trust] roots` (paths, `~`, globs such as
`~/Projects/*`) trusts ahead of time; a folder's own `[trust]` is ignored. The CLI never asks, and has no way to
trust: an agent could be talked into it. In a root you don't trust:

- **Programs:** the project's own copies (`node_modules/.bin`, the venvs, `vendor/bin`) aren't found, for servers,
  linters and markdownlint-cli2 alike — your config's path, `PATH`, your install folders and slipbox's installs are.
- **Settings:** a server's are its defaults and your own config's (the table your config alone makes), never a
  folder's `.slipbox/config.toml` or its `.vscode/settings.json`, with each server's safe ones over them.
- **Safe modes:** rust-analyzer without build scripts, proc macros or `cargo check` on save (in its settings and its
  `initialize` options); gopls with `GOTOOLCHAIN=local` and `CGO_ENABLED=0`; vtsls never switching to the project's
  TypeScript; pyright given the venv's `site-packages`, found on disk, so its Python never runs; TypeScript's own
  server (`tsc --lsp`) only from slipbox's install.
- **Not run:** a server that can't work without the project's code — the ESLint and stylelint servers (their config
  is code), ruby-lsp where there's a `Gemfile` (Bundler runs it), sourcekit-lsp where there's a `Package.swift` (its
  manifest is built and run), lua-language-server where `.luarc` names a plugin. markdownlint-cli2 skips a note under
  a markdownlint config that is code (`.cjs`, `.mjs`) or names code to load (`customRules`, `markdownItPlugins`,
  `outputFormatters`), said once. A linter of your config (`lint-command`) runs as you set it.
- **Said:** what it leaves out is the question's (the TUI), or a line on the CLI's standard error (`~/x isn't a root
  you trust: rust-analyzer without the project's code; .vscode/settings.json not read — …`); a root you kept safe isn't
  asked or told again. `slipbox doctor` says it too, and which servers it skipped, and why.

In a root you trust, each runs as it would anywhere else: its own defaults, the folder's settings, its own copy.

**Installing** (`19.5`, `14.11`, `core/servers/install.ts`): a server published on npm and found nowhere is installed
when a file first needs it — `[lsp] auto_install = false` stops that — into a folder of its own in slipbox's
(`$XDG_DATA_HOME/slipbox/tools/<package>/<lock>/`), from the lockfile slipbox ships for its pin (`locks.ts`, made by
`scripts/lock-servers.ts`): installed frozen, so every package under it is the version and the content (its sha512)
the lock says; its install scripts off, nothing global, by slipbox's own Bun (the compiled binary is Bun when told to
be), one install at a time, into a folder beside the final one that's renamed into place when it's done.

**Kept current** (`14.11`): an install of slipbox's is current only under the lock it ships now. One under an older
lock — a pin moved, a dependency moved, or one installed before lockfiles, in the one shared folder
(`tools/node_modules`) — is behind: with installing on, it's installed again from the lock before it starts
(`updating pyright (1.1.400 → 1.1.414)…`), and the package's older folders are removed; with installing off, it runs
as it is, and `slipbox doctor` says it's not from the lockfile slipbox ships. A server found anywhere else — your
config's, the project's, on `PATH`, Mason's — is yours to update, never slipbox's. A native server is never
installed: found, or named in the config — the system is the user's.

**The servers of open files** (`19.1`, `core/servers/manager.ts`): one client per server and project, started when a
file of its language in that project is first shown — installed first when it must be — and told about each such
file as it opens, again 150 ms after typing pauses (never per key), and when it's saved; a file gone with a root
switch or a rename is closed in it. Its diagnostics become the file's problems, in the bar, the marks and the status
line ("Problems where they are" in [tui.md](tui.md)). A server that crashes is started again and told its files
again; one that crashes more than three times in five minutes is left stopped, and said so, as is one whose program
is gone (never installed then, but for an npm one with installing on). One that can't start, or
doesn't answer `initialize`, never ran: it is said once and not started again. A server that's missing
is said once: a native one to install yourself, an npm one when installing is off. Quitting kills them; `[lsp]
enabled = false` runs none.

**Several servers on one file** (`19.17`): a file's main server and its add-ons all run, each doing its features —
Helix's names: `diagnostics`, `hover`, `goto-definition`, `goto-type-definition`, `goto-implementation`,
`goto-reference`, `document-symbols`, `workspace-symbols`, `completion`, `signature-help`, `rename-symbol`,
`code-action`, `format`. A main server does them all; an add-on, a linter's: `diagnostics`, `code-action`, `format`. A
language's `language-servers` in the config can limit any of them as Helix does — an entry `{ name = "ruff",
only-features = ["diagnostics", "format"] }`, or `except-features`. Every server's diagnostics are the file's (one
limited away from them says nothing); a request that wants one answer (hover, a definition) goes to the first that does
it and answers; references and code actions are every server's together, the same place once. Completion asks its
servers in turn and shows the first one that answers (a main server before its add-ons, which by default don't
complete); its trigger characters, and signature help's, are every server's together.

**Linters without a server** (`19.19`, `core/servers/linters.ts`) are described in efm-langserver's keys, so a linter
set up for efm pastes in — `[linter.<name>]` with `lint-command`, `lint-formats` (vim's errorformat), `lint-stdin`,
`lint-source`, `lint-severity`, `lint-ignore-exit-code`, `root-markers`, `require-marker` — and a language's
`linters` names its own. Each runs as efm runs it: through the shell, from the nearest folder holding one of its
`root-markers` (with `require-marker`, only where there is one; else from the file's project), the project's own
copy first in a root you trust (`node_modules/.bin`, `.venv/bin`, `venv/bin`, `vendor/bin` before `PATH`); its output
and errors read together, each line by the first format matching it whole; and an exit of 0 is nothing found, unless
`lint-ignore-exit-code`. A finding about another file is passed over; one about `-`, `stdin` or `<stdin>` is this
file's. Built in, each only where the project has its config: **hadolint** for Dockerfiles (`.hadolint.yaml`) and
**yamllint** for YAML (`.yamllint`). One not installed is said once (`linter hadolint: hadolint not found — …`), and
tried again when the config changes; `[lint] enabled = "off"` runs none.

The errorformat read is the part linters use: `%f %l %c %v %e %k %t %n %m %r %p %s`; `%-G` for a line to pass over;
`%E %W %I %N` on one line, setting the severity where there's no `%t`; and the pattern items `%.`, `%#`, `%*\d`,
`%*[^:]`, `%\s`, `%[…]`. Multi-line formats (`%A`, `%C`, `%Z`) and the file stack (`%D`, `%P`) aren't read: a
linter whose formats need them says so when it would run.


**Live checks** (`19.23`, 2026-10-07, Linux arm64), through `slipbox diagnostics` on a file with an error, in a root
you trust and one you don't: rust-analyzer, gopls, clangd, sourcekit-lsp, ruby-lsp, taplo, the Dockerfile and YAML
servers, hadolint and yamllint each found what they should. rust-analyzer in a root you don't trust gave its own
findings (a type mismatch, a syntax error) without running `build.rs`; trusted, `cargo check` ran it. Each server's
own quirks, not slipbox's:

- **sourcekit-lsp**, on a Swift file outside a package, says what it finds only after the file's first change — the
  TUI's first keystroke; `slipbox diagnostics` on an untouched file hears nothing from it.
- **ruby-lsp** installs its own gems with Bundler at each start: with a system Ruby (`/usr/bin/ruby`) they must already
  be installed, since your user can't write its gem folder; and in a project with a `Gemfile` it wants its
  `Gemfile.lock`.
