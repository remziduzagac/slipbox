---
status: done
assignee: claude-cli
blocked_by: [GR-T9]
created: "2026-10-12"
---

# GR-T11: The weekly health check and the upkeep files

The repository kept green by a calendar (greenrepo UPK-02 to UPK-05, UPK-15, UPK-16, CI-13).

## Description

- The three upkeep files: the expected settings (rulesets as GitHub exports them, and the rest by GitHub's API field
  names), the renewals (every token and deploy key, with its date), the accepted deviations (each with its reason
  and review date: DOC-06 until after the first release, the Scorecard checks a solo project can't pass).
- `health.yml`: on a schedule and by hand only; read-only jobs collect the signals its token reads (Dependabot alerts,
  code scanning alerts, open pull requests, workflows switched off, rulesets against the expected ones, renewals
  due, the weekly link check); one job writes the labelled health issue, only when its text changed; a job that
  always runs re-enables the workflow.
- The collecting and rendering in a script with tests (Bun, no dependency), so it can be read and tested.

## Acceptance criteria

- The script's tests; zizmor and actionlint clean; the first run waits for GR-T13.

## Design text

For design/repository.md, its upkeep part (greenrepo UPK-03, UPK-04, UPK-15, UPK-16, CI-13).

**The upkeep files** are in `.github/upkeep/`, read by the health check and by an audit:

- `settings.json`: the expected settings, by the field names of GitHub's REST API, grouped by the endpoint that reads
  them, each group with its `reader`: `workflow` when the health workflow's own token can read it (the repository's
  features, private vulnerability reporting, the `release` environment and its `v*` tags), `admin` when only the
  maintainer's login can (merging, the security switches, Dependabot alerts on, CodeQL's default setup, the Actions
  policy and the workflow token's defaults, immutable releases, webhooks, two-factor sign-in). Only the fields named
  are compared, so a field GitHub adds is no drift.
- `rulesets/main.json` and `rulesets/tags.json`: the two rulesets as GitHub exports them. `main`: no deletion, no
  force push, changes through a pull request with no approval required and squash merges only, the `ci` check from
  GitHub Actions required, no one bypassing. `tags`: `v*` tags created, moved and deleted only by the admin role.
- `renewals.toml`: every credential and renewal, with its kind, what it is, what it's for, where it lives, its
  status, its expiry or rotation date and what's due then. GitHub shows no expiry for a personal account's tokens,
  and deploy keys can't expire, so the dates are kept here. Today it holds the tap's token, `HOMEBREW_TAP_TOKEN`,
  planned: not created, so no date.
- `deviations.toml`: the accepted deviations, each with its rule and standard, what the rule asks, the reason, what
  stands in its place, the decision behind it and a review date: DOC-06 until after the first release (GR-D8); the
  outside criteria a solo project can't meet (Scorecard's Code-Review, Contributors and Branch-Protection past its
  first tier, the badge's gold level, OSPS QA-07.01); OSPS LE-01.01, since the DCO sign-off is optional and not
  taken; Scorecard's Maintained, which scores a repository younger than 90 days 0.

**The weekly health check**, `.github/workflows/health.yml`, runs on Mondays at 06:17 UTC and by hand, nothing else.
It starts from no permission; each job's grants are commented:

- `collect` reads, with `contents`, `actions`, `pull-requests`, `security-events` and `vulnerability-alerts` read
  (the last a scope actionlint doesn't know yet: `.github/actionlint.yaml` lets that one message by, in that one
  workflow): the Dependabot and code scanning alerts, counted; the open pull requests, Dependabot's included; the
  workflows switched off, GitHub's `disabled_inactivity` told from `disabled_manually`; each workflow's last
  finished run on `main`; the rulesets and the `workflow` settings against the expected ones.
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
Nothing an agent must act on is only in the hidden block.

The body is rewritten only when its text changed, the first line's run link aside but not its date: a second run the
same day edits nothing, and a quiet week makes one edit, its date. greenrepo asks both for no edit in a quiet week and
for the last run's date on the first line; the date wins, since without it a quiet week can't be told from a stopped
workflow.

**The monthly comparison** is `bun scripts/health.ts --admin`, run by the maintainer with their own login: every
group of `settings.json` and the rulesets, their bypass actors included; every secret (the repository's,
Dependabot's, each environment's) and deploy key, with its age, checked against `renewals.toml`; the secret scanning
alerts, counted. It prints the drift and changes nothing: applying a setting is the maintainer's act. No admin
credential is stored anywhere, and nothing only an admin can read reaches the public issue.

**`scripts/health.ts`** does all of it, with no dependency (Bun's own TOML parser reads the upkeep files) and GitHub
reached only through `gh`. Its pure parts (the files' parsing and checks, the comparisons, the dates due, the issue
rendered and its state, what to do to the issue) are tested in `tests/health.test.ts`, with the workflow's shape.

## Log

- 2026-10-12: the upkeep files, `scripts/health.ts`, `tests/health.test.ts`, `.github/workflows/health.yml` and
  `.github/actionlint.yaml`. Field names and readers from GitHub's REST API description and its docs' permission
  data (`github/rest-api-description`, `github/docs`, read with `gh api`); the GitHub Actions app's id (15368) and
  the admin role's (5) from `gh api apps/github-actions` and public rulesets; OSPS LE-01.01 and QA-07.01 from
  `ossf/security-baseline`; Scorecard's 90 days from its `docs/checks.md`; `jdx/mise-action` v5.1.1, published
  2026-10-04, by its tag's commit, the pin GR-T9 uses.
- Checked: the 39 tests, each of 20 mutations of the script failing one (among them the two bugs found on the way:
  Bun parses a TOML date as a `Temporal.PlainDate`, and a second run marked everything new); the typecheck; Biome;
  `check:deps`; actionlint; zizmor offline and online, pedantic, with no finding in `health.yml`. End to end against
  a stand-in for `gh`: `collect`, then `issue` creating, labelling and locking the issue, then a second run the same
  day changing nothing; `--admin` printing its drift. The links job's step, taken from the workflow, run offline
  here: it finds 19 broken links between files in the archived workstreams, for GR-T6.
- Not run: anything against GitHub; the first live run waits for GR-T13.
