# Notes: the window header

## The issue, and what the code does today (2026-10-24)

Issue #24 asks for three things: the window's mode as buttons on the row atop each window, a name for that row, and
`ui.breadcrumb = false` hiding only the breadcrumb. What the code does now (*read*, at `origin/dev` 390000c):

- **The row** is drawn in `drawPane` (`src/tui/draw-pane.ts:51-108`): a rule, a band in `breadcrumb_band`, a split's
  name (cut to half the row), `drawBreadcrumb` (`src/tui/draw.ts:469`), `▤` at the far right of the top-right window
  without the right rail (`btn:outline`), a rule. Its gate (`:52`) is `app.ui.breadcrumb && !app.ui.zen && rect.h >= 8
  && app.floating?.view !== view`; off, a split's name gets a `tab`-styled row (`:103`) and the window's text the rows
  (`:58`); `▤` goes to the top bar when no window drew it (`src/tui/draw.ts:433-451`).
- **The mode** is `view.source` / `view.live`; `Lens.setViewMode(view, "rendered" | "source" | "live")`
  (`src/tui/lens.ts:298`) sets it directly, refusing a drawn diff ("a diff is drawn one way") and, for a mode other than
  source, a file `canRender` says no to (`src/tui/app.ts:966`: data that doesn't parse, text that isn't a code
  document), with "`<name>` doesn't parse — `<error>`: source mode" (warn) or "`<name>` has no rendered view: source
  mode" (info). Asked for the mode the window is in, it returns at once (`:300`), and a refusal returns before
  anything changes; only a switch stops typing first, and keeps the cursor's character.
- **The mode changes without `setViewMode`** in two places: a data file that stopped parsing goes to source mode when
  typing ends, as it's laid out (`src/tui/views.ts:64-69`; while typing it stays in the lens), and a window given
  another file (`Lens.fitMode`, `src/tui/lens.ts:46`). A window's mode isn't kept in the session (`src/tui/session.ts`
  saves paths, places and history; restored windows are made again, `makeView`).
- **A click ends typing** in every window before it's dispatched (`src/tui/mouse.ts:83`), whatever it lands on.
- **The toggles** `view.source` (`ctrl+k`, `space n v`, `:source`) and `view.live` (`space n l`, `:live`, `:lens`) are
  in `src/core/commands/files.ts:34-44`, their handlers in `src/tui/actions-view.ts:141-165`, each saying what the
  window shows now ("source — the note's markdown", "the lens: … — esc closes it", "rendered", "the code as a
  document"). `esc` in normal mode closes the lens (`src/tui/actions.ts:130`).
- **Drawn buffers** (a diff, a review, the merge screen) live only in the floating window (`src/tui/diffview.ts:165`,
  `src/tui/mergescreen.ts:251`), which has no header: the issue's "a drawn diff: none" never shows on screen.
- **The colour role** `breadcrumb_band` also fills the code view's cells drawn as bands (`src/core/layout/code.ts:794`);
  renamed roles are read by their old word through `OLD_ROLES` (`src/core/theme/theme.ts:167`, DF-D22).
- **Hit areas** are strings: per-window ones carry the window's index (`crumb:<window>:<row>`, `crumbicon:<window>`),
  the app's buttons don't (`btn:outline`); `clickHot` (`src/tui/mouse.ts:612`) dispatches them.
- **Coverage**: every command needs a terminal check that runs it, or a reason left out
  (`tests/terminal-coverage.test.ts`, TT-D4).

## Proposals (2026-10-24)

As they were put to the user; agreed the same day, below.

- **HDR-D1, the name.** The row is the window header; "breadcrumb" names only the heading trail on it. The docs and
  the design say so, `docs/manual/screen.md` § The breadcrumb becomes § The window header with § The breadcrumb under
  it (so `#the-breadcrumb` still lands, by its own heading), and the code's names follow (`crumbs` in `drawPane`
  becomes `header`; `drawWindowHeader` in a module of its own, `src/tui/draw-header.ts`, D235). The colour role keeps
  its name, `breadcrumb_band`: it also tints the code view's bands, which `window_header` would misname, and one name
  needs no alias (question 3).
