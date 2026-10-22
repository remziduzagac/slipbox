---
status: review
assignee: Codex
blocked_by: []
created: "2026-10-19"
---

# DOCS-T1: Build the agreed documentation

Implement the tree, guide order, focused topic/reference pages, compatibility navigation and screenshot placeholders.

## Acceptance criteria

- The docs map and site present the agreed groups and guide order (DOCS-D2).
- The two introductory guides are independently followable after installation, with confirmed keys and observations.
- Moved explanations retain links from their old pages and anchors; every page is navigable or explicitly legacy.
- Exact command, key and configuration coverage remains tested.
- Intended image states were recorded with retained recipes; DOCS-T2 delivers the final captures (DOCS-D3).
- Typecheck, lint, docs tests, Markdown/links and the site build pass. No full product suite; screenshot capture is
  tracked in DOCS-T2.

## References

- Delivers: ../requirements.md § Acceptance criteria; ../design.md § Agreed tree.
- Rests on: DOCS-D2, DOCS-D3; ../research.md.

## Log

- 2026-10-19: verified rendered reading and the lens live on disposable notes in Herdsman's right pane.
- 2026-10-19: verified whole-source toggling, switcher, find, task toggling and a custom binding on disposable files.
- 2026-10-19: 33 documentation/site tests pass (229 assertions); typecheck, lint and check:docs pass. The site builds
  38 HTML pages and every internal site link lands. No full product suite or image capture was run.
- 2026-10-19: temporarily removed the metadata fix and a retained section anchor separately; their focused
  regression tests failed as expected. Restored both and reran the documentation tests successfully.
- 2026-10-19: PR review corrected the agent tour's vault setup, a sibling-repository path, the gutter baseline and
  config path guidance. Added executable setup/write and resolved-path regression checks; both fail without fixes.
- 2026-10-19: after review fixes, 35 documentation/site tests pass (233 assertions), as do the seven configuration
  contract tests, typecheck, lint, check:docs and the 38-page site build. No remaining confirmed review blockers.
- 2026-10-19: addressed the follow-up navigation/network/registration findings and minor compatibility/formatting
  gaps. Restored map and agent-guide anchors and checked their site counterparts. 36 docs/site tests, typecheck,
  lint, check:docs and the 38-page site build pass; anchor regressions fail without restored anchors.
- 2026-10-19: refined the first-use guides from follow-up review: initialize the practice vault during setup, test
  the marked setup and agent examples together, preserve existing files on a repeat setup, clarify reading keys,
  restore the direct privacy promise, and align titles and roadmap placement. 36 tests pass (238 assertions), plus
  typecheck, lint, check:docs and the 38-page site build. The example regression fails without initialization.
- 2026-10-19: screenshot pass DOCS-T2 reviewed and merged from PR #207. Updated final image acceptance to reference
  that completed task; corrected the docs map's CLI grammar. Added an executable comparison between the tour setup
  and the screenshot sample vault. Status remains review for the final review and merge of PR #205 into dev.
- 2026-10-19: final combined validation: 36 docs/site tests pass (243 assertions), typecheck and lint pass, and the
  site builds 38 pages with every internal link landing. Five key screenshot recipes were independently rerun and
  inspected. Sample/setup drift is caught by the test; the grammar correction changes no captured scene.
