# Code as a notebook (plan `24.x`)

Notes render, and data files render; source mode shows a source file as typed, highlighted. The code view renders it
too (D125) — as a notebook: its code in cells, one per definition, each with a header carrying buttons
and the definition's documentation in it above its code; the file's other comments as prose in boxes of their own. The
aim isn't to make code look like markdown, nor to run it (slipbox runs nothing, `23.x`; D172); it's to make it read
like a document — and alike whatever language wrote it.

It covers every grammar slipbox parses that has definitions (D130): TypeScript, TSX, JavaScript, Python, Go, Rust,
Swift, PHP, Ruby, C, C++, Lua and Bash. Markup and config (HTML, Vue, Svelte, Astro, CSS, SCSS, Dockerfile) open in
source mode, and every file keeps it (`space n v`). What's next is at the end.

## The rule: code's tokens verbatim, whitespace and decoration ours, comments as prose

Every token of code is drawn as it is written (D125). Nothing is replaced (no `->` drawn as `→`), hidden for good or
reordered. What the view may change is everything around the tokens:

- **whitespace**: where a long line breaks, the indentation of a continuation row, how many blank rows separate
  things, a cell's own indentation (its rows start at its left edge);
- **decoration**: cells' boxes or bands and their headers, dimming, bold, indent guides, a folded group's summary row.

Comments are documentation, not code: their markers (`//`, `#`, `/** */`, a docstring's quotes) are syntax, so they go,
and their text is rendered as prose. Two exceptions keep the rule's spirit:

- a comment that's for tools (a shebang, an encoding line, `eslint-disable`, `@ts-ignore`, `# type: ignore`, `noqa`)
  or that is code put aside (`// const old = compute(1);`) stays as written;
- a definition's docstring (Python's, below its `def`) is drawn at the top of its cell, above its code, where every
  other language puts its documentation — the one place rows are out of the file's order, so that a page reads the
  same in every language.

## One vocabulary, many languages

Languages share their structure: definitions, parameter lists, blocks, imports, documentation. The view works on
those shared categories, each language mapping its own syntax onto them (from its tree-sitter grammar), and anything
a language hasn't mapped is drawn as it is.

| Category | What the view does with it |
| --- | --- |
| definition: function, class, type | a cell, its header its word and name; a class's head a cell, then each member's |
| top-level values, other statements | a cell of each run of them (its title the values' names, else `code`) |
| documentation | prose and a list of terms, in its cell above a divider and its code |
| comment | right above a definition, its documentation; else a cell of prose; in code, prose in the comments' colour |
| separator comment | a section's rule with its title |
| import group | folded into one row that names what it imports |
| brackets, separators, operators | where a long line may break (any language: no mapping needed) |
| indentation | guides, one per level |

The mapping is generic (`24.9`, D130): `SyntaxTree.codeModel` (`src/core/syntax.ts`) reads each grammar's own queries —
the definitions its outline uses and the comments its links are found in — so no language is mapped by hand. A
definition's kind is its node's type: a function or method; a class (what holds definitions: a class, an impl, a trait,
a module, a namespace, a protocol); a type (an interface, a struct, an enum, an alias). What's written above it for it
(Rust's `#[derive(…)]`, a decorator) is its cell's. Its documentation is the comment lines right above it, the markers
gone (`///`, `//!`, `//`, `#`, `--`, `/** */`). Imports are a run of top-level nodes named so (`import`, `use`,
`#include`, `using`), what each imports read from its strings, else its words. What a language does its own way is an
exception, not a mapping: Python's docstrings, below their `def`; TypeScript's, JavaScript's and Python's top-level
values, cells by their names. A comment that takes its line's end with it (Rust's) ends where its line does. The
documentation formats are `readDoc` (`src/core/docformats.ts`), and the layout (`layoutCode`, `src/core/layout/code.ts`)
knows only the categories.

## Documentation: one shape from every format

A doc comment or a docstring is read into one shape — prose, then a list of terms — whatever convention wrote it:

| Format | Where | Its terms |
| --- | --- | --- |
| JSDoc | `/** … */` | `@param {T} name - what`, `@returns`, other tags by name |
| Javadoc, PHPDoc, Doxygen | `/** … */`, `///` | `@param name what`, PHPDoc's `@param T $name`, Doxygen's `\param` |
| LuaDoc | `---`, `--` | `@param name what`, as JSDoc's |
| Google | Python docstrings | `Args:` (`name (type): what`), `Returns:`, `Yields:`, `Raises:` |
| NumPy | Python docstrings | `Parameters` over dashes (`name : type`, what under it), `Returns`, `Raises` |
| reST (Sphinx) | Python docstrings | `:param name:`, `:type name:`, `:returns:`, `:rtype:`, `:raises E:` |

The prose is rendered as markdown, its lines as its author broke them (each a row, wrapped when too long), at the
documentation's indentation (reST's double-backtick code and its roles, such as `` :func:`name` ``, as code); a
docstring loses its quotes and its common indentation first (PEP 257). The terms are a definition list under it: each
name, then what it is, its type dimmed after; `returns`, `yields` and `raises` by those names. A plain block comment
over several lines is prose alone.