- **HDR-D2, the radio group.** Read, Lens and Source on each window's header, exactly one selected, the window's mode;
  a click on another switches straight to it (`setViewMode`), on the selected one does nothing; typing isn't a mode;
  what `setViewMode` refuses is disabled, its click saying why. Three new commands set a mode, `view.mode_read`,
  `view.mode_lens`, `view.mode_source` (`cli: null`, no default keys), saying what the toggles say; `view.source` and
  `view.live` stay toggles. A click focuses its window first, as a breadcrumb heading's does, so the status chip, which
  describes the focused window, agrees. One home for the refusals: `Lens.refusal(view, mode)` returns the message, used
  by `setViewMode` and by the drawing.
- **HDR-D3, two settings.** `ui.breadcrumb = false` hides only the heading trail; `ui.window_header` (default `true`)
  removes the row, as `ui.breadcrumb = false` did: "Window header" in `space u u` and the palette (`ui.window_header`,
  no key), remembered like the other settings. Zen mode, the floating window and windows under 8 rows still have no
  header. `ui.breadcrumb`'s narrower effect is a CHANGELOG line under Changed; nothing is renamed, so no config breaks.

## Open questions for the user (2026-10-24)

1. **The commands' names.** Recommended: `view.mode_read`, `view.mode_lens`, `view.mode_source` ("Read mode", "Lens
   mode", "Source mode" in the palette and help): one pattern, beside the toggles, no clash with `view.source`. Else the
   issue's `view.read`, `view.lens`, `view.whole_source`; or one `view.mode read|lens|source`, which the palette would
   list once and would need its argument typed.
2. **Default keys for them.** Recommended: none. `ctrl+k`, `space n v` and `space n l` keep toggling; the free letters
   under `space n` (`a b g j k u z`) say nothing of the modes; a user binds them in `[keys]`.
3. **The colour role.** Recommended: keep `breadcrumb_band`, documented as the window header's background (and the code
   view's bands). Else a `window_header` role with `breadcrumb_band` read as it (`OLD_ROLES`), which the code view's
   bands would then use too, or get a role of their own.
4. **When the buttons shorten.** This orders the breadcrumb against the buttons, which the issue states as "the
   breadcrumb folds into `…` first, then the buttons shorten". Recommended: the buttons shorten once the breadcrumb
   would have less than its innermost heading cut to 8 columns (with `§ … ›`, 14 columns at most), so a narrow split
   still shows the heading the cursor is in; past that the breadcrumb folds on to `…`. Else, read strictly, the
   buttons shorten only once the breadcrumb is down to `§ …`. Either way the selected letter stays as long as it fits
   beside the name and `▤`.
5. **The disabled style.** Recommended: `topbar_button_on` selected and `topbar_button` the others, as the issue
   suggests and as `▤` already is, and a new role, `topbar_button_disabled` (`surface2`; dim without colour). Without
   colour (the `mono` theme, `NO_COLOR`) an enabled button is dim already, so there a disabled one looks the same and
   only its click tells; the selected one is bold. Else three roles of the header's own (`mode_button`,
   `mode_button_on`, `mode_button_disabled`), where without colour an enabled button is plain, the selected bold and a
   disabled one dim: more roles to document, a distinction that holds without colour.
6. **The header setting's name.** `ui.window_header`, "Window header" in `space u u`. Recommended as the issue has it.
7. **A click on the selected button while typing.** Every click ends typing today (`src/tui/mouse.ts:83`), a heading's
   included. Recommended: so does this one, and it changes nothing else: the mode stays, the changes stay in the
   buffer. Else the selected button's click is let through without ending typing, a rule for one target.

## Review by Codex (2026-10-24)

The draft sent for critique (`tmp/issue/codex-design.md`, not in git). Its findings, each checked against the code, and
what was settled in the design:

- **A click ends typing before it's dispatched** (`src/tui/mouse.ts:83`), so "the selected button does nothing" can't
  also keep typing without a rule of its own. Checked: true. Settled as "changes nothing else", open question 7.
- **The mode changes outside `setViewMode`** (`src/tui/views.ts:64-69` once typing ends on data that stopped parsing;
  `Lens.fitMode`, `src/tui/lens.ts:46`), so the buttons must be drawn after the window's layout is asked for, even
  with the breadcrumb hidden (today the breadcrumb asks for it). Checked: true. In the design.
- **Data that stops parsing while typed** keeps the lens until typing ends: Lens selected while `canRender` is false.
  Settled: the selected button is never disabled; the others are as refused. In the design.
