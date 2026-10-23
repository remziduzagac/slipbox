---
status: current
created: "2026-10-23"
---

# Research: what GitHub does that the release flow and the upkeep rely on

What releasing 0.5.0 (#28), the fix after it (#30) and the example projects' Dependabot alerts showed about GitHub's
rulesets, Pages and Dependabot, read and run on 2026-10-22 and 2026-10-23. Each claim is marked with its provenance,
as the blueprint's README says.

## Summary

- **A ruleset counts no check from a run started by hand:** a `workflow_dispatch` run's checks don't satisfy a
  required status check, even passed; the rule is about checks alone, not commit statuses. Informed D257.
- **A Pages deployment under a `release` event, of a commit deployed before, is reported a success and not served;**
  a `push` or `workflow_dispatch` run's deployment of the same commit is. Informed D258.
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
  own was answered 404 by the Pages API, in the same reports (*read*, the issue's comments, 2026-10-22).
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
- Whether a release's run by hand on `main` is served (D258): the reports say so; first seen at the next release (T10).
- Whether an auto-triage rule's manifest criterion takes a path prefix, or only files by name: the form wasn't seen.

## Sources

- GitHub Docs: [Troubleshooting required status checks][checks], [Dependabot auto-triage rules][triage],
  [Troubleshooting the dependency graph][graph], the [Dependabot options reference][options].
- [actions/deploy-pages#383](https://github.com/actions/deploy-pages/issues/383).
- slipbox's runs: 39864294664 (0.5.0's release), 39964133295 (the preview of 71313f3); rule suite 4671786583.

[checks]: https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks
[triage]: https://docs.github.com/en/code-security/concepts/supply-chain-security/dependabot-auto-triage-rules
[graph]: https://docs.github.com/en/code-security/supply-chain-security/understanding-your-software-supply-chain/troubleshooting-the-dependency-graph
[options]: https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference
