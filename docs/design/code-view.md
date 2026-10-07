# Code as a document (plan `24.x`)

Notes render, and data files render. Code had only its source until now: the text as typed, highlighted. The code view
renders a source file too. The aim isn't to make code look like markdown. It's to make code read like a well-set
reference page: you scan its section titles, read its prose, and the code under them is calm.

Status: a prototype for TypeScript, TSX and JavaScript (`24.2`–`24.7`). What's built is described here as it is;
what's next is at the end.

## The rule: tokens verbatim, whitespace and decoration ours

Every token of the file is drawn as it is written. Nothing is replaced (no `->` drawn as `→`), hidden for good or
reordered. What the view may change is everything around the tokens:

- **whitespace**: where a long line breaks, the indentation of a continuation row, how many blank rows separate
  things;
- **decoration**: dimming, bold, a mark in the margin, indent guides, a folded group's summary row.

So the screen never says something the file doesn't, and what you read is what you'd type.

## One vocabulary, many languages

Languages share their structure: definitions, parameter lists, blocks, imports, documentation. The view works on
those shared categories, each language mapping its own syntax onto them (from its tree-sitter grammar), and anything
a language hasn't mapped is drawn as it is. A language with a little mapped already reads well; more mapping makes
it better.

| Category | What the view does with it |
| --- | --- |
| definition: function, class, type, value | a section title: its kind in the margin, name bold, keywords dimmed |
| doc comment | prose: the comment's markers gone, markdown rendered, tags as a definition list |
| import group | folded into one row that names what it imports |
| brackets, separators, operators | where a long line may break (any language: no mapping needed) |
| indentation | guides, one per level |
| anything else | drawn as written |

The prototype maps TypeScript, TSX and JavaScript (`SyntaxTree.codeModel`, `src/core/syntax.ts`); the layout
(`layoutCode`, `src/core/layout/code.ts`) knows only the categories.

## What it looks like

```text
 ▸ imports  node:fs · node:path · ../core/vault.ts … (12)

   Resolves a link written in a note: the note it reaches, or null when
   nothing matches.
     from      the note it's written in
     returns   the link, or null

ƒ  export function resolve(from: string, target: string): Link | null {
   │ if (!target) return null;
   │ const hit = this.byName.get(normKey(target))
   │     ?? this.byPath.get(target);
   │ return hit ?? null;
   }
```

- **Definitions** are the page's section titles. Their kind is in a margin left of the text, beside the line
  numbers: `ƒ` a function or method, `◆` a class, `◇` an interface, type or enum, `•` a top-level value (Nerd: the
  editors' symbol icons; ASCII `f C T v`). The name is bold; what comes before it on its line (`export`, `async`,
  `function`, `class`) is dimmed.
- **Rhythm**: one blank row before each top-level definition (with its doc comment), whatever the file has there;
  a run of blank lines elsewhere is one. The lines not drawn keep their numbers: the next row shows its own.
- **Doc comments** (`/** … */`) are body text: the markers gone, the text rendered as markdown (code spans,
  emphasis, links) at the comment's indentation, wrapped to the width. JSDoc's tags are a definition list: each
  `@param`'s name, then what it is; `@returns` as `returns`; another tag by its name. A plain `//` comment stays as
  written.
- **Imports**: the file's run of imports is one row, `▸ imports`, naming the modules (as many as fit) and how many.
  `enter` on it unfolds it (`▾ imports`), and again folds it.
- **Width**: a line too long for the window breaks at its structure — after an opening bracket, after a comma, before
  `&&` `||` `??` `?` or a `.` that chains — at the shallowest bracket depth that fits, the rest continuing four
  columns further in than the line. A line that fits is never broken, and lines are never joined: the author's breaks
  stay, so line numbers stay the file's. With wrapping off (`space u w`), lines run on and the view scrolls sideways.
- **Calm**: indent guides (`│`, dim) at each level of a line's indentation; braces and semicolons dimmed. Strings and
  comments are left as they are.

## How it behaves

- **The default view** of a file in a language it maps (`[render] code = "document"`; `"source"` opens code in
  source mode as before). `space n v` switches it to source mode and back, as for a note.
- **Editing**: as a rendered note, the editing keys switch the window to source mode first. The rows of code keep
  their exact columns, so the cursor, find, a selection, problem marks, a language server's hover and jumps all land
  where they are in the file; a doc comment's rows are rendered prose, placed by line.
- **The outline and the breadcrumb** are the definitions, as in source mode; `]]` and `[[` go between them.
- **Copying** a selection copies the file's text, never the rows as drawn.
- **Problems** show as in source mode: the bar's signs, the marks, the Problems panel.

## Next

- Folding any definition (`▸` in the margin, a key and a click), not only the imports.
- Editing in place: a row of code typed into without leaving the view; the lens for a doc comment.
- Python (docstrings, decorators), Rust (`///`, `//!`, attributes), Go (a definition's leading comments): each a
  mapping.
- Columns where the code is tabular: consecutive assignments, enum members, an object's keys, aligned.
- A license header folded, like the imports.
