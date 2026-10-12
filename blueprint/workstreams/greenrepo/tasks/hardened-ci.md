---
status: done
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

## Design text

Each piece names the root section it lands in when GR is consolidated.

### MODIFIED design/distribution.md § The supply chain

The last bullet becomes two:

- **An action not pinned** by its commit's full hash in `.github/workflows/`: a tag can be moved. A pinned action's
  version, too, is a week old before it's taken: checked when it's pinned, and kept so by Dependabot's cooldown.
- **A workflow's shape** (GR-D9): one that doesn't start from no permission — `permissions: {}` at the top, each
  job granting its own, with a comment saying why — or has a job without `timeout-minutes`.

Previously: "**An action not pinned** by its commit's full hash in `.github/workflows/`: a tag can be moved. A pinned
action's version, too, is a week old before it's taken. CI runs with `contents: read` and checks out without keeping
credentials."

Added after the bullets:

Beside the gates, `bun run check:actions` (in `bun run check`) runs zizmor and actionlint over `.github/`: the
workflows and Dependabot's config. zizmor's online audits — a commit that isn't the action's, a version comment its
hash doesn't match, an action with a known vulnerability — run where a token is set (`GH_TOKEN`: in CI the job's own),
and are left out without one. A finding is fixed, or ignored inline with its reason where it's understood and
accepted: the tap's checkout keeps its token to push (§ Homebrew). Every other checkout drops its credentials, and
values reach the shell through `env`, never inline.

The workflows take the toolchain from `mise.toml` (GR-D11) through `jdx/mise-action`, so each version is written
once; mise itself is its newest release a week old, checked against mise's signed sums. Nothing is cached in any
workflow, so no run restores what a pull request's run saved. Dependabot and the scanner keep the dependencies
current and watched: repository.md § Dependencies.

### MODIFIED design/distribution.md § Releases

In the first paragraph, after GR-T1's sentence on the packs, "`finish` writes `SHA256SUMS` over the packs, refusing
another version's beside them, and the installer." becomes:

