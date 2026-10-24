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
