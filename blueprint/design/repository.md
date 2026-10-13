# The repository

How slipbox's repository is kept, as greenrepo, the maintainer's standard for a repository meant to last, has it
(GR-D1): its scope is `Shared, Users, Artifacts, UI, Large; TypeScript (Bun), Bash, Markdown, Command-line
distribution`, recorded in `AGENTS.md`'s skills block. The repository is public on GitHub, `remziduzagac/slipbox`, its
blueprint and its history with it (GR-D2, GR-D4). This file says how its parts work: the documents, the one check, CI,
the dependencies' upkeep, the settings and the weekly health check. The maintainer's steps are `MAINTAINING.md`'s; what
a release is and how slipbox is installed, [distribution.md](distribution.md); the tests, [testing.md](testing.md).

## The repository's documents

Each document is written for its own readers, kept with the code, and free of the blueprint's IDs; the ones for
contributors, agents and the maintainer may name the blueprint's files by path.

| Document | For | What it holds |
| --- | --- | --- |
| `README.md` | visitors | what slipbox is, getting started first, status, help, how it's maintained |
| `docs/` | users | the guides and the manual, `docs/manual/versions.md` and `how-it-works.md` among them |
| `CHANGELOG.md` | users | Keep a Changelog 1.1.0: each release's entry, written at release time; the release's notes |
| `LICENSE` | everyone | Apache-2.0's text (GR-D3); each pack carries it |
| `SECURITY.md` | researchers | the latest release supported; private reporting; 14 days to answer, 90 to disclose |
| `ACCESSIBILITY.md` | users | the keyboard, the mouse, colour and glyphs, motion, screen readers' limits, the CLI |
| `ARCHITECTURE.md` | contributors | the layers and the boundary, where things live, the invariants, the check |
| `AGENTS.md` | agents | the rules, the commands, the upkeep pointers, the skills block; `CLAUDE.md` imports it |
| `MAINTAINING.md` | the maintainer, agents | governance, access continuity, merging, releasing, dependencies, upkeep |
| `.github/ISSUE_TEMPLATE/` | reporters | the bug form (all fields required but the output); blank issues off |

The issue chooser's links send questions and ideas to Discussions (GR-D17), the rest to the docs, and a vulnerability
to private reporting. Issues are for bugs; pull requests come from collaborators only, so the documents greenrepo asks
of a project open to contributions (a contributing guide, a code of conduct, a pull request template, an AI policy)
wait until that changes (GR-D5).

`MAINTAINING.md` holds the procedures greenrepo asks to be written (DOC-04, UPK-05, UPK-08, UPK-11, COM-13,
COM-14): the release steps ([distribution.md](distribution.md) § Releases), squash merging with Conventional Commit
titles, previews, Dependabot's monthly merges, the supply chain's gates and admitting a dependency, the pins
Dependabot doesn't see, the committed expected settings compared weekly and monthly and never applied by automation,
the health issue, who does what, the calendar, and the steps behind `SECURITY.md`.

## How a change lands

Every change reaches `main` through a pull request (GR-D6). `main`'s ruleset requires one, with no approval (there is
no second person to give it) and the `ci` check passed (§ CI); squash is the only merge method, the squashed commit
titled and described by the pull request, and the branch deleted once merged. The title is a Conventional Commit
(`fix(export): …`, `feat(cli)!: …` for a breaking change), so `main` has one commit per change, titled for the
changelog; the workstream's or task's IDs, the roadmap's steps and the decisions go in the body, and a commit made
with an agent ends with a `Co-Authored-By:` trailer naming it. The changelog itself is written at release time.

Agents work on branches and open pull requests; merging, releasing, tagging, moving `test` (§ CI) and changing the
settings are the maintainer's. No one bypasses `main`'s rules, the maintainer included.

## The check

`bun run check` runs everything CI runs, each part a `package.json` script, in order:

| Script | What it checks |
| --- | --- |
| `typecheck` | `tsc --noEmit`: strict types (`strict`, `noUncheckedIndexedAccess`) |
| `check:boundary` | the core never imports the TUI, nor the CLI the TUI ([how-it-works.md](how-it-works.md)) |
| `check:deps` | the supply chain's gates ([distribution.md](distribution.md) § The supply chain) |
| `lint` | Biome's format and lint, a warning failing: `biome ci --error-on-warnings` |
| `check:actions` | `zizmor .github && actionlint`: the workflows and Dependabot's config |
| `check:docs` | the Markdown's lint, spelling and the links between files (`scripts/check-docs.ts`) |
| `test` | `bun test --timeout 30000`: the headless tests ([testing.md](testing.md)) |

`bun run format` writes Biome's formatting. `bun run audit` (§ Dependencies) is apart: a new advisory is news about
the world, not about a change. `.editorconfig` sets what an editor writes: UTF-8, LF, a final newline, two spaces,
trailing whitespace trimmed but in Markdown, where two spaces are a line break.

