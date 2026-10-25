# Changelog

Every release of slipbox, newest first: what it added, changed, deprecated, removed and fixed, and its security fixes.
The format is [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/); what a version number promises is in
[Versions](docs/manual/versions.md). A breaking change is marked **Breaking**, with what to do about it.

## [Unreleased]

### Added

- Installation and upgrades install or refresh the bundled skill for detected Claude Code and Codex user
  configurations. `--no-skill` or `SLIPBOX_NO_SKILL=1` skips automatic writes. Uninstall removes recognized skills
  with `--yes`, reporting foreign and linked skills it leaves alone.

- Standalone pictures have wrapped caption boxes below them, with separate buttons for path, alt text and image
  copying. Image copying uses an optional native clipboard helper. Alt-text line breaks become spaces, and picture
  clicks clear selection without leaving the caption highlighted.

- Info ends with an Export row for notes. Enter, a click or `x` offers the formats; the row remembers the last output
  path, and `y` copies it.

- Switching vaults asks to save all, discard or stay, and releases the outgoing notes, parses and index. The vault
  list includes unnamed vaults, home workspaces and worktrees grouped under their repository; returning restores
  the workspace from disk.

- The permanent top bar groups explorer zoom, workspace and git state, with separate click targets and changed-file
  count. Background indexing, exports, fetches and language servers starting have a task list with individual cancel;
  an available upgrade stays visible. The bar remains in zen; `space u b` is removed and `ui.top_bar` is retired.

- `slipbox vaults` lists known vaults and saved home workspaces as text or JSON.

- The status chip keeps READ or SOURCE beside NORMAL, INSERT, VISUAL or V-LINE, so Escape visibly returns to
  NORMAL. On narrow screens the view, then the mode, shortens before the file name. The header uses compact R/L/S
  buttons: READ and SOURCE select a view; L toggles the lens within READ.
  View switches are silent. Rendering defaults for notes, code and data choose the opening view without removing
  READ. The explorer's zoom is named separately from a window's view.

- Source mode highlights fenced code in its declared language and uses a bar cursor while typing. Set
  `ui.relative_numbers` to `"source"` or `"both"` for relative line numbers in its gutter; `"both"` keeps the lens's
  counters too. The default stays `"lens"`.

- The documentation site says what slipbox is wherever it's met without being opened. Every page's title ends with
  "slipbox: read, review and edit what your coding agent writes, in your terminal", a link to the site or any page
  shows slipbox's picture when it's shared, and the site's address on its own, `/slipbox/`, says the same before it
  sends you on to the docs.
- The docs for agents: `llms.txt` at the docs' root, a line per page, and every page's text in one file beside it,
  `llms-full.txt`.

- Each window's header, the row above its note, has three buttons for how the window shows the note: **Read**,
  **Lens** and **Source**. The bright one is the window's mode, as the status line says it; a click switches straight
  to another, from source mode to the lens too. A mode the file can't be shown in is in italics, and a click on it says
  why: a plain text file and a data file that doesn't parse have only Source. The command palette has them as Read
  mode, Lens mode and Source mode, to bind keys to.
- **Window header** in `space u u`, or `ui.window_header = false`, hides the whole row and gives it to the note, as
  hiding the breadcrumb used to.
- Report a problem from inside slipbox: `space r` (or `:report`) opens the bug form's questions in a window, with the
  version, how slipbox was installed, the system, the terminal and its size, any multiplexer and SSH already filled
  in. The screen as text, or where you were, goes in only when you add it, in full. `ctrl+s` sends it the way you
  choose: the bug form in your browser, filled in; its address or the report copied (over SSH, to your own
  clipboard); or posted with `gh` after a yes. slipbox itself sends nothing. `slipbox report` (and `--json`) prints
  the same facts and the form's address, for an agent writing an issue.
- A picture at its own size: click it, or press `z p` on its `▣` line. A picture wider than the window then scrolls
  sideways on its own, with a scrollbar under it, by `z h` and `z l`, a sideways wheel or the wheel with `shift`, and
  the text around it stays as it was. Click it or press `z p` again to fit it to the window.
