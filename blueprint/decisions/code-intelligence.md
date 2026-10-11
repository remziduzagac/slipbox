# Decisions: code intelligence and trust

Language servers and linters for the code slipbox opens, their problems shown alike, and what a folder may run.

## D159: Arguments passed as argv, never interpolated into a shell string (13.2, 2026-09-25)

**Decision:** A command slipbox runs with values substituted into it (Tier 0's `{selection}`, `{file}` and
`{backlinks}`) gets an argument vector, handed to the process directly; if a shell is genuinely wanted, it is quoted
properly and the config says so. The editor's hand-off templates follow it (`4.2`;
[design/tui.md](../design/tui.md) § Writing notes); Tier 0 itself is deferred (`13.1`).

**Why:** A note titled `notes/$(rm -rf ~).md`, or a selection containing a backtick, becomes shell injection if
substitution is done by string concatenation. Like D90, it is little work, and the kind of thing that is
embarrassing to add after someone else finds it.

## D160: slipbox runs your linter rather than shipping one (3.21, 2026-10-01)

> **Amended by D163 (2026-10-01):** a project's linters without a language server join through the lint surface.
>
> **Amended by D164 (2026-10-01):** markdownlint-cli2 is found as a server is, else installed privately; not `npx`.
>
> **Amended by D174 (2026-10-07):** in a root you don't trust, a note under a markdownlint config that is code isn't
> linted.

**Decision:** The lint surface runs the user's linter and shows its findings where they are. The default is
markdownlint-cli2 (through `npx` at first), with the root's markdownlint config or else
`~/.markdownlint-cli2.jsonc`; "auto" lints only where such a config exists. A note is linted from its file, so only
once it's saved, and its findings show only while its text is the text they were found in. Which linter runs is the
user's config's to say (`lint.command`, as `editor.command`), never a vault's. The design is
[design/tui.md](../design/tui.md) § The lint surface.

**Why:** Rules of slipbox's own would fight the ones you've written; the rules and the `markdown-style` skill
already existed. Without a config, markdownlint's defaults would flag every note that was never meant to follow
them. A stale line number is worse than none. The linter is a program, and a vault's config comes with whatever is
cloned.

**Not chosen:** rules or a formatter of slipbox's own, because they would fight the user's (ideas.md § Linting).

## D161: slipbox is an LSP client for the code it opens (19.x, 2026-10-01)

> **Verified (2026-10-07):** live (`19.23`), through `slipbox diagnostics`: rust-analyzer, gopls, clangd,
> sourcekit-lsp, ruby-lsp, taplo, the Dockerfile and YAML servers, hadolint and yamllint each found what they should.

**Decision:** slipbox is a client of the language servers of the code it opens, in the TUI and on the CLI: a file's
servers give its problems, and its reading and editing features (hover, definitions, references, symbols, rename,
code actions, formatting, completion: `19.12`–`19.16`, `19.22`). The design is [design/lsp.md](../design/lsp.md)
§ The client for code.

**Why:** Code opens in slipbox as much as notes do (D107), and tree-sitter finds syntax errors only: type errors
and unresolved imports need a language server, which files beyond markdown had called not slipbox's job. Phase 5's
finish line: slipbox gets the servers' knowledge, as nvim gets slipbox's graph (D168).

## D162: A language's servers are found; npm ones installed privately, pinned (19.4, 19.5, 2026-10-01)

> **Amended by D172 (2026-10-07):** the project's own copies are found only in a root you trust.
>
> **Amended by D202 (2026-10-10):** an npm server is installed frozen from the lockfile slipbox ships for its
> pin, and installed again when that lock moves.

