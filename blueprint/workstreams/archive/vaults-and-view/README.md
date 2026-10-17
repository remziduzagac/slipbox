---
status: consolidated
created: "2026-10-14"
---

# VV: Vaults and the explorer's view

> Consolidated into its parent on 2026-10-17; its docs task is still open.

What slipbox calls the folders it works in, and what the explorer shows of them. Today a "root", a "plain folder" and
a "loose file" are three ideas, other roots appear in the explorer in three places, and opening a folder inside a root
shows the root instead. The user found the explorer's roots confusing while looking at the git panel (GIT, paused for
this), and worked the model out in conversation on 2026-10-14: vaults, home among them, a no-vault for the rest of the
file system, and the explorer as one view of the whole tree, zoomed.

Accepted by the user on 2026-10-15, as a whole; GIT (`../git-review/`) is rebased on it and follows it.

- [requirements.md](requirements.md): its goals, acceptance criteria and its changes to the root's requirements.
- [design.md](design.md): its changes to the root's design.
- [decisions.md](decisions.md): what was settled, and why.
- [notes.md](notes.md): how it was talked through, the drawings, and what's left for the user to confirm.
- [tasks/](tasks/README.md): the work, a task per file.

## Outcome

Built as settled, in pull requests merged 2026-10-15 to 2026-10-17: the words (VV-T1, #81), the explorer as one tree
and its view (VV-T4, #86), the peek (VV-T7, #88), home (VV-T2, #89), a row's marks and the busy folders listed
(VV-T5, #95), Elsewhere and links followed only when allowed (VV-T3, VV-T6, #93), and the git panel following the
vault with GIT's panel (VV-T8, #97); the big files were split between them (D235). Consolidated on 2026-10-17: the root's
requirements (§ Vaults and links, § Navigating and search, § Git, `7.5`), design/roots.md rewritten in vaults' terms,
design/tui.md (§ Going into a vault, § The peek, § Side panes), trust.md, terms.md, how-it-works.md, testing.md and
"root" read as vault in every design file; notes under the root decisions it changed (D40, D50, D51, D58, D61, D64,
D65, D69, D76, D77, D79, D80, D142, D218, D220). Where the code came out otherwise than the design here, the root says
what the code does, the gap in a "Not done" note: Windows' drives (with `14.14`–`14.17`), a peek's first open and its
backlinks, un-following a link, the busy folders' names in a notes vault, the panel asking again on the terminal's
focus. VV-T9's docs and screenshots are written apart, after this; its task stays open until they land.
