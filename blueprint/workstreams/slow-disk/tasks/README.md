# Tasks: a slow disk never freezes the screen

The workstream's work, one file per task, its ID in its H1; finished ones move to `archive/`. The design was agreed
on 2026-11-09, and none has started. In order (SD-D1), most felt first: SD-T1 and SD-T2 first; then SD-T3, SD-T4 and
SD-T5, each on its own; SD-T6, SD-T7 and SD-T8 after SD-T2, any order; SD-T9 after SD-T4; SD-T10 after SD-T5 and
SD-T8; SD-T11 after SD-T6, last of the code; SD-T12 at the end. Each is a pull request of its own into `dev`, with
its unit tests, its terminal check, its design text and, where you'd notice, the user docs and a CHANGELOG line.

- [SD-T1](seam.md): every read the workstream moves through one seam the stand-in and the hold reach.
- [SD-T2](disk-threads.md): the listing threads become the disk threads: stat, read, access, walk.
- [SD-T3](watcher-look.md): the watcher's look every two seconds, and its settle by stat, on the disk threads.
- [SD-T4](tui-look.md): the TUI's look every second — open files, the config, git's `HEAD` — and the activity file.
- [SD-T5](opening-a-note.md): a note opened reads on a disk thread; the key waits, `esc` gives it up.
- [SD-T6](note-text.md): a changed note's text, and the background parse's, read on the disk threads.
- [SD-T7](explorer-tree.md): the explorer's own tree of the vault open listed and marked off the screen's thread.
- [SD-T8](rebuilds.md): the vault open built again from a walk and an index read on a disk thread.
- [SD-T9](own-folders.md): slipbox's own state, cache and config folders read off the screen's thread.
- [SD-T10](start.md): the start takes the screen first, then reads the vault.
- [SD-T11](drawing.md): what drawing a note reads — links' targets, pictures — and the Problems panel's notes.
- [SD-T12](docs.md): the user docs, the design consolidated, the workstream closed.
