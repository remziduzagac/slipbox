# Reading and editing in slipbox

<a id="the-lens"></a>
<a id="how-much-it-holds"></a>
<a id="vims-keys-in-the-lens"></a>

slipbox has two views: READ and SOURCE. The lens toggles within READ, exposing the source around the cursor.
Vim mode (NORMAL, INSERT or VISUAL) is shown beside the view. This guide follows one note through those choices.

You need an installed slipbox and a small Markdown note. The Coffee note from
[Working with slipbox](getting-started.md#make-two-practice-notes) is suitable. Save any existing edits before starting.

## What the lens is

Think of two choices:

| Choice | Options |
| --- | --- |
| How much source do I want to see? | None: rendered; part: lens; all: SOURCE view |
| Am I typing? | Navigate/inspect first, then enter INSERT to change text |

The lens is a section of source inside the rendered document. It is not a separate file or a second version of the
note. SOURCE view changes the whole window's presentation; it does not by itself start typing either.

![The Coffee note in two windows: on the left rendered, the lens open on Brewing showing its Markdown and Beans still
rendered below it; on the right the whole file in SOURCE view](../images/reading-editing-views.png)

## Read the rendered document

Open the note directly:

```bash
slipbox ~/slipbox-tour/ideas/coffee.md
```

The status says `READ`. Headings and paragraphs are drawn as document elements. Markdown markers such as `##` do not
have to be visible to navigate the text. Move with arrows or click a sentence. The reading cursor identifies where
your next action applies.

Selection, copying, following links and searching are available while reading. Pressing ordinary typing keys may
run commands in this state. For example, `u` undoes your last change and `q` closes the current window. If you undo
by mistake, `shift+u` or `ctrl+y` redoes it. Enter INSERT before typing text.

## Open it

Put the cursor on the sentence under Brewing and press `i` once.

The status says `LENS`. Source lines appear between two rules. Its top label says `source · lines …`. The Markdown
around your cursor is visible; the rest of a longer document remains rendered. A short note may fit entirely inside
the lens.

Nothing has changed in the file. You can inspect markers, move the cursor, or press `esc` to return to reading.
`space n l` also toggles the lens without beginning to type.

![The Coffee note with the lens open on Brewing: its heading and sentence as Markdown between two rules labelled source
· lines 3–6, the Beans section rendered below, the status line reading LENS](../images/lens-open.png)

## Type in it

With the lens open, press `end` (or `ctrl+e`) to reach the sentence's end, then `a` to type after it. The status now
says `INSERT`.
Add a space followed by `Try a little finer tomorrow.`

The lens's label changes to `editing · lines …`, and its rules and row tint change while you type. A dot marks the
note as unsaved. Arrow keys still move the typing cursor inside the editing area.

Press `esc` once. You stop typing but keep the lens open: the status returns to `LENS`. This gives you a chance to
inspect the change before closing the source view.

![Typing in the lens: a sentence added after Brewing's, the rules green and labelled editing · lines 3–6, the status
line reading INSERT and unsaved](../images/lens-typing.png)

## Save and return to reading

Press `ctrl+s`. Look for the saved message and check that the unsaved mark disappears. Press `esc` again to close
the lens. You are back in `READ`, looking at the rendered result.

Leaving INSERT or closing the lens does not mean the file was saved. Saving does. Autosave normally runs after
30 seconds without a key press; explicit saving makes the boundary clear when another editor or an agent is involved.

`ctrl+z` undoes and `ctrl+y` redoes. Save after undoing if the file on disk should reflect the undo.

<a id="when-to-use-it-and-when-source-mode"></a>

## When to use it, and when SOURCE view

Use the lens for a local change while keeping a long document in view: a paragraph, list item, table or code block.
Use SOURCE view to inspect or edit Markdown across the whole file.

1. From reading, press `ctrl+k`. The status says `SOURCE`, and the whole note shows its Markdown.
2. Move to the text to change. You are still navigating; no edit happened merely by switching views.
3. Press `i` or `a` to start typing. In SOURCE view, this goes straight into INSERT.
4. Type, press `esc` to stop, and `ctrl+s` to save.
5. Press `ctrl+k` again to return to rendered reading.

If the lens is open when you switch, SOURCE view takes its place; the two are not nested editors. Cursor positions
refer to the file's source lines across the views.

![Inbox in two windows: rendered on the left, and on the right in SOURCE view, its heading's #, the tasks' - [ ] and the
link's destination showing, the status line reading SOURCE](../images/reading-editing-source.png)

## Move it, and grow it

When you are not typing, moving beyond the lens's boundary moves it with you. While typing, arrows stay inside it.
`+` grows the lens by a block, `-` shrinks it, and `=` restores its chosen size. A block can be a paragraph, heading,
list item, table or code block.

Try growth on a practice note with several paragraphs. This lets you edit two adjacent blocks without opening the
whole file. The [editing chapter](../manual/editing.md#the-lens) explains sizing and movement in detail.

## Its keys

| To | Press |
| --- | --- |
| Open the lens from reading | `i`, or `space n l` |
| Start typing in the lens | `i`, `a` or `o` |
| Stop typing | `esc` |
| Close the lens when not typing | `esc` |
| Switch to/from whole source | `ctrl+k`, after stopping typing |
| Save | `ctrl+s` |
| Undo / redo | `ctrl+z` / `ctrl+y` |

The [shortcut reference](../manual/keys.md) is exhaustive. The [editing chapter](../manual/editing.md) explains
operator commands, selections, completion, spelling, autosave and changes made by another program.

## Beyond notes

These ideas also apply to rendered data and code. Data files expose their source around a card or row; the code view
can open a cell's source in the lens. The scratch is editable Markdown too. See
[Code and language tools](../manual/code.md), [Scratch and context](../manual/scratch-and-context.md), and
[Editing](../manual/editing.md) before applying a familiar key in a different panel.

## Make it yours

Once the default workflow feels comfortable, lens size, presentation and keys can be customized. Start with
[Customization](../manual/customization.md); exact settings remain in [Configuration
settings](../manual/configuration.md).

## Where next

Continue with [Working across folders and vaults](vaults.md). You now know which view you are in, when keys are
commands or text, and how to put a change on disk.
