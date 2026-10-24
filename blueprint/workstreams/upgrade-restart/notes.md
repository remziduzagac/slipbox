# Notes: upgrading and restarting from the TUI

## The draft (2026-10-24)

- **Read:** issue #23; design/distribution.md § Installing, § Homebrew, § Channels, § Updates; design/tui.md §
  Overlays, § UI settings; `core/update.ts`, `core/install.ts`, `tui/run.ts`, `tui/session.ts`, `tui/saving.ts`
  (`requestQuit`, `:wqa`'s `app.save_quit`), `tui/saveas.ts` (a window of its own, the dialog's model).
- **Found:** quitting doesn't write unsaved notes — `:q` refuses while there are some, `:wqa` saves them, then quits —
  so "written as quitting writes them" is read as `:wqa`'s saving. The TUI never writes your config
  (design/tui.md § UI settings), which "keep checking daily, written to your own config" changes. A URL followed is
  copied, never opened in a browser (tui.md § Following links), so the hand-put binary's choice copies the releases'
  address. A session isn't restored when a note is named or `ui.restore_session` is off, so a restart forces it.
- **Research:** a compiled Bun replacing itself by `execve`, in research.md: it works and keeps the process; one
  descriptor isn't close-on-exec.
- **Drafted:** requirements.md, design.md, ideas.md.

## Codex's critique (2026-10-24)

Codex read the draft against the code (`tmp/issue/codex-request-1.md`); twelve findings, eleven taken into design.md:

1. Closing descriptors before `execve` would leave the fallback a broken runtime: taken — none closed; marked
   close-on-exec by `close_range` where Linux's libc has it, else left (one `/dev/urandom` a restart).
2. OpenTUI's `destroy` finishes later during a frame, and its native teardown follows its `destroy` event
   (`node_modules/@opentui/core`, `destroy`, `finalizeDestroy`): taken — the hand-over waits for the event and a turn.
3. "Nothing changed" was too strong for a cancelled or killed upgrade: taken — its commit is `current` moving; a version
   folder in place before it is left, complete, for the next upgrade.
4. An old window's upgrade could move `current` back, and prune what it replaced: taken — compared, under the lock, with
   what `current` names; kept, the one `current` named; the channel's own newest taken from `versions/`, not any.
5. `--base` again after going into another vault measures the wrong repository, or stops the start: taken — not applied
   again; `baseAtOpen` already keeps it for its branch.
6. `session.json` is shared by the windows on a vault and its write swallows errors: taken — the note carries this
   window's session and is read back before quitting; the restart restores the note's.
7. Quiet missed the panels' filters and the git message, and keys waiting their turn: taken — one test over the input's
   state; keys dropped by when they arrived.
8. The config's path is `userConfigFile`'s (`XDG_CONFIG_HOME`), and `atomicWrite` over a link replaces the link:
   taken — the link's target edited, the link kept, a file changed meanwhile left alone; moot since the checkbox
   was dropped (UPG-D1).
9. An offer waiting when the check's turned off: taken — dropped; your config and `DO_NOT_TRACK` read again before it
   opens.
10. A hand-put slipbox upgraded by moving a link isn't seen by watching the resolved file; a Homebrew keg's name may
    carry a revision: taken — the path it was started by is watched and restarted into; versions asked of binaries.
11. A newer "version" that runs the old build proves nothing: taken — two real builds, the second's `version.ts` newer;
    the harness given a binary to start.
12. The in-process hand-over differs from the issue's "update script": the maintainer's to decide — open question 2,
    agreed (UPG-D2).

A second round (2026-10-24) found 1, 2, 4–6 and 8–11 settled, and three things more, all taken: `upgrade` runs `tar` and
the new binary's `--version` synchronously, so a cancel isn't seen until it has committed — they become awaited
children, with a last look for a cancel before `current` moves; `lastInputAt` is one time, overwritten by each key —
each key carries its own; and a background upgrade outliving the TUI needs to be unreferenced and to write its answer
to a file, not a pipe. Whether it should outlive the TUI at all was open question 7 (UPG-D7).

## The maintainer's answers (2026-10-24)

The open questions, asked one at a time, each with what was proposed and the other ways:

1. **The TUI writing your config for Keep checking daily.** The maintainer asked why the checkbox was needed at all:
   Not now and Skip this version put the offer off, and the config already turns the check off for good. Dropped; the
   TUI still never writes your config, and no root decision is needed (UPG-D1). A settings screen was asked about:
   `space u u` lists the UI settings, kept as the session's overrides, never written to the config; the update check
   isn't one of them, and stays your config's.
