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
   taken — the link's target edited, the link kept, a file changed meanwhile left alone.
9. An offer waiting when the check's turned off: taken — dropped; your config and `DO_NOT_TRACK` read again before it
   opens.
10. A hand-put slipbox upgraded by moving a link isn't seen by watching the resolved file; a Homebrew keg's name may
    carry a revision: taken — the path it was started by is watched and restarted into; versions asked of binaries.
11. A newer "version" that runs the old build proves nothing: taken — two real builds, the second's `version.ts` newer;
    the harness given a binary to start.
12. The in-process hand-over differs from the issue's "update script": the maintainer's to decide — open question 2.

A second round (2026-10-24) found 1, 2, 4–6 and 8–11 settled, and three things more, all taken: `upgrade` runs `tar` and
the new binary's `--version` synchronously, so a cancel isn't seen until it has committed — they become awaited
children, with a last look for a cancel before `current` moves; `lastInputAt` is one time, overwritten by each key — each
key carries its own; and a background upgrade outliving the TUI needs to be unreferenced and to write its answer to a
file, not a pipe. Whether it should outlive the TUI at all is open question 7.

## Open questions

For the maintainer, each with what's proposed:

1. **The TUI writing your config (`D?1`).** The root's design says the TUI never writes your config; the issue asks for
   Keep checking daily to write `[update] check` there. Proposed: one exception, `check = false` written on your word,
   one line edited and the rest of the file kept (design.md § The update offer). Agree?
2. **The hand-over.** The issue decided "quitting into an update script that restarts slipbox", and left how it takes
   the terminal to settle. Proposed: no script file — slipbox itself, its screen given back, upgrades in the foreground
   (`slipbox upgrade`'s own function) and replaces itself with the new version (`execve`), one process to the shell
   throughout; the new one started and waited for only where that can't be (native Windows). Not a launcher (ideas.md
   § How the hand-over takes the terminal). Is the update done by slipbox's own code, not a script, all right?
3. **Saving on restart.** `:q` refuses while notes are unsaved; proposed, a restart saves them as `:wqa` does, the
   choice's explanation saying so, and a note that can't be saved stops it.
4. **Where a restart comes back.** Proposed: where you were, the vault you'd gone into in place of the arguments'
   path; or strictly the arguments, back where slipbox started?
5. **The restart offer with the check off.** It reads only this machine's files: proposed, offered whatever
   `[update] check` and `DO_NOT_TRACK` say. Or only with the check on?
6. **`:upgrade` to be offered again after Not now** (ideas.md § Asking again): not proposed; say if wanted.
7. **Quitting during Upgrade, restart later.** Proposed: the upgrade finishes on its own, and the next start runs it.
   Or stopped with the TUI, as shell jobs are (nothing installed, asked again at the next check)?
