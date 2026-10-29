---
status: done
assignee:
blocked_by: [ORG-T17]
created: "2026-10-26"
---

# ORG-T18: TUI git and service paths

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase
gates](../design.md#phase-sequence-and-review-gates) and [move
mechanics](../design.md#move-mechanics-history-and-compiled-verification) when applicable.

## Scope

Move git, diagnostics, media, export, settings and distribution controllers with their area drawing. Complete the TUI
map; keep App wiring identical.

### Issue coverage and ownership

Destinations: tui/workspace/git and its views; tui/documents/diagnostics, media and export; tui/app/settings and
distribution. Retain App composition and the current buffer write gate.

## Evidence required

Run the affected owner tests and terminal checks before/after; compare assertions, snapshots and observable errors. Run
boundary/size and verify all changed import/build/selector paths. Record actual commands/results, not assumed passes.


## Implementation and verification (2026-10-27)

Baseline: ORG-T17 plus the separate declaration-inventory correction. The [manifest](../manifests/t18.json) records 28
intact moves, 27 exact historical references under blueprint and one rendered-tree fixture label. Git uses panel,
branch/repository, history, change/diff and review subareas; mixed document/vault Problems remains one feature. Document
pictures/export, application settings/distribution and the remaining named actions follow their owners. Kitty
placeholder encoding is a pure terminal helper. No TypeScript file remains directly under src/tui; controllers and area
drawing remain intact. App wiring, buffer ownership and the note-write gate are unchanged.

- The corrected baseline capture is `tmp/issue/t18-before-corrected.json`; both sides use the corrected scanner and
  preserve 1,954 import edges, runtime worker edges, build entries and 2,604 literal suite/test declarations. Earlier
  task records quote 2,614 because their consistent scanner included ten member-call false positives, not ten extra
  tests. The original pre-correction capture remains in the local record. All 28 complete selector sets match, and a
  normalized audit of all 47 affected source bodies finds no executable changes. No worker URL, asset literal or shipped
  artifact changed; qualified bare/full paths and split/template-built paths were inspected.
- gitbranchview.ts is 999 → 1,005 lines (+6), solely normal formatting of the branch-operations import. The approved
  exact 1,005 cap replaces its implicit 1,000 ceiling; all non-import code/comments are unchanged. Owner: workspace Git
  branch/worktree views. Rationale: preserve intact responsibilities and normal import formatting during relocation.
  ORG-T30 owns its extraction and removes the cap once at or below 1,000. The other eight source caps and generated-data
  cap are unchanged. No imports, comments or blank separators were compressed to offset growth. The maintainer approved
  this crossing on 2026-10-27; the rule clarification is a separate docs commit immediately before this move, reflected
  in ORG-D2, design, requirements and AGENTS.md.
- Each before/after owner file ran in its own Bun process, with fresh marker-free `/var/tmp` temporary fixtures and
  `NO_COLOR` unset. Every pair has identical passing test/assertion counts:

| Command after `bun test` | Tests, each revision | Assertions, each revision |
| --- | --- | --- |
| `tests/tui-git.test.ts` | 73/73 | 559 |
| `tests/pictures.test.ts` | 51/51 | 440 |
| `tests/tui-report.test.ts` | 41/41 | 170 |
| `tests/tui-updates.test.ts` | 49/49 | 217 |
| `tests/export-jobs-tui.test.ts` | 10/10 | 41 |
| `tests/tui.test.ts` Problems/spelling/UI-settings selection | 19/19 | 227 |

The final owner selection uses `-t '^(the Problems panel|spelling \(25.6|UI settings \(space u)'`.

- The two terminal cases pass before/after: `git panel: s stages` and `settings: spelling on marks`, selected with `bun
  run test:terminal --jobs 1`. Source and relocated compiled probes pass all eleven real worker clients plus nested SVG
  diagram export. The package build succeeds; its copied binary passes which-key, explorer, outline, clean exit,
  info/commands JSON and unknown-option exit 2.
- Typecheck, boundary, size and docs checks pass. Initial docs lint caught expanded-path wrapping; the affected prose
  and comments were reflowed without changing content, then docs passed. Direct changed-file Markdown/Biome lint passes;
  the approved cap-policy clarification is recorded above. No whole-suite or all-terminal run was made; no intermittent
  test failure appeared in these controls. Titles, assertions, hooks, snapshots and timeout budgets remain unchanged.


The approved crossing rule is consistent in all four policy documents and the size-check header, with T30 named for cap
removal. The complete manifest accompanies the move.
The code-block tree sample retains its original drawing-path label as rendered fixture data, with an exact retained
entry. It is not a module reference; changing its width would change the scenario rather than relocate its owner.