2. **The hand-over.** slipbox upgrading in the foreground with its own code, then `execve`, as proposed (UPG-D2).
3. **Saving on restart.** Not saved without asking, as proposed: a restart with notes unsaved asks first, Save and
   restart or Cancel (UPG-D3).
4. **Where a restart comes back.** Where you were, as proposed (UPG-D4).
5. **The restart offer with the check off.** Offered anyway, as proposed (UPG-D5).
6. **`:upgrade`.** Wanted, not as proposed: it asks now and offers what it finds, a skipped version too (UPG-D6).
7. **Quitting during Upgrade, restart later.** Left to finish, as proposed (UPG-D7).

design.md, requirements.md and ideas.md were changed to match: the checkbox, its config editor (`core/config-edit.ts`)
and the change to tui.md § UI settings gone; the restart's question added to § Restarting and the dialog; `:upgrade`
added to § The update offer.

## Taken as recommended while the maintainer was away (2026-10-24)

The maintainer was away from the morning of 2026-10-24's work on, and asked for the recommended option wherever a
question would have gone to them, recorded where its answer would go. The design itself was approved before that, with
the seven answers above; nothing since has needed a question.

## The review (2026-10-24)

Codex's part was skipped: asked to review `git diff origin/dev...` (`tmp/issue/codex-review-1.md`), it had hit its
usage limit and stopped at a menu. A fresh Claude reviewer did its part from the same request, then `/code-review`
reviewed the branch.

### Round 1's findings

Two lists, `/code-review`'s fourteen and the fresh reviewer's ten, merged into sixteen; each checked against the code.
All are taken, each fixed with a test where it's behaviour:

1. **A dialog answered by typing.** `:upgrade` opens its offer after a network wait, and `:restart` its question after
   waiting for a background upgrade, with no quiet and no drop, over whatever is open: keys typed meanwhile answer them
   (both reviewers). The restart's question opens inside the key or click that chose the restart, so a second `enter`
   or a double click answers it unread. Verified by reading `Updates.check`, `restart`, `dialog.ts`'s `tooEarly`.
2. **`quiet()` ignores vim's pending operator, count and awaited character** (`vim.ts`'s `idle()` reads them): `d`, a
   pause, the offer, `esc`, then `j` deletes two lines.
3. **One `waiting` slot:** a restart offer underneath overwrites the daily offer, and the other way round (one then
   never shown again); `:upgrade` leaves a waiting offer to open again; its restart offer isn't counted as offered.
4. **Taking over a stale lock races** (both reviewers): read, judged stale, removed, then made — a second taker can
   remove the first one's new lock.
5. **`ctrl+c` doesn't reach the release lookup** (both reviewers), and the terminal's SIGINT reaches `tar` and the new
   binary's `--version` too, which can end them before the cancel is seen: said as their failure, not `cancelled`.
6. **An installer's install running an older version on purpose** (the one kept, to go back to) is offered `current`'s
   restart at every start: nothing tells what was there at start from a change.
7. **Upgrade, restart later runs this binary,** which another window's upgrade may have removed.
8. **`versionOf` waits for the output's end after a clean exit:** a binary leaving a child holding it waits for ever,
   and no upgrade underneath is noticed again.
9. **Keys typed during the hand-over** reach the restarted slipbox as commands.
10. **Children not reaped before `execve`** (language servers sent TERM a moment before) stay as zombies of the new one.
11. **Skip this version can't be ticked with the mouse:** dimmed unless Not now is marked, and clicking Not now does it.
12. **The half-second drop counts from when the dialog is set,** not drawn: a slow frame shortens it.
13. **`src/cli/install.ts` runs no terminal check,** though the TUI now runs `slipbox upgrade --json`.
14. **Copies:** the version pattern and Homebrew's layout written three times; `installation()` read every ten seconds
    where `current` alone is needed; the one-second timer running from source.
15. **`privacy.md`:** the new bullets split "To turn it off" from its paragraph.
16. **Lines past 120 columns** in the workstream's files (markdownlint passes them: nothing past the column is a space).

