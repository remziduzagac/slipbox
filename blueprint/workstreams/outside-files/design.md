# Design changes

Each change names the root's design section it lands in at consolidation; they're grouped by that section, the
decisions cited in each. A task writes its text here as it does the work; the root's files change only when OUT is
consolidated (OUT-T5), with the maintainer's approval. Five root decisions change in part, and each gets a dated note
under it then: VV-D3 (OUT-D8), VV-D4, VV-D7, D142 (as VV-D6 amended it) and D270 (notes.md). VV-D6 and D220 get notes
too: what a yes allows gains the one write out of a vault, which is written as the file's own vault writes it, so
what they keep from being written stays so (OUT-D2). Command ids and keys are the design; file, type and field names
and the messages' wording are proposals, the tasks' to settle. Nothing is left **Open**: the points the decisions left
to the design were settled with the maintainer on 2026-11-25; those a check of the design against the code found took
the recommended option, as the maintainer asked for this workstream's further questions (notes.md). A link in the
text points from here to the root's file; consolidation writes it relative to design/.

## ADDED design/tui.md § A file from outside the vault

After § Going into a vault.

**Opened here** (OUT-D1, OUT-D3). A file outside the vault open — another vault's, home's, Elsewhere's — opened by
name or picked opens as a tab of the current workspace, at once: `:e` with a path or a pointer (`file.open`), its path
typed in the switcher (`space f e`, `file.open_path`), `enter` or `o` on a file outside the vault open's own tree in
the explorer, and the command line with a `--root` it is outside (below). No question, nothing switched, the
tabs as they were: the buffer is the path-keyed one a peek's `t` makes (`buffer`, beside the vault; `markElsewhere`
in `tui/documents/buffers/opening.ts`), its `elsewhere` holding its vault's name, graph and path, so its links are
read there. The shared ways of opening (`Opening.open`, `openInNewTab`, `openOrSwitchTab` in
`tui/documents/navigation/opening.ts`) keep calling `intoOther` (`tui/workspace/vaults/vaults.ts`), so any other
caller that reaches a file outside the vault still switches, asked, as today; the routes named open through a way of
their own (`openChosen`, a proposal) that skips it and marks the buffer chosen. Nothing shared marks a buffer chosen,
so no link can. A link is none of these routes: followed, it peeks (§ The peek), and `ctrl+click` (`link.go`) still
goes into the file's vault, asked (OUT-D9). A vault chosen still goes there (§ Going into a vault). A file the path
names inside the vault opens as before. A relative `:e` path is read from the vault's top, as `:e notes/a.md` is,
one that leaves the vault (`:e ../x.md`) opened as any path outside it (OUT-D7; today `no note or file "../x.md"`).

Its way is checked as its own place checks it (VV-D6): a link that place hasn't followed, on the way to the file, is
asked about before anything is read through it, as the explorer's folders outside the vault are (`Following.gate`'s
`there`, `tui/documents/navigation/following.ts`); the opening asks for that place's links on the way, as a peek's
read does (`peekAsk`, `tui/documents/navigation/peek/paths.ts`), not this vault's alone. A file of home's opened from
a vault asks for its folder in home's graph, the one its tab reads (`elsewhere.graph`; `Graph.askFolders`), as every
way into a folder of home does (roots.md § Home), so its links and backlinks are read from home's walk of that folder.

**Chosen, so editable** (OUT-D2). The buffer opened so is marked chosen (`chosen`, a proposal) by those routes alone:
a link, `ctrl+click`, a backlink, a search hit and a peek's `t` never set it. The guard is held in the write path,
where every save passes (`App.writeBuffer`, `tui/documents/saving/write-buffer.ts`): `:w` and `:w!`, autosave, a task
ticked, a save asked for on quitting or on a switch. There:

- **A read-only buffer is refused, whatever the save.** The read-only guard moves into the write path itself
  (`readOnly`: a peek's tab, a file you may not write, a file read through a link you're only looking at).
- **A buffer of another place** (`elsewhere`) is written only when it is chosen; one not chosen is refused there.
- **A chosen buffer is written where it is, as its own place writes its files**: its root and its links' rules taken
  from its own location (`locateVault`), not the current vault's. In a vault, never through a symlink out of that
  vault (D220); in home, through a link followed there (VV-D6); in Elsewhere, what the file system allows. So
  `writeNote`'s refusal (`… resolves outside the vault (…) — not writing there`, `core/foundation/platform/fsutil.ts`)
  stands for it, measured from its own vault.