- **The widths**: three padded labels are 20 columns, as the design meant (Codex counted the inline literal, which
  Markdown trims to 18); now written as three labels. The breadcrumb's columns are the row's less one at each end
  (`src/tui/draw-pane.ts:100`), and its least room depends on its headings (a single one needs no `…`): the design
  now measures it on those columns, from the headings. The order against the breadcrumb is a policy, the user's: open
  question 4.
- **Hover** is applied by `button()` whatever the role (`src/tui/draw.ts:397`), so the selected and disabled buttons
  are drawn without it; a click runs the mode's named command rather than `setViewMode` directly. In the design.
- **The other readers of the row**: only the gate at `src/tui/draw-pane.ts:52` and its height arithmetic (`:58`) read
  the setting; find's row follows the body, the messages the pane's geometry, the outline `mainY`; `▤`'s fallback
  stays by the hit areas drawn; a hidden breadcrumb leaves no anchor, so `space f b` centres its list
  (`src/tui/outline.ts:45`). Checked: true. The height arithmetic stays in `drawPane`.
- **Corrections to the account of today**: `setViewMode` returns before anything for the mode the window is in;
  a window's mode isn't in the session; the scratch on the right is an ordinary window (buttons), the floating scratch
  and the peek aren't; a read-only file keeps its modes. Taken into the account above and the design.
- **The tests**: the draft plan was too thin for "every case a unit test and a terminal check"; it's now a matrix
  (below).
- Codex agreed with questions 1, 2, 3 and 6 as recommended, and asked that 4, 5 (the disabled style without colour)
  and 7 go to the user.

## Approval (2026-10-24)

- The user: "design is ok", after the design and its seven questions were put, each with a recommendation. Taken as
  the recommendations agreed: HDR-D1 (the name; `breadcrumb_band` kept: question 3), HDR-D2 (the radio group; the
  commands `view.mode_read`, `view.mode_lens`, `view.mode_source` with no keys; `topbar_button_disabled`; the
  selected one's click ending typing as every click does: questions 1, 2, 5, 7), HDR-D3 (the two settings,
  `ui.window_header`: question 6), HDR-D4 (the buttons give way before the breadcrumb's innermost heading: question 4).
- The workstream is active, its tasks in tasks/.
- In the same message the user asked for an issue: slipbox should install its skill for agents. Filed as #50, outside
  this workstream.

## The tasks

As planned before approval; each is a file in tasks/ now:

- HDR-T1, the refusals in one place: `Lens.refusal`, `setViewMode` saying it; the toggles' messages shared.
- HDR-T2, the commands: `view.mode_read`, `view.mode_lens`, `view.mode_source`; the help group; registered.
- HDR-T3, the header: `src/tui/draw-header.ts`, the buttons and their room (`modeButtons`), the clicks (`mode:` in
  `clickHot`), the disabled role; `drawPane` calling it.
- HDR-T4, the settings: `ui.window_header` (config, `UiState`, `space u u`, the command), `ui.breadcrumb` narrowed.
- HDR-T5, the tests, case by case (below): each a unit test (`tests/tui.test.ts`, the harness) and a terminal check
  (`tests/terminal/checks/`), the new commands and cases in the coverage.
- HDR-T6, the docs and records: `docs/manual/screen.md`, `keys.md`, `configuration.md`, the mouse help, CHANGELOG, the
  screenshots retaken; the design changes above checked against what was built.

The cases, each with a unit test (U) and a terminal check (T):

- **Selection follows the mode**: Read on opening; `ctrl+k` to Source and back; `space n l` to Lens; `esc` closing the
  lens; `i` from Read to the `edit_in` mode, and `esc` out of typing keeping it (U, T).
- **Every switch by a click**: Read→Lens, Read→Source, Lens→Read, Lens→Source, Source→Read, Source→Lens straight
  (never through Read), each saying what the toggles say; the chip agreeing (U every one; T Source→Lens, Lens→Read,
  Read→Source).
- **The selected one clicked**: the mode unchanged, no message; while typing, typing ends, the changes kept (U, T).
- **Switching while typing**: a click on another mode stops typing, the buffer still dirty, the text kept (U, T).
- **A click in the other window** of a split: that window focused and switched, the first untouched; its selected one
  clicked: only focused (U, T).
- **Disabled**: a text file (Read and Lens), code `[render] code = "source"`, data that doesn't parse, each click
  saying `setViewMode`'s words at its level; a code document, data that parses, a note: all three (U each; T a text
  file and broken data).