- When a newer version is out, slipbox offers it in a small window rather than a message: upgrade and restart, upgrade
  now and restart later, or not now, with a box to skip that version. Upgrade and restart installs it and starts it in
  the same terminal, where you were, with your tabs and windows; a failed upgrade starts the version you had and says
  why. Homebrew's install copies `brew upgrade slipbox`, one put by hand the releases' address. `:restart` starts
  slipbox again, asking first about notes with unsaved changes; `:upgrade` asks for a newer version at once. A version
  installed while slipbox runs, from another terminal or by `brew upgrade`, is offered as a restart.

### Changed

- New slipbox branding in the README, documentation header, favicons and shared-link card, with variants for light
  and dark backgrounds.

- slipbox describes itself by what you do with it: "Read, review and edit what your coding agent writes, in your
  terminal", in its README, its help, its package, its Homebrew formula and its docs, instead of "the terminal
  companion for coding agents".

- **Breadcrumb** in `space u u`, and `ui.breadcrumb = false`, hide only the headings now. The window header stays, with
  its buttons and, in a split, the window's name. To hide the whole row as before, use **Window header**
  (`ui.window_header = false`).
- A peek into a vault with no index here builds one, and lists the note's backlinks when it's done, instead of saying
  there are none to show yet. Your home folder's index is still left to the background index.
- A picture is fitted to its window rather than drawn at most 12 rows tall: as wide as the text column, never larger
  than its own size, and no taller than the window, so a wide screenshot is drawn as wide as the text beside it. It's
  never made smaller than 12 rows tall or 20 columns wide. While you resize a window, its pictures wait and are drawn at
  the new size when you stop.
- Where you are is on the top bar now, in its middle: the vault, its branch, and a folder of home you opened by name
  (`◈ kestrel · main ↑2`, `◈ ~ › notes`, `Elsewhere`). Click the vault to go into another named folder, or the branch
  for the branches, pull, push and fetch. The status line names the vault only while the top bar doesn't show it, so the
  file's path has its room. On a narrow screen the top bar cuts it a step at a time: a long path first, then the branch,
  the vault's name last.
- What slipbox brings back of your work in a place, your tabs and windows, is called your workspace, apart from the
  vault: a vault is what's shared, its notes and settings, and a workspace is yours, kept on your machine. Each branch
  and each folder of home opened by name has one, as before; the docs and messages say workspace where they said
  session.
- When your home folder's index is full, the message names the folders it holds whole as the folders open (`~/notes,
  the folder open, is whole`): the one you opened by name, and those of the tabs slipbox brought back.
- `slipbox upgrade` runs one at a time per install, never moves back to an older version than the one installed, and
  keeps the version running as well as the one it replaced. A version already downloaded is installed without
  downloading it again.

### Fixed

- The agent guide's Markdown on the documentation site, which an agent can fetch on its own, links the other pages by
  their full addresses. Its links were relative to the docs folder and led nowhere on the site.
- `:!cmd`'s window lists a command's errors among its output, in the order the command wrote them. A command that
  printed both quickly had all its output listed first, then all its errors.
- A character a command printed in two pieces, such as an em dash, an accented letter or an emoji, is kept whole: in
  `:!cmd`'s window, and in the lines a filter (`:%!cmd`) puts in the note. It came out as replacement characters (`�`).
- A filter (`:%!cmd`) puts in up to 32 MB of what a command prints. Past 2 MB, the most its window shows, the lines
  were left as they were and its output called cut short. And a window cut at 2 MB says so when the last piece the
  command printed is the one past the limit.
- A file's linters each show their findings as soon as they answer. A slow linter beside a quick one kept the quick
  one's findings off the screen until it had answered too, for up to its 30-second limit, unless something else
  redrew the screen.
- `:w!` in a floating window (a note's properties, a commit's message, a hover) no longer writes its text to a stray
  file named after it, beside the note or where slipbox was started: it does what `:w` does there.
- `ctrl+l` in a peek no longer ticks the task in the peeked note, which can be another vault's: a peek is read-only,
  and says so.
- A slow disk, such as a network share or a drive that's asleep, no longer freezes the screen while the background
  index walks and indexes your home folder and the vaults in it, or while the explorer lists a folder outside the vault
  you're in. Both read the disk in the background now: a folder being listed says `listing…` until it answers, and
  says `can't read: no answer in time` if it hasn't within ten minutes; home's walk, given up on after five minutes,
  says
  so and tries again ten minutes later.
