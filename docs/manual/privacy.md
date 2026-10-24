# Privacy and trust

<a id="privacy"></a>

slipbox works on files on your machine. It has no account and no telemetry, and collects nothing about you. Its
network requests and the programs it runs are described below, including explicit Git operations and external tools.

This chapter lists:

- every time slipbox reaches the network, and how to stop each one
- what it never sends
- which programs it runs
- what it keeps on your machine, and how to remove it all

## When slipbox reaches the network

Built-in requests include:

- [the update check](#the-update-check)
- installing [a language server](#language-servers-installed-from-npm)
- fetching [a picture](#pictures-on-the-internet) on the internet

| What | When | How to turn it off |
| --- | --- | --- |
| The update check | once a day, in a release you installed | `update.check = false`, or `DO_NOT_TRACK` |
| Language servers, markdownlint | the first time one is needed | `lsp.auto_install = false` |
| Pictures on the internet | when you ask for one (by default) | `render.images_remote = "never"` |

The settings are in your config file ([Configuration](configuration.md)).

Installing slipbox and `slipbox upgrade` also download files when you ask them to
([Installation](../guides/install.md)). A report (`space r`) reaches GitHub only through your browser or `gh`,
when you send it ([below](#what-slipbox-never-sends)). Explicit Git fetch, pull and push contact your repositories
[as described below](#git-and-your-repositories-remotes). Git can also fetch missing objects or LFS files as part
of another operation. Language servers and other external programs may make their own requests; see
[Programs slipbox runs](#what-slipbox-runs).

### The update check

A slipbox installed from a release, by its installer or by Homebrew, asks once a day whether there's a newer release.
When there is, the message line says so, and how to get it:

```text
slipbox 0.3.0 is out (this is 0.2.0): slipbox upgrade installs it
```

- **Only the full-screen slipbox asks**, while it runs. The command line, which agents and scripts call, never asks. A
  slipbox run from its source code never asks.
- **What is sent:** one request for a small public file. That file is the list of the latest release's files and their
  checksums. It comes from where slipbox's releases are published (GitHub).

  An install that follows previews ([Previews](../guides/install.md#previews)) asks for two more. One says which
  preview is the newest, from slipbox's site on GitHub Pages. The other is that preview's list.

  The requests carry nothing about you, your machine or your notes. Like any request, each shows its server your IP
  address.
- **At most once a day.** slipbox notes when it last asked before it asks, in `update.json`, in its state folder. So a
  check that failed waits a day too.
- **To turn it off**, set `update.check = false` in your own config file. Or set the environment variable
  `DO_NOT_TRACK` to anything but `0` or `false`.

  Only your own config counts here. slipbox ignores `update.check` in a folder's own settings, with a warning. So a
  folder you clone can't turn the check on, or off.

Two environment variables point the check, and `slipbox upgrade`, somewhere else:

| Variable | Points them at |
| --- | --- |
| `SLIPBOX_RELEASES_URL` | Another place laid out as the releases are: a mirror of your own |
| `SLIPBOX_CHANNELS_URL` | Another place for the site's files naming the newest preview |

### Language servers installed from npm

slipbox shows a code file's problems, and answers questions about its code, through a language server. That's a
separate program for that language ([Code](code.md)).

You may open a code file whose language server isn't on your machine, but is published on npm. Then slipbox installs
it from npm's registry the first time it's needed, and says so:

```text
installing pyright (pyright@1.1.414) into slipbox's own folder…
```

- **What is fetched:** that package, at the exact version slipbox names, and the packages it needs. Each is checked
  against the checksum slipbox carries for it. They go into slipbox's own folder, never anywhere else on your system.
  No package's install script runs. npm's registry sees which packages are fetched, and your IP address.
- **markdownlint-cli2** is installed the same way when it's needed. slipbox runs it to show your linter's findings in
  notes. It's needed where you have a markdownlint config, or `lint.enabled = "on"`.
- **The command line installs too**, for `slipbox diagnostics <file>` and `slipbox problems --lint`. They run the same
  servers and linter.
- **A server that isn't on npm** (rust-analyzer, gopls and others) is never installed. `slipbox doctor` says how to get
  it ([Troubleshooting](troubleshooting.md)).
- **To turn it off**, set `lsp.auto_install = false`. Nothing is installed, and `slipbox doctor` lists what's missing.
  `lsp.enabled = false` turns language servers off altogether.

A language server is a program of its own. Once it runs, it may reach the network as it would in any editor. It may
fetch a schema a file names, say, or a project's dependencies. slipbox turns off the YAML server's telemetry. It never
passes on a telemetry event a server sends it.

Only your own config counts here. A folder's own settings (its `.slipbox/config.toml`) can't turn installing on, or
off. slipbox ignores `lsp.auto_install` there, with a warning. So a folder you clone can't install from npm against
your settings.

### Pictures on the internet

A note can show a picture whose address is on the web: `![A cup](https://example.org/cup.png)`.

Fetching it tells that site your IP address, and that the picture was asked for. That's what a tracking picture in a
note someone sent you would want. So slipbox fetches one only as `render.images_remote` says:

| Value | The picture |
| --- | --- |
| `ask`, the default | Is shown as its link. `enter` on it asks whether to fetch it |
| `show` | Is fetched when the note is drawn, where your terminal draws pictures |
| `never` | Is never fetched. `enter` on it copies its address |

With `ask`, `enter` on the picture asks `Fetch this picture from https://example.org?`. There are three answers:

| Key | Does |
| --- | --- |
| `o` | Fetches it this once |
| `s` | Fetches this one, and any other from that site without asking, until slipbox quits |
| `n` | No |

A picture fetched is kept in slipbox's cache. It's drawn from there afterwards, without asking or fetching again.

Only a picture is kept. A site's answer that isn't one, or that is larger than 20 MB, is refused.

The command line never fetches a picture. An export uses only slipbox's copy ([Exporting](export.md)).

Only your own config counts here too. slipbox ignores `render.images_remote` in a folder's own settings, with a
warning. So a folder you clone can't set it to `show` and have its pictures fetched as you read.

### git and your repositories' remotes

slipbox reads a repository's remote addresses from its git config, to name the repository. It contacts a remote only
when you fetch, pull or push ([Git](git.md#fetching-pulling-and-pushing)). It never does so on its own, and nothing runs
on a timer.

A repository set up to download on demand can still reach its remote while slipbox asks git something. It would do the
same from your shell. For example:

- a partial clone fetching an object it lacks
- in a vault you trust, Git LFS fetching a file when you switch branches or throw away a change

## What slipbox never sends

- **No telemetry, no analytics, no crash reports.** slipbox does not collect telemetry or send analytics. Explicit
  operations can send data: Git push sends commits to a remote, and programs you run have their own behavior. Review
  exports and copied text before sharing.
- **A report is sent by you, never by slipbox.** `space r` writes a report you read in full before anything leaves. It
  goes only when you choose: in your browser, which you submit; copied, to paste; or by `gh`, after a yes. The screen,
  and the note you were in, are in it only when you add them
  ([Reporting a problem](troubleshooting.md#reporting-a-problem)).
- **Bun's crash reports are off.** slipbox runs on Bun. When Bun crashes, it can send a report to Bun's developers.
  slipbox turns this off as it starts.

  If you set `BUN_ENABLE_CRASH_REPORTING` or `BUN_CRASH_REPORT_URL` yourself, slipbox leaves them as you set them.

  A crash still prints a link you can follow to report it yourself.

## What slipbox runs

slipbox runs programs you chose, never one a folder names:

- **git**, in a repository, to show and make changes ([Git](git.md)).
- **Your editor**, when you hand a note to it (`editor.command`, else `$VISUAL`, else `$EDITOR`, else `vi`)
  ([Editing](editing.md)).
- **A running editor** you send a note to (`editor.remote`, nvim by default) ([Editing](editing.md)).
- **Language servers and linters** for code, and **markdownlint-cli2** for notes ([Code](code.md)).
- **Your shell**, for a command you type after `:!`.
- **Your clipboard's tool** (`pbcopy`, `wl-copy`, `xclip`, `xsel`, or Windows' in WSL), to copy and paste.
- **Your browser**, by your system's way of opening one (`open`, `xdg-open`, `wslview` or `explorer.exe`), when you
  open the bug form from a report. Never over SSH, where it would open on that machine, not yours.
- **`gh`**, when you post a report with it, after a yes.
- **Bun**, which slipbox carries, to install a language server.
- **`tar`**, when `slipbox upgrade` unpacks a release.

A folder's own settings never name a program to run. Only your own config can set these
([Configuration](configuration.md)):

- `editor.command`
- `editor.remote`
- `lint.command`
- a language server's command
- a linter's command

A folder can hold tools of its own that would run code it holds:

- a project's own TypeScript
- its linters' settings
- git hooks and filters

In a vault you don't trust, none of that runs. Servers run in a safe mode, or not at all. git runs none of the
repository's hooks or filters.

slipbox asks the first time it matters (`Trust ~/code/app? …`). It keeps your answer on your machine, never in the
folder. `:trust` and `:untrust` change it. `trust.roots` in your config trusts folders ahead of time.

The command line never asks, and has no way to trust a folder. Only you can, in slipbox. [Code](code.md) explains trust
in full.

## What slipbox keeps on your machine

Opening a folder writes nothing into it. slipbox writes into your folders only what you ask for:

- notes you save
- exports
- the `.slipbox/` folder `slipbox init` makes
- the scratch, if you set `capture.location = "root"`

Exports also use temporary copies in slipbox's cache folder (`exports/`), in a directory only your user can open, and
beside the destination while publishing. These are removed when the export finishes, is cancelled or slipbox quits
normally; any a crash left are removed by the next export.

Everything else it keeps long term is in four folders of its own, all on your machine (in WSL, inside WSL). They're for
your settings, its state, its data and its cache.
[Where slipbox keeps things](environment-and-storage.md#where-slipbox-keeps-things) says where they are, and lists
every file in them.

Some of it is as personal as your notes:

- **The state folder** holds the scratch, and the trash. A note you delete in slipbox is moved to the trash, so it can
  be put back. It stays there for 30 days, unless you restore it.

  To be rid of a deleted note for good sooner, empty the trash. Use the last row of its list (`space v t`), or
  `slipbox trash empty --yes`.

  The state folder also records which files you read, and where you were in them. It records the folders slipbox has
  found too.
- **The cache** holds a search index of each folder of notes, with their words in it. Deleting the cache is always
  safe. slipbox makes it again. It carries a `CACHEDIR.TAG`, so backup tools that know the tag leave it out.
- **The background index** looks through your home folder for folders of notes, while you aren't working. It indexes
  each, and your home folder's own notes, so that links from one to another count everywhere. Hidden folders,
  `Downloads` and the busy folders it leaves alone. `index.background = false` turns it off.

## Removing it all

`slipbox uninstall` lists what it would remove. It removes nothing until you add `--yes`:

```bash
slipbox uninstall --purge          # list: slipbox, and its four folders
slipbox uninstall --purge --yes    # remove them
```

Without `--purge`, it removes only what its installer put there, and lists its folders as kept.

With `--purge`, the four folders go too. That's:

- your settings
- the scratch
- the trash
- your words
- everything in the cache

Your notes, and the `.slipbox/` folders in them, are never touched.

Installed by Homebrew, `brew uninstall slipbox` removes the program. To remove the folders too, run
`slipbox uninstall --purge --yes` first.

What slipbox wrote into your folders at your asking stays:

- exports
- `.slipbox/` folders
- a scratch kept in a folder

Remove them by hand if you want them gone.

## Trust

Opening a folder never runs code it brings with it, unless you trust it. A repository you clone can hold:

- programs (`node_modules/.bin`)
- settings that name programs
- build scripts a server would run
- git hooks

In a vault you don't trust, slipbox runs none of them.

You trust a vault, such as a git repository, and everything in it. [Vaults, home and Elsewhere](vaults.md) explains
vaults.

### What runs anyway

The programs you chose run anyway:

- your editor
- git
- the servers and linters named in your config, found on your `PATH`, in your install folders, or installed by
  slipbox

Each runs as you set it up.

Trusted or not, a folder's own config never names a program for slipbox to run. Only your own config can set these:

- `editor.command` and `editor.remote`
- `lint.command`
- a server's `command`, `args` and `environment`
- a linter's `lint-command`
- a server or linter slipbox doesn't build in
- `[trust]` itself

Nor can a folder bind a key or alias to a command that runs a program or throws work away
([Configuration](configuration.md) lists them).

### What a vault you don't trust leaves out

- **Its programs**: the project's own copies in `node_modules/.bin`, `.venv/bin`, `venv/bin` and `vendor/bin` aren't
  used, for servers and linters alike. Nor is a program its settings name.
- **Its settings**: a server's settings are its defaults and yours. They're never the folder's `.slipbox/config.toml`
  or its `.vscode/settings.json`.
- **Servers in a safe mode**:
  - `rust-analyzer` runs without build scripts, procedural macros or `cargo check`.
  - `gopls` runs without downloading the toolchain a `go.mod` names, and without cgo.
  - `vtsls` never switches to the project's TypeScript. TypeScript 7's server is taken only from slipbox's install.
  - `pyright` is given the virtual environment's packages, without running its Python.
- **Servers not run**, as they can't work without running the project's code:
  - the ESLint and stylelint servers, since their config is code
  - `ruby-lsp`, where there's a `Gemfile`
  - `sourcekit-lsp`, where there's a `Package.swift`
  - `lua-language-server`, where `.luarc.json` names a plugin
- **The note linter** skips a note under a markdownlint config that is code (`.cjs`, `.mjs`) or loads code.
- **git** runs none of the repository's hooks, filters or other programs ([Git](git.md#what-slipbox-runs)).

This has a cost. In a vault you don't trust:

- a Rust project's macros show errors
- ESLint finds nothing
- the project's own TypeScript isn't used
- a Ruby or Swift package gets no server

### Trusting a vault

You never edit a file to trust a vault. slipbox asks the first time it matters, when a file's servers there would run
with something left out:

```text
Trust ~/code/app? Its own tools would run code it holds — eslint not run (its config is code). Only a folder you
know (y trusts it; n keeps it safe)
```

- `y` trusts it. Its servers start again at once, as they'd run anywhere.
- `n` or `esc` keeps it safe.

Either answer is kept in slipbox's own state, never in the folder, so it isn't asked again.

slipbox asks about the vault you opened, with one answer for every project in it. Else it asks about the file's
project. It never asks while you're typing, but after your next key. A folder of notes alone is never asked.

| Command | In the palette | What it does |
| --- | --- | --- |
| `:trust` | "Trust this vault" | Trusts the vault of the file on screen |
| `:untrust` | "Stop trusting this vault" | Stops trusting it |

An answer holds for the folders under it. The nearest answer counts.

To trust folders ahead of time, list them in your own config's `trust.roots`:

```toml
[trust]
roots = ["~/code/*", "~/notes"]   # paths, ~, globs; each with what's inside it
```

A vault listed there is trusted whatever you answered. A folder's own `[trust]` is ignored, since a folder can't trust
itself.

The command line never asks, and has no way to trust a vault, since an agent could be talked into it. In a vault you
don't trust, its commands say on standard error what they left out. `slipbox doctor` says whether a vault is trusted,
and what that limits.