Beside each pack, `build` writes its SBOM, `slipbox-<version>-<target>.cdx.json` (CycloneDX 1.6, JSON), from the
same walk as its notices (`check-deps.ts`' `sbom`): slipbox; each package bundled, with its licence, its source and
the packages it depends on; the code compiled into packages (Hunspell, libwebp); and Bun, the runtime. There's one
per pack because the walk differs by platform: a platform's OpenTUI package is installed only there. `finish` writes
`SHA256SUMS` over the packs, refusing another version's packs or SBOMs beside them, and the installer.

Added after the paragraph on the version and the repository:

**The notes** are the version's section of `CHANGELOG.md` (Keep a Changelog: `## [<version>] - <date>`), without
its heading, up to the next version's heading or the link definitions at the end: `release.ts notes` prints them. A
version with no section, or an empty one, fails.

The paragraph beginning "CI (`.github/workflows/release.yml`) does it on a tag" becomes:

CI (`.github/workflows/release.yml`) does it on a tag `v<version>`, starting from no permission, each job granting
its own; it restores no cache and is never cancelled. Each platform is built on a runner of its own, with Bun alone
installed (`mise.toml`'s): the changelog's section for the version is checked before anything is built, then the
tests run there, once per runner kind — CI ran the whole check on the commit, and `build` runs the supply chain's
gates itself. That platform's OpenTUI package is installed only there, and a Mac's binary is built on a Mac
(§ Signing), its signature checked (`codesign --verify`). A musl build is run in Alpine (a container pinned by
digest): its version, an index and a search, and the TUI started in a terminal and still running five seconds later.
Then each pack's SBOM is attested to it, in a job per pack that runs no dependency's code — the build's tests run
every dependency's, so the signing token stays out of the build (`gh attestation verify <pack> --repo <owner/name>
--predicate-type https://cyclonedx.org/bom`). Last, `finish` sums the packs and writes the installer and the
formula; every asset — the packs, their SBOMs, `SHA256SUMS`, `install.sh`, `slipbox.rb` — is attested (who built
it, from which commit, by which workflow: `gh attestation verify <file> --repo <owner/name>`), and the release is
drafted with its notes. Nothing is published until a person publishes the draft.

Previously: "CI (`.github/workflows/release.yml`) does it on a tag `v<version>`: each platform built on a runner of
its own, after the whole check passes there — that platform's OpenTUI package is installed only there, and a Mac's
binary is built on a Mac (§ Signing). A musl build is run in Alpine (a container pinned by digest): its version, an
index and a search, and the TUI started in a terminal and still running five seconds later. Then the packs are summed,
attested (who built each, from which commit: `gh attestation verify <pack> --repo <owner/name>`), and the release
drafted. Nothing is published until a person publishes the draft." Its last sentence, "The workflow can't have run
yet: the repository has no remote.", stays until GR-T14.

### MODIFIED design/distribution.md § Homebrew

"It runs only when the repository's `HOMEBREW_TAP` variable names the tap, with a token in the `HOMEBREW_TAP_TOKEN`
secret that may write only there." becomes:

It runs only when the repository's `HOMEBREW_TAP` variable names the tap — a repository variable, since a job's
`if:` is decided before it enters an environment — with a token that may write only there: `HOMEBREW_TAP_TOKEN`, a
secret of the `release` environment, which only a `v*` tag's run enters (GR-D9). The job reads the release's formula
with its own token (`contents: read`); the tap's checkout keeps its token to push, zizmor's one finding accepted
(`artipacked`, ignored inline with its reason).

### ADDED design/repository.md, the check's parts

`check:actions`: `zizmor .github && actionlint`. zizmor runs offline unless `GH_TOKEN` is set; CI's lint job sets
it to the job's token. actionlint runs ShellCheck on each `run:` script where ShellCheck is installed (CI's Ubuntu
runner has it).

### ADDED design/repository.md § CI

`.github/workflows/ci.yml` runs on every pull request, every push to `main`, a merge queue's group (listed for later:
a merge queue needs an organisation's repository) and by hand. Its jobs are `bun run check`'s parts, each step a
package.json script, never a command of its own:

- **`lint`**, on `ubuntu-24.04`: Biome (`bun run lint`) and the workflows (`bun run check:actions`, zizmor online
  with the job's token).
- **`test`**, on `ubuntu-24.04` and `macos-15` (arm64), neither stopping the other: the typecheck, the boundary, the
  supply chain's gates (this platform's OpenTUI package's licence among them) and the tests. On macOS the SQLite is
  Apple's, so the index's FTS5 (`unicode61`, `remove_diacritics 2`) and its `bm25` ranking are tested there on every
  change (`tests/core.test.ts`, `tests/vault.test.ts`, `tests/cli.test.ts`; `14.13`).
- **`ci`**, the aggregator and the one required check: it always runs, waits for every other job, and fails unless
  each passed or was skipped. A job skipped by its `if:` counts as passed; one that failed, was cancelled or never
  started doesn't. A test holds it to waiting for every job, so a job added can't be left out of the required check.

No permission by default (`permissions: {}`): each job grants its own with a comment saying why — `contents: read` to
check out, the aggregator nothing. Every job has a timeout. A pull request's superseded run is cancelled; every other
run, a push to `main` among them, finishes (its concurrency group is the run's own). The toolchain comes from
`mise.toml` through `jdx/mise-action`, nothing cached: `lint` installs every tool, `test` Bun alone.
`scripts/check-deps.ts` holds every workflow to the pins, `permissions: {}` and the timeouts
(distribution.md § The supply chain).

### MODIFIED design/testing.md § Strategy

The opening's "CI runs all three (`.github/workflows/ci.yml`)." becomes "CI runs them all on Linux and macOS
(`.github/workflows/ci.yml`; repository.md § CI)."; the table's `tests/distribution.test.ts` row
reads "distribution (`14.x`): gates, notices, the SBOM; a release built, its notes, installed, upgraded, removed; the
scanner's list".

### MODIFIED requirements.md § Constraints, Platforms

The second bullet, as GR's requirements.md asks of this task:

- Releases are neither signed nor notarized (D198). The test suite runs on macOS (`macos-15`, arm64) in CI on every
  change, so Apple's SQLite is tested there — FTS5 with `unicode61`, and `bm25` — and the release checks each Mac
  binary's signature (`codesign --verify`) on its Mac runner (`14.13`, D196, GR-D9).

Previously: "Releases are neither signed nor notarized at first; before the first release, a real Mac checks the
binaries' signatures and Apple's SQLite (`14.13`, D196, D198)." `14.13` is done once CI's first run on `macos-15`
passes (after GR-T13 publishes the repository).

## Log

- 2026-10-12: `ci.yml` rewritten: `lint`, `test` (Ubuntu 24.04 and macOS 15, `fail-fast: false`) and the aggregator
  `ci`; triggers, `permissions: {}`, per-job grants with comments, timeouts, concurrency cancelling only a pull
  request's superseded runs. `jdx/mise-action` replaces `oven-sh/setup-bun` everywhere: v5.1.1, published
  2026-10-04 (eight days old), pinned by `2d8d4ca…`, the commit its tag names, reachable from `main` (`gh api`
  `compare`: 13 ahead, 0 behind); `cache: false`, `minimum_release_age: 7d`; Bun alone (`install_args: bun`) where
  nothing else is needed.
- `release.yml`: `permissions: {}`, per-job grants, timeouts, no concurrency group, no cache; the build runs the
  notes check and the tests (not the whole check: the lint's tools aren't installed in a release job); the pack's
  SBOM uploaded with it; an `sbom` job per pack attests it with `actions/attest` (v4.2.2, 2026-08-04, `1e69f48…`,
  reachable from `main`), which does provenance and SBOMs both, so it replaces `attest-build-provenance` (now a
  wrapper around it); the draft takes its notes from `release.ts notes`. `homebrew.yml`: `permissions: {}`, the job
  in the `release` environment, a timeout, the tap checkout's `artipacked` ignored inline with its reason.
- `scripts/release.ts`: `releaseNotes`, `changelogNotes`, `sbomName`, the `notes` command; `build` writes each pack's
  SBOM; `finish` refuses another version's SBOMs. `scripts/check-deps.ts`: the walk records each package's
  dependencies and slipbox's direct ones; `purl`, `sbom` (CycloneDX 1.6) and `--sbom <file>`;
  `workflowShapeProblems` (`permissions: {}`, timeouts), run by `checkDeps`. `package.json`: `check:actions`, in
  `check`. AGENTS.md's commands, the README's licence section and the install guide ("Checking a download") say so.
- Checked: zizmor 1.30.1 clean offline and online (`GH_TOKEN=$(gh auth token)`; the regular persona). The pedantic
  persona adds only jobs without a `name:` and no concurrency group on `release.yml` (never cancelled, on purpose)
  and `homebrew.yml`. actionlint 1.7.12 clean, also with ShellCheck 0.9.0 (the Ubuntu runner's) and 0.11.0 given
  to it, which do run (a planted `echo $FOO` is caught). A generated SBOM validates against CycloneDX's 1.6 JSON schema
  (`check-jsonschema`, the schema's own `spdx.schema.json` resolved: a bad licence id is rejected).
  `tests/distribution.test.ts` passes (53 tests, the release built for this machine included), and
  `tests/docs.test.ts`; `bun run typecheck`, `check:deps`, `check:boundary` and Biome on the changed files pass.
  Eighteen mutations of the new code each fail a test: the notes' boundaries, the stray SBOMs, the walk's edges, the
  SBOM's licences, purls and compiled-in parts, the SBOM's being written, the shape gate, a target left out of the
  `sbom` job, the draft not waiting for it, a job left out of the aggregator's `needs`.
- Not run here: the whole suite and `bun run check` (the coordinator's, after merging), and anything on GitHub. The
  macOS suite runs for the first time in CI.
