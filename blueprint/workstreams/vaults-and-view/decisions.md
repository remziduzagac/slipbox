# Decisions: vaults and the explorer's view

Proposed, each settled with the user in conversation on 2026-10-14 (notes.md), to be accepted as a whole before the
work starts.

## VV-D1: "Vault" for every folder with a marker (2026-10-14)

**Decision:** A vault is a folder holding `.slipbox/`, `.obsidian/`, `.zk/` or `.git`: any git repository is a vault,
an Obsidian vault and a zk notebook too. A vault has its own tabs, index (links, backlinks, search), settings and git.
"Root", "plain folder" and "loose file" leave everything users read: the docs, the messages, the status line, the
help; the code, which says vault already (`core/vault.ts`, `vault.init`), keeps its names.

**Why:** The user's: "root" reads as the top of the tree, or the one selected; "vault" is what Obsidian's users call
such a folder, and the code's word.

**Supersedes:** D79's "root" for what users read.

**Not chosen:** "workspace", which VS Code's users know as a window's set of folders; "project", which reads as code.

## VV-D2: Home is a vault, without a marker (2026-10-14)

**Decision:** `~` is a vault: its files are those in it that no other vault holds, its tabs its own, its settings the
user's, its git only if `~` is a repository. Its index covers its own notes, less a skip list: what the explorer
doesn't list as a note or a text file; hidden folders (`.cache`, `.config`, `.local`…); the system's (`Library`,
`AppData`); `Downloads`; the busy folders (VV-D8); large files are listed, not read. It's built in slices while
nobody is working, as the background index already finds the vaults in home.

**Why:** The user's: every file belongs somewhere, and home is where most of a person's loose notes are.

**Supersedes:** D58, D69 and D80's "`$HOME` is never a root".

## VV-D3: No-vault, shown as "Elsewhere" (2026-10-14)

**Decision:** Every file outside home that no vault holds is in no-vault: `/etc`, another disk, a share. No-vault
has its own tabs, one set for the machine, your settings, and nothing that needs an index: no backlinks, no search
across it, no git. On screen it's "Elsewhere" (`Elsewhere  ‹ /etc/nginx/nginx.conf ›`); "no-vault" is the design's.

**Why:** The user's: with home a vault, the rest of the file system needs a place too, without a vault's features.

**Supersedes:** the plain folder and the loose file (D58, D76).

## VV-D4: Every file in exactly one vault; going into another is a choice (2026-10-14)

**Decision:** A file belongs to the vault that holds it, else home, else no-vault; a vault inside a vault is its own
(a worktree in `.claude/worktrees/` among them). The current vault is the one whose tabs are shown. Choosing a file or
folder of another vault — in the explorer, `o` in a peek, the git panel's Open — goes into it, and the tabs become its
own, as a switch does today; `ctrl+o` comes back.

**Why:** One rule for every file, so "where am I" always has an answer.

## VV-D5: The explorer is one tree, the view a part of it (2026-10-14)

**Decision:** The explorer shows the file system as one tree; the view is the part shown. It starts at the folder
opened (`x/y` shows `y`, in vault `x`). Above it, a breadcrumb says what's hidden: `~ › projects ›` in home, `/ › etc ›`
outside. Going somewhere outside the view zooms it out to the common parent of the two places, only their paths
unfolded; it zooms in only when asked: `z` on a folder, a click on the breadcrumb. Vaults are marked (`◈`), the current
one highlighted, a worktree with its branch (`⎇ agent/sync-retry`). Any folder can be opened, wherever you may read:
a file you can't write opens read-only and says so; a folder you can't read is marked (VV-D9) and says why; slipbox
never asks to run as root or administrator. On Windows, above everything are the drives and shares; home is
`C:\Users\<you>`, shown as `~`.

**Why:** Today other roots appear in three places, each acting otherwise (`..` above, rows inside, a list under the
tree), and opening a folder inside a root shows the root. A view of one tree, zoomed, has one picture: where a thing
is in the file system.

**Supersedes:** D65 and D77's roots beside the tree; the named folders' list at the start in a plain folder (`17.14`);
`:pin-root`.

**Not chosen:** several trees at once (the user found two trees becoming one confusing); always the whole home tree
(noisy and deep; the view reaches it by zooming out).

## VV-D6: Symlinks followed only when the user says so (2026-10-14)

