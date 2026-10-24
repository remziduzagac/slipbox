# Decisions: roots and links

How slipbox finds a file's root, keeps its data, and reads and writes links: the marker-based vault, the vaults of
2026-09-30, plain paths and virtual vaults (2026-10-02), then paths inside with conventions at the edges (2026-10-05).

## D38: A `.slipbox/` directory marks a vault root (1.1, 1.10, 2026-09-25)

> **Amended by D58 (2026-10-02):** a git checkout is a root by itself after all; nothing is written into it.
>
> **Superseded by D42 (2026-09-30):** no single-file mode, a loose file belonging to the home vault (D43); a
> repository offered as a vault (D44); links cross vaults (D47, D48).

**Decision:** A `.slipbox/` directory marks a vault root, as `.git/` and Obsidian's `.obsidian/` do: a directory
rather than a bare `.slipbox.conf`, so there is somewhere to grow. It holds config only; any index goes in the cache,
keyed by a hash of the root (D39). Discovery is git's: walk up from the opened file, the first `.slipbox/` wins,
stopping at `$HOME` or `/`; nested vaults resolve nearest-first. Precedence: the `--root` flag, then the nearest
`.slipbox/`, then **single-file mode**, where links resolve relative to the file's own directory, with no corpus and
no index. Without a marker, slipbox says what is lost and offers to create one (`slipbox init`, `1.10`). One vault per
repository is enough: links do not cross vaults, and connecting vaults is a separate problem for later.

**Why:** The vault is usually a git repository, and derived data should not need a `.gitignore` entry.

**Not chosen:** a git-root fallback, because, convenient as it is, it would silently turn every repository opened
into a vault (ideas.md § Roots and vaults).

## D39: Config, cache and state apart; nothing derived in the vault (0.10, 2026-09-25)

> **Amended by D200 (2026-10-10):** the XDG folders are kept on macOS for distribution: the dotfiles people keep
> and sync are there, not in `~/Library`.
>
> **Amended by D76 (2026-10-05):** the key is the root's path again, a plain folder's when there is none; reading
> positions are by file, one list for the machine; a named folder moved by hand takes its state along.
>
> **Amended by D61 (2026-10-02):** a cache shared by every copy, `parsed.db`, keeps parsed content by content.
>
> **Amended by D59 (2026-10-02):** state is kept by instance (`20.5`).
>
> **Amended by D58 (2026-10-02):** no home vault: a plain folder's state is its own, by its path.
>
> **Amended by D45 (2026-09-30):** keyed by the vault's id; a fourth place, data, for the home vault's `.slipbox/`.

**Decision:** Three kinds of data, three places: config in `$XDG_CONFIG_HOME/slipbox/config.toml`, then the vault's
`.slipbox/config.toml`; the cache, the persisted link index, in `$XDG_CACHE_HOME/slipbox/<key>/`, safe to delete;
state (positions, session, scratch, staleness) in `$XDG_STATE_HOME/slipbox/<key>/`. Nothing derived ever lives in the
vault. XDG's defaults apply when the variables are unset, on macOS too. The key is `<basename>-<hash>`, the hash the
first 12 hex characters of SHA-256 over the vault root's real path; the basename is only there so a person can find
the folder. The scratch lives in the state folder by default (`8.2`); `capture.location = "vault"` puts it in the
vault. Storage as it is now: design/how-it-works.md § Storage and design/roots.md § State by root.

**Why:** The vault is usually a git repository, and derived data should not need a `.gitignore` entry. The terminal
stack here is XDG-shaped on both machines. A scratch inside the repository gets committed by accident; it is not
invisible to agents, since `slipbox scratch path` and `slipbox scratch show` expose it.

**Cost:** Accepted deliberately: state does not travel between the Mac and the VMs (reading position is
machine-local anyway); every git worktree of a repository keys separately, which is right for the graph (a
`[[link]]` resolves to different content per branch) and tolerable for reading position; single-file mode keys on
the file's directory.

## D40: One walk for the index and the watcher (0.11, 2026-09-25)

> **Amended by D237 (2026-10-17):** `node_modules` is no longer always skipped: it is a busy folder like the others,
> busy when it looks generated (ignored, or no note at its top). design/roots.md § The walk.
>
> **Partly superseded by VV-D6 (2026-10-14):** a symlink leading out of its vault, or out of home (any, in Elsewhere),
> is followed once you say so, the answer kept in slipbox's state, never in the vault; one within is a second name,
> never walked twice. "A symlinked directory is never followed" and "a symlinked file only inside the root" go.
> design/roots.md § Links followed only when you say so.
>
> **Amended by VV-D2, VV-D8 (2026-10-14):** every vault's walk leaves out the busy folders (`build`, `target`, `vendor`,
> `.venv`…), whatever `.gitignore` says, and the explorer lists them all the same; home's walk has a skip list in place
> of `.gitignore`. The walk now: design/roots.md § The walk, § Home.
>
> **Detailed by D219 (2026-09-29, recorded 2026-10-11):** files a folder controls are read without blocking,
> regular files only, small ones capped.
>
> **Amended by D69 (2026-10-05):** a nested root is any marker's: `.slipbox/`, a git checkout's top, `.obsidian/`,
> `.zk/` (`walk.root_markers`).
>
> **Amended by D61 (2026-10-02):** a git-ignored file, or one under a hidden folder, is indexed when it is reached
> (`20.8`).
>
> **Amended by D58 (2026-10-02):** a git checkout's top is a boundary too (`20.3`); a plain folder is walked as a
> vault is, and `~` or `/` listed one level (`20.22`).

**Decision:** One predicate decides which files are notes, used by both the walk and the watcher (`5.2` is this
decision seen again). `.md` and `.markdown`, case-insensitive (`walk.extensions`). `.git`, `.slipbox`, `node_modules`
and every entry whose name starts with a dot are always skipped. `.gitignore` is honoured, nested ones included, with
git's own semantics; `walk.exclude` adds patterns. A nested vault is a boundary, not walked. A symlinked file is
included when its real path is inside the root and it is not already walked; a symlinked directory is never followed;
anything pointing outside the root is skipped and reported (`7.5`). Files over `walk.max_file_size` (4 MiB) are listed
as skipped. Errors are collected as warnings and never abort. Text is read as UTF-8: invalid sequences decode to
U+FFFD and flag the file; a BOM is noted and stripped for parsing only. The walk now: design/roots.md § The walk.

**Why:** What git ignores (`target/`, `dist/`, vendored trees) is exactly what must not resolve `[[README]]`. The same
note twice would double every backlink; a followed directory link could cycle or escape the root. A boundary keeps a
fixture vault inside a repository from leaking into it.

## D41: Links resolve by one policy, never the filesystem's (1.4, 2026-09-25)

> **Amended by D84 (2026-10-06):** the Turkish i's fold too: `[[izmir]]` finds `İzmir.md`, `[[ILIK]]` `ılık.md`.
>
> **Amended by D71 (2026-10-05):** these rules apply again, to wikilinks within their root: a name, a path, an
> alias, an attachment by its name.
>
> **Superseded by D56 (2026-10-02):** links are paths; `[[…]]` is text, and nothing resolves by a name (`20.2`,
> `20.22`).
>
> **Amended by D47 (2026-09-30):** extended across vaults, after a note's own name and path: `[[vault:name]]`,
> aliases and previous names (D46), paths out of the root (D48), redirects (D49).

**Decision:** One resolution policy everywhere, never the filesystem's. Case-insensitive, after Unicode NFC.
`[[name]]` matches file basenames without extension, `[[dir/name]]` a path suffix aligned on segments, and
`[[name.md]]` is accepted; `#heading`, `^block` and `|alias` are split off first, and `\|` divides an alias too.
Collisions are a candidate list, never a silent pick: an exact-case match, then one in the linking note's own
directory, then the deepest directory shared with it, then the shortest path; still tied is **ambiguous**, every
candidate returned, and the TUI shows a picker. A markdown link `[t](path.md)` resolves relative to the linking note,
a leading `/` from the vault root. A non-markdown target (`![[diagram.png]]`) resolves relative to the note, then the
vault root. Single-file mode resolves only within the file's own directory. The rules as they apply now:
design/links.md § Wikilinks.

**Why:** `[[Readme]]` resolves to `readme.md` on the Mac and on beaver alike. `\|` is how a wikilink is written inside
a table cell. Obsidian's shortest-when-unambiguous order opens an existing Obsidian vault unchanged for its default
"shortest path when possible" setting.

## D42: A file's root is its nearest `.slipbox/`, else the home vault (17.1, 2026-09-30)

> **Superseded by D58 (2026-10-02):** a file's vault is its nearest `.slipbox/` or git checkout; no home vault.
>
> **Amended by D44 (2026-09-30):** every vault has a `.slipbox/`; a repository is offered, not assumed.

**Decision:** Every file belongs to exactly one root, decided by the file and not by where slipbox was opened:
`~/notes/idea.md` is in `~/notes` however it is reached. The root is the nearest `.slipbox/` above the file, else the
home vault (D43); in this first cut, a git repository without one was a root of its own. `$HOME` and `/` are never a
root. A nested `.slipbox/` is a boundary: its files are its own vault's, not the outer one's. It replaces D38: no
single-file mode, and links cross vaults (D47, D48).

**Why:** Obsidian locks you into its vaults: you create one before you can work, and a markdown file outside it is
out of reach. slipbox should open any folder or file, and leave the files readable by anything else, while links,
backlinks, history, comments and agent conversations still need a place. "A vault" was two things: a namespace, the
set of notes in which a `[[name]]` is looked up, and a place for data. Only the first needs a folder to be marked; the
second belongs outside it (D45). A root at `$HOME` or `/` would index everything.

## D43: Loose files belong to the home vault (17.2, 2026-09-30)

