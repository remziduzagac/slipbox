---
status: done
assignee:
blocked_by: [ORG-T30]
created: "2026-10-26"
---

# ORG-T31: Input responsibility splits

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase
gates](../design.md#phase-sequence-and-review-gates) and [move
mechanics](../design.md#move-mechanics-history-and-compiled-verification) when applicable.

## Scope

Separate keys binding data, help, aliases and decoding; split mouse routing from drag/selection helpers and vim
operators from motions where necessary.

## Evidence required

Run the affected owner tests and terminal checks before/after; compare assertions, snapshots and observable errors. Run
boundary/size and verify all changed import/build/selector paths. Record actual commands/results, not assumed passes.

## Ownership and extraction

[`t31-extraction.json`](../manifests/t31-extraction.json) records exact intended static/runtime/test deltas and
relocated symbols. No file is moved or retired; moves, retained paths and renamed basenames are empty.

| Owner under `src/tui/shell/input/` | Responsibility |
| --- | --- |
| `keys.ts` | Existing public keymap exports |
| `keys/bindings.ts` | Reading/movement bindings and ordered window/tab additions |
| `keys/contexts.ts` | Source, visual, pane and modal bindings and allowed actions |
| `keys/help.ts` | Action descriptions, groups and prefix-help parsing |
| `keys/aliases.ts`, `keys/decoding.ts` | Default aliases; terminal decoding and display spelling |
| `mouse.ts` | Pointer/hover state, bookkeeping and button-down dispatch |
| `mouse/gestures.ts` | Original click history and active drag, selection and release |
| `mouse/routing.ts`, `mouse/geometry.ts` | App-backed overlay/wheel/hot routing; rectangle hit testing |
| `vim.ts` | Existing public normal-mode exports |
| `vim/state.ts`, `vim/grammar.ts` | State records/count consumption; normal/visual key grammar |
| `vim/motions.ts`, `vim/operators.ts` | Motion/text-object ranges; pending operator completion |
| `vim/edits.ts`, `vim/replay.ts` | Existing buffer effects/put; recorded changes and replay cleanup |

Keys falls from 1,166 to 40 lines and its cap is removed. Mouse falls from 843 to 311; Vim from 756 to 11. The largest
new owner is 349 lines, below the 500-line aim. The mouse collaborators store the same App reference without IO;
there is one original click-history/drag owner, whose state routing reads directly. App retains the same VimState,
register and buffers. There are no new timers, dispatch rules, save policy, command semantics or gateway execution.

The audit accounts for 71 original declarations and all 20 non-constructor mouse members. Bodies retain their exact
executable statements apart from collaborator receivers; original types and literals are preserved. Binding-generation
loops keep their order and mutations, and entry points expose identical exports (keys 35, Vim 18), function names and
arities. Mouse retains its five public methods and arities; `clickHot` forwards once. No worker/build/asset entry,
existing test title/assertion/hook/snapshot or fixture DATA changes.

## Verification

Baseline is completed ORG-T30 in a clean archive. Bun 1.4.2, Linux aarch64, `TMPDIR=/var/tmp`, NO_COLOR and FORCE_COLOR
unset, TERM=xterm-ghostty and COLORTERM=truecolor. No host markers or user configuration are changed.

```sh
bun test tests/tui/shell/input
bun test tests/tui/shell/input/mechanisms tests/organization
bun test tests/tui/shell/input tests/organization
bun run test:terminal --jobs 2 'normal mode: x d c y' 'vim grammar: counts' \
  'mouse: a click follows a link' "which-key: the leader's groups at once"
```

- Existing input owners: 59 pass, 0 fail, 1,041 assertions before/after. Fifteen focused characterizations exercise
  generated chords, context separation, decoding/help/aliases, count consumption, ranges/text objects, cancellation,
  edit refusal, replay cleanup, rectangle edges, click history and overlay refusal. An additional boundary fixture
  exercises composition rejection and legitimate interaction types. Focused/organization owners pass 43 tests with
  819 assertions; the combined input/organization run passes 102 tests with 1,860 assertions across twenty files.
- The same characterizations pass against original implementations through private export-only adapters in a separate
  clean archive: fifteen pass, 53 assertions (original private mouse methods are exposed there, with no body edits).
  This does not alter the
  immutable manifest baseline.
- Four affected terminal checks pass before/after (6.9/7.9 s, two workers). Two production-compiled checks (normal-mode
  editing and mouse navigation) pass with unchanged build entries and a private outfile. Artifact SHA-256:
  `33915b6bab4d301bdc16d7a4a628b9717b9afff6cd934577cc6e62eaead412fa`.
- Fourteen complete fixed-root frame, geometry, buffer, selection/Vim-state and layout-source-map records match across
  widths 70/120 (reading/source, delete word, repeat, undo, visual selection and escape).
- Static edges: 2,311 to 2,348 (22 removed, 59 added); runtime: 1,807 to 1,834 (21 removed, 48 added). Declarations:
  3,892 to 3,908 (sixteen added, none removed). Build entries remain identical; imports resolve. All seven runtime SCC
  memberships remain identical (2, 2, 3, 3, 5, 8, 8); no cycle reduction is claimed.
- Closures count all importGraph/reach nodes from each exact characterization entry, including support/non-src files:
  keys 7 files/6 source modules, Vim 223/216 and mouse 233/226; none loads App. Interaction types remain App-backed;
  these counts do not claim that the effects themselves have become core operations.
- Existing selectors lose no owner: keys 263 to 265, mouse and Vim 261 to 261 each. Terminal selectors stay unchanged;
  every new mechanism selects its characterization file. The import guard rejects own-entry-point imports (including
  types) and runtime App; pure key data rejects App types too. Variant probes reject 253 forbidden forms and allow
  27 legitimate App-type forms. Removing each of the three protections makes the committed fixture fail; restoring
  them passes.

Assertion totals and durations are observations on this host. Fidelity is judged from identities, bodies and complete
observable records. No whole-suite or all-terminal run is used.
