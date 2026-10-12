---
status: todo
assignee: claude-cli
blocked_by: []
created: "2026-10-12"
---

# GR-T15: Previews, and the installer on Pages: the workflows

Previews published from `test`, and the Pages site that serves the installer and the channels (GR-D13, GR-D14).

## Description

- The release's build shared by `release.yml` and a new `preview.yml` (a reusable workflow), so a preview is built,
  checked, packed, summed, attested and given an SBOM exactly as a release is.
- `preview.yml`, on a push to `test`: the version stamped `<package.json's>-preview.<UTC commit time>.g<hash>` (never
  committed), refused when `v<package.json's version>` is already released; the pre-release `preview-<time>-<hash>`
  drafted, its assets uploaded, then published as a pre-release; older previews beyond the newest ten removed where
  GitHub allows it; then Pages deployed.
- `pages.yml` (reusable, and on a published release, a push to `main` changing the bootstrap, and by hand): the site
  of the bootstrap `install.sh` (`bun scripts/bootstrap.ts`, GR-T16's), and the channel files `stable` and `preview`,
  each one line, `<tag> <SHA-256 of that release's install.sh>`, absent when the channel has no release.
- The expected settings (`.github/upkeep/`): Pages built by workflow, its environment; `MAINTAINING.md`: making a
  preview (`git push origin main:test`), and the release flow with it.

## Acceptance criteria

- Tests of the version stamping, the refusal, and the channel files from fixture releases; zizmor and actionlint
  clean; every action pinned by its commit and a week old.
