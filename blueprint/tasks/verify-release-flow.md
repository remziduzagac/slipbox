---
status: todo
assignee:
blocked_by: []
created: "2026-10-23"
---

# T10: The next release verifies D257 and D258

The next release is the first since #28 was fixed: its push to `main` and its site show whether the fix holds.

## Description

Release as `MAINTAINING.md` § Releasing says, with nothing bypassed, and watch the two steps #28 found broken:

- **The push of `test` to `main`** (D257): `main`'s ruleset takes it with the ruleset on, once `ci` run by hand on
  `test` passed and its `status` job posted `full` on the commit. If it's refused, the rule suite's message
  (`gh api repos/remziduzagac/slipbox/rulesets/rule-suites`) says why; the ruleset is never turned off for it.
- **The site, once the release is published** (D258): `pages.yml`'s run under the release has one job, `redeploy`,
  which starts a run by hand on `main`; that run's `deploy` passes its `served` step, and
  `https://remziduzagac.github.io/slipbox/stable` names the release.

## Acceptance criteria

- A Verified note under D257 (`decisions/process.md`) and one under D258 (`decisions/distribution.md`), each with the
  run or rule suite that shows it.
- If either fails: an issue, and a decision correcting the one that failed, before the release after.

## Out of scope

- Releasing for the sake of it: this waits for a release the work calls for.

## References

- Rests on: D257, D258; [research/github-behaviour.md](../research/github-behaviour.md); #28, #30.

## Log

- 2026-10-23: The preview of 71313f3 (run 39964133295), the first deployment to read its channels back, passed its
  `served` step at the first read; `redeploy` was skipped, as for any preview. That checks the read-back alone, not a
  release's run on `main`.
- 2026-10-24: T24 ran `pages.yml` by hand on `main`: 5fe758f, deployed before from `test`, `main` and `v0.5.0`, was
  served (run 40045492245); later, by hand twice in a row (40050527681, then 40050816202), the second served while the
  site served 5fe758f, as a release's run by hand finds it. D258's run by hand holds outside a release; the release's
  own run starting it, under D265's `redeploy`, is still to be seen here.