> **Superseded by D58 (2026-10-02):** no home vault; a plain folder opened is its own, known by its path (`20.22`).
>
> **Superseded by D55 (2026-10-02):** a folder is enough; the home vault's per-folder sessions and positions move
> into each folder's own key. Superseded itself the same day, before it was built.

**Decision:** Files outside every vault (`~/todo.md`, `~/Downloads/spec.md`, `/tmp/x.md`) belong to one vault, `home`.
It has no folder of notes: the notes stay wherever they are, and a note made outside any vault is made where you are.
Its `.slipbox/` is `~/.local/share/slipbox/home/`, XDG's data folder, holding `config.toml` with its `id`, `name` and
any settings for loose files; its state and cache are keyed by its id like any vault's. A loose file's `[[name]]`
resolves among the files in the note's own folder, not below it; path links reach anything. When a `[[name]]` fails
but a match exists in a folder nearby, slipbox says where, and offers `slipbox init` on the folder that holds both.
`home` is a reserved name, and not a link target.

**Why:** Without it, a file directly in `~` had no root at all (`~` never is one), and every folder a stray file was
opened in got a state directory of its own. The home vault can't be one namespace: that would mean indexing `~`, or
counting the files this machine happened to open, and then a link would mean different things on different machines.
Loose notes that link across folders are a vault waiting to be marked.

**Not chosen:** a `~/.slipbox/`, because a marker in `~` would be the nearest `.slipbox/` for every repository under
home, and pull them all into one vault (ideas.md § Roots and vaults).

## D44: Every vault has a `.slipbox/` with an id and a name; a repository is offered (17.4, 17.18, 2026-09-30)

> **Amended by D74 (2026-10-05):** the name and id are written only by `slipbox init --name` and `slipbox name`;
> never into a hand-made `.slipbox/` on first open.
>
> **Superseded by D58 (2026-10-02):** a git checkout is a vault by itself, and nothing is written into a folder by
> opening it.
>
> **Superseded by D55 (2026-10-02):** discovery only reads, and the prompt goes. Superseded itself the same day,
> before it was built.

