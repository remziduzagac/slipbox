# Quick start

<a id="install"></a>
<a id="open-a-folder"></a>
<a id="look-around"></a>
<a id="edit"></a>
<a id="next"></a>

Open a note, make a small change and save it. You need [slipbox installed](install.md), a terminal and a Markdown
file you are happy to edit. No agent, configuration or knowledge of vim is required.

## Open a note

For example, if you keep notes in `~/notes`:

```bash
slipbox ~/notes/inbox.md
```

Replace that path with an existing note of yours. You can also open a folder, such as `slipbox ~/notes`, and pick a
file in the explorer. The following steps work in either case.

The explorer is on the left, the document on the right, and the status line below. `READ` means you are navigating
the rendered document. Click in the note or use the arrow keys to move its reading cursor.

![A note, ~/notes/inbox.md, open in READ: the explorer on the left, the note rendered in its tab, the status line
below](../images/quick-start-reading.png)

## Find something

Press `ctrl+f`, type a word from the note and press `enter`. The cursor moves to a match. `esc` closes an active
prompt or search display; it also helps you return from a panel to the note.

`ctrl+p` finds another file by name. `space` shows the available action groups; `?` shows all key bindings.

## Change a line

1. Put the reading cursor on a line and press `i`. The lens shows that part's Markdown; the status says `LENS`.
2. Press `i` again. The status says `INSERT`, and keys now insert text.
3. Type your change, then press `esc` to stop typing.
4. Press `ctrl+s` to save. Look for the saved message and the disappearance of the unsaved mark on the tab.
5. Press `esc` again to close the lens and read the rendered result.

The first `i` opens a view of the source; the second starts typing. That distinction keeps a reading action from
immediately changing your file. [Reading and editing in slipbox](lens.md) walks through it in detail.

To inspect the whole file's Markdown, use `ctrl+k`. Press it again to return to rendered reading. If you are typing,
press `esc` first.

## Finish

Press `ctrl+q` to quit. A changed note also autosaves after 30 seconds without a key press by default, but saving
explicitly here makes the result easy to check.

**Next:** [Working with slipbox](getting-started.md), a first session with two linked notes, search and a saved edit.
