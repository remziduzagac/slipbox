# Decisions

## HTML-D1: A bounded document adapter (#90, 2.2)

Accepted 2026-10-25. Translate document HTML through one structured core adapter shared by rendering and export.
Preserve source ranges and original markup; never parse HTML text as Markdown. Unknown document tags retain children.
Comments are hidden. Scripts, styles, frames, objects, embeds and other non-document executable content are omitted.
No CSS fetching, handlers, arbitrary browser layout or custom colors. Existing sanitization and image policy apply.
Reason: ordinary README content should work without introducing a browser engine or separate consumer parsers.

## HTML-D2: Presentation values (#90)

Accepted 2026-10-25. Dimensions accept positive integer pixels, bare or with `px`; width and max-width additionally
accept integer percentages from 1 to 100. Height accepts pixels only. Valid inline declarations override attributes;
invalid declarations are ignored. Width and height bound a containing box, max-width further caps it, and intrinsic
aspect ratio and existing image limits always apply. Alignment is left, center or right, inherited by children.
Font weight is normal or bold; font style normal or italic; text decoration underline, line-through or none.
White space accepts pre. Other declarations have no effect. Semantic colors come from the selected theme.
Reason: these values map predictably to terminal cells and existing picture sizing.

## HTML-D3: One picture alternative (#90)

Accepted 2026-10-25. Select the first supported source matching prefers-color-scheme light or dark. Only one simple
URL is accepted in srcset; multiple candidates, other media queries and unsupported MIME types are skipped.
Without an explicit theme, or without a supported match, use img. Never render multiple alternatives together.
Existing image formats and SVG handling apply; HTML never bypasses ask/show/never or fetches a stylesheet.
Links around pictures remain the action for both graphics and fallback. Theme changes invalidate selection.
Reason: deterministic theme choice without approximating browser media or density selection.

## HTML-D4: Disclosure and navigation (#90)

Accepted 2026-10-25. TUI details respect open initially, with a named keyboard command to toggle the summary.
Following a fragment into collapsed content expands every containing disclosure. Noninteractive CLI and exports
always expose the body. HTML headings participate in normal outline and slug navigation; an explicit id wins.
Existing explicit anchors remain valid. State belongs to the current document, not a global HTML engine.
Reason: collapsed content must remain discoverable and reachable on every surface.

## HTML-D5: Exports preserve semantics; Markdown preserves HTML (#90, 10.x)

Accepted 2026-10-25. Existing non-Markdown formats preserve supported semantic content and local images through the
shared adapter, with expanded details and img fallback unless a theme is explicitly supplied. Document format limits.
Markdown exports keep HTML as written, losslessly, except scripts, styles and the other omitted non-document content
from HTML-D1. Do not rewrite HTML into Markdown or normalize its spelling, attributes or whitespace.
Reason: a portable Markdown export must retain the author's HTML representation.
