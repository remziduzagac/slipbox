---
status: current
created: "2026-10-23"
---

# Research: what GitHub does that the release flow and the upkeep rely on

What releasing 0.5.0 (#28), the fix after it (#30) and the example projects' Dependabot alerts showed about GitHub's
rulesets, Pages and Dependabot, read and run on 2026-10-22 and 2026-10-23; and, for #7, Pages again on 2026-10-24.
Each claim is marked with its provenance, as the blueprint's README says.

## Summary

- **A ruleset counts no check from a run started by hand:** a `workflow_dispatch` run's checks don't satisfy a
  required status check, even passed; the rule is about checks alone, not commit statuses. Informed D257.
- **A Pages deployment of a commit deployed before is reported a success and not served under a `release` or a `push`
  event;** a `workflow_dispatch` run's is, here from `main` and from `test`, whatever deployed the commit before, the
  commit the site serves included. Informed D258 and D?1. Until 2026-10-24 this line had a `push` repeat served too,
  which no report showed, and #7 contradicts.
- **The site keeps a file for ten minutes, whatever the query string,** so a deployment can be read back for certain
  only after that. Informed D258's eleven minutes.
- **`dependabot.yml` doesn't keep Dependabot's alerts off a folder;** a repository's auto-triage rule can dismiss them
  by manifest. The example projects' alerts were dismissed by hand ([notes](../notes.md), 2026-10-23).

## Rulesets and checks from a run by hand

- GitHub's "Troubleshooting required status checks": for checks created by workflow jobs to be evaluated, the run must
  be triggered by `push`, `pull_request`, `pull_request_review`, `pull_request_target`, `deployment` or
  `deployment_status`; a `workflow_dispatch` run's checks, "Even if the checks pass for the head commit, … do not
  satisfy a required status check in a branch ruleset". "This restriction applies only to checks created by workflow
  jobs, not to checks created by an external GitHub App." (*read*, 2026-10-23)
- The same page: "If a check and a commit status have the same name, both must pass when that name is required."
  (*read*). Under D257 the full run's commit gets both, named `full`, the check and then the status passing.
- 0.5.0's push of `test` to `main` was refused: its rule suite, 4671786583, said `Required status check "full" is
  expected`, though the commit's `full` check had passed (*ran*, the rule-suite API, 2026-10-22).
- `main`'s ruleset takes `full` from GitHub Actions alone, integration 15368 (*read*,
  `.github/upkeep/rulesets/main.json`). That a status posted with a run's own token is GitHub Actions' is expected,
  not seen yet (*memory*): D257's Verify, [T10](../tasks/verify-release-flow.md).

## Pages

- actions/deploy-pages#383, open since 2024-12-21: deploy-pages names a deployment by the run's commit
  (`pages_build_version`), and a deployment under a `release` event of a commit deployed before is reported a success
  while the site keeps the earlier files. Reports from several repositories; one ran `push`, `release` and
  `workflow_dispatch` in turn on one commit, and only the `release` run's deployment wasn't served. A version of one's
  own was answered 404 by the Pages API, in the same reports (*read*, the issue's comments, 2026-10-22); a timestamp
  and `1.2.3` alike, in community discussion 170184 (*read*, 2026-10-24).
- In those reports the `push` run on the commit was its first deployment: a branch's pushes are new commits
  (felixgeelhaar's table: `push`, "no — new commit each time"). No report has a `push` repeat served; one has one
  not served, a tag's push (davidrg). Another has `schedule` runs not updating the site, with too little detail to say
  what deployed their commit before (TheBigRoomXXL) (*read*, 2026-10-24). Every `workflow_dispatch` repeat reported
  was served, a `workflow_call` from one too.
- #7, 2026-10-14, before D251: a preview, made by pushing `main`'s commit to `test`, deployed it 22 minutes after
  `main`'s push had; under a `push` (`preview.yml` calls `pages.yml`, which runs under its caller's event), reported a
  success, not served: the site's `preview` kept the `last-modified` of `main`'s deployment (*read*, the issue).
- deploy-pages v5.0.1 polls `pages/deployments/<id>`, the ID the API returns, which is the commit's SHA (every log here
  says "ID: <sha>"), so a repeat's first poll can answer the earlier deployment's `succeed`; "Reported success!" comes
  five seconds after "Created deployment" in every log, first deployments too: deploy-pages' first poll (*read*, its
  source at `368f825`; *ran*, five of slipbox's deploy logs). That endpoint answers `{"status":""}` for a commit never
  deployed and `succeed` for one deployed, and 404 without a token (*ran*, 2026-10-24).
- 0.5.0's commit, 5fe758f, was deployed from `test` (its preview, a `push`), from `main` (its push) and from `v0.5.0`
  (its release); every other deployment of the site is a commit's first (*ran*, the deployments API, 2026-10-24).
  Whether `main`'s push was served isn't recorded: its channels were the preview's.
- **A run by hand, served** (*ran*, 2026-10-24, with the maintainer's approval): `pages.yml` by hand on `main`, run
  40045492245, redeployed 5fe758f, and the site's `stable`, `preview`, `install.sh` and `docs/` went from
  `last-modified` 2026-10-23 14:00:00 to 00:33:06, ten seconds after the deployment was created, for the twelve
  minutes read; by hand on `test`, run 40046571004, redeployed 71313f3, deployed before from `test` alone: served ten
  seconds after, the same. So not a rule by ref: one by the first ref to deploy the commit predicted the first
  unserved, one by Pages' source branch (`main`) the second, one by the default branch (`dev`) both.
- **And repeating the commit served:** both of those deployed a commit the site wasn't serving, so they left open a
  rule that a repeat of the commit served is never applied, which a release's run by hand is. By hand on `main` twice
  in a row (*ran*, 2026-10-24): run 40050527681 deployed 5fe758f, served at 01:36:26; run 40050816202 deployed it
  again at 01:40:21 while the site served it, and the files' `last-modified` went to 01:40:28, for the twelve minutes
  read. Served.
- The site's files carry the `last-modified` of the deployment serving them, the same for every file, and ETags that
  begin with that time in hex (`6adbfcc2-48`, `6adbfcc2-5e`), so a deployment that changes no file's contents still
  shows whether it's served (*ran*, curl, 2026-10-24).
- 0.5.0's release run, 39864294664: the site's artifact held `stable`; the deployment of 5fe758f said "Reported
  success!" five seconds after it was created, and the site went on serving the preview's files, without `stable`,
  until another commit was deployed an hour later (*ran*, the run's log and the site, 2026-10-22).
- The site answers with `cache-control: max-age=600`, and its cache ignores the query string: requests with new,
  random queries were all hits, their age growing (*ran*, curl, 2026-10-23). A deployment purges it (*memory*).
- The first deployment to read its channels back, the preview of 71313f3 (run 39964133295), found both served at the
  first read (*ran*, 2026-10-23).
- A called workflow's jobs get no more than the caller grants, and GitHub checks each called job's grants when the run
  starts, whether the job runs or not (*memory*). So `preview.yml`'s call grants `actions: write`, for `redeploy`,
  which never runs for a preview.

## Dependabot's alerts in the example projects

- 50 alerts were open on 2026-10-23, every one from a manifest under `examples/`: 39 from
  `examples/home/work/kestrel/package-lock.json`, 4 from its `Cargo.lock`, 7 from
  `examples/vault/software/nightjar/package.json` (*ran*, the alerts API).
- The dependency graph reads 12 manifests under `examples/`, most of them without an alert yet (*ran*, GraphQL's
  `dependencyGraphManifests`).
- `exclude-paths` in `dependabot.yml` keeps Dependabot's pull requests away from a folder; nothing documents it
  keeping alerts away, and one source says `dependabot.yml` and the alerts don't interact (*summary*).
- Manifests in a folder named as vendored dependencies are not processed (*summary*; the names' patterns weren't
  seen). Renaming the example projects' folders for it would make them read less like projects.
- A repository's custom auto-triage rule can target alerts by manifest, a criterion organisations' rules don't have,
  and dismiss them indefinitely or until a patch (*summary*, GitHub's docs on auto-triage rules).
- An alert is dismissed through the API with `state=dismissed`, `dismissed_reason=not_used` and a comment (*ran*).

## Gaps

- Whether `main`'s ruleset takes D257's status: first seen at the next release's push (T10).
- Whether a release's run by hand on `main` is served (D258): seen for 0.5.0's commit by hand on 2026-10-24, the site
  serving that commit or not; started by a release's run, first at the next one (T10).
- Whether a `push` repeat is ever served (`main`'s push of a release's commit): not tried. D?1 makes none.
- Whether an auto-triage rule's manifest criterion takes a path prefix, or only files by name: the form wasn't seen.

## Sources

- GitHub Docs: [Troubleshooting required status checks][checks], [Dependabot auto-triage rules][triage],
  [Troubleshooting the dependency graph][graph], the [Dependabot options reference][options].
- [actions/deploy-pages#383](https://github.com/actions/deploy-pages/issues/383).
- slipbox's runs: 39864294664 (0.5.0's release), 39964133295 (the preview of 71313f3), 40045492245, 40046571004,
  40050527681 and 40050816202 (by hand, 2026-10-24); rule suite 4671786583; issue #7.
- [GitHub community discussion 170184](https://github.com/orgs/community/discussions/170184), on `pages_build_version`.

[checks]: https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks
[triage]: https://docs.github.com/en/code-security/concepts/supply-chain-security/dependabot-auto-triage-rules
[graph]: https://docs.github.com/en/code-security/supply-chain-security/understanding-your-software-supply-chain/troubleshooting-the-dependency-graph
[options]: https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference
