# Changelog

Every release of slipbox, newest first: what it added, changed, deprecated, removed and fixed, and its security fixes.
The format is [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/); what a version number promises is in
[Versions](docs/manual/versions.md). A breaking change is marked **Breaking**, with what to do about it.

## [Unreleased]

### Added

- Links that lead out of a vault, or out of your home folder, are followed only when you say so. The explorer shows
  such a link with where it leads, and `not followed`. Opening it asks: follow it (read and indexed as part of the
  vault, and in home written through), just look (read-only, this once, nothing indexed), or no. The answer is kept for
  that link and where it leads, in slipbox's state, never in the vault, and asked again when the link leads elsewhere.
  In a vault, nothing is ever written through a link to outside it: a rename, a replace across files and
  `convert-links` leave a note out there as it is and say so, a note or folder there isn't moved out of it, and an
  export of one goes only where `-o` says. When the link leads to a hidden folder or outside your home folder, the
  question says that agents will see what's followed. A followed link on a disk that doesn't answer within three
  seconds is given up on for now. On the command line, a path through a link not followed is refused (exit 5). A link
  within its vault or home, like the ones `stow` makes, is never asked about.

- A link's rule holds wherever it's met. On the command line in Elsewhere, every link on a path's way from the folder
  you're in asks, a linked note is refused however it's named, and `capture --snippet` doesn't read through a link
  not followed. A write never lands in a hidden folder of home, or of a vault, through a link. In home, a new note or
  folder is made through a followed link from the explorer as on the command line, and moving, copying or deleting
  across one is refused in both. A peek at another vault's note through a link that vault hasn't followed says so
  instead of reading it, and `o` goes there, where opening it asks. An explorer row's link in a folder outside the
  vault you're in says whether it's followed there, and asks before it's unfolded.

- An answer about a symlink can be taken back. `space v l` (`:symlinks`) lists the symlinks you've answered, with
  where each leads and whether you followed it, said no, or are just looking, and `enter` forgets one: opening it asks
  again. One you followed is followed no more at once: its notes leave the index and search, its folder is no longer
  watched, and a tab open through it turns read-only. `slipbox symlinks` lists them on the command line, and
  `slipbox symlinks forget <link>` forgets one.

- Keys you already know, a page for those who don't use vim: the arrows and the shortcuts of other editors that slipbox
  has, the four keys that are new, and where slipbox's keys differ. The README, the quick start and getting started
  give the familiar key first.
- [Vaults, home and Elsewhere](docs/guides/vaults.md), a guide to the folders slipbox works in: what makes a folder a
  vault and how slipbox finds it, home and Elsewhere, going from one vault into another, the explorer's view, the
  peek, and symlinks followed only when you say so, with four worked examples drawn out.
- [The lens](docs/guides/lens.md), a guide with pictures and examples: what the lens is, when to use it rather than
  source mode, how it opens and grows, typing in it, and its keys. [Code and git](docs/guides/code-and-git.md) now
  walks through reviewing an agent's change from start to end: its diff, each change kept, reverted or sent back, a
  rebase, a conflict on the merge screen, the merge, and pulling and pushing.
- Diffs mark the words that changed inside a changed line. A diff (`:diff`, a file's from the git panel or `:changes`, a
  commit's to now, the conflict prompt's) opens in a floating window, its lines highlighted by the file's language,
  removed and added lines tinted and the changed words more strongly. The unchanged lines between changes fold to a
  row saying how many, which `enter` opens. A line too long scrolls sideways as a code block does, never cut with `…`.
  Two new colours, `diff_add_word` and `diff_del_word`, mark the words.
- A note's diff shows each changed block before and after: a paragraph, a heading, a list item or a table's row in one
  frame as it was and another as it is, lightly formatted, the words removed and added marked. A block too big to
  compare word by word, such as a long code block, is compared line by line: its changed lines are marked, and the
  words that changed in them. A block added or removed whole is shown once. `enter` on a line as it was goes to that
  line where it is now. `tab` in the diff switches to its lines, and `git.diff = "source"` opens it that way.
