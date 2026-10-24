# Design changes

## ADDED design/repository.md § What a push tests

After § CI.

A push to `dev` or `test` tests a range of commits: from the nearest commit whose run passed to the commit pushed
(CIW-D1). The range's files go through § CI's "What a change reaches" unchanged. The `changes` job works the range out
once (`scripts/ci-range.ts`, which `scripts/ci-scope.ts` runs) and hands it to the `test` and `terminal` jobs as its
output `range`, `<from>..<to>` or `all`, which they read as `SCOPE_RANGE`: every job of a run tests the same range,
and only `changes` reads GitHub's API. Anything else in it means everything; a range with nothing in it skips both
jobs (`code` and `checks` false), so they never see one. A pull request's range is its merge commit against its base,
and a run by hand's and a merge group's everything, as before; so is `bun run test:changed` here, against where the
branch left `origin/dev`.

**Which runs count.** `scripts/ci-scope.ts` declares `SCOPE_VERSION`, 2 with this change, and a later change raises it
when it alters what a pass or a record means (a pull request's run without macOS, say). A run counts only when its
commit's `scripts/ci-scope.ts` declares the same version as the commit pushed: a pass under another scope tested
something else — under the scope before this one, a push's commits since the branch's head before it, which says
nothing of the commits before those (2026-10-24's runs, cancelled for newer ones, left their merges untested). Every
hash read from the API is checked as one (40 hex digits) before it reaches git.

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
as tested; for this change's own merge that's what "from `test`'s head" gives too, since every commit since `test`'s
head (`71313f3`) together changes the workflows and `package.json`, which run everything. Whatever fails — the API, a
fetch, a hash that isn't one — tests more, never less.

**What a pull request's run passed** (CIW-D2). A pull request's run tests its merge commit, on the base it was made
against: the tree its squash has when nothing landed in between. Its `changes` job records that in an artifact named
`ci-tested-v<version>-<base>-<tree>` — the merge commit's first parent and its tree, full hashes — holding what the
scope said: written to `$RUNNER_TEMP`, never the workspace, by `actions/upload-artifact` (pinned as `build.yml` pins
it), kept seven days, `continue-on-error`, so a failed upload costs a merge's run its shortcut and nothing else.

A push whose range doesn't start at its own commit looks for the record of its commit's parent and tree (`GET
/repos/{repo}/actions/artifacts?name=…`, every page) and takes the first that holds:

- its run is a pull request's run of `ci.yml`, `completed` with `success` (`GET /repos/{repo}/actions/runs/{id}`): one
  still going, or that failed after its record was written, counts for nothing — pull requests are merged before their
  runs end (research.md);
- its run's head, fetched (`git fetch origin <head>`) and merged onto the push's parent (`git merge-tree --write-tree`),
  gives the push's tree: the run is of the pull request that was squashed, or of one with the same change. A record
  any other branch's run wrote names a tree its own head doesn't make. A fork's run is held to the same; a fork's
  workflow that wrote a false record would be in the tree, merged.

Then the push's range ends at its parent: what landed before it that no passing run covered; nothing, when the parent
is where the range starts. The two cover the whole: the pull request's run tested what the squash changed, on the
squash's own tree, with its workflow and rules; the push tests what came before, on the same tree. Today every pull
request's run tests on Linux and macOS, so its record covers both; item 3's task (macOS kept for what needs it) must
make the record say which systems ran, and the push test the others, raising the version.

**Nothing to test.** A range from a commit to itself, or between two commits with the same tree, tests nothing:
`changes` outputs `code` and `checks` false, `test` and `terminal` are skipped, and `ci` passes; `lint` and `site`,
which take under a minute on Linux, run as before. A pull request that changes nothing still runs everything (D230).
So:

- the merge of a pull request whose run passed against a `dev` whose last run passed tests nothing;
- after merges close together whose runs were cancelled or failed, the next push tests every one of them since the
  last pass, on Linux and macOS;
- moving `dev` to `test` (CIW-D3): the commit pushed passed on `dev`, so the push runs no test and no terminal check;
  `preview.yml` builds and publishes as before. A commit whose `dev` run hadn't ended yet (`ci`'s check ends a second
  before its run: `test`'s ruleset takes it) is tested from the nearest that passed, which is safe and tests again; one
  `dev` never passed `test` refuses. The full run by hand still runs everything.

**The log** says where the range starts, and why: `since 1a2b3c4: run <url> passed`, `since test's head 1a2b3c4: no
run of this scope has passed yet`, `everything: no run of this scope has passed, and test's head is of another`,
`the runs can't be read (<why>): …`, `5d6e7f8's tree passed in pull request run <url> on its parent: only
1a2b3c4..9f8e7d6`.

**Superseded pushes** (CIW-D4). A push's run still going when its branch is pushed again is cancelled, as a
pull request's is: the group is the pull request's number, else the branch for a push, else the run's own
(`ci-${{ github.event.pull_request.number || (github.event_name == 'push' && github.ref) || github.run_id }}`), and
`cancel-in-progress` is true for a pull request and a push. A run by hand, the full run on `test` among them, and a
merge group's are in groups of their own, never cancelled nor replaced. With the range from the last pass, the
cancelled run's commits are the next run's, and a burst of merges holds one run's macOS runners, not one per merge.
Its cost: on a day of merges every few minutes, with a run taking forty, no run on `dev` passes until the merging
stops, so `test` can't move till then.

**Permissions.** `changes` gains `actions: read`, to read the runs and the records; its token goes to its scope step
alone, and only on a push (`GH_TOKEN`), so a pull request's code never holds it. The record's upload uses the runner's
own token and needs no grant (`build.yml`'s `build` job uploads with `contents: read` alone); fetching a pull request's
head needs none in a public repository, and failing, tests more. No job gains a write.

## MODIFIED design/repository.md § CI

- In the `changes` bullet, "or a push to `dev` or `test` (its commits since the branch's head before it, the event's
  `before`)" becomes "or a push to `dev` or `test` (its range: since the nearest commit whose run passed, less what a
  pull request's run passed on the same tree; § What a push tests). For a pull request it records the tree and base
  its run tests", and "A merge group, a run by hand, a branch just made and a diff that can't be read run everything"
  stays.
- "A pull request's superseded run is cancelled; every other run, a push or a run by hand among them, finishes (its
  concurrency group is the run's own)" becomes "A pull request's superseded run is cancelled, and so is a
  push's still going when its branch is pushed again (§ What a push tests; CIW-D4); a run by hand and a merge group's
  finish, each in a group of its own".
- In "No permission by default", "— `contents: read` to check out, the aggregator nothing" becomes "— `contents: read`
  to check out, `changes` `actions: read` too, to read the runs that passed and the records, the aggregator nothing".

Previously, in the `changes` bullet: "or a push to `dev` or `test` (its commits since the branch's head before it,
the event's `before`)"; "A pull request's superseded run is cancelled; every other run, a push or a run by hand among
them, finishes (its concurrency group is the run's own)"; "each job grants its own with a comment saying why —
`contents: read` to check out, the aggregator nothing".

## MODIFIED design/testing.md § Strategy (`0.4`)

In "CI runs the suite on Linux and macOS", "and a push to `dev` or `test` the same for its commits" becomes "and a
push to `dev` or `test` the same for what changed since the last commit whose run passed, less what a pull request's
run passed on the same tree: nothing, for `dev` moved to `test` (repository.md § What a push tests, linked)".

Previously: "and a push to `dev` or `test` the same for its commits".

## The maintainer's procedures

Not the blueprint's, changed with the code: `MAINTAINING.md` § Merging a change ("a push to `dev` runs the same on the
merged commit" becomes what it tests now) and § From dev to a release (`test` "runs again, on Linux and macOS, what
changed since `test` last moved" becomes "runs no test `dev` passed", and push once `dev`'s run has ended, not only its
check); the comments heading `ci.yml` and `scripts/ci-scope.ts`.