**Decision:** A symlinked folder or file leading out of its vault, or out of home, is shown as a link
(`→ /mnt/disk/data`, `not followed`) and not opened until the user answers, the first time it's opened: follow it (read
and indexed as part of where it is), just look (read-only, this once), or no. A link within its own vault or within
home (the ones `stow` makes, `~/.zshrc → ~/dotfiles/zsh/.zshrc`) is a second name for what's there: shown once, never
asked about, never indexed twice. In Elsewhere, with no vault to stay inside, every link asks. The answer is kept for
that link and that target, in slipbox's state, never in the vault (a cloned repository can't bring its links trusted),
and asked again when the target changes. What a yes allows: in home, reading, the index and writing through it; in a
vault, reading and the index, never a write to a target outside the vault; in Elsewhere, reading and writing as the
file system allows. The CLI refuses any link not trusted, and the prompt says agents will see what's followed when the
target is hidden or outside home. A followed target on a slow disk is read in the background, given up on when it
doesn't answer. Unchanged: a vault is known by its real path; a file reached by two names is one tab, indexed once;
loops, broken links, devices and pipes are skipped; the view uses the path as reached, belonging the real path.

**Why:** The user's: not followed by default, asked explicitly, a link being the rule's subject wherever it is. A link a
pull can change could lead a save to `~/.bashrc`, and what's followed reaches agents through search, the context bundle
and the CLI.

**Supersedes:** the walk's "a symlinked folder is never followed" and "a symlinked file only inside the root"; the
CLI's refusal of reads through a link out of the root. **Details:** D220, kept for vaults.

Confirmed by the user on 2026-10-15: only links leading out of a vault or home ask; in Elsewhere every link asks,
the same rule for any link that leads somewhere unasked.

## VV-D7: Looking never moves you: the peek (2026-10-14)

**Decision:** Following a link that leads out of the current vault opens a peek: a large floating window, the note
rendered, read-only, found in with `/`, copied from. `esc` closes it; `o` goes there (VV-D4); `t` keeps it as a tab
here, read-only, marked with its vault's name; `z` fills the screen. Inside it, a link to the peeked note's vault
moves the peek (`ctrl+o` back), one to the current vault closes it and opens there, one to a third vault moves it. The
same peek shows a backlink from another vault, another vault's search result, a worktree's file from the git panel,
a file in no-vault; it shows backlinks when the vault has an index. A click on such a link peeks; `ctrl+click` goes.

**Why:** Switching to glance at one file swaps every tab; a peek that could edit would be a half-switch, which is what
confused us.

**Supersedes:** D50's switch on following a link into another vault.

## VV-D8: Busy folders in the tree, not in the index (2026-10-14)

**Decision:** `node_modules`, `.venv` and `venv`, `__pycache__`, `target`, `build`, `dist`, `.next`, `vendor`, `Pods`,
`DerivedData`, `.gradle`, `.tox` and caches; in a vault, what its `.gitignore` leaves out; in home, its skip list. They
are listed and browsed like any folder, nothing in them indexed, searched or linked to by name.

**Why:** Today the walk leaves them out of the explorer as well; a person looking for a build's output should find it.

## VV-D9: A row's marks, at the right (2026-10-14)

**Decision:** A row carries a mark for each thing it tells, one column wide in every terminal, in the nerd, unicode
and ascii glyphs; no emoji. At the right, in columns: the index's state last — indexed `●` (dimmed), indexing `◐`, not
indexed `⊘`, can't read `⚿` (a lock in nerd), a problem `⚠` (a broken link, a disk that doesn't answer) — git's mark
before it (`M`, `+`, `R`, `•`), and between the name and those, dimmed, what describes the row: a vault's branch,
where a link points.

**Why:** The user's: the index's three states each marked, extra marks aligned at the right; `🔒` is drawn two columns
wide in some terminals.

## VV-D10: The git panel follows the vault (2026-10-14)

**Decision:** Source control shows the current vault's repository in full, when it is one (GIT's panel), and under it,
folded, the other repositories in the view; the current vault not a repository, those repositories are the panel.
Each is ordered by what needs attention (something to review, changes, ahead or behind, clean), opened up in place
(its worktrees, its changes, a diff in a peek), gone into with `o`. git is asked only about the rows shown, in the
background, again on the watcher's news or the focus coming back.

**Why:** A vault holding other vaults — home, a folder of repositories — has its repositories' work to watch over,
which an agent's worktrees make the common case.