- A code file's diff shows its two versions side by side where the window gives each 80 columns, both sides scrolling
  sideways together; `git.diff_layout` chooses `auto`, `unified` or `split`. In the code view, `space k d` folds the
  cells that didn't change, so the file reads as which definitions did.
- Fetch, pull and push, and the stashes: `f`, `p`, `shift+p` and `z` in source control, or
  `:fetch`, `:pull`, `:push` and `:stash`. Each runs in the background when you ask, never on its own. A branch with
  no upstream is asked whether to push to `origin` and track it there. git never waits for a password: a remote that
  needs a login fails at once, in git's words, which are git's English whatever your language settings. The status
  line shows how far the branch is ahead of its upstream and behind it (`main ↑2 ↓1`). In a vault you don't trust, a
  push runs none of the repository's hooks. A remote's name is checked before git uses it.
- The explorer marks each row at its right, in columns that line up down the tree. The last says what slipbox has
  indexed: `●` indexed (dimmed), `◐` being indexed, `⊘` not indexed, `⚿` you may not read it, `⚠` a problem, such as a
  link whose target isn't there. git's mark is in the column before it, and before that, dimmed, a vault's branch, or a
  worktree's after `⎇`. Each mark is one column wide, with ASCII and Nerd Font forms ([A row's
  marks](docs/manual/files.md#a-rows-marks)). A new colour, `sidebar_mark`, is the indexed mark's.
- The git panel works by mouse as by keys, and says its keys: a message box where `ctrl+enter` commits; buttons to
  commit, amend, pull, push, fetch and stash; each row's buttons under the pointer to stage, unstage, discard or show
  its diff, and a menu on a right click. It shows what the branch changed against its base, so a branch whose work is
  committed never says "nothing changed"; the note on screen's diff, history and blame; and the branches, a worktree
  marked `⎇` on its branch with its folder, each opened up in place to see its files and diffs, open its worktree,
  check it out, merge it or remove a merged worktree, the question naming the ignored notes and files that go with it.
  `n` makes a branch from where you say, in a new worktree by default, in the folder `git.worktrees` names. Each branch
  is measured against its own base: the branch it was made from, else the nearest of `git.bases`. The panel follows the
  vault you're in: in a repository, the other repositories in the explorer's view are folded under its own; in a vault
  that isn't one, they're the panel, by what needs attention, `o` going into one. A click on the status line's branch
  lists the branches, and one on a change's sign in the gutter shows the change, with Revert and Stage.
- Reviewing a change, one piece at a time: `v` in the git panel, its Review button, or `:review` walks the changes that
  aren't staged, across every changed file, each drawn as a diff. `y` keeps one (stages it), `x` reverts it (saved at
  once; `u` in the file brings it back), `c` sends it to the agent with a note, through the scratch. `tab` shows a
  note's change as its lines. The end says what you kept, reverted and noted. A file with unsaved typing is never
  written over, and a file that changed since the review read it is left as it is, and said.
- A merge screen for git's conflicts: `x` on a file in conflict, in the git panel or Problems, its Resolve button, or
  `:resolve`, shows each conflict with its base, and yours and theirs as diffs against it, the file as it will be below.
  `o`, `t`, `b` and `shift+b` take a side or both, `e` settles one by hand in the lens, `a` hands it to the agent, `w`
  (or `ctrl+s`, or `:w`) saves and `s` stages, once it has read the file again. The conflict prompt's (M)erge settles
  its conflicts on the same screen. A side holding a `=======` line of its own is read as git's own copies of each side
  have it; when they can't say, the conflict is settled by hand. A fenced example of git's markers in a note is text.
