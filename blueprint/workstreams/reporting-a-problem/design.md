# Design changes

Each change names the root's design section it lands in at consolidation; the decisions it cites are in
decisions.md.

## ADDED design/tui.md § Reporting a problem

`space r`, `:report` or help's "Report a problem" (`help.report`) opens the report: what you'd write in the bug form,
with what slipbox knows already in it, in the floating window (`3.20`) as a commit's message is (RPT-D1). Its text is
the report exactly as it will leave; nothing leaves until you send it, and you send it, never slipbox (RPT-D3).

**The window.** Kind `report`, a virtual Markdown buffer (`report`) in source mode, made as the commit's is: outside
the app's buffers, so it's never in the unsaved list that stops a quit, never autosaved, never in the history or the
session. The `Reporter` (`app.report`) keeps the buffer and its view while the window is closed. Titled "Report a
problem"; its bottom border says ` ctrl+s sends it or adds the screen · esc · q leaves it ` (never the floating
window's "writing back"); the status line names it `report`, with no "unsaved" mark, since it's never saved anywhere.
A new one opens typing, on the title's line (empty, the line after the guide); the first `esc` leaves typing, the next
leaves the window, and focus goes back where it was opened from (the explorer, say). Opened over the merge screen of
the conflict prompt's (m), that question is asked again once typing stops, as for any conflict that comes while you
type — never over the report as it opens typing, where the title's letters would answer it. Opened again, it's
as it was left, not typing. Its text, the title typed:

````markdown
<!-- Nothing has left yet. The next line is the title; ctrl+s sends it all, or adds the screen first. -->

Links lose their anchors

### What happened

### What you expected

### Steps to make it happen

### Version

