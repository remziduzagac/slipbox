# Notes: documentation structure

## Initial outline (2026-10-18)

- Scope: analyze the current documentation and comparison sites, beginning with the main topic tree and reading
  order. Page rewriting and moves wait until the outline is agreed.
- The first guide should teach Working with Slipbox. Keep Working with agents as its own later workflow rather than
  merely renaming that agent-specific guide.
- The draft uses Start here, Guides, Using Slipbox, Reference, Help and project information, and For agents.
- Research distinguishes direct source observations from judgments about usability. No new decisions are accepted.
- ENG is independent: this work documents the current product and changes its documentation structure, not its core.

## Initial questions (settled by DOCS-D2)

- Does the proposed top-level grouping feel natural, especially Guides before Using Slipbox?
- Is the short Quick start plus the longer Working with Slipbox tutorial worth keeping as two distinct paths?
- Which big topics need subpages at the first migration: Git, CLI reference and configuration are the candidates;
  the rest can begin as single pages.
- Should Help and project information use a shorter label such as Help, with policy pages inside it?

Once the tree is agreed, draft the exact parent requirement/design changes and the migration map, then plan tasks.

## Guide order (2026-10-19)

- The proposed outline was received positively, with a specific change to the guide sequence: folders/vaults and
  migration come before Git review, and working with agents follows Git review (DOCS-D1).
- Applied the agreed order to design.md § Proposed tree. The workstream remains draft; page moves and rewriting
  remain to be planned.

## Implementation authorized (2026-10-19)

- Agreed the dedicated Reading and editing in Slipbox guide second, and exporting before agents (DOCS-D2).
- Implementation proceeds from the project, existing docs, blueprint and live exploration in Herdsman's right pane.
- Screenshot capture is a later pass; this pass uses descriptions of the intended images (DOCS-D3).

## Implementation and verification (2026-10-19)

- Implemented the six groups and agreed eight-guide order. Existing URLs remain; familiar-key onboarding is an
  explicit compatibility page outside the main sidebar.
- Separated vault, scratch/context, customization, CLI orientation, environment/storage and accessibility topics.
  Moved trust policy into Privacy and trust, with onward links from Code.
- Preserved earlier section anchors with explicit anchors and a baseline fixture; current internal links point to
  the new explanation owners. Kept exact command, key, mouse and configuration coverage checks.
- Live in Herdsman on disposable notes: READ → LENS → INSERT → save → READ, whole-source toggling, switcher,
  find, task toggle and a saved custom binding opening the palette. Saving was checked against the file on disk.
- Corrected broad stale-copy and network/Git summaries: CLI reads saved files, unsaved buffers remain separate,
  and explicit Git operations can use the network.
- The documentation tests, typecheck and lint pass. The canonical site build renders 38 HTML pages and its internal
  link checker passes. A sandboxed build omitted its generated sitemap; the normal-permission build succeeded.
- No screenshots were generated. Placeholder descriptions retain recipe names for the later capture pass.
- Final validation: 33 documentation/site tests, typecheck, lint and check:docs pass; the site builds 38 pages with
  working internal links. The metadata and earlier-anchor regression tests were checked by temporarily undoing their
  respective fixes; both failed as expected. DOCS-T1 is ready for review.

## PR review (2026-10-19)

- Reviewed navigation, preserved addresses, tutorial setup, moved explanations and site generation against the current
  source. The agent tour's unmarked folder inherited home rather than isolating its short note names; added explicit
  initialization before its CLI examples. A test runs its documented setup and first write on disposable files.
- Corrected the sibling-repository path example and checked its resolved destination. Both new regression tests fail
  with the old text. Clarified the staged-version gutter baseline and config environment overrides, and updated
  remaining explanation links to their new owners.
- Checked the configuration chapter against its seven existing focused tests: all pass (89 assertions).
- Review validation: 35 documentation/site tests pass (233 assertions); typecheck, lint and check:docs pass. The site
  builds 38 pages with working internal links. Screenshots remain deferred; no product or ENG changes were made.

