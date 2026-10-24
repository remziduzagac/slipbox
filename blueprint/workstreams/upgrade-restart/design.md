# Design changes

Each change names the root's design section it lands in at consolidation; the root's files change only when UPG is
consolidated. They cite the decisions behind them, UPG-D1 to UPG-D7 (decisions.md).

## ADDED design/distribution.md § The update offer

When the daily check (§ Updates) finds a version newer than this one, and newer than one you skipped, the TUI asks in a
pop-up, the dialog (tui.md § Overlays), rather than saying so in the message line. The line it said before goes to the
messages list. The offer is `tui/updates.ts`'s (`app.updates`); the check is started by `tui/run.ts`, as now, and its
answer handed to it.

**It waits for a quiet moment**, as it opens on its own. Quiet is one test (`app.updates`' `quiet`, over the input's own
state): no key in flight or waiting its turn (one waiting on a note's parse counts), none for two seconds
(`lastInputAt`, set as a key arrives), nothing pending (a key sequence, the which-key popup, an operator waiting for its
motion, a count, a character awaited by `f`, `t` or `r`), nothing being typed into — not inserting, no visual selection,
no panel's filter (the explorer's, the outline's, Problems', the history's), not the git panel's message — and nothing
open over the windows (a list, a prompt, a dialog, a floating window, the Save As window, the merge screen). What waits
for quiet waits in turn, each once: the daily check's offer, a restart offered underneath, the restart's question (§
Restarting); one never takes another's place, and one asked for again while it waits takes the later asking's way
(`:upgrade`'s offer, whatever the check's switches say). Like every dialog (tui.md § Overlays), it drops what arrives
before it's drawn and in the half second after, so a key meant for a note never answers it. Just before it opens, your
config's `[update] check` and `DO_NOT_TRACK` are read again: an offer waiting when the check was turned off (the config
reloaded) is dropped. A slipbox quit before it opens is asked at the next check.

**What it says:** its title `slipbox 0.6.0 is out`, or `slipbox 0.6.0-preview.202610121530.g1a2b3c4 is out on the
preview channel`; its text `This is 0.5.0.` What it offers is by how this slipbox was installed (`installedBy`):