0.5.1 (the installer's, stable channel, linux-arm64 build, Bun 1.3.1)

### Installed with

the installer (install.sh)

### Platform

Ubuntu 24.04.1 LTS (Linux 7.2.9), arm64

### Terminal

ghostty 1.2.0, TERM_PROGRAM herdsman 0.2.0, TERM xterm-ghostty, 236×60, inside herdsman, over SSH
````

- The headings are the bug form's own labels (`.github/ISSUE_TEMPLATE/bug_report.yml`), so what's copied or posted
  reads as an issue the form made, and the address's fields are read back from it (below).
- Every fact is text like the rest: cut a path or a name you'd rather not share. `u` undoes, as anywhere.
- `esc` leaves it; opened again, it's as you left it, the facts kept as edited. The draft is kept in memory only,
  never written to disk by slipbox, until `gh` has posted it or slipbox quits. (A copy you make is a copy: when no
  clipboard takes it, it's the state folder's `clipboard.txt`, as every copy's, and said.)
- `ctrl+s` (`:w`) is `note.save`, which in the report runs `help.report_send`, the menu (§ Sending), changed or not.
  The buffer's own save — which an edit that saves after it calls too (a link put in, a footnote added) — has nothing
  to write, and opens nothing. Never said as "saved" or "sent". A task toggled in it flips in its text. `:w!`
  (`note.save_force`) on any virtual buffer is `:w`, and `App.writeBuffer` refuses a virtual buffer: the floating
  window's text is never written to its name on disk (said). A task toggled in a read-only window — a peek, a
  hover — is refused, said, its file never written from there.

**Reading it back.** The copy and `gh` send the text as you left it, the generated guide taken out (and for `gh`, the
title line, which becomes its title); nothing in them is moved or joined. Only the address maps the text onto the
form's fields, by one rule, which also says where an added screen goes:

- Headings count only outside fences (```` ``` ```` and `~~~`, any length): a screen holding `### Version` is the
  screen's text.
- A section is a form label's `###` heading, matched exactly, to the next one. A heading of your own (`### Logs`), or
  a label renamed, is text of the section above it; a label twice, the two joined; a label deleted, its field empty;
  the order is yours.
- The generated guide comment is left out of the copy and `gh`'s body only as generated; edited, it's kept as text
  (GitHub hides a comment anyway). Before the first label, a comment is never the title, nor text the address would
  lose.
- The title is the first line with text before the first label, a comment aside. A comment opens its line, as an HTML
  block does, anywhere outside a fence — after a quote's `>` or a list item's marker too, and, in a line one holds, a
  `<!--` later in it; `<!--` later in a paragraph's line is the line's own text (CommonMark), the title's as
  typed. Nothing in a comment, nor the rest of a line one starts, is a label or opens a fence; in a section it's the
  section's text, as written. Text after a comment's end on the title's line is the title; what's before the title
  there stays in `gh`'s body, so the body never opens a comment it doesn't close. Any other text there belongs to no
  field: the address would lose it, so the menu says so and offers the copy and `gh` only (below), until it's moved
  under a heading.
- What slipbox sees: its generated outer fence is taken off for the address (the form fences that field itself);
  fences you wrote, and text around them, are kept — and any line that could end a fence (a note's own in the screen
  or the place, or yours) is indented four spaces there, which no fence's end may be (CommonMark), so nothing in it
  ends the form's own block early, whatever fence GitHub picks. The copy and `gh` keep it as written.

**The facts** (`core/report.ts`, RPT-D1), the same as `slipbox report` prints:

- **Version:** `VERSION`; how it was installed, in a word ("the installer's", "Homebrew's", "a release put in place by
  hand", "from source or built by hand"), since the form's dropdown may not fill from the address (RPT-D3); the channel
  only for the installer's install (`readChannel`, which says stable when there's no file, so never asked of
  another); the release's platform (`RELEASE.target`); Bun's version.
- **Installed with:** the form's own wording: "the installer (install.sh)", "Homebrew" (`installedBy`), "from
  source" (no `RELEASE`); a release's binary put somewhere by hand says so in words of its own.
- **Platform:** the system's name and version (Linux's `/etc/os-release` `PRETTY_NAME`, else its `NAME` and
  `VERSION`; macOS's `SystemVersion.plist`), the kernel (`os.release()`), the processor (`process.arch`), and WSL when
  it's there (`core/wsl.ts`): `Ubuntu 24.04.1 LTS in WSL (Linux 5.15.167.4-microsoft-standard-WSL2), x64`.
- **Terminal:** what the terminal answered when asked who it is (OpenTUI's `capabilities.terminal`, from XTVERSION;
  the TUI only), `TERM_PROGRAM` and its version, `TERM`, the size in cells, the multiplexer and SSH. The multiplexer is
  OpenTUI's when it names one, and the environment's (`TMUX`, `ZELLIJ`, `STY`, `HERDSMAN_ENV`, `HERDR_ENV`, each set
  and not empty), each once: OpenTUI's `none` or `unknown` never hides what the environment says. The terminal's own
  name is the XTVERSION answer's alone (OpenTUI's `from_xtversion`), else none: `TERM_PROGRAM` says it apart. Nothing
  known at all, "not known". SSH is `SSH_CONNECTION`, `SSH_CLIENT` or `SSH_TTY` set, or
  OpenTUI's `remote`. These are presence only: an address, a socket path or a session's name is never written.
- Each value from the environment or a file is sanitized (`2.9`) and cut to a line.

**What you saw, if you add it** (RPT-D2). slipbox keeps two things when the report opens, and puts neither in it:

- **The screen as text:** the frame drawn after the command ran — the palette, help or the which-key popup that ran
  it closed, the messages showing as they were — drawn as every frame is and kept as text too, onto a `TextCanvas` of
  the screen's size (`tui/canvas.ts`) beside the terminal's canvas, that frame only; the window opens on the next. Its
  rows, with their trailing blanks cut. A picture isn't text, and isn't in it. Keys after the command wait for that
  frame (a quarter of a second at most, and then no more), so a paste or keys sent at once go to the report, never
  the window under it; `:report screen` and `:report where` asked before it both add theirs.
  A frame whose drawing failed is kept as the screen that says so, and the report opens all the same: it's wanted
  most then.
- **Where you were:** the window's file (its path in the vault, else from home, `~/…`; a peek's, its vault's name and
  its path there), the cursor's line number and
  how it was shown (rendered, source, the lens open; nothing said for a file that isn't a note), then that line's
  text: `handbook/operations-handbook.md, line 3, rendered`. A window with no file (a hover, none open): "no file was
  open".

`:report screen` or `:report where` (`help.report screen|where`), or the menu, adds one to the report, in full, in a
```` ```text ```` fence longer than any run of backticks inside, so a note's own fences can't end it, under a first
line of its own (`The screen, 236×60, as the report opened:`, `Where it was:`). It goes at the end of the `### What
slipbox sees` section as § Reading it back finds it, before the next label wherever that section is; with no such
section, a new one at the end of the text. A fence left open anywhere outside one makes that end unclear: it's
refused, saying to close the fence first, so the screen never lands inside another field or another fence. It's one
undo step: `u` takes it out. Added is its first line being in the text, outside any fence (the same words in a note's
line, inside an added screen or place, don't count): deleted, it can be added again; there, the entry is gone and the
command says so. Opened again, the window keeps what was added; the screen kept is the newer
one.

**Sending** (`ctrl+s`, `:w`: `help.report_send`; RPT-D3, RPT-D4). A menu, "Send the report — nothing has left yet",
each entry with its key and run as its command (`help.report_send browser`, `help.report screen`, …); only those this
machine can do, each saying what it does with what (the address's what it leaves out). Text that belongs to no field
heads it, said, and `o` and `a` aren't there:

| Key | Entry | Shown |
| --- | --- | --- |
| `o` | Open the bug form in your browser, filled in | a browser can be opened here |
| `a` | Copy the bug form's address, filled in | always |
| `v` | Copy What slipbox sees, to paste into its field | it doesn't fit in the address |
| `c` | Copy the report, as Markdown | always |
| `g` | Post it with gh | `gh` on `PATH` |
| `s` | Add the screen as text | not added yet |
| `w` | Add where you were | not added yet |

- **The address** is `https://github.com/<repo>/issues/new?template=bug_report.yml` and a parameter per field, by the
  form's ids (`title`, `version`, `install`, `platform`, `terminal`, `happened`, `expected`, `steps`, `output`),
  encoded as `URLSearchParams` does. No `labels`: a reporter can't label, and the form labels it `bug` itself.
  `install` is passed though a dropdown may not take it from the address (research.md, Gaps): Version says how it was
  installed too. `<repo>` is the release's (`RELEASE.repo`), else slipbox's own, `remziduzagac/slipbox` (RPT-D7).
- **Its plan** (`core/report.ts`: the address, what it leaves out, and why), made when the menu opens, the length
  measured on the encoded address: at most 5,000 characters (research.md: about 5,500 survives GitHub's sign-in
  redirect). In order: every field; else every field but `output`, which `v` copies; else the title and the facts;
  else the facts alone; else none but the template. `o` and `a` say what they leave out ("filled in but What slipbox
  sees: v copies it"), and `c` copies everything. Text that belongs to no field (§ Reading it back) leaves `o` and `a`
  out, said. So does a fence left open, where each field ends isn't clear, and a comment (`<!--`) left open anywhere,
  which GitHub would hide the rest behind, the facts among it (the menu's first line says which); the comment also
  stops `gh` and an added screen.
- **One copy at a time:** each entry puts one thing on the clipboard, never two in a row; another asked for while one
  is being made is refused ("still copying — wait for it"). `o` copies nothing when the
  browser opens; when it can't, it copies the address and says what's still left out (`v`, `c`). Each copy is said
  as `App.copy` says it — by OSC 52, which a terminal never confirms; by the system's tool; or written to
  `clipboard.txt` — and a copy refused (the clipboard busy) is said, never claimed.
- **The browser** (`core/browser.ts`): `open` on macOS; in WSL, `wslview`, else `explorer.exe`; elsewhere `xdg-open`
  when there's a display (`DISPLAY`, `WAYLAND_DISPLAY`); none over SSH, where a browser would open on that machine,
  not yours — the entry isn't shown, and `a` copies the address to your terminal's clipboard (OSC 52). Run as an
  argument vector (`13.2`) by the host's `runDetached`, nothing read from it; its exit waited for five seconds, one
  that hasn't answered by then taken to have opened it: a failure copies the address instead and says why
  (`explorer.exe` answers 1 when it worked: not taken for one). A link to the web is still copied, never opened
  (§ Following links, unchanged): this is the one place slipbox opens a browser, because it's what you chose.
- **gh** (`core/gh.ts`): nothing is run until you choose it. Then the account, as gh will use it, without the
  network (no question opens for keys typed meanwhile, counted from the key that asked, so one sent with it counts
  too: a `y` among them would answer it — said, `ctrl+s`, `g` asks again): a token in `GH_TOKEN` or `GITHUB_TOKEN`
  comes before what gh keeps, so then it's "the account of GH_TOKEN (not checked)"; else the account gh keeps
  (`gh config get -h github.com user`); neither, and it says `gh auth login` first; gh not answering in five
  seconds, or not starting, said as that. gh is run as every helper is
  (`core/tool-process.ts`: its output capped, its process group stopped at its deadline and when slipbox ends), with
  `GH_PROMPT_DISABLED=1`, so it never waits on a question of its own. The report closed meanwhile, or something
  opened over it, and nothing is asked over that: said, `ctrl+s`, `g` asks again. A
  yes-or-no names everything: `Post "<title>" on <repo> as <account>? Anyone can read it.`, the title and text read
  once the account is known, and on yes those are posted — `gh issue create --repo github.com/<repo> --title <title>
  --body-file -` (github.com by name, as the account was read and the bug form is, whatever `GH_HOST` says), the text
  after the title on its input — from the home folder (never the vault's, so no folder's settings reach it), waited
  for up to a minute. While it posts, the window is closed and the report can't be opened or posted again ("posting
  the report with gh… — wait for it"). Done: the issue's address said, the draft dropped. Failed: gh's first lines
  said, the draft kept. No answer in a minute: gh killed, the draft kept, and said that it may have posted — look at
  the issues before posting again. No title, or no What happened, and it asks for them first.
- The window stays open after the browser or a copy, to send again another way.

**Commands.** `help.report` (`space r`, `:report`; CLI: `slipbox report`) opens the report, or with `screen` or
`where` adds that to it; `help.report_send` (`ctrl+s` and `:w` in the window; no CLI) opens the menu, or with
`browser`, `address`, `seen` (`v`), `copy` or `gh` sends that way. `:report`, a space typed, lists its arguments;
each command refuses an argument it doesn't know. Outside a report, `help.report_send` says how to start one, and
`help.report screen|where` opens it with that added. `help.report_send` is your own config's only
(`VAULT_FORBIDDEN_COMMANDS`, as one that runs a program): a folder's `[keys]` or `[aliases]` can't bind it
(design/trust.md § What runs).

**From the CLI** (RPT-D5). `slipbox report` prints the facts as the bug form asks them, a line each, and the form's
address filled in with them; nothing typed, no screen. It's run before any vault is looked for (as `--version` is):
no config of a vault read, no state written, nothing reaching the network. `--json`: `{ facts, fields, body, url }` —
`facts` structured (`version`, `channel`, `installedBy`, `release`, `bun`, `system`, `terminal`), `fields` by the
form's ids (`version`, `install`, `platform`, `terminal`), `body` the facts' sections as Markdown, ready for `gh issue
create --body-file`, and `url`. The terminal's size is stdout's when it's a terminal, else left out; the CLI never asks
the terminal who it is. The skill for agents (`core/skill.ts`) names it: an agent writing an issue runs `slipbox
report --json` first.

Code: `tui/report.ts` (the `Reporter`, `app.report`: the window, the frame and place kept, the menu, sending),
`core/report.ts` (the facts, the report's text, reading it back, the address's plan), `core/browser.ts`,
`core/gh.ts`, `cli/report.ts` (`slipbox report`, dispatched by `cli/cli.ts` before the session); the host's
`terminal()` (`tui/run.ts`) hands the TUI a plain copy of OpenTUI's answer, so nothing else touches OpenTUI.

## MODIFIED design/tui.md § The TUI (its table of files)

A row added to the table under "Code, in `src/tui/`", after `pictures.ts`, …:

| File | Role |
| --- | --- |
| `report.ts` | reporting a problem: the window, the screen and place kept, sending (§ Reporting a problem) |

Previously: the table had no row for reporting a problem.

## MODIFIED design/how-it-works.md § Module map

Rows added, after `core/skill.ts` and after `cli/install.ts`:

| Module | Plan | What |
| --- | --- | --- |
| `core/report.ts` | RPT | a bug report's facts (slipbox, the system, the terminal); its text read back; the address |
| `core/browser.ts` | RPT | a browser opened on an address, by platform; none over SSH |
| `core/gh.ts` | RPT | `gh` found, its account read, `gh issue create` run |
| `cli/report.ts` | RPT | `report`, run before any vault is looked for |

Previously: no rows for them.

## MODIFIED design/tui.md § Writing notes

Its first paragraph, in full:

Every write goes one way (`writeBuffer`; D142): the file is replaced atomically (a temp file in the same
folder, then a rename) keeping its permissions; a symlinked note is written through to its target,
and a target outside the vault is refused (`7.5`) — in home, a link you followed is written through wherever it
leads, and in Elsewhere what the file system allows (VV-D6; [roots.md](../../design/roots.md) § Links followed only when
you say so); the watcher is told the write is its own; the buffer reloads, its windows keeping their anchors, so the
cursor stays put. A virtual buffer (`3.20`: a note's properties, a commit's message, a peek, a report) is no file:
`writeBuffer` refuses it, said, and `:w!` on one is `:w`, its own save (RPT, found by its review).

Previously: Every write goes one way (`writeBuffer`; D142): the file is replaced atomically (a temp file in the same
folder, then a rename) keeping its permissions; a symlinked note is written through to its target, and a target
outside the vault is refused (`7.5`) — in home, a link you followed is written through wherever it leads, and in
Elsewhere what the file system allows (VV-D6; [roots.md](../../design/roots.md) § Links followed only when you say
so); the watcher is told the write is its own; the buffer reloads, its windows keeping their anchors, so the cursor
stays put.

The paragraph on task checkboxes, in full:

**Task checkboxes** (`4.11`) are the first write. `ctrl+l` (`space n t`), or a click on the checkbox, flips the task
item holding the cursor — the innermost, from any of its rows; in source mode and the lens, the one holding the
cursor's line, found in the parse — as a one-byte edit to the file's bytes, so a BOM, CRLF endings and even invalid
UTF-8 survive untouched. If the file changed on disk since it was shown, it is reloaded instead and nothing is written
(its lines may have moved). With unsaved changes it flips the mark in the text on screen instead — an undo step, left
unsaved ("done ✓ (unsaved)") — never on disk under them. In a read-only window — a peek, a hover, a file as it was in
git — it's refused, said: that file is never written from there.

Previously: **Task checkboxes** (`4.11`) are the first write. `ctrl+l` (`space n t`), or a click on the checkbox,
flips the task item holding the cursor — the innermost, from any of its rows; in source mode and the lens, the one
holding the cursor's line, found in the parse — as a one-byte edit to the file's bytes, so a BOM, CRLF endings and
even invalid UTF-8 survive untouched. If the file changed on disk since it was shown, it is reloaded instead and
nothing is written (its lines may have moved). With unsaved changes it flips the mark in the text on screen instead —
an undo step, left unsaved ("done ✓ (unsaved)") — never on disk under them.

## MODIFIED design/trust.md § What runs

Its links are written as from this file; in trust.md they're `../../docs/…`, as they are there now.

The first paragraph, in full:

slipbox runs programs you chose: your editor, git, and the servers and linters found in your config, on `PATH`, in
your install folders (Mason's `bin`, `~/.cargo/bin`, `~/go/bin`, `~/.local/bin`) or installed by slipbox itself
(D172); and, when you send a report, your system's way of opening a browser, or `gh` once you've said yes (RPT-D3,
RPT-D4). In a vault you trust, a folder's own tools run too, each as it would anywhere else: its own defaults, the
folder's settings, its own copy.

Previously: slipbox runs programs you chose: your editor, git, and the servers and linters found in your config, on
`PATH`, in your install folders (Mason's `bin`, `~/.cargo/bin`, `~/go/bin`, `~/.local/bin`) or installed by slipbox
itself (D172). In a vault you trust, a folder's own tools run too, each as it would anywhere else: its own defaults,
the folder's settings, its own copy.

In the second paragraph, the sentence on keys, in full:

Nor may a folder's `[keys]` or `[aliases]` name a command that throws work away or runs a program (`shell.run`,
`shell.filter`, `help.report_send`), so a clone can't put one on `ctrl+s` or `:wq` (`USER_ONLY`, each with its reason,
and `VAULT_FORBIDDEN_COMMANDS` in `core/config.ts`; [configuration.md](../../../docs/manual/configuration.md), "What
only your own file can set").

Previously: Nor may a folder's `[keys]` or `[aliases]` name a command that throws work away or runs a program
(`shell.run`, `shell.filter`), so a clone can't put one on `ctrl+s` or `:wq` (`USER_ONLY`, each with its reason, and
`VAULT_FORBIDDEN_COMMANDS` in `core/config.ts`; [configuration.md](../../../docs/manual/configuration.md), "What only
your own file can set").

## No design change: the bug form

`.github/ISSUE_TEMPLATE/bug_report.yml` keeps its fields, labels and ids (the address relies on them); only its
descriptions change, saying that `space r` in slipbox fills them in and `slipbox report` prints them, and that the
screen as text goes in "What slipbox sees". design/repository.md § The repository's documents ("the bug form (all
fields required but the output); blank issues off") stays true as written.
