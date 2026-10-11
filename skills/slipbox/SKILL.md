---
name: slipbox
description: >-
  Drive slipbox, a markdown notes app, from the shell: find text across notes, read and safely write
  notes (atomic, never clobbering a note the user changed), replace text, tick tasks, render a
  note as readable text, follow links (paths, wikilinks, slipbox:// pointers), write a link in the
  folder's convention, list links and backlinks, outline a note, see what the user is reading, and
  append file:line references or text to the per-project scratch the user reads in the slipbox TUI.
  Use when the user mentions slipbox, their notes, the scratch, or asks to capture a reference for
  later; or when a directory holds a `.slipbox/` marker and you need to find, read or change its notes.
---

# slipbox

slipbox is a terminal markdown notes app. The user reads notes in its TUI; you use its CLI. Both
see the same files: **disk is the contract**. You never see the user's unsaved state, and the
TUI reloads a note the moment you write it.

## Before anything

```bash
slipbox info --json          # root, its name, the link convention, paths, note count, stale files
```

A file's **root** is the nearest folder above it holding `.git`, `.slipbox/`, `.obsidian/` or `.zk/`; commands find
it by walking up from the note you name, or the current directory. `--root <dir>` says where to start (a root nested
in it stays its own). Without one, the folder you're in stands in: everything works, but `/` in a link means the
filesystem and wikilinks have no names to look up. A root may have a **name** — its `.slipbox/` name, else its
repository's remote's — which other folders link to it by: `slipbox://<name>/<path>`. `info` gives `root`, `name`
and `links` (how this folder writes links, and what said so).

If `slipbox` is not on `PATH`, run `bun <repo>/src/main.ts` instead. On machines managed by
mise, run it in a login shell: `zsh -lc 'slipbox …'`.

## Always use `--json` when you parse output

Every command prints exactly one JSON object with `--json`:

```json
{"schema": 1, "ok": true, "command": "resolve", "data": {}, "warnings": [], "stale": []}
```

On failure `ok` is false and `error` is `{code, message}`. Exit codes are stable:

| Code | Meaning |
| --- | --- |
| 0 | ok |
| 1 | error |
| 2 | usage — a bad flag or a missing argument |
| 3 | not found — no such note, or the link does not resolve |
| 4 | ambiguous — several notes match; `data.candidates` lists them |
| 5 | refused — a stale `--if-unchanged`, a write outside the root or over a note (`--create`), bad UTF-8 |

**`stale`** lists notes that a running slipbox TUI holds with unsaved changes. When it is not
empty, what you read on disk may be older than what the user sees — and if you write such a note,
the user gets a conflict prompt. Tell them, or ask, before writing it.

## Reading notes

`<note>` is a path (relative to the current directory or the root), a named folder's file by its pointer
(`slipbox://research/algorithms/dijkstra.md`, the name as `slipbox folders` shows it; the command then works in that
folder), or a note name (its file's, or an alias) — how a command names a note.
`research:x.md` (the old form) is no longer read: exit 3, the pointer in its message.

```bash
slipbox render <note> --plain            # readable text, tables laid out, no colour
slipbox render <note> --json             # data.lines[], data.headings[{level,text,slug,line}]
slipbox outline <note> --json            # headings with source line numbers
slipbox ls --json                        # every note: path, title, tags, link count
```

`render` is for reading. `slipbox read <note> --json` gives the raw text and its `sha`;
`slipbox stat <note> --json` its `root` and `name`, properties (the frontmatter), size, dates, title, tags and link
counts without the text.

## Finding and changing notes

```bash
slipbox find <text> [<note>] --json      # data.matches[{path,line,column,match,text}]; --regex --whole
slipbox replace <note> <old> <new> --dry-run --json   # see data.changes first, then run it without
slipbox replace --all <old> <new> --dry-run --json    # every note (--files: text files too); undo takes it back
slipbox spell <note> --suggest --json    # data.words[{line,column,word,suggestions}]; its lang:, else [spell]
slipbox task <note> --json               # data.tasks[{line,checked,text}]
slipbox task <note> <line> --check       # tick one (--uncheck, or neither to toggle)
slipbox write <note> --stdin --if-unchanged <sha>     # replace the text, only if unchanged since read
slipbox write <note> '<text>' --append   # add a line at the end
slipbox write <note> --append -- '- item'   # text starting with a dash goes after --
slipbox write <path> '<text>' --create   # a new note
slipbox write <path> --create --allow-empty   # a new, empty note, to fill later
slipbox send <note> --line <n>           # show it to the user in their running nvim
slipbox history --json                   # what the user has been reading, newest first
```

These write atomically and never outside the root, keeping the note's BOM and line endings. Use
`--if-unchanged` with the sha from `read` (or from `replace --dry-run`, or `task`'s list) whenever
you rewrite a note the user may be editing; it refuses (exit 5) instead of clobbering. Check `stale`
first: a note listed there has unsaved changes in the user's TUI — a write still goes through (the
list is advisory), and the user then gets a conflict prompt, so ask before writing it.

- **Search** is plain text with smart case: a lowercase query ignores case, one with a capital
  doesn't (`--ignore-case` forces it); `--regex` for patterns (`^` and `$` are a line's ends),
  `--whole` for whole words. `replace` changes every match, or `--first`, or `--first-per-line`,
  within `--lines A-B` if given; read `data.changes[].text` / `textAfter` before you run it without
  `--dry-run` — a match inside a longer word shows there.
- **Flags** a command doesn't take are refused (exit 2), so `write --dry-run` can't write. The commands that
  change files beyond a note's text — `replace`, `mv`, `rm`, `rename-heading`, `relink`, `convert-links`, `undo`,
  `name`, `init`/`deinit`, `apply` — take `--dry-run`. Those that plan edits take `--plan`: it saves the plan, writing
  nothing, and `slipbox apply <id>` writes it. `write` has neither.
- **Writing:** empty or blank text is refused (exit 2) so a failed pipe can't empty a note; an empty note is made on
  purpose with `--create --allow-empty` and no text. `--append` adds a
  line; `--append --paragraph` adds a block of its own (after a table or paragraph, plain `--append`
  would join it). `--create` paths are from the root unless they start with `./` or `../`;
  exit 3 on `write` means the note doesn't exist yet: add `--create`. A `--create` warning with
  `data.shadows` means other notes have that name: naming it by that name may now find another one, so use its path.
- **Names:** a bare name resolves the same from any folder. If several notes share it, the one in the fewest
  folders wins; a real tie is exit 4 with `data.candidates` — pick one by path, or add `--from <note>` for the one
  nearest it. When it matters which note you get, name it by its path. (For `send`, the candidates are nvims:
  objects with `socket`, `cwd`, `file`.)
- **Link status:** `links` says `note`, `file`, `folder`, `anchor`, `external`, `ambiguous` or `unresolved`;
  `resolve` says `resolved`, `external`, `ambiguous` or `unresolved`.
- **What the user sees:** `history --json` gives `current` (the note on screen, saved by the running
  TUI within a second of a change) and `read` (newest first, `exists: false` for deleted ones).
- **The scratch's project** is the root (the nearest folder holding a root marker: `.git`, `.slipbox`… by default),
  else the folder you're in.

## Following links

```bash
slipbox resolve 'notes/alpha.md#Section Two' --from index.md --json
# data: {status: "resolved", path, abs, heading, line, candidates, how, certainty; root, name: another root's}
slipbox links <note> --json              # outgoing links, each with status and path
slipbox backlinks <note> --json          # notes linking here: line, column, how each is written; `shown`: its path
slipbox links --all --json               # every link here, each with `from`: the broken ones, the fragile ones
slipbox problems --json                  # broken, ambiguous links (where, why); orphans; frontmatter breaking rules
slipbox problems --lint --json           # …and the user's markdownlint-cli2 findings: lint[{file, line, rule, …}]
slipbox tags --json                      # every tag with its count (#a/b counts under #a too)
slipbox tags '#project' --json           # {tag, notes}: the notes carrying it, nested tags included
slipbox types --json                     # document types here (skill, adr, the folder's own): notes each, rules broken
slipbox types adr --json                 # an ADR list in order: number, title, status, supersededBy
slipbox footnotes <note> --json          # each footnote: label, text, definition line, references
slipbox footnotes <note> add 12:30 'Source: the dome log'   # [^N] at line 12, column 30; its definition at the end
slipbox footnotes <note> edit 3 'New text'   # also: rm <label>, rename <label> <new>; --if-unchanged <sha>
slipbox resolve '[text](../home.md)' --from people/x.md   # a markdown link, resolved as one
slipbox resolve slipbox://research/x.md --from notes/plan.md --json   # data.href: the relative path to a file there
slipbox link <note> --from <note>        # a link to <note> as this folder writes them (wikilink or markdown, path form)
slipbox resolve slipbox://notes/inbox.md --json   # a pointer into a named folder: where it is on this machine
slipbox folders --json                   # the named folders pointers use: each name, its copies, the one links open
slipbox search dome shutter --json       # notes ranked by the words: hits[{path, line, column, heading, snippet}]
slipbox search dome --scope linked --json   # and the roots linked to or from this one (all: every root; no worktree)
slipbox changed --json                   # what this branch changed against its base (main): files[{path, state, from?}]
slipbox merge-review feat --json         # before merging feat here: breaks[{path, line, target, cause, by, fix}]
slipbox diff <note> --json               # the note's diff against where the branch left main: rows[{kind, text, line}]
slipbox search '"exact phrase" -draft #project path:notes/'   # phrases, -not, a tag, a folder; prefix* too
slipbox context <note>                   # the note, what it links to and what links to it: one markdown document
slipbox context <note> --depth 2 --limit 40 --no-backlinks   # further out, more files, nothing linking in
```

`slipbox context` is the quickest way into a topic: each file comes as a `## path` section, its `path:1-N` and why
it's included, then its text fenced as on disk; what didn't fit is named under `## Left out`.

Links are read as written: a path relative to the note, `/…` from the root, `~/…`, absolute, `file://`, a
wikilink (`[[name]]`, `[[folder/name#Heading]]`, looked up within the root: names, aliases, attachments), or a
pointer (`slipbox://research/x.md` — a named folder, wherever it is on this machine). Pass `--from` when you follow a
link found inside a note: a relative path is from that note's folder, and a wikilink's ties are broken by where it
is. A link several notes answer to is exit 4 with the candidates; `how` says how each landed, `certainty` whether it's
sure (a tie broken by where the link sits is `inferred`: fragile). `line` is where a `#heading`, `#^block` or `#L42`
lands; one that isn't there still resolves to the note (`line: null`, its top), and a warning names what's missing.
A pointer by a repository's full name opens its default copy, even where a clone of it has a name of its own; a name
different folders have is exit 4, each folder's path a candidate. **To add a link, ask `slipbox link <note> --from
<note>`** — it writes it in this folder's convention (a wikilink or a markdown link, its path form), or as a pointer
into a named folder that doesn't travel with this one. The old `research:x.md` form is no link: exit 3, with the
pointer that is one in `suggest`. A note name on the command line, shared by several notes, goes to the one in the
fewest folders; a real tie is exit 4 with the candidates: pick one, or add `--from` for the nearest.

## Moving, renaming and deleting

Every link to what moves is rewritten, in this root and in the roots linking into it, each in its own form. Preview
first, or plan and apply:

```bash
slipbox mv <note> <path> --dry-run --json   # rename or move a note, file or folder: data.files[].edits, nothing written
slipbox mv <note> <path> --plan          # saved, nothing written; slipbox apply <id> writes it (5: a file changed)
slipbox apply                            # the plans waiting, newest first
slipbox rename-heading <note> <old> <new> --dry-run   # a heading and every link to it
slipbox rm <note> --dry-run              # to slipbox's trash; says how many links break (data.breaking)
slipbox trash                            # what's there; slipbox trash restore <id|path> puts one back
slipbox trash empty                      # what emptying removes for good; --yes removes it (it keeps 30 days anyway)
slipbox undo --dry-run                   # take back the last mv, rename-heading, relink, convert-links, replace --all
```

The new path is from the root (or `./`, `../` from here). A folder that's there, or a path ending in `/`, is moved
into, the name kept: `mv <note> archive/` makes `archive/<note>`. Any other path is the whole new path. Ask before
deleting, emptying the trash or moving the user's notes.

## Exporting for the user

```bash
slipbox export <note> --json             # a Word document beside the note, its name: data.path, where it went
slipbox export <note> --to pdf           # also html (one file), epub, md (portable; its pictures beside it)
slipbox export <note> <note> -o out/both.docx   # several notes as one document, a chapter each
slipbox export <note> -o out/                   # into a folder (made if missing), under the note's name
```

Embeds are drawn in, diagrams and display maths drawn as pictures, and links to the notes exported stay links inside
the document; nothing is fetched (a picture on the web is its cached copy, or its link). A Markdown export copies
only the root's pictures; anything else stays a link. It never writes over a note, of any root (exit 5; an earlier
Markdown export aside: `name.export.md`).

## Capturing for the user — the scratch

The scratch is a markdown file per project. The user reads it in the TUI (`space s s`) and copies
it into their next prompt. Append to it; never rewrite it.

```bash
slipbox capture "Why does the walk skip nested roots?"   # free text
slipbox capture --ref src/core/walk.ts:42-50              # a reference: `src/core/walk.ts:42-50`
slipbox capture --ref src/core/walk.ts:42-50 --snippet    # plus the lines, fenced
printf '%s' "$text" | slipbox capture --ref notes/a.md:7 --stdin   # stdin becomes the snippet
slipbox scratch show --json              # data.content, data.sha
slipbox scratch path                     # where it lives
slipbox scratch clear --if-unchanged <sha>   # clear only if nobody appended since you read it
```

Reference forms: `path:42`, `path:42-50`, `path:42:10-30` (line 42, columns 10–30), `path:42:10-50:30`.
Paths inside the project are stored relative to it.

## Don'ts

- Don't parse human output; use `--json`.
- Don't clear the scratch without `--if-unchanged`, and only when the user asked.
- Don't write into `.slipbox/` or the cache and state directories; `info` shows where they
  are.
- Don't start the TUI from a script. It refuses without a terminal and exits 2.
- Don't `send` a note to the user's editor unless they asked to see it, or `export` one unless they asked for a
  document.