- **The installer's** — a select of three, the first marked:
  - **Upgrade and restart:** slipbox quit, upgraded and started again where you were, notes unsaved asked about first
    (§ Restarting).
  - **Upgrade, restart later:** the upgrade runs now, beside the TUI: `slipbox upgrade --json`, the running binary's
    own (`process.execPath`; `<data>/current/slipbox` when another window's upgrade removed it), with this
    environment. A process of its own, so the download, its sum, the unpacking and
    the new binary's run never hold the screen up. The TUI says `upgrading to 0.6.0…`, then `slipbox 0.6.0 is installed
    (this is 0.5.0): :restart starts it`, or, as an error, `the upgrade to 0.6.0 failed: <why>`. Quitting meanwhile
    leaves it to finish (UPG-D7): it's what you asked for, and the next start runs what it installed. So it
    outlives the TUI: in a process group of its own (the terminal's signals never reach it), not waited for by the
    TUI's exit (unreferenced), its answer written to a file, `$XDG_STATE_HOME/slipbox/upgrade-<pid>.json`, never a pipe
    whose reader may be gone; the TUI reads the file when the child exits, then removes it.
  - **Not now:** nothing; asked again at the next check, a day on.
- **Homebrew's** — its text goes on `Homebrew's: brew upgrade slipbox upgrades it, and slipbox offers to restart once it
  has.`; its choices **Copy `brew upgrade slipbox`** and **Not now**.
- **One put here by hand** — its text goes on `Put here by hand: the releases are at https://github.com/<repo>/releases,
  and slipbox offers to restart once this file has changed.`; its choices **Copy the releases' address** and **Not
  now**. Copied, never opened, as a URL followed is (tui.md § Following links: a browser over SSH would be wrong).

**And one checkbox**, for any install, **Skip this version**: taken with Not now only, dimmed with another choice;
ticked, it marks Not now.
`update.json` keeps it (`skipped`), and a check finding it, or anything not newer, offers nothing; a newer one is
offered; it's said, `slipbox 0.6.0 skipped: the next newer one is offered`. There's no checkbox to stop the checks
(UPG-D1): your own config's `[update] check = false`, or `DO_NOT_TRACK`, does that, as it does today, and the TUI never
writes your config. A copy is said as any copy is (`copied brew upgrade slipbox`).

`esc`, or a click outside, is Not now with nothing kept.

**Asked for: `:upgrade`** (`app.upgrade`; no key of its own; `slipbox upgrade --check` its CLI equivalent) says `asking
for the newest version…` and asks now, as the daily check asks (`askNewest`) — one request, two on `preview`, the keys
going on meanwhile; asked again before it's answered, `asking for the newest version already` — and offers what it finds
as above, a version you skipped included (UPG-D6). You asked, so it asks whatever `[update] check` and `DO_NOT_TRACK`
say, as `slipbox upgrade` does; the time it asked is kept in `update.json`, as the daily check's is, so the next daily
check is a day later. Its answer comes after a wait: the offer opens at once when nothing was typed or clicked since
`:upgrade`, else once the TUI is quiet, so keys typed meanwhile never answer it; one of the same version waiting for
quiet already is the same offer. The newest installed already, underneath this one (§ An upgrade underneath): its
restart is offered instead, Restart now or Not now, counted as offered. Nothing newer: `slipbox 0.5.0 is the newest` (on
`preview`, `the newest release or preview`). Nothing found: `couldn't find the newest version at <releases>`, as an
error. From source (no release build) it asks nothing and says what `slipbox upgrade` says: `this slipbox runs from
source (or was built by hand): it has no releases to follow — update its checkout`.

## ADDED design/distribution.md § Restarting

**`app.restart`** (`:restart`; no key of its own; an interaction, with no CLI equivalent) restarts slipbox.

**Notes unsaved are asked about first** (UPG-D3), in the dialog: its title `Restart`, its text `2 notes are unsaved:
todo.md, ideas.md.` (the first three named, then `and 4 more`), its choices **Save and restart**, marked, and
**Cancel**; `esc` is Cancel. The properties editor's text not applied yet counts as unsaved. Save and restart saves as
`:wqa` saves — each unsaved note through `writeBuffer`, then the properties editor's text — and one that can't be
(changed on disk: its conflict prompt opens; not valid UTF-8) stops the restart, saying which, and nothing quits.
Cancel restarts nothing; from the update offer, that version is asked about again at the next check, or by `:upgrade`.
With nothing unsaved, it doesn't ask.

Then **the note** for the slipbox that starts is written, `$XDG_STATE_HOME/slipbox/restart/<pid>.json`: the place to
come back to (the location's mode and root, home's folder opened by name), this window's session as `Session.save`
writes it — its tabs, windows, positions, the panes' sizes — the version it was, and the upgrade asked for. It's read
back to be sure; one that can't be written stops the restart, said, and nothing quits. A restart that stops says why:
`the restart stopped: index.md isn't saved`, `… its note couldn't be written (<why>)`. Then slipbox quits as quitting
does — running work stopped (exports, shell jobs, language servers, the threads), the session and positions saved —
and starts again in the same terminal: into the newest version installed (§ An upgrade underneath), else the same.
Upgrade and restart (§ The update offer) is the same with the upgrade in between. While an upgrade runs beside the TUI
(Upgrade, restart later), a restart waits for it, saying so; then it goes on at once when nothing was typed or clicked
meanwhile, else once the TUI is quiet. The question about notes unsaved, opened by the very key or click that chose the
restart, drops what arrives before it's drawn and in the half second after: a second `enter`, a double click, never
answers it.

**The screen given back first.** OpenTUI's `destroy` finishes later when a frame is being drawn, and its native
teardown (raw mode off, the main screen back, mouse reporting off) comes after its `destroy` event: the hand-over waits
for that event, then a turn of the event loop, before it writes a line or replaces the process.

**The hand-over** (`core/restart.ts`; UPG-D2) runs in the same process, in order:

1. **The upgrade**, when asked for: `slipbox: upgrading to 0.6.0… (ctrl+c cancels)`, then `upgrade`'s work (§ Updates)
   done by the version that was running, as `slipbox upgrade` does it, and what `slipbox upgrade` says after it
   (`slipbox: slipbox 0.5.0 → 0.6.0; 0.5.0 is kept, to go back to`). `ctrl+c` during it cancels it up to its commit,
   `current` moving: the releases' lookup or the download stopped at once, or, once it's downloaded, `current` left as
   it was; after the commit, the upgrade is done and said. `tar` and the new binary's `--version` run in a session of
   their own when there's a cancel to end them (the hand-over's), so the terminal's `ctrl+c` reaches the hand-over
   alone; without one — the command line's `slipbox upgrade` — they stay in the terminal's group, which `ctrl+c` ends
   with it. A failure or a cancel says
   `slipbox: the upgrade to 0.6.0 failed: <why> — starting slipbox again` (`cancelled`, for a cancel).
