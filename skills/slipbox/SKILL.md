---
name: slipbox
description: >-
  Drive the slipbox markdown vault from the shell: find text across notes, read and safely write
  notes (atomic, never clobbering a note the user changed), replace text, tick tasks, render a
  note as readable text, follow links (plain paths), list links and backlinks, outline a note, see what
  the user is reading, and append file:line references or text to the per-project scratch the user
  reads in the slipbox TUI. Use when the user mentions slipbox, their notes vault, the scratch, or
  asks to capture a reference for later; or when a directory contains a `.slipbox/` marker and you
  need to find, read or change its notes.
---

# slipbox

slipbox is a terminal markdown notes app. The user reads notes in its TUI; you use its CLI. Both
see the same files: **disk is the contract**. You never see the user's unsaved state, and the
TUI reloads a note the moment you write it.

## Before anything

```bash
slipbox info --json          # vault root, mode, paths, note count, stale files
```

A vault is a directory with a `.slipbox/` marker. Commands find it by walking up from the
current directory, or from the note you name. `--root <dir>` overrides the search. Without a
marker, slipbox runs in single-file mode: links resolve only inside that one directory, and
`info` says so.

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
| 5 | refused — a stale `--if-unchanged`, a write outside the vault or over a note (`--create`), bad UTF-8 |

**`stale`** lists notes that a running slipbox TUI holds with unsaved changes. When it is not
empty, what you read on disk may be older than what the user sees — and if you write such a note,
the user gets a conflict prompt. Tell them, or ask, before writing it.

## Reading notes

`<note>` is a path (relative to the current directory or the vault), a file of another vault as `vault:path`
(`research:algorithms/dijkstra.md`, the vault named as `slipbox vaults` shows it; the command then works in that
vault), or a note name (its file's, or an alias) — how a command names a note; links themselves are paths.

```bash
slipbox render <note> --plain            # readable text, tables laid out, no colour
slipbox render <note> --json             # data.lines[], data.headings[{level,text,slug,line}]
slipbox outline <note> --json            # headings with source line numbers
slipbox ls --json                        # every note: path, title, tags, link count
```

`render` is for reading. `slipbox read <note> --json` gives the raw text and its `sha`;
`slipbox stat <note> --json` its vault, properties (the frontmatter), size, dates, title, tags and link counts
without the text.

## Finding and changing notes

```bash
slipbox find <text> [<note>] --json      # data.matches[{path,line,column,match,text}]; --regex --whole
slipbox replace <note> <old> <new> --dry-run --json   # see data.changes first, then run it without
slipbox task <note> --json               # data.tasks[{line,checked,text}]
slipbox task <note> <line> --check       # tick one (--uncheck, or neither to toggle)
slipbox write <note> --stdin --if-unchanged <sha>     # replace the text, only if unchanged since read
slipbox write <note> '<text>' --append   # add a line at the end
slipbox write <note> --append -- '- item'   # text starting with a dash goes after --
slipbox write <path> '<text>' --create   # a new note
slipbox send <note> --line <n>           # show it to the user in their running nvim
slipbox history --json                   # what the user has been reading, newest first
```

These write atomically and never outside the vault, keeping the note's BOM and line endings. Use
`--if-unchanged` with the sha from `read` (or from `replace --dry-run`, or `task`'s list) whenever
you rewrite a note the user may be editing; it refuses (exit 5) instead of clobbering. Check `stale`
first: a note listed there has unsaved changes in the user's TUI — a write still goes through (the
list is advisory), and the user then gets a conflict prompt, so ask before writing it.

- **Search** is plain text with smart case: a lowercase query ignores case, one with a capital
  doesn't (`--ignore-case` forces it); `--regex` for patterns (`^` and `$` are a line's ends),
  `--whole` for whole words. `replace` changes every match, or `--first`, or `--first-per-line`,
  within `--lines A-B` if given; read `data.changes[].text` / `textAfter` before you run it without
  `--dry-run` — a match inside a longer word shows there.
- **Flags** a command doesn't take are refused (exit 2): only `replace` has `--dry-run`.
- **Writing:** empty or blank text is refused (exit 2) so a failed pipe can't empty a note. `--append` adds a
  line; `--append --paragraph` adds a block of its own (after a table or paragraph, plain `--append`
  would join it). `--create` paths are from the vault root unless they start with `./` or `../`;
  exit 3 on `write` means the note doesn't exist yet: add `--create`. A `--create` warning with
  `data.shadows` means other notes have that name: naming it by that name may now be exit 4.
- **Names:** a bare name resolves the same from any folder; if several notes share it you get exit 4
  and `data.candidates` — pick one by path, or add `--from <note>` for the one nearest it. (For
  `send`, the candidates are nvims: objects with `socket`, `cwd`, `file`.)
