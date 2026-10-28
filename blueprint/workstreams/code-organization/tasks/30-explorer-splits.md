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
- `git.ts` (715), `views/panel/gitpanel.ts` (713) and `views/branches/gitbranchview.ts` (1,005) belong to the second child.
  Their Git read generations, selection identity and worktree/mutation lifetimes must be characterized separately;
  this Explorer extraction claims no completion for them.

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
