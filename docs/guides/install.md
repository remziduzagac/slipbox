# Installation

<a id="installing-slipbox"></a>

slipbox runs in a terminal, on a Mac with Apple silicon, on Linux, and on Windows through WSL. Intel Macs aren't
supported any more ([Intel Macs](#intel-macs)). This guide covers the two ways to install it, then checking that it
works, upgrading it and removing it.

- One line installs a release build, which needs nothing else on your machine.
- You can also run slipbox from its source code.

## What you need

- **A terminal** that uses UTF-8, as nearly all do now. slipbox works inside tmux and other multiplexers too.
- **Bun 1.4.2 or later**, only to run slipbox from source. Bun is the JavaScript runtime slipbox is built on. A
  release build carries it inside, so it needs nothing installed. Bun's own site, bun.sh, says how to install it.

That is all slipbox needs. These make it better:

- **True colour.** The themes are drawn in 24-bit colour, which most current terminals have. If yours shows them
  wrong, use the `terminal` theme. It takes the terminal's own colours instead ([Making slipbox
  yours](making-it-yours.md)).
- **A Nerd Font**, for icons. They show on headings and tasks, beside the explorer's files and folders, and on
  buttons. Ghostty, kitty and WezTerm carry these icons themselves, and slipbox uses them there. In other terminals,
  slipbox draws plain symbols every font has, until you tell it your font has the icons
  ([Making slipbox yours](making-it-yours.md)).
- **Pictures.** A terminal that draws images with kitty's graphics protocol (kitty, Ghostty) or with sixel shows the
  pictures in your notes. In any other terminal, a picture shows as its caption.
- **A clipboard tool, on Linux.** slipbox copies through the terminal first. For copies to always arrive, and for
  pasting, install `wl-clipboard` (Wayland), or `xclip` or `xsel` (X11). macOS and WSL need nothing.

## Installing a release

One line installs the latest release:

```bash
curl -fsSL https://remziduzagac.github.io/slipbox/install.sh | sh
```