- **Data that stops parsing while typed in the lens**: Lens selected, Read disabled; once typing ends, Source selected
  (U, T).
- **A window given another file**: from a text file (Source only) to a note (Read again), and back (U, T).
- **Two windows on one file**: each its own selection (U).
- **The scratch on the right**: buttons; the floating window (scratch, a peek, a diff): no header (U; T the diff).
- **Drawn buffers**: `Lens.refusal` refuses every switch (U); their floating window has no header (T, above).
- **Hover**: an enabled button under the mouse in `hover`; the selected and a disabled one not (U).
- **The which-key popup** over the header: the buttons under it not clickable (U).
- **Room**: `modeButtons` at each boundary (20, 9, 3, 0 columns left; no headings; one heading; two or more; a heading
  under 8 columns); in a window: full, letters, the selected letter alone, the name and `▤` in their places (U; T a
  split narrowed with `<` until the letters show).
- **`ui.breadcrumb = false`**: the header kept, its name, buttons and `▤`, no `§`, no anchor (`space f b` centred), find's
  row under the header (U, T).
- **`ui.window_header = false`**: no row, the split's names on their own rows, `▤` on the top bar, find's row at the
  window's top; with the breadcrumb on or off; both remembered in the session (U, T).
- **Zen mode and windows under 8 rows**: no header, either setting (U at heights 7 and 8; T zen).
- **The colour role**: `[colors] breadcrumb_band` colours the header (U).
- **The commands**: in the palette and help under Editing, `cli: null`, registered (U: the registry's test; T run from
  the palette, which the coverage counts).

## Log

