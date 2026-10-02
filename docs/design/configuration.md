# Configuration

TOML, in two levels, with the vault winning (plan `0.9`):

1. built-in defaults
2. the user file: `--config <file>`, else `$SLIPBOX_CONFIG`, else
   `$XDG_CONFIG_HOME/slipbox/config.toml`
3. the vault file: `<vault>/.slipbox/config.toml` (a git vault without `.slipbox/` has none, `20.3`); for a loose
   file, the home vault's, `$XDG_DATA_HOME/slipbox/home/config.toml`

**The vault's identity** is the vault file's `[vault]` table (plan `17.4`), read on its own and never merged into
the settings; in the user file it's ignored with a warning:

```toml
[vault]
id = "3f9c2a7be1d04c55"        # random, made by `slipbox init`, never changed: keys the cache and state
name = "notes"                 # what [[notes:page]] reaches it by; the folder's name until declared
aliases = ["n"]                # other names it answers to
previous_names = ["old-notes"] # names it had: a fallback only (17.7)
```

**What only you can set.** The vault file comes with whatever you clone, so it never chooses a
program slipbox runs: `editor.command`, `editor.remote` and `lint.command` there are ignored, with a
warning, and only your user file sets them (`USER_ONLY` in `core/config.ts`). The rest of `[editor]`
and `[lint]` applies. Likewise a language server's `command`, `args` and `environment`, a linter's
`lint-command`, and any server or linter slipbox doesn't build in: a vault tunes the known ones only.
Nor may its `[keys]` or `[aliases]` name a command that throws work away — `app.quit_force`,
`note.revert`, `note.save_force`, `scratch.clear` (`VAULT_FORBIDDEN_COMMANDS`) — so a clone can't put
one on `ctrl+s` or `:wq`; those bindings are dropped with a warning.

**A typo saved mid-edit.** When a file fails to parse on a live reload, it keeps what it said
before (its last good contents), with a warning — your theme, keys and picked settings stay — until
it parses again.

slipbox runs correctly with no config at all. None of these crash it:

- a broken file
- an unknown key
- a wrong type
- a value outside its set (`glyphs`, `show_urls`, `location`, `ui.lines`, `editor.edit_in`,
  `files.show`)
- a list with something other than strings in it, a mode's key table (`[keys.source]`…) given as a
  string, or an empty `walk.extensions`
- a number out of range (`inset` 0–40, `sidebar_width` 8–200, `poll_ms` ≥ 50…), or a fraction
  where a whole number is meant (only `ui.split_ratio` and `editor.lens_max` are fractional)

Each is a warning in the message sink (the TUI) or on stderr (the CLI). The key keeps its
default, and the rest of the file still applies.

## Every key