- **Link status:** `links` says `note`, `file`, `anchor`, `external`, `ambiguous` or `unresolved`;
  `resolve` says `resolved`, `external`, `ambiguous` or `unresolved`.
- **What the user sees:** `history --json` gives `current` (the note on screen, saved by the running
  TUI within a second of a change) and `read` (newest first, `exists: false` for deleted ones).
- **The scratch's project** is the vault root, else the git top level, else the current folder.

## Following links

```bash
slipbox resolve 'notes/alpha.md#Section Two' --from index.md --json
# data: {status: "resolved", path, abs, heading, line, candidates}
slipbox links <note> --json              # outgoing links, each with status and path
slipbox backlinks <note> --json          # notes linking here: line, column, how each is written; `shown`: vault:path
slipbox links --all --json               # every link in the vault, each with `from`: the broken ones
slipbox problems --json                  # broken and ambiguous links (where, why), and orphans: notes nothing links to
slipbox problems --lint --json           # …and the user's markdownlint-cli2 findings: lint[{file, line, rule, …}]
slipbox tags --json                      # every tag with its count (#a/b counts under #a too)
slipbox tags '#project' --json           # {tag, notes}: the notes carrying it, nested tags included
slipbox footnotes <note> --json          # each footnote: label, text, definition line, references
slipbox footnotes <note> add 12:30 'Source: the dome log'   # [^N] at line 12, column 30; its definition at the end
slipbox footnotes <note> edit 3 'New text'   # also: rm <label>, rename <label> <new>; --if-unchanged <sha>
slipbox resolve '[text](../home.md)' --from people/x.md   # a markdown link, resolved as one
slipbox resolve research:algorithms/dijkstra.md --from notes/plan.md --json   # data.href: the path to write in a link
slipbox link <note> --from <note>        # a link to <note> as this folder writes them (wikilink or markdown, its path form)
slipbox resolve slipbox://notes/inbox.md --json   # a pointer into a named folder: where it is on this machine
slipbox folders --json                   # the named folders pointers use: each name, its copies, the one links open
slipbox search dome shutter --json       # notes ranked by the words: hits[{path, line, column, heading, snippet}]
slipbox changed --json                   # what this branch changed against main: files[{path, state, from?}]
slipbox merge-review feat --json         # before merging feat here: breaks[{path, line, target, cause, by, fix}]
slipbox diff <note> --json               # the note's diff against where the branch left main: rows[{kind, text, line}]
slipbox search '"exact phrase" -draft #project path:notes/'   # phrases, -not, a tag, a folder; prefix* too
slipbox context <note>                   # the note, what it links to and what links to it: one markdown document
slipbox context <note> --depth 2 --limit 40 --no-backlinks   # further out, more files, nothing linking in
```

`slipbox context` is the quickest way into a topic: each file comes as a `## path` section, its `path:1-N` and why
it's included, then its text fenced as on disk; what didn't fit is named under `## Left out`.

Links are paths: relative to the note (what slipbox writes), `~/…`, absolute, or `file://`. Pass `--from` when you
follow a link found inside a note — its path is from that note's folder. A note's path resolves whatever its case.
Wikilinks (`[[…]]`) aren't links: text, never resolved by a name (`resolve` says so, exit 3);
`slipbox convert-links --plan` rewrites a vault's as paths, for you to review and `slipbox apply`. A note name on the
command line, shared by several notes, is exit 4 with the candidates: pick one, or add `--from` for the nearest.

## Capturing for the user — the scratch

The scratch is a markdown file per project. The user reads it in the TUI (`space s s`) and copies
it into their next prompt. Append to it; never rewrite it.

```bash
slipbox capture "Why does the walk skip nested vaults?"   # free text
slipbox capture --ref src/core/walk.ts:42-50              # a reference: `src/core/walk.ts:42-50`
slipbox capture --ref src/core/walk.ts:42-50 --snippet    # plus the lines, fenced
printf '%s' "$text" | slipbox capture --ref notes/a.md:7 --stdin   # stdin becomes the snippet
slipbox scratch show --json              # data.content, data.sha
slipbox scratch path                     # where it lives
slipbox scratch clear --if-unchanged <sha>   # clear only if nobody appended since you read it
```

Reference forms follow GitHub: `path:42`, `path:42-50`, `path:42:10-30`, `path:42:10-50:30`.
Paths inside the project are stored relative to it.

## Don'ts

- Don't parse human output; use `--json`.
- Don't clear the scratch without `--if-unchanged`, and only when the user asked.
- Don't write into `.slipbox/` or the cache and state directories; `info` shows where they
  are.
- Don't start the TUI from a script. It refuses without a terminal and exits 2.
- Don't `send` a note to the user's editor unless they asked to see it.
