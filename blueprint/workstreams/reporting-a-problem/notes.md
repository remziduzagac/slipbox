# Notes: reporting a problem

## Drafted (2026-10-24)

- **Asked:** issue #5, an enhancement: report a problem from inside slipbox — a key and `:report`, a small window
  asking what happened and what was expected, the facts filled in; the screen (or the note and the cursor's line)
  only when ticked, shown first in full; sent by the user (the bug form in the browser, filled in from the address,
  or the report copied; `gh issue create` perhaps, after showing what it would post); `slipbox report` (`--json`) for
  agents. Done when the key, command and window work, every field shown before anything leaves, the browser opened
  or the text copied where there's none (SSH); tests of what the report holds and that the screen is in it only when
  asked; the docs. Taken up as the workstream RPT, a draft, on the branch `feat/issue-5`.
- **Research:** what the form's address can carry and how long it can be; what slipbox already knows of itself and
  its terminal, in research.md. The address: text fields by id, about 5,500 characters at most (measured); a
  dropdown unconfirmed. slipbox has never opened a browser: a web link is copied.
- **Proposed decisions** (as proposed; agreed below, recorded as RPT-D1 to RPT-D7 in decisions.md):
  - **RPT-D?1, the window is the floating editor:** the report is text in the floating window, as a commit's message
    is: the bug form's own headings, the first line the title, the facts filled in and editable, a guide comment left
    out of what's sent. Kept in memory for the session, never on disk. Why: what you see is exactly what leaves;
    every editing key works; a form of fields and buttons would be a widget slipbox doesn't have, for less.
  - **RPT-D?2, the screen and the place, kept and added on your say:** both kept when the report opens (the screen:
    the frame drawn after the command, kept as text too; the file, line and its text), neither in the report until
    added, then in full, fenced, under What slipbox sees, one undo step.
  - **RPT-D?3, sent by the browser or the clipboard:** the bug form's address filled in by field id, at most 5,000
    characters encoded, by a plan that says what it leaves out, each part left out its own copy, one copy at a time;
    opened by the platform's opener, never over SSH, where the address or the report is copied (OSC 52 reaches your
    own clipboard). No labels in the address; the dropdown passed and said in Version too. slipbox makes no request
    of its own (D199 stands).
  - **RPT-D?4, gh on your yes:** offered when `gh` is on `PATH`, nothing run before it's chosen; then its account
    from its own config (no network), and a yes-or-no naming the title, the repository, the account and that anyone
    can read it; `gh issue create --repo --title --body-file -`, no label, from the home folder; once at a time, the
    draft kept until it's posted, and kept, said, when gh doesn't answer.
  - **RPT-D?5, `slipbox report`:** the facts and the filled-in address; `--json` with the facts, the form's fields
    by id, the facts' Markdown and the address; run before any vault is looked for, as `--version` is: no vault's
    config, no state, no network; the skill names it.
  - **RPT-D?6, the commands:** `help.report` (`space r`, `:report`, `:report screen|where`) and `help.report_send`
    (`ctrl+s`/`:w` in the window; `browser|address|copy|gh`), the second your own config's only.
  - **RPT-D?7, which repository:** the release's (`RELEASE.repo`), else slipbox's own.
- **Alternatives weighed** (ideas.md): a dialog of fields; a checkbox line in the text that adds the screen when
  ticked; asking `gh auth status` when the window opens.