- A followed link that leads out of the vault can be renamed or moved itself, from the explorer or with `slipbox mv`.
  The link moves and stays followed, what it leads to stays where it is, and a relative link moved to another folder
  still leads to the same place. Before, the move was refused as `… resolves outside the vault`.
- A rename that rewrote a link in a note reached through a file link wrote the note over the link, as a copy, and left
  the note the link leads to unchanged. It's written through the link now, or, where the link leads into a hidden
  folder, left as it is, and the preview says so.
- Renaming a symlink onto the file it leads to (`slipbox mv alias.png img.png`), or onto another link to the same
  file, put the link in the file's place: the file was lost, and the link led to itself. It's refused now, as moving
  onto anything else already there is.
- A rename or move that couldn't write one of its files, in a folder you can't write, or whose note was gone since its
  plan, stopped half done. Nothing is changed now, and it says why.
- Renaming a note onto another name the same file has, a hard link, said it was done and left the old name as it was.
  It's refused now, as moving onto anything else already there is.
- A peek into another vault shows the note at once, its backlinks listed when they're ready. The first peek into a big
  vault held every key while that vault was read. A later peek lists them as the vault is then: they were those of the
  first peek, whatever had changed there since.
- A release is on the installer's site as soon as it's published, so `curl … | sh` and `slipbox upgrade` on the stable
  channel find it at once. 0.5.0's wasn't until the site was deployed again, an hour later.
- With `render.mermaid = "picture"` on a machine without a sans font (DejaVu, Liberation, Noto, Arial or Helvetica), a
  Mermaid diagram is drawn in characters again, as the manual says. 0.5.0 drew it as a picture without its words.
- Typing a link's target is quick again with many vaults. Once what you typed matched no file, each key built the list
  of files again, from every other vault: with 300 vaults, about half a second a key. The list is now made as you start
  the target and kept while you type it, so a note made meanwhile isn't in it; typing on looks only among the files
  that already matched, and building the list takes a fraction of the time it did.
- A paste while a completion list shows closes it: the next `tab` or `enter` no longer writes the chosen item over what
  you pasted. And `.` after completing a link and typing on repeats all of it, the new line included.
- Before your home folder's first walk, a file saved in a folder of home no longer has slipbox read every folder in it
  at once, and a folder new in home isn't read whole: they wait for home's walk, made a little at a time while nobody
  is working, as the manual says. 0.5.0 read them on the spot, which could take thousands of notes in at once.
- A folder deleted or moved away outside slipbox takes its files with it from the index, not only its notes: a link or
  embed to a data or text file in it is said broken at once. 0.5.0 kept them until the folder's vault was walked again.
- In your home folder, notes brought into a folder that sets its time back, as `cp -a`, `rsync -a` or unpacking an
  archive with its times do, are found the next time home is opened or a command runs there, even when the folder's
  time is put back to exactly what it was. They used to wait for home's next walk or `slipbox index --refresh ~`. A
  home walked by an earlier version gets this once it's walked again: by the first command run there, or by the TUI's
  background index.
- In your home folder, a folder slipbox couldn't read when it walked home has its notes found once it can be read, at
  the next command or start. They used to wait for home's next walk. A home walked by an earlier version gets this once
  it's walked again, as above.
- A message said once git answers in the background shows at once: git refusing to make or remove a worktree, open a
  branch in one or switch branches, from the git panel's Branches or the status line, and a branch file too big for a
  diff. 0.5.0 showed it only once something else was drawn, such as the next key or the message before it going away.
- In the git panel's Branches, what git did before it refused shows at once: a worktree removed while its branch was
  kept, a new branch made but not checked out, or one whose new worktree was stopped or refused by a hook, which now
  keeps its base too. A new branch is selected once it's listed, its section unfolded to it, so `o` goes into its
  worktree when it has one; not if you've used the panel meanwhile, it isn't showing, or its filter hides the branch.
