# Code as a document (plan `24.x`)

Notes render, and data files render. Code had only its source until now: the text as typed, highlighted. The code view
renders a source file too. The aim isn't to make code look like markdown. It's to make code read like a well-set
reference page: you scan its section titles, read its prose, and the code under them is calm — and the page looks the
same whatever language wrote it.

Status: a prototype for TypeScript, TSX, JavaScript and Python (`24.2`–`24.7`, `24.10`–`24.12`). What's built is
described here as it is; what's next is at the end.

## The rule: code's tokens verbatim, whitespace and decoration ours, comments as prose

Every token of code is drawn as it is written. Nothing is replaced (no `->` drawn as `→`), hidden for good or
reordered. What the view may change is everything around the tokens:

- **whitespace**: where a long line breaks, the indentation of a continuation row, how many blank rows separate
  things;
- **decoration**: dimming, bold, a mark in the margin, indent guides, a folded group's summary row.

Comments are documentation, not code: their markers (`//`, `#`, `/** */`, a docstring's quotes) are syntax, so they go,
and their text is rendered as prose. Two exceptions keep the rule's spirit:

- a comment that's for tools (a shebang, an encoding line, `eslint-disable`, `@ts-ignore`, `# type: ignore`, `noqa`)
  or that is code put aside (`// const old = compute(1);`) stays as written;
- a definition's docstring (Python's, below its `def`) is drawn above the definition, where every other language puts
  its documentation — the one place rows are out of the file's order, so that a page reads the same in every language.

## One vocabulary, many languages

Languages share their structure: definitions, parameter lists, blocks, imports, documentation. The view works on
those shared categories, each language mapping its own syntax onto them (from its tree-sitter grammar), and anything
a language hasn't mapped is drawn as it is. A language with a little mapped already reads well; more mapping makes
it better.

| Category | What the view does with it |
| --- | --- |
| definition: function, class, type, value | a section title: its kind in the margin, name bold, keywords dimmed |
| documentation | prose and a list of terms, above its definition |
| comment | prose; a separator a section's rule; after code, a note in the margin |
| import group | folded into one row that names what it imports |
| brackets, separators, operators | where a long line may break (any language: no mapping needed) |
| indentation | guides, one per level |
| anything else | drawn as written |

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

The same function in both languages:

```text
TypeScript                                          Python
▸ imports  node:path (1)                            ▸ imports  os.path (1)

── Resolving links ───────────────────────           ── Resolving links ───────────────────────

Resolves a link written in a note: the              Resolves a link written in a note: the
note it reaches, or null when nothing               note it reaches, or None when nothing
matches.                                            matches.

  from      the note it's written in                  from_     the note it's written in
  target    the link as written                       target    the link as written
  returns   the link, or null                         returns   the link, or None
ƒ export function resolve(from: string,           ƒ def resolve(from_: str, target: str)
      target: string): Link | null {                    -> Link | None:
│ if (!target) return null;  nothing written      │   if not target:
│ By name first, then by path.                    │   │   return None  nothing written
│ return byName.get(key(target))                  │   By name first, then by path.
│     ?? byPath.get(join(from, target));          │   return by_name.get(key(target))
}                                                 │       or by_path.get(join(from_, target))
```

- **Definitions** are the page's section titles. Their kind is in a margin left of the text, beside the line
  numbers: `ƒ` a function or method, `◆` a class, `◇` an interface, type or enum, `•` a top-level value (Nerd: the
  editors' symbol icons; ASCII `f C T v`). The name is bold; what comes before it on its line (`export`, `async`,
  `function`, `def`, `class`) is dimmed.
- **Sections**: a separator comment — `// ---- Resolving links ----`, `# === X ===`, `// MARK: X`, `#region X` — is a
  rule across the page with its title, the outline's top level (`]]`, the breadcrumb), the definitions under it. A
  separator alone is a rule.
- **Rhythm**: one blank row before each top-level function, class or type (with its documentation), and before each
  section, whatever the file has there; a run of blank lines elsewhere is one. The lines not drawn keep their numbers:
  the next row shows its own.
- **Comments**: a run of comment lines is prose — the markers gone, paragraphs where the comment has blank lines,
  markdown rendered — at the comment's indentation, with its guides. A comment after code is a note: its marker gone,
  in the comments' colour, slanted, and the notes of consecutive lines lined up in one column (past two thirds of the
  width, each two columns past its own code).
- **Imports**: the file's run of imports is one row, `▸ imports`, naming the modules (as many as fit) and how many.
  `enter` on it unfolds it (`▾ imports`), and again folds it.
- **Width**: a line too long for the window breaks at its structure — after an opening bracket, after a comma, before
  `&&` `||` `??` `?` `and` `or`, or a `.` that chains — at the shallowest bracket depth that fits, the rest continuing
  four columns further in than the line. A line that fits is never broken, and lines are never joined: the author's
  breaks stay, so line numbers stay the file's. With wrapping off (`space u w`), lines run on and the view scrolls
  sideways.
- **Calm**: indent guides (`│`, dim) at each level of a line's indentation (the file's own step: two columns, four);
  braces and semicolons dimmed. Strings are left as they are; a blank line inside one is its text, never folded.

## How it behaves

- **The default view** of a file in a language it maps (`[render] code = "document"`; `"source"` opens code in
  source mode as before). `space n v` switches it to source mode and back, as for a note.
- **Editing**: as in a rendered note, the editing keys open the lens or switch the window to source mode, as
  `[editor] edit_in` says. The lens (`space n l`) is the cursor's block as written, highlighted as code, the document
  around it: a block is a line, a doc comment whole, or the run of imports whole, with the blank lines after it, and
  the lens takes in its neighbours up to `lens_min_rows`. `esc esc` closes it, the document drawn again on the new
  parse. The rows of code keep their exact columns, so the cursor, find, a selection, problem marks, a language
  server's hover and jumps all land where they are in the file; documentation's and comments' rows are rendered
  prose, placed by line. The lens on a docstring opens where it is in the file, below its `def`.
- **The outline and the breadcrumb** are the definitions, as in source mode; the sections head them for `]]`, `[[`
  and the breadcrumb.
- **Copying** a selection copies the file's text, never the rows as drawn.
- **Problems** show as in source mode: the bar's signs, the marks, the Problems panel.

## Next

- Folding any definition (`▸` in the margin, a key and a click), not only the imports.
- Editing in place: a row of code typed into without the lens.
- Rust (`///`, `//!`, attributes) and Go (a definition's leading comments): each a mapping.
- Signatures that don't fit, one parameter per line; columns where the code is tabular (consecutive assignments, enum
  members, an object's keys); `self.` and `this.` dimmed; a license header folded, like the imports.
