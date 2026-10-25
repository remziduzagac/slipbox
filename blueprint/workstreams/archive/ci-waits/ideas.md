# Ideas

## Where a push's range starts

- From the last commit whose push run passed, read from GitHub's runs (2026-10-24). Chosen (CIW-D1).
- From the event's `before`, as now: a run cancelled or failed leaves its commits out of every later run. Not
  chosen.
- A ref (`ci/passed`) or a tag moved by each run that passed: it needs `contents: write` for a job that runs the
  tests' code. Not chosen.
- A run that passed told apart from one under the older scope by its date, or by the commit this change lands as:
  neither is known before it merges. By `SCOPE_VERSION` in the commit's own `scripts/ci-scope.ts`, which is what ran.
  Chosen (CIW-D1).
- The full runs by hand counted among the passes: they run everything, so they'd count whatever their scope, but
  `test`'s head is a start already and a push to `dev` always has a nearer pass. Not chosen: an idea for later.
- With no pass, `test`'s head whatever its version: `test` can move to a pass of the scope before (one that left the
  cancelled merges out) before this scope's first run passes. Not chosen (2026-10-24, the design's critique).
- A start pinned in the code (`SCOPE_FLOOR`, today `71313f3`): it can't drift, but needs moving at every version, and
  today it would run everything anyway. Not chosen: a version's first run runs everything instead.

## A pull request's record bound to its merge

- The merged pull request's head from the API (`GET /commits/{sha}/pulls`), compared with the record's run's: one call,
  but likely `pull-requests: read` for `changes`. Not chosen.
- The record's run's head merged onto the push's parent with `git merge-tree`, compared with the push's tree: no grant,
  a fetch. Chosen (CIW-D2).
- Only this repository's runs trusted, a fork's never: the binding above makes it unneeded. Not chosen.

## A push whose tree passed already

- `lint` and `site` skipped too, after `changes`: they take under a minute on Linux, and waiting on `changes` delays
  every pull request's lint. Not chosen (CIW-D3).

## What a pull request's run tested

- An artifact `ci-tested-<base>-<tree>`, found by its name (2026-10-24). Chosen (CIW-D2).
- The run's merge commit in its title (`run-name` from `github.sha`): every pull request's run renamed in the list,
  and the commit fetched afterwards, perhaps gone. Not chosen.
- A commit status the pull request's run posts on its merge commit: `statuses: write` for every pull request's run,
  and none for a fork's. Not chosen.
- Trusting the pull request whose squash a commit is, when its last run passed after its base landed: GitHub's merge
  commit can be older than the run, and timing is no proof. Not chosen.
- Requiring a branch up to date before it merges: every open pull request runs again each time `dev` moves (D242).
  Not chosen.

## Superseded pushes

- A push's run cancelled by the next push to its branch (2026-10-24). Chosen (CIW-D4).
