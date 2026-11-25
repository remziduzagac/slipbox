# Notes

## How it came up

On 2026-11-25 the maintainer, trying dev, found that a file outside the vault didn't open. Read in the code, it opens
by going into the file's vault, and asks first (D270): Go, Peek (read-only) or Stay, and Stay or `esc` opens nothing.
`:e ../x.md`, a relative path out of the vault, is refused (`no note or file "../x.md"`): only a whole path or `~/`
counts as outside (`tui/actions/workspace/actions-files.ts`). A link to such a file peeks, read-only; started with
`--root`, a file outside it is refused. Nothing in the decisions refused reading such a file; the one hard limit was
writing (D142, VV-D6).

The [research](../../research/outside-files.md) compared how editors open a file outside the project open. The
maintainer's reading of it: open the file, as the editors do; slipbox has no windows, so going into the file's vault,
its nearest thing to a new window, can be offered rather than asked first. Then the items were settled one at a time,
each with a recommendation and its alternatives; decisions.md records both.

## What was settled, in order

1. Open at once, no question first: the maintainer's own proposal (OUT-D1).
2. Editable or read-only: editable when you named or picked it, a link's read-only (OUT-D2). The reasons against
   editing were laid out first: VV-D7's "a peek that could edit would be a half-switch", and VV-D6's link that a pull
   changes leading a save to `~/.bashrc`. The first is met by the tab naming its vault and the vault's features
   leaving it out; the second by writing only what the person chose, never what a link reached.
3. Which ways: whatever you pick yourself opens here; links peek (OUT-D3).
4. Going in: a command on `space v g`, a click on the tab's vault mark, a line saying so, still asked (OUT-D4). A
   peek's `o` couldn't carry over: in an editable tab it starts a new line.
5. What the tab gets and loses (OUT-D5).
6. Restarts (OUT-D6), once it was checked that the workspace is kept in slipbox's state, not in the vault
   (`stateDir`, `core/foundation/platform/paths.ts`), so a pull can't change it; and a relative `:e` path (OUT-D7).

## The decisions it reopens

Raised with the maintainer while the items were settled, each with the reasons recorded:

- **VV-D4:** choosing a file or folder of another vault went into it, one rule for "where am I". A vault chosen still
  goes into it; a file opens here, its vault named on its tab (OUT-D1, OUT-D3).
- **VV-D7:** the peek stays read-only, and links keep it; its reason, that an editable tab of another vault's file
  would be a half-switch, gives way for a file you named (OUT-D2).
- **D142, as VV-D6 amended it, and constraint `7.5`:** nothing written outside a vault. One write is allowed: the file
  named or picked, alone (OUT-D2).
- **D270:** every way into another vault asked first. Every switch still asks; `:e`, the explorer and the switcher's
  path no longer switch for a file (OUT-D3, OUT-D4).

Found while drafting the workstream, then raised with the maintainer and settled the same day:

- **VV-D3:** it retired "the plain folder and the loose file (D58, D76)", the loose file being a file outside every
  root opened beside the current root's notes, editable; the vaults workstream found the three ideas (a root, a plain
  folder, a loose file) confusing together ([its notes](../archive/vaults-and-view/notes.md) § How it came up). OUT
  brings that file back, for a file named or picked, as no new kind of place and with no new name: it stays its own
  vault's (VV-D4) and its tab always names that vault (OUT-D8). The word stays out of what users read
  (`tests/docs.test.ts`).

## Points the decisions leave to the design

- The question on `space v g` offers Go and Stay, no Peek: the file is open here already.
- The line said on opening names the key once, as info.

Found while drafting the design, then raised with the maintainer and settled on 2026-11-25:

- The git panel's Open and the command line, both in OUT-D3's first draft as routes here, turned out to open no file
  alone outside the vault. The git panel's Open stays a switch, asked, like the vault list: it picks a worktree, which
  is a vault; opening the note's copy in the worktree here was the alternative. The command line opens the file here
  with a `--root` it is outside, where it was refused; without `--root`, the file's own vault opens, as before.
  OUT-D3 says both.
- The CLI's write commands keep refusing a path outside the vault: OUT is the TUI's.
- The real path is recorded when the file is chosen, and a save is refused if it changed since.
- A peek's kept read-only tab becomes editable once the file is named with `:e`.
- A named path through a symlink asks, as today.
- No git marks in the gutter for a chosen file from another repository.

## Checked against the code

A review of the design against the code on dev, the same day, found statements the code doesn't bear out. Each was
read in the code and fixed in the design; where a fix needed a choice, the recommended option was taken, as the
maintainer asked for this workstream's further questions, and a decision records the ones someone could have made
otherwise.

- The write guard: the design had it where the code doesn't hold it. The read-only guard moves into the write path,
  where every save passes, and a chosen file is written as its own place writes its files, so VV-D6 and D220 hold for
  it there (design.md § Chosen, so editable). The read-only guard landed first, on 2026-11-26, as a fix: a forced save
  wrote a read-only tab. With it, git's edits that save at once (the review's `x`, a change discarded, the merge
  screen's `w`) refuse a read-only file before putting anything in it.
- `intoOther` sits in the shared ways of opening, which links reach too: the chosen routes get a way of their own, and
  nothing shared marks a buffer chosen. `ctrl+click` stays a switch, asked (OUT-D9).
- A buffer of another place skips the lock and the "just looking" marks, and its way wasn't checked in its own place's
  terms: a chosen one takes all three.
- "Follow it" is kept for the link and where it leads, not for one file; what a yes allows is the file's own place's.
- The tab named a vault only for a file in its index, never Elsewhere's: every such tab is named now.
- `t` on a file already open by name reaches the named buffer: it stays chosen (OUT-D11).
- Link completion read the current vault's notes: it reads the file's own place (OUT-D10).
- A file of home's opened here didn't ask for its folder's walk: it does, as every way into home's folders does.
- `space v g`'s Go and Stay needed the switch told the file is open here, or Peek is offered.
- With `--root`, "a vault that doesn't hold it" read wrong for a nested vault's file: the change is for a file outside
  `--root`'s folder, and a nested vault's file opens in its own vault, as now.
- `7.5`'s exception named no interface: it is the TUI's, the CLI's commands never writing outside the vault.
- VV-D6 and D220 get consolidation notes too.