2. **The note** given the upgrade's outcome, and the time, now.
3. **Which binary:** the installer's install, `<data>/current/slipbox` — after a failed upgrade, the file that was
   running (`process.execPath`), or `current` when that's gone; Homebrew's, `<prefix>/opt/slipbox/bin/slipbox`,
   Homebrew's link to the version it has now, as the running file's keg may be gone; one put here by hand, the path it
   was started by (`argv0` with a slash, else found on `PATH` as the shell found it, at start), so a link moved to
   another file is followed; from source, Bun with the same script.
4. **The same arguments**, `process.argv.slice(2)` for a compiled binary (`slice(1)` from source, the script first),
   and the environment as it is now.
5. **Before it starts:** the children quitting stopped (language servers, a shell job) waited for, a second at most,
   and reaped, since the new slipbox in this process never reaps what it didn't start, and one ending later stays a
   zombie as long as it runs (Linux, by `/proc`; elsewhere not waited for). None is killed: what goes on running is
   meant to — an editor handed a note, a git commit or pull quitting leaves to finish, an upgrade beside the TUI. Then
   what was typed at the terminal meanwhile is thrown away (`tcflush`): never keys for the new one; and what runs as a
   process exits (`process.on("exit")`: an export's spool and temp files removed) is run, since `execve` ends this one
   without it.
6. **`execve`**, through `bun:ffi` and libc as D221's switch is set: the process becomes the new slipbox, with the same
   pid, process group and terminal, so the shell's job never ended and its job control stays right (research.md).
   Descriptors aren't closed, so a failed call leaves this process whole: on Linux, where libc has `close_range`, every
   one above 2 is marked close-on-exec first; elsewhere they're left, Bun's own close-on-exec but one (`/dev/urandom`,
   one more a restart). Where `execve` can't be reached (libc not found by FFI, or the call fails) — and on native
   Windows, which has none (`14.14`–`14.17`) — the new one is started with the terminal handed down and waited for;
   this process ignores the terminal's signals meanwhile, which reach the new one in the same foreground group, and
   ends with its exit code. Its note is then found by its parent's pid.
7. **Nothing starts** (the binary gone, or not runnable): `slipbox: couldn't start <file>: <why>`, then `slipbox:
   nothing started (<why execve failed>)`, and it exits 1, at the shell's prompt.

**Coming back.** A TUI starting looks for its note (`restart/<pid>.json`, else `<ppid>.json`), takes it — read and
removed; one older than two minutes is ignored — and comes back where you were (UPG-D4). The arguments are the same;
the note gives the place, so the arguments' path and `--root` give way to it, and `--base`, a start's instruction
already kept for its branch (`baseAtOpen`), isn't applied again — another vault's, it would measure the wrong
repository, and a ref gone since would stop the start. The session restored is the note's, whatever
`ui.restore_session` and a note named say, and never `session.json`'s, which another window on the same vault may have
written meanwhile — read as the session file is, anything this version can't read dropped: another version wrote it.
It says
`restarted: slipbox 0.6.0 (was 0.5.0)` — its own version, the one that started — or, as an error, `the upgrade to
0.6.0 failed: <why> — this is 0.5.0`.

## ADDED design/distribution.md § An upgrade underneath

A release build looks, every ten seconds, at where its next version would be — on this machine, nothing sent, so
whatever `[update] check` and `DO_NOT_TRACK` say (UPG-D5):

- the installer's install: the version `<data>/current` names — once it changed from the one it named at start: a
  version newer than this one already there then (you went back to the older one kept, on purpose) isn't offered;
- Homebrew's: where `<prefix>/opt/slipbox` leads (`…/Cellar/slipbox/<keg>`), and once that changes, the binary's
  `--version` asked: a keg's name may carry Homebrew's revision (`0.6.0_1`);
- one put here by hand: the path it was started by, where it leads and that file's size, time and inode; once any of
  them changes, the file's `--version` asked.

A version is asked of a binary in a child, ten seconds at most, and only once what's there changed: what's there at
start is this binary, never started to ask it. One newer than this — `slipbox upgrade` in another
terminal, another window's restart, `brew upgrade`, a file copied over — is offered as the restart alone, waiting for
quiet as the offer does: `slipbox 0.6.0 is installed`, `This is 0.5.0.`, **Restart now** and **Not now**, no
checkboxes. Once for each version: after Not now, `slipbox 0.6.0 is installed: :restart starts it`. This window's own
upgrade (Upgrade, restart later) isn't offered again: its message said it — nothing underneath is looked at while it
runs, whatever version it installs.

## MODIFIED design/distribution.md § Updates

The daily check's paragraph, whole:

**The daily check** is the TUI's, never the CLI's — agents call the CLI. It asks only when this is a release build,
`[update] check` is on in your own config (it is by default; a folder's config can't turn it on, or off, and is warned
of when it tries: a network request is yours to allow; DF-D23), `DO_NOT_TRACK` isn't set (anything but `0` or
`false`), and a day has passed since the last time (`$XDG_STATE_HOME/slipbox/update.json`, kept before asking, so a
failure waits a day too). A newer release, unless it's one you skipped or older, is offered in a pop-up (§ The update
offer); the messages list keeps what was said of it: `slipbox 0.3.0 is out (this is 0.2.0): slipbox upgrade installs
it` — on `preview`, `slipbox 0.3.0-preview.202610121530.g1a2b3c4 is out on the preview channel (this is 0.2.0): …`;
`brew upgrade slipbox` for Homebrew's, and the releases' address for a binary put somewhere by hand. It follows the
installer's install's channel; any other install's, stable releases.