Each fixed, with a test that fails without it (mutation-checked, fourteen in the unit tests): every dialog drops
what comes before it's first drawn and in the half second after (`drawnAt`; the question after Upgrade and restart's
`enter` or a double click); `quiet` holds for vim's pending too (`calm`); a queue in place of the slot, each shown once,
`:upgrade`'s restart offer counted; what a command's answer opens after a wait (`whenAnswered`) opens at once only when
nothing was typed since, else once quiet; the installer's `current` at start is no upgrade underneath (`startedWith`);
Upgrade, restart later runs `current`'s binary when this one is gone; the stale lock moved aside, removed only if it's
still the one read (`takeOver`); the cancel given to the releases' lookup, `tar` and `--version` in a session of their
own; `versionOf` reads a second at most after the exit; children waited for and reaped before the next starts
(`childrenEnded`); what was typed meanwhile flushed (`flushInput`, by `tcflush`). A ticked Skip marks Not now, by key or
click. `install.ts` reaches the `updates` checks; `privacy.md`'s bullets mended; three lines over 120 rewrapped; the
version pattern, Homebrew's layout and `current`'s link read in one place each (`isVersion`, `homebrewPrefix`,
`currentVersion`), the timer started for a release build alone.

A new terminal check types `:qa` while the hand-over downloads: the new slipbox goes on. It failed at first for the
check's own reason — `s.keys("enter")` waits for a frame, and none came until the new slipbox drew, so the keys went
in after the hand-over; traced, then sent raw. It fails without the flush. Tests: `tests/tui-updates.test.ts` and
`tests/upgrade-restart.test.ts` 51 pass; `bun run test:terminal updates` 9/10 before that check's fix, then it alone
1/1.


### Round 2 (2026-10-24, after the rebase on `origin/dev` and the draft PR, #63)

Codex's part skipped again: its pane still stopped at its usage limit's menu. A fresh Claude reviewer did its part on
`git diff origin/dev...` beside `/code-review`, each without the other's findings.

`/code-review` found fifteen, the fresh reviewer three, one of them the same (`childrenEnded`'s kill): seventeen,
each checked against the code. Fixed, each with a test that fails without it (twelve mutations, all caught):

1. **A restart killed children quitting leaves running** (both reviewers): an editor handed a note (`runDetached`), a git
   commit, pull or checkout running in the background. `childrenEnded` waits for them a second, and kills none.
2. **`execve` skipped the process's exit hooks:** an export's spool copies and temp files stayed. They run first now.
3. **A leftover that couldn't be removed left the lock held** (and after `execve`, by a pid still alive).
4. **`tar` and `--version` in a session of their own on every path,** round 1's change: `slipbox upgrade` from the
   command line, `ctrl+c`'d, left them running. Only with a cancel to end them now.
5. **A restart waiting for quiet went straight to its question,** never looking again for an upgrade started meanwhile.
6. **This window's own upgrade was judged by the version offered;** a newer one out by then was offered underneath.
7. **The queue kept the first asking's way:** `:upgrade`'s answer, where the daily check's offer of the same version
   waited, was dropped with the check off.
8. **`:upgrade`, or a waiting `:restart`, asked twice** queued a second dialog.
9. **The dialog ran off a short screen.**
10. **"X is kept, to go back to" named the version running,** not the one `current` named (`replaced`, in `--json` too).
11. **The note's session wasn't read as the session file is** (`sessionFrom`): a later version's shape could have thrown
    after the screen was taken.
12. **`:upgrade`'s command line said `slipbox upgrade`,** which installs: `slipbox upgrade --check`.
13. **The design had `:wqa`'s order wrong** (each note, then the properties): the design fixed.
14. **The `versionOf` test claimed more than it checked:** it says now that the version is given up, and checks so.

Logged, not fixed here (the review loop stops after this round):

- **The offer marks Upgrade and restart:** an `enter` meant for a note, pressed more than half a second after the
  offer shows, upgrades and restarts (both reviewers). Which choice is marked is the maintainer's to say; Not now marked
  would make a stray `enter` harmless. A question for the maintainer.
- **A second note write that fails** after the hand-over's upgrade leaves the first note to be read: the next slipbox
  says `restarted` though the upgrade failed (the failure said on the main screen, under the new one's).
- **Copies left:** `alive()` beside `export/spool.ts`'s; `startedPath` beside `Bun.which` (which reads an empty `PATH`
  entry as the folder, as POSIX does); libc opened again in `execInto`, `errno` and `flushInput`. Fixed after all, at
  the maintainer's word (2026-10-24): one `alive()` in `core/processes.ts` for `stale.ts`, `export/spool.ts` and
  `update.ts` (there were three); `startedPath` by `Bun.which`; libc opened once a process in `core/libc.ts`, for the
  crash reports' switch and the restart alike. The tests that read them pass: the two UPG files (63), the crash
  reports', `stale.ts`'s and the spool's; `bun run test:terminal updates` 10/10.

Tests after the round: `tests/tui-updates.test.ts` 42 and `tests/upgrade-restart.test.ts` 21 pass;
`bun run test:terminal updates` 10/10.