**Decision:** A language's servers are found: the user's config first, then the project, then `PATH` and known places
(Mason's, `~/.cargo/bin`, `~/go/bin`, `~/.local/bin`). Those published on npm, JavaScript ones and prebuilt binaries
shipped through npm such as Biome or tsgo, are installed when first needed into slipbox's own data folder: pinned,
their install scripts off, never globally; `[lsp] auto_install = false` stops it. Native servers are never installed,
only found or set in the config. The design is [design/lsp.md](../design/lsp.md) § The client for code: "Where its
program is", "Installing".

**Why:** An npm server installed into slipbox's own folder runs on slipbox's Bun: no Node, nothing global (D170). A
native server is the system's, and the system is the user's.

**Not chosen:** installing native servers, because the system is the user's (ideas.md § Code intelligence).

## D163: Linters by the same rule (19.17–19.19, 2026-10-01)

> **Amended by D172 (2026-10-07):** the project's own copy of a linter is used only in a root you trust.
>
> **Amended by D174 (2026-10-07):** in a root you don't trust, a linter whose config is code (ESLint, stylelint)
> doesn't run.

**Decision:** Where a server lints already (pyright; clippy through rust-analyzer; gopls's staticcheck; clangd's
clang-tidy; shellcheck through bash-language-server), that is used. Other linters run only where the project has their
config, the project's own copy first (`node_modules/.bin`, `.venv/bin`, `vendor/bin`, bundler); one on npm is
installed like a server, a native one is found or configured. A linter with an LSP mode joins as an add-on server
beside the file's main one (`19.17`, `19.18`); one without runs through the lint surface (D160, widened), described
in efm-langserver's keys (`19.19`). The design is [design/lsp.md](../design/lsp.md) § The client for code: "Several
servers on one file", "Linters without a server".

**Why:** The rule of the servers (D162) and of the lint surface (D160): slipbox runs the tools the project already
uses, with the project's own config, rather than rules of its own.

## D164: markdownlint-cli2 found as a server is, else installed privately, not `npx` (19.21, 2026-10-01)

> **Amended by D172 (2026-10-07):** the root's own copy is found only in a root you trust.

**Decision:** The lint surface's markdownlint-cli2 is found as a language server is (the root's own
`node_modules/.bin`, `PATH`, the user's install folders), else installed into slipbox's own folder, pinned, and run on
slipbox's Bun. The design is [design/tui.md](../design/tui.md) § The lint surface.

**Why:** `npx` fetched whatever was newest, each machine its own.

## D165: Settings in the formats other tools already read (19.2, 19.19, 19.20, 2026-10-01)

> **Amended by D173 (2026-10-07):** in a root you don't trust, a folder's own server settings don't reach a server.

**Decision:** Nothing slipbox-only to learn or keep in step:

- a tool's own config files (`eslint.config.js`, `ruff.toml`, `pyrightconfig.json`, `.markdownlint-cli2.jsonc`) are
  its settings, and slipbox never restates them;
- which servers run, and how, takes Helix's `languages.toml` shape: `[language-server.<name>]` and `[[language]]`;
- a server's `config` is its own settings, the same JSON nvim's `settings`, Zed's and VS Code's take;
- a linter without LSP is described in efm-langserver's keys (`lint-command`, `lint-formats` in vim's errorformat,
  `lint-stdin`);
- a project's `.vscode/settings.json` answers its servers' settings requests, as VS Code would.

The design is [design/lsp.md](../design/lsp.md) § The client for code.

**Why:** When each tool reads its own config, the editor, CI and slipbox agree; a section written for Helix or efm
pastes in.

**Not chosen:** a settings format of slipbox's own for servers and linters, one more thing to learn and keep in step
(ideas.md § Code intelligence).

## D166: Only your own config names a program to run (19.2, 2026-10-01)