## Follow-up review (2026-10-19)

- Verified the remaining navigation findings: vault/name references still went through the links-page bridges, and
  the code chapter's configuration-scope reference went through a bridge. Updated destinations directly and matched
  labels to their new owners; corrected the links chapter's stale introduction.
- Removed contradictory exhaustive network language from Privacy and trust. It now describes explicit Git requests,
  on-demand Git downloads and external programs alongside the three built-in request categories, consistent with
  How slipbox works and the existing detailed privacy sections.
- Registered DOCS in the root/workstreams navigation and roadmap, without consolidating its parent requirement or
  design changes. Kept its existing unique key and clarified its distinction from archived DOC. ENG is untouched.
- Extended the earlier-anchor baseline to the docs map and agent guide, restored their anchors, and retained the
  map's earlier sections on the site home as well. Smoothed the reported short paragraph fragments.
- Validation after follow-up: 36 documentation/site tests pass (234 assertions), along with typecheck, lint and
  check:docs. The canonical site build produces 38 pages with every internal link landing. The expanded compatibility
  tests fail when the restored map/agent-guide/site-home anchors are removed.

## Guide improvements (2026-10-19)

- Verified the file-open explorer context and reading-mode bindings against run.ts, app.ts and keys.ts. Made the
  first tour create its own vault in a copyable setup block, so its explorer, switcher/search and save messages match
  the practice files. The setup stops on an existing folder. The agent guide reuses that vault rather than creating
  it later. Tests execute the marked examples together and check that rerunning setup preserves existing notes.
- Replaced prose-dependent example extraction with stable example markers and descriptive missing-example errors.
  Explained reading-mode undo/window-close keys and redo. Removed authoring-process wording and explained TUI/CLI at
  first use in the map.
- Restored the direct no-account/no-telemetry/no-collection promise while keeping explicit network/tool behavior
  clear. Matched remaining old title labels to their destinations, distinguished the vault guide from the manual,
  and moved DOCS's roadmap entry alongside the other non-phase workstreams using the same accepted-date format.
- Validation: 36 docs/site tests pass (238 assertions), along with typecheck, lint and check:docs. The site builds
  38 pages with every internal link landing. The executable example test fails with the tour's initialization
  removed, and verifies that a second setup attempt leaves existing notes unchanged. No images were captured.

## Screenshot pass (2026-10-19)

- Captured all 29 screenshots from their recipes once the text settled (DOCS-T2), replacing the placeholders. The
  tour's shots run in the tour's own vault, as its setup block makes it; the lens guide's on its Coffee note.
- The scene `vaults-links` described changed with the guide: it now shows the vault you went into from a link, where
  the guide asks you to check the status line. The explorer-with-symlinks picture it replaced isn't shown elsewhere.

## Screenshot review and integration (2026-10-19)

- Reviewed PR #207 from 855b004, based exactly on 10b7153; no rebase or conflict resolution was needed. Inspected all
  29 PNG files against their alt text and the recipes. `vaults-links` shows kestrel entered from a link, with its own
  status and tab; the site home has its hero image again. No blocking findings. The known missing emoji glyph in
  two reference-set screens is unchanged.
- Merged #207 into the documentation branch as 2356861. DOCS-T2 is done and archived; DOCS-T1 remains in review for
  the final review of #205. This is task acceptance, not parent blueprint consolidation or a merge into dev.
- Corrected the docs map grammar. Added sample/setup equivalence checks for both notes and the `.slipbox/` files,
  and recorded the sample/recipe/retake instructions in AGENTS.md, examples/README.md and the workstream design.
- Independently reran the three getting-started recipes, `vaults-links` and `documentation-home` into a temporary
  folder: 5/5 captures succeeded and each PNG was inspected. Their documented states are preserved.
- The tour/sample equivalence check fails when a sample note is deliberately changed; restored the sample afterward.
- Final combined validation: 36 docs/site tests pass (243 assertions), typecheck and lint pass, and the site builds
  38 pages with working internal links. DOCS-T1 is ready for final review; DOCS-T2 is completed.
