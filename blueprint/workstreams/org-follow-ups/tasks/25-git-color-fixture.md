---
status: review
assignee:
blocked_by: [ORF-T24]
created: "2026-11-01"
---

# ORF-T25: Isolate Git-mark colors from the shell

Issue item 4, fixture isolation; a separate test-only prerequisite to resuming ORF-T3.

## Scope

Isolate the Git-panel branch-file color scenario in `tests/tui/workspace/git/panel/input.test.ts` from inherited
NO_COLOR. Preserve its title, assertions and time limits. Add a controlled nonempty, empty and absent setting
regression that checks restoration. Product behavior and shared fixture helpers stay unchanged.

The retained ORF-T3 completion batch fails at `input.test.ts:178`: expected the git_new foreground (undefined),
received `default`. App deliberately selects mono for nonempty NO_COLOR (`src/tui/app/runtime/app.ts:657`).
The invoking unrestricted shell has that setting present/nonempty; both source and fixture match dev. Preserve that
failed batch without retrying it. Fix this fixture separately under the standing host-isolation rule.

## Acceptance and evidence

Follow the [common gates](../design.md#verification-and-delivery). Observe the controlled regression fail once with
only the isolation fix removed, restore it exactly, then run the affected owner, static/docs and applicable terminal
checks. Whole bun run check commands have a 900-second external bound; focused batches retain 300 seconds, both with
10-second kill grace. Test, product, terminal and CI deadlines remain unchanged.

Branch: `refactor/issue-170-git-color-fixture`, from origin/dev at
`5dd078a231321e40e2c0e648676704305d14a729`. Carry ORF-T24's completion record unchanged. ORF-T3 remains local,
unpushed at `47a324dc`, with its completed source/compiled probes and scoped failure ledger preserved.

Build, fresh review and merge remain separate stages. Resume ORF-T3 after this prerequisite merges and its automatic
dev push succeeds; its combined scoped result has one retained failure until that fixture is fixed.


## Implementation and controlled regression

The original color scenario body moves byte-for-byte to the test-local branchFileColors function; its original
named test invokes that function. NO_COLOR is saved, cleared for the whole scenario and restored in finally.
One added regression invokes the same scenario with nonempty, empty and absent settings and checks restoration.
Other scenarios retain their setup. The shared Git-panel helper, App and all product source are unchanged.

Whole-file reversal reconstructs the base byte-for-byte after removing only the helper, new registration and added
regression. All nine original suite/leaf declarations preserve text and order, with one added. The carried ORF-T24
completion record matches its saved artifact exactly.

Removing only the helper's NO_COLOR deletion once makes the controlled regression fail at the original color
assertion: expected undefined, received default (three assertions, exit one). The fixed file is restored exactly.
Under inherited NO_COLOR=1, the original scenario and regression pass: two tests, 23 assertions, zero failures
(391 milliseconds). The unrelated failed ORF-T3 batch is retained without retry.

Logs: `tmp/issue/ORF-T25-negative.log`, `ORF-T25-fixed.log` and `ORF-T25-body-audit.txt`.

## Scoped verification and delivery

`NO_COLOR=1 gnutimeout -k 10 900 bun run check` passes typecheck, boundary, size, dependency/workflow gates,
Biome and docs, then the sole reached unit owner: nine tests, 68 assertions, zero failures (772 milliseconds).
The seven handwritten source caps, one generated cap and nine legacy test caps are unchanged.

The scoped terminal selector reaches no checks. The explicit Git-panel opening scenario passes one check,
four commands, two jobs (0.7 seconds). No full suite or all-terminal run; no product deadline changes.
Evidence: `tmp/issue/ORF-T25-check.log`, `ORF-T25-terminal-scope.log` and `ORF-T25-terminal.log`.

The common delivery design now distinguishes the whole check's 900-second outer wrapper from focused batches'
300-second wrapper, both with ten-second kill grace. Test/product/terminal/CI deadlines remain unchanged. This is
an observation bound for scoped verification, not a change to application or test behavior.

The preceding dev push at the exact base succeeds on attempt one; repository health last ran 2026-10-26, within
eight days. Six changed files: this test owner, task and task index, resolver prerequisite, carried ORF-T24 completion
and the common outer-wrapper policy. No user behavior, user documentation, changelog, dependency or CI change.
Build publication is next; fresh review, ready marking, merge and automatic dev push remain separate stages.
