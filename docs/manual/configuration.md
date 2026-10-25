# Configuration settings

<a id="configuration"></a>

slipbox works with no configuration at all. Every setting has a default, and you write down only what you change.

Settings are TOML. They are in a file of your own. A folder that wants its own settings has them in its
`.slipbox/config.toml`.

This reference lists every setting and default, colours, indentation, spelling dictionaries and reloading.
For file locations, precedence and a first change, see [Customization](customization.md). Environment variables and
state paths are in [Environment and storage locations](environment-and-storage.md).

## Changing a setting

For creating a file, understanding precedence and checking a live change, follow
[Customization](customization.md#changing-a-setting). The complete defaults and setting syntax are below.

<a id="the-order-they-apply-in"></a>
<a id="what-only-your-own-file-can-set"></a>
<a id="a-folders-name"></a>

## A folder's settings

See [A folder's settings](customization.md#a-folders-settings) for scope, precedence and which settings a vault
cannot set. The [trust policy](privacy.md) describes the boundary around programs and network access.

## Mistakes in a file

A setting with an invalid value keeps its default and produces a warning. See
[Mistakes in a file](customization.md#mistakes-in-a-file) for an example and diagnostic steps.

## Every key

This is every setting, with its default. The tables from `[types.memory]` on are examples. What they hold by default is
empty, or built in. Ranges are inclusive.

```toml
theme = "tokyo-night"          # a built-in theme, "terminal", "mono", or one of yours (see Colours)

[render]                       # how notes and files are drawn
inset = 4                      # 0–40: columns kept clear right of the text (at least 1, at most 5% of the window)
max_width = 0                  # 0–1000: the TUI's text column at most this wide; 0, the whole window
glyphs = "auto"                # icons and marks: auto (from the terminal) | nerd | unicode | ascii
show_urls = "auto"             # a link's address after its text: auto (only without colour) | always | never
notes = true                  # Markdown opens in READ; false opens SOURCE
code = true                   # supported code opens in READ; false opens SOURCE
data = true                   # data that parses opens in READ; false opens SOURCE
code_cells = "box"             # the code view's cells: box (framed) | band (on a tint); space u c switches
code_wrap = "scroll"           # a code block too wide, in the TUI: scroll (sideways, its lines whole) | wrap (↪)
images = "auto"                # a note's pictures: auto (drawn where the terminal can) | never
images_remote = "ask"          # your file only. Pictures on the internet: ask (enter fetches one) | show (fetched as
                               # the note opens) | never (neither fetched nor drawn)
mermaid = "text"               # a Mermaid diagram: text (in the terminal's characters) | picture (where pictures
                               # are drawn)
math = "text"                  # a display's maths: text (Unicode) | picture (typeset, where pictures are drawn)

[walk]                         # which files a vault holds
extensions = ["md", "markdown"] # a note's extensions; never empty
exclude = []                   # left out, in .gitignore's syntax, besides what .gitignore (in home, its skip
                               # list) leaves out
max_file_size = 4194304        # bytes (4 MiB), 1 to 1 GiB: a larger note is listed as skipped, not read
root_markers = [".git", ".slipbox", ".obsidian", ".zk"]   # a folder holding one is a vault; your file only

[links]                        # how the links slipbox writes look (see The links' convention)
style = "auto"                 # auto | markdown | wiki
path = "auto"                  # auto | relative | root (from the vault's top: /…) | name (a wikilink's only)
extension = "auto"             # auto | keep | drop: the .md

[trust]                        # vaults whose own tools may run; your file only
roots = []                     # paths and globs, each with what's inside it: ["~/Projects/*", "~/notes"]

[files]                        # files besides notes, in the explorer and the switcher
show = "auto"                  # auto (renderable in a vault with .slipbox/, else all) | notes
                               # | renderable (notes and data files) | all (every text file)
include = []                   # always listed, in .gitignore's syntax: ["*.ts", "scripts/"]
exclude = []                   # never listed, in .gitignore's syntax
hidden = false                 # hidden files and folders listed too, never indexed (.git never); shift+h there

[ui]                           # the screen
sidebar = true                 # the explorer open beside the text on a wide terminal
sidebar_width = 30             # 8–200; drawn from 12 to half the terminal, leaving the text 24 columns
outline = false                # the outline open on the right on a wide terminal
outline_width = 32             # 8–200; drawn as the explorer is
split_ratio = 0.5              # 0.2–0.8: the first window's share of a split
lines = "light"                # the frame's lines: light (─ │) | heavy (━ ┃)
window_header = true           # the row atop each window: a split's name, the breadcrumb, Read · Lens · Source, ▤
breadcrumb = true              # the headings the cursor is under, on each window's header
left_rail = true               # a column of buttons down the left edge: the explorer's ≡
right_rail = true              # a column of buttons down the right edge: the outline's ▤
mouse = true                   # clicks, the wheel and dragging; space u m
narrow_width = 90              # 0–1000: on a terminal narrower, the explorer and outline open over the text
restore_session = true         # started on a folder rather than a note, the tabs and splits you left
cursorline = true              # a band on the cursor's row; space u l
line_numbers = true            # each row's line in the file, in a gutter; space u n
relative_numbers = "lens"      # lens | source | both | off; source uses relative line numbers in its gutter
wrap = true                    # lines wrapped to the window; false: they keep their width, scrolled sideways
readable_width = false         # the text column at most readable_max wide, centred; space u shift+w
readable_max = 100             # 20–1000
zen = false                    # only the text: no bars, panes, tabs or frame; readable width on; space u z
scrolloff = 3                  # 0–50: rows kept between the cursor and the window's top or bottom
history_limit = 100            # 0–2000: notes read elsewhere that the history lists (space h h); 0, none

[input]
leader = "space"               # the key `leader` stands for in [keys] and [groups]
which_key = true               # the popup of what can follow a key that starts a sequence
which_key_delay_ms = 500       # 0–10000: its wait (the leader shows it at once); also how long a key that is
                               # both a binding and the start of a sequence waits before it runs

[capture]                      # the scratch
location = "state"             # state (slipbox's state folder, never committed) | root (in the vault)
file = "scratch.md"            # a relative .md path, no "..", nothing hidden; in the vault, a scratch that is a
                               # symlink, or a path leading out of the vault, keeps it in the state folder
open_in = "float"              # where it opens: float (in the middle, over the windows) | right (the window on
                               # the right); space u u switches

[git]
base = ""                      # the branch or commit changes are measured against (origin/dev, a remote branch,
                               # too); "": main, else master
bases = ["main"]               # the bases a branch's own is guessed among: the nearest; each listed is measured
                               # against those before it, the first against none; remote branches too
worktrees = "{parent}/{repo}-{branch}" # where a worktree slipbox makes goes: {parent} the folder holding the
                               # repository, {repo} its name, {branch} the branch's, made safe; ~ home; your file only
signs = true                   # the lines changed from what's staged, marked in the gutter
signs_at = "gutter_right"      # where: gutter_right (its last column, against the text) | gutter_left (its first,
                               # before the line numbers) | window_right (the window's right edge, by the scrollbar)
diff = "blocks"                # a note's diff opens as: blocks (each changed block before and after) | source (its
                               # lines); tab in the diff switches
diff_layout = "auto"           # a code file's diff: auto (side by side where each side gets 80 columns) | unified
                               # (one column) | split (side by side)

[search]                       # searching across notes: space f s, slipbox search
engine = "auto"                # auto (the index once it's built, else a scan) | index (built first) | scan (no index)

[index]                        # the background index of your home folder, in the TUI
background = true              # home's notes and the vaults under ~ slowly indexed: their links become backlinks
idle_seconds = 30              # 1–86400: it works only once nobody has pressed a key or run a command this long

[diagnostics]                  # a file's problems, where they are
bar = "auto"                   # a column beside the text, while line numbers are off: auto (once the file has had
                               # problems) | on | off; space u d
marks = "error"                # problems marked in the text, from this severity up: error | warning | info | off
severity = "warning"           # the least severe shown: error | warning | info | hint (a link to a note not
                               # written yet is info)

[lsp]                          # language servers for code
enabled = true                 # their problems, hover, definitions, renames, completion
auto_install = true            # your file only. Servers published on npm, and markdownlint-cli2 for [lint],
                               # installed into slipbox's own folder when first needed, each at the version slipbox
                               # pins

[update]                       # your file only
check = true                   # a release's TUI asks once a day whether there's a newer release, and offers it;
                               # DO_NOT_TRACK turns it off too. The command line never asks; :upgrade asks anyway

[context]                      # the context bundle: space s c, slipbox context
depth = 1                      # 0–5: links followed out from the note; 1, what it links to; 0, none
backlinks = true               # the files linking to it, too
limit = 25                     # 1–500: at most this many files; the rest are named, not included

[editor]
command = ""                   # space n e: your editor, run here while slipbox waits; "": $VISUAL, else $EDITOR,
                               # else vi; your file only (see Commands in settings)
autosave_ms = 30000            # 0–3600000: a changed note saved after this long without a key; 0, never
edit_in = "lens"               # where i, a, o… take a rendered window: lens | source
lens_min_rows = 6              # 1–200: the lens takes in the blocks around the cursor up to at least this many rows…
lens_max = 0.5                 # 0.1–1: …and stops at this share of the window
auto_pairs = false             # typing ( [ { " ' or ` puts its closing pair after the cursor
remote = ["nvim"]              # space n s: an editor already running, to send the note to; "nvim" finds the
                               # running nvims (space n p picks); else commands, run in order; your file only

[spell]                        # spelling in notes; space u s turns it on or off
enabled = false                # misspelt words marked
languages = ["en"]             # a note's languages when its front matter names none (lang: tr)
dictionaries = {}              # your own, by language: { de = "~/dicts/de_DE.dic" }, its .aff beside it

[lint]                         # your markdownlint's findings in notes
enabled = "auto"               # auto (markdownlint-cli2 where there's a markdownlint config, the vault's or
                               # ~/.markdownlint-cli2.jsonc; your command always) | on | off (nor any [linter])
command = []                   # []: markdownlint-cli2, found or installed; else your linter's arguments, the
                               # files added at the end; your file only

[watch]                        # noticing what changes on disk
enabled = true
debounce_ms = 120              # 0–10000: changes gathered this long before they're shown
poll_ms = 2000                 # 50–600000: how often folders are checked for what watching missed

[types.memory]                 # a document type of your own; skill and adr are built in
paths = ["memory/*.md"]        # its notes: globs from the vault's top; paths = [] turns a type off
required = ["name", "description", "metadata.type"]   # keys each must have; dotted: a key inside a table
keys = { name = "string", created = "date" }          # a key's kind, when it's there: string, number, boolean,
                                                      # date, list, table
values = { "metadata.type" = ["user", "feedback", "project", "reference"] }   # a key's allowed values
# number = "^(\\d+)"           # a pattern on the file's name whose first group is its number: their order
# status = "status"            # the front matter key of its status; else a Status: line, or a ## Status section

[language-server.pyright]      # a language server, as Helix's languages.toml has it: changed by name
config = { python = { analysis = { typeCheckingMode = "strict" } } }   # its settings, merged all the way down
# command = "/opt/bin/pyright-langserver"   # these three in your own file only:
# args = ["--stdio"]                        # what runs is yours to say
# environment = { PYTHONPATH = "src" }

[[language]]                   # a language: its servers (the main one first), roots, file types, linters
name = "python"
language-servers = ["pyright", "ruff"]   # or { name = "ruff", only-features = ["diagnostics", "format"] }
linters = ["mypy"]             # its linters without a server, each a [linter.<name>]

[linter.mypy]                  # a linter without a server, in efm-langserver's keys: changed or added by name
lint-command = "mypy --show-column-numbers --no-error-summary"   # run by sh; your file only
lint-stdin = false             # true (the default): the text as typed, on its input; false: the file as saved,
                               # its path added at the end unless the command has ${INPUT}
lint-formats = ["%f:%l:%c: %trror: %m", "%f:%l:%c: %tarning: %m", "%f:%l:%c: %tote: %m"]   # vim's errorformat
lint-source = "mypy"           # who it says found them (its name by default)
lint-severity = 2              # without a %t: 1 error (the default), 2 warning, 3 information, 4 hint
lint-ignore-exit-code = false  # true: what it prints read even when it exits 0 (taken as nothing found)
root-markers = ["mypy.ini", ".mypy.ini"]   # it runs in the nearest folder holding one…
require-marker = true          # …and only where there is one

[keys]                         # key sequence = command, over the defaults; "" unbinds one
"leader j s" = "scratch.open"
"g m" = "shell.run make"       # a command with its argument; one that runs a program, in your file only
"ctrl+o" = ""                  # ctrl+o does nothing now

[keys.source]                  # SOURCE view's own keys, tried before [keys] (x deletes a character there)
[keys.visual]                  # visual mode (the moving keys extend the selection by themselves)
"shift+y" = "visual.yank"

[keys.explorer]                # key = the explorer's action (see Keys, aliases and groups)
"shift+o" = "open_split"

[keys.git]                     # key = the git panel's action
"shift+s" = "stage_all"

[keys.outline]                 # key = the outline's action
"z a" = "fold"

[keys.footnotes]               # key = the footnotes pane's action
"x" = "delete"

[keys.info]                    # key = the Info view's action
"c" = "copy"

[keys.resize]                  # key = resize mode's action
"w" = "wider"

[aliases]                      # : commands of your own: alias = command; "" removes a default
sc = "scratch.open"

[groups]                       # which-key's name for a prefix: "name", or "name: what's under it"
"leader j" = "jot: the scratch"

[colors]                       # a theme's roles changed, over any theme (see Colours)
tree_guide = "#3b4261"         # text: the foreground
pane_title = { fg = "#8c95b0", bold = true }

[colors."tokyo-night"]         # only while this theme is in use
breadcrumb_band = { bg = "#1d1e2b" }
rail = { bg = "#0f0f17" }
```

What each setting does in use is in its chapter:

| Settings | Chapter |
| --- | --- |
| Drawing and pictures | [Reading](reading.md) |
| The panes and bars | [The screen](screen.md) |
| The scratch, the lens, autosave, spelling and lint | [Editing](editing.md) |
| `[files]` | [Files](files.md) |
| `[git]` | [Git](git.md) |
| Servers, linters, problems and trust | [Code](code.md) |
| Search, the index and document types | [Finding things](finding.md) |
| The update check | [Privacy](privacy.md) |
| The context bundle | [The command line](cli.md) |

## Keys, aliases and groups

`[keys]` binds a key sequence to a command, over the defaults. `""` unbinds a default.

Keys are written as the [Keys](keys.md) chapter writes them. They are key names separated by spaces, such as `g g`,
`ctrl+w shift+h` or `leader l n`.

- `G` means `shift+g`.
- Modifiers may come in any order.
- `leader` means the key `input.leader` names.

A command is its ID, optionally followed by an argument: `"tab.goto 3"`, `"theme.set nord"`. `slipbox commands` lists
every command's ID. `?` in the TUI lists every key bound.

A key with a modifier slipbox doesn't know (`hyper+x`) is reported and never fires. It doesn't bind plain `x` instead. A
command that doesn't exist is reported too.

Each of the other tables holds the keys of one place, and is tried before `[keys]` there:

- `[keys.source]` holds SOURCE view's own keys.
- `[keys.visual]` holds visual mode's.
- `[keys.explorer]` holds the explorer's, and the Problems panel's. They are bound to its actions: `down`, `up`,
  `open_tab`, `expand`, `open`, `collapse`, `open_split`, `top`, `bottom`, `filter`, `all_files`, `toggle_hidden`,
  `new_note`, `new_folder`, `rename`, `rename_root`, `move`, `delete`, `restore`, `undo_rename`, `copy`, `cut`,
  `paste`, `make_root`, `unmake_root`, `menu`, `zoom_in`, `zoom_out`, `close`, `leave`.
- `[keys.git]` holds the git panel's. Its actions are `down`, `up`, `top`, `bottom`, `expand`, `collapse`, `open`,
  `go`, `menu`, `stage`, `unstage`, `discard`, `stage_all`, `unstage_all`, `message`, `commit`, `amend`, `fetch`,
  `pull`, `push`, `stash`, `new_branch`, `merge`, `filter`, `close`, `leave`.
- `[keys.outline]` holds the outline's. Its actions are `down`, `up`, `jump`, `fold`, `unfold`, `top`, `bottom`,
  `filter`, `close`, `leave`, `rename`.
- `[keys.footnotes]` holds the footnotes pane's. Its actions are the outline's moves (all of them but `rename`), and
  `add`, `edit`, `delete`, `rename`.
- `[keys.info]` holds the Info view's. Its actions are the same moves, and `copy`, `edit`.
- `[keys.resize]` holds resize mode's. Its actions are `narrower`, `wider`, `shorter`, `taller`, `equalize`, `leave`.

An action a pane doesn't have is reported.

`[aliases]` names commands for `:`. For example, `sc = "scratch.open"` makes `:sc` open the scratch. `""` removes a
default alias.

`[groups]` names a prefix in the which-key popup, as `"name"` or `"name: what's under it"`. The explanation shows under
the name. For a prefix of one key, such as `z`, it shows in its popup's title instead
([The which-key popup](screen.md#the-which-key-popup)).

## Commands in settings

`editor.command` and `editor.remote` are command lines that slipbox runs itself, never through a shell. So a file's name
can't become a command.

Each is split into arguments at spaces, with `'…'` and `"…"` grouping. In every argument, these placeholders are
replaced:

| Placeholder | Becomes |
| --- | --- |
| `{file}` | The file's path |
| `{line}` | The cursor's line |
| `{server}` | The nvim picked (in `editor.remote`) |

An `editor.command` without `{file}` gets the path added at the end.

- **An empty `editor.command`** runs `$VISUAL`, else `$EDITOR`, else `vi`. An editor slipbox knows is given the line
  in the way it understands. That is `+12` for vim, nvim, nano, emacs, kak and others, and `file:12` for helix and
  micro.
- **`editor.remote`** is a list of commands, run in order. Each is waited for before the next:
  `["code -g {file}:{line}"]`. One command may be written as text. `[]` turns it off.
- **`["nvim"]`** in `editor.remote` finds the nvims running. When there are several, it asks which. The answer is kept
  for the vault while that nvim runs. Then it opens the note there, at the line.
- **`lint.command`** is a list of arguments. The files to lint are added at the end, and a leading `~/` is made your
  home folder: `["markdownlint-cli2", "--config", "~/lint/.markdownlint-cli2.jsonc"]`.
- **A linter's `lint-command`** is run by `sh`, in the nearest folder holding one of its `root-markers`, else in the
  file's project. `${INPUT}` becomes the file's path.

Handing a note to an editor is in [Editing](editing.md).

## Language servers, languages and linters

These tables take the shapes other editors use, so a section from one pastes in:

- **`[language-server.<name>]`**, as in Helix's `languages.toml`, is a language server. It holds the server's
  `command`, `args`, `environment` and `required-root-patterns`, and its settings, `config`. The settings are merged
  into the built-in ones all the way down. A name slipbox knows changes that server. A new name adds one.
- **`[[language]]`**, also Helix's, is a language, found by its `name`. It holds its `language-servers`, `roots`,
  `file-types`, `language-id`, and its `linters`. The main server comes first, add-ons after. Each server is a name, or
  `{ name, only-features, except-features }`.
- **`[linter.<name>]`**, in efm-langserver's keys, is a linter that has no server. It is changed or added by name.

[Code](code.md) says which servers and linters are built in, and how they are found and installed. It covers
`slipbox doctor` too.

## Document types

A document type is a kind of note known by where it is. An agent's skill (`SKILL.md`) is one. An architecture decision
record in an `adr/` folder is another. A type says the front matter its notes must have, and the order they come in.

slipbox builds in two types:

| Type | Its notes |
| --- | --- |
| `skill` | Every `SKILL.md`, which must have a `name` and a `description` |
| `adr` | The `.md` files in `adr/`, `adrs/`, `decisions/` and `decision-records/` folders, numbered by their names |

`[types.<name>]` adds one of your own, or changes a built-in one field by field. `paths = []` turns one off. A folder's
file may set them too, since a type only reads.

What types are for, and how they are listed and ordered, is in [Finding things](finding.md).

## The links' convention

`[links]` sets how the links slipbox writes for you look. slipbox writes them with completion, the link picker
(`space l i`) or `slipbox link`.

`[links]` has three settings, one for each part of a link:

| Setting | Values |
| --- | --- |
| `links.style` | `auto`, `markdown` (`[Coffee](ideas/coffee.md)`), `wiki` (`[[coffee]]`) |
| `links.path` | `auto`, `relative` (to the note), `root` (from the vault's top, `/…`), `name` (a wikilink's only) |
| `links.extension` | `auto`, `keep`, `drop`: the `.md` |

`auto` is the default for each. It leaves the part to the folder, and takes the first of these:

1. what the app that owns the folder says (Obsidian, zk)
2. else what its notes already do
3. else a relative Markdown link with `.md`

A vault's `.slipbox/config.toml` may set them, and wins over your own file there.

[How a folder writes links](links-and-vaults.md#how-a-folder-writes-links) says:

- how each part is found
- what applies in Elsewhere
- how to see the convention a folder has

## Home and Elsewhere

Home, your home folder's own vault, and Elsewhere, everything outside home and every vault, have no `.slipbox/`. So
they take your own file alone ([Working across folders and vaults](../guides/vaults.md)).

Home's index leaves out a skip list: hidden folders, the system's folders (`Library`, `AppData`), `Downloads`, the busy
folders such as `node_modules`, and files that aren't notes or text ([Home](vaults.md#home)). No setting
changes the list, but these settings reach home too:

| Setting | In home |
| --- | --- |
| `walk.exclude` | leaves out more, in `.gitignore`'s syntax. Home reads no `.gitignore` of its own |
| `walk.max_file_size` | a larger note is listed as skipped, not read |
| `index.background` | `false` stops the background index. With home open, the TUI still indexes it |
| `index.idle_seconds` | how long nobody works before home is indexed, a little at a time |

Elsewhere has no index, so no setting about indexing applies there.

### Links that lead out

Your answers about symlinks that lead out of a vault, or out of home, aren't settings
([Links that lead out](vaults.md#links-that-lead-out)). No config file can follow one, a vault's least of
all, so a folder can't bring its links already followed. slipbox keeps the answers in `links.json`, in its state
folder ([State](environment-and-storage.md#state)). `space v l` lists them and forgets one, as `slipbox symlinks
forget <link>` does; removing
that file forgets them all. A link forgotten asks again.

They're a trust apart from `[trust] roots`, which says whose own tools may run ([Code](privacy.md#trust)).

## Colours

### Themes

`theme` picks the colours. It is one of these:

- **One of slipbox's themes.** `slipbox themes` lists them. `space u t` lets you pick one, previewed as you move.
- **`terminal`**, the terminal's own palette, so its theme shows through.
- **`mono`**, no colour, only bold, dim, italic and underline.
- **One of yours.** That is a base16 or base24 scheme saved as a `.yaml` file in `~/.config/slipbox/themes/`, named by
  its file name. Yours wins over a built-in of the same name.

An unknown theme is a warning, and slipbox uses `tokyo-night`.

Start the TUI with `--theme <name>` to use a theme for that run.

### Changing a colour

A theme gives a palette. From it, slipbox derives the colour of each of over a hundred roles, such as headings, links,
borders and the cursor.

`[colors]` changes single roles, over whichever theme is in use. `[colors.<theme>]` does so for that theme only.

- **Text** sets the role's foreground. **A table** sets any of `fg`, `bg`, `bold`, `italic`, `underline` and `dim`.
  Only the fields given change.
- **A colour** is one of these:
  - `"#rrggbb"`
  - `"default"`, the terminal's own
  - a terminal palette number from 0 to 255, as a number or as text: `12`, `"12"` or `"ansi:12"`
- **Under `NO_COLOR`** the theme is `mono`. So of the per-theme tables, only `[colors.mono]` applies. In `mono`, only
  the attributes apply, not the colours.
- **Mistakes** are warnings, and the rest applies. A mistake is an unknown role or field, or something that isn't a
  colour.
- **Changed colours apply wherever a theme does:** the TUI, its theme picker's preview, and `slipbox render`. Saving
  the file applies them at once.

### The roles

These are the roles of the screen most worth changing:

| Role | What it colours |
| --- | --- |
| `border` | the frame, the panes' borders and the rules |
| `topbar_chip` | the `slipbox` chip |
| `topbar_group` | the faint background of each top-bar group |
| `picture_caption` | a standalone picture caption's background |
| `topbar_button`, `topbar_button_on` | the rails', the top bar's and the window header's buttons: off and on |
| `topbar_button_disabled` | a window header's button for a mode the file can't be shown in (in italics) |
| `rail` | the rails' tint (its `bg`); with none, as under `NO_COLOR`, a rail is drawn with a border |
| `gutter` | the shade of the problems bar and the line numbers (its `bg`) |
| `git_sign_add`, `git_sign_change`, `git_sign_delete` | the gutter's signs for lines added, changed and deleted |
| `diff_add`, `diff_del` | a diff's added and removed lines: the sign's colour, the row's tint (its `bg`) |
| `diff_add_word`, `diff_del_word` | the words that changed in a changed line, on a stronger tint (its `bg`) |
| `cell_line` | a code cell's lines, and the tree's between a class and its members |
| `lens` | the lens's rules and label |
| `lens_band` | the lens's rows (its `bg`) |
| `lens_edit`, `lens_band_edit` | the same while typing in it |
| `tab`, `tab_active`, `tab_active_idle` | tabs; the active one with and without focus |
| `pane_title`, `pane_title_active` | the Explorer's and the Outline's titles, unfocused and focused |
| `breadcrumb`, `breadcrumb_current` | the breadcrumb's headings, and the one the cursor is under |
| `breadcrumb_band` | the window header's background (and, drawn as bands, the code view's cells) |
| `breadcrumb_icon`, `breadcrumb_sep` | the breadcrumb's icon and separators |
| `tree_guide` | the explorer's and the outline's tree lines |
| `sidebar_root` | in the explorer, a folder that is a vault of its own |
| `sidebar_mark` | in the explorer, a row's mark that it's indexed, at its end |
| `scrollbar`, `scrollbar_track` | the scrollbar's thumb and track |
| `cursor`, `cursor_line` | the cursor, and its row |
| `which_key_key`, `which_key_group` | the which-key popup's keys and group names |

Every role, by what it colours:

- **The text:** `text`, `dim`, `strong`, `emphasis`, `strike`, `highlight`, `h1` to `h6`, `code_inline`,
  `code_block`, `code_label`, `code_gutter`, `link`, `link_unresolved`, `link_ambiguous`, `wikilink`, `embed`, `url`,
  `link_focus`, `quote`, `quote_bar`, `list_marker`, `check_done`, `check_todo`, `rule`, `table_border`,
  `table_header`, `fm_key`, `fm_value`, `fm_border`, `fm_error`, `callout_note`, `callout_tip`, `callout_important`,
  `callout_warning`, `callout_caution`, `footnote`, `tag`, `html`, `image`, `math`.
- **Code's syntax:** `syn_keyword`, `syn_function`, `syn_string`, `syn_number`, `syn_comment`, `syn_type`,
  `syn_variable`, `syn_constant`, `syn_operator`, `syn_punctuation`, `syn_tag`, `syn_attr`, `syn_builtin`,
  `syn_meta`, `syn_regexp`, `syn_section`, `syn_addition`, `syn_deletion`.
- **Problems and spelling:** `syntax_error`, `problem_error`, `problem_warn`, `problem_info`, `spell`.
- **Git:** `git_new`, `git_modified`, `git_conflict`, `diff_add`, `diff_del`, `diff_head`, `diff_add_word`,
  `diff_del_word`, `git_sign_add`, `git_sign_change`, `git_sign_delete`.
- **The screen:** `border`, `status`, `status_accent`, `status_dim`, `sidebar`, `sidebar_dir`, `sidebar_selected`,
  `sidebar_active`, `sidebar_root`, `sidebar_mark`, `tab`, `tab_active`, `tab_active_idle`, `pane_title`,
  `pane_title_active`, `overlay`, `overlay_border`, `overlay_selected`, `overlay_match`, `overlay_dim`, `overlay_group`,
  `keycap`, `keycap_selected`, `selection`, `bracket_match`, `error`, `warn`, `info`, `scrollbar`, `scrollbar_track`,
  `cursor`, `cursor_line`, `line_number`, `line_number_current`, `gutter`, `cell_line`, `which_key_key`,
  `which_key_group`, `topbar`, `topbar_button`, `topbar_button_on`, `topbar_button_disabled`, `topbar_chip`, `hover`,
  `breadcrumb`, `breadcrumb_current`, `breadcrumb_sep`, `breadcrumb_icon`, `breadcrumb_band`, `tree_guide`, `rail`,
  `lens`, `lens_band`, `lens_edit`, `lens_band_edit`.

## Indentation: `.editorconfig`

slipbox has no indentation setting of its own. A project, or your home folder, says it in `.editorconfig`, the file most
editors read.

How a file is indented covers three things:

- a tab for each level, or spaces
- how many
- how wide a tab shows

slipbox takes it from the first of these:

1. its `.editorconfig` files' `indent_style`, `indent_size` and `tab_width`. They are read from the file's folder
   upwards, until one says `root = true`. Nearer files win over farther ones, and later sections over earlier ones.
   Their patterns are as the EditorConfig specification has them.
2. else the file itself: tabs where more of its lines start with one, else the step its lines go in by most often
3. else its language's habit:
   - tabs for Go, Makefiles and TSV
   - four spaces for Python, Rust, Java, Kotlin, Swift, PHP, C, C++, C#, Scala and Dart
   - two for the rest

That indentation is used in three places:

- Editing indents by that step ([Indentation and comments](editing.md#indentation-and-comments)).
- A tab is drawn that wide, else four columns wide.
- A language server asked to format the file (`space c f`) is asked to indent it so.

A save does what `.editorconfig` asks, and only then:

- `trim_trailing_whitespace = true` trims every line's trailing spaces and tabs.
- `insert_final_newline = true` ends the file with a newline.

Each is done in the text first, as an undo step of its own.

The Info view (`space n i`) says how a file is indented, and what said so.

## Spelling dictionaries

Spelling checks a note in its languages. [Spelling](editing.md#spelling) says which, and how to turn it on.

Each language's dictionary is the first found of these:

1. yours, in `spell.dictionaries`, by the language or its base (`de` for `de-AT`). It is the path to its `.dic`, with
   its `.aff` beside it.
2. else, for a language with a region, the system's dictionary for that very language (`en_GB` for `en-GB`), from
   these folders:
   - `~/.local/share/hunspell`
   - `/usr/share/hunspell`
   - `/usr/share/myspell` (and its `dicts`)
   - `/usr/local/share/hunspell`
   - Homebrew's `/opt/homebrew/share/hunspell`
   - macOS's `Library/Spelling` (yours, then the system's)
3. else slipbox's own, for English (American) and Turkish
4. else the system's first for its base (`de_DE` for `de`)

Dictionaries are Hunspell's, as LibreOffice and most systems have them. One in an encoding other than UTF-8
(`SET ISO8859-9`) is read in its own encoding.

You add your own words with `z g` or `slipbox spell --add`. They are kept one a line in
`~/.local/share/slipbox/spell/words.txt`, and count as right in every language. A line starting with `#` is a comment.

## Reloading

The TUI reloads its settings by itself when one of these files is saved:

- your file
- any of the vault's `.slipbox/config.toml` files, its own or an enclosing vault's

It checks every second, or every `watch.poll_ms` if that is shorter. `space v c`, or `:config`, reloads at once.

A reload applies what changed, and says so in a message:

| What changed | What happens |
| --- | --- |
| Keys, the leader, aliases and groups | Bound afresh |
| The theme, colours, icons and the `[ui]` settings | Shown at once |
| `ui.sidebar`, `ui.outline`, a pane's width or `ui.split_ratio` | What's on the screen is reset |
| `[render]` | Every note is drawn again |
| `[walk]` | The vault is walked, indexed and watched again |
| `[watch]` | The watching starts again |
| `[search]` | Searching starts again with it |
| `[lint]`, `[linter.<name>]` and `[[language]]` | Every file is linted again |

The rest is read where it's used, so it applies the next time. A language server already running keeps the settings it
started with until slipbox starts again.

### Settings changed in the TUI

You can change some settings in the TUI: the theme with `space u t`, and wrapping, line numbers, zen and the others in
`space u u`.

A change applies at once. It is kept for the vault, across its workspaces, with the setting it replaced. Another vault
keeps its own. It's yours: kept in slipbox's state, never in the vault's settings or your config.

On every start, and at every reload, a change is kept only while that setting in your files still has the value it
replaced. So editing the setting always wins. The TUI never writes your settings file.

With `ui.restore_session` on, a workspace brought back also brings back whether the explorer and the outline are open,
and their widths, as the vault last had them. A workspace with no tabs kept yet, such as a folder of home opened by
name for the first time, starts with your settings' panes.

<a id="slipboxs-own-variables"></a>
<a id="variables-slipbox-reads"></a>
<a id="variables-slipbox-sets"></a>

## Environment

Variables and their exact meanings are in [Environment and storage locations](environment-and-storage.md#environment).

<a id="config"></a>
<a id="cache"></a>
<a id="state"></a>
<a id="data"></a>

## Where slipbox keeps things

Paths for configuration, cache, state and data are listed in
[Environment and storage locations](environment-and-storage.md#where-slipbox-keeps-things).

Rendering settings choose the opening view; READ stays available for supported files when they are false.
The legacy `render.code` values `"document"` and `"source"` are read as true and false.
The old `editor.edit_in = "live"` is still read as `"lens"`.
