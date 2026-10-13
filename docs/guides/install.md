# Installing slipbox

slipbox runs in a terminal, on macOS and Linux, and on Windows through WSL. One line installs a release build, which
needs nothing else on your machine; you can also run it from its source code. This guide covers both ways, then
checking that it works, upgrading and removing it.

## What you need

- **A terminal** that uses UTF-8, as nearly all do now. slipbox works inside tmux and other multiplexers too.
- **Bun 1.4.2 or later**, only to run slipbox from source. Bun is the JavaScript runtime slipbox is built on; a
  release build carries it inside and needs nothing installed. Bun's own site, bun.sh, says how to install it.

That is all slipbox needs. These make it better:

- **True colour.** The themes are drawn in 24-bit colour, which most current terminals have. If yours shows them
  wrong, the `terminal` theme takes the terminal's own colours instead ([Making it yours](making-it-yours.md)).
- **A Nerd Font**, for icons: on headings and tasks, beside the explorer's files and folders, on buttons. Ghostty,
  kitty and WezTerm carry these icons themselves, and slipbox uses them there; in other terminals it draws plain
  symbols every font has, until you tell it your font has the icons ([Making it yours](making-it-yours.md)).
- **Pictures.** A terminal that draws images, with kitty's graphics protocol (kitty, Ghostty) or with sixel, shows the
  pictures in your notes. In any other, a picture shows as its caption.
- **A clipboard tool, on Linux.** slipbox copies through the terminal first. For copies to always arrive, and for
  pasting, install `wl-clipboard` (Wayland), or `xclip` or `xsel` (X11). macOS and WSL need nothing.

## Installing a release

One line installs the latest release:

```bash
curl -fsSL https://remziduzagac.github.io/slipbox/install.sh | sh
```

