# Design changes

## MODIFIED: design/rendering.md — Blocks and inlines (2.2)

Previously: HTML blocks are shown dim and verbatim except comments and a lone br; inline tags mostly disappear.

A bounded structured tokenizer and tree adapter translate document HTML to existing document concepts, retaining
original source positions. Quoted attributes, entities, case-insensitive names, void tags and malformed fragments have
explicit recovery. Parsing and traversal have depth and token bounds. Children remain literal HTML text, not Markdown.
Formatting is scoped and inherited, with supported normal/none declarations resetting the inherited property.
HTML-D2 defines values and precedence. HTML-D3 defines picture selection; existing resolution and image policy own I/O.
HTML-D4 defines disclosure state and navigation. Headings and anchors use original source lines.

## MODIFIED: design/export.md — Document assembly and Markdown

Previously: assembly drops HTML blocks.

Non-Markdown assembly adapts supported HTML to semantic nodes, disclosing all bodies. Markdown exports preserve
original HTML byte spelling and spacing, removing only omitted non-document content (HTML-D5). The shared tokenizer
identifies omitted ranges rather than serializing the HTML tree. No consumer independently parses HTML.

## Bounds and recovery

Names are ASCII and case-insensitive. Attributes keep their first occurrence; quoted greater-than signs stay inside
the value. Named and numeric semicolon-terminated entities decode through the existing entity table, with invalid
numeric scalars replaced. An unmatched end tag is ignored, matching ancestors close intervening open elements, and
EOF closes remaining elements. Comments run to their close or fragment EOF. Depth is capped at 64, flattening deeper
opens; 50,000 tokens cap semantic adaptation, with an explicit content-limit marker for a block. Markdown's omission
filter streams every token without that semantic cap, preserving all non-omitted original bytes.

The entity decoder is promoted from an existing transitive dependency at its installed exact version (1.3.0, MIT);
its sole dependency is character-entities (MIT), already in remark's graph. No parser dependency or external binary
is added. Local measurements: decoder module 634 bytes, existing entity table 37,342 bytes, minified tokenizer bundle
39,604 bytes. The lockfile adds only the root dependency declaration, with no new package entries.

HTML fragments share a stack across adjacent Markdown AST nodes: raw HTML text remains literal, while Markdown
blocks the Markdown parser already recognized between HTML fragments keep their parsed meaning. This handles the
ordinary blank lines inside details without a second Markdown parse. Original positions are retained for every
translated node and disclosure range. Theme and disclosure overrides are explicit layout cache inputs; translated
trees are held weakly by original parse tree and theme. Ordinary Markdown trees keep their identity.

The TUI's Html controller owns weak per-buffer overrides, cleared when a buffer's version changes. Enter on a summary
runs html.details_toggle; the palette exposes Toggle HTML details. Fragment, outline and explicit source-line placement
expand containing disclosures before laying out and landing on original source lines. Source/lens editing still uses
the original parse and source, not translated text. A linked graphic's click and Enter run link.follow.

Assembly keeps a separate original-HTML node view only for chapters with HTML, including embedded HTML. Markdown
serializes those runs directly from original source ranges; semantic formats consume translated nodes. HTML images
resolve through the same locator and cached-only export reads as Markdown images. Page-format differences remain:
container alignment and percentage bounds use each writer's page layout, while pixel bounds and inline semantics
are preserved. Relative paths inside lossless Markdown HTML are not rewritten and HTML-only assets are not copied.

HTML heading and anchor extraction uses index generation 13. Generation 12 vault indexes and content-cache keys are
not reused: unchanged files must acquire their HTML headings on upgrade. This applies HTML-D1 without changing
storage paths or the cache schema; both stale-cache layers have regression coverage.

Five fresh Bun processes measured the tokenizer module import at a median of 2.78 ms locally.
This is the complete module import, not a claimed startup delta; remark already loads the shared entity table.

The layout IR carries explicit attribute resets alongside additive flags, so normal/none can override a theme's
bold, italic or underline while preserving semantic colors. The existing shared span-style resolver applies these
resets for both ANSI and TUI output; document writers use equivalent scoped styles.

Preformatted containers extract text recursively from intervening Markdown blocks, retaining paragraph breaks
and formatted text instead of discarding parent nodes without a direct value.
Nested br elements contribute hard line breaks during the same extraction for rendering and semantic exports.
The selected theme is initialized before session tabs restore their saved positions and reveal enclosing disclosures.
For large notes, disclosure reveal waits for the background parser before reading the tree; it never forces a parse
on the screen thread. A changed buffer version discards a deferred reveal.
