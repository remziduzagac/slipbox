# Links

How slipbox reads, resolves, writes and repairs links: one model inside, every tool's forms at the edges (D68). Roots,
which give links their scope, are [roots.md](roots.md). Following each form in the TUI is [tui.md](tui.md) § Following
links; how a link is drawn, [rendering.md](rendering.md) § Blocks and inlines; the CLI's words,
[docs/cli.md](../../docs/cli.md) § `resolve` and § Renames.

## One model inside

Every link, whatever its written form, is read as a file and a fragment (`#heading`, `#^block`, `#L42`). Everything
behind the reading works on that: the index, backlinks, renames, repairs, the merge review and plans see only paths
(D68; the resolver is `core/graph.ts`, `resolveLink`, over `core/links.ts`). A path resolves without the index: its
target exists or it doesn't (D56). A wikilink's name needs the index of its root (D71). A broken link stays broken
until it is repaired, never resolved quietly by a name or a remembered move (D56, D78). The index makes lookups fast
and gives backlinks; it never decides where a link points (D61).

## Forms

Each written form has a reader, and each but `~/` a writer: a rename writes a link back in its own form (§ Renames
and moves), and the links slipbox makes follow the root's convention (§ Conventions).

| Written as | Read as |
| --- | --- |
| `[t](../docs/plan.md)` | relative to the file: what slipbox writes by default (D56) |
| `[t](/docs/plan.md)` | from the nearest root; if nothing is there, the filesystem's path (D70) |
| `[t](plan)` | an extensionless path: the file, else `plan.md`, else a folder (D81) |
| `[t](docs/)` | a folder: revealed in the explorer when followed (D81) |
| `[[plan]]`, `[[docs/plan#Aims\|a]]` | a wikilink, by name or path, within its root (D71) |
| `[t](file:///home/me/x.md)` | the filesystem's path (D48) |
| `[t](~/notes/x.md)` | the home folder's path: read, never written (D48) |
| `[t](slipbox://research/x.md)` | a named folder's path: a pointer (D75) |
| `https://github.com/me/repo/blob/main/x.md` | this repository's own file, in this copy (D87) |

The screen shows what the file says: a wikilink as one, a path as a path, a pointer as a pointer; a link without text
shows its target as written, and no form is invented for the screen (D77; [rendering.md](rendering.md) § Blocks and
inlines).

## Paths

A markdown link's path (`resolvePath` in `core/graph.ts`, `resolveMarkdownUrl` in `core/links.ts`):

- **Relative to the file** is the form slipbox writes by default. A relative link within a repository works anywhere
  the repository is cloned; `~/…`, absolute paths and links between repositories depend on how the machine is laid
  out (D56). A path is percent-decoded, and a note is found by its own spelling, case aside: `[t](Plan.md)` reaches
  `plan.md` on every filesystem, as a name does (D41).
- **A leading `/`** starts from the nearest root; when nothing is there, it is the filesystem's path. In a plain
  folder, with no root, `/` is the filesystem's alone (D70).
- **A path without an extension** is the file as written, else its note (`plan` → `plan.md`, `plan.markdown`), else a
  folder (D81), as zk, mkdnflow and Typora write them.
- **A link to a folder** resolves and is never broken: followed, the folder is revealed in the explorer, unfolded and
  focused (one outside the root, in its own root); a move of the folder rewrites it (D81).
- **Filesystem paths,** for what other editors and agents write: `../` out of the root, `~/` (the home folder), an
  absolute path, a `file://` URL. A path out of the root reaches the file in whichever root holds it; a path landing
  in this root is its note or file like any other link's, and a backlink (D48). A wikilink takes only the relative
  form (`[[../app/x]]`), its note found without an extension (`.md`, `.markdown`).
- **Into a nested root:** a path from this root into a root nested in it (`[t](outreach/index.md)`,
  `[[outreach/index]]`) reaches the note there, as a path out of the root does (D48).
- **In a worktree,** a relative path out of the repository is taken from the main checkout: `../y/plan.md` names the
  sibling repository beside the main one, wherever the worktree is kept; inside the repository, the worktree's own
  (D54).
