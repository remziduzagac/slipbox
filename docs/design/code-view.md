# Code as a notebook (plan `24.x`)

Notes render, and data files render. Code had only its source until now: the text as typed, highlighted. The code view
renders a source file too — as a notebook: its prose (the comments, each definition's documentation) at full width,
its code in cells, one per definition, each with a header carrying buttons. The aim isn't to make code look like
markdown, nor to run it (slipbox runs nothing, `23.x`); it's to make it read like a document — and alike whatever
language wrote it.

Status: a prototype for TypeScript, TSX, JavaScript and Python (`24.2`–`24.7`, `24.10`–`24.13`). What's built is
described here as it is; what's next is at the end.

## The rule: code's tokens verbatim, whitespace and decoration ours, comments as prose

Every token of code is drawn as it is written. Nothing is replaced (no `->` drawn as `→`), hidden for good or
reordered. What the view may change is everything around the tokens:

- **whitespace**: where a long line breaks, the indentation of a continuation row, how many blank rows separate
  things, a cell's own indentation (its rows start at its left edge);
- **decoration**: cells' boxes or bands and their headers, dimming, bold, indent guides, a folded group's summary row.

Comments are documentation, not code: their markers (`//`, `#`, `/** */`, a docstring's quotes) are syntax, so they go,
and their text is rendered as prose. Two exceptions keep the rule's spirit:

- a comment that's for tools (a shebang, an encoding line, `eslint-disable`, `@ts-ignore`, `# type: ignore`, `noqa`)
  or that is code put aside (`// const old = compute(1);`) stays as written;
- a definition's docstring (Python's, below its `def`) is drawn above its cell, where every other language puts its
  documentation — the one place rows are out of the file's order, so that a page reads the same in every language.

## One vocabulary, many languages

Languages share their structure: definitions, parameter lists, blocks, imports, documentation. The view works on
those shared categories, each language mapping its own syntax onto them (from its tree-sitter grammar), and anything
a language hasn't mapped is drawn as it is.

| Category | What the view does with it |
| --- | --- |
| definition: function, class, type | a cell, its header its kind and name; a class's head a cell, then each member's |
| top-level values, other statements | a cell of each run of them (its title the values' names, else `code`) |
| documentation | prose and a list of terms, above its cell |
| comment | prose on the page; in a cell, prose in the comments' colour; after code, a note beside it |
| separator comment | a section's rule with its title |
| import group | folded into one row that names what it imports |
| brackets, separators, operators | where a long line may break (any language: no mapping needed) |
| indentation | guides, one per level |

The mapping is `SyntaxTree.codeModel` (`src/core/syntax.ts`): TypeScript, TSX, JavaScript and Python so far. The
documentation formats are `readDoc` (`src/core/docformats.ts`), and the layout (`layoutCode`,
`src/core/layout/code.ts`) knows only the categories.

## Documentation: one shape from every format

A doc comment or a docstring is read into one shape — prose, then a list of terms — whatever convention wrote it:

| Format | Where | Its terms |
| --- | --- | --- |
| JSDoc | `/** … */` | `@param {T} name - what`, `@returns`, other tags by name |
| Google | Python docstrings | `Args:` (`name (type): what`), `Returns:`, `Yields:`, `Raises:` |
| NumPy | Python docstrings | `Parameters` over dashes (`name : type`, what under it), `Returns`, `Raises` |
| reST (Sphinx) | Python docstrings | `:param name:`, `:type name:`, `:returns:`, `:rtype:`, `:raises E:` |

The prose is rendered as markdown at the documentation's indentation (reST's double-backtick code and its roles, such
as `` :func:`name` ``, as code); a docstring loses its quotes and its common indentation first (PEP 257). The terms
are a definition list under it: each name, then what it is, its type dimmed after; `returns`, `yields` and `raises` by
those names. A plain block comment over several lines is prose alone.

## What it looks like

```text
── Resolving links ──────────────────────────────────────────────────

Resolves a link written in a note: the note it reaches, or null when
nothing matches.

  from      the note it's written in
  target    the link as written
  returns   the link, or null
┌─ ƒ resolve ───────────────────────────────── 11–15 ⇢ ⧉ ✎ ◎ ▾ ─┐
│ export function resolve(from: string, target: string) {         │
│   if (!target) return null;  nothing written                    │
│   By name first, then by path.                                  │
│   return byName.get(key(target)) ?? byPath.get(target);         │
│ }                                                               │
└─────────────────────────────────────────────────────────────────┘

The notes of a folder, read once.
┌─ ◆ Graph ──────────────────────────────────────── 20 ⇢ ⧉ ✎ ◎ ▾ ─┐
│ export class Graph {                                            │
└─────────────────────────────────────────────────────────────────┘

  A note's text, as read.
  ┌─ ƒ textOf ───────────────────────────────── 26–28 ⇢ ⧉ ✎ ◎ ▾ ─┐
  │ textOf(rel: string): string | undefined {                    │
  │   return this.notes.get(rel);                                │
  │ }                                                            │
  └──────────────────────────────────────────────────────────────┘
}
```

A Python file of the same function and class reads the same: the docstring above the cell, the cell's header, the
code inside — only the tokens differ.

- **Cells**: a definition's lines (its decorators first) in a box — or on a tinted band, the header a band of its own
  (`[render] code_cells`, `space u c`). A class is a cell of its head (up to its first member), then each member a
  cell under it at its indentation, its documentation above it; what's after the last member (a closing brace) is
  drawn as written, dimmed. Each run of other statements — top-level values, a script's lines — between blank lines
  and comments is a cell too, titled by the values it defines, else `code`. One blank row between the page's pieces
  (cells, sections, paragraphs), whatever the file has; documentation sits right above its cell.
- **A cell's header**: its kind (`ƒ` a function or method, `◆` a class, `◇` an interface, type or enum, `•` values;
  Nerd: the editors' symbol icons; ASCII `f C T v`), its name bold, its lines, then its buttons:

| Button | Key (the cell at the cursor) | Does |
| --- | --- | --- |
| `⚠ n` (when it has problems) | `space k p` | the Problems panel on This file, on the cell's first |
| `⇢` (a definition's) | `space k r` | where its definition is used: its language server's references, from its name |
| `⧉` | `space k y` | copies its lines, as the file has them |
| `✎` | `space k e` | the lens on its lines, to edit them |
| `◎` | `space k s` | adds it to the scratch, with its path and lines, for an agent |
| `▾` / `▸` | `space k f`, `z a` | folds it to its header (a class, its members with it), and opens it |

- **Inside a cell**: its rows start at its left edge (its indentation is the cell's); indent guides from its second
  level (the first is the border); the definition's name bold, what's before it on its line dimmed; braces and
  semicolons dimmed. A comment line is prose in the comments' colour, slanted; a comment after code is a note beside
  it, the notes of consecutive lines lined up in one column. A blank line inside a string is the string's.
- **Sections**: a separator comment — `// ---- Resolving links ----`, `# === X ===`, `// MARK: X`, `#region X` — is a
  rule across the page with its title, the outline's top level (`]]`, the breadcrumb), the cells under it.
- **Imports**: the file's run of imports is one row, `▸ imports`, naming the modules (as many as fit) and how many.
  `enter` on it unfolds it (`▾ imports`), and again folds it.
- **Width**: a line too long for its cell breaks at its structure — after an opening bracket, after a comma, before
  `&&` `||` `??` `?` `and` `or`, or a `.` that chains — at the shallowest bracket depth that fits, the rest continuing
  four columns further in than the line. A line that fits is never broken, and lines are never joined: the author's
  breaks stay, so line numbers stay the file's. With wrapping off (`space u w`), lines run on and the view scrolls
  sideways.

## How it behaves

- **The default view** of a file in a language it maps (`[render] code = "document"`; `"source"` opens code in
  source mode as before). `space n v` switches it to source mode and back, as for a note.
- **Editing**: as in a rendered note, the editing keys open the lens or switch the window to source mode, as
  `[editor] edit_in` says — the cursor keeping its character, though a cell's columns aren't the file's. The lens
  (`space n l`) is the cursor's block as written, highlighted as code, the notebook around it: a block is a line, a doc
  comment whole, or the run of imports whole, and the lens takes in its neighbours up to `lens_min_rows`; a cell's
  `✎` opens it on the whole cell. `esc esc` closes it, the notebook drawn again on the new parse.
- **The cursor** is on the text of a cell's rows, never on its border or padding; a header is decoration, a frame
  row the cursor passes over. The rows of code keep a map of each cell to its place in the file, so find, a
  selection, problem marks, a language server's hover and jumps all land where they are in the file; documentation's
  and comments' rows are rendered prose, placed by line.
- **The outline and the breadcrumb** are the definitions, as in source mode; the sections head them for `]]`, `[[`
  and the breadcrumb.
- **Copying** a selection copies the file's text, never the rows as drawn.
- **Problems** show as in source mode: the bar's signs, the marks, the Problems panel — and a cell's header counts its
  own.

## Next

- Editing in place: a row of code typed into without the lens.
- Rust (`///`, `//!`, attributes) and Go (a definition's leading comments): each a mapping.
- Signatures that don't fit, one parameter per line; columns where the code is tabular (consecutive assignments, enum
  members, an object's keys); `self.` and `this.` dimmed; a license header folded, like the imports.
- The references button with its count, once a server has said it.
