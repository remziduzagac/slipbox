# The lens

The lens is how you edit a note without leaving the page you're reading. The part you're working on shows as its
Markdown, between two rules. Everything above and below it stays rendered: the headings, the tables, the links and
the pictures, as you were reading them.

This guide shows what the lens is, when to use it rather than source mode, how it opens and grows, and how you type in
it. Each part has an example. [Editing](../manual/editing.md#the-lens) is the reference.

The examples use a note from a folder of notes, `projects/brevet-300.md`: a plan for a 300 km bike ride, with a
table of training weeks, a paragraph on food and a checklist of gear.

## What the lens is

A rendered note hides its Markdown: you see a heading, not `## Food`, a link's text, not its target, a table's
columns, not its pipes. That's what you want while you read. To change the text, you need to see what's written.

The lens shows what's written only where you are. Put the cursor on the paragraph about food, and press `space n l`.

![The lens open on the note's Food section: its heading and paragraph as Markdown between two rules, the training
table rendered above and the gear checklist rendered below, the status line reading LENS](../images/lens-open.png)

- The heading and the paragraph show as written, `## Food` and all, between two heavy rules. The rows between the
  rules are tinted, so the lens stands out from the page.
- The top rule says which lines of the file the lens holds: `source · lines 30–35`.
- The table above and the checklist below stay rendered.
- A narrow column before the lens's rows counts each row's distance from the cursor's. The cursor's row shows `0`.
  The gutter keeps the lines' own numbers.
- The status line says `LENS`.

The lens always holds whole blocks. A block is a paragraph, a heading, a list item, a table, a code block or a quote.
So what you see between the rules is always a piece of Markdown that makes sense alone, and the page around it is
never half rendered.

`esc` closes the lens, and the whole note renders again.

## When to use it, and when source mode

slipbox has two ways to edit a note's Markdown. The lens shows the part you're working on. Source mode (`ctrl+k`, or
`space n v`) shows the whole note as Markdown. Both edit the same text with the same keys, and you can switch between
them at any time.

Use the lens for changes that sit in one place, while you read:

- fixing a word or a sentence in a paragraph
- adding a task to a list
- changing a table's cell, with the other rows' pipes in view
- changing a link's target, which the rendered page hides
- writing a new paragraph under the one you just read

The rest of the note stays as you read it, so you keep your place. When you close the lens, you're where you were.

Use source mode when the change is the note's shape:

- moving sections around, or cutting from one end and pasting at the other
- a replace across the whole note, such as `:%s/old/new/g`
- reading the Markdown of the whole note at once, to check its links or its front matter
- a long paste you want to see all of

For example, to swap the Food and Gear checklist sections, press `ctrl+k`. The whole note shows as Markdown, and `d`
and `p` move the lines. `ctrl+k` again renders it.

The editing keys, `i`, `a` and `o`, open the lens on a rendered note. If you'd rather they went to source mode,
`editor.edit_in = "source"` says so ([Make it yours](#make-it-yours)).

## Open it

There are two ways in:

- **Start editing.** Press `i`, `a` or `o` on a rendered note. The first press opens the lens at the cursor, and a
  message says `the lens: the markdown around the cursor — the key again edits it, esc closes it`. The second press
  types: `i` before the cursor, `a` after it, `o` on a new line below.
- **Just look.** `space n l` (or `:lens`) opens the lens without typing. You can read the Markdown, move about in it,
  and use vim's commands on it.

`esc` steps back out, one level at a time. From typing, the first `esc` stops typing and the second closes the lens.

### How much it holds

The lens opens on the section the cursor is in: its heading and everything under it, up to the next heading of its
level or above. It does so when the section fits in half the window. That's why the Food section opened whole above:
a heading and a paragraph.

A section too long for that opens on the cursor's block instead, with the blocks around it, until the lens holds at
least six rows. For example, in the window of these pictures, the gear checklist is too long for half of it. With the
cursor on "Reflective ankle bands", the lens opens on that item and the items next to it, and the rest of the
checklist stays rendered above and below.

A neighbour comes in only if the lens still fits in half the window with it. So a short paragraph next to a long table
doesn't take the table in with it.

`editor.lens_max` and `editor.lens_min_rows` change the half and the six ([Make it yours](#make-it-yours)).

## Move it, and grow it

When you're not typing, the cursor moves through the lens as it does through the page, and the lens comes along:

- **Past its edge.** Moving past a rule, with `j` and `k` or the arrows, takes the next block in. If that block's
  section fits whole, the lens moves onto the section. Blocks far from the cursor drop out as the lens passes the
  half-window limit.
- **A jump.** `g g`, a search, or a heading picked in the outline moves the lens to where you land.
- **A click.** A click in the rendered text outside the lens moves the lens there. The line you clicked stays under the
  pointer.
- **The wheel.** It scrolls the page, and the lens rides along with its text.
- **Another note.** Following a link from the lens, or going back with `ctrl+o`, opens the lens on the note you land
  on.

The lens keeps its place on the screen as it moves, and the page scrolls under it. Your eyes stay where they were.

To choose its size yourself:

| Key | What it does |
| --- | --- |
| `+` | Takes the next block in. At the note's end, the one above |
| `-` | Drops the block farthest from the cursor |
| `=` | Lets the lens size itself again |

After `+` or `-`, the lens keeps that size as it moves. For example, when the lens opened on a paragraph alone and
you'd like the list under it in view as you write, press `+` until the list is in.

A block taller than the lens, such as a very long table or code block, scrolls inside it. The rules count the rows out
of sight: `↑ 21 lines` above, `↓ 8 lines` below.

## Type in it

With the lens open, `i`, `a` or `o` types. The rules and the tint turn green, the label says `editing`, and the status
line says `INSERT`.

As you type, the lens grows with what you write. Each new line pushes its bottom rule down, and the rendered note below
moves down with it.

For example, to add two items to the gear checklist:

1. Put the cursor on "Reflective ankle bands". The lens isn't open yet.
2. Press `o`. The lens opens on that item and its neighbours, as written: `- [ ] Reflective ankle bands`.
3. Press `o` again. A new task, `- [ ]`, starts on the line below, and you're typing.
4. Type `Spare batteries for the rear light`, press `enter`, and type `Arm warmers for the night`. `enter` in a list
   starts the next item for you.

   ![The lens grown while typing: two new tasks typed into the gear checklist, the rules green, the label saying
   editing, the status line reading INSERT](../images/lens-typing.png)

5. Press `esc` to stop typing. The rules lose their green, and the status line says `LENS`.
6. Press `esc` again to close the lens. The checklist renders with its two new boxes.

While you type, the arrow keys stop at the lens's rules, and `pageup` and `pagedown` go as far as its edge. To go
further, stop typing first: `esc`, then move, and the lens comes along.

Everything you type between `i` and `esc` is one step for `u` to undo. `ctrl+s` saves at any time, and a changed note
saves itself after 30 seconds without a key ([Saving](../manual/editing.md#saving)).

### vim's keys in the lens

When you're not typing, the keys work on the text in the lens, vim's commands included: `d d`, `c i w`, `y a p`, `.`
and the rest ([The vim keys](../manual/editing.md#the-vim-keys)).

The counters' column is there for those. To delete the cursor's line and the two below it, read the `2` off the
column on the last of them, and press `d 2 j`.

For example, to change "the big meal" in the food paragraph to "the hot meal":

1. Put the cursor on the paragraph, and press `space n l`. The lens opens on the Food section.
2. Type `/big` and press `enter`. The cursor goes to "big", inside the lens.
3. Press `c i w`, type `hot`, and press `esc`. The word is changed, and you're not typing any more.
4. Press `esc` to close the lens, and `esc` again to close the find row.

## Its keys

| Key | What it does |
| --- | --- |
| `i`, `a`, `o` (and `shift+i`, `shift+a`, `shift+o`) | On a rendered note, opens the lens. In the lens, types |
| `space n l` (or `:lens`) | Opens the lens without typing, and closes it |
| `esc` | Stops typing. When you're not typing, closes the lens |
| `j`, `k`, the arrows | Move. Past an edge, the lens moves with you |
| The arrows while you type | Move, and stop at the rules |
| `+` / `-` / `=` | A block more / a block less / the lens's own size again |
| `ctrl+k` | Source mode instead: the whole note as Markdown |
| `ctrl+s` | Saves |

[Keys](../manual/keys.md) has every key, and you can change any of them.

## Beyond notes

The lens works wherever slipbox renders something you can edit:

- **Data files.** JSON, YAML, TOML and the like open rendered. The lens edits them a card at a time: a key and the
  values under it. A CSV's lens is a few of its rows.
- **Code.** In the code view, the editing keys open the lens on the cursor's cell, a function or a class, highlighted
  as code. `space k e` opens it on a whole cell however tall ([Code](../manual/code.md)).
- **The scratch.** The scratch is a note like any other, and the lens edits it. `esc` leaves the lens first, and then
  closes the scratch ([Working with agents](agents.md#hand-the-agent-references-the-scratch)).
- **A merge's conflict.** On the merge screen, `e` puts the result in the file and opens the lens on the conflict, to
  settle it by hand ([Code and git](code-and-git.md#settle-a-conflict-on-the-merge-screen)).

## Make it yours

In your configuration ([Configuration](../manual/configuration.md)):

```toml
[editor]
edit_in = "live"        # where i, a and o take a rendered note: live (the lens), or source
lens_min_rows = 6       # the lens takes in the blocks around the cursor up to at least this many rows…
lens_max = 0.5          # …and stops at this share of the window

[ui]
relative_numbers = "lens"   # the counters' column in the lens; "off" hides it
```

The lens's colours are `lens` (its rules and label), `lens_band` (its rows) and, while you type, `lens_edit` and
`lens_band_edit`, under `[colors]`.

## Where next

- [Editing](../manual/editing.md): the lens and source mode in full, typing, undo, the vim keys, saving.
- [Keys you already know](keys-you-know.md): the shortcuts from other editors that work while you type.
- [Getting started](getting-started.md): a first session, with a line typed in the lens.
