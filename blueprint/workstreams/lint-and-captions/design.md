# LC design

## MODIFIED: design/tui.md — The lint surface (`3.21`)

Previously: every completed, current lint finding is displayed (D160).

Retain original findings. Classify their lines using the Markdown parse, filtering only their presentation through
`lint.follow_view` and `lint.ignore`. Recompute visibility as wrapping settings change without running lint again.
Both file and vault Problems counts, marks and lists use this projection. Problems says how many findings are hidden
by each reason; `a` runs `problems.show_all` to reveal them, including ignored rules, and toggles back.

## MODIFIED: design/rendering.md — Standalone picture captions

Previously: the boxed caption immediately follows image rows and any horizontal scrollbar.

The caption goes below or above according to `render.caption`, one blank row between caption and image (including
the image's scrollbar). Size fitting reserves the spacer too. Picture row coordinates stay relative to the first
image row, negative for a top caption, preserving clicks, cropping and resizing. Cache keys include placement.
