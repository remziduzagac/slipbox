# Language servers for code

slipbox is a client of the language servers of the code it opens (`19.x`). It served notes to editors too, as `slipbox
lsp` (the LSP face, `11.x`), until links became plain paths (`20.23`, 2026-10-02): editors' own markdown servers follow
path links, a move made in an editor is repaired from the watcher, and agents use the CLI.

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

TypeScript 7 is native with its server built in (`tsc --lsp --stdio`): it's used where the project's TypeScript is
7 or there is none, and vtsls, its own TypeScript bundled, where the project's is older. Each server's settings by
default are nvim-lspconfig's where it has some. The user's config changes them in Helix's `languages.toml` shape —
`[language-server.<name>]` (`command`, `args`, `config`, `environment`, `required-root-patterns`) and
`[[language]]` (`name`, `language-servers`, `roots`, `file-types`, `language-id`), a server's `config` merged over
the defaults, the rest replaced, a new name added. A vault's config may tune a known server's `config` and a
language's lists, never name what runs: its `command`, `args`, `environment`, and any server slipbox doesn't
know, are ignored with a warning.

**A project's `.vscode/settings.json`** (`19.20`) answers its servers' settings too, as VS Code would: the nearest one
at or above the server's project folder (short of `~`), read when the server starts, as VS Code reads it — comments
and trailing commas allowed — its dotted keys nested (`"python.analysis.typeCheckingMode"` is
`python.analysis.typeCheckingMode`, merged with a nested form beside it). It goes over the config's, as VS Code puts a
workspace's settings over the user's: the defaults, then your config, then the vault's, then the project's. VS
Code's per-language overrides (`"[python]": {…}`) are left out. Changed, it counts from the server's next start.

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

**Several servers on one file** (`19.17`): a file's main server and its add-ons all run, each doing its features —
Helix's names: `diagnostics`, `hover`, `goto-definition`, `goto-reference`, `document-symbols`, `workspace-symbols`,
`completion`, `signature-help`, `rename-symbol`, `code-action`, `format`. A main server does them all; an add-on, a
linter's: `diagnostics`, `code-action`, `format`. A language's `language-servers` in the config can limit any of them as
Helix does — an entry `{ name = "ruff", only-features = ["diagnostics", "format"] }`, or `except-features`. Every
server's diagnostics are the file's (one limited away from them says nothing); a request that wants one answer (hover, a
definition) goes to the first that does it and answers; references and code actions are every server's together, the
same place once. Completion asks its servers in turn and shows the first one that answers (a main server before its
add-ons, which by default don't complete); its trigger characters, and signature help's, are every server's together.

**Linters without a server** (`19.19`, `core/servers/linters.ts`) are described in efm-langserver's keys, so a linter
set up for efm pastes in — `[linter.<name>]` with `lint-command`, `lint-formats` (vim's errorformat), `lint-stdin`,
`lint-source`, `lint-severity`, `lint-ignore-exit-code`, `root-markers`, `require-marker` — and a language's
`linters` names its own. Each runs as efm runs it: through the shell, from the nearest folder holding one of its
`root-markers` (with `require-marker`, only where there is one; else from the file's project), the project's own
copy first (`node_modules/.bin`, `.venv/bin`, `venv/bin`, `vendor/bin` before `PATH`); its output and errors read
together, each line by the first format matching it whole; and an exit of 0 is nothing found, unless
`lint-ignore-exit-code`. A finding about another file is passed over; one about `-`, `stdin` or `<stdin>` is this
file's. Built in, each only where the project has its config: **hadolint** for Dockerfiles (`.hadolint.yaml`) and
**yamllint** for YAML (`.yamllint`). One not installed is said once (`linter hadolint: hadolint not found — …`), and
tried again when the config changes; `[lint] enabled = "off"` runs none.

The errorformat read is the part linters use: `%f %l %c %v %e %k %t %n %m %r %p %s`; `%-G` for a line to pass over;
`%E %W %I %N` on one line, setting the severity where there's no `%t`; and the pattern items `%.`, `%#`, `%*\d`,
`%*[^:]`, `%\s`, `%[…]`. Multi-line formats (`%A`, `%C`, `%Z`) and the file stack (`%D`, `%P`) aren't read: a
linter whose formats need them says so when it would run.