- Remove…'s question and Merge…'s menu no longer open over what you turned to while git was answering — another
  question, a note or the commit's message being typed in, a filter, a key sequence, a command waiting for its next key,
  selecting text, resizing panes — where your next key would have answered them; slipbox says so instead, to ask again.
  An answer that comes after you've gone into another vault no longer takes you into a new worktree or selects anything
  there, and a branch file's diff you've moved past no longer says anything.
- The git panel's rows no longer move under the pointer or the selection as git answers, so a click opens what you
  aimed at. Its repositories keep their order while the pointer rests on the panel's rows; when rows arrive above the
  one under the pointer, the list scrolls to keep it on its line; the row you selected stays selected; and a click or a
  key acts on the row you saw, or on nothing if it's gone.
- Outside a repository, the git panel's **More in home** unfolds and folds again by `enter` or a click. It answered "not
  in a git repository" instead.
- In a repository, with a row under **Other repositories** selected, the git panel's own keys work again: `i` types the
  message, `c` commits, `f` fetches. They did nothing there.
- Back in the explorer after the git panel, its selection is on the note you opened meanwhile, or on the folder the
  view zoomed out from, not on whatever row came to the place it had; filtered, the match you had selected stays.
- In your home folder, the tabs slipbox brings back have their folders walked at once, as a folder you open by name
  does. A note left open in a folder home's walk hadn't reached yet came back as a file home's index didn't know: no
  backlinks, its links not found.
- A note open before slipbox's index knew it is the vault's note once the index does: its backlinks there, its links
  found. Switching to a branch that brings a note its tabs hold, the note opened without them until you opened it
  again; so did one in a folder of your home folder walked since you opened it.
- A hidden or git-ignored note you open by its path, or one in a hidden or git-ignored folder, reloads when an agent
  changes it, once, and its links follow. Before, it kept showing what you opened.
- A note open through a symlink you look at, or forget, then follow is as one you open through it: in home and
  Elsewhere it takes typing again in the same window, read again first if it changed meanwhile; in a vault it does once
  the vault indexes the note, and is never saved through the link, as a vault never writes outside itself. Once you
  forget the link, nothing more is read through it, and nothing you typed is written through it.
- A reindex (`space v r`) reads again an open note changed while nobody watched, once git has finished writing.
- An open note that git changes is reloaded once, however many times what git wrote names it.
- A task toggled (`ctrl+l`) in a note you're just looking at through a symlink isn't written through it, and in a
  vault a note too big to index, opened through a symlink you follow, is never saved through it. 0.5.0 wrote both
  where the link leads, out of the vault.
- An export says it's written as soon as its file is in place, before its temporary files are removed, and Cancel
  export chosen meanwhile says no export is running. It said nothing, and the export went on to say it was written.
  A warning that those files couldn't be removed is now the newest message, no longer pushed down at once by the
  export's.

## [0.5.0] - 2026-10-22

### Added

- Hidden files and folders in the explorer. `shift+h` there lists the files and folders whose names start with a dot,
  such as `.github` and `.env`, and hides them again; `:hidden` and the UI settings (`space u u`) do the same, and
  `files.hidden = true` lists them from the start, in your configuration or a vault's own. They are marked `⊘`, not
  indexed, and the status line says `hidden` with the cursor on one. A hidden file you open from the explorer is
  indexed from then on, as one opened by its path is, except in your home folder. `.git` is never listed, home's index
  still leaves hidden folders out, and the switcher and search list only what's indexed.

- `slipbox [path] --base <ref>` opens the screen with the branch checked out there measured against `<ref>`, kept for
  that branch as Compare against… keeps it: a worktree opened for a pull request measured as the pull request is
  (`slipbox . --base origin/dev`). A ref that names nothing exits 3 before the screen opens.

- Remote branches such as `origin/dev`, tags and commits work as a branch's base: in `[git] base` and `[git] bases`,
  with `--base`, and in Compare against…, which lists the remote branches and takes a typed branch, tag or commit
  (`HEAD~3` kept as its commit). With a remote branch as the base, This branch against says when a fetch last moved
  it.

- Tokyo Night Moon and Storm themes, alongside Night (the default) and Day. All four use official upstream palettes.

- The explorer's row menu (its `…` button, or `.`) has "Zoom in here" first for a folder, and "Copy path" for every
  row, which copies its whole path. `shift+y` in the explorer copies it too.

