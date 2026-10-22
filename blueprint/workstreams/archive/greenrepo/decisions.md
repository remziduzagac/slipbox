# Decisions: a green repository

## GR-D1: slipbox follows greenrepo, scope Shared, Users, Artifacts, UI, Large (2026-10-12)

**Decision:** The repository meets greenrepo (draft 2, 2026-10-10) for the scope
`Shared, Users, Artifacts, UI, Large; TypeScript (Bun), Bash, Markdown, Command-line distribution`, recorded in
AGENTS.md's skills block. Not Contrib (GR-D5), not Registry (nothing goes to a registry until the npx package), not
Deployed, Store or Fork.

**Why:** The user's standard for every repository meant to last. slipbox is to be public (Shared) and released for
people to run (Users), ships binaries (Artifacts), has a terminal interface (UI), and its source is past 50,000 lines
(Large).

**Note:** greenrepo's TypeScript profile assumes Node, pnpm and Vitest; slipbox is Bun throughout, so the profile's
rows are met by Bun's equivalents (notes.md § Where greenrepo doesn't fit), reported back to the user as feedback on
the draft.

## GR-D2: A public repository on GitHub (2026-10-12)

**Decision:** slipbox is published as a public repository on GitHub, under the user's account.

**Why:** The release flow already assumes it: the installer and Homebrew download release assets without logging in.
Attestations, code scanning, secret scanning and private vulnerability reporting are free only on public
repositories, and rulesets on a personal account's private one need a paid plan.

**Not chosen:** private first, made public at the first release.

## GR-D3: slipbox's licence is Apache-2.0 (14.6, 2026-10-12)

**Decision:** slipbox is licensed under Apache-2.0: a `LICENSE` file with its text, `package.json`'s `license`, the
packs and the Homebrew formula carrying it. Closes `14.6`, parked by D193.

**Why:** The user's choice. Apache-2.0 grants contributors' patent licence explicitly; it is compatible with the weak
copyleft dependencies accepted for use (D192, D194).

**Not chosen:** MIT, which `package.json` said while the choice was parked; dual "MIT OR Apache-2.0" (ideas.md
§ Licence).

## GR-D4: The blueprint is published with the code, history included (2026-10-12)

**Decision:** The repository goes public as it is, the blueprint and all its history with it. Before the first push,
the history is searched for secrets and private text, and the user sees what was found; nothing is rewritten without
the user.

**Why:** The blueprint is the project's method, written to be public (README: "This blueprint is public"); greenrepo
lets documents link a public blueprint for depth. A secret once pushed to a public repository has to be treated as
leaked, whatever is rewritten after.

**Not chosen:** moving the blueprint out, or publishing a squashed history.

## GR-D5: Issues open, pull requests from collaborators only (2026-10-12)

> **Partly superseded by D234 (2026-10-14):** the contributing guide, the code of conduct and the pull request template
> are there while pull requests still come from collaborators only.

**Decision:** Anyone may open an issue; pull requests are limited to collaborators, with GitHub's pull request
controls. Until that changes, Contrib is false: no contributing guide, code of conduct, pull request template or AI
policy.

**Why:** On recommendation. A solo maintainer gets reports without reviewing outside code, and the documents Contrib
asks for wait until someone asks to contribute.

**Not chosen:** open pull requests with Contrib's documents from the start.

## GR-D6: Every change through a pull request the user merges (2026-10-12)

**Decision:** Once the repository exists, work lands on `main` only through a pull request that passes the required
check, merged by the user with a squash. Its title is a Conventional Commit (`fix(export): …`), the subject of the
squashed commit; the workstream or task IDs go in its body. Agents work on branches and open pull requests; they never
commit to `main`, merge, release or change settings.

**Why:** On recommendation. greenrepo's agents propose, the person approves (AGT-03), and the rulesets require it
(SET-04). Squashing gives `main` one commit per change, titled for the changelog.

**Not chosen:** commits straight to `main`, with the admin's bypass recorded as a deviation.

## GR-D7: Biome formats and lints the code, at 120 columns (2026-10-12)

