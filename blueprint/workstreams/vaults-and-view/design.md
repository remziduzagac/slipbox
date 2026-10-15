# Design changes

Each change names the root's design section it lands in at consolidation. A task writes the new text here as it does
the work; the root's files change only when VV is consolidated.

## MODIFIED: "root" becomes "vault" in every design file (VV-T1)

What users read says vault since VV-T1: the docs (the manual's chapter is `links-and-vaults.md`, Links and vaults), the
README, the skill, the help, the command titles and descriptions, the messages, the TUI's Info view and folder info,
and the human output of `slipbox info` and `slipbox stat`. A folder outside every vault and a file outside every vault
are said so, until VV-T2 and VV-T3 replace them; a vault nested in another and made part of it again by `deinit` is
"part of the vault holding it". A path starting `/` is read "from the vault's top". The design's files say root until
consolidation, when each says vault where it means one.

The names that keep the word, since agents, scripts and configs depend on them: the `--root` flag; `SLIPBOX_ROOT`; the
settings `[trust] roots`, `walk.root_markers`, `capture.location = "root"` and `links.path = "root"`; the explorer's
actions `rename_root`, `make_root` and `unmake_root`; the colour role `sidebar_root`; the command ids `root.trust` and
`root.untrust`; the state file `roots.json`; the CLI's JSON fields (`root`). (`vault.pin_root` and `:pin-root` went
with VV-T4.)

## MODIFIED design/roots.md § How a root is named and shown

The paragraph on the CLI's words becomes: what the CLI prints for a person says vault, as the TUI and the docs do
(VV-D1); its JSON keeps root in its values, whose `schema` stays 1 (DF-D9): `info`'s `mode` is `root` or `folder`; a
change's `kind` is `root` for a vault's naming, `make-root` for `init` of a folder inside a vault, `unmake-root` for
`deinit`. Its reasons in words say vault: a vault nested in another is skipped by the walk as a `nested vault`, a
symlink out of it as `symlink points outside the vault`; nothing to undo is "in this vault". `info` labels the vault
`vault` (a folder outside every vault `folder`, "outside every vault"); `stat`'s row and the Info view's say `vault`.

## MODIFIED design/testing.md § Strategy

The table's `tests/docs.test.ts` row adds vault, never root (VV-D1): the user docs, the README and the skill never say
root for a vault, nor plain folder or loose file, outside code and links' targets; nor does a message slipbox prints (a
string with a space in it), past the names above. Root's other meanings pass: the filesystem's root, running as root, a
root cause, square roots.

## MODIFIED design/roots.md: home (VV-T2)

Done in VV-T2; the text for roots.md at consolidation. Supersedes D58, D69 and D80's "`$HOME` is never a root": home is
a vault, `/` still none.

**§ Roots and markers.** A file's vault is its nearest folder holding a marker; else home, when it's under `~`; else
none, as a plain folder or a loose file is until VV-T3 (`locateVault`, `vaultOf` in `core/vault.ts`). Home is `~` by
`$HOME`, or its real path when a path reaches it that way: one home, one key. It is never a marked vault, whatever it
holds (`isVaultRoot` stays false for it): a `.slipbox/` or a `.git` in `~` don't make it another kind. `--root ~` is
home; a file of a vault in it is that vault's.

**§ Home** (new, in place of § Plain folders and loose files for `~`). Home's mode is `home` (`homeAt`), beside
`vault` and `folder`. Its files are those in `~` that no other vault holds: the vaults inside home are boundaries of its
walk, as nested roots are, and a link from another vault into one of them is that vault's backlink, never home's. Its
state is keyed as any vault's, by its path (`vaultKey(~)`, the key `~` opened as a plain folder had: its session
carries over); its settings are the user's alone (`configFilesFor` gives none of its own); it has no name, no pointers,
and `init` and `name` refuse it; its git is `~`'s own repository only (`checkoutAt`). A folder of home given a
`.slipbox/` (`init`, `space v m`) has its links across the new boundary fixed, as in any vault, and `deinit` makes a
vault in home part of home again (`vaultOf` finds the vault holding it, `openVault` opens home). `/` and a link
from its top resolve from home, as from any vault's top, and a wikilink's name matches its notes. The scratch stays in
the state folder: nothing is written into `~` (D39).

