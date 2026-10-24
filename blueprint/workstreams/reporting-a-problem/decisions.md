# Decisions: reporting a problem

## RPT-D1: The report is text in the floating window (2026-10-24)

**Decision:** `space r`, `:report` or help's "Report a problem" opens the report in the floating window, as a commit's
message is: the bug form's own headings, the first line the title, the facts slipbox knows (its version, how it was
installed and its channel, the system and processor, the terminal, its size, any multiplexer and SSH) filled in and
editable, a guide comment left out of what's sent. It's kept in memory for the session, never written to disk by
slipbox.

**Why:** What you see is exactly what leaves; every editing key works on it; a form of fields and buttons would be a
widget slipbox doesn't have, for less. The key is a top-level leader letter free today, beside `space m` (messages)
and `space ?` (help): the user's choice (notes.md, question 1).

**Not chosen:** a dialog of fields; a task line in the text that adds the screen when ticked (ideas.md); `space q r`,
or no key.

## RPT-D2: The screen and where you were, kept, added on your say (2026-10-24)

**Decision:** When the report opens, slipbox keeps the screen as text — the frame drawn right after the command, the
palette, help or popup that ran it closed — and where you were (the file, the cursor's line and its text). Neither is
in the report until you add it (the menu, `:report screen`, `:report where`); then in full, fenced past any fence of
its own, under What slipbox sees, one undo step away from gone.

**Why:** The issue's "only when ticked, shown in full first". The frame after the command is the screen as you saw it,
not the palette you used to report it (the user's choice, question 5); drawing the app a second time would change its
views (notes.md, Codex's critique 1).

**Not chosen:** the frame from before the key, the popup still showing.

## RPT-D3: Sent by the browser or the clipboard (2026-10-24)

**Decision:** The bug form's address is filled in by its fields' ids, at most 5,000 characters encoded, by a plan
that says what it leaves out; each part left out has its own entry to copy it, one copy at a time. The platform's
opener opens it (`open`, `wslview` or `explorer.exe`, `xdg-open` with a display); never over SSH, where the address or
the report is copied (OSC 52 reaches your own terminal's clipboard). No labels in the address; the "Installed with"
dropdown is passed and said in Version too. A copy no clipboard takes goes to the state folder's `clipboard.txt`, as
every copy does, and says so (the user's choice, question 4). slipbox makes no request of its own (D199 stands).

**Why:** You send it, never slipbox. About 5,500 characters survive GitHub's sign-in redirect (research.md, measured).
Whether a dropdown fills from the address isn't documented; Version carries it either way (question 3, kept as
proposed).

**Not chosen:** refusing a report's copy when only the file would take it; making "Installed with" a text field.

## RPT-D4: Posted with gh after a yes (2026-10-24)

**Decision:** With `gh` on `PATH`, the menu offers to post it; nothing is run before it's chosen. Then the account gh
will use, read without the network (`GH_TOKEN` or `GITHUB_TOKEN`, said unchecked; else `gh config get -h github.com
user`), and a yes-or-no naming the title, the repository, the account and that anyone can read it. On yes,
`gh issue create --repo <repo> --title <title> --body-file -`, no label, from the home folder, once at a time, waited
for a minute; the draft is dropped when it's posted and kept when it fails or doesn't answer, said.

**Why:** The issue's "optionally `gh issue create` after showing what it will post"; offered now (the user's choice,
question 2). `gh auth status` would ask GitHub (ideas.md).

## RPT-D5: `slipbox report` runs before any vault is looked for (2026-10-24)

**Decision:** `slipbox report` prints the facts as the bug form asks them and the form's address filled in with them;
`--json` gives the facts, the form's fields by id, the facts' Markdown and the address. It's dispatched before any
vault is looked for, as `--version` is: no vault's config read, no state written, no network. The skill for agents
names it.

**Why:** An agent writing an issue needs the facts; a report is often about a broken vault, which a session would
refuse or warn about (notes.md, Codex's critique 5).

## RPT-D6: Two commands, the second your own config's only (2026-10-24)

**Decision:** `help.report` (`space r`, `:report`; `screen` or `where` adds that; CLI `slipbox report`) and
`help.report_send` (`ctrl+s` and `:w` in the window; `browser`, `address`, `seen`, `copy` or `gh`; no CLI). The second
runs a program, so a folder's `[keys]` or `[aliases]` can't name it (`VAULT_FORBIDDEN_COMMANDS`).

**Why:** Every action is a named command; a clone's keys never run a program (design/trust.md § What runs).

## RPT-D7: The release's repository, else slipbox's own (2026-10-24)

**Decision:** The address and `gh` use the release's repository (`RELEASE.repo`), else `remziduzagac/slipbox`.

**Why:** A fork's release reports to its own issues; one run from source reports to slipbox's.
