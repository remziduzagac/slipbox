# Notes: a pull request's checks wait less

## The draft (2026-10-24)

- **Read:** issue #65 and its comment (the maintainer chose option b for item 3, to be recorded when it's worked);
  `.github/workflows/ci.yml`, `preview.yml`, `build.yml`; `scripts/ci-scope.ts`; `tests/distribution.test.ts`'
  tests of the scope and the workflow; design/repository.md § How a change lands, § CI; design/testing.md
  § Strategy; design/distribution.md § Previews; `MAINTAINING.md` § Merging a change, § From dev to a release,
  § Previews; D230, D239, D242, D251, D257.
- **Scope:** the main session, for the maintainer: items 5 and 7 only, before the next preview; the other items
  recorded here as tasks for later. Codex isn't used, the maintainer's call: a fresh Claude reviewer does its part
  (the design's critique, the second review). One review round and one test pass. Then, while the critique ran: one
  review pass, `/code-review` alone, its real findings fixed with their tests, the change's own tests run once, then
  handed over; no second reviewer and no further plan challenge.
- **Found:** a push is scoped by its commits since the event's `before` (`changedFiles`), and each of `test`'s and
  `terminal`'s jobs works it out again for itself. A pull request's run doesn't say which merge commit it tested
  (research.md), so a push can't know without a record. `test`'s ruleset takes only a commit whose `ci` passed, so its
  head is a safe start. `ci-scope.ts` returns everything for an empty diff; a push's empty range must test nothing.
- **Research:** GitHub's runs and artifacts, in research.md.
- **Drafted:** requirements.md, design.md, ideas.md; CIW-D1 to CIW-D4 proposed, not recorded.

## The design's critique (2026-10-24)

A fresh Claude reviewer read the draft against the code, Codex's part while it's off (the maintainer's call); nine
findings, read-only, with `gh api` and git:

1. With no pass, `test`'s head could be moved to a pass of the old scope before this one's first run passes, leaving
   the cancelled merges out; and "version 2 or more" would let a bump keep old passes: taken — a run counts only at the
   pushed commit's version, `test`'s head only when it's of it, else everything (which, for this change's merge, is
   what "from `test`'s head" gives: `71313f3..dev` changes the workflows and `package.json`).
2. CIW-D4's group by branch would put the full run, by hand on `test`, with `test`'s pushes, and a preview's push would
   cancel it: taken — a push's group is its branch, every other run's its own, and cancelling only for a pull request
   and a push.
3. Pull requests are merged before their runs end (`dev`'s live ruleset lets an admin bypass in a pull request, unlike
   the committed one): taken — a record counts only when its run is `completed` with `success`, with tests for one
   going and one that failed after writing it. The ruleset's drift is the maintainer's (research.md).
4. Any branch of this repository can write a record for another pull request's tree, and its own trivial run passes:
   taken — the record's run's head, merged onto the push's parent, must make the push's tree (`git merge-tree`); every
   record of the name is read, not the first. The pull request's head from the API was the other way, likely needing
   `pull-requests: read` (ideas.md).
5. A record certifies macOS only while pull requests run on macOS, which item 3 will change: taken — the record's name
   carries the version, and item 3's task must make it say which systems ran.
6. `lint` and `site` waiting on `changes` buys under a minute and delays every pull request's lint: taken as the
   recommendation; for the maintainer.
7. A push to `test` a second after `dev`'s `ci` check, before its run ends, finds no pass at it: taken — safe, it tests
   again; `MAINTAINING.md` says to push once the run has ended.
8. CIW-D4 on a day of merges every few minutes: no pass until they stop, so `test` can't move: taken, as its cost.
9. The token given to a pull request's run, which only uploads: taken — `GH_TOKEN` only on a push.

Its gaps — how "everything" and "nothing" travel to the jobs, what "nearest" means, hashes checked before git, the
upload's place and pin, failing towards testing more — are in design.md, and its tests in the acceptance criteria.


## Approval (2026-10-24)

- **Questions:** 1 a push's run cancelled by the next push to its branch; 2 `lint` and `site` skipped too on a push
  whose tree passed; 3 the design as it stands.
- 1: agreed as recommended, cancelled (CIW-D4).
- 2: agreed as recommended, they still run (CIW-D3).
- 3: approved; CIW-D1 to CIW-D4 recorded, the workstream active, its tasks written: CIW-T1 to CIW-T4 now, the issue's
  other items as CIW-T5 to CIW-T9, for later.
- **Said, not this change's:** `dev`'s live ruleset lets an admin bypass in a pull request, which the committed one
  doesn't (research.md § Rulesets); the pull request's body says "Part of #65", the issue's other items still open.

## The code's review (2026-10-24)

One pass, by one reviewer (`/code-review`): the maintainer's choice, with Codex not used; no second round. Eleven
findings:

1. An older push's run re-run joins the branch's group and cancels its newest run, leaving its head without the `ci`
   check `test` takes: fixed — a re-run (`run_attempt` past 1) is in a group of its own (CIW-D4), tested.
2. The API's calls and the fetch inside `changes`' five minutes could end the job, failing the run, instead of testing
   more: fixed — the record lookup has ninety seconds, the fetch what's left of them, tested with an origin that never
   answers.
3. The upload had no timeout of its own, in the job the tests wait on: fixed — a minute, `continue-on-error`, tested.
4. An element of the API's lists that isn't an object would throw, failing the run: fixed — passed over, tested for
   the runs and the records.
5. The health check reads each workflow's last finished run, now often a push's cancelled one, which would hide the
   failure before it: fixed — a cancelled run is passed over, tested.
6. The log said "no run of this scope has passed" when the runs couldn't be read: fixed — "which runs passed is
   unknown", tested.
7. The comment on `changes`' checkout still spoke of a push's commits since the branch's last head: fixed.
8. Reading the `ci` check's conclusion, not the run's, would close the second between them: not taken — the run's
   ends later, so a push to `test` in that second tests again, which is safe (CIW-D3's cost).
9. The range handed to `changedFiles` as a parameter, not `SCOPE_RANGE`: not taken — the variable is how `test` and
   `terminal` get it from `changes`, so one way in for every job.
10. `commit()` exported and used for `test`'s head in `ci-scope.ts`: taken. `changedFiles`' own git helper, which
    splits lines, stays.
11. The scope test's `before` argument, unused since a push no longer reads it: removed.

Each fix's test was undone once and caught (`tmp/` mutation log); the guard on the records' elements and the deadline
before a page each needed a test of their own first.