- **Broken:** a path that reaches nothing is broken, whatever moved (D56). A broken `/x.md` or `x` inside the root
  offers to make the note when followed; a `/…` naming no folder of the root (an unplugged drive's path) offers none
  ([tui.md](tui.md) § Following links).

Code and data files have links of their own: in a code comment a path names a file relative to the file, then to its
root, a leading `/` too, and `path:42` its line (`16.10`; [tui.md](tui.md) § Files beyond notes); a data file's
reference keys and path-like values are links relative to the file (`16.15`; [rendering.md](rendering.md) § Data
files). Neither has wikilinks.

## Wikilinks

A wikilink is read by a micromark extension, never inside code (`core/wikilink.ts`; [rendering.md](rendering.md) §
The wikilink tokenizer), and resolved within its root (D71; `resolveWiki` in `core/graph.ts`, `LinkIndex` in
`core/links.ts`):

- **Forms.** `[[name]]` matches file names without their extension; `[[dir/name]]` a path from the root
  (`[[Recipes/Weeknight/Dal]]`), else a path's end aligned on segments; `[[name.md]]` is accepted, an extension
  narrowing the candidates to files with it. `#heading`, `#^block` and `|alias` are split off first; `\|` divides an
  alias too, as a wikilink inside a table cell is written. A bare `^block` (`[[name^id]]`) only when an id (letters,
  digits, `-`) follows the caret and no `#` comes before it: `[[n#O(n^2)]]` is a heading. A relative wikilink starts
  `./` or `../` and is a path from the linking note, never a name (D83). An empty one, `[[#Heading]]`, is this note.
- **What it reaches,** in order: a note by its name (its file's) or by its path; a path out of the root or into a
  root nested in it; an attachment, relative to the note, then from the root, then by its file name anywhere in the
  root, as Obsidian finds one (`![[dal.png]]`); a note by an alias its front matter gives (`aliases` or `alias`),
  after every file name (D71, D46).
- **Case.** Names are compared case aside, after Unicode NFC: `[[Readme]]` reaches `readme.md` on every filesystem.
  The Turkish i's fold too: `İ` lowers to `i` with a combining dot, which goes, and `ı` is `i`, so `[[izmir]]` finds
  `İzmir.md` and `[[ILIK]]` `ılık.md`; the exact spelling still breaks a tie (`normKey`) (D41, D84).
- **Two of a name,** notes or attachments: an exact-case match; then the one in the linking note's own folder; then
  the one in the deepest folder shared with it; then the shortest path. A real tie is ambiguous: every candidate
  returned, picked when followed, never guessed (exit 4 in the CLI) (D41, D71). A tie broken by where the link is, is
  fragile (§ How a link landed).
- **Scope.** A root nested inside ends its names: a path into it is a path. A file with no root has no names: a
  wikilink there resolves to nothing, with a hint saying what makes a root (D71).
- **Not read:** a note's previous names, `[[vault:note]]` and remembered moves; only the converter reads them (§ The
  converter). A wikilink naming a folder the old way is flagged (§ Repairs).

An existing Obsidian vault opens unchanged for Obsidian's default "shortest path when possible" setting (D41).

## Where a link lands

One matcher, `core/landing.ts`, decides where a fragment lands, for the follow, the hover, the link check, `resolve`
and the converter (D84):

- **Explicit ids first:** `## Setup {#id}` (kept off the heading's text and the screen), `<a id>`, `<a name>`; as
  written, else case aside.
- **Headings:** a markdown link's fragment is GitHub's slug, repeats numbered as GitHub numbers them (`#setup-1` is
  the second "Setup"), else the heading's text; a wikilink's is the heading's text, as Obsidian reads it, else its
  slug. Of several headings of that text, the first, and the link check says so (`ambiguous-heading`). A path of
  headings (`[[n#Install#Linux]]`) finds each inside the one before. Slugs keep marks and connector punctuation, as
  GitHub's do, so a link to a Devanagari heading works on GitHub too. A heading is compared case aside, the Turkish
  i's folded. Where slipbox writes a heading's fragment (`resolve`'s `href`, the converter), it writes its id, else
  its numbered slug.
- **Blocks:** `#^id`, as Obsidian marks one: at the end of the block's last line, or alone on the line after it. A
  `^id` inside fenced code is code, not a block's id.
- **Lines:** `L42`, `L42-L50`, `L42C5-L45C10`, as GitHub writes them; a code comment's `run.py:42` is `#L42`.
- **A hosting's own forms:** Bitbucket's `#markdown-header-…` is the heading after it, and `#readme` the note's top
  (§ Links to the repository's own hosting).

A fragment that lands nowhere opens the note at its top. Where it lands is shown by the hover and `shift+k`: the
heading's section, the block, the lines ([tui.md](tui.md) § What's under the cursor).

## How a link landed

Every resolution says how sure it is, and a wikilink's says how it landed (D86; `Landed` in `core/links.ts`,
`certainty` in `core/graph.ts`):

- **How** a wikilink landed: by its path (`path`), the end of its path (`suffix`), its name, the only note of it
  (`name`), or the tie broken (`exact-case`, `same-folder`, `deepest-shared`, `shortest`). A path link has no `how`:
  its path is all it has.
- **Via** what else it was reached: an alias, a folder's old name (`old-name`), another copy of a named folder
  (`another-copy`), its hosting URL (`hosting`).
- **Certainty:** `broken` when it reaches nothing, `ambiguous` when a tie stands; `inferred` for the end of a path, a
  tie broken, a folder's old name, another copy, or a hosting URL at another ref; else `exact` (a path, a unique name,
  a unique alias, a pointer).

A link won by where it is written (the deepest shared folder, the shortest path) is **fragile**: a note of the name
nearer would take it. The link check says so (`fragile`) with the path that names its note for sure (from the root,
or `./x`, `../x` for a top-level note), and the fix is a code action. A note coming or going that sends a link by
name elsewhere (a nearer namesake, a note named like an alias) is said, as a TUI message and the CLI's warning, not
only when a link breaks or heals; it is checked only when another note or an alias has the new note's name, so a
unique name costs nothing (`namesakeLinks`). The TUI's words: [tui.md](tui.md) § Following links; the CLI's:
[docs/cli.md](../../docs/cli.md) § `resolve`.

## Links in front matter

A wikilink in front matter, as Obsidian's properties hold them (`related: "[[Plan]]"`, a list of them, an embed
`![[…]]`), is a link (D85): read where it is written, line by line over the front matter as written (one in a YAML
comment isn't), backlinked, renamed in place, drawn as a link in the properties block ([rendering.md](rendering.md)
§ Blocks and inlines), and checked like the text's. A markdown link, a bare path or a URL in front matter is a value,
not a link. The converter leaves front-matter links as they are (§ The converter).

