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
| `CONTRIBUTING.md` | reporters, contributors | where each report goes; what a pull request needs |
| `CODE_OF_CONDUCT.md` | everyone | the Contributor Covenant 2.1; reports through private reporting (D234) |
| `.github/ISSUE_TEMPLATE/` | reporters | the bug form (all fields required but the output); blank issues off |
| `.github/pull_request_template.md` | contributors, agents | a pull request's checklist, as CONTRIBUTING.md has it |

The issue chooser's links send questions and ideas to Discussions (GR-D17), the rest to the docs, and a vulnerability
to private reporting. Issues are for bugs; pull requests come from collaborators only (GR-D5). The contributing guide,
the code of conduct and the pull request template are there all the same (D234); an AI policy beyond the guide's
`Co-Authored-By:` rule waits until pull requests open.

`MAINTAINING.md` holds the procedures greenrepo asks to be written (DOC-04, UPK-05, UPK-08, UPK-11, COM-13,
COM-14): the release steps ([distribution.md](distribution.md) § Releases), squash merging with Conventional Commit
titles, previews, Dependabot's monthly merges, the supply chain's gates and admitting a dependency, the pins
Dependabot doesn't see, the committed expected settings compared weekly and monthly and never applied by automation,
the health issue, who does what, the calendar, and the steps behind `SECURITY.md`.

## How a change lands

Every change reaches `dev`, the default branch, through a pull request (GR-D6, D251). `dev`'s ruleset requires one,
with no approval (there is no second person to give it) and the `ci` check passed (§ CI); squash is the only merge
method, the squashed commit titled and described by the pull request, and the branch deleted once merged. The title
is a Conventional Commit (`fix(export): …`, `feat(cli)!: …` for a breaking change), so `dev` has one commit per
change, titled for the changelog; the workstream's or task's IDs, the roadmap's steps and the decisions go in the
body. A contributor's commit made with an agent ends with a `Co-Authored-By:` trailer naming it; the maintainer's
commits and pull requests name no agent (D256).

From `dev`, work moves on by fast-forward, never committed to directly (D251): to `test`, which publishes a preview to
try by hand (§ CI), and where `ci` run by hand runs everything and reports `full`, as a check and a commit status
(D257); then to `main`, the released state, whose ruleset takes only a commit that passed `full`, and on which releases
are tagged. Agents work on branches and open pull requests; reviewing and merging into `dev`, moving `test` or `main`,
the full run and releasing happen when the maintainer asks; changing the settings is the maintainer's alone. No one
bypasses the rulesets, the maintainer included.

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
exception in place is a `biome-ignore` with its reason. The code was reformatted once, before the history kept starts
(2026-10-22); a later reformatting is a commit of its own, listed in `.git-blame-ignore-revs` so blame skips it.

**`check:docs`** runs three tools over the text files git tracks, less what is wrong on purpose (`LEFT_OUT`: the
reference set, the demo vault, the tests' fixtures, each with its reason): markdownlint-cli2, an exact dev dependency
at the version slipbox installs for notes (`MARKDOWNLINT` in `src/core/documents/diagnostics/lint.ts`), run by Bun, by
the repository's
`.markdownlint-cli2.jsonc` (the maintainer's own rules, copied, so nothing depends on a home file); typos, by
`_typos.toml`; and lychee, offline, for the links between files and into their headings. typos and lychee come from
`mise.toml`, so the check runs where mise is active. How each is run, and what a test's misspelling on purpose does:
[testing.md](testing.md) § Strategy.

**`check:actions`**: zizmor runs offline unless `GH_TOKEN` is set, which CI's lint job sets to its own token for the
online audits ([distribution.md](distribution.md) § The supply chain). actionlint runs ShellCheck on each `run:`
script where ShellCheck is installed: mise's pin, here and in CI. `.github/actionlint.yaml` lets one message by, in one
workflow: actionlint 1.7.12 doesn't know the token's `vulnerability-alerts` scope, which the health check reads with.

## CI

`.github/workflows/ci.yml` runs on every pull request, every push to `dev` or `test`, a merge queue's group (listed for
later: a merge queue needs an organisation's repository) and by hand (GR-D9, D251). A pull request runs lint, the
typecheck, boundary and dependency gates, reached unit tests on Linux and macOS, CodeQL, site and the aggregate `ci`
check. Only terminal checks move after merge (D266). A push runs the full changed scope; a run by hand runs everything
and reports `full` instead of `ci`. Jobs call package.json scripts.

- **`lint`**, on `ubuntu-24.04`: Biome (`bun run lint`), the workflows (`bun run check:actions`, zizmor online with
  the job's token), the docs (`bun run check:docs`) and the tests that read the docs (`bun run test:docs`: the docs'
  and the site's tests, D230).
- **`changes`**, on `ubuntu-24.04`: what a pull request changed (`bun run ci:scope`, its merge commit against its base),
  or a push to `dev` or `test` (since the nearest full-platform push pass; § What a push tests). PRs without terminal
  coverage emit no complete-check record (D266). When every file is the docs' (`docs/`, `blueprint/`, `site/src/`, a
  Markdown file at the top), `test` and `terminal` are skipped: no test reads those files but the docs' own, which
  `lint` runs (D230). Otherwise it says whether any terminal check reaches the change (`checks`); `terminal` is skipped
  when none does (D239). A merge group, a run by hand, a branch just made and a diff that can't be read run everything.
  A test holds every test that reads the docs to `test:docs`'s list, so a new one can't be skipped with them.
- **`test`**, on `ubuntu-24.04` and `macos-15` (arm64) for every event, neither stopping the other: the typecheck,
  boundary, supply chain's gates and reached unit tests (`bun run test:changed`; everything in the full run). On macOS
  SQLite is Apple's; its FTS5 and ranking run when a change reaches them and in the full run (`tests/core/`,
  `tests/cli/`, `tests/cli.test.ts`; `14.13`).
- **`terminal`**, skipped entirely for pull requests. Pushes, merge groups and full runs keep `ubuntu-24.04`,
  `ubuntu-24.04-arm` and `macos-15`: the terminal checks a change's files reach (`bun run test:terminal:changed`; every
  one in the full run, TT-D6). No job runs on an Intel Mac, for which nothing is built after 0.3.0 (D238); a test holds
  every workflow to it.