**Decision:** Revising D42's first cut the same day: every vault has a `.slipbox/`, with its `id` (random, made once,
never changed) and its `name` in its config's `[vault]` table (`17.4`). One model, no fallbacks: no folder-name
stand-in, no state keyed by path, no second kind of root. A git repository without one is offered, not assumed:
opening a file in it asks to make the repository a vault, committed with it or **private** (listed in
`.git/info/exclude`, never in `git status`: for repositories you don't own), or not now, remembered; until then its
files are loose. The CLI never writes on its own: it says `slipbox init <root>` would. A `.slipbox/` made before
vaults had ids, or by hand, gets its `id` and `name` written the first time it is opened, a one-time migration of
slipbox's own folder like the version stamp.

**Why:** Shared features, comments and kept agent answers, need `.slipbox/` anyway. The earlier "no git-root
fallback" (D38) stands in a new form: a repository isn't silently a vault, and it isn't silently written to either.

## D45: Storage keyed by the vault's id; the machine's vaults listed (17.3, 17.6, 2026-09-30)

> **Superseded by D76 (2026-10-05):** state is kept by the root's path; `roots.json` replaces `vaults.json`.
>
> **Superseded by D59 (2026-10-02):** state is kept by instance, each copy with a local id (`20.5`).
>
> **Amended by D55 (2026-10-02):** a scope keyed by its real path, or by its id when it has one. Superseded itself
> the same day, before it was built.

**Decision:** Every piece of data answers two questions: can it be rebuilt from the files, and who is it for? The
notes hold links, tags, tasks and frontmatter `aliases` and `previous_names`. `~/.config/slipbox/` holds your
settings and themes; `~/.cache/slipbox/<vault>/` the index, derived, with a content hash per note for move detection;
`~/.local/state/slipbox/<vault>/` personal data per vault (positions, session, the scratch, redirects; later agent
conversations and private comments); `~/.local/state/slipbox/vaults.json` the vaults this machine knows, each with
its id, name, aliases, previous names and the path it was last seen at (`17.6`); `<vault>/.slipbox/` what travels
with the folder. `<vault>` is the vault's `id`, for every vault and the home vault; state kept under a path's key
before moves over once. A copy of a vault carries its id; while the original is still where the machine last saw it,
the copy keys by the id and a hash of its own path. Config: the built-in defaults, then the user's, then the vault's
(the home vault's for a loose file).

**Why:** A vault's personal data and cache survive moving the folder. History in one project never shows in another.
Two copies never share a session. Redirects are state, not cache: only seeing a move teaches one.

**Not chosen:** a `.slipbox.local/` in the folder for personal data, because personal data already lives in the
global state, keyed per vault, and a second home for it in the folder would be the complication this design avoids;
revisit only if personal data ever has to travel with a folder, or be visible beside it (ideas.md § Storage and
state).

## D46: Names and aliases are addresses; previous names a checked fallback (17.4, 17.5, 17.7, 2026-09-30)

> **Amended by D79 (2026-10-05):** a rename writes no `previous_names` into a note, and a note's are read only by
> the converter; a folder's old names still find it by pointer.
>
> **Amended by D71 (2026-10-05):** a note's name and aliases reach it again, within its root.
>
> **Superseded by D56 (2026-10-02):** nothing resolves by a name (`20.22`).

**Decision:** A vault has `id`, `name` (the folder's name at creation, stored, so renaming the folder doesn't rename
the vault), `aliases` and `previous_names` in `.slipbox/config.toml`; names are unique on a machine, and `home` is
taken. A note is named by its file name and by frontmatter `aliases` (Obsidian's field, so other tools read it), and
remembers `previous_names` in its frontmatter. An alias resolves like the name itself. A previous name is only a
fallback, tried when normal resolution fails, and verified: for a vault, the old name must lead to the same `id`; for
a note, its last-seen path and its content must agree. A link resolved this way says so, and offers to be updated.
Creating suggests distinct names (`17.5`): a note named like another gets a suggestion from its folder
(`ideas-plan`), a vault inside vault `x` is suggested `x-plan`, and a name the machine already knows is refused, with
a suggestion. Suggestions, not rules.

**Why:** Aliases are addresses, previous names are history. A new vault reusing a name can't take old links. An old
name keeps links working where this machine can't reach: a colleague's clone, a vault not opened here.

## D47: `[[vault:name]]` links across vaults, the same on every machine (17.8, 2026-09-30)

> **Superseded by D56 (2026-10-02):** `[[vault:note]]` is read only by the converter; another vault's file is
> reached by path, shown as `vault:path` (D60), and from 2026-10-05 written as a `slipbox://` pointer (D75).

**Decision:** `[[vault:name]]` (also `#heading`, `|text`) is MediaWiki's interwiki link: the vault is found by name
or alias through `vaults.json`, then the note inside it by the usual rules (D41). Every vault has a declared name; a
loose file is reached by a path link. A vault this machine doesn't have makes a broken link that says so ("unknown
vault `app`"), and where the vault was last seen, if it ever was, with an offer to point slipbox at it.

**Why:** A name means the same on every machine. The namespace is decided by the files (the `.slipbox/`) and the
rules are fixed, so no index ever travels: each machine builds its own from the same files, and gets the same
answers. The index only makes lookups fast; it never decides what a link means.

**Not chosen:** a central index merged across vaults, because `[[plan]]` would change meaning with whatever else the
machine had opened (ideas.md § Links).

## D48: Links cross vaults by path, in every form other tools write (17.9, 17.11, 17.16, 17.17, 2026-09-30)

> **Amended by D216 (2026-10-11):** in a wikilink, only `./` and `../` paths leave the root; `~/`, absolute
> and `file://` are markdown links' forms.
>
> **Amended by D70 (2026-10-05):** a leading `/` is the nearest root's, then the filesystem's: this entry's reading,
> back.
>
> **Amended by D61 (2026-10-02):** the index reaches beyond the vaults opened: on demand, and in the background.
>
> **Amended by D56 (2026-10-02):** a leading `/` is the filesystem's root; a path is all a link is.

**Decision:** Path links name a place, need no namespace, and cross vaults freely: `[t](../other/x.md)` reaches the
file in whichever root holds it (`17.9`). Every way of writing a path reaches the file (`17.16`): relative out of the
root (`[t](../app/x.md)`, `[[../app/x]]`), from the home folder (`~/notes/x.md`), absolute (a leading `/` the vault's
root first, as on GitHub, then the filesystem's), and `file://` URLs, in markdown links and wikilinks alike; each
counts as a backlink and survives a rename in its own form. Backlinks cross vaults, taken from each vault's index,
as fresh as its last indexing (`17.11`). Vaults nested in one another are known to each other unopened, recorded when
a link or backlink needs them (`17.17`). Indexing is per vault, on demand and incremental: opening a vault refreshes
its index and those of the vaults it links into, only those.

**Why:** Links written by other editors and agents name files by their paths, not by vault names. Measured on 2,000
notes (5 MB, 10,000 links): 3.4 s the first time ever (in the background; the note shows at once), 17 ms on each
later open, 56 ms after one file changed, 12 ms for a note's backlinks.

## D49: Moves are detected by content, and kept as redirects (17.12, 2026-09-30)

> **Amended by D56 (2026-10-02):** a link to an old path no longer follows a redirect: it is broken until repaired,
> and the move is evidence for the repair (D63).

**Decision:** Moves are detected, not journalled. Each vault's index hashes file contents; on a refresh, a note gone
from one path whose text turns up at exactly one new path, and no other gone note had that text, was moved, whoever
moved it (slipbox, `mv`, git, a file manager). The watcher's removal and arrival pair up the same way, in either
order, within a minute. The vault keeps a redirect (`redirects.json`, in its state), and a link to the old path
follows it, chains included: it works, shows as moved, and offers to be rewritten, never rewritten silently.

**Why:** Content hashing also catches moves made outside slipbox. Only seeing the move teaches a redirect, so it is
state, not cache.

**Not chosen:** a rename journal, because move detection covers it and also catches moves made outside slipbox
(ideas.md § Links).

## D50: Following a link into another vault switches to it; the launcher (17.10, 17.14, 2026-09-30)

> **Superseded by VV-D7, VV-D5 (2026-10-14):** following a link into another vault opens a peek — its file read in
> place, read-only, going there a choice (`o`) — and never switches; the launcher is gone: started outside every vault,
> nothing opens over the explorer, and `space v v` lists the named folders from anywhere. Going into another vault is a
> choice: design/tui.md § Going into a vault, § The peek.
>
> **Amended by D79 (2026-10-05):** the launcher lists the named folders; picking one switches too.
>
> **Amended by D58 (2026-10-02):** `~` and `/` opened are listed a level at a time; a plain folder is opened as its
> own.

**Decision:** Following a link into another vault switches the TUI to it, its index refreshed; back returns
(`17.10`). Opening `~`, or a big folder that isn't a root, shows a launcher, the vaults this machine knows and a plain
file tree, rather than indexing everything under it (`17.14`). How switching works now: design/tui.md § Switching
roots.

**Why:** The TUI is always in one vault, with its config, index, watcher, positions and session. Opening `~` must not
index everything under it.

## D51: A vault shows its own icon in the explorer (17.13, 2026-09-30)

> **Amended by VV-D5, VV-D9 (2026-10-14):** the launcher is gone; a vault's row in the explorer keeps its icon, the
> current vault's highlighted, and a repository's branch (a worktree's after `⎇`) is among the row's marks at its right.
>
> **Amended by D77 (2026-10-05):** any root nested in the open one is shown so, by the name pointers use; a
> worktree by its branch (D54).

**Decision:** A folder that is a vault shows its own icon in the explorer and the launcher, a bookshelf in a folder's
colour, in each glyph set beside the folder icons. The vault's name follows the folder's, dimmed, when the two
differ: `docs  app-docs`.

**Why:** The tree then shows where `[[name]]` changes meaning, above all a vault nested in the open one, where the
open vault's links stop.

## D52: Renames fix links in every vault this machine reaches, after a preview (17.15, 2026-09-30)

> **Amended by D79 (2026-10-05):** the old name no longer goes to `previous_names` (`21.12`).
>
> **Amended by D63 (2026-10-02):** renames and moves work on paths: the files linking in, and the moved file's own
> relative links (`20.19`).

**Decision:** Renaming a note or a vault fixes the links in every vault this machine can reach, found through
backlinks, after a preview that lists every file in every vault, and warns when a vault's git tree already has
changes; this is where `7.1`–`7.3` land (D143). The old name goes to `previous_names`, which keeps links working in
places this machine can't reach; for notes, writing it into the frontmatter is a setting, on by default.

**Why:** This is the one time slipbox writes into another project, and only because you asked.

**Not chosen:** rewriting other vaults' files at rename time without asking: only with the preview (ideas.md §
Links).

## D53: Tags are Obsidian's (1.6, 2026-09-30)

**Decision:** A note's tags are its frontmatter's `tags:` and the `#tags` in its text, read as Obsidian reads them:
never in code, a URL, a wikilink or a heading's marker (a micromark extension, as wikilinks are). `/` nests, a
parent's notes including its children's; `#Dome` and `#dome` are one tag, shown as first written. The rules:
design/links.md § Tags.

**Why:** A vault's tags read the same in slipbox and in Obsidian.

## D54: A git worktree is a separate vault of the same repository (17.19, 2026-10-01)

> **Amended by D76 (2026-10-05):** each checkout's state is its path's; a `git worktree move` is found by git's name
> for the worktree and its admin folder's fingerprint, and its state carried.
>
> **Amended by D75 (2026-10-05):** `[[x:note]]` is gone; a pointer's name means the main checkout, and a branch is
> named as one (`slipbox://x@feat/note.md`).
>
> **Amended by D59 (2026-10-02):** a worktree is an instance of its own.

**Decision:** A linked worktree (`git worktree add`) is a separate vault of the same repository: the same id and
name, its own state and cache. Which checkout it is comes from the files under `.git` (a worktree's `.git` is a file
naming `.git/worktrees/<name>`, whose `commondir` is the repository's), never a git process and never where the
folder is. The main checkout's state is the id's, a worktree's `<id>-wt-<name>`, git's name for it, so moving the
folder keeps it. Identity is never written from a worktree: it takes the main checkout's. `[[x:note]]` from another
vault means the main checkout. Backlinks don't count a worktree's links. In a worktree, a relative path out of the
repository is taken from the main checkout. A worktree that's gone has its cache removed at once, its state a month
after it was last seen. Worktrees now: design/roots.md § Worktrees.

**Why:** Worktrees are an agent's task, each its own context: scratch, positions, session, indexes. Not "whichever
was opened first", which could hand the main checkout's state to an agent's worktree. Each worktree would write its
own id and name, and merging the branches would conflict over the vault's identity. The main checkout is the stable
one; the most recently opened would keep changing with an agent's CLI calls in a worktree. A worktree's notes are
copies of the main checkout's. `../y/plan.md` names the sibling repository beside the main one, wherever the worktree
is kept.

## D55: A folder is enough: scope, settings and identity apart (17.20–17.24, 2026-10-02)

> **Superseded by D80 (2026-10-06):** `--root` says where to start and where a note's name is looked for; a root
> nested in it stays one.
>
> **Superseded by D56 (2026-10-02):** the same day, before any of it was built: links are paths and vaults virtual,
> rather than a folder's scope deciding what a name means.

**Decision:** Revising D44 and D43: a vault bundled three things. **Scope:** the files a `[[name]]` is looked up
among, that search covers, the watcher follows and a rename updates. **Settings:** `.slipbox/config.toml`. **Identity:**
an id that keeps state across a move, and a name `[[name:note]]` reaches. Reading, editing, links, backlinks and search
need only the scope, so a folder is enough, and settings and identity are layers added on purpose. The scope: with
`--root DIR`, `DIR` exactly; a folder opened, the nearest `.slipbox/` at or above it, else the folder itself; a file,
the nearest `.slipbox/` above it, else its git checkout, else its folder; `~` and `/` never walked. The scope and why it
was chosen show in the file info and `slipbox info --json`. Every scope works alike, keyed by its real path, or by its
id when it has one (amending D45's keys). Opening a folder writes nothing into it; `slipbox init` writes the id and
name; the prompt to make a repository a vault goes.

**Why:** What makes links fast is the index, cached per scope, and it is the same however the scope was found. A link
means what its scope makes it mean, so an agent that needs a fixed answer passes `--root`.

## D56: Links are plain paths (20.2, 2026-10-02)

> **Amended by D71 (2026-10-05):** wikilinks are read again, within their root.
>
> **Amended by D70 (2026-10-05):** a leading `/` starts from the nearest root, then the filesystem.
>
> **Amended by D68 (2026-10-05):** every written form is read as a path inside; how a link is written is a
> convention, read and written at the edges.

**Decision:** Decided with the user over a long discussion, and revised the same day after a review. It supersedes
resolution by name (D41, D46), `[[vault:note]]` (D47), redirects as a way to resolve (D49) and D55. Links are
plain paths: relative to the file (the form slipbox writes), `~/…`, absolute, `file://` URLs; any valid path, another
repository, an external drive, `/tmp`. A leading `/` is the filesystem's root here, no longer the vault's first (D48);
in code and data files (`16.10`, `16.15`) it keeps meaning the vault's root, as a repository's own paths do. A link
resolves without the index: its target exists or it doesn't. A missing one is a broken link, and stays one until it is
repaired, never resolved quietly through a remembered move. Wikilinks (`[[…]]`) aren't read, plain text with no link,
backlink or rename, until a compatibility layer for Obsidian-style tools is designed; the converter rewrites them
(D57).

**Why:** The aim: open any file or folder and work, with nothing to set up, no vault to manage, no wondering whether a
link will resolve. Files are the truth: nothing derived or personal is written into the user's folders. What a link
points at is in the file, for slipbox, GitHub, other editors and agents alike. Portability, stated plainly: a
relative link within a repository works anywhere the repository is cloned; `~/…`, absolute paths and links between
repositories depend on how the machine is laid out.

## D57: A converter rewrites wikilinks as relative paths (20.1, 2026-10-02)

> **Amended by D79 (2026-10-05):** it reads `[[name:note]]` through the named folders' lookup (`21.12`).
>
> **Amended by D68 (2026-10-05):** it stays, opt-in (`slipbox convert-links`), for anyone who wants plain paths
> readable on GitHub; nothing asks to run it.

**Decision:** The converter, run once with the resolver of the time, rewrites each `[[…]]` as a relative path link,
its alias kept as the link text and its heading as a `#fragment` checked to exist (`[[plan#Aims|the aims]]` →
`[the aims](docs/plan.md#aims)`), and each markdown link starting with `/` as relative. Previewed before anything is
written; ambiguous links listed to pick, missing ones left and reported. A CLI command, with the same preview in the
TUI. It was built first (`20.1` before `20.2`), and keeps the old resolution as a legacy reader of its own. The
converter now: design/links.md § The converter.

**Why:** A link starting with `/` meant the vault's root before and would mean the filesystem's after (D56). The
converter needs the resolution that `20.2` and `20.22` remove from reading.

## D58: A file's vault is its nearest `.slipbox/` or git checkout; no home vault (20.3, 20.22, 2026-10-02)

> **Partly superseded by VV-D2, VV-D3 (2026-10-14):** there is a home again: `~` is a vault without a marker, its index
> built with a skip list, in slices; a folder or file outside home and every vault is Elsewhere's, one place for the
> machine with no index, never a plain folder walked and indexed as a vault. Vaults stay derived from what's on disk and
> never managed, and nothing is written into a folder by opening it. "Vault" is the word users read again (VV-D1).
>
> **Amended by D79 (2026-10-05):** "vault" is no longer a word the user meets: a root, or a named folder.
>
> **Amended by D69 (2026-10-05):** `.obsidian/` and `.zk/` mark roots too, and the markers are configurable.

**Decision:** Vaults are virtual: derived from what's on disk (`.git`, `.slipbox/`), shown on screen and in the CLI,
and never managed. A file's vault is its nearest boundary: walking up from the file, the first folder that holds
`.slipbox/` or is a git checkout's top. Both in one folder make one vault, its settings and name from `.slipbox/`; a
repository or a `.slipbox/` folder inside another vault is a vault of its own. An explicit vault (`.slipbox/`) gives a
folder a name and settings that travel with it through version control; a git vault needs nothing. Nothing is
written into a folder by opening it. There is no home vault (`20.22`): a plain folder the user opens still gets
everything a vault does (search, backlinks, a session, an explorer root) as an unnamed instance known by its path,
walked and indexed as a vault is, its state its own by its path (amending D39); `~` and `/` opened are listed a level
at a time (amending D50's launcher); the home vault's `config.toml` is no longer read. It supersedes D42, D43 and
D44, and with them D38's "no git-root fallback".

**Why:** The aim of D56: open any file or folder and work, with nothing to set up and no vault to manage.

## D59: Collections apart from instances (20.4, 20.5, 2026-10-02)

> **Superseded by D79 (2026-10-05):** collections and instances are gone; the `.slipbox/` id stays, to tell copies
> apart.
>
> **Superseded by D76 (2026-10-05):** personal state is kept by root's path, and a named folder's move is carried
> along without asking.

**Decision:** A *collection* is what a vault is: a `.slipbox/`'s id, or a repository, recognised by its remote or its
first commit, which is evidence that two folders hold the same thing, not an identity. An *instance* is one copy on
this machine (a clone, a worktree, an opened plain folder), with a local id slipbox gives it, recorded with its
location in the durable state (`vaults.json`). Personal state (reading positions, sessions) is the instance's. A
worktree (D54) is told apart by git's name for it, and is an instance of its own. A moved instance is recognised
from those records and confirmed, not guessed; today's state moves over once. A loose file's state, known by its
absolute path, starts fresh when moved. It supersedes the keys of D39 and D45.

**Why:** The index is a cache; history is state. What can't be rebuilt from disk (the instances slipbox knows, where
they were, the moves confirmed) is durable state.

## D60: Vault names are for display: the `vault:path` form (20.6, 20.12, 20.13, 20.20, 2026-10-02)

> **Superseded by D79 (2026-10-05):** the `vault:path` form is gone; another folder's file is named by its pointer.
>
> **Superseded by D77 (2026-10-05):** the screen shows what the file says, and files in lists by path.

**Decision:** Names are for display: as short as they can be and unique on this machine, usually the repository's or
the folder's name; a collision is qualified with `.` (`work.docs`, `home.docs`), never `/`; `:` separates a vault
from a path. A worktree shows the branch checked out in it now, `pathfinder@refactor`: the branch is display, the
worktree the identity. A name is never written into a file: `vault:path` is on screen, in completion and in the CLI
only. Rendered text shows a link without text in its vault form, `research:algorithms/dijkstra.md`, a link within its
own vault with no prefix, and a key shows the original paths (`20.12`). Completion offers the vault form and the full
path, and writes the right relative path (`20.13`). The CLI takes and gives `vault:path`, and `resolve` gives `href`,
the relative path to write (`20.20`).

**Why:** Links are plain paths (D56), so a name is never part of a link: it is display, for people on screen and
for agents in the CLI.

## D61: The index is a cache: on demand, in the background, shared by content (20.8–20.11, 2026-10-02)

> **Amended by D249 (2026-10-17):** opening a file reaches it only when it's git-ignored or under a hidden folder, as
> before; the TUI's `:e` now opens one the walk leaves out and never reaches (a busy folder's, `walk.exclude`'s, home's
> skip list's) as the explorer does, never indexed, where it said `no note or file`.
>
> **Amended by VV-D2, VV-D8 (2026-10-14):** home is a vault: the background index walks it first in each pass, a slice
> at a time, keeps the walk and builds home's index from it, then indexes the vaults in it; a busy folder is never
> walked, nor reached.
>
> **Clarified by D218 (2026-10-11):** the background index has no exclusions of its own and runs from the TUI;
> the parse cache's key holds no settings.
>
> **Verified (2026-10-03):** with the parse cache, a second copy is read about 150 times faster (`20.11`).
>
> **Amended by D76 (2026-10-05):** links are resolved, and backlinks derived, per root.

**Decision:** The index makes slipbox fast and gives backlinks; it never decides where a link points, and can be
deleted. On demand carries the load: the folder opened, indexed recursively and first; folders a followed link leads
into; paths an agent's CLI command names. Once indexed, a folder is remembered and refreshed when touched again
(`20.8`). A background auto-index of the home folder fills in the rest: walked slowly at low priority, paused while
the user or an agent is working, resumed where it stopped, and it can be turned off (`20.9`). Git-ignored files and
hidden folders aren't walked, but are indexed when reached. Freshness is checked, not assumed: sizes and modification
times compared, folders listed again; coverage is shown, and the CLI can refresh a path (`20.10`). Parsed content is
cached by content hash, parser version and the settings parsing depends on, so identical files share it across
worktrees and branches, while links are resolved per copy (`20.11`); it is a shared cache beside D39's. Backlinks are
derived, never stored in files. It widens D48's indexing per vault. The index now: design/roots.md § The index.

**Why:** Over time, backlinks from folders never opened appear by themselves. Indexing more only adds backlinks; it
never changes where a link points. A folder's own time doesn't change when a file in it is edited.

**Verify:** how much the shared cache saves on a branch switch or a new worktree: to be measured, not promised.

## D62: Settings deeper over broader; programs from the user's own config only (20.7, 2026-10-02)

**Decision:** Settings apply deeper over broader: the nearest `.slipbox/config.toml`, then outer ones, then
`~/.config/slipbox/config.toml`. A folder without `.slipbox/` takes the user's. A key that names a program to run (a
linter, an editor) comes from the user's own config only. The layers and keys: docs/manual/configuration.md.

**Why:** Cloning a repository never chooses what runs.

## D63: Generated edits are plans; repairs come from evidence, and are asked for (20.17–20.19, 2026-10-02)

> **Amended by D78 (2026-10-05):** after moves made elsewhere, the relink is offered once for each batch.

**Decision:** Nothing is rewritten silently: an edit to a file is shown and confirmed first. Every generated edit is
a plan: a preview tied to each file's content hash, refused when any of them has changed since; in the TUI an undo
step per file, files no window shows saved; in the CLI planned and applied as two explicit steps (`20.18`). Changes
made elsewhere (an editor, an agent, git, a file manager) the index repairs by itself; a move found by content hash or
by git's renames is evidence for a fix. A repair that needs files edited is asked for: each broken link with the
target found, fixed in one step; a moved vault's from what the state knows (`20.17`). A rename or move in slipbox
rewrites exactly the files linking in, found by backlinks, and the moved file's own relative links (`20.19`); links
from places not indexed yet show broken once indexed, and the same repair applies. They reuse the rename and move
engine (`7.1`–`7.3`, D49, D52) on paths. Repairs now: design/links.md § Repairs.

**Why:** A stale plan is never applied. In the CLI, an agent reviews before it writes.

## D64: Search ranks the current vault, then the linked ones (20.16, 2026-10-02)

> **Amended by VV-D2, VV-D3, VV-D7 (2026-10-14):** home is searched as a vault; Elsewhere has no index, so no search,
> said so; another vault's hit opens a peek.
>
> **Clarified by D214 (2026-10-11):** the widest scope is every root the machine knows, caught up on demand.
>
> **Amended by D79 (2026-10-05):** the first scope is `here`: the root, else the folder opened (`21.10`).

**Decision:** Search is ranked by how near a vault is, by links: the current vault (or the plain folder opened), then
the vaults linked to or from it, under a divider, then everything indexed, only when widened with a key. The CLI takes
`--scope vault|linked|all`, `vault` by default.

**Why:** An agent's results are predictable.

## D65: The status line names the vault and its branch; the explorer has roots (20.14, 20.15, 2026-10-02)

> **Partly superseded by VV-D5 (2026-10-14):** the explorer is one tree, its view a part of it, a breadcrumb above it:
> no roots beside the tree, none pinned, none added by following a link. The status line still names the vault and its
> branch.
>
> **Amended by D77 (2026-10-05):** a root is shown by its name, else its path, else the folder opened.

**Decision:** The status line shows the vault and its branch, `pathfinder · main`; a worktree, `pathfinder@refactor`
(`20.14`). The explorer has roots: the vault or folder opened; a vault a link was followed into, added beside it
rather than replacing the tree; worktrees under their repository's root. Roots never overlap: a broader one takes in
a narrower one, its folders kept open; a narrower one is never added, the tree revealing the file; a vault inside a
root is a folder with a vault icon. A root added by following a link goes when the last file open from it closes,
unless pinned; the main root and pinned ones are kept with the session (`20.15`). The explorer now: design/tui.md §
Side panes.

**Why:** A file shows once.

## D66: The merge review checks the links a merge would break (20.21, 2026-10-02)

**Decision:** Git adds to vaults; it doesn't bound them. Before a merge, git's own tentative result (`git merge-tree`,
without touching the working tree) is checked for the links it would break ("`refactor` moves `docs/plan.md`; `main`
added a link to it in `docs/b.md`"): in review for people, from the CLI for agents. After a merge or a pull, git's
renames between the old and the new `HEAD` are evidence, kept for that checkout and that change, and each link broken
by it that points at a renamed file is shown as "moved to …" with the fix. Hooks are opt-in. A branch switch is one
event (D153). The review now: design/links.md § The merge review.

**Why:** Git can't see this itself: the branches changed different files, so it merges cleanly. The usual setup is
an agent working in its own worktree on its own branch, and the user reviewing its changes in slipbox, their effect on
links included, before merging.

**Not chosen:** a `post-merge` hook running the fix by default: it is the user's to install (ideas.md § Links).

## D67: The LSP face is removed (20.23, 2026-10-02)

**Decision:** The LSP face goes: `slipbox lsp`, serving notes to other apps (D168), with `src/lsp/`, `[lsp] lint`
and the nvim setup; the protocol library's server half becomes a dev dependency (D170). The client stays: language
servers for code in the TUI (`19.x`); a markdown server can be added in the config. It was removed first among the
`20.x` removals.

**Why:** With paths, editors' own markdown servers follow links and find references, a move made in an editor is
repaired from the watcher, and agents have the CLI. The LSP face read wikilinks throughout, and removing it first
spared rewriting its tests only to delete them.

## D68: Inside, a link is a path; conventions are read and written at the edges (21.x, 2026-10-05)

**Decision:** Proposed with the user on 2026-10-05, after comparing how other tools handle links, and reviewed with the
user section by section the same day; built 2026-10-06 and 07. It revises the plain-path model (D56, D58, D59,
D60): the plain-path core stays; the vault stops being a concept the user meets (D79); other tools' link
conventions, wikilinks included, are read and written at the edges; links between separate folders gain a pointer that
survives a different layout on another machine (D73). Every link, whatever its written form, is read as a file and a
fragment (`#heading`, `#^block`); the index, backlinks, renames, repairs, the merge review and plans see nothing else.
Each written form has a reader and, but for `~/`, a writer: a path relative to the file (written by default), `/…` from
the nearest root, an extensionless path, a folder, a wikilink, `file://`, `~/`, a `slipbox://` pointer. The converter
stays, opt-in (D57). Its principles: files are the truth; inside, a link is a path; follow the folder's convention,
ours only where nothing does; open any folder or file and work; names come from indicators, never from a folder's name;
the index is a cache, and personal state is personal, kept by path; nothing is rewritten silently. The model:
design/links.md and design/roots.md.

**Why:** The survey of other tools (research/link-conventions.md): every tool has a root, which gives a root-relative
link its meaning; linking by name breaks in known ways, which paths avoid, but wikilinks stay common, so reading them
matters; no tool updates links after a move made outside it, and none links across vaults with backlinks; a relative
link between separate repositories works while the folders are laid out alike, and for no one when they aren't.

## D69: Roots come from markers (21.1, 2026-10-05)

> **Partly superseded by VV-D2 (2026-10-14):** `$HOME` is a vault, home, without a marker, whatever it holds (never a
> marked one); `/` still never is. Markers make vaults, as here, "root" read as vault (VV-D1).

**Decision:** A root is the nearest folder above a file holding a marker: `.git`, `.slipbox/`, `.obsidian/` or
`.zk/`, the list configurable in the user's own config (`root_markers`). `$HOME` and `/` never are. A root is never a
concept the user manages, and none is needed, since a folder without one works; but where one exists slipbox uses it:
what is indexed and searched first (the whole root, not only the subfolder opened); what `/` is measured from, and
which notes a wikilink's name can match; whose convention a file follows; whether two files travel together; what a
named folder is; its settings, when it holds a `.slipbox/config.toml`. One file has one root, however it is opened
(D80); a marker inside another root starts one of its own, and the outer root's walk stops there (D40). It revises
D58, whose boundaries were `.slipbox/` and a git checkout. Roots now: design/roots.md § Roots and markers.

**Why:** Every tool has a root, and the root gives a root-relative link its meaning (research/link-conventions.md).
`/`, wikilinks and conventions each read a root, so roots came first among the `21.x` items.

## D70: A leading `/` means the nearest root, then the filesystem (21.2, 2026-10-05)

**Decision:** A link starting with `/` is read from the nearest root; if nothing is there, it is the filesystem's
path. A plain folder has no root: there `/` is the filesystem's alone. It reverses D56's filesystem reading, and
returns to D48's.

**Why:** Every tool surveyed gives `/` a root's meaning, and none the filesystem's: `20.2`'s choice had no precedent
(research/link-conventions.md).

## D71: Wikilinks are read again, within their root (21.3, 2026-10-05)

**Decision:** A wikilink is read within its root: a note's name (its file's), or a path; aliases from front matter; an
attachment by its name, as Obsidian finds one; `#heading` and `#^block`. Two notes of one name: the nearest the linking
note, then the shortest path; a real tie is ambiguous, picked when followed, never guessed. With no root above it, a
wikilink resolves to nothing, with a hint. Previous names (D46), `[[vault:note]]` and remembered moves aren't read: no
other tool writes them, and only the converter reads them. It revises D56's wikilinks as text and D58's removal of
resolving by name (`20.22`); the rules are D41's. The rules now: design/links.md § Wikilinks.

**Why:** Wikilinks stay common, so reading them matters (research/link-conventions.md). Names need a scope, and only a
root gives one.

## D72: Each root's link convention is followed (21.4, 2026-10-05)

> **Verified (2026-10-06):** Obsidian's `.obsidian/app.json` (`useMarkdownLinks`, `newLinkFormat`) and zk's
> `.zk/config.toml` (`link-format`, `link-drop-extension`) were read, and what they showed decided D82.
>
> **Detailed by D82 (2026-10-06):** the style is found first, a tool's path and extension as it writes that style;
> a markdown link is never by name.

**Decision:** The convention a file writes in is the first that says: the user's setting (`[links]` in a
`.slipbox/config.toml` or the user's config); the setting of the tool that owns the root (`.obsidian/app.json`,
`.zk/config.toml`); what the root's notes already do, when one form clearly dominates (two-thirds or more of its links
within the root); else ours. A convention has three parts, style (markdown or wiki), path (relative, from the root,
or by name) and extension (kept or dropped), each found the same way. One convention per root: every note in a root
writes the same way, whichever note the link is made in. A folder with no root has the user's setting, else ours. A
root mixing forms, with none at two-thirds, gets ours unless the user sets one. Renames keep each link's form; the
convention decides only the links slipbox makes. `slipbox info` and the TUI's file info say which applies and where
it came from. Conventions now: design/links.md § Conventions.

**Why:** Follow the folder's convention: what its tool or its notes already do; ours only where nothing does.

**Verify:** the exact keys of Obsidian's and zk's link settings, before building.

## D73: Between folders: the convention, a pointer, else a relative path (21.6, 21.7, 2026-10-05)

**Decision:** A link from one file to another is written in this order: in the file's convention when the two
travel together, that is when one clone, or one folder moved as a whole, carries both (the same repository; a
repository and a submodule it records; outside git, one folder inside the other); as a pointer,
`slipbox://<name>/<path from its root>#fragment`, when the target is in a named folder (D74, D75); otherwise as a
relative path, which works while the folders are laid out alike. Relative links between folders that don't travel
together are read as they are; the relink offers each one's pointer when its target is in a named folder. The rule
now: design/links.md § Between folders.

**Why:** A relative link between separate repositories works for slipbox, editors, the shell and agents while the
folders are laid out alike, and for no one when they aren't. Relinking it to fit each machine's layout would fight
itself across machines: a repository shared by two machines with different layouts gets "fixed" back and forth. A
name doesn't.

**Not chosen:** relinking links between separate repositories to fit each machine's layout (ideas.md § Links).

## D74: Named folders are named by what travels with them (21.6, 2026-10-05)

**Decision:** A repository is named by its remote: short (`research`), or qualified (`github.com/me/research`) when two
different repositories share the short one. A folder is named by the name in its `.slipbox/` (`slipbox init --name
notes`), written into its config and carried with it; a repository with both is named by the `.slipbox/` one, its remote
kept as its qualified name. Never by a folder's own name, nor by a copy's path. A root with neither (`.obsidian/` or
`.zk/` alone) is unnamed, linked by relative path. Copies of one folder are told from different folders of one name by
the remote, or by the `.slipbox/` id. The `.slipbox/` name and id are written only by `slipbox init --name` and `slipbox
name`, which the user runs, never on their own into a `.slipbox/` made by hand, as D44 did on first open. A name's
default copy is the first found; when a second appears, slipbox asks once which one links open, and remembers. A name
for one copy only is a private `.slipbox/`, kept out of git. A clash between different folders asks to rename one when
it matters; `slipbox init` refuses a name this machine knows. A folder renamed keeps its old name in its config. Where
each name lives is a durable lookup in the state folder. Named folders now: design/roots.md § Named folders.

**Why:** A name has to travel with what it names, since the file holding a pointer goes to other machines; neither a
folder's own name nor a copy's path travels. A `.slipbox/` name was chosen, and is committed with the folder. The id
tells a copy of the folder from a different folder of the same name.

## D75: `slipbox://` pointers name a folder, or a folder at a branch, never a copy (21.7, 2026-10-05)

**Decision:** A pointer, `slipbox://<name>[@branch]/<path>#fragment`, names what travels: a named folder, opened at this
machine's default copy, or a repository at a branch (`slipbox://research@refactor/x.md`: the copy with that branch
checked out, else the file as it is on that branch, read-only, from git). A worktree's name means its main checkout
(D54). A pointer to a name not on this machine yet says so. Agents resolve a pointer as any link: `slipbox resolve
slipbox://notes/inbox.md` gives the path. Renames keep a pointer a pointer. It replaces `[[vault:note]]` (D47) and the
`vault:path` form (D60) between folders. Pointers now: design/links.md § Pointers.

**Why:** Branches travel; copies don't. A named folder moved or renamed on disk needs no link edited: pointers name
it, and the lookup finds it again.

## D76: Personal state by root's path, positions by file (21.8, 2026-10-05)

> **Partly superseded by VV-D3 (2026-10-14):** outside home and every vault, state is Elsewhere's, one key (`elsewhere`)
> for the machine, not the folder opened's; home's is kept by its path, as a vault's.

**Decision:** Personal state (reading positions, sessions, the scratch, the trash, undo, moves seen) is kept in
`$XDG_STATE_HOME/slipbox/`, keyed by path: positions by file; the rest by root, else by the folder opened. A named
folder moved by hand takes its state along when the lookup sees it: the same remote or `.slipbox/` id at a new path,
nothing left at the old one, and exactly one such copy; that isn't a guess, so nothing is asked; otherwise the folder
starts fresh. A worktree moved by `git worktree move` is found by git's name for it and its admin folder's fingerprint
(D54). Links are resolved, and backlinks derived, per root (D61). Built 2026-10-07: `roots.json`, by path, replaces
the instances' `vaults.json`, and state, cache and positions move to it once. It supersedes the keys of D45 and D59.
State now: design/roots.md § State by root and design/how-it-works.md § Storage.

**Why:** Personal state is personal: kept in the state folder, by path. Opening `project/` or `project/docs/` brings
back the same session, since both have the root `project/`; a worktree, another path, has its own.

**Cost:** An unnamed root moved by hand starts fresh: nothing names it to be found again by. Naming it (`slipbox
name`) is the remedy.

## D77: The screen shows what the file says (21.9, 2026-10-05)

> **Partly superseded by VV-D5 (2026-10-14):** the explorer shows what's opened as a view of one tree, a breadcrumb
> above it, not the root of what's opened with a folder followed into beside it. Home is shown as `~` and no-vault as
> `Elsewhere` (VV-D2, VV-D3).

**Decision:** A wikilink is shown as one, a path as a path, a pointer as a pointer; rendered text shows a link's text,
and a link without text its target as written. No form is invented for the screen. Files in lists (backlinks, search
results, pickers, hover) are shown by path: from the root (else the folder opened), else `~/…`, else absolute. The
status line shows where the file is: its root's name if it has one, else the root's path, else the folder opened, with a
repository's branch after it (`research · main`, `~/src/experiment · main`); a worktree, `research@refactor`. The
explorer shows the root of what's opened, else the folder opened, and a folder a link was followed into beside it; roots
never overlap. A root's name is the one pointers use, or none: never its folder's own; a nested root's row (D51) shows
that name. It supersedes D60 and amends D65. The screen: design/tui.md § Screen layout and § Side panes.

**Why:** Names come from indicators, never from a folder's name; the `vault:path` form goes with the vaults (D79).

## D78: The relink is offered after moves made elsewhere; old forms are flagged (21.11, 2026-10-05)

**Decision:** A move made elsewhere (an editor, a file manager, git) breaks path links, as it should. A content hash, or
git's renames after a merge or a pull, are evidence: the link says "moved to …", and slipbox offers the relink once for
each batch of moves, amending D63's repairs. A link naming a folder the old way (`[[research:x]]`, `research:x.md`)
isn't a link when no note or URL answers to it: it is flagged, and the fix writes the pointer. Copies meant for a note
give a link, never a label. Repairs now: design/links.md § Repairs.

**Why:** A move never resolves a link (D56), and only relative links between folders that don't travel together
break when a named folder moves; the relink offers their pointers.

## D79: Vaults stop being a concept: folders, not vaults (21.10, 21.12, 2026-10-05)

> **Partly superseded by VV-D1, VV-D5 (2026-10-14):** "vault" is the word users read again, for every folder with a
> marker, with home and Elsewhere beside them; root stays only in the names agents, scripts and configs rely on
> (`--root`, the JSON's `root`, `[trust] roots`…). The launcher is gone. Named folders, pointers and the commands stand.

**Decision:** The user meets folders, not vaults; "root" is a word of the design documents, and "named folder" of
`slipbox://`'s. Gone (`21.12`, built 2026-10-06 and 07): vaults as a concept; collections and instances (D59),
the `.slipbox/` id staying to tell copies apart; display names and the `vault:path` form (D60); the move question
(`vault-moved`); `previous_names` written on rename (D46, D52); an id written into a hand-made `.slipbox/` on first
open (D44). The words (`21.10`): `slipbox folders` and `folders default`, `slipbox name`, `slipbox init [--name]`,
`slipbox deinit`; `root` (a path) and `name` in the JSON; note arguments take `slipbox://` pointers;
`--scope here|linked|all` (amending D64). "Vault" is no longer a word the user meets (D58): a root, or a named
folder. The launcher lists the named folders (D50). The converter reads `[[name:note]]` through the named folders'
lookup (D57). Taking `.slipbox/` away changes roots, never links: relative links reach what they did. The commands:
docs/manual/cli.md.

**Why:** Open any folder or file and work: no vault to make, name or manage.

## D80: A file's root is its nearest, however it is opened (21.1, 2026-10-06)

> **Clarified by VV-D2 (2026-10-14):** `--root ~` opens home, a vault without a marker, and a file of a vault in it is
> that vault's. VV-D2 names this entry among those whose "`$HOME` is never a root" it supersedes, but this entry never
> said it (D69 did): it stands.

**Decision:** `--root` says where to start and where a note's name is looked for; a root nested in it stays one, in
the CLI as in the TUI. It supersedes D55's "`--root DIR`: `DIR`, exactly".

**Why:** One file has one root, however it is opened (D69).

## D81: A link to a folder resolves, and reveals it (21.2, 2026-10-06)

**Decision:** A link to a folder (`[t](docs/)`) resolves and is never broken: followed, the folder is revealed in the
explorer, unfolded and focused; a move of the folder rewrites it. A path without an extension is the file as
written, else its note (`plan` → `plan.md`), else a folder. Renames keep each form: `/…` from the root, no extension,
a folder's trailing `/`.

**Why:** Every written form has a reader (D68): zk, mkdnflow and Typora write extensionless paths, and a folder is a
path too.

## D82: A markdown link is never by name; a tool's settings read as it writes (21.4, 2026-10-06)

**Decision:** Built with what the tools' own settings showed. Obsidian's extension follows the style: a wikilink
drops `.md`, a markdown link keeps it. zk writes a markdown link from the note and a wikilink from the notebook's top
(its source, not its docs' `{{path}}`), a custom template saying nothing. The style is found first, and the path and
extension within it: a tool's as it writes that style, the notes' among their links of that style. A markdown link is
never by name, since slipbox reads it as a path (D68): Obsidian's default "shortest" says nothing of one, and the
next source answers. Two-thirds exactly (6 of 9) is a majority. It details D72.

**Why:** What the tools' own settings showed when read (D72's Verify).

## D83: A link slipbox writes never lands elsewhere (21.5, 2026-10-06)

> **Clarified by D217 (2026-10-11):** a renamed name falls back to a path whenever another note has the name.

**Decision:** Completion (`](` and `[[`), the link picker (`space l i`) and `slipbox link`, which prints one for an
agent, all write links through `core/write-link.ts`. A wikilink is a name only where the name reaches the note from
the linking file; else its path from the root, a top-level note's path being its name, or a relative path
(`../plan`): never a name that would land elsewhere. A relative wikilink starts `./` or `../`, so it is never read as
a name. The scratch's captures are `path:line` references in code spans, not links, so the convention leaves them be.
A rename keeps each link's form, a name falling back to a path when the new name would be ambiguous. Links written
now: design/links.md § Links slipbox writes.

**Why:** A link slipbox writes must reach the note it was written for. Agents read `path:line` references as they
are.

## D84: One matcher decides where a fragment lands (2026-10-06)

**Decision:** One matcher (`core/landing.ts`) for the follow, the hover, the link check and the CLI. Explicit ids
first (`{#id}`, `<a id>`, `<a name>`); then a markdown link takes GitHub's slug, repeats numbered (`#setup-1`), and a
wikilink the heading's text, as Obsidian reads it; of several, the first, and the link check says so
(`ambiguous-heading`); a path of headings (`Install#Linux`), each inside the one before. Lines: `L42`, `L42-L50`,
`L42C5-L45C10`. A `^id` in fenced code is code. Slugs keep marks, as GitHub's do. Names fold the Turkish i's (D41).
Landing now: design/links.md § Where a link lands.

**Why:** From trailscout's review of slipbox's link resolution, each point checked against the code. Each form lands
as the tool that writes it reads it: GitHub's slugs for a markdown link, Obsidian's heading text for a wikilink. Slugs
that keep marks make a converted link to a Devanagari heading work on GitHub too.

## D85: Links in front matter are links (2026-10-06)

**Decision:** Links in front matter, as Obsidian's properties have them (`related: "[[Plan]]"`), are links: read
where written (one in a comment isn't), backlinked, renamed in place, drawn as links in the properties block, checked.
Front-matter links now: design/links.md § Links in front matter.

**Why:** From trailscout's review: Obsidian's properties hold links this way.

## D86: How each link landed is said; a fragile tie is linted (2026-10-06)

**Decision:** How every link landed is said (`links.ts` `Landed`, `graph.ts` `certainty`): by its path, a path's end,
a unique name, an alias, or a tie broken. A tie broken by where the link is (the deepest shared folder, the shortest
path) is **fragile**: linted with the path that names its note for sure, offered as a code action. A note coming or
going that moves a link by name (a namesake, a name an alias had) is said, in the TUI and as the CLI's warning, not
only a link that breaks or heals. Details: design/links.md § How a link landed.

**Why:** From trailscout's review. Linking by name breaks in known ways, among them a link silently re-pointed at a
newly made note of the same name (research/link-conventions.md); here a link moved by name is said.

## D87: A link to the repository's own hosting is the file in this copy (2026-10-06)

**Decision:** A link to the repository's own hosting (`https://github.com/me/repo/blob/main/x.md`, GitLab's,
Bitbucket's, its page, `#readme`) is the file in this copy, of this checkout's remote or a named folder's: a backlink,
rewritten in place by a rename. Another ref than the branch here is inferred, and said (`core/hosting.ts`). Details:
design/links.md § Links to the repository's own hosting.

**Why:** From trailscout's review: a README's link to its own file on GitHub was a URL, never a backlink.

## D216: A wikilink leaves its root only by `./` or `../` (21.3, 2026-10-11)

**Decision:** A wikilink is read within its root (D71); it reaches outside the root only as a relative path starting
`./` or `../`. `~/`, absolute paths and `file://` URLs are markdown links' forms: written in a wikilink they stay
unresolved. Only the converter's legacy reader takes every form (D57). As built: design/links.md § Wikilinks.
Recorded on 2026-10-11 from the code (`graph.ts`, `resolveWiki`).

**Why:** Not recorded where it was built. A wikilink's text is first a name, looked up in its root (D71); `./` and
`../` are what mark one as a path instead (D83).

## D217: A rename writes a path wherever another note has the name (21.5, 2026-10-11)

**Decision:** A rename keeps each link's form, but a link written as a name becomes a path when any other note in the
root has the new name, or when the note leaves the root: never a name that only a tie-break would land (D86). As
built: design/links.md § Renames and moves. Recorded on 2026-10-11 from the code.

**Why:** A name that lands only by where the link is (the deepest shared folder, the shortest path) is fragile, and
D86 lints it; a rename shouldn't write what the linter then flags.

## D218: The background index skips what the walk skips; the parse cache keys no settings (20.9, 20.11, 2026-10-11)

> **Amended by VV-D2 (2026-10-14):** home's walk has a list of its own, a skip list in place of `.gitignore` (hidden and
> system folders, `Downloads`, the busy folders, files not notes or text), and the background index leaves out what it
> leaves out.

**Decision:** The background index of the home folder has no list of exclusions of its own: it leaves out what the
walk leaves out (D40). It runs from the TUI's idle check; a CLI call only marks the activity that pauses it. The
parse cache is keyed by the text's hash, its format and the parser's version, and nothing else: parsing reads no
settings. As built: design/roots.md § The index. Recorded on 2026-10-11 from the code (`autoindex.ts`,
`parsecache.ts`).

**Why:** Not recorded where it was built; D61's "what the user excludes" and "the settings parsing depends on" named
nothing that exists.

## D219: Files a folder controls are read with care (0.11, 2026-09-29)

**Decision:** Every read of a file a folder controls (a note, `.gitignore`, `.slipbox/config.toml`,
`.slipbox/version`) opens without blocking and refuses anything but a regular file, and the small files have a size
cap (1 MB): `readRegular` in `core/fsutil.ts`. As built: design/roots.md § The walk. Recorded on 2026-10-11: the old
decision record held it under `0.11`, which D40 left out.

**Why:** A cloned or unpacked folder can hold a symlink to `/dev/zero`, or a FIFO, where a note or a config should
be; a read of it would hang or never end. A hostile folder gets a warning, never a hang (6eb3b31, 2026-09-29).

## D237: A busy folder is one that looks generated (0.11, 2026-10-17)

> **Clarified by D240 (2026-10-17):** a busy name matches in its own case only (`Build` is a folder like any); a
> cache's name, in any case.

**Decision:** A folder with a busy name (`node_modules`, `.venv`, `venv`, `__pycache__`, `target`, `build`, `dist`,
`.next`, `vendor`, `Pods`, `DerivedData`, `.gradle`, `.tox`, a cache) is busy only when it looks generated: its
repository's `.gitignore` ignores it, or it holds no note directly in it (a file of a note's extension at its top; its
folders don't count). A notes folder called `build`, not ignored, with notes in it, is an ordinary folder: walked,
indexed and written. One function decides it everywhere the name was decided alone: the walk's filter, a vault's and
home's (home reads no `.gitignore`, so there only the notes count), the guards on a new note, a move and a copy, the
explorer's marks, the repositories in the view and the merge review. `node_modules` leaves the always-skipped list
for it. Whether a folder is ignored is read as the walk reads `.gitignore`, never with a `git check-ignore` per
folder; whether it holds a note costs one listing of it, kept for the walk and read again once the folder changed. A
note written at a busy name's top that isn't ignored makes it a notes folder, so the guards allow it; a note deeper in
a generated-looking one, or in an ignored one, is still refused. A folder that changes kind is taken in, or left
out, when the watcher next lists its parent or the vault is walked again. Amends VV-D8 and D40; D61 is unchanged: a
folder `.gitignore` alone leaves out is still reached, an ignored busy-named one is busy. As built: design/roots.md
§ The walk.

**Why:** The maintainer's choice of 2026-10-17, for the question VV-D8 left open in notes vaults (ideas.md § Roots and
vaults): an Obsidian vault or a `.slipbox/` folder can keep its notes in a folder called `build` or `vendor`, which
VV-D8 never indexed, nor could a setting bring back. What a tool makes is ignored by the repository, or has no note
at its top; a person's notes folder is neither. The vault's kind can't tell them apart: slipbox's own repository has
both `.git` and `.slipbox/`, and many Obsidian vaults are repositories.

**Cost:** A busy-named folder's top is listed once per walk, and asked again (a stat) when the explorer or a guard
asks. A note dropped at the top of a generated folder that isn't ignored (a `target/` outside any repository) makes
the walk take in all it holds. A busy folder isn't watched, so a note added inside one is seen only when its parent
changes or the vault is walked again.

**Not chosen:** the busy names only in code repositories, by the vault's markers; a setting or an allow-list
(`walk.busy`, `walk.include`); `git check-ignore` per folder (a process per folder, and outside a repository nothing to
ask). ideas.md § Roots and vaults.

## D240: Busy names in their own case alone (0.11, 2026-10-17)

**Decision:** A busy folder's name (D237's list) matches only as tools write it: `node_modules`, `build`, `target`,
`Pods`, `DerivedData`. `Build` or `Node_Modules` is a folder like any, walked and indexed. A cache's name (`cache`,
`.cache`, `Caches`, `pip-cache`) still matches in any case. On a disk that ignores case, as macOS's do, the name is
compared as the folder has it. Clarifies D237. As built: `isBusyName` (`src/core/walk.ts`); design/roots.md § The walk.

