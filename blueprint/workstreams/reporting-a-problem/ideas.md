# Ideas

## The window

- The report in the floating editor, as a commit's message: the bug form's headings, the facts as text, `ctrl+s`
  sends. (2026-10-24) Chosen (RPT-D1).
- A dialog of its own: a field per question, a checkbox for the screen, buttons to send. (2026-10-24) Not chosen
  (RPT-D1): slipbox has no multi-line field outside the editor, and a field can't be cut or searched as text can.
- A task line in the text, `- [ ] attach the screen`, that adds the screen when ticked. (2026-10-24) Not chosen
  (RPT-D1, RPT-D2): text that changes itself when another part is edited surprises; the menu and `:report screen`
  say what they do.

## Sending

- `gh auth status` asked when the window opens, to show the entry only when signed in. (2026-10-24) Not chosen
  (RPT-D4): it asks GitHub, a network request you didn't ask for; `gh` on `PATH` is enough, and its own error says
  when it isn't signed in.
- The report from the messages list (`space m`), the message chosen filled into What happened. (2026-10-24) Open.
- The terminal's picture protocol, the glyph set and the locale among the facts, for rendering problems.
  (2026-10-24) Open.