**The toolchain** is pinned once (GR-D11). `mise.toml` pins Bun and the check's tools — zizmor, actionlint, typos,
lychee, gitleaks for the history's secrets, and ShellCheck, which actionlint runs over the workflows' scripts — each a
week old at least, as packages are; `mise.lock` holds their downloads' sums for the four platforms CI and releases
use. mise reads them locally (`mise install`, once; where mise isn't active in a shell, `mise x -- bun run check`), and
`jdx/mise-action` in CI. `package.json`'s `engines` stays the floor for running from source.

**Biome** formats and lints TypeScript and JSON (GR-D7): `biome.jsonc` at 120 columns, two spaces, double quotes,
trailing commas, the recommended rules but the code's own idioms, each turned off with its reason; a deliberate
exception in place is a `biome-ignore` with its reason. The code was reformatted once, in a commit
`.git-blame-ignore-revs` lists, so blame skips it.

**`check:docs`** runs three tools over the text files git tracks, less what is wrong on purpose (`LEFT_OUT`: the
reference set, the demo vault, the tests' fixtures, each with its reason): markdownlint-cli2, an exact dev dependency
at the version slipbox installs for notes (`MARKDOWNLINT` in `src/core/lint.ts`), run by Bun, by the repository's
`.markdownlint-cli2.jsonc` (the maintainer's own rules, copied, so nothing depends on a home file); typos, by
`_typos.toml`; and lychee, offline, for the links between files and into their headings. typos and lychee come from
`mise.toml`, so the check runs where mise is active. How each is run, and what a test's misspelling on purpose does:
[testing.md](testing.md) § Strategy.

**`check:actions`**: zizmor runs offline unless `GH_TOKEN` is set, which CI's lint job sets to its own token for the
online audits ([distribution.md](distribution.md) § The supply chain). actionlint runs ShellCheck on each `run:`
script where ShellCheck is installed: mise's pin, here and in CI. `.github/actionlint.yaml` lets one message by, in one
workflow: actionlint 1.7.12 doesn't know the token's `vulnerability-alerts` scope, which the health check reads with.

## CI

`.github/workflows/ci.yml` runs on every pull request, every push to `main`, a merge queue's group (listed for later:
a merge queue needs an organisation's repository) and by hand (GR-D9). Its jobs are `bun run check`'s parts, each
step a package.json script, never a command of its own:

- **`lint`**, on `ubuntu-24.04`: Biome (`bun run lint`), the workflows (`bun run check:actions`, zizmor online with
  the job's token) and the docs (`bun run check:docs`).
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
`mise.toml` through `jdx/mise-action`, nothing cached: both jobs install every tool, since the docs check's own tests
run typos and lychee. `scripts/check-deps.ts` holds every workflow to the pins, `permissions: {}` and the timeouts
([distribution.md](distribution.md) § The supply chain). How a flaky test is handled: [testing.md](testing.md)
§ Strategy.

The other workflows keep the same rules:

| Workflow | Runs on | Does |
| --- | --- | --- |
| `build.yml` | called | every platform built, packed, given its SBOM, summed, attested |
| `release.yml` | a `v*` tag | the tag and changelog checked, `build.yml`, the draft |
| `preview.yml` | a push to `test` | the preview planned, `build.yml`, the pre-release, the pruning, `pages.yml` |
| `pages.yml` | called; a release published; the bootstrap changed on `main`; by hand | the Pages site |
| `homebrew.yml` | a release published | the formula into the tap, through the `release` environment |
| `audit.yml` | weekly; `bun.lock` or the accepted list changed; by hand | `bun run audit` |
| `health.yml` | weekly; by hand | the health issue (§ The weekly health check) |

`build.yml` is reusable (`workflow_call`, its inputs the tag, the version and `suite`): `release.yml` and
`preview.yml` call it, a release with `suite: true`, the whole suite on every platform before it's built, a preview
with `suite: false`, its commit having passed `ci` on Linux and macOS, which `test`'s ruleset requires (GR-D13's
note). `preview.yml` calls `pages.yml`, which is reusable too. A calling job grants the most the called workflow's
jobs may take, since GitHub caps them by it (a test holds each call to granting at least what its jobs ask). A
same-repository call is `./.github/workflows/<file>`: zizmor's `self-repository` audit asks for GitHub's newer `$/`
form, which means the same, but actionlint 1.7.12 doesn't read it yet (rhysd/actionlint#711), and checks a call's
inputs and permissions against the workflow called only in the `./` form, which for a reusable workflow is read from
the run's own commit, never the workspace; the finding is ignored inline, with that reason. A release run is never
cancelled; `preview.yml` and `pages.yml` each run one at a time (`preview`, `pages`), never cancelled; `pages.yml`'s
Pages grants are its `deploy` job's alone. What each builds and publishes: [distribution.md](distribution.md)
§ Releases, § Previews, § Channels.

Beside the workflows, GitHub's own: CodeQL's default setup scans the code (`javascript-typescript`) and the workflows
(`actions`) on every pull request and push to `main`; secret scanning, with push protection, watches what's pushed;
Dependabot raises alerts and opens security updates (§ Dependencies).

## Dependencies

**Dependabot** (`.github/dependabot.yml`) proposes updates for Bun's packages (`package.json`'s exact pins and
`bun.lock`) and for the workflows' actions (their commit pins and version comments): monthly, titled as a
Conventional Commit (`build(deps): …`, `ci(deps): …`; GR-D6). Each ecosystem's updates are grouped into one pull
request, but OpenTUI, which gets one of its own, since its upgrade policy has the TUI tried by hand
([how-it-works.md](how-it-works.md) § OpenTUI upgrade policy); `web-tree-sitter`, the peer OpenTUI names, moves only
with it, by hand: its minor and major versions are never proposed. The example projects in `examples/` are fixtures
the tests read, never installed, so never updated. A version is proposed only once it's seven days old (its
cooldown), the week `bunfig.toml`'s `minimumReleaseAge` asks; a test holds the two together. Security updates are
Dependabot's alerts', opened at once, apart from these. They're merged on the upkeep calendar (`MAINTAINING.md`;
greenrepo UPK-01).

