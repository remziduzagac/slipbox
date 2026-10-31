---
status: active
created: "2026-10-31"
---

# ORF: Organization follow-ups

Implements [issue #170](https://github.com/remziduzagac/slipbox/issues/170), the work retained by
[ORG-T11](../code-organization/tasks/11-final-ratchet.md),
[ORG-T43](../code-organization/tasks/43-measurement-and-build.md) and
[ORG-T41](../code-organization/tasks/41-naming-and-unused-code.md).

The approved ORG-D1–ORG-D3 ownership, requirements and move rules govern this work. ORG takes precedence over ENG's
conflicting draft; ENG is unchanged. No new gateway, buffer owner, dependency, timeout increase, CI policy, #56 work,
ORG archive or parent-blueprint consolidation is included.

[Requirements](requirements.md) retain the accepted constraints; [design](design.md) records the implementation seams
and gates. Tasks are in delivery order, one PR each unless a large task first records numbered child PRs. Each PR starts
from the latest origin/dev. Task status and evidence live in its file; completed tasks stay here until consolidation.

## Tasks

- [ORF-T1: Fix the overflowing timer](tasks/01-overflowing-timer.md).
- [ORF-T21: Isolate the uninstall fixture's home](tasks/21-uninstall-fixture.md).
- [ORF-T2: Investigate intermittent deadlines](tasks/02-intermittent-deadlines.md).
- [ORF-T22: Isolate the stat metadata fixture](tasks/22-stat-fixture.md).
- [ORF-T3: Separate resolver admission from lookup](tasks/03-resolver.md).
- [ORF-T4: Separate CLI dispatch from presentation](tasks/04-cli.md).
- [ORF-T5: Separate vault prompts from switching](tasks/05-vaults.md).
- [ORF-T6: Separate refresh from watcher reload](tasks/06-watch.md).
- [ORF-T7: Separate update observation from handover](tasks/07-updates.md).
- [ORF-T8: Separate graph refresh from index state](tasks/08-graph.md).
- [ORF-T9: Separate App opening and layout policy](tasks/09-app.md).
- [ORF-T10: Split distribution tests by feature](tasks/10-distribution-tests.md).
- [ORF-T11: Split server tests by feature](tasks/11-server-tests.md).
- [ORF-T12: Split rendering tests by feature](tasks/12-render-tests.md).
- [ORF-T13: Split export tests by feature](tasks/13-export-tests.md).
- [ORF-T14: Split link and file terminal checks](tasks/14-links-files-checks.md).
- [ORF-T15: Split vault terminal checks](tasks/15-vault-checks.md).
- [ORF-T16: Split external-change and code terminal checks](tasks/16-outside-code-checks.md).
- [ORF-T17: Split navigation terminal checks](tasks/17-navigation-checks.md).
- [ORF-T18: Split reading terminal checks](tasks/18-reading-checks.md).
- [ORF-T19: Prove unused-code dispositions](tasks/19-unused-code.md).
- [ORF-T20: Move suitable scenarios to focused tests](tasks/20-focused-tests.md).