## What it looks like

```text
── Resolving links ────────────────────────────────────────────────

┌─ function: resolve ──────────────────────────── 5–15 ⇢ ⧉ ✎ ◎ ▾ ──
│
│ Resolves a link written in a note: the note it reaches, or null
│ when nothing matches.
│
│   from      the note it's written in
│   target    the link as written
│   returns   the link, or null
│
│ export function resolve(from: string, target: string) {
│   if (!target) return null;  nothing written
│   By name first, then by path.
│   return byName.get(key(target)) ?? byPath.get(target);
│ }

┌─ class: Graph ──────────────────────────────── 19–20 ⇢ ⧉ ✎ ◎ ▾ ──
│
│ The notes of a folder, read once.
│
│ export class Graph {
│
│ ┌─ method: textOf ──────────────────────────── 21–28 ⇢ ⧉ ✎ ◎ ▾ ──
├─┤
│ │ A note's text, as read.
│ │
│ │ textOf(rel: string): string | undefined {
│ │   return this.notes.get(rel);
│ │ }
│
│ ┌─ ¶ ────────────────────────────────────────────── 30 ⧉ ✎ ◎ ▾ ──
├─┤ Then writing.
│
│ ┌─ method: add ────────────────────────────────── 32 ⇢ ⧉ ✎ ◎ ▾ ──
├─┤
│ │ add(rel: string): void { this.notes.set(rel, read(rel)); }
│
│ }
```

A Python file of the same function and class reads the same: the docstring at the top of the cell, then the code — only
the tokens differ.

- **Cells**: a definition's documentation and its lines (its decorators first) in a box — or on a tinted band, the
  header a band of its own (`[render] code_cells`, `space u c`). A box is its top line, its header, and its left line:
  no right line, no bottom — the next box's top closes it — its lines and the tree's in `cell_line`, a step brighter
  than the frame's and the rules', so a cell stands out from the chrome. Its documentation is prose at the top (a doc
  comment, a docstring, or comment lines right above it, as Go documents), then a blank row (the two belong together),
  then its code. A class is a cell of its head (up to its first member), then each member a cell under it (what's after
  its last method too), then its closing brace, a row on the class's left line — the class closed where it's written.
  Each run of other statements — top-level values, a script's lines — between blank lines and comments is a cell too,
  titled by the values it defines, else `code`. A comment that documents nothing (a file's opening note, a module's
  docstring) is a cell of its own: prose, no code, its header's mark alone (`¶`), no title. A box has a blank row under
  its header, so its name stands clear of what's under it (not a comment's box, which has no name, nor a band, its
  header a band of its own). Whatever blank lines the file has: a blank row before each box (in a class, on the class's
  line), so its name stands clear of what's above it — and after one when what follows isn't a box (a class's closing
  brace, a comment kept as written, imports) — and around a section's rule; bands touch, a band's header a tint of
  its own.
- **The tree**: a class's members are drawn two columns in from it, however far the file indents them (Python's four
  as TypeScript's two), joined to it by the explorer's tree lines: the class's left line on down, `├─` to each
  member's box a row under its top, by its name — the same row for every member, its corner kept (`┤` where it meets
  the box's left line; a folded box, which has no row under its top, `┬` at it; a band's header, touched) — `└─` to
  the last's — or, a class with a closing brace, `├─` to the last too, the line on down to the brace. A class in a class
  has a tree of its own, from its own box.
- **A cell's header**: what it is in its language's word, dimmed, then its name bold in the text's own colour (apart
  from the code's colour for it below: `function: resolve`, `class: Graph`, `method: textOf`, `struct: Frame`, `impl:
  Stacker`, `trait`, `interface`, `enum`, `type`, `module`, `namespace`, `protocol` — a function in a class, an impl or
  a trait a method, in a module a function; `24.9`), the word the first to go where the name wouldn't fit; a comment's
  box its `¶` alone; a run of statements its values' names (`•`) or `code`. Then its lines, then its buttons — a
  comment's all but `⇢`, as it defines nothing:

| Button | Key (the cell at the cursor) | Does |
| --- | --- | --- |
| `⚠ n` (when it has problems) | `space k p` | the Problems panel on This file, on the cell's first |
| `⇢` (a definition's) | `space k r` | where its definition is used: its language server's references, from its name |
| `⧉` | `space k y` | copies its lines, as the file has them |
| `✎` | `space k e` | the lens on its lines, to edit them |
| `◎` | `space k s` | adds it to the scratch, with its path and lines, for an agent |
| `▾` / `▸` | `space k f`, `z a` | folds it to its header (a class, its members with it), and opens it |

- **Inside a cell**: its rows start at its left edge (its indentation is the cell's); indent guides from its second
  level (the first is the border, a tab as wide as it's drawn); the definition's name bold, what's before it on its line
  dimmed; braces and semicolons dimmed; a receiver with its access — `this.`, `self.`, `$this->`, `this->` — dimmed, so
  the member it reaches stands out (`24.21`; a bare `this` is the value, and stays). A comment line is prose in the
  comments' colour, slanted; a comment after code is a note beside it, the notes of consecutive lines lined up in one
  column. A blank line inside a string is the string's.
- **Sections**: a separator comment — `// ---- Resolving links ----`, `# === X ===`, `// MARK: X`, `#region X` — is a
  rule across the page with its title, a blank row each side of it, the outline's top level (`]]`, the breadcrumb),
  the cells under it.
