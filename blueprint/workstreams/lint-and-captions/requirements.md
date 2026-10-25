# LC requirements

## ADDED: requirements.md — lint presentation (`3.21`)

Filter completed Markdown lint findings without changing the linter's configuration or execution. By default MD013
is hidden on paragraphs, lists and quotes when wrapping is on; on table rows always; inside fenced code when code
wrapping is on. Unknown block kinds and fence delimiters remain visible.

`lint.follow_view` defaults to true. `lint.ignore` defaults to an empty list of rule IDs. Both are safe in vault
settings. Problems explains hidden counts by reason and has a named command and key to reveal every finding.
Status counts and marks use the visible findings.

## MODIFIED: requirements.md — pictures (`12.x`)

Previously: a standalone picture's caption box is below the picture.

`render.caption` selects bottom (default) or top. A single blank row separates image and caption on either side.
Without a drawable image, the caption stands alone without the spacer.
