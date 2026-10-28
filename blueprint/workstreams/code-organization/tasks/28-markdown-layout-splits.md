---
status: review
assignee:
blocked_by: [ORG-T27]
created: "2026-10-26"
---

# ORG-T28: Markdown layout responsibility splits

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase
gates](../design.md#phase-sequence-and-review-gates) and [move
mechanics](../design.md#move-mechanics-history-and-compiled-verification) when applicable.

## Scope

Separate markdown dispatch, row finishing, picture handling and shared node guards. Keep generated rows, source maps and
HTML behavior identical.

### Issue coverage and ownership

Record which repeated AST guards have identical contracts; retain format-specific branches and source maps.

## Evidence required

Run the affected owner tests and terminal checks before/after; compare assertions, snapshots and observable errors. Run
boundary/size and verify all changed import/build/selector paths. Record actual commands/results, not assumed passes.

## Implementation

[`t28-extraction.json`](../manifests/t28-extraction.json) records exact edge/runtime/test deltas and the original symbols
assigned to each owner. `render.ts` keeps all runtime and type exports, function names and arities. No worker, asset,
build entry, existing test title/assertion/snapshot, fixture DATA or selector is rewritten. No path is retired or renamed;
retained paths and renamed basenames are empty.

| Owner under `src/core/rendering/layout/markdown/` | Lines | Responsibility |
| --- | ---: | --- |
| `render.ts` | 11 | Original entry and compatible exports |
| `contracts.ts` | 110 | Original options, picture/embed records and cache types |
| `page/render.ts` | 95 | Context, block cache, invalidation and row placement |
| `blocks/dispatch.ts` | 469 | Recursive block, container and embedded-note dispatch |
| `blocks/headings.ts` | 36 | Heading rows, labels, slugs and outline records |
| `blocks/code.ts` | 70 | Code labels, wrapping, source lines and scroll metadata |
| `rows/finish.ts` | 98 | Placement, sanitization, clipping and final IR anchors/extent |
| `rows/spacing.ts` | 40 | Blank anchors, data adjacency, prefixes and scroll offsets |
| `pictures/layout.ts` | 209 | Standalone fitting, captions, linked HTML images and drawing rows |
| `nodes/structure.ts` | 19 | First-definition traversal and shared paragraph-spacing guard |

All 48 original declarations are assigned once and match executable bodies/initializers; eight original type token
trees also match. Only two identical spacing predicates become `isParagraphSpacing(c)`: break, comment or blank text.
Expanding that call yields the original expressions. The inline value-to-string fallback, data guards and format/source
map branches have different contracts and stay unchanged. Eight adjacent rendering owners are byte-identical;
`render-context.ts` changes only its type import to `contracts.ts`.

Recursive container/embed calls share the original `Ctx`; per-render links, headings, sets, nesting, definition maps and
cache WeakMaps retain their ownership, mutation and callback order. No new callback framework or copied state is added.
The 1,076-line render cap is removed; all extracted owners are below 500 lines, leaving five handwritten legacy caps.

## Verification

Baseline is the preceding ORG-T27 tree in a clean archive. Bun 1.4.2, Linux aarch64, isolated HOME,
`TMPDIR=/var/tmp`, NO_COLOR/FORCE_COLOR unset, TERM=xterm-ghostty and COLORTERM=truecolor:

```sh
bun test tests/render.test.ts tests/html.test.ts tests/html-cache.test.ts tests/core/rendering/layout/markdown \
  tests/tui/documents/views/html.test.ts tests/tui/documents/views/embeds.test.ts \
  tests/tui/documents/media/pictures.test.ts
bun test tests/core/rendering/layout/markdown/mechanisms.test.ts tests/organization
bun run test:terminal 'document HTML: formatting' 'document HTML pictures:' 'embeds: a whole note' \
  'quotes and callouts:' 'picture caption placement:'
```

- Cold-cache baseline: 621 pass, 0 fail, 39 snapshots and 61,050 assertions in eight files (26.53 s). Final fresh-cache
  owners plus four new cases and organization guards: 652 pass, 0 fail, the same 39 snapshots, 61,798 assertions across
  seventeen files (25.56 s). The final targeted mechanisms/organization run, after two guard assertions were added,
  passes 31 tests with 750 assertions. No existing assertion or snapshot changes.
- All six selected terminal checks pass before/after (4.6/4.0 s). The production build command, with a private outfile,
  passes HTML disclosure and top-caption checks through its compiled executable. Artifact SHA-256:
  `6019626d89ec43133e3f3f6c8f844e7c5b0b5d0efeb80f8e391de28b6654517b`.
- Complete layout/public-API comparisons match 864 records before/after: six Markdown/HTML/embed/code/picture/frontmatter
  samples, widths 8/24/61, three glyph modes, light/dark, top/bottom captions, wrap/scroll and cold/warm cache renders.
  Rows, styles, source/UTF-16 maps, link/heading/task/disclosure metadata and picture extents match exactly; 1,152
  populated block-cache origins are observed on each revision.
- Static edges: 2,127 → 2,178 (24 removed, 75 added); runtime: 1,705 → 1,737 (19 removed, 51 added). Corrected test
  declarations: 3,858 → 3,862, four additions and none removed. Build entries are unchanged, imports resolve, and all
  seven runtime SCC memberships remain identical: 2, 2, 3, 3, 5, 8, 8. No cycle reduction is claimed.
- The focused mechanism closure has 22 graph nodes/21 source modules using `importGraph`/`reach`; it loads neither
  public/page composition nor recursive block dispatch. Existing render/context/inline/HTML selectors lose no tests
  and retain their terminal precision; actual mechanism changes select the new focused owner.

Fourteen owners have reverse-edge guards: all forbid entry/page composition, while thirteen lower owners also forbid
block dispatch. Probes reject 126 entry, 42 page and 39 block import forms; lower imports remain allowed. Committed
fixtures assert each cohort and all three targets; removing the contracts, page or block guard fails its regression
fixture, and restoring each passes. Exact frozen manifest/SCC comparison, body/type audit, typecheck, Biome,
docs/spelling/file links, explicit Markdown lint, boundary and size gates pass. No whole-suite or all-terminal run was
used.

### Known cache-dependent case

The first reused-cache owner run has 620 pass/1 fail with all 39 snapshots and 61,050 assertions: Mermaid's test
“drawn while its library loads: its code, the layout saying it waited, the block not kept — drawn once it's in”. It
expects an initial pending/code view, which an already available drawing does not produce. Five isolated repeated runs
per revision against the same warm cache fail 5/5 on both baseline and current; a fresh HOME/XDG_CACHE_HOME control
passes on each. Colour variables were checked as listed above. This is the existing T6/T43 test-isolation finding;
no product behavior or timeout change is included. Logs stay local. Assertion counts/times are host observations;
declaration, body and complete-IR comparisons establish preservation.