The newest preview, a build of what the next release will hold ([Previews](#previews), below), installs the same
way:

```bash
curl -fsSL https://remziduzagac.github.io/slipbox/install.sh | sh -s -- --preview
```

The script at that address installs nothing itself: it looks up which release to install, downloads that release's
own installer, checks it against the checksum published for it, and runs it. The installer picks the build for your
machine (macOS or Linux, Intel or ARM, and Alpine's own), checks the download against the checksum written into it,
and installs slipbox into `~/.local/share/slipbox`, with a `slipbox` link in `~/.local/bin`. Nothing runs as root and
nothing else is touched. If `~/.local/bin` isn't on your PATH, it says how to add it. `SLIPBOX_BIN_DIR` puts the link
in another folder.

On Alpine, slipbox needs the C++ runtime, which a bare Alpine hasn't: `apk add libstdc++ libgcc` first (the
installer says so if they're missing). Without curl, busybox's wget does the same as curl, `--preview` too:

```bash
wget -qO- https://remziduzagac.github.io/slipbox/install.sh | sh
wget -qO- https://remziduzagac.github.io/slipbox/install.sh | sh -s -- --preview
```

The installer stops, before downloading anything, if there's already a `slipbox` in `~/.local/bin` that it didn't put
there, such as the source launcher. Remove that one first (`rm ~/.local/bin/slipbox`) and run it again.

**Homebrew**, on macOS and Linux, from 0.3.0 on:

```bash
brew install remziduzagac/tap/slipbox
```

Homebrew installs releases only, never previews, and upgrades slipbox with `brew upgrade`.

Releases aren't signed. On a Mac, Gatekeeper stops a slipbox downloaded with a web browser; the installer's isn't
stopped.

**Checking a download.** Beside its builds, a release lists `SHA256SUMS`, their checksums, and for each build an
SBOM, `slipbox-<version>-<platform>.cdx.json`: the software built into it, with their licences, in CycloneDX's
format. A preview carries the same. Every file is attested: GitHub's CLI shows that a file was built by slipbox's own
workflows, from which commit, with `gh attestation verify <file> --repo remziduzagac/slipbox`; a release is built from
its tag, a preview from the `test` branch. Adding `--predicate-type https://cyclonedx.org/bom` checks a build against
its SBOM.

A release carries the skill for agents: `slipbox skill --install ~/.claude/skills` installs it for Claude Code, and
[Working with agents](agents.md#give-the-agent-the-skill) shows the rest.

### Previews

Between releases, slipbox publishes previews: builds of what the next release will hold, made as a release is from code
that passed slipbox's checks, for those who want it before it's released. What a preview adds may still change before
the release, and it may have bugs the release won't. [Versions](../manual/versions.md#previews) says how they're
numbered.

`--preview` installs the newest preview, and the install then follows previews: `slipbox upgrade` installs the newest
of the latest release and the newest preview, and the daily update check tells you of either. An install follows one
of two channels, `stable` (the releases) or `preview`. `slipbox channel` says which, and changes it:

```bash
slipbox channel                  # stable, or preview
slipbox channel set preview      # follow previews from now on
slipbox channel set stable       # back to releases only
```

Back on `stable`, a preview you have stays until a release newer than it is out: that release is the next upgrade.

## Installing from source

You need Bun and a copy of slipbox's source: clone its repository,
`git clone https://github.com/remziduzagac/slipbox`, or unpack an archive of it. In its folder:

```bash
bun install
bun src/main.ts --version
```

`bun install` fetches the libraries slipbox uses into the folder's `node_modules`. The second line prints `slipbox`
and its version, `slipbox 0.2.0` for instance. If it says slipbox needs a newer Bun, upgrade Bun and try again.

You can already run it from there, `bun src/main.ts ~/notes`, but a `slipbox` command is handier. The launcher script
makes one:

```bash
scripts/install-local.sh
```

It writes a small `slipbox` script into `~/.local/bin` that runs this folder's code with Bun, and says where it put it.
If `~/.local/bin` isn't on your PATH, it says that too: add it in your shell's profile, with a line such as
`export PATH="$HOME/.local/bin:$PATH"`, and open a new terminal. Then `slipbox --version` works from anywhere.

A few things to know about the launcher:

- It runs the code in this folder, where it is now. If you move the folder, run `scripts/install-local.sh` again.
- It starts Bun, so Bun must be on the PATH wherever `slipbox` is run: your shell, your editor, an agent.
- `SLIPBOX_BIN_DIR=$HOME/bin scripts/install-local.sh` puts it in another folder.
- `scripts/install-local.sh --skill` also links slipbox's skill for agents into `~/.claude/skills/slipbox`, where
  Claude Code finds it. It leaves a folder already there alone, and says so. [Working with agents](agents.md) says
  what the skill is for.
- Use it or a release, not both: with a release installed, remove it first (`slipbox uninstall --yes`, below). Run
  over a release's `slipbox` link, the launcher replaces the link with its own script, and says so. The release itself
  is left untouched, and `slipbox uninstall --yes` still removes it, keeping the launcher.

## Windows, through WSL

On Windows, slipbox runs inside WSL, the Windows Subsystem for Linux. Install a Linux distribution there (Ubuntu, for
instance), open it in a terminal such as Windows Terminal, and install slipbox inside it as on Linux. slipbox uses
Windows' clipboard, so copying and pasting work across both, and an export to PDF finds Windows' fonts.

Keep your notes in WSL's own folders (`~/notes` inside it) rather than on a Windows drive (`/mnt/c/…`). WSL isn't told
when a Windows program changes a file on a Windows drive, so there slipbox notices changes only in the notes it has
open, and reads more slowly; it says so once when you open notes there.

slipbox doesn't run on Windows outside WSL.

## Checking it works

```bash
slipbox --version
```

prints `slipbox` and its version. Then open a folder of Markdown notes:

```bash
slipbox ~/notes
```

slipbox fills the terminal with the folder's notes, and `ctrl+q` quits. If you have no notes yet, or want a tour,
[Getting started](getting-started.md) makes a small folder and goes on from here.

In a folder, `slipbox info` lists what slipbox found there: the folder, how many notes, the settings files it read,
and where it keeps its own files for that folder. If something looks wrong, the
[troubleshooting chapter](../manual/troubleshooting.md) has the usual problems and their fixes.

## Upgrading

**From source:** bring the folder up to date (`git pull`, in a clone), then run `bun install` again. The launcher runs
whatever the folder holds, so there's nothing more to do. slipbox run from source never checks for releases, and
`slipbox upgrade` tells you to update the folder instead.

**Installed with the installer:** `slipbox upgrade` installs the latest release, checked as the installer checks it;
`slipbox upgrade --check` only says whether there is one. On previews, it installs the newest of the latest release
and the newest preview ([Previews](#previews)). The version you had stays beside the new one, so you can go back to it.

If you installed the skill for agents with `slipbox skill --install`, run that again after an upgrade, so the skill
matches the new version.

**Installed with Homebrew:** `brew upgrade slipbox`.

What a new version changed is in slipbox's [changelog](../../CHANGELOG.md). Read it before an upgrade that may break
something: before 1.0, one to a new minor version, such as `0.2.1` to `0.3.0`. [Versions](../manual/versions.md)
says what each kind of release may change.

A release build asks once a day, while you use it, whether a newer release is out (on previews, a newer preview too),
and says so in a message. It sends nothing about you, and `update.check = false` in your settings, or `DO_NOT_TRACK`
set in your environment, turns it off. The [privacy chapter](../manual/privacy.md) has what slipbox sends, and when.

## Uninstalling

`slipbox uninstall` lists what it would remove, and removes nothing until you run it again with `--yes`:

```bash
slipbox uninstall          # lists what would go
slipbox uninstall --yes    # removes it
```

It removes what the installer put in place: the `slipbox` link in `~/.local/bin`, and the versions in
`~/.local/share/slipbox` with which one is in use and which channel it follows. slipbox's own four folders (your
settings, its state with the scratch and the trash, its data with your words, and its cache) stay, listed as kept;
`--purge` removes these too. [Where slipbox keeps things](../manual/configuration.md#where-slipbox-keeps-things) says
where they are and what each holds. Your notes are never touched, nor the `.slipbox/` folders in them. The skill for
agents, if you installed it with `slipbox skill --install`, stays too: remove its folder yourself
(`rm -r ~/.claude/skills/slipbox`).

**Installed with Homebrew:** `slipbox uninstall --purge --yes` first, if you want slipbox's folders gone, then `brew
uninstall slipbox`.

**Installed from source:** `slipbox uninstall --purge --yes`, if you want slipbox's folders gone; then remove the
launcher (`rm ~/.local/bin/slipbox`), the skill's link if you made one (`rm ~/.claude/skills/slipbox`), and the
source folder.