**Why:** The maintainer's choice, 2026-10-17, for the question D237 left open. Tools write these names in one case,
so a capitalised one is more likely a person's folder of notes, which a busy name would leave out.

**Not chosen:** every busy name in any case: a `Build/` of notes would be left out where nothing generated it.

## D244: The explorer's `⊘` says why, on the status line and in Info (2026-10-17)

**Decision:** A row marked `⊘` (not indexed, VV-D9) stays as it is. With the explorer's cursor on it, the status line
says why, in words a user knows (`⊘ not indexed: generated (node_modules), git-ignored`), and stops when the cursor
moves off; the Info view says it of the file on screen (`index`), its own row's reason or its folder's. The words come
from the rule that marked the row, never a second guess: a busy folder says which of D237's two things hold —
`generated (node_modules)` for no note at its top, `git-ignored` for ignored, both when both hold — and a folder in it
names the busy one; what `.gitignore` or `walk.exclude` leaves out, home's skip list (`hidden`, `home's Downloads`, a
system folder), another disk, a link not followed or whose disk isn't answering (VV-D6), a note over
`walk.max_file_size`, a folder past home's cap, each its own. Details VV-D9. As built: `Marks.why` and `Marks.whyAt`
(`src/tui/marks.ts`), `busyWhy` (`src/core/walk.ts`); design/tui.md § Side panes.

**Why:** The maintainer's choice, 2026-10-17 (#138): every `⊘` looked the same whatever the reason, and a row has no
width to spare for one. The cursor on a row is the question; the status line is where slipbox already says what's
under the cursor (a link and its status).

**Not chosen:** the reason on the row, after its name (no width; it would push out what describes the row); a
different glyph per reason (one column each, and the user would have to learn them all).

## D246: A note written where walk.exclude leaves it out is written, and said not indexed (0.11, 2026-10-17)

**Decision:** A note made, saved, moved, copied, exported as Markdown or captured into the scratch where `walk.exclude`
leaves it out — the path or a folder on its way named by it, no root nested on the way — is written, never refused,
and the message the write gives anyway ends with `(not indexed: walk.exclude)` after the path it names: `created
drafts/x.md (not indexed: walk.exclude)`, `saved …`, `autosaved …`, a move's, a copy's, a Markdown export's. It is said
at every write of the note, never as a message of its own. The explorer's `⊘` row of such a folder takes a new note,
a new folder or a paste as a typed path into it does, said so; the rows of a busy folder, a `.gitignore`'s, home's skip
list or a vault there are refused as before. On the command line, `write`, `mv`, `cp` and `export` end
their line so and add `notIndexed` to their JSON; `capture` and `mkdir`, whose human output is a bare path, say it as
a warning. One function decides it (`WalkFilter.notIndexed`), asked of the walk's settings, not the index. As built:
design/roots.md § The walk.

**Why:** The maintainer's choice of 2026-10-17 (#139): the setting is the user's own, and a busy folder's top takes a
note too (D237), so nothing is refused; but a note saved where nothing will find it, with nothing said, looks indexed
until a search misses it. Every save already says `saved`, so the words ride on that message and add none; said on the
first save alone, the next save's `saved drafts/x.md` would read as indexed, and the first after a restart would say it
again anyway.

**Cost:** A save's message is longer for such a note, every time. The walk's patterns are matched once per folder on
the way at each write, and a root nested on the way costs a look for its markers.

**Not chosen:** refusing the write, as a busy folder's is (the setting is yours), in the explorer too, where a typed
path was already allowed; saying it once per note or per session
(a state to keep, and a save that reads as indexed); a message of its own after the write (the status line shows the
last message, and the save's would hide it); text added to a bare-path output (`capture`, `mkdir`), which scripts read.

## D248: A folder of home opened by name is whole, and counts against home's cap (2026-10-17)

**Decision:** A folder of home asked for by name (`slipbox ~/notes`, a note of it opened, a way into it from another
vault) is walked whole, whatever it holds: no cap of notes or folders of its own. Its notes count against home's cap
of 10,000, and the cap never leaves one of them out: home's other notes make room, the deepest left out first, as
home's own walk leaves them. Home's walk, made before or after, so keeps as many fewer of its own as the folder holds.
A folder that alone holds more than the cap is whole all the same: home holds its notes and none of its own. A note
that comes into it while home is open is taken in, home's deepest other note leaving for it. When the cap is reached,
its message says so in its usual words, and adds that the folder opened is whole. Details VV-D2. As built:
`homeWalk` (`src/core/home.ts`); design/roots.md § Home.

**Why:** The maintainer's choice, 2026-10-17, for a bug (#122): the folder opened was walked and capped on its own,
then merged, so a full home went past its cap (10,005 notes). The folder opened is the one being worked in, so it is
the last to leave out; home's deepest notes are the ones the cap leaves out already.

**Cost:** Past the cap, the folder opened is walked whole each time home's graph is built, until home's walk covers
it. A very large folder opened by name holds that many notes, as a vault of that size would.

**Not chosen:** the folder opened capped with home, its own deepest notes left out; the docs saying the folder opened
is an exception to the cap, home's index going past it.

## D249: `:e` opens a file the walk leaves out as the explorer does, never indexed (20.8, 2026-10-17)

**Decision:** `:e <path>` (`note.open`) on a file that is there but that the vault's walk leaves out and opening never
reaches — in a busy folder (D237), what `walk.exclude` leaves out, `.git` or `.slipbox`, a vault nested in this one
and, in home, what its skip list leaves out — opens it as the explorer opens its row: by the row's path
(`Explorer.rowPath`), through `App.open`, the same call, so the two can't drift. The file is on screen, polled while
it's open, and never indexed: the notes, the files and the backlinks stay as they were. A nested vault's file goes
into that vault, as its row does. Its path from the vault's top and its whole path inside the vault both work. Only a
hidden or git-ignored file is made the vault's by being opened (D61), as before; a file through a link not followed
still asks first (VV-D6); a path that isn't there still says `no note or file`. Info says why it isn't indexed (D244):
from its row in the explorer, or, for a file no row lists — under a hidden folder, `.git` or home's `.config` — from
the walk's reason for its path, the words its row would have. As built: `note.open` (`src/tui/actions-files.ts`),
`Marks.whyAt` (`src/tui/marks.ts`); design/tui.md § Files beyond notes, design/roots.md § The walk.

**Why:** The maintainer's choice, 2026-10-17 (#152): `:e` said `no note or file` of a file that is there, which the
explorer opens from its `⊘` row and the design said opens when named. Opening it is looking; whether it's indexed is
the walk's settings' to say, and opening it doesn't overrule them.

**Cost:** Info asks the walk's filter of a file no row lists each time it's drawn: a few pattern matches and a `stat`.

**Not chosen:** indexing it once opened, as a git-ignored file is (a look would overrule `walk.exclude` and the busy
folders' rule); a second path for `:e` beside the explorer's, which could open it differently; refusing it, as before.

## D250: Hidden files in the explorer, by a setting and a key, never indexed (2026-10-17)

**Decision:** A setting, `files.hidden` (default `false`; your config, a vault's `.slipbox/config.toml`, and the UI
settings), and a key in the explorer that toggles it, `shift+h` (`toggle_hidden`; the command
`explorer.toggle_hidden`, `:hidden`), modelled on `a`: it says `explorer: hidden files shown` or `explorer: hidden
files not shown` and keeps the selection on its row; changed in the TUI, it is kept for the vault as a UI setting is,
until its config value changes. On, the explorer lists the files and folders whose names start with a dot as it lists
what the walk leaves out (VV-D8): rows by their paths, marked `⊘`, the status line's reason `hidden` (D244), `.slipbox`
said `slipbox's own folder`; listed a level at a time anywhere, a hidden name is `⊘ hidden` itself. `.git` is never
listed. Nothing hidden is indexed by being listed; a hidden file opened from its row in a vault is reached (20.8),
indexed from then on, as `:e` reaches it, while in home, whose walk never takes a hidden folder, and in `.slipbox` it
opens unreached. The walks are unchanged — home's still leaves hidden folders out — and so are the switcher, the
explorer's filter, search and find: they list what's indexed, a hidden file once reached, as for the busy folders.
Off, nothing changes. As built: `listsName` (`src/tui/explorer-disk.ts`), `Explorer.toggleHidden` and `reachHidden`
(`src/tui/explorer.ts`); design/tui.md § Side panes.

