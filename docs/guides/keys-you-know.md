# Keys you already know

You don't need vim to use slipbox. The arrow keys move, `shift` with an arrow selects, and `ctrl+s` saves. Many
shortcuts from VS Code and Obsidian do what you expect. This page lists them, and the few keys that are new.

vim's keys work too, beside these. Use either, or mix them.

## The four new keys

Four keys have no match in a desktop editor. Learn these, and the rest of this page is familiar.

| Key | What it does |
| --- | --- |
| `i` | Starts typing at the cursor. On a rendered note, the first `i` opens the lens, and the second types |
| `esc` | Stops typing. A second `esc` closes the lens |
| `space` | Opens a menu of everything else, in groups, and shows which key comes next |
| `?` | Lists every key. Type to filter the list |

slipbox shows a note rendered, and a key there is a command, not a letter typed. For example, `q` closes the tab. To
type, press `i` first. The chip at the left of the status line says `INSERT` while you type.

The lens shows the Markdown around the cursor, with the rest of the note still rendered. [Editing](../manual/editing.md)
says more about it.

To type at the first `i`, set `editor.edit_in = "source"` ([Configuration](../manual/configuration.md)). Then `i`
shows the whole note as Markdown and types at once.

## Moving

| To move | Press |
| --- | --- |
| A character, or a row | The arrow keys |
| A word | `ctrl+left` / `ctrl+right`, or `alt+left` / `alt+right` on a Mac |
| To the row's start / end | `home` / `end`, or `cmd+left` / `cmd+right` on a Mac |
| A page | `pageup` / `pagedown` |
| To the note's top / bottom | `ctrl+home` / `ctrl+end` |
| A paragraph | `ctrl+up` / `ctrl+down` |
| A heading | `alt+up` / `alt+down` |
| To a line by its number | `ctrl+g` |

The arrows, the word keys, `home`, `end` and the page keys move while you type too.

A click puts the cursor where you click. The wheel scrolls.

## Selecting and the clipboard

| To | Press |
| --- | --- |
| Select | `shift` with a key that moves, or a drag |
| Select a word / a row | A double-click / a triple-click |
| Copy / cut / paste | `ctrl+c` / `ctrl+x` / `ctrl+v` |
| Delete the selection | `backspace` or `delete`, in the lens or source mode |
| Clear the selection | `esc` |

A drag, a double-click and a triple-click also copy what they select, as a terminal does.

## Editing

While you type, these keys work as in any editor:

| To | Press |
| --- | --- |
| Delete | `backspace` / `delete` |
| Delete the word before the cursor | `ctrl+w` |
| Replace a selection | Type, or paste |
| Indent / outdent the line | `tab` / `shift+tab` |
| Comment the line out, or back in | `ctrl+/` |
| Complete a word | `ctrl+n` |
| Undo / redo | `ctrl+z` / `ctrl+y` |
| Save | `ctrl+s` |

When you're not typing, these work on the note:

| To | Press |
| --- | --- |
| Save | `ctrl+s` |
| Undo / redo | `ctrl+z` / `ctrl+y` |
| Move the line up / down | `alt+shift+up` / `alt+shift+down` |
| Tick a task, or untick it | `ctrl+l`, or a click on its box |
| See the whole note as Markdown, and back | `ctrl+k` |

A changed note saves itself after 30 seconds without a key pressed.

## Finding

| To | Press |
| --- | --- |
| Find in this note | `ctrl+f` |
| Find and replace in this note | `ctrl+h` |
| Find text in every note | `ctrl+shift+f` |
| Find and replace in every note | `ctrl+shift+h` |
| Open a note by its name | `ctrl+p` |
| Run a command by its name | `ctrl+shift+p` |

## Links, tabs and windows

| To | Press |
| --- | --- |
| Go to the next / previous link | `tab` / `shift+tab` |
| Follow the link at the cursor | `enter`, or a click |
| Follow it in a new tab | `ctrl+enter` |
| Go back | `ctrl+o` |
| Make a note / a folder | `ctrl+n` / `ctrl+shift+n` |
| Go to the next / previous tab | `ctrl+tab` / `ctrl+shift+tab`, or `ctrl+pagedown` / `ctrl+pageup` |
| Go to tab 1 to 9 | `alt+1` to `alt+9` |
| Split the window | `ctrl+\` |
| Close the tab, or the window | `q`, or a click on the tab's `×` |
| Quit | `ctrl+q` |

## Where slipbox differs

A few keys do something else here than in a desktop editor.

- **`ctrl+a` doesn't select everything.** It goes to the row's start, since a Mac terminal sends it for `cmd+left`. To
  select the whole note, press `ctrl+home`, then `ctrl+shift+end`.
- **`ctrl+w` doesn't close the tab.** It starts the window keys, and while you type it deletes a word. `q` closes.
- **`alt+up` and `alt+down` move by heading.** `alt+shift+up` and `alt+shift+down` move lines.
- **A click ends typing.** The cursor goes where you clicked. Press `i` to type there.
- **`q` closes, and never quits.** While you type, it's a letter like any other.
- **Your terminal may take a `ctrl` key first.** zellij, for one, takes `ctrl+p` and `ctrl+o`. Every `ctrl` key has
  another way under `space`. For example, `space f f` opens a note by its name.

## Next

- [Quick start](quick-start.md): open a folder, find your way, edit a note.
- [Editing](../manual/editing.md): typing, the lens and source mode.
- [Keys](../manual/keys.md): every key, vim's among them.
- [Making it yours](making-it-yours.md): change any key.