Saved as a note of the vault is: atomically, its permissions kept, the watcher told, a change on disk since asking as
the conflict prompt does. Never written out, as before: a virtual buffer, a window read through a link not followed
(VV-D6), a peek's tab (`t`, read-only), a note of the vault whose target a symlink takes out of it (D220), a plan's file
(`mayRewrite`).

- **The real path** is recorded when the file is chosen; a save whose real path differs by then (a link put on its way
  since) is refused, said. That keeps OUT-D2's guard for a file whose way a pull can change.
- **A file you may not write** opens read-only, said, as any file does (`lockedSaid`); and a file read through a link
  you're only looking at is read-only, never written (`throughLink`). A chosen buffer takes both, which a buffer of
  another place skips today (`took` in `tui/documents/buffers/opening.ts`).
- **A file open both ways** (OUT-D11). A peek's read-only tab (`t`) of a file then named with `:e` is made chosen
  and editable, its way and its permissions checked then as any chosen file's are: naming it is the choice. The other
  order: a file open here by name, then kept from a peek with `t`, is the same buffer (path-keyed; `peekKeep` in
  `tui/documents/navigation/peek/history.ts`), so `t` goes to its tab, still chosen and editable: it was named, the
  link changes nothing of it, and the real path guards its saves.
- **A named path whose way passes a symlink** is asked about in its own place's terms (Follow it, Just look, No;
  `following.ts`), the answer kept as VV-D6 keeps it, for the link and where it leads. What a yes allows is that
  place's (roots.md § Links followed only when you say so): in home, the write through it; in a vault, reading and
  the index, never a write out of that vault (D220); in Elsewhere, what the file system allows. Just look reads it
  read-only, never written.
- **Link completion** in a chosen file of another place offers what it would offer in that place itself, from its
  own graph (`elsewhere.graph`) and in its link convention, never the current vault's notes, whose links would be
  wrong there (OUT-D10; today `linkItems` in `tui/documents/editing/completion/items.ts` reads the current vault's).

**The tab** (OUT-D5, OUT-D8). Marked with its vault's name before the file's, every one, Elsewhere's too:
`kestrel: architecture.md`, `Elsewhere: hosts`. Today the mark is drawn only for a file with a path in its vault's
index (`elsewhere.rel`; `tui/windows/drawing/tabs.ts`), so a tab of Elsewhere's file, a kept one's too, shows `hosts`
alone; the mark becomes its place's name and the file's name, whatever the index holds. The top bar keeps the current
vault. The file is all slipbox makes of any file: rendered, every editing key, the lens and SOURCE view. It is polled
while open, as every file the watcher doesn't see (`Watch.poll`; § External changes). Its links are read in its vault
and open a peek (§ The peek); one into the current vault opens here, as a peek's does. Left out of everything that
reads this vault whole: its search, backlinks, index, task list, the renames that fix links and their plans, the git
panel. Making, moving or renaming files outside the vault stays refused, from its tab as from the explorer's rows
outside the vault's tree.

- **No git marks in the gutter** for a chosen file in another repository, as Elsewhere's files have none: git's view,
  the panel and the gutter, is this vault's.

**Its vault, a command away** (OUT-D4). Opening such a file says, once (info): `kestrel's, opened here — space v g
goes into kestrel` (`Elsewhere's, opened here — space v g goes into Elsewhere`). "Go into this file's vault"
(`vault.into_file`, `cli: null`, in `core/application/commands/areas/files.ts` beside `vault.open`) is bound to
`space v g`, is in the palette, and runs on a click on the tab's vault mark. It goes into the file's vault with the
file open at its place (`switchVault`), asked first as every switch is (D270): `Go into kestrel? Your tabs there
replace these`, Go and Stay; no Peek, the file being open here already. `switchVault` offers Peek whenever the switch
opens a file and doesn't come from a peek, so the command says the file is open here (a `SwitchHow` flag, `here`, a
proposal) and the question leaves Peek out. Unsaved notes ask their question instead. On a tab a peek kept (`t`) it
does the same, beside that tab's `o`. On a note of the vault's own it says so: `this note is this vault's`.

