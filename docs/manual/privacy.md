# Privacy

slipbox works on files on your machine. It has no account and no telemetry. It collects nothing about you, and sends
nothing about you or your notes anywhere.

This chapter lists:

- every time slipbox reaches the network, and how to stop each one
- what it never sends
- which programs it runs
- what it keeps on your machine, and how to remove it all

## When slipbox reaches the network

It does in three cases, and only these:

- [the update check](#the-update-check)
- installing [a language server](#language-servers-installed-from-npm)
- fetching [a picture](#pictures-on-the-internet) on the internet

| What | When | How to turn it off |
| --- | --- | --- |
| The update check | once a day, in a release you installed | `update.check = false`, or `DO_NOT_TRACK` |
| Language servers, markdownlint | the first time one is needed | `lsp.auto_install = false` |
| Pictures on the internet | when you ask for one (by default) | `render.images_remote = "never"` |

The settings are in your config file ([Configuration](configuration.md)).

Beyond these, slipbox downloads only when you ask it to: installing it, and `slipbox upgrade` ([Installing
slipbox](../guides/install.md)).

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

slipbox reads a repository's remote addresses from its git config, to name the repository. It never contacts them. It
never fetches, pulls or pushes.

A repository set up to download on demand can still reach its remote while slipbox asks git something. It would do the
same from your shell. For example:

- a partial clone fetching an object it lacks
- in a vault you trust, Git LFS fetching a file when you switch branches or throw away a change

## What slipbox never sends

- **No telemetry, no analytics, no crash reports.** Nothing about how you use slipbox, or what your notes hold, leaves
  your machine through it. What does leave is what you send yourself: an export, or text you copy.
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

Everything else it keeps is in four folders of its own, all on your machine (in WSL, inside WSL). They're for your
settings, its state, its data and its cache. [Where slipbox keeps things](configuration.md#where-slipbox-keeps-things)
says where they are, and lists every file in them.

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
  each, so that links from one to another count everywhere. `index.background = false` turns it off.

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