- 2026-10-24: drafted from the issue and the code; no research outside the code was needed.
- 2026-10-24: Codex critiqued the draft; its findings checked and settled (§ Review by Codex).
- 2026-10-24: the user accepted the design (§ Approval); decisions recorded, tasks written.
- 2026-10-24: HDR-T1 to HDR-T4 built: `Lens.refusal` and `switchMode` (the toggles' words, shared), the three
  commands, `ui.window_header`, `drawWindowHeader` in `src/tui/draw-header.ts` with `modeButtons` and `crumbLeast`,
  the `mode:` clicks, `topbar_button_disabled`. Tried in the harness: full buttons beside the breadcrumb, letters in a
  41-column split, a broken JSON file in source mode with Read and Lens disabled.
- 2026-10-24: found while testing: a click on the header while typing in the lens on data that stopped parsing said
  the "doesn't parse" warning twice, once as ending typing switched the window to source mode and once as the click's
  refusal. The click now goes by the mode the window showed when clicked (design.md § the click); tests for the
  selected Lens and the disabled Read clicked so.
- 2026-10-24: the unit tests, `tests/window-header.test.ts` (30), each checked by undoing what it tests once (the
  mutations in `tmp/issue/mutations-*.json`, not in git): every one fails without its code. Three passed at first
  and were tightened: a helper that drew the frame twice (so a window laid out late looked right), a check that read
  the other window's breadcrumb on a shared row, and the drawn buffer's own mode. One guard was found redundant (a
  click on the selected button: its command does nothing) and removed.
- 2026-10-24: existing tests that turned the row off with `ui.breadcrumb = false` now use `ui.window_header = false`
  (`tests/tui.test.ts`: the outline button on the top bar; a split's names on their own rows); the breadcrumb's own
  test checks that the header stays.
- 2026-10-24: the terminal checks (HDR-T5): four in `tests/terminal/checks/editing.ts` (the buttons following the
  mode and clicked; a click while typing; disabled modes saying why; a split narrowed) and the settings check in
  `navigating.ts` extended (the breadcrumb hidden keeps the header; the header hidden and back; zen). With the 39
  neighbouring checks (breadcrumb, windows, splits, the mouse, settings, the status line, zen, the session, code's
  and data's breadcrumbs, the lens, source mode): 44 of 44 pass (`SLIPBOX_TERMINAL_JOBS=2`). Found on the way:
  `work/kestrel/config/broken-flags.json` parses (JSON is read as jsonc, a trailing comma allowed), though
  `examples/home/CASES.md` lists it among the data files that don't; the check uses `broken-ingress.yaml`.
- 2026-10-24: tried live, this worktree's slipbox on a copy of the reference set (`tmp/issue/home`, its own XDG
  folders), in an 18-column pane and a 120-column tab: Read selected on opening; `ctrl+k` selects Source; a click on
  Lens from Source opens the lens on the cursor's line, LENS on the chip; Read; the selected Read clicked, nothing;
  typing in the lens, a click on Source ends it, the text kept and the tab unsaved; a text file
  (`requirements.txt`): Read and Lens drawn disabled, a click saying "has no rendered view: source mode"; Breadcrumb
  off keeps the header and its buttons, Window header off gives the row to the text, both back; in the 18-column
  pane the letters show. In a split at 120 columns with the explorer (windows about 42 columns), only the selected
  letter shows: the split's name takes up to half the row (as before), and the breadcrumb keeps its least room
  (HDR-D4). Put to the user.
- 2026-10-24: the docs (HDR-T6): `docs/manual/screen.md` § The window header, with § Read, Lens and Source and
  § The breadcrumb under it (`#the-breadcrumb` lands still); the map, splits, the side panes, the UI settings and
  zen's list; `keys.md` (the mouse, `space u u`, zen, the modes' table), `configuration.md` (`window_header`, the
  roles), `editing.md`, the mouse help, CHANGELOG (Added, Changed). `bun run shots`: 29 taken, 27 changed, each looked
  at; the empty box for 🚲 in two of them was there before (no font here draws it).

## Review before the pull request (2026-10-24)

Codex's review of `git diff origin/dev...` (`tmp/issue/codex-review-1.md`, not in git), each finding checked:

- **A one-column heading vanishes before the buttons shorten**: `crumbLeast` gives 3 for `§ A`, but `drawBreadcrumb`
  draws nothing in fewer than 4 columns; in 25 columns the buttons stay full and the heading goes. Checked: true
  (least 3, the full form at 25, 3 columns left). To fix: the least room never under the drawing's floor.
- **The narrow-split check would pass with no buttons at all**: it checks that `R  L  S` went, not that the selected
  `S` stayed. Checked: true. To fix: the selected letter, bold, in the window's own columns.
- **Terminal coverage short of the matrix**: data that stops parsing while typed (and the two clicks that needed
  `shownModes`), a reload into broken data with the breadcrumb hidden, `[render] code = "source"`, a window given
  another file, the scratch on the right, a stacked split's lower header, hover, the which-key popup, and settings
  restored by a real restart have unit tests only; the session test checks the override, not a restore. Checked:
  true. To add.
- **`FORM_WIDTH` measures labels by `.length`**, not `width.ts` (`src/tui/draw-header.ts`). True; ASCII labels, so no
  bug, but the rule is the rule. To fix.
- Not taken: none.
- Found meanwhile, not this change's: `tests/render.test.ts` "Mermaid (12.10) > drawn while its library loads" fails
  here every time, and the same on an export of `origin/dev` (the library is in already when the first render asks).
  Left alone; the full run on `test` will say whether it's this machine's.

`/code-review`'s review of the same diff (15 findings; three it reproduced with throwaway tests), merged with Codex's:

- **Taken, each with a test that fails without it** (mutations in `tmp/issue/mutations-4.json`):
  - A data file re-parsed on every keystroke in source mode: the header asked `Lens.refusal` of Read and Lens, and
    `canRender` parses a changed text. Now the header asks with `drawing`: while typed into, or 128K characters and
    more, a data file goes by its last parse (`NoteBuffer.lastParsed`); a click asks of the text as it is. While
    typing, Read follows the last parse, not a mid-typing break (design.md). Tests: no parse while typing; a big file
    edited in normal mode, no parse; a click on its Read renders.
  - One click said a warning twice across windows: a split on one data file, the other window's typing ended by the
    click and broke it. The same window's case was guarded by `Mouse.shownModes`; both now by what the click said
    since it began (`App.said`), which also drops `shownModes` (it kept closed windows' views alive until the next
    click). The click runs the mode's command, which says a refusal itself. Tests: the cross-window split, the two
    same-window clicks; the terminal check fails without it ("said 2 times", checked).
  - The breadcrumb's least room under its 4-column floor (Codex's first): `CRUMB_FLOOR`, shared. Test at 25 columns.
  - `FORM_WIDTH` by `stringWidth`; `modeButtons`' dead branch gone; the buttons drawn by `button()` alone, with a
    `hovers` flag, not a copy of it; the layout asked for in the header only when the breadcrumb, which asks for it,
    is hidden (one pass fewer a frame).
  - The docs said a text file has only Source, though code with the code view has all three: "a plain text file, code
    in a language without the code view (or `render.code = "source"`)".
  - HDR listed in `blueprint/workstreams/README.md` and `blueprint/README.md`.
  - Terminal checks for the cases with unit tests only (Codex's third): data broken while typed and Read clicked (said
    once, by the messages list), broken on disk with the breadcrumb hidden, `[render] code = "source"` and a window
    given a note and back, the scratch on the right and a stacked split's lower window, hover and the which-key
    popup, and the header setting remembered across a restart. The narrow split's check now finds the selected
    letter itself, bold, in the narrow window's columns, whichever window the resize narrowed. The unit tests: a real
    restore of `window_header`, and the which-key test now shows the popup lies over buttons before it hides them.