```toml
theme = "tokyo-night"          # a built-in, "terminal", "mono", or a file in ~/.config/slipbox/themes/

[render]
inset = 4                      # columns held back from the pane width (min 1, max 5% when narrow)
max_width = 0                  # cap on the text column in the TUI; 0 = full pane
glyphs = "auto"                # auto | nerd | unicode | ascii   (env SLIPBOX_GLYPHS overrides auto)
show_urls = "auto"             # auto (only without colour) | always | never

[walk]
extensions = ["md", "markdown"] # a note's extensions (a note is markdown, whatever its name)
exclude = []                   # gitignore syntax, on top of .gitignore
max_file_size = 4194304        # bytes; larger notes are listed as skipped

[files]                        # files beyond notes (16.x): what the explorer and ctrl+p list
show = "renderable"            # notes | renderable (notes and data files) | all (every text file)
include = []                   # gitignore syntax: always listed ("*.ts", "scripts/")
exclude = []                   # gitignore syntax: never listed

[ui]
sidebar = true                 # explorer beside the content on wide terminals
sidebar_width = 30             # 8–200; drawn 12 to half the terminal, the note keeping 24
outline = false                # outline pane on the right on wide terminals
outline_width = 32
split_ratio = 0.5              # first window's share of a split (0.2–0.8)
top_bar = true                 # palette chip, vault state (≡ and ▤ when their rails are off); space u u
lines = "light"                # the frame's lines: "light" (─ │) or "heavy" (━ ┃)
breadcrumb = true              # breadcrumb atop each window (with ▤ when there's no rail)
left_rail = true               # a column of buttons down the left edge: the explorer's ≡
right_rail = true              # a column of buttons down the right edge: the outline's ▤
mouse = true
narrow_width = 90              # below this, the explorer and outline open over the content
restore_session = true         # reopen tabs and splits when started without a path
cursorline = true              # band on the cursor row
line_numbers = false           # source line numbers in a gutter
wrap = true                    # wrap to the pane; false: natural width, scroll sideways
readable_width = false         # cap the text column at readable_max, centred
readable_max = 100
zen = false                    # no chrome; readable width on
scrolloff = 3                  # rows kept between the cursor and the view's edge
history_limit = 100            # notes read elsewhere the history lists (space h h); 0–2000, 0: none

[input]
leader = "space"               # the key `leader` means in [keys] and [groups]
which_key = true               # the popup for pending key sequences
which_key_delay_ms = 500       # before it shows for prefixes other than the leader; also how long a
                               # key that is both a binding and a prefix waits before it runs

[rename]
previous_names = true          # a renamed note keeps its old name in its frontmatter (17.15)

[capture]
location = "state"             # state (never committed) | vault
file = "scratch.md"            # a relative .md path; no "..", no hidden part (else the default);
                               # in the vault, a symlinked scratch or folder puts it in the state dir

[git]                          # git (5.11–5.14): space g, slipbox changed / diff
base = ""                      # the branch changes are measured against; "" = main, else master

[search]                       # search (6.x): slipbox search, space f s
engine = "auto"                # auto: the index once built, else a scan | index (built first) | scan (no index)

[diagnostics]                  # a file's problems where they are (19.8–19.11)
bar = "auto"                   # the bar beside the text: auto (once a file has had problems) | on | off
marks = true                   # problems underlined in the text
severity = "warning"           # the least shown: error | warning | info (a note not written yet) | hint

[lsp]                          # language servers for the code slipbox opens (19.x)
enabled = true                 # their problems, hover, jumps, renames, completion
auto_install = true            # servers on npm installed into slipbox's own folder when first needed (19.5),
                               # and markdownlint-cli2 for [lint] (19.21)

[language-server.pyright]      # a language server (19.2), in Helix's languages.toml shape: changed by name
config = { python = { analysis = { typeCheckingMode = "strict" } } }   # its settings, over the defaults
# command = "/opt/bin/pyright-langserver"   # these three only in your own config, never a vault's:
# args = ["--stdio"]                        #   what runs is yours to say
# environment = { PYTHONPATH = "src" }

[[language]]                   # a language: its servers (main first, add-ons after), roots, file types
name = "python"
language-servers = ["pyright", "ruff"]   # or { name = "ruff", only-features = ["diagnostics", "format"] }
linters = ["mypy"]             # its linters without a server (19.19), each a [linter.<name>]

[linter.mypy]                  # a linter without a server (19.19), in efm-langserver's keys: changed by name
lint-command = "mypy --show-column-numbers --no-error-summary"   # through the shell; yours only, never a vault's
lint-stdin = false             # true (efm's default): the text as typed on its input; false: the file as saved,
                               # its path appended unless the command has ${INPUT}
lint-formats = ["%f:%l:%c: %trror: %m", "%f:%l:%c: %tarning: %m", "%f:%l:%c: %tote: %m"]   # vim's errorformat
lint-source = "mypy"           # who it says found them (default: its name)
lint-severity = 2              # without a %t: 1 error (default), 2 warning, 3 information, 4 hint
lint-ignore-exit-code = false  # true: read what it prints even when it exits 0 (efm takes 0 as nothing found)
root-markers = ["mypy.ini", ".mypy.ini"]   # it runs in the nearest folder holding one…
require-marker = true          # …and only where there is one

[context]                      # the context bundle (9.7): space s c, slipbox context
depth = 1                      # links followed out from the note (0–5): 1, what it links to; 0, none
backlinks = true               # the files linking to it, too
limit = 25                     # at most this many files (1–500); the rest are named, not included

[editor]                       # {file} and {line} fill in inside arguments; never through a shell
command = ""                   # space n e: runs here, slipbox waits; "" = $VISUAL, $EDITOR, vi (+line)
autosave_ms = 30000            # save a changed note after this long without a key; 0 = off
edit_in = "source"             # where i, a, o… take a rendered window: "source" or "live" (the lens)
lens_min_rows = 6              # the lens takes in neighbouring blocks up to at least this many rows
lens_max = 0.5                 # …and stops at this share of the window
remote = ["nvim"]              # space n s: "nvim" finds the running nvims (space n p picks);
                               # else commands run in order, e.g. "code -g {file}:{line}", or
                               # ['nvim --server {server} --remote {file}', …], {server} picked

[lint]                         # the lint surface (3.21): your linter's findings in notes and the Problems view
enabled = "auto"               # auto: only with a markdownlint config (the vault's, or ~/.markdownlint-cli2.jsonc)
                               # | on | off (off: [linter.<name>] runs none either)
command = []                   # [] = markdownlint-cli2, found or installed into slipbox's own folder (19.21)
                               # (--config ~/.markdownlint-cli2.jsonc unless the vault has its own);
                               # else argv, files appended, "~/" expanded; yours only

[watch]
enabled = true
debounce_ms = 120
poll_ms = 2000                 # backstop tick, unwatchable directories, degraded mode

[keys]                         # key sequence = command spec; "" unbinds a default
"x" = "cursor.bottom"
"leader n n" = "switcher.open"
"ctrl+o" = ""

[keys.source]                  # source mode's own keys, before the reading ones (x = edit.delete_char)
[keys.visual]                  # visual mode (movement keys extend by themselves)
"Y" = "visual.yank"

[keys.explorer]                # key = explorer action: down up open_tab expand open
"p" = "open"                   #   collapse open_split top bottom filter close leave

[keys.outline]                 # key = outline action: down up jump fold unfold
"z a" = "fold"                 #   top bottom filter close leave (sequences: space-separated keys)

[keys.footnotes]               # key = footnotes action: the outline's, and add edit
"x" = "delete"                 #   delete rename

[keys.info]                    # key = Info action: the outline's, and copy
"c" = "copy"

[keys.resize]                  # key = resize action: narrower wider shorter taller
"<" = "narrower"               #   equalize leave

[aliases]                      # `:` aliases; "" removes a default
wq = "app.quit"

[groups]                       # which-key groups by prefix: "name" or "name: explanation"
"leader n" = "notes: reload, info"

[colors]                       # per-role overrides on top of any theme (see "Colours" below)
tree_guide = "#3b4261"         # a string sets the foreground
pane_title = { fg = "#8c95b0", bold = true }

[colors."tokyo-night"]         # only while this theme is active
breadcrumb_band = { bg = "#1d1e2b" }
rail = { bg = "#0f0f17" }
```