> **Amended by D172 (2026-10-07):** in a root you don't trust, no program a folder's settings name runs either
> (`typescript.tsdk`, rust-analyzer's `check.overrideCommand`).

**Decision:** A program to run stays the user's choice: a server's `command`, `args` and `environment`, and a
linter's `lint-command`, are read from the user's config only, never a vault's, as `lint.command` is (D160). The
design is [design/lsp.md](../design/lsp.md) § The client for code ("Which servers"), and the user's view is
`docs/configuration.md`, "What only you can set".

**Why:** A folder's config comes with whatever is cloned; cloning a repository must never choose what runs.

## D167: Diagnostics from every source look alike, in every mode (19.8–19.11, 2026-10-01)

**Decision:** Syntax (`16.9`), lint (`3.21`), servers and linters show alike, in source mode, the lens and the
rendered view: a bar beside the text, where a line with problems shows how many, coloured by the worst (error,
warning, info, hint), on the row its source line starts on when rendered; the text itself underlined or highlighted
where the problem is, mapped through the layout when rendered; the bar and the marks each toggled on its own
(`space u`) and remembered like the other UI settings. The design is [design/tui.md](../design/tui.md) § Problems
where they are.

**Why:** Syntax errors already showed so, as a gutter mark, an underline and a count in the status line (`16.9`);
every other source joins the same shape, one list per file (`19.8`), in every mode a file is read in.

## D168: slipbox serves markdown to editors, in vaults only (11.x, 2026-10-01)

> **Superseded by D67 (2026-10-02):** with plain paths, editors' own markdown servers follow the links, and
> agents use the CLI; `slipbox lsp` is gone.

**Decision:** `slipbox lsp` serves notes to editors, in vaults only (`.slipbox/`), marksman staying for markdown
elsewhere: a thin layer on the core, with `vscode-languageserver` for the protocol (D170); the TUI keeps calling the
core directly. Renames are edits the editor applies, and lint findings stay off over the LSP, since the editor runs
its own linter. It builds the face idea.md proposed (D9); built as `11.2`–`11.12`.

**Why:** The face's case: with it, an editor keeps slipbox's knowledge of the notes (completion on `[[`, backlinks as
references, renames that fix links), so handing a note to nvim costs rendering only. Phase 5's finish line: nvim gets
slipbox's graph.

**Cost:** A rename made over the LSP skips slipbox's undo log.

## D169: Phase 5's order, and its new languages (11.1, 16.18–16.22, 2026-10-01)

> **Amended by D34 (2026-10-02):** plain paths came next; the languages waited
> for 5b and 5c, and were done 2026-10-07.

**Decision:** `11.1` first (the protocol library, for both directions), then the markdown server (`11.x`), then the
diagnostics display on today's findings (`19.8`–`19.11`), then the client and finding servers (`19.1`–`19.7`), reading
features, editing features, linters, and the languages: Swift, HTML and CSS, PHP, Dockerfile, the web frameworks
(Vue, Svelte, Astro) (`16.18`–`16.22`). Ruby and C/C++ were decided later (D123).

**Why:** idea.md had asked for `vscode-languageserver` to be checked under Bun before the faces relied on it, and one
library serves both directions; the display came on the findings slipbox already had, before the servers added
theirs.

## D170: One protocol library, both ways, under Bun and compiled (11.1, 2026-10-01)

> **Amended by D67 (2026-10-02):** the server's half went with the LSP face; `vscode-languageserver` is a dev
> dependency, for the tests' fake server only.
>
> **Amended by D176 (2026-10-07):** a server started in its root gets no `bunfig.toml` and no `.env`.

**Decision:** `vscode-languageserver` (10.1, the server's side) and `vscode-languageserver-protocol` (3.18, the
client's: the JSON-RPC connection and every message's type) are the protocol library, one for both directions. npm
servers run on slipbox's own Bun: the compiled binary is Bun when `BUN_BE_BUN=1` is set, installs a server
(`add --ignore-scripts --exact`, into a folder of its own) and runs it; no Node, nothing global (`19.5`). The
dependencies are [design/how-it-works.md](../design/how-it-works.md) § Dependencies.

**Why:** Both run under Bun as they do under Node, and in the compiled binary: checked 2026-10-01 with a server and
client of a few lines, then the client against vtsls, pyright, bash-language-server, lua-language-server and
vscode-css-language-server. The check also shaped the client: diagnostics come both ways (sent, or asked for with
`textDocument/diagnostic`, LSP 3.17); a server asked for its settings and given none checks nothing, so each server
slipbox knows comes with defaults, as nvim-lspconfig's do (`19.2`); a server finds its helpers on `PATH`
(bash-language-server runs shellcheck only when it's there).

**Not chosen:** `vscode-languageclient`, because it's VS Code's own and needs its API (ideas.md § Code intelligence).

## D171: Everything trusted, as in nvim and Helix (19.6, 2026-10-01)

> **Superseded by D172 (2026-10-07):** nothing of a folder's own runs unless you trust its root.

**Decision:** Language servers and linters run wherever slipbox opens a file, and run the project's code, as they do
under nvim or Helix: rust-analyzer its build scripts, the ESLint server its `eslint.config.js`, the project's own
`node_modules/.bin`, `.venv/bin` and `vendor/bin`. Everything is trusted: no question per folder or repository, no
list of trusted places; nothing asks first. What stays is the rule that a folder's committed config never names a
program to run (D166).

**Why:** nvim and Helix trust it so; decided with the user.

**Cost:** That rule is all it promises: a known server's `config` from a folder reaches the server, as
`.vscode/settings.json` does, and some settings name programs (rust-analyzer's `check.overrideCommand`), so cloning a
folder can still choose what a server runs; what the project's own tools do is the project's.

**Not chosen:** a question per folder or repository, or a list of trusted places (ideas.md § Trust).

## D172: Run nothing of a folder's own unless you trust its root (23.1, 23.2, 2026-10-07)

**Decision:** slipbox runs programs you chose: your editor, git, and the servers and linters found in your config, on
`PATH`, in your install folders (Mason's, `~/.cargo/bin`, `~/go/bin`, `~/.local/bin`) or installed by slipbox itself.
Unless you trust its root, it runs nothing a folder brings with it: not its `node_modules/.bin`, `.venv/bin`,
`venv/bin` or `vendor/bin`, nor a program its `.vscode/settings.json` or a server's settings name
(`typescript.tsdk`, rust-analyzer's `check.overrideCommand`); nor its servers' settings (D173), the code its servers
would run by default (D174), its git config and files (D175). In a root you trust, each runs as it would anywhere
else. This supersedes D171. The design is [design/trust.md](../design/trust.md).

**Why:** Under D171, cloning a folder could still choose what a server runs, and the project's own tools ran its
code. Decided with the user, after trailscout's review of what makes a repository's code run.

**Cost:** In a root not trusted, a Rust project's macros give errors, ESLint finds nothing, a project's own
TypeScript isn't used, a Ruby or Swift package gets no server; said where it shows (D177).

## D173: A server's settings are yours alone in a root you don't trust (23.3, 2026-10-07)

**Decision:** In a root you don't trust, a server's settings are its defaults and your own config's: a folder's own
server settings (its `.slipbox/config.toml`, its `.vscode/settings.json`) don't reach a server. The design is
[design/trust.md](../design/trust.md).

**Why:** Some servers' settings name programs (rust-analyzer's `check.overrideCommand`): a folder's settings reaching a
server could choose what it runs (D171's cost).

## D174: Servers in safe modes; one that needs the project's code doesn't run (23.4, 23.5, 2026-10-07)

> **Verified (2026-10-07):** live (`19.23`): rust-analyzer in a root not trusted gave its own findings (a type
> mismatch, a syntax error) without running `build.rs`; trusted, `cargo check` ran it.

**Decision:** In a root you don't trust, each server runs in a mode that runs none of the project's code
(rust-analyzer without build scripts, proc macros or check-on-save; gopls with `GOTOOLCHAIN=local` and cgo off; the
TypeScript servers with their own TypeScript and no project plugins; pyright never running the venv's Python). A
server or linter that can't work without the project's code doesn't run: the ESLint and stylelint servers (their
config is code), ruby-lsp beside a `Gemfile`, sourcekit-lsp beside a `Package.swift`, lua-language-server where
`.luarc` names a plugin; markdownlint-cli2 skips a note under a config of its that is code or names code to load.
Which, and how: [design/lsp.md](../design/lsp.md) § The client for code ("Trust").

**Why:** A server's defaults run the project's code: build scripts, proc macros, a config that is code, Bundler on
a `Gemfile`, a Swift package's manifest built and run.

## D175: git without the repository's own config or files (23.6, 2026-10-07)

> **Verified (2026-10-10):** tried live, the guard failed open once: a `git --version` that failed to start, on a
> machine short of memory, left the attributes unguarded for the rest of the process, and a repository's clean
> filter ran. Fixed, with a regression test: a version that can't be read is guarded all the same, and asked again.

**Decision:** In a root you don't trust, git runs nothing of the repository's own: no fsmonitor command, no hook, no
filter, diff or merge driver its attributes name (attributes read from the empty tree, `--attr-source`, git 2.42 and
later), no textconv or external diff, no index written by a read (`--no-optional-locks`). In a root you trust, git
runs as the repository has it. The design is [design/trust.md](../design/trust.md).

**Why:** git runs a repository's code through its config and files: `git status` writes the index, and that runs
`post-index-change`. The flags first planned (fsmonitor off, `--no-textconv`, `--no-ext-diff`) weren't enough:
`git diff --name-status` still ran a clean filter. In a root you trust, the attributes are needed: without them, Git
LFS's files would all look modified.

**Cost:** On a git older than 2.42, a repository's filters can still run; `slipbox doctor` warns of it.

## D176: Bun reads no `bunfig.toml` or `.env` of the folder it starts in (23.9, 2026-10-07)

> **Amended by D195 (2026-10-10):** the compiled binary too: it loaded both by default, and a cloned repository's
> preload ran when slipbox was started in it; it is built with Bun's autoloading off.

**Decision:** Wherever slipbox starts Bun, Bun reads no `bunfig.toml` and no `.env` from the folder it starts in: the
launcher (`scripts/install-local.sh`) gives Bun slipbox's own config and no `.env` (`--config`, `--no-env-file`), and
a server written for Node runs with `--config=/dev/null --no-env-file`. This holds in a root you trust too. The design
is [design/trust.md](../design/trust.md).

**Why:** Bun reads both from the folder it starts in, which is whatever repository or notes folder slipbox runs in,
or a server's root: that folder's preload would run, as its code, whenever slipbox or a server did.

## D177: Trusting is yours, and takes no editing (23.7, 23.8, 23.10, 2026-10-07)

**Decision:** The TUI asks, once per root, the first time it matters (a file's servers there would run with something
left out), and keeps the answer in slipbox's state (`trust.json`), never in a config or the folder; until it's
answered, the root runs safe. `:trust` and `:untrust` change it. `[trust] roots` in your own config (paths, `~`,
globs) trusts ahead of time. A root's `.slipbox/config.toml` can't trust itself, and the CLI neither asks nor trusts.
`slipbox doctor` and the TUI say once that a root isn't trusted, and what that limits. The design is
[design/trust.md](../design/trust.md).

**Why:** In the user's words: "users should not be editing setting files to be able to access a folder; they should
just type slipbox and start". A folder's config comes with whatever is cloned (D166). On the CLI, an agent can't
answer, and could be talked into it.

**Not chosen:** `[trust] roots` in your own config as the only way to trust, the first plan that day, because it made
opening a folder a matter of editing a file; the CLI asking, because an agent can't answer (ideas.md § Trust).