- **`site`**, on `ubuntu-24.04` for every event: the docs' site built (`bun run site`), every link within it landing
  (DS). Lint separately checks Markdown, spelling and links between files on every PR.
- **`ci`**, the aggregator and the one required check: it always runs, waits for every other job, and fails unless
  each passed or was skipped. A job skipped by its `if:` counts as passed; one that failed, was cancelled or never
  started doesn't. A test holds it to waiting for every job but `status`, so a job added can't be left out of the
  required check. Run by hand, its name is `full` (D251): `dev`'s and `test`'s rulesets require `ci`, `main`'s requires
  `full`, and a release refuses a tag whose commit didn't pass it.
- **`status`**, on `ubuntu-24.04`, run by hand alone, once `full` passed: `full` again, as a commit status the run's
  token posts (`statuses: write`, D257). A ruleset counts no check a run by hand reports (GitHub's "Troubleshooting
  required status checks"), so `main`'s, which requires `full` from GitHub Actions, sees this status, never the check;
  `release.yml` reads the check.

**What a change reaches** (D239, `scripts/ci-scope.ts`). The tests: each that uses a changed file — imports it, at
any depth, statically or not, code or not (the skill's text, a dictionary), or names it by its path from the
repository (`join(ROOT, "examples", "home")`, the entry point a test runs) — and a changed snapshot's own. The
terminal checks, which drive slipbox as a process and import none of it: a changed check file's (`bun run
test:terminal <file>`); for a changed file of the app's, the features `CHECKS_FOR` names it under (`git`, `export`,
`spelling`…, pieces of the checks' names), or every check for one it doesn't list (the app, drawing, the parser, the
index, the config — shared by all); every check for the harness and the samples the checks' home is built from, but a
harness file used by only some checks runs theirs (`HARNESS_FOR`):
  the release builder runs the `updates` checks. The
two samples changed most, the reference set's cases and its kitchen-sink config, run what reads them (`SAMPLES_FOR`).
The packages, the lockfile, the toolchain, the workflows, the tests' preload and a file nothing names run everything;
the lint's own configs, only the lint. A test holds `CHECKS_FOR` to the files and the checks there are. Locally,
`bun run test:changed` and `bun run test:terminal:changed` run the same against where the branch left `origin/dev`;
`bun run check` runs the first.

No permission by default (`permissions: {}`): each job grants its own with a comment saying why — `contents: read` to
check out, `changes` also `actions: read` for passing runs and records, the aggregator nothing. Every job has a timeout.
A pull request's superseded run is cancelled, as is a push's when its branch is pushed again
(CIW-D4). Reruns of pushes, runs by hand and merge groups finish in their own concurrency groups. The toolchain comes
from
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
| `pages.yml` | called; a release published; by hand | the Pages site |
| `homebrew.yml` | a release published | the formula into the tap, through the `release` environment |
| `audit.yml` | weekly; `bun.lock` or the accepted list changed; by hand | `bun run audit` |
| `health.yml` | weekly; by hand | the health issue (§ The weekly health check) |

`build.yml` is reusable (`workflow_call`, its inputs the tag, the version and `suite`): `release.yml` and `preview.yml`
call it, both with `suite: false` (D251): a preview's commit passed `ci` on Linux and macOS, which `test`'s ruleset
requires (GR-D13's note), and a release's passed `full`, the whole suite, which `main`'s requires and `release.yml`'s
first job checks before anything is built. `preview.yml` calls `pages.yml`, which is reusable too. A calling job grants
the most the called workflow's jobs may take, since GitHub caps them by it (a test holds each call to granting at least
what its jobs ask). A same-repository call is `./.github/workflows/<file>`: zizmor's `self-repository` audit asks for
GitHub's newer `$/` form, which means the same, but actionlint 1.7.12 doesn't read it yet (rhysd/actionlint#711), and
checks a call's inputs and permissions against the workflow called only in the `./` form, which for a reusable workflow
is read from the run's own commit, never the workspace; the finding is ignored inline, with that reason. A release run
is never cancelled; `preview.yml` and `pages.yml` each run one at a time (`preview`, `pages`), never cancelled while
running (one waiting gives way to a newer);
`pages.yml`'s Pages grants are its `deploy` job's alone, and only a preview's run and a run by hand on `main` deploy:
for any other, its `redeploy` job starts a run of it by hand on `main` (`actions: write`, D258, D265), so
`preview.yml`'s call grants that too. What each builds and publishes:
[distribution.md](distribution.md) § Releases, § Previews, § Channels.

Beside the workflows, GitHub's own: CodeQL's default setup scans the code (`javascript-typescript`) and the workflows
(`actions`) on every pull request and push to the default branch, `dev`; secret scanning, with push protection, watches
what's pushed;
Dependabot raises alerts and opens security updates (§ Dependencies).

## What a push tests

A push to `dev` or `test` tests a range of commits: from the nearest commit whose run passed to the commit pushed
(CIW-D1). The range's files go through § CI's "What a change reaches" unchanged. The `changes` job works the range out
once (`scripts/ci-range.ts`, which `scripts/ci-scope.ts` runs) and hands it to the `test` and `terminal` jobs as its
output `range`, `<from>..<to>` or `all`, which they read as `SCOPE_RANGE`: every job of a run tests the same range,
and only `changes` reads GitHub's API. Anything else in it means everything; a range with nothing in it skips both
jobs (`code` and `checks` false), so they never see one. A pull request's range is its merge commit against its base,
and a run by hand's and a merge group's everything, as before; so is `bun run test:changed` here, against where the
branch left `origin/dev`.

**Which runs count.** `scripts/ci-scope.ts` declares `SCOPE_VERSION`, now 3 (D266), and a later change raises it when it
alters what a pass or a record means (a pull request no longer running terminal checks). A run counts only when its
commit's `scripts/ci-scope.ts` declares the same version as the commit pushed. An older policy may have credited a PR
record for checks the current PR no longer runs, so it cannot establish coverage under this version. Every hash read
from the API is checked as one (40 hex digits) before it reaches git.

**The last run that passed.** `changes` lists the newest hundred runs of `ci.yml` for a push that concluded `success`
(`GET /repos/{repo}/actions/workflows/ci.yml/runs` with `event=push`, `status=success`) — every job passed or was
skipped; a cancelled run never does, since `ci` fails then; a run that passed when re-run counts — and keeps those of
this version. It walks back from the commit pushed (`git rev-list --first-parent`; `dev` and `test` are linear, squash
only) and starts the range at the first that's among them.

**With none,** from `test`'s head before the push — `origin/test` for a push to `dev`, the event's `before` for a push
to `test` — when that commit declares this version: `test`'s ruleset, which nobody bypasses, takes only a commit whose
`ci` passed, and that run was its own commit's, of this version. Otherwise, everything: the first push under a new
version, a `test` behind it, `before` all zeros for a branch just made, a start off the pushed commit's line, the API
unreadable with `test` behind. So a version's first run tests everything, and nothing a run before it skipped is taken
as tested. In particular, a `test` head from scope 2 provides no fallback for the first scope-3 push. Whatever fails —
the API, a fetch, a hash that isn't one — tests more, never less.

**What a pull request's run passed** (CIW-D2, amended by D266). Under scope 3, PRs cover unit tests on both platforms,
lint and site, but no terminal checks. They emit no complete-check artifact, and push range calculation does not consult
PR records even if one matches. The old lookup remains only for legacy scopes below 3. Raising the version invalidates
old push passes too, so the first scope-3 push runs everything without a same-version fallback.

A squash push retains its own commit in the range since the last complete push pass. Unit tests repeat on both platforms
along with the required terminal coverage; site remains on every event. This deliberately forgoes per-job reuse to keep
one conservative range. Cancelled or failed pushes leave their changes to the next push, and an already-passed push tree
can still cover promotion to `test` (CIW-D1, CIW-D3). The aggregate `ci` check keeps its success/skipped rule. A
terminal-only break can sit on `dev` until its push run finds it (D251, D266).

**Nothing to test.** A range from a commit to itself, or between two commits with the same tree, tests nothing:
`changes` outputs `code` and `checks` false, `test` and `terminal` are skipped, and `ci` passes; `lint` runs on every PR
and push, as does `site`. A pull request that changes nothing still runs everything (D230). So:

- a squash merge tests its changed scope on all configured platforms, even when its PR unit tests passed;
- after merges close together whose runs were cancelled or failed, the next push tests every one of them since the
  last pass, on Linux and macOS;
- moving `dev` to `test` (CIW-D3): the commit pushed passed on `dev`, so the push runs no test and no terminal check;
  `preview.yml` builds and publishes as before. A commit whose `dev` run hadn't ended yet (`ci`'s check ends a second
  before its run: `test`'s ruleset takes it) is tested from the nearest that passed, which is safe and tests again; one
  `dev` never passed `test` refuses. The full run by hand still runs everything.

**The log** says where the range starts, and why: `since 1a2b3c4: run <url> passed`, `since test's head 1a2b3c4: no run
of this scope has passed yet`, `everything: no run of this scope has passed, and test's head is of another`, `the runs
that passed can't be read`, then `since test's head 1a2b3c4: which runs passed is unknown`. Legacy scopes can also
report a verified PR-tree shortcut; scope 3 never takes that shortcut.

**Superseded pushes** (CIW-D4). A push's run still going when its branch is pushed again is cancelled, as a
pull request's is: the group is the pull request's number, else the branch for a push, else the run's own
(`ci-${{ github.event.pull_request.number || (github.event_name == 'push' && github.run_attempt == '1' &&
github.ref) || github.run_id }}`), and `cancel-in-progress` is true for a pull request and a push. A push's run re-run,
a run by hand, the full run on `test` among them, and a merge group's are in groups of their own, never cancelled nor
replaced: an older commit's run re-run can't cancel the branch's newest, which would leave its head without a `ci`
check `test` takes. With the range from the last pass, the
cancelled run's commits are the next run's, and a burst of merges holds one run's macOS runners, not one per merge.
Its cost: on a day of merges every few minutes, with a run taking forty, no run on `dev` passes until the merging
stops, so `test` can't move till then.

**Permissions.** `changes` gains `actions: read`, to read the runs and the records; its token goes to its scope step
alone, and only on a push (`GH_TOKEN`), so a pull request's code never holds it. The record's upload uses the runner's
own token and needs no grant (`build.yml`'s `build` job uploads with `contents: read` alone); fetching a pull request's
head needs none in a public repository, and failing, tests more. No job gains a write.

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
`.github/workflows/audit.yml` runs it weekly (Mondays, 04:17 UTC), on a pull request or a push to `dev` that changes
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
- `rulesets/dev.json`, `rulesets/test.json`, `rulesets/main.json` and `rulesets/tags.json`: the four rulesets as GitHub
  exports them (D251).
  `dev`, the default branch: no deletion, no force push, changes through a pull request with no approval required
  and squash merges only, the `ci` check from GitHub Actions required, no one bypassing (GR-D6, D251). `test`, the
  branch previews are made from: never deleted or forced back, the `ci` check required, no one bypassing (GR-D13).
  `main`: no deletion, no force push, the `full` check from GitHub Actions required (D251, D257), no one bypassing.
  `tags`: `v*` tags created, moved and deleted only by the admin role.
- `renewals.toml`: every credential and renewal, with its kind, what it is, what it's for, where it lives, its
  status, its expiry or rotation date and what's due then. GitHub shows no expiry for a personal account's tokens,
  and deploy keys can't expire, so the dates are kept here. Today it holds the tap's deploy key,
  `HOMEBREW_TAP_DEPLOY_KEY`, active, with its rotation date (D228).
- `deviations.toml`: the accepted deviations, each with its rule and standard, what the rule asks, the reason, what
  stands in its place, the decision behind it and a review date: the outside criteria a solo project can't meet
  (Scorecard's Code-Review, Contributors and Branch-Protection past its first tier, the Best Practices badge's gold
  level, OSPS QA-07.01); OSPS LE-01.01, since the DCO sign-off is optional and not taken; Scorecard's Maintained, which
  scores a repository younger than 90 days 0.

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
  last finished run on `dev` or `main`, cancellations passed over (D251, CIW-D4); the rulesets and the `workflow`
  settings against the expected ones.
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
`dev` or `main`, broken links, mistakes in the upkeep files, a job that failed), the accepted deviations, and what isn't
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
