# Scratch and context

Use the scratch to collect particular places and excerpts while you read. Use a context bundle to gather a note and
its linked material. Both give you text to review before sharing; neither sends a prompt to an agent automatically.

## The scratch

The scratch is a Markdown file where you collect references and snippets to hand to an agent. It holds lines of your
notes and code, each with its `path:line`. You paste it into a prompt when you are ready.

Each vault has its own scratch, kept in slipbox's own state folder. It is outside your notes, and never committed. With
`capture.location = "root"`, it is a note in the vault instead: `scratch.md`, or the name in `capture.file`.

| Key | What it does |
| --- | --- |
| `space s a` | Adds the selection with its lines (`ideas/coffee.md:12-18`), or the cursor row's `path:line` |
| `space s s` | Opens the scratch. It updates as things are added |
| `space s r` | Opens the scratch in the window on the right |
| `space s y` | Copies the whole scratch |
| `space s d` | Clears the scratch, after asking |
| `space s c` | Copies the note's context for an agent: the note, what it links to, what links to it |

The scratch opens in a window floating in the middle of the screen. Use it to jot something down, or to read what
you have gathered.

It's a window like any other. The scratch is rendered, the lens edits it, and `ctrl+k` shows its Markdown. Every key
you move and edit with works there.

- `q` closes it and takes you back where you were. What you typed is saved.
- `esc` stops typing and leaves the lens, as it always does. Then it closes the scratch.

It opens when it's empty too.

With `capture.open_in = "right"`, or Scratch opens in the [UI settings](screen.md#ui-settings), it opens in the window
on the right instead, beside your note. `ctrl+w w` goes back and forth.

Each time you add to it, it opens on what you added, ready for you to type a note about it:

````markdown
**At:** `ideas/coffee.md:5`

**Note:** check the ratio for the small pot

---

**At:** `ideas/coffee.md:3-5`

```markdown
## Brewing

A ratio of 1 to 16 suits a pour-over.
```

**Note:** ▌
````

`esc` then `q` takes you back to the note. If you close it without typing, the empty **Note:** goes. So you can add a
few places quickly and write one note at the last. A line divides each entry from the one before.

Other programs add to the scratch with `slipbox capture`. That is how your editor or an agent puts things there:

```bash
slipbox capture 'check the grind size'            # a line of text
slipbox capture --ref ideas/coffee.md:12-18       # a reference
slipbox capture --ref ideas/coffee.md:5 'check it'   # a reference, and a note on it
slipbox capture --snippet --ref ideas/coffee.md:12-18   # the reference and its lines
slipbox scratch show                              # what it holds; also: path, copy, clear
```

[Working with agents](../guides/agents.md) shows how to capture from nvim, and the context bundle.

## The context bundle

A note's context is one Markdown document that holds:

- the note
- the notes and files it links to
- the notes linking to it

1. On a note, press `space s c`. slipbox copies its context. A message says what went in:
   `copied the context of ideas/coffee.md: 2 files (0 linked, 1 linking to it), …`.
2. Paste it into the agent's prompt.

Each file is a section with its path, its lines and why it's there. Then comes its text, as it is on disk. Unsaved
notes are saved first, so the context holds what you see.

The agent can gather the same itself:

```bash
slipbox context ideas/coffee
slipbox context ideas/coffee --depth 2 --limit 40 --no-backlinks
```

| Flag | Does |
| --- | --- |
| `--depth` | Follows links further out (1 by default) |
| `--limit` | Caps the files (25) |
| `--no-backlinks` | Leaves out the notes linking in |

What didn't fit is named at the end. `context.depth`, `context.limit` and `context.backlinks` change the defaults.


## Keep the saved-file boundary clear

CLI commands read saved files. A TUI context copy saves unsaved notes first, as described above; a CLI context
command cannot inspect text left unsaved in a running window. Review what you copy, especially when following
links adds other files.

[Working with agents](../guides/agents.md) demonstrates a complete collaboration session. Exact options are in
[Commands and flags](cli.md#the-scratch-and-the-context-bundle).
