# Ideas

## How the hand-over takes the terminal

The issue left it to settle when built: a launcher that runs the update when slipbox exits asking for it, or slipbox,
its screen restored, running it in the foreground.

- **slipbox, its screen restored, upgrades in the foreground, then `execve`s the new version** (2026-10-24): one
  process throughout, to the shell and its job control; nothing left waiting; nothing new to install (design.md §
  Restarting; research.md). Chosen: UPG-D2.
- **The same, the new version started as a child and waited for** (2026-10-24): works wherever a process can be
  started, but each restart leaves the old one waiting under the new (a chain, one deeper a restart), with the
  terminal's signals to pass on. Chosen only where `execve` can't be reached, and for native Windows: UPG-D2.
- **A script file** slipbox writes and execs into, which runs `slipbox upgrade`, then execs the new slipbox
  (2026-10-24): the issue's words, but a file to write and remove, the arguments quoted for `sh`, and no `sh` on native
  Windows. Not chosen: UPG-D2.
- **A launcher**, `~/.local/bin/slipbox` a script that starts the binary and, when it exits with a code asking for it,
  upgrades and starts it again (2026-10-24): a shell for every run of slipbox; only the installer's install has one;
  the installer's layout changes (the link becomes a script: `installation()`, `uninstall`, the source launcher's
  replacing of a link). Not chosen: UPG-D2.

## Upgrade and restart's order

- **Quit, then upgrade, then start** — the issue's, decided (2026-10-24): the upgrade's progress and any failure on the
  terminal, between the two slipboxes.
- **Upgrade beside the TUI, then quit and start once it's installed** (2026-10-24): the TUI usable during the
  download, and a failure said without quitting at all. The issue decided the other; Upgrade, restart later then
  `:restart` gives this already.

## Where the upgrade runs

- **In the slipbox quitting** (the hand-over), as `slipbox upgrade`'s function (2026-10-24): the screen's given back,
  so nothing waits on it. Chosen: UPG-D2.
- **As `slipbox upgrade --json`, a process of its own** for Upgrade, restart later (2026-10-24): `upgrade` hashes the
  pack and runs `tar` and the new binary synchronously, which would hold the screen up. Chosen, with the design (§ The
  update offer).
- `upgrade` made asynchronous throughout and run in the TUI (2026-10-24): one way for both, but the hash of a 50 MB
  pack is still the main thread's. Not chosen.

## Keep checking daily

- **Written into your own config, `[update] check = false`**, the issue's (2026-10-24): where the setting is, so the
  config says the truth; but the TUI never writes your config today (design/tui.md § UI settings), so an exception,
  with an editor of its own to keep the file as it was. Not chosen: UPG-D1.
- Kept in state, as the UI settings' overrides are, valid while the config's value is unchanged (2026-10-24): no
  config written, but the config then says `check = true` while nothing checks. Not chosen: UPG-D1.
- Only told: a line in the pop-up naming the config's key (2026-10-24). Not chosen: UPG-D1.
- **No checkbox** (2026-10-24): Not now and Skip this version put the offer off; your config turns it off for good.
  Chosen: UPG-D1.

## Unsaved notes on a restart

- Saved, as `:wqa` saves them, a note that can't be saved stopping it (2026-10-24): a restart loses nothing. Not
  chosen: UPG-D3.
- **Asked first: Save and restart, or Cancel**, only when something's unsaved (2026-10-24): nothing written without a
  yes. Chosen: UPG-D3.
- Refused, as `:q` refuses (2026-10-24): you save, then restart. Not chosen: UPG-D3.
- Carried across unsaved, in the restart's note (2026-10-24): nothing written, but unsaved text in a state file, and a
  clash when the note changed on disk meanwhile. Not chosen: UPG-D3.

## Where a restart comes back

- **Where you were**: the vault, home's folder or Elsewhere's folder you'd gone into, in place of the arguments' path
  (2026-10-24): a restart finds your place. Chosen: UPG-D4.
- Strictly the arguments, as the issue words it (2026-10-24): back in the vault slipbox started in, with that vault's
  tabs, after going into another. Not chosen: UPG-D4.
- Where you were, the tabs only with `ui.restore_session` on (2026-10-24). Not chosen: UPG-D4.

## The restart offer with the check off

- **Offered whatever `[update] check` and `DO_NOT_TRACK` say** (2026-10-24): it sends nothing. Chosen: UPG-D5.
- Off with `[update] check = false`, read as "don't bother me about versions" (2026-10-24). Not chosen: UPG-D5.
- Off with either (2026-10-24). Not chosen: UPG-D5.

## The pop-up's select

- **A list of the choices, all shown, the one chosen marked** (`●`, `○`) (2026-10-24): three choices fit, and none is
  hidden. Chosen, with the design (tui.md § Overlays).
- A drop-down, its choice shown and the rest on opening it (2026-10-24): one more key for nothing at three choices.
  Not chosen.

## Asking again

- No `:upgrade` (2026-10-24): `slipbox upgrade` in a shell does it, and the restart is then offered (design.md § An
  upgrade underneath). Not chosen: UPG-D6.
- **`:upgrade`, `app.upgrade`, asking now** and offering what it finds, a skipped version too (2026-10-24). Chosen:
  UPG-D6.
- `:upgrade` reopening only the offer this session put off, without asking the network (2026-10-24). Not chosen:
  UPG-D6.

## Quitting during an upgrade

- **Left to finish** (2026-10-24): it's what you asked for, and the next start runs it. Chosen: UPG-D7.
- Stopped with the TUI, as shell jobs are (2026-10-24): nothing installed, asked again at the next check. Not chosen:
  UPG-D7.
- Asked on quitting (2026-10-24): one more prompt. Not chosen: UPG-D7.
