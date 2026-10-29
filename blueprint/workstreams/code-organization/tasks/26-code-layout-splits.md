---
status: done
assignee:
blocked_by: [ORG-T25]
created: "2026-10-26"
---

# ORG-T26: Code layout responsibility splits

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase
gates](../design.md#phase-sequence-and-review-gates) and [move
mechanics](../design.md#move-mechanics-history-and-compiled-verification) when applicable.

## Scope

Separate code cell framing, page composition, wrapping and documentation layout through explicit inputs/builders.
Preserve source maps and width/sanitize invariants.

## Evidence required

Run the affected owner tests and terminal checks before/after; compare assertions, snapshots and observable errors. Run
boundary/size and verify all changed import/build/selector paths. Record actual commands/results, not assumed passes.

## Implementation

[`t26-extraction.json`](../manifests/t26-extraction.json) is the exact edge/runtime/declaration manifest. The original
`code.ts` remains the public entry for all three functions and both public types. No file was retired or moved, no
worker/build/asset path changed, no stale path exemption is needed, and no fixture DATA or existing declaration changed.

| Owner under `src/core/rendering/layout/code/` | Lines | Responsibility |
| --- | ---: | --- |
| `code.ts` | 15 | Original header and compatible public re-exports |
| `contracts.ts` | 74 | Original options, paths and internal cell/doc/spec records |
| `page/compose.ts` | 533 | Per-call recursive composition, rows/links/headings and folded metadata |
| `cells/framing.ts` | 226 | Cell headers, frames, guide joints, sections and import-fold headers |
| `cells/blocks.ts` | 57 | Lens blocks, whole-cell membership and supplied fit decisions |
| `wrapping/rows.ts` | 238 | Source cells/offsets, indentation, decoration, structural and signature breaks |
| `documentation/comments.ts` | 99 | Directives, code-like comments, separators and trailing-note placement |
| `documentation/layout.ts` | 218 | Documentation formats, Markdown prose, terms, paths and link ordering |

All 45 original top-level declarations are assigned once. Their executable bodies/initializers are unchanged; the
six type contracts also match token for token. The page's mutable state remains local to each call, with the same
nested-builder ordering. Lower modules receive the existing explicit arrays, source models, widths, glyphs and
callbacks; they never import the page/public-entry composition, even for types. Existing Markdown rendering remains
the documentation renderer; no new formatting framework or class hierarchy is introduced. Every width/sanitize call,
UTF-16/grapheme mapping rule, header action ID, fold decision and default remains the original one.

The handwritten legacy cap for `code.ts` (1,424 lines) is removed. The 533-line page is cohesive per-call orchestration,
with framing/wrapping/documentation mechanisms below it; it meets the final 600-line ceiling while retaining the
500-line aim for final assessment. `layout/diff/blockdiff.ts` remains byte-identical at 551 lines: its block-unit source
positions, marked words/lines, hidden-format changes, frame tints and prose wrapping differ from code-view UTF-16 cell
maps and structural continuation guides. Sharing those policies would add format switches rather than remove an
identical mechanism, so the diff owner is retained separately. No blanket shared-cell or wrapping abstraction is added.
`code/source.ts` is also byte-identical.

## Verification

Baseline is the preceding ORG-T25 task tree in a clean archive. Commands run with Bun 1.4.2 on Linux aarch64, an
isolated HOME, `TMPDIR=/var/tmp`, NO_COLOR/FORCE_COLOR unset, TERM=xterm-ghostty and COLORTERM=truecolor:

```sh
bun run test tests/core/rendering/layout/code/source.test.ts \
  tests/tui/documents/views/code-notebook.test.ts tests/tui/documents/views/code-comments.test.ts \
  tests/tui/documents/views/code-blocks.test.ts tests/tui/documents/views/source.test.ts \
  tests/tui/documents/views/source-cursor.test.ts tests/tui/workspace/git/diff-window.test.ts
bun run test:terminal --jobs 3 'settings: code cells in boxes' \
  'window header: code as source' 'git diff: a code file'
```

- Existing owners: 64 pass, 0 fail, 1,989 assertions across seven files before and after (6.48/5.73 s). With the eight
  new focused cases, the complete owner set passes 72 tests, 2,074 assertions across eleven files (6.17 s).
- Focused core code and organization checks pass 40 tests, 2,011 assertions across thirteen files before the additional
  page-composer assertion; the boundary set passes again after that addition. Original titles/assertions/snapshots and
  timeout sites remain intact. No intermittent owner failure was observed.
- All three identical affected terminal checks pass before/after (2.5 s each). A host binary built with the unchanged
  package build flags/worker entries passes the code-cell settings and source-switch terminal checks.
- A complete-layout comparison produces 576 byte-identical IR records. It varies six source/model samples, widths
  20/32/80, wrap on/off, boxes/bands, Unicode/ASCII glyphs, folding and opened imports. Samples exercise wide characters,
  emoji, tabs, controls/CRLF, documentation styles/terms/links, nested classes, directives, trailing notes and headers.
  The record includes every row/span, source map, heading, link, action, frame/fill and cell descriptor.
- Independent AST/emitted-declaration comparison verifies all 45 original declarations and initializers; all six type
  contract token trees match. Source and block-diff files match the baseline byte for byte. The API re-exports preserve
  names/defaults while the source algorithms have no edits.
- Static edges: 2,063 → 2,100 (10 removed, 47 added); runtime edges: 1,671 → 1,688 (6 removed, 23 added). Declaration
  multiset: 3,847 → 3,855 (8 added, none removed), measured with the corrected scanner on both sides. Build entries
  remain unchanged and all captured imports resolve. All seven runtime SCC memberships remain identical:
  2, 2, 3, 3, 5, 8, 8. No performance or cycle-reduction claim is made.
- Four focused helper test closures load neither the public entry nor the page composer. Counting all importGraph/reach
  nodes from each exact test entry, as in T9: framing 15 files/14 src; wrapping 14/13; documentation 42/40; blocks 2/1.
  Direct cases exercise endpoint padding maps, wide-character offsets/guides, signature anchors, header actions,
  doc-term source lines, link-array renumbering and supplied lens fit decisions.

The six mechanism modules have committed reverse-edge fixtures. Variant probes reject 54 entry-import forms and
18 page-composer forms while allowing lower-level imports. Removing the contract guard makes the existing boundary
fixture fail; restoring it passes. The immutable manifest is verified independently, including exact deltas and full
SCC memberships. Wall times/assertion totals are observations on this host; identities, bodies and IR comparisons are
the preservation evidence. No whole-suite or all-terminal run was used.

Typecheck, full Biome, docs/spelling/file links, explicit lint of all four touched Markdown files, boundary and size
gates pass. Existing selector sets lose no tests for code/source/block-diff, retain their terminal precision, and each
new mechanism selects its focused owner. The immutable extraction comparison and source/type-body audit pass after
all formatting and guard changes.
