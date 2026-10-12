# Privacy

slipbox works on files on your machine. It has no account and no telemetry: it collects nothing about you, and sends
nothing about you or your notes anywhere. This chapter lists every time it reaches the network, and how to stop each
one; what it never sends; which programs it runs; and what it keeps on your machine, and how to remove it all.

## When slipbox reaches the network

It does in three cases, and only these: [the update check](#the-update-check), installing
[a language server](#language-servers-installed-from-npm), and fetching [a picture](#pictures-on-the-internet) on the
internet.

| What | When | How to turn it off |
| --- | --- | --- |
| The update check | once a day, in a release you installed | `update.check = false`, or `DO_NOT_TRACK` |
| Language servers, markdownlint | the first time one is needed | `lsp.auto_install = false` |
| Pictures on the internet | when you ask for one (by default) | `render.images_remote = "never"` |

The settings are in your config file ([Configuration](configuration.md)). Beyond these, slipbox downloads only when you
ask it to: installing it, and `slipbox upgrade` ([Installing slipbox](../guides/install.md)).

### The update check

A slipbox installed from a release (by its installer or by Homebrew) asks, once a day, whether there's a newer
release. When there is, the message line says so, and how to get it:

```text
slipbox 0.3.0 is out (this is 0.2.0): slipbox upgrade installs it
```

- **Only the full-screen slipbox asks**, while it runs; never the command line, which agents and scripts call. A
  slipbox run from its source code never asks.
- **What is sent:** one request for a small public file, the list of the latest release's files and their checksums,
  from where slipbox's releases are published (GitHub). An install that follows previews
  ([Previews](../guides/install.md#previews)) asks two more: which preview is the newest, from slipbox's site on
  GitHub Pages, and that preview's list. The requests carry nothing about you, your machine or your notes; like any
  request, each shows its server your IP address.
- **At most once a day.** slipbox notes when it last asked before it asks (in `update.json`, in its state folder), so
  a check that failed waits a day too.
- **To turn it off**, set `update.check = false` in your own config file, or set the environment variable
  `DO_NOT_TRACK` to anything but `0` or `false`. Only your own config counts here: slipbox ignores `update.check` in
  a folder's own settings, with a warning, so a folder you clone can't turn the check on, or off.
- **`SLIPBOX_RELEASES_URL`** points the check, and `slipbox upgrade`, at another place laid out as the releases are, a
  mirror of your own; **`SLIPBOX_CHANNELS_URL`**, at another place for the site's files naming the newest preview.

### Language servers installed from npm

slipbox shows a code file's problems, and answers questions about its code, through a language server: a separate
program for that language ([Code](code.md)). When you open a code file and its language server isn't on your machine,
but is published on npm, slipbox installs it from npm's registry the first time it's needed, and says so:

```text
installing pyright (pyright@1.1.414) into slipbox's own folder…
```

- **What is fetched:** that package, at the exact version slipbox names, and the packages it needs, each checked
  against the checksum slipbox carries for it. They go into slipbox's own folder, never anywhere else on your system,
  and no package's install script runs. npm's registry sees which packages are fetched, and your IP address.
- **markdownlint-cli2**, which slipbox runs to show your linter's findings in notes, is installed the same way when
  it's needed: where you have a markdownlint config, or `lint.enabled = "on"`.
- **The command line installs too**, for `slipbox diagnostics <file>` and `slipbox problems --lint`, which run the same
  servers and linter.
- **A server that isn't on npm** (rust-analyzer, gopls and others) is never installed: `slipbox doctor` says how to get
  it ([Troubleshooting](troubleshooting.md)).
- **To turn it off**, set `lsp.auto_install = false`: nothing is installed, and `slipbox doctor` lists what's missing.
  `lsp.enabled = false` turns language servers off altogether.

A language server is a program of its own, and once it runs it may reach the network as it would in any editor: to
fetch a schema a file names, say, or a project's dependencies. slipbox turns off the YAML server's telemetry, and never
passes on a telemetry event a server sends it.

Only your own config counts here: a folder's own settings (its `.slipbox/config.toml`) can't turn installing on, or
off. slipbox ignores `lsp.auto_install` there, with a warning, so a folder you clone can't install from npm against
your settings.

### Pictures on the internet

A note can show a picture whose address is on the web: `![A cup](https://example.org/cup.png)`. Fetching it tells
that site your IP address and that the picture was asked for, which is what a tracking picture in a note someone sent
you would want. So slipbox fetches one only as `render.images_remote` says:

- **`ask`**, the default: the picture is shown as its link. `enter` on it asks `Fetch this picture from
  https://example.org?`, with three answers: `o` this once; `s` this one and any other from that site without asking,
  until slipbox quits; `n` no.
- **`show`**: fetched when the note is drawn, where your terminal draws pictures.
- **`never`**: never fetched; `enter` on it copies its address.

A picture fetched is kept in slipbox's cache and drawn from there afterwards, without asking or fetching again. Only a
picture is kept: a site's answer that isn't one, or that is larger than 20 MB, is refused. The command line never
fetches a picture, and an export uses only slipbox's copy ([Exporting](export.md)).

Only your own config counts here too: slipbox ignores `render.images_remote` in a folder's own settings, with a
warning, so a folder you clone can't set it to `show` and have its pictures fetched as you read.

### git and your repositories' remotes

slipbox reads a repository's remote addresses from its git config, to name the repository, but never contacts them: it
never fetches, pulls or pushes. A repository set up to download on demand can still reach its remote while slipbox asks
git something, as it would from your shell: a partial clone fetching an object it lacks, or, in a root you trust, Git
LFS fetching a file when you switch branches or throw away a change.

## What slipbox never sends

- **No telemetry, no analytics, no crash reports.** Nothing about how you use slipbox, or what your notes hold, leaves
  your machine through it. What does is what you send yourself: an export, or text you copy.
- **Bun's crash reports are off.** slipbox runs on Bun, which, when it crashes, can send a report to Bun's developers.
  slipbox turns this off as it starts. If you set `BUN_ENABLE_CRASH_REPORTING` or `BUN_CRASH_REPORT_URL` yourself,
  slipbox leaves them as you set them. A crash still prints a link you can follow to report it yourself.

## What slipbox runs

slipbox runs programs you chose, never one a folder names:

- **git**, in a repository, to show and make changes ([Git](git.md)).
- **Your editor**, when you hand a note to it (`editor.command`, else `$VISUAL`, else `$EDITOR`, else `vi`), and a
  **running editor** you send a note to (`editor.remote`; nvim by default) ([Editing](editing.md)).
- **Language servers and linters** for code, and **markdownlint-cli2** for notes ([Code](code.md)).
- **Your shell**, for a command you type after `:!`.
- **Your clipboard's tool** (`pbcopy`, `wl-copy`, `xclip`, `xsel`, or Windows' in WSL), to copy and paste.
- **Bun**, which slipbox carries, to install a language server; and `tar`, when `slipbox upgrade` unpacks a release.

A folder's own settings never name a program to run: only your own config can set `editor.command`, `editor.remote`,
`lint.command`, a language server's command, or a linter's ([Configuration](configuration.md)).

A folder can hold tools of its own (a project's own TypeScript, its linters' settings, git hooks and filters) that
would run code it holds. In a root you don't trust, none of that runs: servers run in a safe mode, or not at all, and
git runs none of the repository's hooks or filters. slipbox asks the first time it matters (`Trust ~/code/app? …`), and
keeps your answer on your machine, never in the folder. `:trust` and `:untrust` change it, and `trust.roots` in your
config trusts folders ahead of time. The command line never asks, and has no way to trust a folder: only you can, in
slipbox. [Code](code.md) explains trust in full.

## What slipbox keeps on your machine

Opening a folder writes nothing into it. slipbox writes into your folders only what you ask for: notes you save,
exports, the `.slipbox/` folder `slipbox init` makes, and the scratch, if you set `capture.location = "vault"`.

Everything else it keeps is in four folders of its own, for your settings, its state, its data and its cache, all on
your machine (in WSL, inside WSL). [Where slipbox keeps things](configuration.md#where-slipbox-keeps-things) says where
they are and lists every file in them.

Some of it is as personal as your notes:

- **The state folder** holds the scratch, and the trash: a note you delete in slipbox is moved there, so it can be put
  back, and stays for 30 days, unless you restore it. To be rid of a deleted note for good sooner, empty the trash: the
  last row of its list (`space v t`), or `slipbox trash empty --yes`. The state folder also records which files you
  read and where you were in them, and the folders slipbox has found.
- **The cache** holds a search index of each folder of notes, with their words in it. Deleting the cache is always
  safe: slipbox makes it again. It carries a `CACHEDIR.TAG`, so backup tools that know the tag leave it out.
- **The background index** looks through your home folder, while you aren't working, for folders of notes, and
  indexes each, so that links from one to another count everywhere. `index.background = false` turns it off.

## Removing it all

`slipbox uninstall` lists what it would remove, and removes nothing until you add `--yes`:

```bash
slipbox uninstall --purge          # list: slipbox, and its four folders
slipbox uninstall --purge --yes    # remove them
```

Without `--purge`, it removes only what its installer put there, and lists its folders as kept. With it, the four
folders go too: your settings, the scratch, the trash, your words, and everything in the cache. Your notes, and the
`.slipbox/` folders in them, are never touched. Installed by Homebrew, `brew uninstall slipbox` removes the program;
`slipbox uninstall --purge --yes`, run first, removes the folders.

What slipbox wrote into your folders at your asking stays: exports, `.slipbox/` folders, a scratch kept in a folder.
Remove them by hand if you want them gone.