- A pull where both sides moved asks: merge, rebase, or nothing, git's `pull.rebase` the default. `shift+r` in the git
  panel (or `:rebase`) rebases the branch onto the base, each conflict on the way opening the merge screen, unless
  you're typing or answering something: then a message says `x` opens it. While a merge or a rebase is under way, the
  status line says so (`rebasing 2/5`), the panel has Continue, Skip and Abort buttons, and `shift+r` offers the same
  (`:continue`, `:skip`, `:abort`); Abort asks first. A cherry-pick or a revert you started in a terminal is shown and
  handled the same way (`cherry-picking`, `reverting`). In a vault you don't trust, none of them runs the repository's
  hooks.

### Changed

- `:merge-review` offers this branch into its own base, the one the git panel measures it against, rather than `[git]
  base`. `slipbox merge-review` still merges into `--into`, or the branch checked out.

- A file outside your home folder and outside every vault is in Elsewhere: one place for the whole machine, with one
  set of tabs, your own settings, and no index. The status line names it `Elsewhere`. A folder there is listed a level
  at a time instead of walked and indexed, and backlinks, search, tags and `slipbox problems` say Elsewhere has no
  index (exit 5 on the command line). Choosing a file of Elsewhere's from a vault (`:e`, the explorer, `o` in a peek)
  goes into Elsewhere instead of opening it beside the vault's notes. `slipbox info` and `stat` say `Elsewhere`; the
  JSON's `mode` is still `folder`.
- **Breaking:** `space g` opens the git panel, as `space e` the explorer, and its keys act there (`[keys.git]`). The
  keys under `space g` are gone: `space g c`, `d`, `w` and `m` are `:changes`, `:diff`, `:worktrees` and
  `:merge-review`, and the others are in the panel and the palette (Branches, Who changed this line, This file's
  history, Preview the change, Undo the change). In the panel, `enter` shows a file's diff and `o` opens it. The
  explorer's keys no longer include the panel's `c`, `shift+c`, `f` and `shift+p`.

- A code block too wide for the window scrolls sideways on its own instead of wrapping its lines, so trees, diagrams
  and aligned output keep their columns. The cursor, a sideways wheel (or `shift` with the wheel), the block's
  scrollbar and find scroll it, and a Mermaid diagram too wide is drawn and scrolls too. `render.code_wrap = "wrap"`,
  or Code blocks in `space u u`, wraps them as before.
- In source mode and the lens, `backspace` and `delete` delete a selection, as `d` and `x` do, without typing first.
- Where a selection can't be edited, the message names the lens (`space n l`) and source mode (`ctrl+k`).
- The folders slipbox works in are called vaults, as Obsidian calls them: any folder holding `.git`, `.slipbox/`,
  `.obsidian/` or `.zk/` is a vault, so every git repository is one. The docs, the help, the command titles, the
  messages and the human output of `slipbox info` and `slipbox stat` say vault where they said root, and the manual's
  Links and roots is now [Links and vaults](docs/manual/links-and-vaults.md). Nothing a script or a config depends on
  changed: the `--root` flag, `SLIPBOX_ROOT`, the settings that say root (`[trust] roots`, `walk.root_markers`,
  `capture.location = "root"`, `links.path = "root"`), and the `--json` output's fields and values (`root`, `mode`, a
  change's `kind`) are as they were. Only the reasons the JSON gives in words say vault.