- **Not taken:**
  - Without colour a disabled button looks like an enabled one (`mono`, `NO_COLOR`): the cost HDR-D2 records, agreed;
    put to the user as a possible follow-up (dim and italic, say).
  - Moving the "stopped parsing, to source mode" switch out of `layoutFor` into the end of typing: it predates this
    change and serves reloads too; the click's dedupe covers what the header needed, and the move would change every
    path that lays a window out, beyond #24.
- Terminal checks after the fixes: the header's eight and the settings check, 9 of 9.
- 2026-10-24: every task done and in `tasks/archive/`; the acceptance criteria met (requirements.md); the workstream
  complete, for the maintainer to consolidate.

## Taken as recommended while the maintainer was away (2026-10-24)

The maintainer, away until morning, asked that a question for them be answered by the recommended option, recorded
here, and the work go on.

- **A split at 120 columns with the explorer open shows only the selected letter** (found live): HDR-D4 kept as
  agreed, the split's name keeping its place, as the issue asks; a shorter name or another order recorded in
  [ideas.md](ideas.md) for later. Taken as recommended while the maintainer was away.
- **Without colour, a disabled button looked like an enabled one** (the review's finding, HDR-D2's Cost): dim and
  italic now (HDR-D5). Taken as recommended while the maintainer was away.
- 2026-10-24: HDR-D5 built: `topbar_button_disabled` dim and italic in `mono`; a unit test (it fails without the
  change, checked); no terminal check, since the headless terminal's runs keep colours and bold, not italics or dim.
  ACCESSIBILITY.md says it.
- 2026-10-24: CI on the pull request (#57): terminal checks 350 of 351 on Linux x64, all on macOS and Linux ARM; the
  one, "view: a worktree kept outside the view chosen" (the explorer, VV-D5), passed here at once: load, not this
  change. The test jobs wait on dev's hanging test (#42's), fixed apart.

## The pull request's review loop (2026-10-24)

- Round 1: Codex's part skipped: it stopped at an approval menu in its pane (to read the pull request's body from
  GitHub), with under 5% of its usage limit left; a fresh Claude reviewer does its part, as the maintainer asked,
  beside `/code-review`, each on the whole diff, neither given the other's findings.
