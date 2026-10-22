# Requirements

## Goals

- slipbox's repository meets greenrepo for its scope: the core, and the rules of Shared, Users, Artifacts, UI and
  Large; the profiles TypeScript (on Bun), Bash, Markdown and Command-line distribution (GR-D1). What it can't meet
  is listed as an accepted deviation, with its reason and a date to look again.
- slipbox is public on GitHub under the Apache-2.0 licence, with its blueprint and its history (GR-D2, GR-D3, GR-D4).
- Nothing reaches GitHub before the history has been searched for secrets and private text, and the user has seen
  what was found (GR-D4).
- Every change reaches `main` through a pull request that passes CI, merged by the user (GR-D6).
- The first release is made by CI from a tag, as a draft the user publishes, and can be installed and verified as the
  docs say.

## Non-goals

- A docs site: after the first release (GR-D8).
- Contributions from outside: issues are open, pull requests limited to collaborators; no contributing guide, code of
  conduct or AI policy until that changes (GR-D5).
- The skill as an npx package for common harnesses: its own workstream (ideas.md § Agent surface). GR ships the skill
  in the binary, nothing per harness (GR-D10).
- Native Windows (`14.14`–`14.17`), signing and notarizing (D198).

## Builds on

- greenrepo (draft 2) and its profiles (draft 1), the user's standard; the comparison of slipbox against it (notes.md).
- design/distribution.md: the release flow, the supply chain's gates and the installer, which already meet much of it.
- requirements.md § Documentation and `tests/docs.test.ts`, which the repository's new documents keep to.

## Acceptance criteria

- Each greenrepo rule in scope passes, or is listed in the accepted deviations with its reason and review date; the
  audit, rule by rule, is in notes.md.
- `bun run check` runs everything CI runs: the typecheck, the boundary, the supply chain's gates, Biome, the Markdown
  lint, spelling and offline links, zizmor and actionlint, and the tests.
- CI passes on Linux and macOS before the first release, and its required check is the one aggregator job.
- Every setting applied on GitHub was shown to the user first, and matches the committed expected settings.
- A release drafted by CI from a tag holds the packs, `SHA256SUMS`, the installer, the formula, the SBOM, the licence,
  and notes from the changelog; its attestations verify.
- Each code change with a regression or behaviour test (mutation-checked where it fixes a bug); the docs changed with
  each user-visible change, without IDs; `tests/docs.test.ts` passes.

## Changes

### MODIFIED requirements.md § Constraints, Licences

**slipbox's own:** Apache-2.0 (`14.6`, GR-D3): a `LICENSE` file, `package.json`'s `license`, and the packs and the
formula carry it.

Previously: "to be open source; the licence is parked (`14.6`, D193). Until it is chosen there is no `LICENSE` file,
and `package.json` says MIT."

### ADDED requirements.md § The repository

A section after § Documentation, written by GR-T13: slipbox's repository is public on GitHub and meets greenrepo for
its scope (GR-D1, GR-D2); changes land through pull requests that pass CI, merged by the user (GR-D6); CI is hardened
and runs on Linux and macOS (GR-D9); releases are made by CI and verifiable; the repository is kept by a weekly health
check, with its expected settings, renewals and accepted deviations committed. How: design/repository.md.

### MODIFIED requirements.md § Distribution

Adds: each release carries the skill: `slipbox skill` prints the one that matches the binary (GR-D10).

Previously: nothing on the skill; a release install had none.

### MODIFIED requirements.md § Documentation

Adds: the repository's own documents beside `docs/`: the changelog, the maintaining procedures, the security policy,
accessibility and architecture, written for their readers and kept with the code like the rest (GR-T7).

Previously: `docs/` and the README only.

### MODIFIED requirements.md § Constraints, Platforms

Adds: the test suite runs on macOS in CI on every change; `14.13`'s checks of Apple's SQLite and the binaries'
signatures run there (GR-T9). The text as the task leaves it.

Previously: "before the first release, a real Mac checks the binaries' signatures and Apple's SQLite (`14.13`, D196,
D198)."
