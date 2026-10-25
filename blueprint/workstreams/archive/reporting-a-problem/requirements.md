# Requirements

## Goals

- **A problem reported from where it's seen, in a key:** a window asks what happened and what was expected, with
  what slipbox knows already filled in — its version, how it was installed and its channel, the system and its
  processor, the terminal, its size and any multiplexer or SSH between — so nobody copies them by hand.
- **Nothing leaves that wasn't shown:** the window's text is the report, exactly as it will leave; what's on the
  screen, or where you were, is in it only when you add it, and then in full, to read (and cut) first. The draft is
  never written to disk by slipbox.
- **Sent by you, not by slipbox:** the bug form opened in your browser with its fields filled in, or the report
  copied to paste where you like (over SSH, where no browser of yours can be opened); with `gh` on the machine, posted
  by `gh issue create` once you've said yes to what it will post. slipbox's own one network call stays the update
  check (D199).
- **The same facts for an agent:** `slipbox report` prints them, `--json` too, ready for an issue an agent writes.

## Non-goals

- slipbox sending a report itself, by any API, or keeping a credential for one (D183's reasoning holds).
- Logs or crash dumps collected and attached: slipbox keeps no log; its messages (`space m`) are copied by hand when
  they matter.
- Reporting to another project (a language server's, OpenTUI's), or a questions-and-ideas form: those go to
  Discussions (GR-D17).
- A form drawn as a dialog of its own, with fields and buttons: the floating editor holds the report (RPT-D1).

## Builds on

- requirements.md § Constraints, Safety: "The network" (yours alone to allow), `2.9` (everything sanitized), `13.2`
  (an argument vector, never a shell string).
- requirements.md § Agents and the CLI: CLI parity, `--json`, every action a named command.
- design/distribution.md § Channels, § Installing (how an install is told apart), § Updates (the one network call).
- design/tui.md § Overlays (lists, the menu), the floating window (`3.20`) as the commit's editor uses it
  (§ Git), and § Following links (a web link is copied, never opened).
- design/trust.md § What runs (a folder's keys never name a command that runs a program).
- The clipboard (`8.5`, `core/clipboard.ts`): OSC 52, the system's tool, a file.
- `.github/ISSUE_TEMPLATE/bug_report.yml`, the bug form, and its field ids.

## Acceptance criteria

- `space r`, `:report` and help's "Report a problem" open the window: a title line to write, What
  happened, What you expected and the steps to type in, and the facts filled in, every one shown and editable.
- Nothing of the screen or the note is in the report until you add it (`ctrl+s`'s menu, or `:report screen` /
  `:report where`); added, it is shown in the window in full, one undo step away from gone.
- `ctrl+s` in the window offers, by what this machine can do: open the bug form in the browser, filled in; copy its
  address, filled in (over SSH, or with no browser to open); copy the report; post it with `gh` (when `gh` is on
  `PATH`), only after a yes to the repository, the title, the account and that anyone can read it. What's too long for
  the address is left out of it, said, with its own entry to copy it; one copy at a time.
- slipbox makes no network request of its own for any of it: the browser, or `gh`, does, on your say.
- `slipbox report` prints the facts and the form's address, filled in; `--json` gives them as fields named by the
  form's ids, and the body's facts as Markdown; it runs before any vault is looked for, reads no vault's config,
  writes no state and reaches no network.
- The docs (keys, the command line, troubleshooting's "Reporting a problem", privacy), the skill, the bug form's
  descriptions and the CHANGELOG say how.

### Cases

Each a unit test and a terminal check that drives slipbox through it, external programs faked (a fake `xdg-open`,
`gh` on the check's `PATH`; the clipboard by OSC 52 as the checks read it):

- **The window:** opened by `space r`, `:report` and help; the facts in it; no screen, no place; typing on the
  title's line; `esc` twice leaves; reopened as left; quit not refused by it, nothing autosaved, nothing on disk.
- **Adding:** the screen (the frame after the command, without the palette or popup), where you were (a note, a file
  outside the vault, a window with no file); each once, in full, fenced past a note's own fences; `u` takes it out,
  and it can be added again; into an edited draft: What slipbox sees in the middle, missing, after a heading of your
  own; refused while a fence is left open.
- **Sent as written:** the copy and `gh`'s body keep renamed, doubled and moved headings as they are.
- **Reading back:** a screen holding `### Version`; a label renamed, deleted, doubled, reordered; text before the
  first label; the guide edited; fences of your own in What slipbox sees.
- **The address:** each field by id, encoded; each step of the length plan, the facts alone too long included; text
  belonging to no field.
- **The browser:** macOS, WSL (`wslview`, `explorer.exe`), a display, none, over SSH; the opener failing.
- **Copies:** the address, What slipbox sees, the report; refused while the clipboard is busy; the file fallback said.
- **gh:** absent (no entry); no account; an account from `GH_TOKEN` or `GITHUB_TOKEN`, said unchecked; the
  yes-or-no's text; no, then nothing run; a post's argument vector, input and folder; done, failed, timed out; not
  twice at once; no title or no What happened.
- **The facts:** the installer's (stable, preview), Homebrew's, a release placed by hand, source; Linux, macOS, WSL;
  tmux, zellij, screen, herdsman, herdr, OpenTUI's own; SSH by each variable, never its value; a value with escapes.
- **The CLI:** `slipbox report` and `--json` anywhere, in a vault with a broken config, writing no state; `report`
  with an argument refused.
- **Config:** `help.report_send` in a folder's `[keys]` ignored, with a warning.

## Changes

### ADDED requirements.md § Reporting a problem

- A problem is reported from inside slipbox, in a key (`space r`, `:report`, help's "Report a problem"): a window
  asks what happened, what was expected and how to make it happen, with what slipbox knows already filled in — its
  version, how it was installed and its channel, the system and processor, the terminal, its size, any multiplexer and
  SSH (RPT-D1).
- The window's text is the report as it will leave, every field shown and editable; the screen as text, or the note
  and the cursor's line, is in it only when you add it, and then in full (RPT-D2).
- You send it, never slipbox: the bug form opened in your browser with its fields filled in, its address or the
  report copied where there's no browser to open (SSH), or, with `gh` on the machine, posted by `gh issue create`
  after a yes to what it will post. slipbox's own network call stays the update check (RPT-D3, RPT-D4, D199).
- `slipbox report` prints the same facts, and `--json`, for an agent writing an issue; no vault needed, no network
  (RPT-D5).

How: design/tui.md § Reporting a problem; docs/manual/troubleshooting.md § Reporting a problem.
