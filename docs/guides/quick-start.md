# Quick start

Install slipbox, open a folder of notes, and read, find and edit in it. It takes two minutes. You don't need to learn
the keys first.

## Install

```bash
curl -fsSL https://remziduzagac.github.io/slipbox/install.sh | sh
```

slipbox runs in a terminal on macOS, Linux, and Windows through WSL. [Installing slipbox](install.md) has the other
ways to install it, and how to upgrade.

## Open a folder

```bash
slipbox ~/notes
```

Any folder of Markdown files works. slipbox writes nothing into it until you save a note.

The explorer is on the left and a note is on the right, rendered. The status line runs along the bottom. It shows the
mode (`READ`), the note's path, and where the cursor is.

## Look around

Use the mouse to start. Click a note in the explorer, a link, or a tab. Scroll with the wheel.

Two keys teach you the rest:

- `space` shows the keys that can follow it, in groups. `esc` closes it.
- `?` lists every key. Type to filter the list.

These are the keys you'll use most:

| To | Press |
| --- | --- |
| Move down or up | `j` and `k`, or the arrow keys |
| Open a note by its name | `ctrl+p`, then type part of the name |
| Jump to the next link | `tab` |
| Follow the link at the cursor | `enter` |
| Go back | `ctrl+o` |
| Find in this note | `/` and type, then `enter`; `n` goes to the next match |
| Search every note | `space f s` |
| Close a tab | `q` |
| Quit | `ctrl+q` |

## Edit

1. Put the cursor on a line and press `i`. The lens opens: that part of the note shows its Markdown, and the rest stays
   rendered.
2. Press `i` again and type.
3. Press `esc` to stop typing, and `ctrl+s` to save.
4. Press `esc` again to close the lens.

You don't have to save by hand. A changed note saves itself after 30 seconds without a key pressed.

To see the whole note as Markdown instead, press `ctrl+k`. Press it again to go back.

## Next

- [Getting started](getting-started.md): a ten-minute tour of the same steps, in more detail.
- [Concepts](../manual/concepts.md): the words slipbox uses, each in a few lines.
- [Working with agents](agents.md): slipbox beside a coding agent, on the same files.
- [Keys](../manual/keys.md): every key.