**Decision:** Biome 2, pinned, formats and lints TypeScript and JSON at 120 columns, two spaces; `bun run check` runs
it, and warnings fail. The code is reformatted once, in one commit listed in `.git-blame-ignore-revs`.

**Why:** On recommendation: greenrepo's QA-03 and the TypeScript profile's default; one tool for both.

**Not chosen:** ESLint with Prettier; a linter only.

## GR-D8: A docs site after the first release (2026-10-12)

**Decision:** The user docs stay Markdown in `docs/`, read on GitHub, until after the first release. DOC-06 is an
accepted deviation until then, with a review date.

**Why:** On recommendation: GitHub renders `docs/` well, and a site is a generator and its upkeep to add.

> **Superseded by DS-D1 (2026-10-14):** the docs are also a website on GitHub Pages, built and deployed by Actions;
> DOC-06's deviation is gone from `.github/upkeep/deviations.toml`.

## GR-D9: Hardened CI, on Linux and macOS (2026-10-12)

> **Amended by D239 (2026-10-17):** a pull request runs the tests and the terminal checks its files reach; every
> push to `main` runs them all, on Linux and macOS.

**Decision:** CI meets greenrepo's CI rules: no permission by default and each job's grants explained, actions pinned
by commit, no credentials kept, timeouts, concurrency, the untrusted kept out of `run:`, zizmor and actionlint, one
aggregator job as the required check, and the tests on Linux and macOS. Dependabot, a scheduled scanner and a weekly
health check go with it.

**Why:** The user's answer ("hardened ci"). slipbox ships macOS binaries, so it is tested there; a macOS runner also
answers `14.13`'s questions on every change.

## GR-D10: The skill ships in the binary (2026-10-12)

**Decision:** The skill (`skills/slipbox/SKILL.md`) is built into the binary: `slipbox skill` prints it, and
`slipbox skill --install <dir>` writes it to `<dir>/slipbox/SKILL.md`, so an agent's skill matches the slipbox it
drives. A release install gets the skill this way; from source, `scripts/install-local.sh --skill` still links it.

**Why:** On recommendation. greenrepo's AGT-06: a product skill ships with each release. It also gives a release
install the skill, which today only a source checkout has.

**Not chosen:** a separate download beside the packs. Per-harness defaults wait for the npx workstream.

## GR-D11: The toolchain pinned in mise.toml (2026-10-12)

**Decision:** `mise.toml` pins Bun and the check's tools (zizmor, actionlint, typos, lychee, gitleaks); mise reads it
locally, and `jdx/mise-action` in CI, so each version is written once. `package.json`'s `engines` stays the floor for
running from source.

**Why:** On recommendation, within GR-D9: greenrepo's QA-01, one committed file read by local tools and CI alike. The
CI's three `bun-version: 1.4.2` were three copies.

**Not chosen:** a `.bun-version` read by setup-bun, with the other tools pinned in workflows: two places again.

## GR-D12: The early commits' address rewritten to the noreply one (2026-10-12)

**Decision:** Before the first push, the 222 commits of 2026-09-25 to 2026-10-01 that carry the maintainer's personal
email address get their GitHub noreply address instead, as author and committer, with git filter-repo. Every hash
changes; the hashes the repository's files cite (`synced_with`, decisions, notes, `.git-blame-ignore-revs`) are
remapped from its commit map. Nothing else in the history changes.

**Why:** The user's answer to the history scan (GR-T2): a pushed address is public in every commit, and the later
commits already use the noreply one. The secret scan found nothing to remove.

**Not chosen:** publishing the history as it is.

## GR-D13: Previews from a `test` branch, as herdsman's (2026-10-12)

> **Amended by D251 (2026-10-17):** `test` is fast-forwarded from `dev`, the default branch, not `main`; `main` is
> what's released, fast-forwarded from `test` once its commit passed `full`.

