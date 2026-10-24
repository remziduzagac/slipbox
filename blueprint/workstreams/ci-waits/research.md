---
status: current
created: "2026-10-24"
---

# Research: what GitHub says of a run

What a push's run can learn, from GitHub's API and its own checkout, about the runs before it: which passed, on which
commit, and what a pull request's run tested. Read with `gh api` against `remziduzagac/slipbox` on 2026-10-24, and from
the repository's own workflows.

## Summary

- **A push's runs that passed can be listed in one call,** newest first, each with its commit (*ran*).
- **A pull request's run doesn't say which merge commit it tested:** its `head_sha` is the branch's head, and its
  `pull_requests` is empty once the pull request is merged (*ran*). So a push can't tell from the runs alone whether a
  pull request's run tested the squash's tree; the run has to record it.
- **An artifact can carry that record:** artifacts are listed by name across the repository, each naming its run, the
  run's commit and the repository its head came from (*ran*); uploading one needs no grant (*read*).
- **`test`'s ruleset takes only a commit whose `ci` passed** (*read*), and nobody bypasses it (*ran*), so `test`'s
  head is always a commit whose run passed.
- **Pull requests are merged before their runs end:** `dev`'s live ruleset lets an admin bypass it in a pull request,
  though the committed one says nobody does (*ran*). So a record is written before its run has passed, and may never.

## Runs

- `GET /repos/{repo}/actions/workflows/ci.yml/runs?event=push&status=success&per_page=3`: 25 in all, newest first,
  each with `head_sha`, `head_branch` (`dev`), `event`, `conclusion` and `run_attempt` (one that passed on its second
  attempt is listed: `b0a508d`, attempt 2) (*ran*).
- `…/runs?event=pull_request&status=success&per_page=1`: `head_sha` `9468f1e…`, the head of `fix/issue-68`, and
  `head_commit` the same commit and its tree; `pull_requests` `[]` (the pull request, #70, is merged);
  `head_repository` and `repository` both `remziduzagac/slipbox`; `path` `.github/workflows/ci.yml` (*ran*). The
  merge commit the run checked out is in neither.
- `gh run list --workflow ci.yml --branch dev --event push`: of the eight newest runs on `dev`, five were cancelled,
  one failed, one passed and one was going (2026-10-24, 15:50 UTC) (*ran*): the merges whose runs were cancelled
  (`09b8e16`, `1495738`, `48153d0`, `600ce18`, `2b18f37`) were tested on `dev` only as far as the next run's commits
  since its `before` reached them.

## Artifacts

- `GET /repos/{repo}/actions/artifacts?per_page=1`: each artifact has `name`, `expired`, `expires_at` and
  `workflow_run`: `id`, `repository_id`, `head_repository_id`, `head_branch`, `head_sha` (*ran*). The endpoint takes
  `name` to list those of one name (*memory*: GitHub's REST docs for "List artifacts for a repository").
- The repository keeps artifacts at most 90 days (`…/actions/permissions/artifact-and-log-retention`) (*ran*); an
  upload may ask for fewer (`retention-days`) (*memory*).
- `build.yml`'s `build` job uploads its packs with `actions/upload-artifact` (pinned `cf430e0…`, v7.0.2) and grants
  itself `contents: read` alone (*read*): an upload needs no grant. Listing runs and artifacts needs `actions: read`
  (*memory*: the REST docs' fine-grained permission for those endpoints).

## Rulesets

- `.github/upkeep/rulesets/test.json`: `required_status_checks` `ci` from integration 15368 (GitHub Actions), not
  strict; `non_fast_forward` and `deletion` (*read*). GitHub's rule for a pushed commit: the check must have passed on
  it before the push (*memory*; MAINTAINING.md § Previews says the same: "push after it, never before").
- `GET /repos/{repo}/rulesets/{id}` for each: `test` and `main` have no bypass actors; `dev` has one, the admin role
  (`RepositoryRole` 5) in pull requests (`bypass_mode: pull_request`), which `.github/upkeep/rulesets/dev.json`
  doesn't have (`bypass_actors: []`) (*ran*, 2026-10-24).
- #71 was merged at 15:14:24 while its run (`40104719246`, started 14:56:28) was still going; it ended at 15:20:40,
  `failure` (*ran*). A design reviewer found five more merged a minute or two after their last run started, each of
  those runs failing later (*a reviewer's reading of the runs*, not checked again).
- `GET /repos/{repo}/commits/42e879d/pulls` names #72, head `0886ddd` (*ran*, with the maintainer's token; which grant
  a workflow's token needs for it wasn't checked).

## Gaps

- Whether GitHub ever makes a pull request's merge commit against an older base than the branch's at the time of the
  event wasn't looked for: the record names the base the run actually used, so it doesn't matter.
- Whether a merge commit's tree and the squash's are always the same when the base is: they're both GitHub's merge of
  the same two commits; the record's tree is compared, never assumed.
- Whether `git merge-tree --write-tree` always makes the tree GitHub's squash makes: where it doesn't, the record isn't
  taken, and the push tests more.
- A fork's run's `head_repository_id`: no fork has opened a pull request. The design no longer depends on it.

## Sources

- GitHub's REST API, read with `gh api` on 2026-10-24: workflow runs, artifacts, the artifact retention setting.
- The repository: `.github/workflows/ci.yml`, `build.yml`, `.github/upkeep/rulesets/test.json`, `MAINTAINING.md`.
