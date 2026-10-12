---
status: todo
assignee: claude-cli
blocked_by: []
created: "2026-10-12"
---

# GR-T16: Channels: the bootstrap installer, `slipbox channel`, upgrades

An install follows stable releases or previews (GR-D14, GR-D15).

## Description

- `scripts/bootstrap.template.sh` and `bun scripts/bootstrap.ts <owner/name> <out>`: the Pages `install.sh`. POSIX
  `sh`, its body a function called on the last line; `--preview` (or `SLIPBOX_CHANNEL=preview`) picks the channel; it
  reads `<pages>/<channel>`, downloads that release's `install.sh`, checks its SHA-256 and runs it with the arguments
  left and the channel; a channel with no release says so.
- The release's installer (`install.template.sh`) keeps the channel it was given in `<data>/channel`.
- `slipbox channel` says the channel; `slipbox channel set stable|preview` sets it, for an install the installer made;
  for Homebrew's or a source run it says how that one updates (exit 5). `--json` as other commands.
- `upgrade` and the daily check (`core/update.ts`): on `preview`, the newest of the stable release and the newest
  preview (`<pages>/preview`, then that release's `SHA256SUMS`); `SLIPBOX_CHANNELS_URL` stands in for Pages, as
  `SLIPBOX_RELEASES_URL` does for the releases. Nothing identifying sent (D199).
- The docs: the install guide (the one line, previews, channels; the stale "no public repository"), the CLI chapter,
  the versions chapter, the README; the skill if it mentions installing.

## Acceptance criteria

- The bootstrap tested as the installer is (fakes, a `file://` Pages and releases): stable, preview, a channel with no
  release, a wrong sum refused; the channel command and the upgrade's choice tested; tried live (D209);
  `tests/docs.test.ts` passes.