The newest preview installs the same way. A preview is a build of what the next release will hold
([Previews](#previews), below):

```bash
curl -fsSL https://remziduzagac.github.io/slipbox/install.sh | sh -s -- --preview
```

The script at that address installs nothing itself. It looks up which release to install, and downloads that
release's own installer. It checks the installer against the checksum published for it, then runs it.

The installer picks the build for your machine: a Mac with Apple silicon, Linux on Intel or ARM, and Alpine's own. It
checks the download against the checksum written into it. Then it installs slipbox into `~/.local/share/slipbox`, with
a `slipbox` link in `~/.local/bin`. Nothing runs as root, and nothing else is touched.

If `~/.local/bin` isn't on your PATH, the installer says how to add it. `SLIPBOX_BIN_DIR` puts the link in another
folder.

On Alpine, slipbox needs the C++ runtime, which a bare Alpine doesn't have. Run `apk add libstdc++ libgcc` first. The
installer says so if they're missing.

Without curl, busybox's wget does the same as curl, `--preview` too:

```bash
wget -qO- https://remziduzagac.github.io/slipbox/install.sh | sh
wget -qO- https://remziduzagac.github.io/slipbox/install.sh | sh -s -- --preview
```

The installer stops if there's already a `slipbox` in `~/.local/bin` that it didn't put there, such as the source
launcher. It stops before downloading anything. Remove that one first (`rm ~/.local/bin/slipbox`), then run the
installer again.

**Homebrew**, on a Mac with Apple silicon and on Linux:

```bash
brew install remziduzagac/tap/slipbox
```

Homebrew installs releases only, never previews. It upgrades slipbox with `brew upgrade`.

Releases aren't signed. On a Mac, Gatekeeper stops a slipbox downloaded with a web browser. It doesn't stop the one
the installer downloads.

**Checking a download.** Beside its builds, a release lists:

- `SHA256SUMS`, their checksums.
- For each build, an SBOM, `slipbox-<version>-<platform>.cdx.json`. It lists the software built into that build, with
  their licences, in CycloneDX's format.

A preview carries the same.

Every file is attested. Run `gh attestation verify <file> --repo remziduzagac/slipbox`, and GitHub's CLI shows that the
file was built by slipbox's own workflows, and from which commit. A release is built from its tag, a preview from the
`test` branch. Adding `--predicate-type https://cyclonedx.org/bom` checks a build against its SBOM.

Installing also installs the bundled agent skill when Claude Code or Codex has an existing user configuration.
Claude Code uses `${CLAUDE_CONFIG_DIR:-~/.claude}/skills`. Codex uses `${CODEX_HOME:-~/.codex}/skills`;
with the default Codex home, slipbox also installs into `~/.agents/skills`, the current shared user skill location.
Each destination is reported. No agent configuration is created just to install a skill.

This happens without a prompt, including in scripts. To skip it, pass `--no-skill`:

```bash
curl -fsSL https://remziduzagac.github.io/slipbox/install.sh | sh -s -- --no-skill
```

Or set `SLIPBOX_NO_SKILL=1` in the installer's environment. For Homebrew, use
`HOMEBREW_SLIPBOX_NO_SKILL=1 brew install slipbox`; Homebrew filters ordinary environment variables.
For custom agent homes with Homebrew, pass `HOMEBREW_SLIPBOX_CLAUDE_CONFIG_DIR` or `HOMEBREW_SLIPBOX_CODEX_HOME`.
These prefixed variables have the same meanings as their ordinary counterparts. The skip also applies to upgrades.
If Homebrew's sandbox prevents writing a skill, its report says what stayed; run `slipbox skill --auto` afterward.
Foreign or linked skills are left alone and reported; skill installation errors do not undo a binary installation.
[Working with agents](agents.md#give-the-agent-the-skill) covers manual destinations and ownership.

### Previews

Between releases, slipbox publishes previews. A preview is a build of what the next release will hold, for those who
want it before it's released. It's made as a release is, from code that passed slipbox's checks.

What a preview adds may still change before the release. A preview may also have bugs the release won't.
[Versions](../manual/versions.md#previews) says how previews are numbered.

`--preview` installs the newest preview, and the install then follows previews:

- `slipbox upgrade` installs the newest of the latest release and the newest preview.
- The daily update check tells you of either.

An install follows one of two channels: `stable` (the releases) or `preview`. `slipbox channel` says which, and
changes it:

```bash
slipbox channel                  # stable, or preview
slipbox channel set preview      # follow previews from now on
slipbox channel set stable       # back to releases only
```

Back on `stable`, a preview you have stays until a release newer than it is out. That release is the next upgrade.

## Installing from source

You need Bun and a copy of slipbox's source. Clone its repository,
`git clone https://github.com/remziduzagac/slipbox`, or unpack an archive of it. Then, in its folder:

```bash
bun install
bun src/main.ts --version
```

`bun install` fetches the libraries slipbox uses into the folder's `node_modules`. The second line prints `slipbox`
and its version, `slipbox 0.2.0` for instance. If it says slipbox needs a newer Bun, upgrade Bun and try again.

You can already run it from there, with `bun src/main.ts ~/notes`. But a `slipbox` command is handier, and the
launcher script makes one:

```bash
scripts/install-local.sh
```

The launcher script writes a small `slipbox` script into `~/.local/bin`. That script runs this folder's code with
Bun. The launcher says where it put it. If `~/.local/bin` isn't on your PATH, it says that too. In that case, add it in
your shell's profile, with a line such as `export PATH="$HOME/.local/bin:$PATH"`, and open a new terminal. Then
`slipbox --version` works from anywhere.

A few things to know about the launcher:

- It runs the code in this folder, where it is now. If you move the folder, run `scripts/install-local.sh` again.
- It starts Bun, so Bun must be on the PATH wherever `slipbox` is run: your shell, your editor, an agent.
- `SLIPBOX_BIN_DIR=$HOME/bin scripts/install-local.sh` puts it in another folder.
- The script installs the skill for detected agents too. `--no-skill` skips it; `--skill` remains accepted,
  but now writes a regular skill file instead of creating a link. [Working with agents](agents.md) explains the skill.
- Use it or a release, not both. With a release installed, remove the release first (`slipbox uninstall --yes`,
  below). If you run the launcher over a release's `slipbox` link, it replaces the link with its own script, and says
  so. The release itself is left untouched, and `slipbox uninstall --yes` still removes it, keeping the launcher.

## Windows, through WSL

On Windows, slipbox runs inside WSL, the Windows Subsystem for Linux.

1. Install a Linux distribution in WSL, Ubuntu for instance.
2. Open it in a terminal, such as Windows Terminal.
3. Install slipbox inside it, as on Linux.

slipbox uses Windows' clipboard, so copying and pasting work across both. An export to PDF finds Windows' fonts.

Keep your notes in WSL's own folders (`~/notes` inside it), not on a Windows drive (`/mnt/c/…`). WSL isn't told when
a Windows program changes a file on a Windows drive. So on a Windows drive, slipbox notices changes only in the notes
it has open, and it reads more slowly. It says so once when you open notes there.

slipbox doesn't run on Windows outside WSL.

## Intel Macs

slipbox isn't built for Intel Macs any more. Apple has stopped making macOS for them: macOS 26 Tahoe is the last one
they get. 0.3.0 was the last release of slipbox built for them, and it isn't published any more.

On an Intel Mac, the installer says so and stops, before downloading anything. Homebrew won't install a release
either: it says the arm64 architecture is required. A 0.3.0 already installed keeps working: there, `slipbox upgrade`
says it couldn't find the latest release's `darwin-x64` build, and the daily update check finds nothing newer. Running
slipbox from source may still work on an Intel Mac, but nothing tests it there.

## Checking it works

Check the version:

```bash
slipbox --version
```

It prints `slipbox` and its version. Then open a folder of Markdown notes:

```bash
slipbox ~/notes
```

slipbox fills the terminal with the folder's notes. `ctrl+q` quits. If you have no notes yet, or want a tour,
[Working with slipbox](getting-started.md) makes a small folder and goes on from here.

In a folder, `slipbox info` lists what slipbox found there: the folder, how many notes, the settings files it read,
and where it keeps its own files for that folder. If something looks wrong, the
[troubleshooting chapter](../manual/troubleshooting.md) has the usual problems and their fixes.

## Upgrading

**From source:** bring the folder up to date (`git pull`, in a clone), then run `bun install` again. The launcher runs
whatever the folder holds. Run `scripts/install-local.sh` again to refresh the installed agent skill.
slipbox run from source never checks for releases.
`slipbox upgrade` tells you to update the folder instead.

**Installed with the installer:** `slipbox upgrade` installs the latest release, checked as the installer checks it.
`slipbox upgrade --check` only says whether there is one. On previews, `slipbox upgrade` installs the newest of the
latest release and the newest preview ([Previews](#previews)). The version you had stays beside the new one, so you can
go back to it.

Upgrades automatically refresh recognized skills in the detected user locations, using the new binary's skill.
The TUI's upgrade completion and restart messages retain the skill destinations and any refusals too.
`slipbox upgrade --no-skill` skips this, as does `SLIPBOX_NO_SKILL=1`. A hand-written file whose frontmatter does not
name it `slipbox`, or a linked destination, stays untouched. For a manually chosen location outside the detected
folders, run `slipbox skill --install <folder>` again yourself.

**Installed with Homebrew:** `brew upgrade slipbox` attempts to refresh skills through its post-install hook too.
If its sandbox refuses a destination, run `slipbox skill --auto` afterward.

slipbox's [changelog](../../CHANGELOG.md) says what each new version changed. Read it before an upgrade that may break
something. Before 1.0, that's an upgrade to a new minor version, such as `0.2.1` to `0.3.0`.
[Versions](../manual/versions.md) says what each kind of release may change.

A release build asks once a day, while you use it, whether a newer release is out. On previews, it asks about a newer
preview too. It sends nothing about you. To turn it off, set `update.check = false` in your settings, or set
`DO_NOT_TRACK` in your environment. The [privacy chapter](../manual/privacy.md) has what slipbox sends, and when.

### When a newer version is out

When there is one, slipbox offers it in a small window, once you've stopped typing for a moment. Keys you were typing
as it opens don't answer it. What it offers depends on how you installed slipbox.

**Installed with the installer:**

- **Upgrade and restart:** slipbox quits as it does, installs the new version as `slipbox upgrade` does, and starts it
  in the same terminal. You come back where you were: the same folder, tabs, windows and places in your notes. While
  it installs, `ctrl+c` cancels; a failed or cancelled upgrade starts the version you had, and says why.
- **Upgrade, restart later:** the new version is installed while you go on working, and a message says when it's
  ready. `:restart` starts it when you choose. Quitting before it's done leaves it to finish: the next start runs it.
- **Not now:** asked again at the next check, a day later.

**Installed with Homebrew:** it copies `brew upgrade slipbox`, to run in a shell. **Put somewhere by hand:** it copies
the address of the releases. Either way, once the new version is in place, slipbox offers to restart into it.

Tick **Skip this version**, which marks Not now, and that version isn't offered again; a newer one is. `esc` is Not now.

`:upgrade` asks at once, even with the daily check off, and offers what it finds, a skipped version included. A
version installed while slipbox runs, from another terminal or by `brew upgrade`, is noticed within seconds and offered
as a restart alone.

`:restart` starts slipbox again, as the newest version installed, where you are. Notes with unsaved changes are asked
about first: **Save and restart** saves them as `:wqa` does; **Cancel** restarts nothing.

## Uninstalling

`slipbox uninstall` lists what it would remove. It removes nothing until you run it again with `--yes`:

```bash
slipbox uninstall          # lists what would go
slipbox uninstall --yes    # removes it
```

It removes what the installer put in place:

- the `slipbox` link in `~/.local/bin`
- the versions in `~/.local/share/slipbox`, with which one is in use and which channel it follows

slipbox's own four folders stay, listed as kept: your settings, its state with the scratch and the trash, its data
with your words, and its cache. `--purge` removes these too.
[Where slipbox keeps things](../manual/environment-and-storage.md#where-slipbox-keeps-things) says where they are and
what each holds.

Your notes are never touched, nor the `.slipbox/` folders in them.

Uninstall lists recognized skills in the detected agent locations and removes them with `--yes`, even without
`--purge`. Recognition matches `skill --install`: the file's frontmatter names it `slipbox`. Hand-written files
that do not match, and linked destinations, stay and are reported. Only `SKILL.md` and its now-empty folder are
removed; other files stay. Skills in other, manually chosen folders must be removed manually.

**Installed with Homebrew:**

1. Run `slipbox uninstall --yes` first to remove its skills; add `--purge` for slipbox's folders too.
2. Run `brew uninstall slipbox`.

**Installed from source:**

1. Run `slipbox uninstall --yes` to remove its skills; add `--purge` for slipbox's folders too.
2. Remove the launcher (`rm ~/.local/bin/slipbox`).
3. Remove the skill's link, if you made one (`rm ~/.claude/skills/slipbox`).
4. Remove the source folder.

The top bar always shows the version you are running, shortening a preview to `0.5.2-P`. Click it or press
`space a` for the full version and channel, the previous version recorded by the last installer upgrade, and any
available upgrade. The release notes address can be copied from that popup. A package-manager install shows its
upgrade command. The previous version is informational; upgrading always moves forward.