## Links to the repository's own hosting

A link to the repository's own hosting is the file in this copy (D87; `core/hosting.ts`, `core/remotes.ts`):
GitHub's `/blob/<ref>/`, `/tree/<ref>/`, `/raw/<ref>/`; GitLab's `/-/blob/<ref>/`, `/-/tree/<ref>/` and
`/-/raw/<ref>/` (groups nested); Bitbucket's `/src/<ref>/`, with its `#markdown-header-` headings; a repository's own
page (`host/owner/repo`), and `#readme` (its README). The shapes are read on any host. It counts when the URL is one of
this checkout's remotes, or a named folder's by its remote. Such a link resolves (`via: "hosting"`), is a backlink
within its root, is followed, and a rename rewrites the URL's path after the ref in place, the URL keeping its form.
A ref other than the branch checked out (`HEAD` is it) is inferred, and the link check says so (`other-ref`); when
the path as first split isn't there, a branch with `/` is told by the repository's branches, the longest that is.

## Conventions

A root's convention says how the links slipbox makes are written (`core/convention.ts`; D72, D82). It has three
parts: style (markdown or wiki), path (relative, from the root, or by name) and extension (kept or dropped). Each part
is the first that says:

1. the user's setting: `[links]` in the root's `.slipbox/config.toml`, over the user's own config;
2. the setting of the tool that owns the root: Obsidian's `.obsidian/app.json` (`useMarkdownLinks`, wikilinks when it
   is unset; `newLinkFormat`, "shortest" when unset, read as by name, "relative" as relative, "absolute" as from the
   root; `.md` kept in a markdown link and dropped in a wikilink), zk's `.zk/config.toml` (`link-format`, "markdown"
   when unset, a markdown link from the note and a wikilink from the notebook's top, a custom template saying
   nothing; `link-drop-extension`, dropped unless it is false);
