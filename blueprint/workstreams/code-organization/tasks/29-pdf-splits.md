---
status: review
assignee:
blocked_by: [ORG-T28]
created: "2026-10-26"
---

# ORG-T29: PDF responsibility splits

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase
gates](../design.md#phase-sequence-and-review-gates) and [move
mechanics](../design.md#move-mechanics-history-and-compiled-verification) when applicable.

## Scope

Separate PDF font adaptation, line layout, block writing and pagination under the existing lazy writer entry. Preserve
output and error/cleanup contracts.

### Issue coverage and ownership

Record why the current lazy export strategy is retained; verify font/layout adapters and failure/cleanup behavior.

## Evidence required

Run the affected owner tests and terminal checks before/after; compare assertions, snapshots and observable errors. Run
boundary/size and verify all changed import/build/selector paths. Record actual commands/results, not assumed passes.

## Implementation

[`t29-extraction.json`](../manifests/t29-extraction.json) assigns the original symbols/state and exact
static/runtime/test deltas to the new owners. The existing `formats/pdf.ts` API remains `toPdf`, `pdfDocument`,
`splitByFont` and `words`, with unchanged names, arities and defaults. No worker URL, bundled asset specifier, build
entry, old test, fixture DATA or selector is rewritten; no path is retired or renamed, so retained paths and renamed
basenames are empty.

| Owner under `src/core/rendering/export/formats/pdf/` | Lines | Responsibility |
| --- | ---: | --- |
| `contracts.ts` | 67 | Original seven records plus actual flow/fit capabilities |
| `settings.ts` | 19 | Original dimensions and spacing |
| `writing/document.ts` | 18 | Same A4, metadata, font-null and buffering factory |
| `fonts/adapter.ts` | 123 | Registration, fallback maps, coverage, face selection and metrics |
| `layout/breaks.ts` | 17 | Unicode breaks and inline object marker |
| `layout/lines.ts` | 194 | Per-writer picture cache, atoms, wrapping and grapheme cuts |
| `layout/paint.ts` | 93 | Baselines, highlights, image/link areas and flow |
| `pages/pagination.ts` | 108 | Fit, bars, page numbers and streaming release |
| `writing/blocks.ts` | 440 | Chapter/footnote/outline state and recursive block writing |
| `writing/writer.ts` | 54 | Shared document, collaborators, stream handlers and write lifecycle |

All 21 original top-level declarations outside the old class, seven type token trees and 47 class fields/methods match;
only method visibility and collaborator receiver paths change. The original document-construction statement, four font
registration statements and two glyph-coverage statements retain their contents/order. Intermediate layout/page/painter
constructors store their capabilities and add no PDF operations or listeners. The footer callback is stored until
writing, after its painter is initialized. No new catch, cleanup policy, default, scheduler or timeout is introduced.

The live PDFKit document is shared, never copied. Font maps belong to its font adapter; the drawn-picture cache to its
line owner; streaming bars to pagination; chapter maps/outline to block writing. Every original per-writer and
per-chapter reset stays at the same boundary. Line layout accepts only the three font methods it calls; painting needs
only page fitting. The 1,038-line PDF cap is removed, leaving four handwritten legacy caps; every new owner is below 500.

### Lazy strategy and failure contracts

`export/index.ts:65` and `export/stream.ts:29` are byte-identical: they still dynamically import `./formats/pdf.ts` only
for PDF. Heavy PDFKit/fontkit/linebreak initialization remains behind that existing format boundary. Splitting the
writer does not justify a new eager registry, factory framework or changed font-discovery timing. `toPdf` keeps its
rasterizer/conversion-before-construction sequence and default `findFonts()` evaluation.

The existing typed builtin-font refusal is unchanged. Write handlers attach before the original `setImmediate` yield;
chapter ordering, end/await, sink-versus-buffer behavior and page release are unchanged. Footer exceptions still restore
the body cursor/margins, and a throwing streaming quote body still removes its bar through the original `finally`.

## Verification

Baseline is the preceding ORG-T28 tree in a clean archive; Bun 1.4.2 on Linux aarch64, `TMPDIR=/var/tmp`, NO_COLOR and
FORCE_COLOR unset, TERM=xterm-ghostty and COLORTERM=truecolor:

```sh
bun test tests/export.test.ts tests/export-streaming.test.ts tests/html-export.test.ts -t 'PDF|pdf'
bun test tests/core/rendering/export/pdf tests/organization
bun run test:terminal 'export: PDF, a web page' 'notes: an export cancelled' 'export: :export pdf'
```

- Original PDF selection: 16 pass, 0 fail, 98 assertions before/after (3.34/3.24 s). Six new adapter/layout/pagination
  characterizations pass with 23 assertions. With organization fixtures, 33 pass, 0 fail, 764 assertions across eleven
  files; no existing declaration/assertion/snapshot changes.
- Three affected terminal checks pass before/after (4.0/4.0 s). The production build command with a private outfile
  passes multi-format PDF export and long-PDF cancellation through its compiled worker. Artifact SHA-256:
  `49d30ba6aabfcc2d789d465dfc9c61031a29a7c729cd3cdc39cae086883be6eb`.
- A fixed-clock private probe compares twelve complete documents per revision: builtin/system fonts, three chapter,
  table/quote/code/footnote/image/math cases and buffered/streamed output. Public API names/arities match. Ten initial
  pairs match raw bytes; two image pairs differ in hashes at equal lengths, with raw bytes not retained in that first
  probe. A captured repeat shows PNG alpha-mask IDs swapping with matching `/SMask` references and identical image data.
  PDFKit creates masks from pixel-decoding completion (`node_modules/pdfkit/js/pdfkit.js:4832`). The initial hash-only
  differences are consistent with that observed variation; their exact bytes cannot be audited. Canonical comparison
  labels only those masks by full contents, preserves every other object byte/reference and excludes xref offsets.
  Four subsequent baseline/current repeat runs compare all twelve cases successfully, including raw bytes in those
  runs. No product serialization policy is changed.
- Static edges: 2,178 → 2,218 (4 removed, 44 added); runtime: 1,737 → 1,757 (4 removed, 24 added). Corrected test
  declarations: 3,862 → 3,868 (six added, none removed). Build entries stay unchanged and imports resolve. All seven
  runtime SCC memberships are identical: 2, 2, 3, 3, 5, 8, 8; no cycle reduction is claimed.
- Focused closures using `importGraph`/`reach` from each exact test entry load no public/lifecycle composition:
  fonts 5 graph nodes/4 source modules, lines 19/18, pagination 4/3. Existing PDF/index/stream test selections lose no
  owner and retain terminal precision; actual mechanism changes select each new focused owner.

Nine mechanism owners reject higher composition, including types: 81 public-entry and 27 writer import forms; eight
lower owners also reject 24 block-writer forms. Lower imports are accepted. Committed fixtures cover every owner and
all three targets; removing the contracts, writer or block guard makes its fixture fail, and restoring passes. Exact
frozen manifest/SCC comparison, body/type/constructor audit, typecheck, Biome, docs/spelling/file links, explicit
Markdown lint, boundary and size checks pass. No whole-suite or all-terminal run was used. Times and assertion totals
are observations on this host; identities, bodies and complete PDF objects provide the preservation evidence.