### Changed

- **Breaking:** `slipbox changed` and `slipbox diff` measure the branch against its own base, as the screen does: the
  one kept for it, else the nearest of `[git] bases`, else `[git] base`, main or master. `--base` still wins: a script
  that wants the old answer passes `--base main`. Their `--json` adds `baseChosen`: `given`, `kept`, `nearest` or
  `configured`.

- Documentation follows a new learning path, with Working with slipbox first and a dedicated reading/editing guide
  second. Feature explanations, task guides and exact references have distinct homes. Existing page addresses and
  section links are retained, and the screenshots are retaken for the new guides.

- Tokyo Night uses the official Night background and foreground, replacing the darker, softer custom colours.
  Night and Day also use upstream colours for strong text and syntax accents; user colour overrides still apply.

- Export output is staged on disk, in slipbox's cache folder, and published with bounded copying, keeping large
  documents and Markdown's attachments out of the interface's memory. PDF releases completed pages, EPUB writes its
  entries as they're made, and HTML writes one chapter at a time. Cancellation remains available while output is copied
  into place.

- Remote pictures download incrementally with bounded active and waiting requests. Quitting cancels transfers and
  removes partial cache files; completed pictures and existing consent choices work as before.

- Pending Mermaid diagrams label their source `mermaid — drawing…`. Completed text and SVG drawings are cached on
  disk for reuse by later sessions, command rendering and export; the cache is bounded and optional.

- Code parsing and structure extraction run in the background, keeping large source files responsive while their
  outline and code view prepare. Replies from superseded revisions are ignored. If the structure can't be had, a
  message says why; when its thread ran out of time or stopped, opening the file again tries once more.

- Linters and tool installs are stopped cleanly. slipbox reads up to 16 MiB of what a linter prints, and 1 MiB of an
  install's output. A linter run that prints more shows none of that run's findings and says why once, and linting
  stays on. A run that takes too long, or that a signal ends, shows no partial findings either. Quitting slipbox, or
  ending it with Ctrl-C or by closing its terminal, stops the linters and installs it started.

- Language servers: a request not answered in ten seconds (a diagnostics request: sixty; `slipbox diagnostics
  --timeout` sets both) is cancelled, and the server keeps running. Past 64 unanswered requests, more wait their turn.
  Diagnostics are asked for a few files at a time, and again after a save or the server's refresh. Malformed or excess
  diagnostics are left out, with a message. Only a response slipbox can't read stops a server, which is started again.

- Big notes and spelling checks running in the background take their turn: when many big notes wait at once, as
  when a vault is first indexed, none is turned away. A note whose thread runs out of time or stops is shown as its
  source, with a message saying why. Opening it again tries once more, and the index reads its links, tags and
  headings all the same. A spelling check that fails leaves its words unmarked and checks them again a moment later.

- Git history, blame and old versions load asynchronously and discard results for obsolete views or revisions.

- SVG processing, math conversion and image decoding run in the background, keeping their text visible while
  pictures prepare. Large previews use bounded pixel caches.

- Exports prepare in the background with progress stages and a Cancel export command. The destination is checked
  again before the completed output is written.

- Clipboard helpers run in the background with a timeout, keeping slow system clipboard tools off the UI thread.

- Regex find and replace run in the background: a regex that never finishes no longer stops the screen. The find row
  says `searching` while it works and `search failed` if it can't finish, and `enter` tries again. A replace, and
  `slipbox find`, still take every match, however many; a replace that can't finish changes nothing.

- Diagram layout runs in the background, with a rendering deadline and a bounded result cache. Diagrams that exceed
  the rendering limits remain readable as source, with a specific reason. Notes with many diagrams are processed in
  batches; CLI rendering and export allow five seconds per diagram without automatic retries, independently of the
  screen.

### Removed

- The releases up to 0.4.0 aren't published any more, and their downloads are gone: 0.5.0 is the first release since.
  A slipbox already installed keeps working, and `slipbox upgrade` or `brew upgrade` brings it to 0.5.0.

### Fixed

- A language server that never finishes starting is stopped even if it ignores graceful termination.

