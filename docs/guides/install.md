# Installing slipbox

slipbox runs in a terminal, on macOS and Linux, and on Windows through WSL. Today you install it from its source code.
Release builds, with an installer and a Homebrew formula, are ready to be made, but none has been published yet. This
guide covers both ways, then checking that it works, upgrading and removing it.

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
  pictures in your notes. In any other, a picture shows as its caption and its path.
- **A clipboard tool, on Linux.** slipbox copies through the terminal first. For copies to always arrive, and for
  pasting, install `wl-clipboard` (Wayland), or `xclip` or `xsel` (X11). macOS and WSL need nothing.

## Installing from source

This is how slipbox is installed today. You need Bun and a copy of slipbox's source: it has no public repository
yet, so this is the copy you were given, a clone or an unpacked archive. In its folder:

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
- Use it or a release, not both: with a release installed, remove it first (`slipbox uninstall --yes`, below).

## Installing a release

No release has been published yet; until one is, install from source. When there is one, it comes two ways.

**The installer.** Each release carries an installer, `install.sh`, which you run straight from the release's
downloads (its address will be on the release's page):

```bash
curl -fsSL <the address of the release's install.sh> | sh
```

It picks the build for your machine (macOS or Linux, Intel or ARM, and Alpine's own), checks the download against the
checksum written into the installer, and installs slipbox into `~/.local/share/slipbox`, with a `slipbox` link in
`~/.local/bin`. Nothing runs as root and nothing else is touched. If `~/.local/bin` isn't on your PATH, it says how to
add it. On Alpine without curl, `wget -qO- <the same address> | sh` does the same. `SLIPBOX_BIN_DIR` puts the link in
another folder.

The installer stops, before downloading anything, if there's already a `slipbox` in `~/.local/bin` that it didn't put
there, such as the source launcher. Remove that one first (`rm ~/.local/bin/slipbox`) and run it again.

**Homebrew**, on macOS and Linux: from slipbox's own tap, once it has one, with `brew install` and the tap's name.

Releases aren't signed. On a Mac, Gatekeeper stops a slipbox downloaded with a web browser; the installer's isn't
stopped.

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
`slipbox upgrade --check` only says whether there is one. The version you had stays beside the new one, so you can go
back to it.

**Installed with Homebrew:** `brew upgrade slipbox`.

A release build asks once a day, while you use it, whether a newer release is out, and says so in a message. It sends
nothing about you, and `update.check = false` in your settings, or `DO_NOT_TRACK` set in your environment, turns it
off. The [privacy chapter](../manual/privacy.md) has what slipbox sends, and when.

## Uninstalling

`slipbox uninstall` lists what it would remove, and removes nothing until you run it again with `--yes`:

```bash
slipbox uninstall          # lists what would go
slipbox uninstall --yes    # removes it
```

It removes what the installer put in place: the `slipbox` link in `~/.local/bin` and the versions in
`~/.local/share/slipbox`. slipbox's own folders stay, listed as kept:

- `~/.config/slipbox`: your settings and themes;
- `~/.local/state/slipbox`: your sessions, the scratch, the trash, undo, reading positions, the folders it knows;
- `~/.local/share/slipbox`: your own words for spelling, and language servers it installed for you;
- `~/.cache/slipbox`: indexes and pictures, all made again when missing.

`--purge` removes these too. Your notes are never touched, nor the `.slipbox/` folders in them. (If you set the
`XDG_CONFIG_HOME`, `XDG_STATE_HOME`, `XDG_DATA_HOME` or `XDG_CACHE_HOME` variables, the folders are there instead.)

**Installed with Homebrew:** `slipbox uninstall --purge --yes` first, if you want slipbox's folders gone, then `brew
uninstall slipbox`.

**Installed from source:** `slipbox uninstall --purge --yes`, if you want slipbox's folders gone; then remove the
launcher (`rm ~/.local/bin/slipbox`), the skill's link if you made one (`rm ~/.claude/skills/slipbox`), and the
source folder.
