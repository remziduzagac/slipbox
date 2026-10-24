# Ideas

## How the hand-over takes the terminal

The issue left it to settle when built: a launcher that runs the update when slipbox exits asking for it, or slipbox,
its screen restored, running it in the foreground.

- **slipbox, its screen restored, upgrades in the foreground, then `execve`s the new version** (2026-10-24): one
  process throughout, to the shell and its job control; nothing left waiting; nothing new to install. Proposed
  (design.md § Restarting; research.md).
- **The same, the new version started as a child and waited for** (2026-10-24): works wherever a process can be
  started, but each restart leaves the old one waiting under the new (a chain, one deeper a restart), with the
  terminal's signals to pass on. Proposed only where `execve` can't be reached, and for native Windows.
- **A launcher**, `~/.local/bin/slipbox` a script that starts the binary and, when it exits with a code asking for it,
  upgrades and starts it again (2026-10-24): a shell for every run of slipbox; only the installer's install has one;
  the installer's layout changes (the link becomes a script: `installation()`, `uninstall`, the source launcher's
  replacing of a link). Not proposed.

## Upgrade and restart's order

- **Quit, then upgrade, then start** — the issue's, decided (2026-10-24): the upgrade's progress and any failure on the
  terminal, between the two slipboxes.
- **Upgrade beside the TUI, then quit and start once it's installed** (2026-10-24): the TUI usable during the
  download, and a failure said without quitting at all. The issue decided the other; Upgrade, restart later then
  `:restart` gives this already.

## Where the upgrade runs

- **In the slipbox quitting** (the hand-over), as `slipbox upgrade`'s function (2026-10-24): the screen's given back,
  so nothing waits on it. Proposed.
- **As `slipbox upgrade --json`, a process of its own** for Upgrade, restart later (2026-10-24): `upgrade` hashes the
  pack and runs `tar` and the new binary synchronously, which would hold the screen up. Proposed.
- `upgrade` made asynchronous throughout and run in the TUI (2026-10-24): one way for both, but the hash of a 50 MB
  pack is still the main thread's. Not proposed.

## Keep checking daily

- **Written into your own config, `[update] check = false`**, the issue's (2026-10-24): where the setting is, so the
  config says the truth. The TUI never writes your config today (design/tui.md § UI settings): an exception, `D?1`.
  Proposed, for the maintainer to agree.
- Kept in state, as the UI settings' overrides are, valid while the config's value is unchanged (2026-10-24): no
  config written, but the config then says `check = true` while nothing checks. Not proposed.
- Only told: the line to write by hand (2026-10-24). Not proposed: the issue asks for the checkbox to do it.

## Where a restart comes back

- **Where you were**: the vault, home's folder or Elsewhere's folder you'd gone into, in place of the arguments' path
  (2026-10-24). Proposed: a restart finds your place.
- Strictly the arguments, as the issue words it (2026-10-24): back in the vault slipbox started in, with that vault's
  tabs, after going into another.

## The pop-up's select

- **A list of the choices, all shown, the one chosen marked** (`●`, `○`) (2026-10-24): three choices fit, and none is
  hidden. Proposed.
- A drop-down, its choice shown and the rest on opening it (2026-10-24): one more key for nothing at three choices.

## Asking again

- `:upgrade`, `app.upgrade`: the offer of the newest the last check found, again, after Not now, without asking the
  network (2026-10-24). Not proposed: `slipbox upgrade` in a shell does it, and the restart is then offered (design.md
  § An upgrade underneath). For the maintainer to say.
