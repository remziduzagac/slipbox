# Notes: pictures sized to their window

## The issue, and a first design (2026-10-24)

- **Asked** (issue #52): a picture sized to its window, not the terminal, its height bounded by the window's rather
  than 12 rows; a click to show it at its own size, the text around it as it was, scrolled sideways with a bar where
  it's wider; limits, below and above. To work out: the limits' values against the decoding budget and a window's
  height; the command and key, and how keys reach and scroll it; how long it stays so; a resize; the cost with sixel
  and Kitty.
- **Read first:** research.md — the cap is one constant; the layout is the buffer's, per width, and the block cache
  doesn't know the pictures' key; code blocks already scroll sideways with an offset per window, the wheel and a bar;
  both drawing paths can crop sideways; Kitty is sent a picture per size.
- **Offered, to settle:** the design in design.md. The choices made in it, and what was weighed:
  - *Fitted:* the room's width, never wider than its own size; the window's height less its `▣` line; then a floor.
    The floor is in both directions, since a short window makes a picture too few rows and a tall picture too few
    columns. 12 rows, today's cap, so no picture is ever drawn smaller than it was; 20 columns, a thumbnail at 8-pixel
    cells. Not chosen: a floor relative to the window (a fraction of its width), which changes as the window does and
    is harder to say; no floor, which lets a tall picture in a short window shrink to a few columns.
  - *Its own size, and the ceiling:* its pixels within the decoding budget the screen has now (one megapixel, 2,048 a
    side). Drawn larger, the terminal would only enlarge the decoded pixels; within it, a picture at its own size is
    its decoded pixels one to one, and Kitty's placeholders can name every cell (2,048 pixels are under 297 cells for
    cells of 7 pixels and wider). Weighed: raising the budget for a picture shown at its own size (4 megapixels, 4,096
    a side), so the docs' 1,734 × 950 screenshots show at 217 × 60 cells rather than 169 × 47 — a second decode of it,
    up to 16 MB kept per such picture, and up to four times the bytes sent to Kitty once. Open (below).
  - *At its own size, tall:* as tall as it is, the window scrolling through it as through text; never bounded by the
    window's height, which would make "its own size" a fitting again.
  - *The rows:* a picture at its own size wider than its room scrolls as a code block does, its frame rows carrying
    the block's scroll and a frame row under it its bar: the offset, the wheel, the bar and its drag already work from
    the layout's rows alone (`codeBlocks`). Every frame row names its picture and its row in it, so a picture however
    tall is found when its top is scrolled away (today's look-back stops at 60 rows).
  - *Where it's kept:* the window's, by the picture's file, while it shows the note, as a code block's offset is.
    By file rather than by line: an agent writing above the picture, slipbox's everyday case, moves its line, and a
    picture would fall back to fitted under the reader. The cost: the same file twice is at its own size twice. Its
    sideways offset stays by line, as a code block's: lost on such a move, it only starts from the left again.
  - *The caches:* the buffer's layout keyed, for a note with pictures, by its window's height and its pictures at their
    own size; the block cache keeping a picture's block with what it was sized for. Not chosen: the pictures' key in
    the block cache's key, which lays the whole note out again on a click, and twice a keystroke with two windows of
    different heights on one note (a stacked split); never keeping a picture's block, which sizes and stats every
    picture on every keystroke.
  - *A click* puts the cursor on its `▣` line and toggles it, so the keys act on it next, and growing it never pushes
    the cursor off the screen (a cursor below the picture would be moved down and the window scrolled with it). A
    drag still selects.
  - *Keys:* `z p` for the click's command; `z h` and `z l`, vim's sideways scroll, for scrolling it, a quarter of its
    room a press (the wheel's 6 columns are a notch of many). `enter` keeps copying a picture's path. Free in the
    keymap: `z p`, `z h`, `z l` (`src/tui/keys.ts`).
  - *Resizing:* fitted pictures follow the window, so Kitty would be sent each at every size a drag passes; the rest
    after quick scrolling (`12.7`) is used for size changes too, both protocols.
  - *Wrapping off:* fitted to the window, not to the note's natural width; at its own size it widens the natural width
    and scrolls with the window; drawn cropped while the window is scrolled sideways, now that a crop exists.
  - *Left as they are:* diagrams and maths drawn as pictures; export; the CLI.

## Codex's critique (2026-10-24)

Asked of the sidekick, `tmp/issue/codex-design-request.md`; each point checked against the code, and all taken:

- **One scale, said exactly:** the floors raise one proportional scale, never rows and columns apart; the `▣` rows
  subtracted are as many as the alt text wraps to (`render.ts:569`). In design.md § MODIFIED rendering.md. Examples, at
  8 × 16-pixel cells and a 100-column room (*ours*): the docs' screenshot (1,734 × 950, 169 × 47 cells within the
  budget) in a 40-row window, 100 × 28, its own 169 × 47; in a 10-row window, the floor's 43 × 12; a phone's (1,170 ×
  2,532, 85 × 92 in the budget) in 40 rows, 36 × 39, its own taller than the window; an infographic (800 × 10,000,
  21 × 132 in the budget) in 40 rows, the 20-column floor's 20 × 125, taller than the window by design.
- **Sizes and identities apart:** Obsidian's size may enlarge a smaller file (`pictures.ts:151`), as before; the
  budget bounds that too. A picture's identity is its file as found, never an SVG's PNG, whose path changes with the
  width (`pictures.ts:156`); "nothing decoded again" said only of decoding, an SVG rasterised per width as before.
- **More than the buffer's cache:** the lens keeps its render (`lens.ts:224`) by width alone, and a window's own key
  (`views.ts:110`) counts rows, which a toggle can leave equal: both take the pictures' key. A note asks for pictures
  through an embedded note too, and before a picture is drawn (one still fetching).
- **Wrapping off needs the window's room apart from the layout's width:** the probe has no pictures and the natural
  width measures spans (`views.ts:37`, `:503`); the room is passed alone, and a picture at its own size widens the
  window's extent, not the prose.
- **The caption isn't in the scroll block:** a row with a scroll is followed by the cursor (`code.ts:72`), which would
  reset the offset from the `▣` line; the `▣` rows name the picture instead. Frame rows stay blank, so the `‹ ›` marks
  (`draw-pane.ts:908`), copy and find see nothing there.
- **Drawn from its whole size:** the id and what's sent are the whole picture's, the part that shows passed apart
  (`opentui.ts:116` uses the columns it's given); the source rectangle from both edges.
- **The press is the picture's before the cursor is placed** (`mouse.ts:445`, double-clicks at `:458`), hit on its
  drawn cells only; found by the row's reference, since an embed's rows all carry its line (`render.ts:657`).
- **The resize rest is its own state,** checked before the placeholders' shortcut (`pictures.ts:44`); sixel's rest
  covers sideways scrolling too. The first draw of a window doesn't wait; a change after it does, so a drag sends once.
- Kept out, as Codex advised: `z h` and `z l` for code blocks. Added to the acceptance criteria: wrapped captions, one
  file at two Obsidian sizes, a picture only in an embedded note, a toggle that keeps the row count, a height-only
  resize with the lens open, wrapping off, a still click against a drag, and the sixel source rectangle.

## Settled while the maintainer was away (2026-10-24)

The maintainer was away until morning and asked that each open question take the recommended option, recorded as
such, and that the work go on, the design's approval included. Each is theirs to confirm or change:

- The ceiling: the decoding budget as it is (PIC-D2), not raised for a picture at its own size.
- The floor: 12 rows and 20 columns (PIC-D1).
- The keys: `z p`, `z h`, `z l`; the commands `picture.size`, `picture.scroll_left`, `picture.scroll_right` (PIC-D3).
- How long: the window's, while it shows the note (PIC-D4).
- `z h` and `z l` for code blocks: not in PIC (PIC-D3).
- The design: taken as approved; the workstream active.