- Round 1's findings: the stand-in reviewer's 2 bugs, 4 test gaps, 3 docs points; `/code-review`'s 11, three
  reproduced. Merged and checked, each:
  - **Taken, each with a unit test and a terminal check that fail without it** (mutations in
    `tmp/issue/mutations-6.json`; the split's terminal check fails without the fix, checked):
    - The header's parse rule (both reviews): it still parsed a data file on every keystroke in a split (the
      window not typing asked `canRender`), on every normal-mode edit of a small file (161 ms a key on a 124K YAML),
      and a big file fixed in source mode kept Read and Lens dimmed. Now the header never parses: a data file changed
      since its last parse is taken to parse, its buttons lit, until a parse — a click's, a switch's — says otherwise.
    - One click's dedupe matched words alone: two files of one name, one's typing ended by a click on the other's
      Read, lost the second's refusal. Now only for the files the click ended typing in; the words come from one
      place (`unparsedText`), since three built them apart; the click's state is cleared after it (`clickHot` called
      outside a click no longer reads an old one).
    - In the terminal theme a disabled button differed from an enabled one by dim alone: dim and italic (HDR-D5).
    - The focus to the content region untested (a click from the explorer); the split; the colour role and a big file
      fixed in a terminal; the header's checks moved to `tests/terminal/checks/window-header.ts` (editing.ts was
      1,738 lines); `Mouse.focusWindow` for the five clicks that focused a window alike.
    - Docs: "dimmed" named the enabled buttons too (now the faintest, in italics without colour); `▤` moves to the top
      bar only without the right rail; reading.md and code.md name the buttons.
  - **Not taken:**
    - A once-per-version guard where "doesn't parse" is said (`/code-review`'s altitude point): it would also
      silence a second explicit request (`ctrl+k` again on a broken file), and the double warning it names — two
      rendered windows on one data file, the other switching to source mode mid-typing, then the typing one on
      `esc` — predates this change (`views.ts`, per window). Recorded in [ideas.md](ideas.md).
    - Marking the narrower `ui.breadcrumb` as breaking, or a notice for it: the issue asks for a CHANGELOG line under
      Changed, with what to do.
    - A terminal check for the no-colour style: the headless terminal's runs keep colours and bold, not italics.
- Terminal checks after round 1's fixes: the header's thirteen and the settings check, 14 of 14.
- Tried live after round 1's fixes (a fresh copy of the reference set, its own XDG folders): `regions.yaml` split, the
  left in source mode, typing `:[x` in the right's lens: both windows' Read lit (`#565f89`, not the disabled
  `#3b4261`); the left's Read clicked: both in source mode, "doesn't parse" once in the messages list.
- Round 2: Codex's part skipped again: still at its approval menu, under 5% of its usage limit; a fresh Claude
  reviewer and `/code-review` on the diff after round 1's fixes.
- Round 2's findings: the stand-in reviewer's 3 bugs (one reproduced), 3 test gaps, 3 docs points; `/code-review`'s 9
  (one reproduced). Merged and checked, each:
  - **Taken, with tests that fail without them** (mutations in `tmp/issue/mutations-7.json`, `-7b.json`; the
    which-key and the peek terminal checks fail without their covers, checked):
    - A click inside a floating window, over a header button under its margin (a diff's, a peek filled with `z`),
      reached the button, and the command then acted on the floating window. What lies under the floating window is
      now covered, its own hit areas aside (`drawApp`); the breadcrumb's were reachable the same way, now not.
    - The buttons changed form, and moved, as the cursor went from heading to heading near the edge: the least room
      is the file's now (HDR-D7, taken as recommended while the maintainer was away).
    - A disabled button barely legible (both reviewers, about 1.5:1): in italics in every theme, halfway to an enabled
      one's colour (HDR-D6, taken as recommended while the maintainer was away); the test helper reads attributes, not
      colours, so it holds in every theme.
    - The lens said "markdown" for YAML, now one click away: `lensWhat`, the file's own format, for the button and
      the editing keys.
    - The which-key terminal check passed with the click going through (escape closed the lens); now it checks no lens
      opened and none was said. A terminal check for the peek over the header, and one for the form held as the
      cursor moves.
    - Cleanups: `MODES` in `lens.ts`, not a drawing module; the status chip by `viewMode`; the change sign's click by
      `focusWindow`; the layout asked for plainly, not in a comma expression; `outlineView.breadcrumb` takes the
      layout the header has.
    - Docs: "since slipbox last checked it"; italics name a disabled button; reading.md and editing.md name Read where
      a data file parses again.
  - **Not taken:**
    - The other window on a data file judged mid-typing (`views.ts` decides per window): older than this change, as
      round 1 found; recorded in [ideas.md](ideas.md).
    - A once-per-version guard where "doesn't parse" is said: as in round 1 (a second explicit request would say
      nothing); the duplicate it would also stop shows only in the messages list, the toast being merged already.
    - The root's `design/tui.md` still describing the breadcrumb row: it changes when HDR is consolidated, as the
      framework has it.
    - One frame in a split where a window drawn before the other parsed shows its Read lit: the next frame agrees.
- Terminal checks after round 2's fixes: the header's fifteen and the settings check, 16 of 16.