- **Imports**: the file's run of imports is one row, `▸ imports`, naming the modules (as many as fit) and how many.
  `enter` on it unfolds it (`▾ imports`), and again folds it.
- **A licence or a generated banner** (`24.22`): the comment lines a file starts with — past a shebang, an encoding
  line, PHP's `<?php` — two lines or more, before any code, are one row when they're a licence (`▸ license · MIT`: its
  SPDX id, else MIT, Apache-2.0, GPL, LGPL, AGPL, MPL-2.0 or BSD by its words, else its lines' count) or a generated
  file's banner (`▸ generated · protoc-gen-go`, what generated it). `enter` opens and folds it, as the imports.
- **Width**: a line too long for its cell breaks at its structure — after an opening bracket, after a comma, before `&&`
  `||` `??` `?` `and` `or`, or a `.` that chains — at the shallowest bracket depth that fits, the rest continuing four
  columns further in than the line. A definition's signature that doesn't fit (`24.19`) is a parameter a row: its line
  to its `(`, each parameter four columns further in, then its `)` and the rest at the line's indentation — a call's
  arguments are broken as any line is. A line that fits is never broken, and lines are never joined: the author's breaks
  stay, so line numbers stay the file's. With wrapping off (`space u w`), lines run on and the view scrolls sideways.
  `[render] code_wrap` (D233) is a rendered note's code blocks', not the cells': a fenced example in a doc comment's
  prose wraps, as printed code does.

## How it behaves

- **The default view** of a file in a language it maps (`[render] code = "document"`; `"source"` opens code in
  source mode). `space n v` switches it to source mode and back, as for a note.
- **Editing** (D131): as in a rendered note, the editing keys open the lens (their second press edits), or switch the
  window to source mode with `[editor] edit_in = "source"` — the cursor keeping its character, though a cell's columns
  aren't the file's. The lens (`space n l`) is the cursor's cell as written, highlighted as code, the notebook around
  it: the cell whole when it fits within `lens_max` of the window — a function with its documentation, a class's head
  (its doc, its line, its fields), a comment's box, a run of statements — alone, not padded with its neighbours; past
  its edge the lens moves to the next cell whole. A cell too tall is its lines: a line, a doc comment whole, the run of
  imports whole, the lens taking in its neighbours up to `lens_min_rows`, as a note's blocks. A cell's `✎` opens it on
  the whole cell, however tall. `esc esc` closes it, the notebook drawn again on the new parse.

- **The cursor** is on the text of a cell's rows, never on its border or padding; a header is decoration, a frame
  row the cursor passes over — but a folded cell's, its one row, is a stop, and folding or opening a cell by its key
  keeps the cursor on it (its header, or its first row), so `z a` again opens what it folded. The rows of code keep a
  map of each cell to its place in the file, so find, a selection, problem marks, a language server's hover and jumps
  all land where they are in the file; documentation's and comments' rows are rendered prose, placed by line.
- **Links in comments** (`16.10`): a comment's paths that name a file of the root are links in its prose — a doc's, a
  comment's box, a comment among code — drawn and followed as a Markdown link in it is (`enter`, `] l`, the links list),
  to their line where they name one (`path:42`); on a row of code (a note beside code, a comment kept as written) they
  are drawn as source mode draws them, and `enter` reads them from the text.
- **The outline and the breadcrumb** are the definitions, as in source mode; the sections head them for `]]`, `[[`
  and the breadcrumb.
- **Copying** a selection copies the file's text, never the rows as drawn.
- **Problems** show as in source mode, from every source alike: the bar's signs, the marks, the Problems panel —
  slipbox's own syntax errors among them, out of insert, until a server has answered (`16.9`, DF-D10) — and a cell's
  header counts its own. A mark is on a row's text only, never on a cell's header, borders or padding, which carry a
  line, not its text.

## Next

- Columns where the code is tabular (consecutive assignments, enum members, an object's keys, `24.20`): deferred
  (D132).
- The references button with its count, once a server has said it.

Not done: folding inside a cell — an `if`'s body, a loop's. A cell folds whole (`24.18`, D129). Nor typing in a row in
place, without the lens: the lens is where notes and code are edited (`24.17`, D131).
