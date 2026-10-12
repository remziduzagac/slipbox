---
status: done
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

## Design text

Each piece names the root section it lands in when GR is consolidated.

### MODIFIED design/distribution.md § Releases

"The version is package.json's, which must be `src/version.ts`'s, and the tag's." becomes:

The version is package.json's, which must be `src/version.ts`'s, and the tag's: `v<version>`, or a preview's
`preview-<time>-<hash>` for the version stamped into its checkout (§ Previews). slipbox's Package URL in the SBOM
names that tag.

GR-T9's paragraph beginning "CI (`.github/workflows/release.yml`) does it on a tag" becomes:

CI does it on a tag `v<version>`. `.github/workflows/release.yml` checks first that the tag is the version's and that
the changelog has its section, then calls `.github/workflows/build.yml`, the build it shares with previews
(§ Previews), and drafts the release from what that made. Each starts from no permission, each job granting its own;
the job calling `build.yml` grants the most its jobs may take, and none of them can write to the repository. Nothing
restores a cache, and a release run is never cancelled. In `build.yml`, each platform is built on a runner of its
own, with Bun alone installed (`mise.toml`'s): the tests run there, once per runner kind, on the code as committed —
CI ran the whole check on the commit, and `build` runs the supply chain's gates itself — then the version is stamped
(a release's is package.json's already: nothing changes) and the platform built. That platform's OpenTUI package is
installed only there, and a Mac's binary is built on a Mac (§ Signing), its signature checked (`codesign --verify`).
A musl build is run in Alpine (a container pinned by digest): its version, an index and a search, and the TUI started
in a terminal and still running five seconds later. Then each pack's SBOM is attested to it, in a job per pack that
runs no dependency's code — the build's tests run every dependency's, so the signing token stays out of the build
(`gh attestation verify <pack> --repo <owner/name> --predicate-type https://cyclonedx.org/bom`). Last, `finish` sums
the packs and writes the installer and the formula; every asset — the packs, their SBOMs, `SHA256SUMS`, `install.sh`,
`slipbox.rb` — is attested (who built it, from which commit, by which workflow: `gh attestation verify <file> --repo
<owner/name>`), and the set is handed back as the run's `release` artifact. `release.yml`'s last job, the only one
that may write (`contents: write`), runs nothing built: it drafts the release with that set and its notes. Nothing is
published until a person publishes the draft; publishing runs `homebrew.yml` (§ Homebrew) and `pages.yml`
(§ Previews).

Previously: GR-T9's text for that paragraph (tasks/hardened-ci.md), in which `release.yml` built, attested and drafted
in its own jobs.

### MODIFIED design/distribution.md § Installing

"`SLIPBOX_RELEASES_URL` fetches the packs from elsewhere laid out as GitHub's releases are
(`<base>/download/v<version>/<pack>`)" becomes "… (`<base>/download/<tag>/<pack>`, the tag written into the installer
with the version: `v<version>`, or a preview's)". The rest of the section is GR-T16's.

### MODIFIED design/distribution.md § Homebrew

"— never a draft, whose downloads aren't public yet, nor a prerelease." becomes "— never a draft, whose downloads
aren't public yet, nor a pre-release, so never a preview: `finish` writes a preview no formula (§ Previews)."

### ADDED design/distribution.md § Previews

A preview is `main` built and published before it's released, for trying it as users get it (GR-D13). Pushing the
`test` branch makes one (`git push origin main:test`): `.github/workflows/preview.yml`, on a push to `test` and nothing
else, never a fork's.

**Its version** is the release to come's, package.json's `x.y.z`, with its commit's UTC committer time to the minute
and its hash after it: `0.3.0-preview.202610121530.g1a2b3c4`, a pre-release of 0.3.0, so it sorts after the previews
before it and before 0.3.0. Its tag is `preview-202610121530-1a2b3c4` (`release.ts`' `previewOf`, `tagOf`). A preview
of a version already released would sort before it: `release.ts preview` refuses one when `v<x.y.z>` is a tag on the
remote (`git ls-remote`), and when the preview's own tag is there already, before anything is built. The version is
stamped into each of CI's checkouts (`release.ts stamp`: package.json's `version` and `src/version.ts`'s `VERSION`
rewritten, refused unless it's a preview of package.json's version and of the commit checked out), never committed, so
the binary, its pack, its notices and its SBOM all say it.

**Built as a release is,** by `build.yml` (§ Releases): every platform after the tests, each pack's SBOM, `SHA256SUMS`
and `install.sh` — the installer with the preview's version, tag and sums written in — all attested. `finish` writes
it no Homebrew formula.

**Published** as the GitHub pre-release `preview-<time>-<hash>`, titled with its version, at the commit pushed: drafted
with every asset, then published, since an immutable release takes no asset once published; a step failing deletes the
draft it left. Its notes (`release.ts notes` for a preview's tag) say what it is, how to install it
(`curl -fsSL <pages>/install.sh | sh -s -- --preview`), and what the changelog's Unreleased section has so far. A
release published by CI's own token starts no workflow, so `homebrew.yml` never runs for one, and `pages.yml` is called
by `preview.yml` itself. Previews run one at a time, never cancelled half-made.

**The newest ten are kept.** An immutable release can be deleted, and then its tag, which can never be used again; a
preview's tag is its commit's, never wanted twice. `release.ts stale` lists the published previews beyond the newest
ten — by the time in their tags, then by when published — and `preview.yml` deletes each with its tag.

**The Pages site** (GR-D14), `https://<owner>.github.io/<name>/`, is what the one-line install reads:
`.github/workflows/pages.yml` writes `install.sh`, the bootstrap (§ Installing, `scripts/bootstrap.ts`), and the
channels it reads, `stable` and `preview`, each one line, `<tag> <SHA-256 of that release's install.sh>`: `stable` the
published release tagged `v<x.y.z>` of the highest version (the newest, unless an older line's fix is published after
it), `preview` the newest published preview; a draft is neither, and a channel with no release has no file
(`release.ts site`: the releases from `gh api`, each installer downloaded and hashed, refused when GitHub's own digest
of the asset differs). An `index.html` sends a visitor to the repository. It's deployed when a release is published (a
person publishes it), by `preview.yml` once a preview is, when the bootstrap or the workflow changes on `main`, and by
hand; the site is always made from `main`'s scripts, whichever ref started the run, and from the releases as they are
then, one deployment at a time, never cancelled, so an older run never deploys over a newer one. Its build job only
reads; the Pages grants (`pages: write`, `id-token: write`) are its deploy job's alone, in the `github-pages`
environment, which takes deployments from `main`, `test` and `v*` tags only.

### ADDED design/repository.md § CI, the release workflows

After GR-T9's list of `ci.yml`'s jobs:

The release workflows keep the same rules. `build.yml` is reusable (`workflow_call`, its inputs the tag and the
version): `release.yml` (a `v*` tag) and `preview.yml` (a push to `test`) call it, and `preview.yml` calls `pages.yml`,
which is reusable too. A calling job grants the most the called workflow's jobs may take, since GitHub caps them by it
(a test holds each call to granting at least what its jobs ask). A same-repository call is
`./.github/workflows/<file>`: zizmor's `self-repository` audit asks for GitHub's newer `$/` form, which means the same,
but actionlint 1.7.12 doesn't read it yet (rhysd/actionlint#711), and checks a call's inputs and permissions against
the workflow called only in the `./` form, which for a reusable workflow is read from the run's own commit, never the
workspace; the finding is ignored inline, with that reason. `preview.yml` and `pages.yml` each run one at a time
(`preview`, `pages`), never cancelled; `pages.yml`'s Pages grants are its `deploy` job's alone.

### MODIFIED design/repository.md, the upkeep files

GR-T11's `settings.json` bullet: the groups the health workflow's token reads gain Pages (`repos/{repo}/pages`: built
by a workflow, at `https://remziduzagac.github.io/slipbox/`, HTTPS enforced) and the `github-pages` environment, its
deployments from `main`, `test` and `v*` tags only (GR-D14); the `collect` job's grants gain `pages: read`.

The rulesets bullet: `rulesets/test.json` joins them: `test`, the branch previews are made from, never deleted or
forced back, no one bypassing (GR-D13).

## Log

- 2026-10-12: `release.yml`'s build, SBOM and finishing jobs moved into `build.yml`, reusable (`workflow_call`,
  inputs `tag` and `version`), whose `finish` job now hands the assets back as the `release` artifact; it attests
  with `contents: read`, so writing and signing are no longer one job's. `release.yml`: `plan` (the tag against the
  version, the changelog's section), `build` (the call) and `publish` (`contents: write` alone: the draft).
  `preview.yml`: `plan`, `build`, `publish` (draft with every asset, then `--draft=false --prerelease`; the draft
  deleted if a step fails), `prune` (a job of its own, so a failed prune doesn't hold Pages back) and `pages` (the
  call). `pages.yml`: `site` and `deploy`. The hardening kept: `permissions: {}` and commented grants, timeouts, no
  cache, pinned actions, mise as before; `GH_TOKEN` given only to the steps that use it.
- Actions added: `actions/upload-pages-artifact` v5.0.0 (published 2026-04-10, `fc324d3…`) and `actions/deploy-pages`
  v5.0.1 (2026-09-01, `368f825…`), each tag naming that commit (`gh api …/git/ref/tags/…`); the composite one pins
  its own `upload-artifact` by commit.
- Pruning is allowed with immutable releases (read, GitHub's docs, "Immutable releases"): "If you delete the immutable
  release, you can delete the tag, but you cannot reuse the same tag name"; a preview's tag is never wanted twice.
- `scripts/release.ts`: `PREVIEW_TAG`, `PREVIEW_VERSION`, `tagOf`, `utcMinute`, `previewOf`, `previewPlan` (`git show
  %ct`, `git ls-remote --tags`), `stampVersion`; `releaseVersion` takes a preview's tag; `pagesUrl`, `previewNotes`,
  `changelogNotes` for a preview's tag; `installScript` writes `TAG`; `finishRelease` writes a preview no formula and
  `homebrewFormula` refuses one; the channels: `previews`, `channelReleases`, `channelFiles`, `writeSite`,
  `stalePreviews`; the commands `preview`, `stamp`, `site`, `stale`. `scripts/check-deps.ts`: the SBOM's purl names
  the tag. `scripts/install.template.sh`: `TAG`, the packs fetched from `<base>/download/$TAG/`. The settings:
  `settings.json`'s Pages, `github-pages` and its policies; `rulesets/test.json`; `health.yml`'s `pages: read`.
  `MAINTAINING.md`: § Previews, the release section, settings, access, who does what.
- Choices of mine: the `stable` channel is the highest `v<x.y.z>` rather than the one published last (the same but
  for a fix to an older line published later); `index.html` on the site, so its root isn't a 404; the site always
  from `main`'s scripts, whichever ref started the run; zizmor's self-repository finding ignored inline, as
  `rhysd/actionlint#711` is open. GitHub's policies never restrict `./` references, the SHA-pinning one included
  (summary, GitHub's changelog of 2026-07-30 and its search results).
- Checked: zizmor 1.30.1 clean offline and online (`GH_TOKEN` from `gh auth token`); its pedantic persona adds only
  unnamed jobs and `release.yml`'s concurrency, as before. actionlint 1.7.12 clean, ShellCheck 0.11.0 on the path.
  `check:deps`, `check:docs`, `typecheck`, Biome on the files changed. `tests/release.test.ts` (26),
  `tests/health.test.ts` and `tests/distribution.test.ts` (52, the build for this machine included) pass. 42 mutants
  of the new code and workflows each fail a test, two of them once the tests were strengthened (the author's time read
  for the committer's; the build's tests step removed).
- Not run: anything on GitHub. `pages.yml` runs `bun --no-install scripts/bootstrap.ts <repo> _site/install.sh`,
  GR-T16's, not in this branch. The settings wait for the maintainer: Pages' source set to GitHub Actions, the
  `github-pages` environment's refs, the `test` branch and its ruleset.