3. the root's notes, when one form has two-thirds or more of their links to the root's own notes (6 of 9 is a
   majority); links out of the root, to files, broken, or written as a URL or with `~/` aren't counted;
4. else ours: markdown, relative, `.md` kept.

The style is found first; the path and extension within it: a tool's as it writes that style, the notes' counted
among their links of that style. A style already chosen (`](` typed in a wikilink root) keeps it, the path and
extension then that style's. A markdown link is never by name, since slipbox reads it as a path: a "shortest"
Obsidian setting says nothing of one, and the next source answers (D82).

One convention per root: every note in a root writes the same way, whichever note the link is made in (D72). A root
mixing forms, with none at two-thirds, writes ours unless the user sets one. A folder with no root has the user's
setting where it can apply, else ours: it reads no wikilink and no path from a root, so there `style = "wiki"` writes
a markdown link and `path = "root"` or `"name"` a relative one, a wikilink typed by hand staying one with its path
relative; the extension is the user's. `slipbox info` and the Info view say each part and what said it. The
convention decides only the links slipbox makes; a rename keeps each link's own form (§ Renames and moves). The keys:
[docs/configuration.md](../../docs/configuration.md) § The links' convention.

## Links slipbox writes

Completion (`](` and `[[`), the link picker (`space l i`) and `slipbox link` all write through `core/write-link.ts`,
in the root's convention (D83). A markdown link's text is the note's title, a wikilink has none unless one is given
(`[[dest|text]]`, when the text isn't what the link shows by itself). A wikilink is a name only where the name reaches
the note from the linking file; else its path from the root, a top-level note's path being its name, or a relative
path (`./plan`, `../plan`): never a name that would land elsewhere. With the path from the root, a markdown link is
written `/docs/plan.md`. A file outside the root follows § Between folders: its pointer when a named folder holds it
and the two don't travel together, else a relative path, its extension kept. A pointer is always written as a
markdown link, in a wikilink root too, since a wikilink reads none (D75).

The scratch's captures are `path:line` references in code spans, as agents read them: not links, so the convention
leaves them be (D83). The keys: [tui.md](tui.md) § Following links ("Writing a link") and § What's under the cursor;
the CLI: [docs/cli.md](../../docs/cli.md) § `resolve` (`slipbox link`).

## Between folders

A link from one file to another is written (D73; `travelTogether` in `core/folders.ts`, `pointerTo` in
`core/write-link.ts`):

1. in the file's convention, when the two travel together: one clone, or one folder moved as a whole, carries both
   (the same repository; a repository and a submodule it records; outside git, one folder inside the other);
2. as a pointer, `slipbox://<name>/<path from its root>#fragment`, when the target is in a named folder (§ Pointers;
   [roots.md](roots.md) § Named folders);
3. otherwise as a relative path, which works while the folders are laid out alike.

Relative links between folders that don't travel together are read as they are; the relink offers each one's pointer
when its target is in a named folder (§ Repairs).

## Pointers

`slipbox://<name>[@branch]/<path>#fragment` is a link into a named folder (D75; `core/pointer.ts`):

- **The name** is a folder's short one, an alias or a name it had, or a repository's qualified one
  (`github.com/me/research`: the longest leading part this machine knows as a remote). The pointer opens this machine's
  default copy of that folder ([roots.md](roots.md) § Named folders); a worktree's name means its main checkout.
- **`@branch`** names the repository at that branch: the copy with it checked out, or the repository's worktree with
  it, else the file as it is on that branch, read-only, from git (its `#heading` unchecked). A branch is written as it
  is (`@agent/sync-retry`) and told from the path by the branches the repository has: the longest; `%2F` reads as `/`
  too.
- **The path** after the name is read as a markdown link's path is (no extension, a folder), and stays in its folder:
  one climbing out of it is unresolved.
- **Followed:** an unknown name, or a copy that isn't here, says why ("`notes` isn't on this machine yet: open it, or
  let the index find it"), never offering a note by that name; a name of different folders lists each, and offers
  renaming a `.slipbox/` one (the parent folder's name prefixed, the config edit previewed). A pointer from a file of
  no root follows like a URL. A private name's pointers work on this machine only.
- **Kept:** backlinks count another folder's pointers, as of its index; a rename keeps a pointer one, by its name,
  branch and form as written, while the target stays in that folder (§ Renames and moves); an old name stays until
  the relink; a whole named folder moved rewrites no pointer, since the lookup finds it again.
- **Agents** resolve a pointer as any link (`slipbox resolve slipbox://notes/inbox.md` gives the path), and every note
  argument takes one ([docs/cli.md](../../docs/cli.md) § Naming notes).

## Backlinks

Backlinks are derived from the index, never stored in files, and complete for what is indexed: indexing more only
adds backlinks, never changes where a link points (D61). Where a link points depends on where the file is, so links
are resolved, and backlinks derived, per root (D76); names never cross roots.

- **Within the root,** notes, data files and code files all link: a data file's values and a code comment's paths
  are backlinks of what they name, as links to attachments and folders are.
- **From other roots,** a note's links into this one by path (relative, `~/`, absolute, `file://`, a wikilink's
  `../`) or by pointer count, as of that root's last indexing, read from its saved index (D48; `core/reach.ts`). Only
  roots this machine knows count, and only while their folder is there: an unplugged drive's drop out until it is
  back. Another root's data and code files, and its hosting URLs, don't count.
- **Roots nested in this one, or holding it,** are recorded and indexed when a link or a backlink needs them, so their
  links count without their having been opened on this machine (D48).
- **A worktree's links don't count:** its notes are copies of the main checkout's (D54).
- **Unsaved text:** in the TUI, a note's unsaved text stands in for its links, tags and aliases while it is held, so
  backlinks follow the typing; the CLI answers about files as saved (D17).

## Renames and moves

A rename or move in slipbox rewrites exactly the files linking in, found by backlinks (another root's links and
pointers, data files' values and code comments' paths included), and a moved note's own relative links when its
folder changes: previewed, undoable, a plan in the CLI (D63, D143; `core/rename.ts`). Each link keeps its form (D72,
D81, D83):

- a wikilink stays a wikilink, a path a path, `./` kept, an extension kept or left off as written, a folder's
  trailing `/` kept, percent-encoding and `<…>` kept, a reference definition rewritten where it is;
- `/…` stays from the root while the root holds the target; an absolute path stays absolute, `~/` stays from home
  while the file is under it, `file://` stays a URL;
- a pointer stays a pointer, by its name, branch and form, while the target stays in that folder; moved into another
  named folder, it becomes that folder's pointer, and out of every named folder a path;
- a hosting URL keeps its form, only its path after the ref replaced;
- a wikilink by name stays a name while no other note has the new name and the note stays in the root; else it
  becomes a path.

No old name is written into a note (D79). A heading renamed rewrites the fragments naming it, each by its slug or
its text as written. A whole named folder moved rewrites no pointer. Links from places not indexed yet show broken
once indexed, and the repair applies (§ Repairs). Keys and the preview: [tui.md](tui.md) § Renames; the CLI:
[docs/cli.md](../../docs/cli.md) § Renames.

## Repairs

- **Changes made elsewhere** (an editor, an agent, git, a file manager) the index repairs by itself (D63).
- **A move made elsewhere** breaks path links, as it should. Evidence finds where the file went (D49, D78): its
  content hash (when the index is built, a note gone from one path whose text turns up at exactly one new path, and
  no other gone note had that text; in the watcher, a removal and an arrival of the same text, in either order,
  within a minute), or git's renames when a branch's head moves on (§ The merge review). A broken path link whose file
  was seen to move says "moved to …", and slipbox offers the relink once for each batch of moves. Moves seen, slipbox's
  own included, are kept in the root's state (`redirects.json`, the newest 5,000) as evidence, never to resolve a
  link (D56). The files of a branch switch aren't paired as moves (D153).
- **The relink** (`slipbox relink`, `space l r`) rewrites, each in its own form: a link broken by a move seen; a
  pointer by a name its folder had, to the name it has; a path into a named folder that doesn't travel with this one,
  to its pointer; and the links the root's own last move broke (D63, D78).
- **A named folder moved or renamed on disk** needs no link edited: pointers name it, and the lookup finds it again.
  Only relative links between folders that don't travel together break; the relink offers their pointers. A named
  folder moved by hand has its relink offered at once ([roots.md](roots.md) § State by root).
- **A link naming a folder the old way** (`[[research:x]]`, `research:x.md`), where a folder this machine knows has
  that name, isn't a link: it is flagged (`old-form`), with the pointer that names its file, and the fix writes that
  pointer as a markdown link, its heading or block kept. Copies meant for a note give a link, never a label (D78).
- **Every generated edit is a plan:** a preview tied to each file's content hash, refused when any of them has
  changed since; in the TUI, an undo step per file, files no window shows saved; in the CLI, planned and applied as
  two explicit steps (`--plan`, `slipbox apply`), so an agent reviews before it writes (D63; `core/plans.ts`). A plan
  warns when a git tree it writes to already has changes; a file that isn't valid UTF-8 is never rewritten, and a link
  no longer where the index had it is skipped and reported. Plans are saved in the state folder until applied
  ([how-it-works.md](how-it-works.md) § Storage). A code action (the fragile link's, the old form's) edits the open
  note, as typing does.
- **Undo:** each rename, move, naming, heading rename, relink, conversion or replace applied is logged with what each
  file held before, and `slipbox undo` (`space v shift+u`) gives that back, refused when a file has changed since
  (D152; [tui.md](tui.md) § Renames).

## The merge review

Before a merge, git's own tentative result (`git merge-tree --write-tree`, without touching the working tree) is
checked for the links it would break (D66; `core/mergereview.ts`): "`refactor` moves `docs/plan.md`; `main` added a
link to it in `docs/b.md`", each with its cause (`moved`, `deleted`, `note-moved`, `missing`) and the fix in the
link's own form, shown, not written; in review for people (`space g m`), from the CLI for agents (`slipbox
merge-review`). It reads paths (relative, `/…`, `~/`, absolute) and wikilinks by name or path; pointers and hosting
URLs aren't checked.

After `HEAD` moves on within a branch (a merge, a pull, a commit), git's renames between the old and the new commit
are evidence, kept for that checkout and that change (each branch's last commit seen is kept, `heads.json`), and each
link broken by one that points at a renamed file shows as "moved to …" with the fix (§ Repairs). A branch is only
compared with itself: a switch isn't evidence. Git pairs a move by similarity, so a file also rewritten in the same
change may not be paired; then the target is the user's to pick. A `post-merge` hook running the fix is the user's to
install, never slipbox's default (D66). The CLI's words: [docs/cli.md](../../docs/cli.md) § Before and after a merge.

## The converter

`slipbox convert-links` (`:convert-links`; `core/convert.ts`) makes a root's links plain paths, opt-in: nothing asks
to run it (D57). Each `[[…]]` becomes a relative path link, an embed `![…](…)`, its alias kept as the link text (else
the target, with its heading) and its heading as a `#fragment` checked to exist, written as the heading's id or
numbered slug (`[[plan#Aims|the aims]]` → `[the aims](docs/plan.md#aims)`); a block's `^id` is checked too. Each
markdown link starting with `/` that reaches a file in the root becomes relative. It reads by its own legacy rules
(`parseLegacy`, `resolveLegacyWiki`): names, paths, attachments by name, aliases, a note's previous names, moves
remembered, and `[[name:note]]` through the named folders' lookup (D79). Previewed before anything is written; a link
several notes answer to is listed to pick; missing ones are left and reported. Undone like a rename. Its TUI form:
[tui.md](tui.md) § Renames.

## Tags

A note's tags are its front matter's `tags:` or `tag:` (a list, or a string split at commas and spaces; `#`
optional) and the `#tags` in its text (D53): letters (their marks included), digits, `_`, `-` and `/`, not digits
only, after a space, a tab or at a line's start, so never `a#b`, `page#part` in a URL, `[[a#b]]`, a heading's `#`
marker, or anything in code (`core/tags.ts`, a micromark extension, as wikilinks are). A trailing `/` goes. `/`
nests: `#dome/shutter` is under `#dome`, and a parent's notes include its children's. `#Dome` and `#dome` are one tag
(compared after NFC, case aside), shown as first written (the first note by path, its front matter before its text).
Listing and following them: [tui.md](tui.md) § Following links ("Tags").