**Decision:** Fast-forwarding `test` from `main` publishes a preview: every platform built as a release is, its
version `<package.json's>-preview.<UTC commit time>.g<short hash>` (`0.2.0-preview.202610121530.g1a2b3c4`), published
as the GitHub pre-release `preview-<time>-<hash>` with its packs, sums, SBOMs, installer and attestations. `test` is a
long-lived branch with a ruleset (no deletion, no force push); stable releases stay `v*` tags.

**Why:** The user's answer: they run slipbox on their VMs and want what's coming before it's released, through the one
way slipbox is distributed, as herdsman does it. A preview sorts after the previews before it and before the release
of its version.

**Not chosen:** a preview on every merge to `main`.

**Note (2026-10-12):** a preview no longer runs the whole suite on each platform before it's built (`build.yml`'s
`suite: false`); its commit passed CI's check on Linux and macOS, which `test`'s ruleset requires, and each binary is
still run before it's packed. A release keeps the suite on every platform. The user's answer, once the first previews
took near half an hour each: "I agree we should not run full suite in previews".

## GR-D14: The installer at a fixed address on GitHub Pages (2026-10-12)

**Decision:** `curl -fsSL https://remziduzagac.github.io/slipbox/install.sh | sh` installs slipbox; `sh -s --
--preview`, the newest preview. The Pages `install.sh` is a bootstrap: it reads the channel's file from Pages (`stable`,
`preview`: a release's tag and the SHA-256 of its `install.sh`), downloads that release's own installer, checks its
sum and runs it. Pages is deployed by CI when a release is published, a preview made, or the bootstrap changed.

**Why:** The user's answer, as herdsman's: one line at an address that doesn't change, which works before any stable
release; the per-release installer, its packs' sums inside, stays the one that installs.

**Not chosen:** the release asset's address alone (`releases/latest/download/install.sh`), which needs a stable
release and can't install a preview.

## GR-D15: `slipbox channel`, kept with the install (2026-10-12)

**Decision:** `slipbox channel set preview|stable` sets which releases an install follows, kept in its data folder
beside `current`; `install.sh --preview` sets it for a new machine. `slipbox upgrade` and the daily check then take the
newest of the stable release and the newest preview. Homebrew installs, and slipbox run from source, have no channel:
the command says how they update instead. Previews never reach the Homebrew tap.

**Why:** The user's answer, as herdsman's `channel set preview`.

**Not chosen:** an `update.channel` setting in the user's config, which the installer can't set.

## GR-D16: The versioning promises kept as written (2026-10-12)

**Decision:** The versions chapter's promises stand: something deprecated keeps working, with a warning, for at least
one minor release; after 1.0 a new `--json` schema comes only in a major release; the names of the commands keys and
aliases call are kept as the public surface; a removed command or flag is a usage error naming what to use instead.

**Why:** The user's answer to the question GR-T7 raised: they are what scripts, agents and settings rely on.

## GR-D17: Discussions for questions and ideas (2026-10-12)

**Decision:** GitHub Discussions is on: questions and ideas go there, issues stay for bugs (the bug form, blank issues
off); the issue chooser and the README point to it.

**Why:** The user's answer: with blank issues off and only the bug form, there was nowhere to ask or suggest
(greenrepo COM-08).

**Not chosen:** an idea-or-question issue form; bug reports only.

## GR-D18: The first release, 0.2.0; Homebrew after it (2026-10-12)

**Decision:** slipbox 0.2.0 is released from `main` once the CodeQL fixes are in: the changelog's entry dated, the tag
`v0.2.0`, CI's draft published by the user. Homebrew follows once the tap and its token exist (the token is the
user's to create). After the tag, `package.json` moves to 0.3.0, so previews go on.

**Why:** The user's answer. The maintainer's time and a successor stay as `MAINTAINING.md` has them, neutral.

**Note (2026-10-12):** `v0.2.0`'s build failed on the Intel Mac, twice, on a watcher test that missed writes made the
instant the watch began (macOS's starts a moment late); the test was fixed on `main` (#16), and a tag is never
moved, so the first release is 0.2.1, as `MAINTAINING.md` has it for a release gone wrong. `v0.2.0` stays, never
released.