**Back after a restart** (OUT-D6). The tab is one of the workspace's: kept in its `session.json`, in slipbox's state
(`stateDir`, under `XDG_STATE_HOME`, never in the vault), with `chosen`, and brought back with the others, editable,
its vault named; a tab a peek kept comes back read-only, as today. A pull can change neither which file comes back
nor that it's writable. Its real path, recorded when it was chosen, is kept with it: one whose real path changed while
slipbox was closed comes back, and its save is refused, said. A file of home's among them asks for its folder in
home's graph before it opens, as a tab of home brought back does (roots.md § Home).

**From the command line** (OUT-D3). Started with a file outside the folder of the vault `--root` names, home among
them (`slipbox --root ~/notes ~/work/kestrel/docs/architecture.md`; `slipbox --root ~ /etc/hosts`), slipbox opens
that vault as `--root` alone opens it, and the file as a tab of it, chosen, editable, marked with its own vault, as
`:e` from inside opens it. Today that is refused before the screen is taken (`… is outside --root …`: `locateVault`
in `core/workspace/vaults/vault.ts`, through `openingPath` in `tui/shell/terminal/open-path.ts`). A file inside that
folder whose own vault is nested there opens in its own vault, as now, a vault nested in `--root` staying one (D80;
`locateVault`): `slipbox --root ~ ~/work/kestrel/docs/architecture.md` opens kestrel. Without `--root`, slipbox opens
in the file's own vault, as now. A file that isn't there, outside `--root`, is still refused, since nothing is made
outside the vault (OUT-D5).

**The git panel's Open stays a switch** (OUT-D3). Its `o` on a repository, a checkout or a branch's worktree picks a
vault, a worktree being one, and goes into it with the note open here opened there (`goInto`,
`tui/workspace/git/views/branches/gitbranchview.ts`; `:worktrees`), asked as `space v v` is (§ Going into a vault).
It opens no file alone, so nothing here changes it.

**The CLI's commands are unchanged.** `write`, `replace`, `task`, `mv` and the rest refuse a path outside the vault
(`checkWritable` in `src/cli/common.ts`: `<path>: outside the vault (<root>); not writing it`, exit 5), and a path
outside `--root` is refused as before (`locateVault`): OUT is the TUI's, and an agent's writes stay in its vault.

## MODIFIED design/tui.md § Going into a vault (plans `17.10`, `17.14`, `21.10`)

Its first paragraph's third sentence, through "(revealed in its own vault, D81).", becomes:

**Choosing another vault asks to go into it** (VV-D4, D270; `switchVault` in `tui/workspace/vaults/vaults.ts`):
`enter` or a double-click on another vault's row in the explorer, `o` in a peek (§ The peek), `ctrl+click` on a link
out of the vault (`link.go`, OUT-D9), `space v g` on a tab of a file outside the vault (§ A file from outside the
vault), the git panel's `o` on a repository, a checkout or a branch's worktree (Open; a vault picked, OUT-D3), a named
folder picked from `space v v` or from the top bar's vault, clicked (WSP-D4), a folder link that leads out of the
vault (revealed in its own vault, D81). A file of another vault opened by name or picked — from the explorer, with
`:e` (a path, a pointer), by its path (`space f e`, the switcher's) or on the command line with a `--root` it is
outside — opens here instead, nothing switched (OUT-D1, OUT-D3; § A file from outside the vault).

Previously: "**Choosing a file or folder of another vault asks to go into it** (VV-D4, D270; `switchVault` in
`tui/workspace/vaults/vaults.ts`): `enter` or a double-click on another vault's row in the explorer, a file of another
vault opened from the explorer or with `:e` (a path, a pointer; `intoOther`) or by its path (`space f e`, the
switcher's), `o` in a peek (§ The peek), the git panel's `o` on a repository, a checkout or a branch's worktree
(Open), a named folder picked from `space v v` or from the top bar's vault, clicked (WSP-D4), a folder link that leads
out of the vault (revealed in its own vault, D81)."

In **Every way in asks first**, "and, going to a file not from a peek, Peek at it" becomes "and, going to a file not
from a peek nor open here already (`space v g`, `SwitchHow`'s `here`; § A file from outside the vault), Peek at it".

Previously: "and, going to a file not from a peek, Peek at it (`vault.switch_peek`, `p`)".

## MODIFIED design/tui.md § The peek

Its first paragraph's sentence on `:e` becomes: "`:e` with a path or a pointer and the explorer open the file here,
editable (OUT-D3; § A file from outside the vault); `space v v` still goes there: choosing, not looking (VV-D4;
§ Going into a vault)."

Previously: "`:e` with a path or a pointer, the explorer and `space v v` still go there: choosing, not looking (VV-D4;
§ Going into a vault)."

The `o` bullet's last sentence becomes: "On a tab kept from a peek, `space v g` (`vault.into_file`) or the palette: the
same, into that file's vault (OUT-D4)."

Previously: "On a tab kept from a peek, from the palette: the same, into that file's vault."

The **Mouse** bullet's `ctrl+click` becomes: "`ctrl+click` (`link.go`, the terminal's ctrl with a click) goes into
the file's vault, asked as every switch is (D270), a peek skipped; a link's file is never opened here (OUT-D9)".

