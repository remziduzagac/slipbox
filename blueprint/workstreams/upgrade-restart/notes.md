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
children, with a last look for a cancel before `current` moves; `lastInputAt` is one time, overwritten by each key — each
key carries its own; and a background upgrade outliving the TUI needs to be unreferenced and to write its answer to a
file, not a pipe. Whether it should outlive the TUI at all was open question 7 (UPG-D7).

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
