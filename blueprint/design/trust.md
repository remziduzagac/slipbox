# Trust

What slipbox runs, and what a folder it opens may run through it (`23.x`): nothing of a folder's own, unless you
trust its vault (D172); and what a link may reach: nothing out of its vault or home, unless you follow it (VV-D6). Code:
`core/trust.ts` (the vaults you trust), `core/gitops.ts` (git's guards),
`core/servers/find.ts` and `core/servers/manager.ts` (the servers' programs, settings and safe modes), `core/lint.ts`
(markdownlint-cli2's configs), `core/symlinks.ts` and `tui/following.ts` (the links you follow).

## What runs

slipbox runs programs you chose: your editor, git, and the servers and linters found in your config, on `PATH`, in
your install folders (Mason's `bin`, `~/.cargo/bin`, `~/go/bin`, `~/.local/bin`) or installed by slipbox itself
(D172). In a vault you trust, a folder's own tools run too, each as it would anywhere else: its own defaults, the
folder's settings, its own copy.

Trusted or not, a folder's config never names a program to run, nor lets slipbox reach the network: `editor.command`,
`editor.remote`, `lint.command`, a server's `command`, `args` and `environment`, a linter's `lint-command`, and any
server or linter slipbox doesn't build in, are your own config's only, and so is `[trust]` (D160, D166, D177); so are
`render.images_remote`, `lsp.auto_install` and `update.check`, since fetching a note's web pictures tells their sites
who read what, installing fetches from npm, and the update check asks slipbox's releases (DF-D1, DF-D23). A folder's
file that sets one is ignored, with a warning, whichever way it sets it. Nor may a folder's `[keys]` or `[aliases]`
name a command that throws work away or runs a program (`shell.run`, `shell.filter`), so a clone can't put one on
`ctrl+s` or `:wq` (`USER_ONLY`, each with its reason, and `VAULT_FORBIDDEN_COMMANDS` in `core/config.ts`;
[configuration.md](../../docs/manual/configuration.md), "What only your own file can set"). A folder may set its
branches' bases (`[git] base`, `[git] bases`), as a team's repository does; each is a branch's name, checked before git
uses it ([tui.md](tui.md) § Git, "Each branch's own base").

## Bun's own reading

Bun reads no `bunfig.toml` and no `.env` from the folder it starts in, trusted or not (D176): that folder is whatever
repository or notes folder slipbox runs in, or a server's project folder, and its preload would run, as its code.

- The launcher (`scripts/install-local.sh`) gives Bun slipbox's own `bunfig.toml` and no `.env` (`--config`,
  `--no-env-file`).
- A program written for Node runs on slipbox's Bun with `--config=/dev/null --no-env-file` ([lsp.md](lsp.md) § The
  client for code, "Where its program is").
- The compiled binary is built with Bun's autoloading off (`--no-compile-autoload-bunfig`, `-dotenv`, `-tsconfig`,
  `-package-json`: D195; [distribution.md](distribution.md) § Releases), and a test builds it with that script and
  starts it in a folder holding both.

## In a vault you don't trust

- **Programs** (D172): the project's own copies (`node_modules/.bin`, `.venv/bin`, `venv/bin`, `vendor/bin`) aren't
  found, for servers, linters and markdownlint-cli2 alike, nor a program a folder's settings name (`typescript.tsdk`,
  rust-analyzer's `check.overrideCommand`); your config's path, `PATH`, your install folders and slipbox's installs
  are. A linter of your config (`lint-command`) runs as you set it.
- **Settings** (D173): a server's are its defaults and your own config's, never a folder's `.slipbox/config.toml`
  or its `.vscode/settings.json`, with each server's safe ones over them.
- **Servers** (D174): each in its safe mode, or not run when it can't work without the project's code;
  markdownlint-cli2 skips a note under a config that is code. Which, and how: [lsp.md](lsp.md) § The client for code
  ("Trust"); [tui.md](tui.md) § The lint surface.
- **git** (D175, `gitArgs` in `core/gitops.ts`) runs nothing of the repository's own config or files: no fsmonitor
  command (`core.fsmonitor=false`); no hook (`core.hooksPath=/dev/null`: `git status` writes the index, and that runs
  `post-index-change`); no signature checked in a log (`log.showSignature=false`); attributes read from the empty tree
  (`--attr-source`, git 2.42 and later), so no filter, diff or merge driver of the repository's runs; no textconv or
  external diff in a diff or a show (`--no-textconv`, `--no-ext-diff`); `--no-optional-locks`, so a read writes no
  index; and a worktree made is checked out with no filter its attributes name. Whether git is 2.42 or later is asked
  once; a version that can't be read is guarded all the same, and asked again. On a git older than 2.42 a repository's
  filters can still run, and `slipbox doctor` says so. A commit runs no hooks and isn't signed (`commit.gpgSign=false`;
  [tui.md](tui.md) § Side panes). A push runs no hook, its pre-push neither, and isn't signed (`push.gpgSign=false`); a
  fetch, pull or push reaches no submodule (`--no-recurse-submodules`); and one whose repository's own config (`local`
  or `worktree` scope, `git config --show-scope`) names a program git would run to reach the remote — `core.sshCommand`,
  `core.gitProxy`, `core.askPass`, a credential helper, a remote's `uploadpack` or `receivepack`, a transport allowed
  (`protocol.*.allow`: `ext::` runs a command) — is refused before it starts, said which, and `:trust` lets it run. A
  git too old to say whose config it is (before 2.26), or one that can't answer, refuses all three there (GIT-D4). A
  merge or a rebase — a pull's, a rebase onto the base, continuing, skipping or aborting one, the git panel's Merge… —
  runs no hook (a rebase's `pre-rebase`, a merge's `pre-merge-commit`) and isn't signed (`commit.gpgSign=false`); a
  branch or a worktree made, and a worktree removed, run none either (GIT-D6, GIT-D9). Anywhere, trusted or not, a merge
  or a rebase opens no editor (`GIT_EDITOR=true`, `GIT_SEQUENCE_EDITOR=true`): the repository's own `core.editor` names
  a program too. In a vault you trust, git runs as the repository has it: without its attributes, Git LFS's files would
  all look modified.

