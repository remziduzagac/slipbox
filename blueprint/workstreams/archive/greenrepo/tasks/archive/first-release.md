---
status: done
assignee: claude-cli
blocked_by: [GR-T13]
created: "2026-10-12"
---

# GR-T14: The first release

A release made by CI, verified, published by the user.

## Description

- The changelog's entry for the version; a tag pushed by the user, or by the agent with their go-ahead.
- The draft checked: every pack, `SHA256SUMS`, the installer, the formula, the SBOM, `LICENSE`; the attestations
  verify (`gh attestation verify`).
- The user publishes the draft; then the installer, `slipbox upgrade --check` and `slipbox skill` tried from the
  published release.

## Acceptance criteria

- The release installed and run as the install guide says, on Linux here; the design's "can't have run yet" gone.

## Log

- 2026-10-12: the changelog's entry for 0.2.0 dated, with Discussions and GR-D16 to GR-D18 (#14); the tag `v0.2.0`.
  Its build failed twice on the Intel Mac (`macos-15-intel`), on a watcher test that missed writes made the instant
  the watch began: macOS's watch starts a moment after it's asked for. The test now waits until the watch is live, on
  `main` (#16). A tag is never moved, so the first release is 0.2.1 (GR-D18's note): its changelog entry says what
  happened to 0.2.0 (#17), and `v0.2.0` stays, never released.
- `v0.2.1`'s build first hit Bun's 5 s timeout on the Intel Mac (render's width test): a preload's
  `setDefaultTimeout` reaches the first test file alone, so the 30 s bound set there (#10) never reached most files.
  The bound is now `bun test --timeout 30000`, the `test` script the check and CI run, with a test that says so (#19).
  The Intel Mac job, run again, passed; the release run (38300638757) green on every platform.
- The draft checked: the six packs, their SBOMs, `SHA256SUMS`, `install.sh`, `slipbox.rb`; the sums verified, every
  asset's attestation verified (`gh attestation verify`), a pack's binary run (`slipbox 0.2.1`), the notes the
  changelog's entry. Published 2026-10-12T21:23Z by the coordinator, at the user's word. Pages deployed by the
  release: its `stable` channel names `v0.2.1` (*ran*: `curl …/slipbox/stable`). Homebrew's job skipped: no tap yet,
  so no `HOMEBREW_TAP` variable or token (GR-D18).
- Installed by the one line (`curl -fsSL https://remziduzagac.github.io/slipbox/install.sh | sh`) in a throwaway
  home: `slipbox --version` said `slipbox 0.2.1`, `slipbox channel` stable, `slipbox upgrade --check` the latest. The
  design's "can't have run yet" goes at consolidation (design/distribution.md § Releases).
- Then `main` to 0.3.0 (#18), so previews go on.