**Why:** The maintainer's choice, 2026-10-17 (#157): in a repository, `.github/`, `.claude/` and `.slipbox/` could be
reached only by typing a path. A key is how a file manager shows them for a moment; a setting keeps them shown for
those who always want them. Listed as left out, they read as what they are: there, browsable, not part of the index.

**Cost:** With it on, each folder shown reads its hidden entries too, and `rowPath` asks whether a hidden file is
reached (one index lookup) for a path at a hidden name.

**Not chosen:** `files.show` or `files.include` naming them (a pattern for each, and still left out of the walk);
indexing what's listed (a dotfiles folder's every file); `.git` listed with the rest (git's own, thousands of files);
the switcher and find following the setting (they'd list files the index doesn't hold, which no search finds).

## D259: A peek's backlinks on a thread of their own, fresh at each peek; a missing index built (2026-10-23)

**Decision:** A peek into another vault shows the note at once, and its backlinks when they're ready: worked out on a
worker thread, which opens the vault afresh at each peek — its walk, its index caught up with what changed since and
written again — and, when the vault has no index here, builds it, the backlinks shown when it's done. A vault reached
by a link (`[[name:note]]`, a name a note declares) whose index lacks some of its notes, or has none, is caught up, or
built, on the same thread, the link resolved a moment later (the maintainer's choice, 2026-10-23, over leaving it
unresolved until the vault is indexed some other way). Home is left out of that: its index is built in slices while
nobody works (VV-D2), and a peek says it has none yet. The graph the peek
reads its links and embeds in stays opened on the main thread, its walk and its index read, and is opened again from
the fresh index when the vault changed; the TUI's reached graphs are no longer `thorough`, so a layout never parses a
vault whole; a tab of another vault's file has its vault caught up on the thread too. A peek open isn't updated while
its vault changes: the next one is fresh. As built: `core/backlinks-jobs.ts`, `core/backlinks-worker.ts`, `Reach`'s
`thorough` and `record` options, `tui/peek.ts`; design/tui.md § The peek. Decided by an issue (#10) and one pull
request (D223).

**Why:** The first peek into a big vault held the keys while it was read: for 5,000 notes, a third changed since the
index, 2.8 s parsing them and resolving every link, after 0.14 s opening it. And the graph was kept, its backlinks
worked out once, so a later peek showed those of the first, whatever had changed there. On the thread, the keys answer
while it works (within 0.4 s while that vault's index was built), and opening the vault afresh at each peek costs the
screen nothing. The maintainer chose that a vault without an index gets one, rather than a peek with no backlinks
until you go there.

**Cost:** The open stays on the main thread — 0.15 s for 5,000 notes whose index is 65 MB — and is made again when the
vault changed: a structured clone of those entries measured 0.26 s, more than reading them from disk. A peek's
backlinks come a moment after its note even when nothing changed (0.65 s for those 5,000 notes). A big vault never
indexed keeps a core busy while it's built (8 s for 5,000 notes), and quitting meanwhile loses the work.

**Not chosen:** watching the other vault while a peek shows it, a second watcher for a peek left open; building nothing
for a vault without an index, as VV-D7 had it; the open moved to the thread too, the peek's links drawn unresolved
until it answered.

## D260: A link renamed or moved itself moves as a link, its answer with it (#11, 2026-10-23)

**Decision:** A symlink named itself in a rename or a move — the explorer's `r` and `m`, `space n m`, `slipbox mv` — is
renamed or moved as a link, in a vault or home, whatever it leads to: its entry is what's checked to be inside the
vault, in its folder by that folder's real path, and what it leads to stays where it is. The answer kept for it (VV-D6)
goes with it, in place of any kept for where it goes: the same link, leading to the same place, isn't asked about again;
an undo moves the answer there is then, never an older one. When it can't be kept there (slipbox's state folder can't be
written), the move stands, and says so. A relative link moved to another folder is written again there to lead where it
did, from its own text, so a link to a link stays one; the plan says so, and its undo. A link's own relative links are
rewritten through it, as a note's, unless another name leads to the same file. Unchanged: what is reached through a link
out of the vault is never moved out of it, nor anything into it; a link inside a folder that moves is left as the
folder's move leaves it; a link leading to a vault, or to a folder holding one, isn't moved, a vault being known by its
real path; a copy or a delete of a link out is refused. As built: `entryInside` (`src/core/fsutil.ts`), `moveLink` and
`movedLinkText` (`src/core/symlinks.ts`), called by `applyPlan`; design/roots.md § Links followed only when you say so.

**Why:** The maintainer's choice, 2026-10-23 (#11): a rename of the link changes only its entry in its folder, so
refusing it as `… resolves outside the vault` refused what never crossed the vault's edge. Moved without its answer, the
link would stop being followed, and the links the move had just rewritten would lead through one that isn't; moved as
it is, a relative link would lead elsewhere, or nowhere, with the plan saying `0 changes`.

**Cost:** A relative link moved is two steps, the new link made and the old one taken away, rather than one rename:
when the second fails, the first is taken back.

**Not chosen:** the renamed link asked about again (the move undoing what you said of it); a relative link's move
refused, or made as the shell's `mv` makes it, with a warning; the answers of links inside a moved folder carried too
(wider than #11, and a relative link inside may lead elsewhere after the move).