Previously: "A newer release is said in the message line: `slipbox 0.3.0 is out (this is 0.2.0): slipbox upgrade
installs it` — on `preview`, …"; the rest as above.

Adds, to `slipbox upgrade`'s paragraph, after "Any check failing changes nothing.":

**One upgrade at a time.** An install's upgrades take turns: `<data>/upgrade.lock`, made only when there's none, holds
the pid of the one running and when it began. Another finding it says `another upgrade is running (pid <n>)` and changes
nothing; one left by a process that's gone, or older than fifteen minutes (a download gives up after five), is taken
over — moved aside first, then removed only if it's still the one read as stale, another's put back, so two taking over
at once can't both go on; one being written, not readable yet, is held for a few seconds — and what upgrades cut short
left (`versions/.upgrade-*`, `current`'s link half made) is removed, what can't be left — never the lock held for good.
A slipbox whose version another window's upgrade removed is still the installer's, by the path it ran from (Linux names
it `… (deleted)`).

**Against what's installed, not only what's running.** Holding the lock, `upgrade` reads the version `current` names: a
slipbox still running an older version (a window not restarted yet) never moves `current` back. The newest the channel
offers, not newer than `current`'s, installs nothing (`installed`, in `--json`'s `status`, with the version as
`installed`): `slipbox 0.6.0 is installed already (this is 0.5.0)`. The
channel's newest already in `versions/` — another window's upgrade, or one cut short after its folder was in place —
is taken as it is once its binary says its version: `current` moved to it, nothing downloaded. What's kept is the new
version, the one `current` named before, and the one running; any other is removed.

**Its commit is `current` moving.** An upgrade can be cancelled (the hand-over's `ctrl+c`, § Restarting) up to it:
the download stopped, or the work's folder removed. So that a cancel is seen while it unpacks and runs the new binary,
`tar` and the binary's `--version` are children it awaits, never run synchronously, and it looks for a cancel last just
before `current` moves; a version's folder already moved into `versions/` is left there,
complete, for the next upgrade to take. After it, the upgrade is done. One killed at any point leaves the install
consistent: `current` names a complete version, the old one or the new.

## MODIFIED design/tui.md § Overlays

Adds, after the which-key popup:

**The dialog** (`tui/dialog.ts`) asks a question with controls of its own: a select, and checkboxes when it has any.
The update offer is its first (distribution.md § The update offer), and a restart's question about notes unsaved its
second (§ Restarting). Framed like the other popups, its title in its top border, it shows
its text, wrapped; its select's choices, one a row, the one chosen marked `●` and the others `○` (`(*)` and `( )` in
ASCII's glyphs); its checkboxes, `☑` or `☐` as a task's (`[x]`, `[ ]`), one the chosen choice doesn't take dimmed; and,
under a rule, what the row under the cursor does (as many rows as the longest help needs, at most three, so it keeps
its height). Its keys are in its bottom border: `enter: do it · space: tick · esc: not now` (`space` only with
checkboxes; `esc` says what it does: `not now`, `cancel`). The marks are glyphs of each set (`choiceOn`, `choiceOff`).

- `↑` / `↓`, `j` / `k`, `tab` / `shift+tab` and `ctrl+n` / `ctrl+p` move the cursor over the choices, then the
  checkboxes, wrapping; on a choice, the cursor marks it.
- `space` ticks or unticks the checkbox under the cursor; a dimmed one is ticked, and the choice it goes with marked.
- `enter` does the choice marked, with the checkboxes as they are; `esc` cancels, as the dialog says.
- A click on a choice marks it and does it; a click on a checkbox ticks or unticks it, as `space` does; a click outside
  is `esc`.
- Every dialog drops the keys, pastes and clicks that arrive before it's first drawn and in the half second after, by
  when they arrived (each its own time, taken as it's queued), not when they're handled: one meant for a note, or for
  the dialog that opened it, never answers it.

## MODIFIED design/how-it-works.md § Module map

Adds rows:

| Module | Steps | Role |
| --- | --- | --- |
| `core/restart.ts` | UPG | the restart's note; the hand-over: the upgrade, the binary, `execve` into it |
| `core/libc.ts` | UPG | libc through `bun:ffi`, opened once: `setenv` (D221), `execve`, `close_range`, `tcflush` |
| `core/processes.ts` | UPG | whether a process still runs: a lock's holder, a TUI's unsaved notes, an export's spool |
| `tui/dialog.ts` | UPG | the dialog: text, a select and checkboxes; its keys and clicks |
| `tui/updates.ts` | UPG | the update offer, `app.upgrade`, `app.restart`, an upgrade underneath noticed |

## MODIFIED design/distribution.md § Updates, Bun's own crash reports

In "Bun's own crash reports", "libc's `setenv`, through `bun:ffi`" becomes "libc's `setenv`, through `bun:ffi`
(`core/libc.ts`, which opens libc once a process for this and for a restart's `execve`)".

## MODIFIED design/how-it-works.md § Only the final draw step touches OpenTUI

`src/tui/run.ts`'s row: "shutdown" becomes "shutdown, and a restart's hand-over once the screen is given back".

## MODIFIED design/how-it-works.md § Storage

The update check's row: `$XDG_STATE_HOME/slipbox/update.json` (when it last asked, what it found, the version you
skipped). Adds: a restart's note (UPG), `$XDG_STATE_HOME/slipbox/restart/<pid>.json` (the place, the window's session,
the versions; read and removed by the slipbox it starts); and, in the installer's data folder, `upgrade.lock` (the pid
of the upgrade running).

Previously: `$XDG_STATE_HOME/slipbox/update.json` (when it last asked, what it found).

## MODIFIED design/testing.md § The terminal tests

Adds a check file, `updates` (`tests/terminal/checks/updates.ts`), of the offer, `:upgrade`, and the restart with its
question about notes unsaved, driving real release builds (`tests/terminal/releases.ts`): two of the checkout, built for
this machine (no `--target`, which would download Bun's runtime) with `SLIPBOX_RELEASE` defined, once a run before the
workers start, when a chosen check says `releases` — the runner tells its workers where (`SLIPBOX_TERMINAL_RELEASES`) —
the second from a copy of the sources whose `version.ts` says the next patch version, so the slipbox that comes back is
the new one. A check installs the first in its own data folder as the installer lays it out (linked, not copied), as
Homebrew does (a keg and `opt`), or put by hand, and starts it: the harness's `bin` starts a given binary in place of
`bun src/main.ts`. The second is a release served from a folder (`SLIPBOX_RELEASES_URL=file://{releases}`, its pack and
`SHA256SUMS`), or from a local server holding the pack back three seconds, for quitting during a background upgrade (its
address in the session's `extraEnv`, which a check's `setup` fills): the shell's prompt back at once, the version
installed after. On Linux, `/proc/<pid>/exe` shows the process runs the new file itself, not waiting on a child.
`:restart`'s question about notes unsaved is checked from source.
