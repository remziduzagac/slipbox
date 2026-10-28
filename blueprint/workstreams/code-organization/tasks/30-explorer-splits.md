---
status: doing
assignee:
blocked_by: [ORG-T29]
created: "2026-10-26"
---

# ORG-T30: Explorer responsibility splits

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase
gates](../design.md#phase-sequence-and-review-gates) and [move
mechanics](../design.md#move-mechanics-history-and-compiled-verification) when applicable.

## Scope

Separate explorer row construction, zoom/navigation and item actions without moving controller ownership or changing
disk/write policy.

### Issue coverage and ownership

Assess explorer, file-action and Git-controller responsibilities assigned by the coverage ledger. Keep each extraction
cohesive; propose child PRs before combining unrelated Git and explorer changes.

## Evidence required

Run the affected owner tests and terminal checks before/after; compare assertions, snapshots and observable errors. Run
boundary/size and verify all changed import/build/selector paths. Record actual commands/results, not assumed passes.

## Child PRs and ownership

Keep unrelated Explorer and Git lifecycles in separate child PRs (ORG-D2):

1. Explorer rows/navigation/actions: the extraction below, based on completed T29.
2. Git controllers: branch/worktree view, panel rows/actions and Git state, after the Explorer child. This owns the
   1,005-line branch-view cap; no Git source changes belong to the Explorer child. T30 and the T31 predecessor gate
   remain incomplete until this child is assessed, extracted and verified.

### Explorer child

[`t30-explorer-extraction.json`](../manifests/t30-explorer-extraction.json) records exact static/runtime/test changes
and relocated symbols; no file is retired or renamed, so moves, retained paths and renamed basenames are empty.

| Owner under `src/tui/workspace/explorer/` | Responsibility |
| --- | --- |
| `explorer.ts` | App-owned controller, live view state, listing lifetime, marks and row/filter caches |
| `contracts.ts` | Original row/item records and actual read, navigation and action capabilities |
| `rows/files.ts` | File visibility rules and directory-first note ordering |
| `rows/paths.ts` | Vault/nested/outside row paths, exclusions and hidden-folder rules |
| `rows/tree.ts` | Root/outside row construction through live graph and listing capabilities |
| `navigation.ts` | Selection, zoom/reveal, moved/missing views, breadcrumb memo and deferred hidden selection |
| `actions/items.ts` | Item menu/dispatch and delegation to existing file, vault and panel owners |
| `explorer-disk.ts` | Existing disk-read adapter; only its parameter contract narrows |

Explorer falls from 1,274 to 278 lines and its cap is removed. Every new mechanism is below 500 lines; the largest is
409. App still owns the same Explorer instance. Expanded/top/trail/wanted state, listing lifetime, tree/filter caches
and marks remain there. Navigation owns only the original private deferred-selection and breadcrumb memos, with the
same cache keys and reset boundaries. Contexts read live values and call the same feature owners; no map, buffer or
configuration is copied. Collaborator construction adds no IO or calls beyond the original Listings constructor.

All 56 original fields/methods are accounted for; four original type token trees and three top-level declarations are
preserved. Bodies change only collaborator receivers, method visibility and delegation. Tree construction retains its
exact ordered statements across the controller/cache and builder seam. The disk adapter has identical executable code.
There is no new scheduling, timeout, link approval, disk/write or save policy. Existing source/worker/build entries,
asset references, feature-test titles/assertions/hooks/snapshots and width-sensitive fixture DATA stay unchanged.

### Responsibility assessments still owned by T30

- `files.ts` (574 lines) retains note/folder creation, rename/move plans, clipboard file operations, trash and restore.
  Their shared write/refusal/preview policy stays cohesive and below the final 600-line ceiling, though above the
  500-line aim. Item menu/dispatch now delegates to this owner without changing its body or moving IO into row logic.
- The Git child below owns Git read generations, selection identity and worktree/mutation lifetimes separately.

## Explorer verification

Baseline is completed ORG-T29 in a clean archive. Bun 1.4.2 on Linux aarch64, `TMPDIR=/var/tmp`, NO_COLOR and FORCE_COLOR
unset; TERM=xterm-ghostty and COLORTERM=truecolor. No shared temp-root marker or user setting is changed.

```sh
bun test tests/tui/workspace/explorer
bun test tests/tui/workspace/explorer/mechanisms tests/organization
bun run test:terminal 'view: its folder renamed' 'hidden files: shift+h' 'busy folders: node_modules' \
  'files: space n' 'git panel: the explorer filtered'
```

- Existing Explorer owners: 125 pass, two existing skips, 1,404 assertions before/after (35.43/34.77 s). Eleven focused
  characterizations construct no App and exercise file rules, path boundaries, tree ordering, pending/error rows,
  hidden selection, zoom, move invalidation, refused switching, placeholder routing, menus and breadcrumb caching.
- Focused mechanisms plus organization guards: 38 pass, 0 fail, 809 assertions across ten files. Typecheck, Biome,
  docs/spelling/file links, explicit Markdown lint, boundary and size gates pass.
- Five affected source terminal checks pass before/after (3.9/4.1 s). The unchanged production build command, with a
  private outfile, passes the moved-view and filtered-panel journeys through its compiled worker. Artifact SHA-256:
  `88ad911d53443e64559c1c8b3586e3211e887ae4f93e8b6e6820a2ffd74d3c13`.
- A fixed-root matrix compares 54 complete screens, geometry, row/state/breadcrumb records and layout source maps
  across widths 55/120/160 and normal/zen modes: all identical. Every original body/type and constructor transition is
  accounted for independently of the manifest.
- Static edges: 2,218 to 2,255 (10 removed, 47 added); runtime: 1,757 to 1,777 (nine removed, 29 added). Test declaration
  multiset: 3,868 to 3,879 (eleven added, none removed). Build entries are unchanged; imports resolve. Runtime SCC
  memberships remain identical: 2, 2, 3, 3, 5, 8, 8; no cycle or timing improvement is claimed.
- Focused closures count every `importGraph`/`reach` node from the exact test entry, including support/non-src files:
  row mechanisms 75 files/68 source modules; interactions 29/27. Neither closure imports App. Existing Explorer,
  disk-adapter and file-controller selections lose no owner (260 each before; 260/262/260 after), with unchanged broad
  terminal selection. Each new mechanism selects its own characterization owner; no integration selection is excluded.
- All seven mechanism owners reject Explorer and App imports, including types: 126 variant probes. Removing either
  target rule makes its committed boundary fixture fail; restoring it passes. The existing boundary test gets only
  fixture/assertion additions, preserving its declaration identity.

Assertion totals and durations are host observations. Preservation is judged from identities, bodies and complete
observable records; no whole-suite or all-terminal run is used.

## Git child

[`t30-git-extraction.json`](../manifests/t30-git-extraction.json) records intended static/runtime/test deltas and
relocated members. No source is renamed or retired; there are no retained paths or renamed basenames.

| Owner under `src/tui/workspace/git/` | Responsibility |
| --- | --- |
| `git.ts` | Shared state, generation, folder answers and UI orchestration |
| `state/contracts.ts` | Live read, base and staged-buffer capabilities |
| `state/reads.ts` | Checkout memo, serialized refresh and coalesced follow-up |
| `state/bases.ts` | Base/fallback answers and their original generation keys |
| `state/staged.ts` | Buffer-keyed staged text and changes, preserving old answers while refreshing |
| `views/contracts.ts` | Original row records and live presentation/read capabilities |
| `views/branches/reads.ts` | Branch lists, stats/files and visit/generation admission |
| `views/branches/rows.ts` | Branch sections and rows |
| `views/branches/worktrees.ts` | App-backed branch/worktree prompts and existing mutation delegation |
| `views/panel/presentation.ts` | Standing, buttons and footer using current caller state |
| `marks.ts` | Original shared mark object, re-exported by drawing for compatibility |

Git falls from 715 to 591 lines, GitPanel from 713 to 540 and BranchView from 1,005 to 473; the branch cap is removed.
Git keeps the shared state and UI orchestration whose generation, entries and folder identity all collaborators use.
GitPanel keeps selection, input and action orchestration. These retained owners are cohesive below the final 600-line
ceiling, above the 500-line aim; collaborators have distinct cache or presentation lifetimes rather than arbitrary
method partitions. The largest new owner is the 308-line interactive worktree client. T11 audits final dispositions.

Every original member is accounted for (114 across the three controllers), alongside 23 original type token trees
and five top-level declarations. Executable bodies differ only by receivers, delegation and narrowed contracts.
Constructors retain their ordered effects. Branch comparison still invalidates precisely the same adjacent stats and
files entries. The public list getter returns the same cached object; no state is copied. RepoView and gitview have
identical executable modules. Public method/getter names and arities remain identical (Git 28, GitPanel 19,
BranchView 11). Drawing keeps the same mark object through its re-export. No worker, build entry, asset, deadline,
command, write policy or gateway execution changes.

### Git verification

Baseline is the completed Explorer child in a clean archive, with the same controlled environment as above.

```sh
bun test tests/tui/workspace/git
bun test tests/tui/workspace/git tests/organization
bun test tests/organization/boundary.test.ts
bun run test:terminal --jobs 2 'git: source control' "git: the gutter's signs" \
  'git panel: a file staged as git is slow' 'git branches: a new branch made is selected' \
  'git branches: a new branch made while you' "git branches: Remove…'s question" \
  'git branches: Check it out here refused'
```

- Existing Git owners: 236 pass, 0 fail, 1,711 assertions before/after. Thirteen new characterizations cover live
  checkout/root reads, serialized/coalesced refresh, stale-answer admission, base invalidation, buffer identity,
  branch generations, row ordering/buttons, operation-cache caller identity, footer state and interactive refusals.
  Focused characterizations pass with 76 assertions. The combined Git/organization run passes 276 tests with 2,549
  assertions; a subsequent boundary assertion strengthens the data-to-App rejection without adding a declaration.
- Static edges: 2,255 to 2,311 (13 removed, 69 added); runtime: 1,777 to 1,807 (eight removed, 38 added).
  Declaration multiset: 3,879 to 3,892 (13 added, none removed). All seven runtime SCC memberships remain identical
  (2, 2, 3, 3, 5, 8, 8); no cycle reduction is claimed. Build entries stay identical and imports resolve.
- Closures count every importGraph/reach node, including support/non-src files: state characterization 89 files/85
  source modules, view characterization 38/35, neither importing App. Worktree characterization intentionally remains
  App-backed (376/363). Existing selectors lose no owner (260 to 261); terminal selection is unchanged, and every new
  mechanism selects its characterization owner.
- Nine data/cache/presentation owners reject App and Git/Panel/BranchView composition, including types. The interactive
  worktree client permits App types but rejects runtime App and parent-controller imports. Variant probes reject 358
  forbidden forms and allow four legitimate App type forms. Four removed-rule negative controls make the committed
  boundary fixture fail; restoring the rules passes. The final boundary fixture passes four tests/102 assertions.
- Eight affected source terminal checks pass before/after with two workers (67.7/68.3 s). An initial eight-worker
  baseline run had two prompt-startup failures; controlled repeats of those two scenarios are recorded separately
  below rather than attributed to the extraction. No timeout or runner policy changes.

Assertion totals and durations are host observations; declarations, bodies and observable records determine fidelity.

The two controlled scenarios run five times each with one worker. The prompt-before-answer scenario passes 3/5 on
both revisions; the checkout-before-answer scenario passes 5/5 on both. Both prompt failures time out waiting for
`new branch:`; their underlying cause is unknown. No timing policy is changed. The two compiled-binary checks
(stage/commit/amend and checkout refusal) pass using the unchanged production build command and a private outfile.
Artifact SHA-256: `0aa0118de9a2955f6cebe3d373444207ae27073aa087007eae9d789bbcb5d202`.

A fixed-root comparison of fifteen complete Git frames, geometry, rows, message/fold state and layout source maps at
widths 70/120/160 is identical before/after (initial, message, filter, fold and unfold). Typecheck, Biome, docs/spelling
and file links pass. The extraction manifest, member/API audits and guard probes are checked independently of the
observable comparison.