**The scanner** is `bun run audit` (`scripts/audit.ts`): `bun audit`, which reads `bun.lock` and asks npm's advisory
database about every package in it, the dev tools too, since they run here and in CI. It was chosen over
OSV-Scanner because it reads `bun.lock` itself and Bun is already pinned: no tool or action to add.
`.github/workflows/audit.yml` runs it weekly (Mondays, 04:17 UTC), on a pull request or a push to `main` that changes
`bun.lock`, the list or the workflow, and by hand. It's never in `bun run check` nor a required check: a new advisory
fails its own run, not unrelated work, and the health issue reports it.

An advisory looked at and accepted is listed in `scripts/audit.ts`' `ACCEPTED`: by package, its GHSA ids, why, and
the date to look again. Past that date its ids are no longer passed to `bun audit --ignore`, so it counts again and
the run fails until it's fixed or looked at anew. `bun audit` has no config file of its own, hence the list in code;
a test checks the list (dates, ids, reasons, none twice) and that an entry counts again after its date.

The pins Dependabot doesn't see — `mise.toml`, the language servers' and markdownlint-cli2's pins and their locks,
the grammars' commits, the Alpine image's digest — are reviewed twice a year (`MAINTAINING.md`).

## The upkeep files

The repository's expected state is committed in `.github/upkeep/`, read by the health check and by an audit (greenrepo
UPK-03, UPK-04, UPK-15, UPK-16):

- `settings.json`: the expected settings, by the field names of GitHub's REST API, grouped by the endpoint that reads
  them, each group with its `reader`. `workflow` when the health workflow's own token can read it: the repository's
  features (public, issues, Discussions, pull requests from collaborators only, no wiki or projects), private
  vulnerability reporting, the `release` environment and its `v*` tags, Pages (built by a workflow, at
  `https://remziduzagac.github.io/slipbox/`, HTTPS enforced) and the `github-pages` environment, its deployments from
  `main`, `test` and `v*` tags only (GR-D14). `admin` when only the maintainer's login can: merging (squash only,
  titled by the pull request, branches deleted), secret scanning and push protection, Dependabot's alerts and security
  updates, CodeQL's default setup, the Actions policy (SHA pinning required) and the workflow token's defaults
  (read-only, unable to approve), immutable releases, no webhooks, two-factor sign-in. Only the fields named are
  compared, so a field GitHub adds is no drift.
- `rulesets/main.json`, `rulesets/tags.json` and `rulesets/test.json`: the three rulesets as GitHub exports them.
  `main`: no deletion, no force push, changes through a pull request with no approval required and squash merges
  only, the `ci` check from GitHub Actions required, no one bypassing. `tags`: `v*` tags created, moved and deleted
  only by the admin role. `test`, the branch previews are made from: never deleted or forced back, the `ci` check
  required, no one bypassing (GR-D13).
- `renewals.toml`: every credential and renewal, with its kind, what it is, what it's for, where it lives, its
  status, its expiry or rotation date and what's due then. GitHub shows no expiry for a personal account's tokens,
  and deploy keys can't expire, so the dates are kept here. Today it holds the tap's token, `HOMEBREW_TAP_TOKEN`,
  planned: not created, so no date (GR-D18).