## Trusting a vault

You never edit a file to trust a vault (D177). The TUI asks, the first time it matters (when a file's servers there
would otherwise run with something left out): `Trust ~/x? Its own tools would run code it holds — … Only a folder
you know (y trusts it; n keeps it safe)`. It asks about the vault you opened (one answer for every project in it),
else the file's project; never while another window is open or you're typing (a typed `n` would answer it), but
after your next key. `y` trusts it, and its servers start again at once as they'd run anywhere; `n` or `esc` keeps it
safe. Either is kept in slipbox's state (`$XDG_STATE_HOME/slipbox/trust.json`, [how-it-works.md](how-it-works.md)
§ Storage), never in a config or the folder, so it isn't asked again; `:trust` and `:untrust` (`root.trust`,
`root.untrust`) change it. Until it's answered, the vault runs safe. A notes-only folder is never asked.

An answer holds for the folders under it, the nearest answer counting. Your config's `[trust] roots` (paths, `~`,
globs such as `~/Projects/*`) trusts ahead of time, whatever was answered: `n` on a vault it lists leaves it trusted,
and says so. A folder's own `[trust]` is ignored: a folder can't trust itself. The CLI never asks, and has no way to
trust: an agent could be talked into it.

## Links you follow

Beside a vault's trust for its tools, and not part of it: a symlink leading out of its vault, or out of home (any, in
Elsewhere), is read only once you say so (VV-D6). The TUI asks the first time it's opened — follow it, just look (this
once, read-only, nothing indexed), or no — and keeps the answer by the link and its target in slipbox's state
(`links.json`, [how-it-works.md](how-it-works.md) § Storage), never in the vault: a cloned repository can't bring its
links trusted, and a link a pull points elsewhere is asked about again. The prompt says agents will see what's followed
(search, the context bundle, the CLI's answers) when the target is hidden or outside home. A yes allows reading and the
index; writing through it in home, never out of a vault, and in Elsewhere what the file system allows. The CLI never
asks: it refuses a path through a link not followed. An answer can be forgotten, in slipbox (`space v l`) or by the CLI
(`slipbox symlinks forget <link>`): asked again when it's next opened, and one followed is followed no more at once.
Forgetting only takes trust away, so the CLI may; it never gives one. How the walk, the watcher and writes take it:
[roots.md](roots.md) § Links followed only when you say so.

## What's said

What a vault you don't trust leaves out is said where it shows: in the TUI's question, or a line on the CLI's standard
error (`~/x isn't a vault you trust: nothing of its own runs — …`); a vault you kept safe isn't asked or told again.
`slipbox doctor` says whether a vault is trusted, what that limits, and which servers it skipped and why (`23.8`). The
cost, said so: in a vault not trusted, a Rust project's macros give errors, ESLint finds nothing, a project's own
TypeScript isn't used, a Ruby or Swift package gets no server.
