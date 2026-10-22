# Working with slipbox

<a id="getting-started"></a>
<a id="a-folder-to-start-in"></a>
<a id="open-the-folder"></a>
<a id="the-screen"></a>
<a id="move"></a>
<a id="open-a-note"></a>
<a id="search"></a>
<a id="change-a-line-and-save"></a>
<a id="quit"></a>
<a id="where-to-go-next"></a>

This guide walks through a first session: open two linked notes, find your way, change a line and save it. By the
end you will know how to return to a note and where to look for the next action.

You need [slipbox installed](install.md) and a terminal wide enough for a note beside the explorer. No agent is
needed. Use a new practice folder so the steps do not change notes you already keep.

## Make two practice notes

The examples use a new `~/slipbox-tour` folder. The block below stops if that folder already exists, so it will not
replace your existing notes. Choose another unused path throughout the guide if needed.

Paste this block into your shell. It creates two notes and gives their folder a `.slipbox/` marker, making it a
vault of its own. Search and the explorer will then show this practice vault.

<!-- example: tour-setup -->
```bash
(
  set -e
  mkdir ~/slipbox-tour
  cd ~/slipbox-tour
  mkdir ideas
  cat > inbox.md <<'EOF'
# Inbox

Things to sort out this week.

- [ ] Buy filter papers
- [ ] Try the new grinder setting

Ideas so far: [coffee](ideas/coffee.md).
EOF
  cat > ideas/coffee.md <<'EOF'
# Coffee

## Brewing

A ratio of 1 to 16 suits a pour-over.

## Beans

Washed beans taste cleaner than natural ones.
EOF
  slipbox init .
)
```

The notes are ordinary Markdown files. `slipbox init .` adds `.slipbox/` for this tour; it does not import the notes
or change their format. The parentheses keep the setup's directory change inside the block.

```text
slipbox-tour/
├── .slipbox/
├── inbox.md
└── ideas/
    └── coffee.md
```

## Open the first note

```bash
slipbox ~/slipbox-tour/inbox.md
```

This opens Inbox directly. Opening a folder instead can restore the note you last read there.

The document is rendered on the right. The explorer lists files on the left. The tab names `inbox.md`, and the
status line says `READ`. Click a row or use the arrow keys to put the reading cursor there.

![slipbox open on Inbox in ~/slipbox-tour: the explorer on the left, inbox.md rendered with its two tasks and the coffee
link, the status line reading READ](../images/getting-started-first.png)

Two discovery keys are worth trying now: `space` opens the action groups, and `?` lists bindings. Press `esc` to
close either. There is no need to memorize the full keymap.

## Follow a link and come back

1. Click the coffee link, or move to it with `tab` and press `enter`.
2. Check that `coffee.md` is open and its Brewing and Beans headings are rendered.
3. Press `ctrl+o` to return to the place you left in Inbox.

This is reading history, rather than undo. It brings you back after following a link or opening a search result.

## Find a note by name

Press `ctrl+p`, type `coffee`, select `ideas/coffee.md` and press `enter`. You should be in Coffee again. The
switcher filters by path and title; you do not need to type the whole name. Search stays within this practice vault
unless you explicitly widen it.

![The switcher, Open note, with coffee typed and ideas/coffee.md listed beside its title,
Coffee](../images/getting-started-switcher.png)

To find a word in that note, press `ctrl+f`, type `Washed`, and press `enter`. To search the vault's files instead,
press `space f s` and type `coffee`. `esc` leaves the results without opening one.

## Make a small edit

Return to `inbox.md` with `ctrl+p`. Find `Try the new` with `ctrl+f` and press `enter`.

1. Press `i` to open the lens around the task.
2. Press `o` to insert a new line below it. You are now typing; the status says `INSERT`.
3. Type `Order more beans`. A list can continue its marker for you; inspect the source in the lens.
4. Press `esc` to stop typing, then `ctrl+s` to save.
5. Look for `saved inbox.md` and check that the tab's unsaved mark disappears. Press `esc` to close the lens.

![inbox.md with the lens open, a new task, Order more beans, typed in it, the status line reading INSERT and
unsaved](../images/getting-started-editing.png)

The next guide explains the lens, source mode and typing as separate parts of the workflow. For now, check that
your saved change is visible when you open the file in another editor. The file itself changed, not a private copy.

## Tick a task

Move the reading cursor onto Buy filter papers and press `ctrl+l` (`space n t` does the same). The checkbox changes.
On a saved note, this toggle writes to disk immediately; when the note already has unsaved edits, it joins those
edits instead. `ctrl+s` saves them. `ctrl+z` undoes a change if you want to restore it; save again after undoing.

## If something else changes the file

A file changed by another program reloads when you have no unsaved edits. If both you and the other program changed
it, slipbox asks which text to keep. Do not guess: the
[external-change explanation](../manual/editing.md#when-a-file-changes-on-disk) describes the choices.

CLI commands and other programs see saved files. They cannot read the text you have left unsaved in the lens.

## Leave and continue

Press `ctrl+q` to quit. When you open the folder again, slipbox can restore its session. Your notes remain normal
files and can be used by any editor.

**Next:** [Reading and editing in slipbox](lens.md), a deliberate walkthrough of rendered reading, the lens,
source mode, typing and saving. After that, [work across folders and vaults](vaults.md).
