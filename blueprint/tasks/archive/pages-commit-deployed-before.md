---
status: done
assignee: claude-7
blocked_by: []
related: [T10]
tracker: [gh:#7]
created: "2026-10-24"
---

# T24: A deployment of a commit Pages has deployed before is served

A Pages deployment is named by its run's commit, and one of a commit deployed before can be reported a success while
the site keeps the files it had. #7 saw it for a preview; D258 handled it for a release. Find what's left in today's
flow (D251), and close it.

## Description

`pages.yml` deploys with `actions/deploy-pages`, which names the deployment by `GITHUB_SHA` and has no input to change
it. #7: the preview `preview-202610141305-fdc971c`, of a commit `main`'s push had deployed 22 minutes before, was
"deployed" and never served; its `preview` channel lagged until another commit was deployed. Since then, D258 hands a
release's deployment to a run by hand on `main`, and every deployment reads its channels back and fails if they're not
served. What's left: whether a preview's deployment, in today's flow, can be of a commit deployed before, and whether
the deployments D258 relies on are served; then whatever fix that calls for.

## Acceptance criteria

- The cases where a deployment repeats a commit, in today's flow, each shown served, or made so, with the evidence
  here.
- A test holding `pages.yml` (and `preview.yml`) to whatever the fix is; one that fails without it.
- The design (design/distribution.md § Previews) and, where a choice is made, a decision, say what holds.

## Out of scope

- Verifying the next release's flow itself: T10.
- The site's cache (D258's eleven minutes).

## References

