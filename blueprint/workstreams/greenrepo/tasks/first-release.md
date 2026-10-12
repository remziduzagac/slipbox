---
status: todo
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
