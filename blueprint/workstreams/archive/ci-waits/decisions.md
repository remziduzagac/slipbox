# Decisions: a pull request's checks wait less

## CIW-D1: A push tests what changed since the last run that passed (2026-10-24)

**Decision:** A push to `dev` or `test` tests a range: from the nearest commit, back from the one pushed, whose push
run of `ci` passed under the same `SCOPE_VERSION` (`scripts/ci-scope.ts`, 2 with this change), to the one pushed;
with none, from `test`'s head before the push when it's of that version, else everything. CI's `changes` job reads the
runs that passed from GitHub's API (`actions: read`, its token only on a push) and hands the range to the `test` and
`terminal` jobs, which no longer work it out from the event's `before`. The range's files go through D239's rules
unchanged; a range with nothing in it skips the tests and the terminal checks. Whatever can't be read tests more, never
less. Amends D239 and D251 (a push "runs what its commits reach"). Detail: design.md § What a push tests.

**Why:** The maintainer's, issue #65's item 5: on 2026-10-24 merges landed close together, the older runs were
cancelled for the newest, and their changes never ran on `dev`, macOS included (research.md § Runs). From the last
pass, a run cancelled or failed leaves its commits to the next, so a run on `dev` that passed means every commit up to
it did. A pass of another version tested something else, so a version's first run tests everything: for this change's
merge, the same as "from `test`'s head", the start the maintainer asked for, which is before every cancelled merge.

**Cost:** A push's run depends on GitHub's API to test less; without it, it tests from `test`'s head, or everything.
`changes` holds `actions: read`, which a pull request's code in it could use but isn't given.

**Not chosen:** from `before`, as before; a ref moved by each pass (`contents: write`); `test`'s head as the start
whatever its version, which can move past the cancelled merges; a start pinned in the code (ideas.md § Where a push's
range starts).

## CIW-D2: A merge doesn't test again the tree its pull request's run passed (2026-10-24)

**Decision:** A pull request's run records the tree it tests and its base, in an artifact named
`ci-tested-v<version>-<base>-<tree>`, written by `changes` before the tests, kept seven days, never failing the run. A
push whose range doesn't start at its commit takes a record of its parent and its tree when the record's run is a pull
request's run of `ci.yml` that completed with `success`, and the run's head, merged onto the push's parent (`git
merge-tree`), makes the push's tree; its range then ends at its parent, and is empty when its parent passed. Detail:
design.md § What a push tests.

**Why:** The maintainer's, item 5: a squash of a pull request up to date with `dev` is the tree its own run just
tested, on Linux and macOS, so its push ran the same jobs again. A pull request's run doesn't say which merge commit it
tested (research.md § Runs), so the run records it. Pull requests are merged before their runs end (research.md
§ Rulesets), so only a run that passed counts. The merge-tree check ties the record to the change that was merged, so
no other branch's run can write one that skips a merge's tests, and needs no grant.

**Cost:** One artifact per pull request's run, and a fetch of its head on each push that looks. It certifies the
systems pull requests run on, today Linux and macOS: item 3's task must make it say which, and raise the version. A
merge whose pull request's run hadn't passed when it merged gains nothing.

**Not chosen:** the merge commit in the run's title; a commit status (`statuses: write`); the pull request's head from
the API (`pull-requests: read`); only this repository's runs trusted (ideas.md § What a pull request's run tested,
§ A pull request's record bound to its merge).

## CIW-D3: Moving dev to test tests nothing dev passed (2026-10-24)

**Decision:** A push to `test` is scoped by CIW-D1 and CIW-D2 like a push to `dev`: its commit's `dev` run passed, so
its range is empty, the tests and the terminal checks are skipped, and `ci` passes; `lint` and `site`, under a minute
on Linux, still run. `preview.yml` builds and publishes as before; the full run by hand still runs everything.

**Why:** The maintainer's, item 7, before the next preview: `test` ran again, on Linux and macOS, what `dev` had just
passed. Keeping `lint` and `site` is the maintainer's choice, 2026-10-24: skipping them would make every pull request's
wait on `changes` to save under a minute.

**Cost:** A commit pushed to `test` the second between `dev`'s `ci` check and its run's end is tested again.

## CIW-D4: A push's run gives way to the next push to its branch (2026-10-24)

**Decision:** A push's run still going when its branch is pushed again is cancelled, as a pull request's is: `ci`'s
concurrency group is the pull request's number, else the branch for a push, else the run's own, cancelling for a pull
request and a push. A push's run re-run, a run by hand, the full run among them, and a merge group's are in groups of
their own, never cancelled nor replaced. The weekly health check passes over a cancelled run for the one before it.
Amends GR-D9's "a pull request's superseded run cancelled" and design/repository.md § CI's "every other run … finishes".

**Why:** The maintainer's choice, 2026-10-24. With CIW-D1 a cancelled run's commits are the next run's, so cancelling
loses no cover, and a burst of merges holds one run's macOS runners, not one per merge. A re-run in the branch's group
would cancel its newest run, leaving its head with no `ci` check for `test` to take; and a cancelled run, last on
`dev`, would hide from the health check the failure before it.

**Cost:** On a day of merges every few minutes, with a run taking forty, no run on `dev` passes until the merging stops,
and `test` can't move until then.

**Not chosen:** every push's run finishing, as before.