- `deviations.toml`: the accepted deviations, each with its rule and standard, what the rule asks, the reason, what
  stands in its place, the decision behind it and a review date: DOC-06, a docs site, until after the first release
  (GR-D8); the outside criteria a solo project can't meet (Scorecard's Code-Review, Contributors and
  Branch-Protection past its first tier, the Best Practices badge's gold level, OSPS QA-07.01); OSPS LE-01.01, since
  the DCO sign-off is optional and not taken; Scorecard's Maintained, which scores a repository younger than 90 days 0.

A setting is never applied by automation: the maintainer changes it by hand. A drift is undone, or, when the new
setting is right, the file is changed to match through a pull request; a planned change is a pull request to the file
first, applied once it's merged.

## The weekly health check

`.github/workflows/health.yml` runs on Mondays at 06:17 UTC and by hand, nothing else (greenrepo UPK-03, UPK-04,
CI-13). It starts from no permission; each job's grants are commented:

- `collect` reads, with `contents`, `actions`, `pages`, `pull-requests`, `security-events` and `vulnerability-alerts`
  read (the last a scope actionlint doesn't know yet: § The check): the Dependabot and code scanning alerts, counted,
  the example projects' Dependabot alerts apart, as fixtures to dismiss; the open pull requests, Dependabot's
  included; the workflows switched off, GitHub's `disabled_inactivity` told from `disabled_manually`; each workflow's
  last finished run on `main`; the rulesets and the `workflow` settings against the expected ones.
- `links` checks the tracked Markdown's links online with lychee, the examples and the tests' fixtures left out
  (their addresses are made up). The check on every change is offline; this one finds the links outside that broke
  with no change here. Its result goes into the issue, not an issue of its own.
- `issue`, the one job that writes (`issues: write`), runs whatever the others ended with, so a collection that
  failed is reported rather than read as a clean week.
- `keepalive` (`actions: write`) runs always, after the collection has seen the workflows' states: it switches this
  workflow on again, which keeps its schedule alive, then any other GitHub switched off for inactivity; one switched
  off by hand is only reported. It is plain `gh`, with no checkout or toolchain that could be what broke.

The tools come from `mise.toml` through `jdx/mise-action`, only the one each job needs; nothing is cached; one run
goes at a time, never cancelled.

**The health issue** holds the state of the repository, not events. It is found by its label, `repository-health`,
and the marker in its body, never by its title; the workflow creates it, reopens it if closed, closes duplicates and
locks its conversation. Its first line is the date of the last run and a link to it: a last run more than eight days
old means the check has stopped, and counts as red. Its sections go by who acts: what needs the maintainer (renewals
due within 30 days, credentials planned but not created, settings and rulesets drifted, workflows switched off, pull
requests waiting, deviations whose review date has come), what an agent can propose (alerts, workflows failing on
`main`, broken links, mistakes in the upkeep files, a job that failed), the accepted deviations, and what isn't
available here, with why. Alerts are counts with a link to the Security tab, never a package; text others control
(a pull request's title, a server's error) is quoted in a code span, its mentions and comment openers defused; long
lists stop at ten and link to the rest. A hidden block at the end keeps when each item was first seen, for the
workflow alone: an item is marked new for a week, and something critical (a critical alert, a renewal due within
seven days, a workflow switched off) gets one comment the run it first appears, since an edit notifies nobody.
Nothing an agent must act on is only in the hidden block. Agents read the issue first in a session (`AGENTS.md`).

The body is rewritten only when its text changed, the first line's run link aside but not its date: a second run the
same day edits nothing, and a quiet week makes one edit, its date. greenrepo asks both for no edit in a quiet week and
for the last run's date on the first line; the date wins, since without it a quiet week can't be told from a stopped
workflow.

**The monthly comparison** is `bun scripts/health.ts --admin`, run by the maintainer with their own login: every
group of `settings.json` and the rulesets, their bypass actors included; every secret (the repository's,
Dependabot's, each environment's) and deploy key, with its age, checked against `renewals.toml`; the secret scanning
alerts, counted. It prints the drift and changes nothing: applying a setting is the maintainer's act. No admin
credential is stored anywhere, and nothing only an admin can read reaches the public issue. Its two-factor check needs
the login's `read:user` scope.

**`scripts/health.ts`** does all of it, with no dependency (Bun's own TOML parser reads the upkeep files) and GitHub
reached only through `gh`. Its pure parts (the files' parsing and checks, the comparisons, the dates due, the issue
rendered and its state, what to do to the issue) are tested in `tests/health.test.ts`, with the workflow's shape.

Twice a year, in April and October, the repository is audited again against greenrepo: whether its scope still fits,
the toolchains and the pins Dependabot doesn't see, the settings files against GitHub's current options, the
rulesets' bypass list, the accepted deviations, the renewals, and `ARCHITECTURE.md` against the code
(`MAINTAINING.md` § The calendar).