- Delivers: design/distribution.md § Previews (the Pages site, a release's deployment).
- Rests on: (GR-D14), (D251), (D258), (D265); [research/github-behaviour.md](../../research/github-behaviour.md)
  § Pages; issue #7.

## Log

- 2026-10-24: deploy-pages v5.0.1 (`368f825`, `pages.yml`'s pin), read: `src/internal/context.js` takes the build
  version from `GITHUB_SHA`; `deployment.js` posts `pages/deployments` with it as `pages_build_version`, then polls
  `pages/deployments/<id>` until `succeed`, the ID being that version. So a second deployment of a commit polls the
  first's ID. `gh api repos/remziduzagac/slipbox/pages/deployments/<5fe758f's SHA>` answers `{"status":"succeed"}`
  today (ran): why a repeat reports success within seconds.
- 2026-10-24: #7's fix, a version of one's own (the commit and the run's ID): the Pages API takes only a commit's SHA,
  answering 404 to a timestamp or `1.2.3` (community discussion 170184; #383's update of 2025-11-16; read). D258
  already turned it down. A dead end.
- 2026-10-24: The repository's deployments (`gh api …/deployments?environment=github-pages`, ran): seven since
  2026-10-22, every one a commit's first but 5fe758f's (0.5.0): from `test` by its preview (run 39842199771, a push,
  19:43), from `main` by its push (39860118310, 21:48), from `v0.5.0` by the release (39864294664, 22:21), each
  "Reported success!" five or six seconds after it was created (their logs, ran). The preview's site was built from
  `main` at a193318, `main`'s push's from 5fe758f, 70 files of docs and site apart: whether 21:48's was served isn't
  recorded anywhere now.
- 2026-10-24: Today's flow never makes a preview of a commit deployed before. `test` takes only fast-forwards
  (`MAINTAINING.md` § Previews, its ruleset), from `dev`; `main` takes `test`'s commit; so `test` never moves to a
  commit `main` had. `previewPlan` (`scripts/release.ts:159`) refuses a version released and a preview made already.
  #7's preview was the old flow's: a preview was made by `git push origin main:test` (GR-T15), so `test`'s commit was
  `main`'s, deployed by its push whenever the docs changed. Left: a preview's run re-run (the same branch, the same
  event).
- 2026-10-24: But #7 doesn't fit D258's premise. #383's reports find only a `release` run's repeat not served, and a
  `push` or `workflow_dispatch` run's served; #7's was a `push` run (`preview.yml` calling `pages.yml`, under a push to
  `test`), not served. What every repeat not served shares, there and here, is a ref other than the one that deployed
  the commit before (a tag; `test` after `main`), and every repeat served came from the branch that deployed it first
  (each repository's `main`). A rule by ref fits the evidence as well as one by event, and in today's flow it would
  matter twice: `main`'s push of a release's commit, deployed first by its preview from `test`, builds the preview's
  channels with the new docs, so its read-back passes whether or not it's served; and the release's run by hand on
  `main` would be another repeat from `main`, its read-back failing as 0.5.0's site did. Other rules fit too (repeats
  served only from Pages' source branch, `main`; or only from the default branch, `dev` here). The reports can't tell
  them apart.
- 2026-10-24: Codex's challenge of the cause skipped, Codex having stopped; a second reviewer does its part.
- 2026-10-24: The site's files carry the `last-modified` of the deployment serving them (`Fri, 23 Oct 2026 14:00:00
  GMT`, 71313f3's preview, for `stable`, `preview`, `install.sh` and `docs/`; ran, curl), so a deployment that
  changes nothing in the channels still shows whether it's served.
- 2026-10-24: The reviewer, challenging the cause: agrees a preview can't repeat a commit today beyond a re-run of its
  `deploy` (`test`'s ruleset: no deletion, fast-forwards only, `ci` required; `previewPlan` refusing a tag made; a
  re-run of every job stops at `plan`). The repeats that matter: `main`'s push of a release's commit (its paths filter
  sees the whole fast-forward, so practically every release), D258's run by hand on `main`, any run by hand (`main`'s
  head has been deployed three times between releases; a `v*` tag, which the `github-pages` environment still takes,
  repeats from a tag). Every repeat served in #383 came from a repository's default branch, which there was also the
  Pages source and, as far as reported, the branch that deployed the commit first; slipbox is the first setup where
  the three differ (first from `test`, source `main`, default `dev`). More against the event rule: davidrg's tag push
  in #383 (a `push` on a tag, not served). Rules still fitting: served only from the ref that deployed the commit first
  (predicts `main`'s push and D258's run unserved), only from the default branch (the same, and only a new commit
  helps), only from Pages' source branch (both served). #28 says "the site kept the preview's files" after 0.5.0's
  release: if seen after 21:48, `main`'s push from the source branch wasn't served, which rules out the source-branch
  rule too. Also: "Reported success!" five seconds after "Created deployment" is deploy-pages' first poll in every log,
  first deployments included, so it marks nothing; a re-run doesn't rescue a repeat (YDX's release re-run in #383). Its
  advice: ask how #28's was seen, run `pages.yml` by hand on `main` (5fe758f, the history the next release's commit
  will have) and on `test` (71313f3, deployed only from `test`) and read `last-modified` past the cache's ten minutes;
  whatever the rule, read back a marker that changes each run, not only the channels.
- 2026-10-24: Checked the reviewer's claims I rely on (ran): `pages/deployments/<390000c>`, a commit never deployed,
  answers `{"status":""}`, 71313f3's `succeed`, so a run can tell a repeat before it deploys; #28's body says what's
  quoted above; the Wayback Machine has no snapshot of the site from 2026-10-22 to 2026-10-24.
- 2026-10-24: Out of scope, for the maintainer: `main`'s ruleset needs a fast-forward and `full`, and `ci` posts
  `full` from a run by hand on any ref, so `dev` could reach `main` without `test` (the reviewer, not checked further).
- 2026-10-24: Asked the maintainer: how #28's "kept the preview's files" was seen isn't remembered; the experiment
  approved, `main` first.
- 2026-10-24: The experiment (ran; the site's headers read every minute for twelve): `pages.yml` by hand
  on `main`, run 40045492245, deployment 7291672244 of 5fe758f — a commit deployed from `test` by its preview, from
  `main` by its push, from `v0.5.0` by its release — created 00:32:56Z; the site's `stable`, `preview`, `install.sh`
  and `docs/` went from `last-modified` 2026-10-23 14:00:00 to 00:33:06 by the first read, a minute later, and stayed
  so for twelve minutes. Served. Then on `test`, run 40046571004, deployment 7291814017 of 71313f3, deployed before
  only from `test` by its preview's push: created 00:46:07Z, served at 00:46:17, the same twelve minutes. Both runs
  passed. So a run by hand is served whatever the ref and the commit's history: D258's run on `main` holds, in the
  history the next release's commit will have. The rules by ref (first ref, the default branch, Pages' source) are out.
- 2026-10-24: What fits every case now is the event: a repeat is served under `workflow_dispatch` (here twice; #383's
  dispatches; felixgeelhaar's `workflow_call` from a dispatch), and not under `release` (0.5.0; #383's), `push` (#7, a
  push to `test`; davidrg's tag push) or `schedule` (TheBigRoomXXL's cron). No report has a `push` repeat served: a
  branch's pushes are new commits (felixgeelhaar's table says so). So research/github-behaviour.md's "a `push` … run's
  deployment of the same commit is [served]" has no source, and #7 contradicts it. In today's flow that leaves: `main`'s
  push of a release's commit, always a repeat (its preview deployed it; `main` takes only `test`'s commits), reported a
  success and not served, its read-back passing on the preview's channels; and a preview's `deploy` re-run, a repeat
  under `push`, which reads back its new channel and fails, the re-run not helping. A preview itself is a commit's first
  deployment, served.
- 2026-10-24: Pages tells a repeat before deploying: `pages/deployments/<sha>` answers `{"status":""}` for a commit
  never deployed and `succeed` for one deployed (ran, with a token); anonymously, 404 (ran), so a job
  asking it needs the run's token with `pages: read`.
- 2026-10-24: Codex's answer to the same questions. Agrees with the reviewer, and adds: deploy-pages takes the ID the
  API returns before falling back to the version (here the API returns the SHA: "ID: <sha>" in every log); a run by hand
  on `test` before a preview publishes deploys its commit first, so the preview's own deployment is then a repeat;
  `main`'s push runs only when its paths filter matches, and without it D258's run is `main`'s first repeat; a marker
  that changes each run, read back with the channels, and a test that a stale marker fails though the channels match.
  Its next step, a scratch repository's experiment, is answered by the one above for what matters here (a run by hand
  served, from `main` and from `test`).
- 2026-10-24: Planned with Codex (every deployment a run by hand on `main`, a marker read back). Its critique: hand
  off everything rather than check first (a check adds an undocumented answer and a race, and a preview isn't always
  first); a hand-off that waits for the run it starts deadlocks today, both in the `pages`
  concurrency group, and a newer pending run replaces an older one, failing whoever waits on it; "on `main`" must be in
  the condition, or a run by hand on `test` or a `v*` tag deploys there; until the fix is on `main`, a run handed off
  runs `main`'s old workflow (none matters before the next release: a preview runs `test`'s, a release `main`'s new
  one); the marker an output of `site`, so a re-run of `deploy` alone reads back the artifact's own; curl bounded; the
  tests running the scripts, not reading their text. And the experiment shows a run by hand served in the two histories
  tried, not in every one.
- 2026-10-24: Read: the dispatch API answers with the run's `workflow_run_id` (GitHub's REST docs); the health issue
  reports a workflow whose last run on `dev` or `main` failed (`scripts/health.ts:441`, `BRANCHES`).
- 2026-10-24: Asked the maintainer: a preview keeps deploying in its own run; every other run but one by hand on `main`
  hands off to a run by hand on `main`; every deployment reads back a marker of its own (D265, amending D258). The
  hand-off doesn't wait for the run it starts (Codex's deadlock). Not chosen: every deployment by hand on `main`,
  previews too.
- 2026-10-24: Built. `pages.yml`: `redeploy` runs unless the run is a preview's call (a push on `test`, which only
  `preview.yml`'s call can be) or by hand on `main`, never in a fork; `site` runs on exactly those two; a `marker` step
  writes `_site/deployment`, `<run ID>.<attempt>`, an output of `site`, so a re-run of `deploy` alone reads back the
  artifact's own; `served` fails at once with no marker built, reads the marker with the channels, and bounds curl (5 s
  to connect, 10 in all). `preview.yml`'s comments. The record: D265 with a note under D258, design/distribution.md
  § Previews, design/repository.md § CI, research/github-behaviour.md (the `push` claim corrected, the experiment),
  `MAINTAINING.md` (§ Releasing step 11; § Previews: a re-run of a preview's `deploy` doesn't help), a line in T10.
- 2026-10-24: Tests, `tests/release.test.ts`: the two jobs' `if`s evaluated (a small evaluator of GitHub's
  expressions, in the test) for a preview's call, by hand on `main`, `main`'s push, a release, by hand on `test` and on
  a tag, each in a fork too; the `marker` step run in a scratch folder; the `served` script run with `bash -eo
  pipefail`, `curl` and `sleep` stubbed: served at once; #7's case, the channels as served already and the marker the
  deployment before's, failing after 66 tries; no marker on the site; a channel off; served after one wait; a channel
  with no release; no marker built. All 34 of the file's pass. Undoing the fix once: with `dev`'s `pages.yml` the three
  tests fail; with only the marker's comparison taken out of `served`, #7's case passes at once and the test fails;
  with only `site`'s old `if`, `main`'s push deploys in its own run and the test fails. zizmor and actionlint clean.
- 2026-10-24: No terminal check: nothing in slipbox changes (no command, key or screen); the workflows are tested
  above, and the live try was the experiment.
- 2026-10-24: Until the fix reaches `main`, a run handed off runs `main`'s `pages.yml`, the old one. Nothing hands off
  before then but a release's run, as D258 does already: a preview runs `test`'s `pages.yml`, and `main`'s push, the
  release's tag and the run by hand they start all run the release's commit's, the new one.
- 2026-10-24: Review, round 1. Codex: (1) the Log named private files and how the session went: removed, the findings
  kept; (2) `served` counted 66 tries, not the time, so a site answering in ten seconds a request could take it past
  the job's 25 minutes: now a deadline by the clock, and a test whose `date`, `sleep` and `curl` share a clock file, a
  slow site giving up in time (the count put back: 1,330 s, the test failing); (3) the research had cron runs as a
  `push` report, and the files' ETags the same: corrected. All three verified, all fixed.
- 2026-10-24: Review, round 1, `/code-review`, nine findings, each checked against the code. Taken: the Log's line
  over 120 columns; D265's Cost had a run by hand on `test` make a preview a repeat, which D265 hands to `main` now;
  the slow-site bound fits one request a round, not three (a channel off): the worst case is the deadline, a sleep, a
  round and the message's request, 710 s with curl at ten; `settings.json`'s and `MAINTAINING.md`'s lines on which
  refs deploy, stale since D258 (a `v*` tag deploys nothing); the deploy job's timeout comment. For the maintainer:
  both experiments deployed a commit the site wasn't serving, so a rule "a repeat of the commit served isn't applied"
  fits slipbox's own evidence too (#383's dispatches against it are second-hand), and under it the next release's runs
  by hand fail, D258's as well as D265's: two runs by hand on `main` in a row would tell; and `main`'s push handed off
  puts a release's docs on the site at step 7, before it's published (D258's push repeat went unserved, so they went
  live with the release), and doubles the runs in the `pages` group, where a pending one is replaced by a newer.
  Not taken: writing the deploy condition once (`site` after `redeploy`, when it's skipped): the test's table holds
  the two `if`s complementary, and `needs` with `always()` brings cancellation's own rules; T24 a workstream, since it
  changes the design: D223 takes a small change as an issue and one pull request with its design file, as T12 did.
- 2026-10-24: Asked the maintainer: the two runs by hand approved; `main`'s push trigger dropped (D265, amending
  GR-D14 too).
- 2026-10-24: The second experiment (ran): `pages.yml` by hand on `main` twice in a row. Run 40050527681 deployed
  5fe758f while the site served 71313f3: served at 01:36:26. Run 40050816202 deployed 5fe758f again at 01:40:21, the
  site serving it: the files' `last-modified` went to 01:40:28 and stayed for the twelve minutes read. Served: a run by
  hand repeating the commit the site serves is applied, so the review's rule is out, and a release's run by hand, the
  site serving its preview's deployment of the same commit, is the case seen.
- 2026-10-24: Round 1's fixes, `/code-review`'s: `pages.yml` has no `push` trigger; `redeploy`'s comment, the header's
  and the deploy job's timeout comment say so and what's read back; the routing test's table keeps a push to `main`
  (no trigger starts one; one that did would hand off), and the triggers' test has none; the slow site's test runs a
  stale marker, no marker and a channel off, each within the deadline, a wait, a round and the message's request (the
  plain no-marker and channel-off cases folded into it: the test took 13 s on a loaded machine, 5 s now); D265's Cost
  without the run by hand on `test`; D265's Why with the four runs; notes under D258 and GR-D14; design § Previews,
  `MAINTAINING.md` (step 11; § Settings: only `main` and `test` deploy), `settings.json`'s line on the environment's
  refs (its words, not the setting). The concurrency finding goes with `main`'s push: a release's hand-off is the one
  left, as under D258.
- 2026-10-24: Review, round 2. Codex: the design's and the pull request's "a release whose draft is deleted never shows
  its docs" claims more than the code does (a preview builds the docs from `main` too): narrowed; D265 and the pull
  request had 0.5.0's push not served, which isn't recorded: said so. Both verified, both fixed.
- 2026-10-24: Review, round 2, `/code-review`, eight findings, each checked. Taken: a re-run of `deploy` alone deploys
  its run's artifact again, which a run by hand serves, putting back an older site, and the read-back passes on its own
  marker: `deploy`'s first step now refuses one (the marker built by an earlier attempt than the run's) and names the
  run by hand on `main` to make instead, with a test running the step (an attempt's own marker, a re-run of every job, a
  re-run of `deploy` alone, no marker), which fails with the comparison taken out; the test no longer asserted that
  `deploy` has a deploy-pages step at all; design/repository.md's table still had `pages.yml` run on `main`'s docs;
  `holds` trimmed the `if`, hiding a `${{ }}` with a newline after it, which GitHub takes as true (turning `redeploy`'s
  `>-` into `>` now fails the routing test); "#7" in a workflow comment read as deploy-pages'. Not taken: narrowing
  `github-pages` to `main` and `test` (a setting, the maintainer's; the pull request says so); numbering D265 (a root
  decision made on a branch is numbered when it's merged); the deploy condition written once (as in round 1).
- 2026-10-24: Done, every acceptance criterion met: the repeats in today's flow shown served or made so (a preview's,
  its commit's first; a run by hand, four times), the tests above holding `pages.yml` to it, the design and D265 saying
  so. Moved to the archive with the pull request; its merge is the maintainer's acceptance.
- 2026-10-24: CI on the pull request's first push: `terminal (ubuntu-24.04-arm)` failed one check, `links-and-files:
  view: a worktree kept outside the view chosen …` ("docs/ under each of the two"), which passed on `ubuntu-24.04`;
  nothing in slipbox changes here (a change to `.github/` runs every check), so not this change's. The test jobs run
  into `dev`'s hanging `tui.test.ts` check since #42, fixed elsewhere.
- 2026-10-24: Review, round 3: Codex's part skipped, Codex at its usage limit; a second reviewer does it, beside
  `/code-review`.
- 2026-10-24: Review, round 3: `/code-review` and the second reviewer, each finding checked. Taken: re-running a
  preview's `pages / site` re-runs `deploy` too, deploying its commit again under a push, not served: the read-back's
  failure now says so and names the run by hand on `main`, and `MAINTAINING.md` § Previews too; a run by hand on any
  ref but `main` hands off, not only `test` or a tag: D265, the design and the comment say "another ref"; `holds` read
  `true`, `false` and `null` as names and gave `&&`/`||` booleans, not GitHub's operands: literals, numbers and
  operands now, checked on forms like `… && 'full' || 'ci'`; nothing held curl to its bounds (the stub took the URL
  alone): each request's arguments are checked now, and taking the bounds out fails the test; GitHub runs a step with
  no `shell` as `bash -e`, not `-eo pipefail`: `runStep` too; D265 and the pull request had a read-back pass on
  `main`'s push for 0.5.0, which had none (5fe758f's `pages.yml` reads nothing back): said as what D258's would do;
  the design's "eleven minutes at most" is that and a last round; T10's Log had the runs out of order; the
  `deploy` job's comment on `v*` tags; a comment line of 130 columns. Not taken: a preview that repeats a commit after
  `dev` reached `main` without `test` (the ruleset gap left to the maintainer; its read-back fails, loudly); a loop
  guard for a tag named `main` (nothing makes one, and the `pages` group runs one at a time); `served`'s own check
  for no marker, now behind the guard's, kept so the read-back can't pass on an empty one by itself; the session's
  notes on Codex's skips, which the maintainer asked for; and, again, `v*` in the environment, D265's number, the
  condition written twice.
- 2026-10-24: Review, round 4: Codex's part skipped again, Codex at its usage limit; a second reviewer does it.
- 2026-10-24: Review, round 4. The second reviewer: no defect in the workflow, the scripts or the tests; the pull
  request had a release's hand-off run 5fe758f's `pages.yml`, but step 7 has moved `main` to the release by then:
  fixed, with "within ten seconds" for the runs' times. `/code-review`, seven, each checked. Taken: "one deployment at
  a time, never cancelled" (older text, in the paragraph rewritten): one waiting gives way to a newer, so said there
  and in design/repository.md; a run handing off said nothing of where the deployment is: its log says so now, with a
  link to the runs on `main`, and the step is run in a test with `gh` stubbed; the read-back's failure gave the
  preview's re-run advice to a run by hand on `main` too: only under a push now, tested both ways (the condition taken
  out, the test fails); the guard's message, and the docs, said the re-run's site was older than any since, which
  holds only if one was deployed since: "perhaps older", and the run by hand builds it afresh; `holds` compared mixed
  types as strings and names by case: GitHub's loose equality (numbers for mixed types) and names ignoring case now,
  checked. Not taken: D265's number, and `v*` in `settings.json`'s expected environment (the setting is the
  maintainer's), as before.
- 2026-10-24: Review, round 5: Codex's part skipped, Codex at its usage limit; a second reviewer does it.
- 2026-10-24: Review, round 5, `/code-review` and the second reviewer (each resumed after a usage limit), each finding
  checked: no defect in the workflows or the tests. Taken: the hand-off's log said the site "is deployed" by the run
  it started, which it can't know: it says that run does it and has the result; `holds` gave a missing name
  `undefined`, not GitHub's `null`, and an object a number: fixed, checked; a failed read-back printed only the marker
  served, which reads as a contradiction when only a channel is off: it prints each file's built and served lines now,
  tested; the re-run hint said a re-run of the preview's run deploys again, which holds only for `pages / site`: says
  so, and that `deploy` alone is refused; `pages.yml`'s header and `MAINTAINING.md` step 11 had the release's docs live
  at publishing, unless a preview came first; the pull request's "older than any since" and "as they already did in
  practice", and the guard test's title; the research's older line on 0.5.0's "preview's files" (neither the preview's
  nor `main`'s push's had `stable`, so which isn't recorded); 40050527681's creation time (01:36:19). Taken as
  recommended while the maintainer was away: the re-run guard kept, though a preview's run whose deployment failed
  before anything was deployed can't then go green (its `deploy` alone refused, a whole re-run stopped at `plan`): a
  run by hand on `main` fixes the site, and a re-run that might put an older site back would pass; written in D265's
  Cost and `MAINTAINING.md` § Previews. Not taken: steps run with `bash --noprofile --norc -eo pipefail` in the tests,
  since GitHub runs a step with no `shell` as `bash -e {0}` (its own log, run 40050816202's `site`: `shell:
  /usr/bin/bash -e {0}`); the release's run waiting for the run it starts (D265's Not chosen: it deadlocks); and, as
  before, `served`'s own empty-marker check, the condition written twice, `v*` in the environment.
- 2026-10-24: Review, round 6: Codex's part skipped, Codex stopped at a menu in its pane after its usage limit; a second
  reviewer does it.
- 2026-10-24: Review, round 6, both reviewers: no defect in the workflows or the tests. Taken: D265's Cost and the pull
  request had a preview's run, its deployment failed before anything was deployed, never go green, but re-running its
  `pages / site` re-runs `deploy` with a fresh marker: corrected; the slow-site bound and the timeout comment, since the
  failure message reads three files: 730 s now; the pull request's twelve minutes, which 40050527681 didn't have. Not
  taken: the hand-off not waiting (D265's Not chosen), the guard refusing a needless re-run (taken as recommended,
  above), `refs/heads/Main` matching ignoring case (no such branch; the environment refuses it), `runStep`'s 20 s
  against a 1.3 s file, and as before `v*`, D265's number, `served`'s own check, the condition written twice.
- 2026-10-24: Rebased on `origin/dev` (#59, the hanging test fixed; #54) and pushed. Review, round 7: Codex's part
  skipped, Codex still stopped at a menu in its pane; a second reviewer does it.
- 2026-10-24: Review, round 7, both reviewers, each finding checked. Taken: a re-run that builds the site again (`pages
  / site`, or every job of a run by hand) uploads a second `github-pages` artifact into the run, and deploy-pages takes
  the one artifact of its name in the whole run (`listArtifacts()` and a filter by name, refusing two; read, its source
  at `368f825`): the artifact is named by the attempt now, `github-pages-<attempt>`, upload and deploy alike, tested, so
  the re-run D265's Cost names works; after the deadline the report read the site again and could print a site served
  while failing: one last read of all three now passes if it serves them, tested with the swap after the last round
  (the check taken out, the test fails); the job's timeout is tested against deploy-pages' ten minutes and the
  read-back's worst case; `MAINTAINING.md` step 11 named `stable` alone; `holds` took `constructor` for a literal
  (`Object.hasOwn` now); a routing assertion the table already makes; the pull request's re-run note lacked D265's
  "before anything was deployed"; the research's Gap said D265 makes no `push` repeat, but a preview's `pages / site`
  re-run after its deployment is one, from the ref that deployed it first, never tried: the Gap, the failure message
  and `MAINTAINING.md` say "may not serve". Not taken, as before: D265's number, `v*`, the Log's notes on Codex's
  skips (the maintainer's), `served`'s own check, the condition written twice.
- 2026-10-24: Review, round 8: Codex's part skipped, Codex still stopped at a menu in its pane; a second reviewer does
  it.
- 2026-10-24: Review, round 8, the last (the maintainer's rule: at most three rounds, the one in hand the last when
  past them; smaller findings recorded here, not taken into the pull request). Both reviewers: no defect in how the
  workflows run, no test passing without its part. Recorded, for a follow-up:
  - Since the artifact is named by the attempt, a re-run of `deploy` alone finds no artifact of its attempt's name
    (deploy-pages: "No artifacts named …") and deploys nothing, guard or not: the guard only says why first. So the
    reason D265, the design, `MAINTAINING.md`, the guard's comment and its test's title give ("it would deploy the run's
    site again, perhaps older") no longer describes what the code would do without it, and the choice taken as
    recommended in round 5 is settled by the naming. Either say so in those places, or have `deploy` take the artifact
    name from `site`'s output, which would make the guard the one refusing.
  - A preview's run re-run after the release's hand-off (or a run by hand on `main`) deployed its commit makes a `push`
    repeat, unserved: the site is right, the preview's run stays red, its read-back saying so.
  - The hand-off's log says the run it started has the result, but a newer run entering the `pages` group cancels a
    waiting one; the newer run deploys the site then.
  - `gh workflow run pages.yml --ref v0.5.0` runs that tag's older `pages.yml`, which deploys under a run by hand, and
    the `github-pages` environment still takes `v*` tags: one more reason for the maintainer to narrow it to `main` and
    `test` (and `settings.json`'s expectation with it). `MAINTAINING.md` § Settings still calls `main`, `test` and
    `v*` the refs `pages.yml` runs from, where it runs by hand from any ref now.
  - Cleanups: the read-back's comparison written twice (the loop and the last read); and, as before, `served`'s own
    empty-marker check, the deploy condition written twice.