The notation is in [keymap.md](keymap.md): space-separated key names such as `g g`,
`ctrl+w shift+h` or `leader l n`. `G` means `shift+g`, and modifiers may be written in any order.
An unknown modifier (`hyper+x`) is reported, and the key never fires rather than binding `x`.
A command spec is a command id, optionally followed by an argument (`"tab.goto 3"`,
`"theme.set nord"`). `slipbox commands` lists every id, and `space ?` in the TUI lists every
binding.

## Colours

Themes supply a palette, and slipbox derives about 100 **roles** from it (the full list is
`ROLES` in `src/core/theme/theme.ts`). `[colors]` overrides single roles on top of whichever theme
is active, and `[colors.<theme>]` does so for one theme only.

- **A string** sets the role's foreground; **a table** sets any of `fg`, `bg`, `bold`, `italic`,
  `underline`, `dim`. Only the fields given change.
- **Colours** are `"#rrggbb"`, `"default"` (the terminal's own), or a terminal palette number (as
  a number, or a string like `"12"` or `"ansi:12"`)
  `0`–`255`.
- **Under `NO_COLOR`**, colours are ignored; the attributes still apply in the TUI
  (`slipbox render` prints plain text then). The theme is then `mono`, so of the per-theme
  tables only `[colors.mono]` applies.
- **Problems** (an unknown role or field, a malformed colour) are warnings, and the rest applies.
- **They apply everywhere** a theme does: the TUI, its theme picker's preview, and `slipbox
  render`. Saving the file reloads them live.

The chrome roles most worth tuning:

| Role | What it colours |
| --- | --- |
| `border` | the frame, the pane borders and the rules |
| `topbar_chip` | the `slipbox` chip |
| `topbar_button`, `topbar_button_on` | the rails' and top bar's buttons (`≡` `◷` `▤`), closed and open |
| `rail` | the rails' tint (its `bg`); none, as under NO_COLOR, draws a bordered rail instead |
| `lens` | the lens's rules and label (the accent, bold) |
| `lens_band` | the lens's rows of markdown (a light tint; its `bg`) |
| `lens_edit`, `lens_band_edit` | the same while typing in it (warm: orange, and a warm tint) |
| `tab`, `tab_active`, `tab_active_idle` | tabs; the active one with and without focus |
| `pane_title`, `pane_title_active` | the Explorer and Outline titles, unfocused and focused |
| `breadcrumb*` | the breadcrumb row (`_band` its background, `_icon`, `_sep`, `_current`) |
| `tree_guide` | the explorer's and the outline's tree lines |
| `sidebar_vault` | in the explorer, a folder that is another vault (a folder's blue: its icon tells it apart) |
| `scrollbar`, `scrollbar_track` | the scrollbar's thumb and track |
| `cursor`, `cursor_line` | the cursor and its row |
| `overlay*`, `keycap*` | popups: background, border, selection, headings, keycaps |
| `which_key_key`, `which_key_group` | the which-key popup's keys and `+group` names |

## Reloading

The TUI reloads the configuration **by itself** when the user or vault config file is saved, and
on demand with `space v c` or `:config`. [tui.md](tui.md) lists what a reload applies live. UI
settings changed in the TUI are session overrides. Each is kept only while the config value it
replaced is unchanged, so editing the config always wins.

## Environment

| Variable | Effect |
| --- | --- |
| `SLIPBOX_CONFIG` | user config file |
| `SLIPBOX_GLYPHS` | force `nerd`, `unicode` or `ascii` when `glyphs = "auto"` |
| `NO_COLOR` | CLI: no colour; TUI: the `mono` theme |
| `XDG_CONFIG_HOME`, `XDG_CACHE_HOME`, `XDG_STATE_HOME`, `XDG_DATA_HOME` | storage roots (decision `0.10`) |
| `SLIPBOX_DEBUG` | print stack traces for unexpected CLI errors |
| `SLIPBOX_CLIPBOARD` | `file`: copies go only to `clipboard.txt` in the state dir, never the clipboard (tests) |
| `SLIPBOX_TRACE` | TUI: append each command it runs to this file, one id a line (the terminal tests' coverage) |
