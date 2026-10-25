# Requirements changes

## MODIFIED: requirements.md — Rendering and export

Previously: HTML blocks are dim verbatim content, most inline formatting tags are discarded, exports drop HTML blocks.

Support p, div, span, br, hr, h1–h6, strong/b, em/i, u/ins, s/del, code/kbd/samp/pre/mark, a, img,
picture/source and details/summary, including nested and mixed content. Unknown tags preserve readable children.
Apply HTML-D1–HTML-D5. Source view and edits preserve original bytes and original source ranges.

Acceptance mirrors #90: themed logo and linked badge, offline policy tests, equivalent Markdown/HTML image paths,
formatting in paragraphs/lists/tables, quoted attributes/entities/case/void tags/malformed recovery, picture source
ordering and unsupported alternatives, bounded dimensions and aspect ratios, named disclosure interaction and target
reveal, source mapping through hidden/multiline/collapsed content, executable-content omission and resource bounds.
Pure Markdown and explicit anchors must retain their behavior. Add representative README fixtures, focused terminal
checks, exact subset documentation, affected screenshots and a changelog entry.
