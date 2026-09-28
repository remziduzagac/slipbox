---
name: slipbox
description: >-
  Drive the slipbox markdown vault from the shell: render a note as readable text, follow
  [[wikilinks]] to files, list links and backlinks, outline a note, and append file:line
  references or text to the per-project scratch that the user reads in the slipbox TUI. Use when
  the user mentions slipbox, their notes vault, the scratch, or asks to capture a reference for
  later; or when a directory contains a `.slipbox/` marker and you need to navigate its notes.
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
| 5 | refused — `--if-unchanged` did not match |

**`stale`** lists notes that a running slipbox TUI holds with unsaved changes. When it is not
empty, what you read on disk may be older than what the user sees — and if you write such a note,
the user gets a conflict prompt. Tell them, or ask, before writing it.

## Reading notes

`<note>` is a path (relative to the current directory or the vault) or a note name, which
resolves like a `[[wikilink]]`.

```bash
slipbox render <note> --plain            # readable text, tables laid out, no colour
slipbox render <note> --json             # data.lines[], data.headings[{level,text,slug,line}]
slipbox outline <note> --json            # headings with source line numbers
slipbox ls --json                        # every note: path, title, tags, link count
```

`render` is for reading. When you edit, edit the raw markdown file itself.

## Following links

```bash
slipbox resolve '[[alpha#Section Two]]' --from index.md --json
# data: {status: "resolved", path, abs, heading, line, candidates}
slipbox links <note> --json              # outgoing links, each with status and path
slipbox backlinks <note> --json          # notes linking here, with line numbers
```

Quote wikilinks on the command line: zsh treats unquoted `[[…]]` as a glob and fails with "no
matches found" before slipbox runs. Resolution is case-insensitive on every OS. A name shared by
several notes resolves to the one nearest the linking note, so always pass `--from` when you are
following a link found inside a note. With no single nearest match, you get exit 4 and the
candidates. Pick one, or ask the user.

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