**§ The walk: home's skip list.** Home's `WalkFilter` (`{ home: true }`) applies its skip list instead of `.gitignore`
(a dotfiles repository's `*` would empty it): `homeSkip` in `core/walk.ts` — hidden folders, the system's (`Library`
on macOS, `AppData` on Windows, at the top), `Downloads` (where `user-dirs.dirs` says, else `Downloads`), and the busy
folders anywhere (`BUSY_FOLDERS`, `isBusyFolder`: VV-D8's list and caches); and the files the explorer doesn't list,
a note or a text file aside (`classify`'s binary group). A note over `walk.max_file_size` is listed as skipped, not
read. `reachable` refuses all of it in home: named, such a file opens, and is never indexed. `exclusion` gives each
reason, for VV-T5's marks. No watcher sees such a file, so the TUI polls it while it's open, as it polls a file outside
the vault: every open file the graph doesn't know.

**§ The index: home's, in slices.** Home is never walked when it's opened: its walk is made a slice at a time
(`SlicedWalk`, breadth first, entries by name) while nobody is working, and kept in its cache folder (`walk.json`,
`keepHomeWalk`); its graph is built from the walk kept (`homeWalk`), brought up to now as a build is (freshness
checked, not assumed): each folder kept is statted, one changed since the walk listed again — what came and went, a
folder new in it walked — one gone, or become a vault, dropped with what it held, a vault the walk found that is none
any more walked as home's; each note statted again — gone, dropped; grown past the size cap, skipped. What changed is
kept again (not a folder whose time moved alone: a shell's history rewritten in `~`). The graph's `walkedAt` is the
walk's, so the watcher lists again the folders changed since. So an agent's note made in home is there at its next
command, and a folder made a vault by hand (`git init`) leaves home.
Never walked, home is its top alone (`walkTop`): its notes and files, the vaults in it, its folders listed but not
looked into. The background index (`AutoIndex`) walks home first each pass — finding the vaults in it as it did —
keeps the walk, builds home's index, then indexes the vaults it found; its progress is version 2 (`home`, `homeNotes`,
`capped`, the queue now the vaults left), and home's walk, quick beside the vaults, is made again after a restart. With
`[index] background = false` and home open, the TUI runs the same job for home alone, its place kept nowhere
(`indexJob`). A folder that comes in home (the watcher's rescan), or home never walked, asks for the walk again
(`homeAgain`); when it's done, the TUI's graph is built again from it. The CLI walks home at once the first time it
needs it (an agent's answer is now), and `index --refresh ~` walks it again. Home's notes are another vault's backlinks
as of its index (`Reach` reads it beside the vaults'), and the relink of a vault moved rewrites them too; search's
linked and all scopes take home as a vault (`scopeRoots`).

**The cap.** Home's index holds 10,000 notes at most, and its walk lists 5,000 folders (`HOME_LIMITS`), those nearest
the top: what stopped it is kept with the walk, said in a message when the TUI's home is built from it, and in `info`
(`index.walked`, `index.capped`; the `--home` run's `home.capped`; `describeCap`). Past the cap, the background index
still looks in the folders it left for vaults, a level at a time, home's skip list held (`seek`, kept with its place).

**What's shown.** The status line names home `~`; `info` says `mode` `home` (an addition to schema 1's values), the
Info view and `stat` `home (~)`. Started in `~`, there is no named folders' list to go into first: home is the vault.
The explorer is home's tree from its walk; a folder of home its index leaves out, opened (`slipbox ~/Downloads`), is
listed a level at a time as a folder above the root is, until VV-T4's view and VV-T5's marks.

**Not done here.** The vaults inside a folder home's skip list leaves out (a clone in `~/Downloads`) are no longer
found by the background index: they're found when opened. Link completion offers other vaults' notes, not home's.

## MODIFIED design/roots.md

Rewritten in vaults' terms (VV-D1–VV-D4): a vault and its markers; home, a vault without one, and its skip list;
no-vault and its tabs; every file in exactly one; a vault inside a vault. § Plain folders and loose files goes, its
storage (sessions by path) kept for no-vault's one set of tabs. § The walk's symlink bullet becomes VV-D6's rules: a
link out not followed until the user says so, the trust kept by link and target in the state folder, what a yes allows
where, the CLI's refusal, slow targets. § Storage keys: home's key, no-vault's.

## MODIFIED design/tui.md § Switching roots

Becomes § Going into a vault: what chooses another vault (the explorer, a peek's `o`, the git panel), the tabs
becoming its own, `ctrl+o` back; refused while a note is unsaved, as now. Following a link into another vault peeks
(VV-D7) instead of switching. The named folders' list at the start in a plain folder goes; `space v v` stays.

Done for the explorer and the start in VV-T4. **Choosing in the explorer** (VV-D4): `enter` (or a double-click) on a
vault's row other than the current one goes into it, and so does a file of another vault opened from the explorer;
`l` unfolds a vault's row in place instead, its folder listed a level at a time, its rows not this vault's to change
(no menu; a paste or a new note there refused). **The launcher goes:** started in a folder outside every vault
(`slipbox ~`), nothing opens over the explorer (`prepare` no longer passes `launcher`, the App has no such option);
`space v v` (`:folders`, `folders.open`) lists the named folders from anywhere, as before. **The view follows a
switch** (`switchVault`): the explorer's unfolded folders are kept by their absolute paths, then given the new vault's
keys; a view holding the new vault stays, the folders down to the vault unfolded; one not holding it zooms out to the
common parent (§ Side panes, below); where the tree can't show the vault (its path has a hidden folder: a worktree
in `.claude/worktrees/`), the view moves to the vault, as it did before.

## MODIFIED design/tui.md § Side panes ("Explorer")

The explorer as one tree and the view (VV-D5): starting at what's opened, the breadcrumb, zooming out to the common
parent, `z` and the breadcrumb zooming in; vaults marked, the current one highlighted; the busy folders listed
(VV-D8); a row's marks in their columns (VV-D9). Goes: `..` above the root as a mode of its own (the breadcrumb and
zooming out replace it), the roots beside the tree, `:pin-root`.

Done in VV-T4 but the busy folders and the marks (VV-T5). The explorer bullet becomes:

- **Explorer (left, `≡`): one tree, the view a part of it** (VV-D5). The view (`explorerTop`, absolute) is a folder:
  its rows are what's in it. In the vault open, the vault's own tree from there (`rootTree(sub)`, its notes and files
  as `files.show` lists them, the walk's folders, nested vaults by their rows); anywhere else — above the vault,
  beside it, in another vault, a nested one's folder — the folder listed a level at a time, never walked
  (`outsideRows`): its folders, then its files as their vault's `files.show` would list them, hidden ones and
  `node_modules` left out. There the vault open is a row, highlighted (`sidebar_active`), its tree under it while
  unfolded; another vault is a row with the vault's icon in a folder's blue (`sidebar_root`), its name dimmed after
  the folder's when they differ, a worktree's branch (`⎇ feat`). A row's path is its path in the vault for what the
  vault's own tree holds, else absolute (`outside`), and so is a folder's key in `expanded`; none of this vault's file
  operations act on an `outside` row. **It starts** at the folder opened (`slipbox x/y`: y, in vault x; `prepare`'s
  `folder`), set once the notes are open, so the note shown outside it leaves it be; opened on a note, at its vault.
  **The breadcrumb**, on the row under the pane's title (where a blank row was), says where the view is: `~` for home
  (else `/`), then each folder down to the view and a `›`; a vault with its icon, the vault open highlighted, the view
  bold. Past the view, dimmed, the trail (`explorerTrail`): the folders it can zoom back into — the view zoomed out
  from, or where you went when it zoomed out by itself — kept while the view is on their way. Too long for the pane,
  the trail gives way first (from its end, its first folder cut short, kept), then the folders above the view, from
  the start, to `…`. A click on a folder of it zooms the view there (`xcrumb:<path>`). **Zooming** on purpose
  (`zoomTo`): `z` (`zoom_in`) on a folder or vault, a file's folder on a file; `-` (`zoom_out`, nvim-tree's and oil's
  key for the parent) a folder up, the folder left unfolded and selected; nothing above `/`, said. **By itself**
  (`zoomToHold`), only outward: going somewhere outside the view — a note opened, followed to, gone back or forward
  to, revealed (`space shift+e`), a folder link followed, a vault gone into — zooms the view out to the common parent
  of the view and the place, only their two paths unfolded (what was unfolded in the old view kept, every other
  folder folded), the trail at the place. Not for what the tree doesn't list (a hidden folder's file, `node_modules`),
  nor the scratch; the explorer's first showing, a session's tabs restored, and the filter's `esc` reveal the note
  only inside the view. **Keys on a row:** `enter` folds or unfolds a folder and the vault open's row, opens a note,
  goes into another vault (VV-D4); `l` unfolds any folder or vault in place; `h` folds an unfolded folder or vault,
  else the folder holding the row (when it's a row of the view). **Any folder you may read:** a folder you may not
  read (`access`: read and search) says why when it's opened on, unfolded or zoomed into (`can't read ~/x: you may not
  read it (no permission)`), nothing unfolded; a file you may not write — it, or its folder, for the save's rename —
  opens read-only (`buf.readOnly`), said at once and when typing is refused (`notes/a.md is read-only: you may not
  write it (no permission)`). Gone with VV-T4: `..` and climbing above the root (`explorerUp`), the roots beside the
  tree (`otherRoots`: the one opened, those pinned, a loose file's folder — the view holds them now), `:pin-root`
  (`vault.pin_root`, its `roots.json` in the vault's state no longer read).

## ADDED design/tui.md § The peek

Done in VV-T7 (`tui/peek.ts`). **Looking never moves you** (VV-D7): a link that leads out of the current vault — into
another vault, a vault nested in this one among them, or to a file outside every vault, by a path, a pointer or a
wikilink — opens a peek, never a switch (D50's switch on following a link is gone). So does a backlink from another
vault (`space l b`, `g r`), another vault's hit in the search widened with `ctrl+a`, and `ctrl+enter` or the split's
follow on such a link. `:e` with a path or a pointer, the explorer and `space v v` still go there: choosing, not
looking (VV-D4). A folder link out of the vault is revealed in its own vault, as before.

- **The window:** the floating window (3.20) of kind `peek`, a virtual buffer of the file's text (`peek:<path>`, never
  read from or written to the disk again, never a place remembered), read-only (`a peek is read-only — o goes there,
  to edit it`). A note is rendered, a data or code file shown as its kind opens; a binary file isn't peeked at. Its
  `elsewhere` holds its vault's name and the vault's graph and path there: the layout reads its links and embeds in
  that graph, and `followLink` resolves them there (`tui/actions.ts`). Its size: the content's width less an eighth
  (at least four columns each side) and its height less a tenth, centred; `z` (`peek.fill`) the whole content area,
  no margin; again, back. Titled `kestrel › docs/architecture.md`, outside every vault `/etc/hosts — outside every
  vault`, the path cut from the front when it doesn't fit (`peekTitle`), so the vault, the file's name and "outside
  every vault" stay; its bottom border `o go there · t keep as a tab · z fill · ctrl+o back · esc closes` (`z smaller`
  while it fills the screen, `ctrl+o back` while it has somewhere to go back to). The status line keeps the current
  vault, the path being the peek's (`kestrel: docs/architecture.md`).
- **Keys:** the peek's keymap (`DEFAULT_PEEK_KEYS`, over the note's, not in visual mode): `o` `peek.go`, `t`
  `peek.tab`, `z` `peek.fill`; `esc` closes it (a find first), `q` too, as every floating window. `/`, the moves, the
  selection and `y` as in any rendered note.
- **`o` (`peek.go`):** into its vault as a switch does (`switchVault`, at the cursor's place in the peek), the trail
  kept, so `ctrl+o` comes back; refused while a note is unsaved, the peek staying. Outside every vault, the file
  opened beside this vault's notes, editable, as a file a link reached always was. On a tab kept from a peek, from the
  palette: the same, into that file's vault.
- **`t` (`peek.tab`):** a tab here of the file (`buffer`'s path-keyed buffer beside the vault, as a loose file's),
  at the peek's place. A file of another vault is read-only whenever it's open here (`markElsewhere`: `read-only here:
  kestrel's — go into kestrel to edit it`), the session's tabs bringing it back so; its tab marked `kestrel:
  architecture.md`, its links read in its vault. One outside every vault is read-only while kept (`read-only: kept
  from a peek`); `o` makes it a file beside, editable. Back (`ctrl+o`) from the vault gone into from such a tab goes
  into the vault it was kept in, its tabs.
- **Links inside it:** one to the peeked note's vault moves the peek there, the place left kept: `ctrl+o` back, and
  forward, inside the peek (`peekStep`). One to the current vault closes the peek and opens there, in the tabs, as a
  link does. One to a third vault, or outside every vault, moves the peek there too. A wikilink by a name that vault
  has no note of, or a path not written yet, is said, never made: notes are written in their own vault. In a file
  outside every vault, its paths are read from its folder (`b.md` as `./b.md`), its wikilinks said to need a vault.
- **Backlinks:** under a Markdown note, after a rule, `Linked from (n):` — each a link from the note's folder to the
  line linking here (`[~/notes/index.md:41](<../../../notes/index.md#L41>) — architecture`), followed as any link in
  the peek — when its vault has an index on disk (the background index has most); none yet: `Linked from: kestrel has
  no index here yet — o goes there, and finds them.` The vault's graph is the one this vault reaches it by (`Reach`,
  opened once, its index caught up then), given a reach of its own for other vaults' links into it.
- **Mouse:** a click on a link out of the vault peeks; `ctrl+click` (`link.go`, the terminal's ctrl with a click) goes
  there at once, a peek skipped; within the vault it's a click. A click outside the peek closes it.

## MODIFIED design/tui.md § Side panes ("Source control")

The panel follows the vault (VV-D10): the current vault's repository, the repositories in the view, their order, opened
up in place, asked about in the background.

## MODIFIED design/trust.md

Adds the links' trust (VV-D6): asked when a link out is first opened, kept by link and target, never in the vault,
asked again when the target changes; beside a vault's trust for its tools (D172), not part of it.

## MODIFIED design/terms.md

Vault, home, no-vault (Elsewhere), the view, the peek added; root, plain folder, loose file retired. Done for vault
in VV-T1, the vocabulary page changing at once: vault, vault marker and trusted vault in; root, root marker and trusted
root retired, with the names that keep the word; plain folder and loose file noted as what users read as "a folder
(a file) outside every vault". Home, no-vault, the view and the peek come in with their tasks, plain folder and loose
file leave with VV-T2 and VV-T3.