- **Codex's critique** (codex-5, of the first draft; each checked against the code, and the design revised):
  1. Drawing the app a second time changes state (a view's size and sideways scroll, `tui/draw-pane.ts`; the cursor
     and scroll, `tui/views.ts`; messages' timers, `tui/draw.ts`): taken. The screen is now the next frame, drawn as
     always and kept as text beside the terminal's canvas, that frame only, the window opening on the one after.
  2. The address's fallback could lose text and copy two things over each other: taken. A plan (what's in, what's
     left out, why), measured encoded, down to the template alone; each part left out its own entry; one copy per
     action; `App.copy`'s outcome said, never claimed (OSC 52 can't confirm).
  3. Reading the editable text back needed a contract: taken (§ Reading it back): headings outside fences only;
     renamed, deleted, doubled and reordered labels; stray text before the first label leaves the address out, said.
  4. "Never on disk" against the clipboard's fallback file: taken, worded as what slipbox writes (nothing) versus a
     copy you make (the fallback, said). Whether a report's copy should refuse the file is the user's (question 4).
  5. `slipbox report` as a handler would locate a vault and build a session, which reads the vault's config, writes
     the activity file and records the location (`cli/common.ts`): taken. It's dispatched before, as `--version`.
  6. gh's account was promised but never read; publication, duplicates and a timeout undefined: taken. The account
     from `gh config get -h github.com user` (local: ran, it prints this machine's account), "Anyone can read it",
     the text as confirmed posted, once at a time, the draft kept on a timeout, said.
  7. The floating buffer's invariants: taken, as the commit's (outside the buffers: no quit refusal, no autosave, no
     history), the buffer kept by the `Reporter`, a footer of its own, `esc` twice.
  8. The facts and commands: taken. `readChannel` only for the installer's install; "from source or built by hand";
     SSH and multiplexers as presence only, never a value (`SSH_CONNECTION` holds addresses); OpenTUI's `none` never
     hides the environment's; the palette's argument candidates, unknown arguments refused; `help.report_send` among
     the commands a folder can't bind, as one that runs a program. The blueprint: the CLI moved into § Reporting a
     problem, the trust change's "Previously" quoted whole, the bug form named as no design change.
  Not taken: none. Codex's list of the user's choices: the key, gh now, the dropdown, the clipboard file, which frame.
- **Codex's check of the revision:** five settled; three gaps, taken: gh's account is `GH_TOKEN`'s or
  `GITHUB_TOKEN`'s when one is set, said unchecked (gh's own order: "takes precedence over previously stored
  credentials", *ran*: `gh help environment`, gh 2.102.0); the copy and `gh` send the text as written, the mapping
  onto fields the address's alone; an added screen goes at the end of What slipbox sees as the reading finds it,
  refused while a fence is open.
- **Open:** the questions below, for the user.

### Questions for the user

1. **The key:** `space r`, a top-level letter free today, beside `space m` (messages) and `space ?` (help)? Or
   `space q r` (beside quit), or none but `:report` and help.
2. **gh now, or later:** offer `gh issue create` in this workstream (proposed), or leave it as an idea?
3. **The form's "Installed with" dropdown:** whether GitHub fills a dropdown from the address isn't documented. Keep
   it (proposed: Version says it too, so nothing is lost), or make it a text field so it always fills? One look
   settles it: open
   [this address](https://github.com/remziduzagac/slipbox/issues/new?template=bug_report.yml&install=Homebrew&version=0.5.1)
   signed in: does "Installed with" show Homebrew?
4. **A report's copy when no clipboard takes it:** written to the state folder's `clipboard.txt`, as every copy is,
   and said (proposed), or refused for a report, since it may hold the screen?
5. **Which screen:** the frame right after the command, the palette or help that ran it closed (proposed), or the
   frame as it was before the key, with the popup or palette showing?

## Agreed (2026-10-24)

- **The user approved the design as proposed:** `space r`; `gh` now; a report's copy goes to `clipboard.txt` when no
  clipboard takes it, as every copy's, and said; the frame after the command. The dropdown stays as proposed (passed,
  and said in Version). Recorded as RPT-D1 to RPT-D7; the workstream is active, its tasks in `tasks/`.

## Built (2026-10-24)

- **Tasks RPT-T1 to RPT-T6** built in turn, each with unit tests and terminal checks
  (`tests/terminal/checks/reporting.ts`); the rules mutation-checked (each undone once, a test failing).
- **Found while building:** a copy returned before it was made, so the next was refused as still copying; a gh whose
  child held its output open kept a timed-out post waiting; keys sent at once with `space r` (a paste, a macro)
  reached the note under the report before the frame that opens it. Each fixed, with a test.
- **Review, round 1** — Codex (five findings, all taken): gh's `--repo` named github.com, as the account and the bug
  form are, whatever `GH_HOST` says; what the yes-or-no names is what's posted; "added" only outside fences; a draw
  that fails still opens the report; terminal checks for the cases only unit-tested. `/code-review` (fifteen):
  - taken: `:w!` wrote a floating window's text to a file named after it (the commit's and properties' windows'
    too, in dev) — `writeBuffer` refuses a virtual buffer and `:w!` on one is `:w`; the browser tests assumed Linux
    and the checks faked only `xdg-open`; opening from a draw guarded; no address while a fence is open; a token in
    the tests' environment; a comment before the labels; `slipbox report` shadowing a folder named so, said in the
    docs; gh's account lookup timing out said as such; the window closed or covered during it; gh run through
    `runTool`; `oneLine` cut by width; the fence's regex built once.
  - not taken: GitHub's own fence for a `render: text` field, which a bare ``` line in the screen or place can close
    (GitHub picks that fence; the text arrives intact, and the copy and gh keep slipbox's longer one); a flag on
    virtual buffers in place of the kind lists in `note.save` and the status line (they follow the commit's and the
    merge screen's existing pattern: a refactor of its own); shared helpers for a list's "a, b and c" and a
    read-or-empty (inline or private where they are).
- **Review, round 2** — `/code-review` (fifteen):
  - taken: a comment left open above the labels hid them all — no address, no screen added, gh refused, said; the
    `writeBuffer` refusal said, and a task toggled in a read-only window (a peek, which in dev wrote the peeked file)
    refused, said; a screen asked for with none kept; focus back where the report was opened; an empty
    `PRETTY_NAME`; a label with closing hashes; a fence above the labels never the title; the guide left out of the
    copy wherever it is; the keys' wait once only when no frame comes, and asks before the frame all added; the
    cursor's line read alone; no address planned for the copy or gh; the opener's timer cleared; the CLI's labels
    padded by width.
  - not taken: as in round 1 (GitHub's fence, the virtual-buffer flag, the shared helpers), and a general gate in
    the key loop for features that open on the next frame (one feature has one: premature).
  - Codex's part of round 2 was done by a fresh Claude reviewer (Codex was at its usage limit). Its three, all
    checked and taken: What slipbox sees, unfenced for the form's field, could still end GitHub's own code block
    (raised in each round; settled now by CommonMark's rule that a fence's end is indented three spaces at most: a
    line that could end one is indented four there); `<!--` later in a line was taken for an open comment, the
    title cut at it (only a comment opening its line hides the rest); `space r` over the merge screen of the conflict
    prompt dropped the prompt (it comes back now). Not taken from the last: a diff window's `back` on the same path
    (it reads git again and can reopen a window over the report).
- **Review, round 3** (the last: the maintainer's rule, three rounds, a fourth only for a real bug) — `/code-review`
  and a fresh Claude reviewer for Codex:
  - taken, real bugs: `gh`'s body dropped a comment's `-->` sharing the title's line, so GitHub would hide the whole
    body; a comment left open inside a section went unseen, and GitHub would hide the facts after it; round 2's
    merge-screen fix reopened the conflict question as the report opened typing, so the title's letters answered it
    (`m`, `l`…) and could replace unsaved text — the question now waits until typing stops, as any conflict's does.
    With them, in the same code: the rest of a line a comment starts is the comment's; a peek's place named. And
    two CHANGELOG lines for the two released bugs fixed here (`:w!` in a floating window; `ctrl+l` in a peek), and
    MODIFIED entries for design/tui.md § Writing notes.
  - smaller, left for later (not in this pull request): "where you were" from a properties, merge or diff window
    says no file was open (only a peek's buffer names one); a comment left open in What slipbox sees refuses the
    address though that field is a code block (gh's refusal is right); an intro line inside a fence of your own
    unfences the inner one for the address; the browser's opener found by today's `PATH` but run by its name; a
    second `ctrl+s g` during the first's account check says "gh is ready" while the question is up; the place's
    rule shared with `Git.commitDone` (one helper, or `panels.fixRegion`); `overSsh` beside `isWsl` instead of in
    `core/report.ts`; a stale comment on `plan()` and the `posting` checks the menu and `send` can't reach; the facts
    gathered while a frame draws (a few small files read); and again `slipbox report` naming a folder `report`, and
    a flag on virtual buffers (both settled in round 1).
- **Review, round 4** (the last, allowed as round 3 found real bugs) — a fresh Claude reviewer for Codex and
  `/code-review`: a comment left open after a quote's `>`, a list item's marker, or a comment earlier on its line was
  missed, so GitHub could still hide the facts (taken: caught now, with a tab-indented `<!--` and `<!-->` no longer
  taken for one). The reviewer found the round-3 fixes otherwise sound: `postOf`, the conflict's question, the
  virtual and read-only buffers, the keys' wait. `/code-review`, twelve:
  - taken, real bugs: gh's question could open while you typed on, and a `y` typed would post a public issue (it
    opens now only if no key came while gh was asked); an edit that saves after it (a link put in, a footnote added)
    opened the menu and left the report "saved", after which a task toggled there failed (ctrl+s opens the menu
    itself; a task in a virtual buffer flips in its text); the checks faked no WSL opener, so on WSL one could open
    a real browser; `fenced` spread every backtick run into `Math.max`, which a minified line overflows (a loop). And
    the docs' "the title on the first line" (it's the line after the guide), and a stale comment in `readReport`.
  - left for later: a `<!--` opening a list item's continuation indented four spaces; `2. <!--` in a paragraph taken
    for a list item, so refused though GitHub shows it; quitting asks nothing about a report typed (as RPT-D1 has
    it: kept for the session, quit not refused); opening the report over the commit editor drops a message typed
    there, as any floating window does; the bug form's dropdown has no option for a release's binary put in place
    by hand (Version says it); the conflict's question asked again for any window opened over the merge screen, in
    `closeFloating`, not the report's alone.