- Following a link into another vault no longer switches to it. The note opens in a peek, a large floating window over
  the vault you are in: read-only, `/` finds in it, and your tabs stay as they were. `o` goes there, `t` keeps it as a
  read-only tab marked with its vault's name, `z` fills the screen and `esc` closes it. A backlink from another vault,
  another vault's search hit and a file outside every vault open in the same peek, which lists the note's backlinks
  when its vault has an index. A click on such a link peeks, and `ctrl+click` goes there at once. See
  [A peek at another vault](docs/manual/links-and-vaults.md#a-peek-at-another-vault).
- The explorer is one tree of your files, and shows a part of it, the view. The view starts at the folder you opened
  (`slipbox ~/work/kestrel/docs` shows `docs`), a breadcrumb above it says where it is
  (`~ › work › ◈ kestrel › docs ›`), and going somewhere outside it zooms it out to the folder holding both places. `z`
  zooms in on a folder, `-` out a level, and a click on the breadcrumb to that folder. The view's folder renamed or
  moved takes the view along; deleted, the view goes to the nearest folder still there, and says so. Another vault in
  the view unfolds in place with `l`; `enter` goes into it. A file you may not write opens read-only and says so; a
  folder you may not read says why.
- Your home folder is a vault, home: its notes outside every other vault have backlinks, are searched together, and
  have their own tabs. Starting slipbox in `~` starts in home, instead of a folder listed a level at a time. Home is
  indexed a little at a time while nobody is working, leaving out hidden folders, `Downloads`, the system's folders,
  busy folders such as `node_modules`, folders where another disk or a share is mounted (never looked into, so one that
  stops answering can't hold slipbox up), and what isn't a note or a text file; it holds 10,000 notes at most, and
  says so when it's full, `slipbox index --refresh ~` too. A folder of home you open, such as `slipbox ~/notes`, a note
  in one, or one you go into from another vault, has its notes and the vaults in it at once, and its own note opens;
  each folder you open by name keeps its own tabs, as before. Changing `walk.extensions`, `walk.exclude` or
  `walk.root_markers` walks home again. The background index indexes home's notes before the vaults in it.
  `slipbox info` says `mode` `home` there ([Home](docs/manual/links-and-vaults.md#home)).
- The explorer lists `node_modules`, the other folders tools fill (`build`, `dist`, `target`, `vendor`, `__pycache__`,
  caches…), what `.gitignore` and `walk.exclude` leave out, and home's `Downloads`, each marked `⊘`. You can unfold
  them and open their files; nothing in them is indexed. A folder you may not read is listed too, marked `⚿`. Every
  vault's index now leaves those busy folders out, as home's did, when they look made by a tool: `.gitignore` leaves
  them out, or no note is directly in them. A folder of notes named `build` or `vendor`, notes at its top and not
  ignored, stays indexed. Nothing new goes where nothing would find it: a new note, a move or a copy into an ignored
  busy folder, or deeper in one with no note at its top, is refused, in the explorer, as a typed path, and on the
  command line (`write --create`, `mv`, `cp`: exit 5). A note already there can still be changed. `node_modules` is
  decided the same way, so a note already in one can be changed too.

### Removed

- **Breaking:** Intel Macs: no build from this release on; 0.3.0 was the last. Apple has stopped making macOS for
  them, macOS 26 Tahoe the last they get. On an Intel Mac the installer says so and stops before downloading anything,
  and Homebrew says the arm64 architecture is required. There, stay on 0.3.0: its own installer still installs it
  (`curl -fsSL https://github.com/remziduzagac/slipbox/releases/download/v0.3.0/install.sh | sh`).

- **Breaking:** `:pin-root` (`vault.pin_root`), the list of other vaults under the explorer's tree, the `..` row above
  it, and the named folders' list that opened when slipbox started in a folder outside every vault. The explorer's
  view holds the vaults you go between, `-` goes up, and `space v v` still lists the named folders. A `[keys]` binding
  to `vault.pin_root` is warned about as unknown: remove it.

### Fixed

- A file whose name holds `?`, `*` or `[`, or starts with `:`, is staged, unstaged, discarded, marked resolved and
  followed through its history as that one file. git had read such a name as a pattern, so source control acted on
  every file it matched: discarding `Why?.md` discarded the changes to `WhyX.md` too.
- Unstaging everything (`shift+u`) during a merge keeps the merge: a file in conflict stays in conflict, and the next
  commit is still the merge. It used to end the merge.
- Unstaging a renamed file unstages the rename whole: the old name is back and the new one untracked. The old name's
  deletion used to stay staged.
- Amending a commit whose message has a line starting with `#` keeps that line. The commit editor's own lines start
  with `;` then, as git's do. The git panel's message box commits what you typed, a line starting with `#` too.
- Staging or discarding a section of the git panel at once runs git once, not once a file.
- An undo puts what a rename moved back only inside the vault: where a link out of the vault stands now, it's refused
  and nothing moves. `slipbox apply` takes a plan by the id `--plan` printed, never a file's path, and shows each file
  by where it is.
- Following a link to a picture in another vault copied a wrong path, the current vault's folder before the picture's
  own. It copies the picture's path.
- A file created, renamed or moved while slipbox started watching its folder could stay missing until a reindex: on
  macOS, at startup or whenever a folder was added, and on any system between the first scan and the watch. A folder
  that changed without word from the watcher is now looked at again.
- With spelling on, slipbox no longer stops answering keys while it loads its dictionaries: a quarter of a second for
  English and Turkish on a fast machine, several seconds on a slow one. They load in the background now, and the marks
  come once they're there.
- A slipbox installed from a release parses a big note on background threads, as one run from source does. The release
  build had left those threads out, so a big note was parsed while keys waited.
- A big file reformatted or regenerated, such as a lockfile, made typing slow while the gutter's git signs compared it
  with what's staged, and could take gigabytes of memory at each key, enough past about 15,000 lines to end slipbox
  with your typing unsaved. The diff behind the signs, `space g d` and the conflict prompt now needs memory only for
  the two texts, and a file rewritten whole takes no longer than a few changes. Past a certain cost it shows a coarser
  diff, still correct, as git does.
- With line endings converted on checkout (`eol=crlf` in `.gitattributes`, or `core.autocrlf`), a file's diff showed
  every line changed. Line endings aren't compared now. What changed of them, the byte order mark or the final line
  break is a dim row of the diff, as git writes `\ No newline at end of file`: `\ line endings: CRLF → LF` at its top,
  `\ no newline at end of file` at its end, whether lines changed too or not. A file git lists as changed for these
  alone used to show every line, or nothing.
- In a note with a byte order mark, the gutter's git signs and `space g d` marked the first line changed when it
  wasn't, and undoing that change wrote a second mark into the file. The mark is never a change now, and staging a
  change keeps it.
- `capture --ref … --snippet` reads only a regular file, as `read` does: a FIFO or a device is refused at once.
- Switching branches from the branches list runs in the background, with ten minutes to finish. git was stopped after
  fifteen seconds, so a big checkout could be left half done. If git is stopped now, slipbox says what it may have
  left.
- `:worktrees` lists a worktree whose folder's name holds a line break by its whole path, with git 2.36 or later.
- A rename staged with `git mv` shows in source control as `R old.md → new.md`, and its diff is what changed against
  the old name. It used to show the whole file as added.

## [0.3.0] - 2026-10-14

### Added

- Homebrew, on macOS and Linux: `brew install remziduzagac/tap/slipbox`, and `brew upgrade` after.
- The documentation is a website, with search: <https://remziduzagac.github.io/slipbox/docs/>. It has a quick start, a
  page of concepts, and a guide your coding agent can read to walk you through slipbox.
- `[git] signs_at` places the gutter's git signs: `gutter_right`, the default, where they were, against the text;
  `gutter_left`, before the line numbers; or `window_right`, by the scrollbar.
- `space s r` opens the scratch in the window on the right, and `capture.open_in = "right"` (or Scratch opens in the
  UI settings) makes that where it always opens.

### Changed

- The scratch opens in a window floating in the middle of the screen, not as a tab, rendered and edited as any note is.
  `q` closes it, back where you were, what you typed saved; `esc` leaves typing and the lens first, then closes it.
  It opens when it's empty too.
- Adding to the scratch (`space s a`) opens it ready to type a note about what you added: each entry is `**At:**`
  the place, then `**Note:**` with the cursor after it, and a rule between entries. `esc` then `q` takes you back; a
  `**Note:**` left empty is dropped. `slipbox capture` with `--ref` writes the same shape, its text after `**Note:**`.
- The gutter's git signs have softer colours of their own: three new roles, `git_sign_add`, `git_sign_change` and
  `git_sign_delete`, which `[colors]` can set.
- Every page of the documentation is rewritten in short, plain sentences, and there's a quick start, a page of concepts
  and a guide for your agent.
- slipbox describes itself as the terminal companion for coding agents, in its help, its package and its Homebrew
  formula.

### Fixed

- In a rendered note, the blank row after a changed paragraph, list item or heading repeated its git sign in the
  gutter. Only the changed rows are signed now.
- A message said while slipbox was busy, as when it starts indexing a big folder, could be gone before it was ever
  drawn. Its four seconds now start once it's on screen.
- `space f b` opened the heading path as a plain list in the middle of the screen, not the dropdown under the
  breadcrumb, when `space f`'s key hints had shown before the `b`.
- Typing a word and then `(` could open the completion popup after the `(` if the language server was slow with its
  signature help; `enter` then picked a word instead of starting a new line.
- Right after a merge or a pull that moved files, `space l r` could find nothing to relink until the file watcher
  caught up. The folder is now read again before the message says files moved.
- A config warning names a file in your home folder as `~/…`, so its row in the messages list (`space m`) shows what
  it says instead of a long path cut short.

## [0.2.2] - 2026-10-13

### Changed

- On a rendered note, the editing keys (`i`, `a`, `o` and the others) open the lens: the Markdown around the cursor,
  with the rest of the note still rendered. The key again types there, and `esc` `esc` leaves. Before, they swapped the
  whole note for its Markdown (source mode), which `ctrl+k` left. To keep that, set `edit_in = "source"` under
  `[editor]` in your config.
- OpenTUI, the library slipbox draws the terminal with, is 0.5.14.

### Fixed

- In the lens, the status line's column (`L18:5`) counted the lens's own counters before the text; it counts the text.
- With the lens (`edit_in = "live"`), a new note (`ctrl+n`) opened the lens without typing, and a line break went into
  it anyway. It's typed into at once now, as in source mode.

## [0.2.1] - 2026-10-12

The first release. 0.2.0 was tagged but never released: its build failed a test on the Intel Mac, fixed since.

### Added

- A terminal app for reading and writing Markdown notes in any folder: a git repository, an Obsidian vault, a zk
  notebook, or a plain folder, opened as it is, with nothing to set up and nothing written into it by opening it.
- Notes drawn properly in the terminal: tables fitted to the width, highlighted code, pictures where the terminal draws
  them, Mermaid diagrams and maths as text, callouts, footnotes and front matter; themes and glyph sets.
- Links in the forms GitHub, Obsidian and zk write them, followed between folders; folders named once and reached by
  `slipbox://` pointers wherever they are; backlinks; every link kept through renames and moves.
- Editing in source mode or in the lens, with vim's keys or the usual editor keys; saving that asks before writing over
  another program's change; autosave, completion, spelling, find and replace in one note or every note.
- Search over an index kept up to date as files change, the switcher, the outline, tags, history and the trash.
- Git: changed lines in the gutter, source control and commits, blame and a file's history, and the links a branch or a
  merge would break.
- Code files as documents, with language servers and linters; nothing a folder brings runs until you trust it.
- Exports to Word, PDF, a web page, an e-book or Markdown.
- A command line for agents and scripts on the same files: every change the TUI makes, one JSON object per call with
  `--json`, stable exit codes, and a skill that teaches it to agents.
- Builds for macOS and Linux (x64 and ARM, and Alpine's musl), installed by one line
  (`curl -fsSL https://remziduzagac.github.io/slipbox/install.sh | sh`) that checks each download; previews between
  releases, which `slipbox channel` makes an install follow; a Homebrew formula, `slipbox upgrade` and
  `slipbox uninstall`; Windows through WSL.
- `slipbox skill`: the skill for agents carried by the binary, printed or installed where an agent reads skills.

[Unreleased]: https://github.com/remziduzagac/slipbox/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/remziduzagac/slipbox/compare/v0.2.2...v0.3.0
[0.2.2]: https://github.com/remziduzagac/slipbox/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/remziduzagac/slipbox/releases/tag/v0.2.1
