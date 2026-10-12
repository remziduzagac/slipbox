---
status: todo
assignee: claude-cli
blocked_by: [GR-T3, GR-T4]
created: "2026-10-12"
---

# GR-T9: Hardened CI and the release workflow

CI to greenrepo's rules, on Linux and macOS (GR-D9).

## Description

- `ci.yml`: on pull requests, pushes to `main`, `merge_group` and by hand; `permissions: {}`, each job's grants with
  a comment; timeouts; superseded pull request runs cancelled; tools from `mise.toml` (`jdx/mise-action`, no cache);
  a lint job, the check on `ubuntu-24.04` and `macos-15`, and one always-running aggregator job, `ci`, that fails if
  any job ended other than success or skipped.
- zizmor and actionlint in `bun run check`; `scripts/check-deps.ts` still checks every action's pin.
- `release.yml`: `permissions: {}`, timeouts, the toolchain from `mise.toml`, an SBOM (SPDX or CycloneDX, from
  `check-deps`' walk) attested with the packs, the notes from the changelog's section for the version, never a
  cache; `homebrew.yml`'s job in the `release` environment.
- `14.13`: the suite on macOS covers Apple's SQLite (FTS5, `bm25`); the release checks the signatures.

## Acceptance criteria

- zizmor (offline and, with a token, online) and actionlint clean; a test that the notes and the SBOM are made;
  `bun run check` passes.