Previously: "`ctrl+click` (`link.go`, the terminal's ctrl with a click) goes there at once, a peek skipped".

## MODIFIED design/tui.md § Side panes: explorer (plan `3.7`), history, the git panel, Info, outline and footnotes

In **Keys on a row**, `enter`'s clause "asks to go into another vault (VV-D4, D270; § Going into a vault)" becomes
"on another vault's row asks to go into it (VV-D4, D270; § Going into a vault); on a file outside the vault open's own
tree, opens it here, editable (OUT-D3; § A file from outside the vault)"; and `o` "replaces the current window's note"
with such a file the same way.

Previously: "`enter` (or a double-click) folds or unfolds a folder and the vault open's row, opens a note as a tab (or
switches to the tab already showing it), asks to go into another vault (VV-D4, D270; § Going into a vault)".

## MODIFIED design/tui.md § Overlays

In the switcher's path, "or opens a file through `file.open` — another vault's asked first (D270; § Going into a
vault)" becomes "or opens a file through `file.open` — one outside the vault opened here (OUT-D3; § A file from
outside the vault)".

Previously: "`enter` goes into a folder, the list open, or opens a file through `file.open` — another vault's asked
first (D270; § Going into a vault)".

## MODIFIED design/tui.md § Writing notes

Its first paragraph's first sentence gains, after "(VV-D6; [roots.md](../../design/roots.md) § Links followed only when
you say so)": "; a file outside the vault opened by name or picked is written where it is, as its own vault writes its
files, the one write out of a vault, and never a file a link led to (OUT-D2; § A file from outside the vault)". After
that sentence: "The write path holds the guards, every save passing there: a read-only buffer is refused whatever the
save, and a buffer of another place unless it was chosen."

Previously: "Every write goes one way (`writeBuffer`; D142): the file is replaced atomically (a temp file in the same
folder, then a rename) keeping its permissions; a symlinked note is written through to its target, and a target outside
the vault is refused (`7.5`) — in home, a link you followed is written through wherever it leads, and in Elsewhere what
the file system allows (VV-D6; [roots.md](../../design/roots.md) § Links followed only when you say so); the watcher is
told the write is its own; …".

## MODIFIED design/tui.md § Vault-switch ownership (VB-D4, VB-T3–T5)

"without unsaved notes, Go, Peek or Stay (D270)" becomes "without unsaved notes, Go or Stay, and Peek when the switch
opens a file not from a peek nor open here already (D270, OUT-D4)".

Previously: "without unsaved notes, Go, Peek or Stay (D270)".

## MODIFIED design/roots.md § Vaults and markers

Its last paragraph becomes: "The TUI is always in one vault, home or Elsewhere: the current vault, whose tabs are
shown. Choosing another vault goes into it, its tabs becoming the TUI's; a file of another opened by name or picked
opens here, editable, its vault named on its tab; following a link to one peeks at it, going there a choice (VV-D4,
VV-D7, OUT-D1–OUT-D3; [tui.md](../../design/tui.md) § Going into a vault, § A file from outside the vault, § The peek)."

Previously: "The TUI is always in one vault, home or Elsewhere: the current vault, whose tabs are shown. Choosing a
file or folder of another goes into it, its tabs becoming the TUI's; following a link to one peeks at it, going there
a choice (VV-D4, VV-D7; [tui.md](../../design/tui.md) § Going into a vault, § The peek)."