## [0.4.0] - 2026-10-17

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
- With the explorer's cursor on a row marked `⊘`, the status line says why it isn't indexed, until the cursor moves
  off: `⊘ not indexed: generated (node_modules), git-ignored`, `walk.exclude`, `on another disk`, `a link not
  followed`, `over walk.max_file_size`, and the others. Where two things hold, both are said. The Info view says it
  too, of the file on screen.
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
  hooks. A rebase over uncommitted changes, `shift+r`'s or a pull's, asks "Stash your changes, rebase, put them back?"
  instead of failing; yes stashes them, rebases and puts them back. Where they clash with what the rebase brought in,
  git keeps them in the stash, and the message names it and the files in conflict.

### Changed

- **Breaking:** an export writes over a file that's there only when it's an earlier export. Any other file is left as
  it is: `slipbox export` exits with 5 and says so, and `--force` writes over it. In slipbox, the Save As window asks
  `Replace coffee.docx? It isn't an export.` An earlier export is replaced in every format, now without that question,
  since each carries a mark that says slipbox wrote it ([Earlier exports](docs/manual/export.md#earlier-exports)).
  Word documents carry theirs from this version on, so one exported before is asked about, or needs `--force`, once. A
  note is still never written over, not even with `--force`. A script that exports over a file of its own adds
  `--force`.
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
  each folder you open by name keeps its own tabs, as before. That folder is indexed whole: its notes count toward the
  10,000, home's deepest other notes making room for them, and the message says it's whole when home is full. Changing
  `walk.extensions`, `walk.exclude` or `walk.root_markers` walks home again. The background index indexes home's notes
  before the vaults in it. `slipbox info` says `mode` `home` there ([Home](docs/manual/links-and-vaults.md#home)).
- The explorer lists `node_modules`, the other folders tools fill (`build`, `dist`, `target`, `vendor`, `__pycache__`,
  caches…), what `.gitignore` and `walk.exclude` leave out, and home's `Downloads`, each marked `⊘`. You can unfold
  them and open their files; nothing in them is indexed. A folder you may not read is listed too, marked `⚿`. Every
  vault's index now leaves those busy folders out, as home's did, when they look made by a tool: `.gitignore` leaves
  them out, or no note is directly in them. A folder of notes named `build` or `vendor`, notes at its top and not
  ignored, stays indexed. Nothing new goes where nothing would find it: a new note, a move or a copy into an ignored
  busy folder, or deeper in one with no note at its top, is refused, in the explorer, as a typed path, and on the
  command line (`write --create`, `mv`, `cp`: exit 5). A note already there can still be changed. `node_modules` is
  decided the same way, so a note already in one can be changed too.
- A note written where `walk.exclude` leaves it out is still written, and now says it isn't indexed. In the explorer,
  that folder's `⊘` row takes a new note, a new folder or a paste, as a path typed into it did; a busy folder's row
  still refuses them. Made, saved, autosaved, moved, copied, exported as Markdown or captured there, the write's
  message ends with `(not indexed: walk.exclude)`, every time: `saved drafts/plan.md (not indexed: walk.exclude)`. On
  the command line, `write`, `mv`, `cp` and `export` say it in their line and add `notIndexed` to their `--json`;
  `capture` and `mkdir`, whose output is a path, say it as a warning.
- `:e` opens a file in a busy folder (`node_modules`…), in what `walk.exclude` leaves out, in `.git` or, in home, in
  what its index leaves out (`Downloads`, hidden folders), as the explorer opens it: by its path from the vault's top
  or its whole path, on screen, never indexed, and Info says why. It said `no note or file` before. A file of a vault
  inside this one, opened so, goes into that vault. In a vault, a hidden or git-ignored file still joins its index once
  opened.

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
- `:e` with a file's whole path inside the vault opens it, as its path from the vault's top does. A data file, or a
  git-ignored note, named that way said `no note or file`.
- `esc` after typing at the end of a line could leave the cursor one character short, and `g i` then typed before the
  last character instead of after it. It happened when `esc` came just as something finished in the background, such
  as the vault's index or a grammar loading.

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

[Unreleased]: https://github.com/remziduzagac/slipbox/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/remziduzagac/slipbox/releases/tag/v0.5.0
