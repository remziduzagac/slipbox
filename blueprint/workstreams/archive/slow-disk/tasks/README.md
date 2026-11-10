# Tasks: a slow disk never freezes the screen

The workstream's work, one file per task, its ID in its H1; finished ones move to `archive/`. The design was agreed on
2026-11-09; SD-T1 to SD-T11 are done. In SD-D1's order, most felt first:
SD-T1, then SD-T2; then SD-T3, SD-T4 and SD-T5, in any order; then SD-T6, SD-T7, SD-T8 and SD-T9, in any order; SD-T10
once SD-T5 and SD-T8 are in; SD-T11 last of the code; SD-T12 at the end. Each task's `blocked_by` says the same. Each is
a pull request of its own into `dev`, with its unit tests, its terminal check, its design text and, where you'd notice,
the user docs and a CHANGELOG line; before it merges, the terminal checks it reaches run locally, listed for approval
first (SD-D14).

- [SD-T1](archive/seam.md): every read the workstream moves through one seam the stand-in and the hold reach. Done.
- [SD-T2](archive/disk-threads.md): the listing threads become the disk threads: stat, read, access, walk. Done.
- [SD-T3](archive/watcher-look.md): the watcher's look every two seconds, and its settle by stat, on the disk threads.
  Done.
- [SD-T4](archive/tui-look.md): the TUI's look every second — open files, the config, git — what's drawn of git, and
  the activity file. Done.
- [SD-T5](archive/opening-a-note.md): a note opened reads on a disk thread; the key waits, `esc` gives it up. Done.
- [SD-T6](archive/note-text.md): a changed note's text, and the background parse's, read on the disk threads. Done.
- [SD-T7](archive/explorer-tree.md): the explorer's own tree of the vault open listed and marked off the screen's
  thread. Done.
- [SD-T8](archive/rebuilds.md): the vault open built again from a walk and an index read on a disk thread. Done.
- [SD-T9](archive/own-folders.md): slipbox's own state, cache and config folders read off the screen's thread.
  Done.
- [SD-T10](archive/start.md): the start takes the screen first, then reads the vault. Done.
- [SD-T11](archive/drawing.md): what drawing reads — a note's links and pictures, the scratch's places — and the
  Problems panel's notes. Done.
- [SD-T12](docs.md): the user docs, the design consolidated, the workstream closed.