In the paragraph beginning "One file has one vault", the sentence on `--root` gains, after "in the CLI as in the
TUI": "; started with a file outside its folder, the TUI opens that vault with the file as a tab, still the file's
own vault's, where the CLI's commands refuse it (OUT-D3; [tui.md](../../design/tui.md) § A file from outside the
vault)".

Previously: "`--root` says where to start and where a note's name is looked for; it must be a vault itself, and a
vault nested in it stays one, in the CLI as in the TUI."

## MODIFIED design/roots.md § Home

After "Every way into a folder of home goes through one path (`Vaults.ask`): the start, and every switch into home, a
note of it opened from another vault (`intoOther`, a peek's `o`), the way back, a folder revealed (a link to it).",
add: "A file of home's opened here from a vault (OUT-D1) asks for its folder the same way, in home's graph as this
vault reaches it, the one its tab reads (`elsewhere.graph`), when it opens and when its tab comes back; its links and
backlinks are then home's walk of that folder."

## MODIFIED design/roots.md § Elsewhere

**Going in and out** becomes: "A file of Elsewhere's opened by name or picked from a vault or home — `:e`, the
switcher's path, the explorer — opens there as a tab, editable, marked `Elsewhere` (OUT-D1–OUT-D3;
[tui.md](../../design/tui.md) § A file from outside the vault); `o` in a peek and `space v g` on such a tab go into
Elsewhere as into a vault (`intoOther`, `goThere`): its tabs, `ctrl+o` back. In Elsewhere, a file of Elsewhere's
anywhere opens there: it's one place. A peek's `t` keeps Elsewhere's file as a tab read-only, marked `Elsewhere`
(`markElsewhere`); `o` on it goes into Elsewhere. Gone with D58's plain folder: a folder walked and indexed as a vault.
What D58 called a loose file, a file opened beside a vault's notes, editable, is what a file of Elsewhere's named or
picked is now, still Elsewhere's, no new kind of place (VV-D4, OUT-D2, OUT-D8)."

Previously: "Choosing a file of Elsewhere's from a vault or home — `:e`, the explorer, `o` in a peek — goes into
Elsewhere as into a vault (`intoOther`, `goThere`): its tabs, `ctrl+o` back. In Elsewhere, a file of Elsewhere's
anywhere opens there: it's one place. A peek's `t` keeps Elsewhere's file as a tab read-only, marked `Elsewhere`
(`markElsewhere`); `o` on it goes into Elsewhere. Gone with the plain folder and the loose file (D58): a loose file
opened beside a vault's notes, editable, and a plain folder walked and indexed as a vault."

## MODIFIED design/roots.md § Links followed only when you say so

In **What a yes allows**, "in a vault, reading and the index, never a write that lands outside the vault, followed or
not (D220)" becomes "in a vault, reading and the index, never a write that lands outside the vault, followed or not
(D220): the one write out of a vault is a file outside it opened by name or picked in the TUI, written as its own place
writes its files, so this rule holds for it in its own vault; never one a link leads to (OUT-D2)".

Previously: "in a vault, reading and the index, never a write that lands outside the vault, followed or not (D220)".

## MODIFIED design/terms.md

**The current vault** becomes: "the vault whose workspace is shown; choosing another goes into it, and a file of another
opened by name or picked opens here (VV-D4, OUT-D1). [tui.md](../../design/tui.md) § Going into a vault, § A file from
outside the vault."

Previously: "the vault whose workspace is shown; choosing a file of another goes into it (VV-D4).
[tui.md](../../design/tui.md) § Going into a vault."

In § Retired, **plain folder**, **loose file** becomes: "a folder, a file, outside every vault, opened by its path:
Elsewhere now; a file of Elsewhere's, or another vault's, opened by name or picked opens beside a vault's notes again,
still its own vault's, with no name of its own (VV-D3, VV-D4, OUT-D1, OUT-D8); `~` is home (VV-D2)."

Previously: "a folder, a file, outside every vault, opened by its path: Elsewhere now, and a file of it is
Elsewhere's, never opened beside a vault's notes (VV-D3); `~` is home (VV-D2)."
