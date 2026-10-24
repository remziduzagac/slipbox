# Customization

Start with the defaults, then change one thing and check the result. Themes, key bindings, layout and editing
preferences are settings; their exact names and defaults are in [Configuration settings](configuration.md).

## Changing a setting

Your default settings file is `~/.config/slipbox/config.toml`, or `$XDG_CONFIG_HOME/slipbox/config.toml` when that
variable is set. `SLIPBOX_CONFIG` and `--config` can select another file, as described below. slipbox doesn't make
the file; create it and its folder yourself. Write in it only what you want different.

A setting lives in a table, named in brackets. The few settings at the top level come before any table:

```toml
theme = "nord"

[ui]
scrolloff = 5
wrap = false

[editor]
autosave_ms = 10000
```

Save the file, and a running TUI applies the change ([Reloading](configuration.md#reloading)).

This manual writes a setting in dotted form. `ui.scrolloff` is `scrolloff` in the `[ui]` table. A top-level setting is
bare, such as `theme`.

Your file is the first of these:

1. the file `--config <file>` names, given to the TUI or to any command
2. else the file the environment variable `SLIPBOX_CONFIG` names
3. else `config.toml` in slipbox's config folder, `$XDG_CONFIG_HOME/slipbox/`. When `XDG_CONFIG_HOME` isn't set, that
   is `~/.config/slipbox/`, on macOS too.

If the `--config` file doesn't exist, slipbox says so in a warning and runs on the defaults. It never falls back to one
of the others.

## A folder's settings

A vault can carry settings of its own, for everyone who opens it. For example:

- a team's notes that keep their scratch in the folder
- a repository that leaves its generated files out

These settings go in `.slipbox/config.toml` at the vault's top. `slipbox init ~/notes` makes `.slipbox/` with a
`config.toml` that holds a couple of settings, commented out. You can make it by hand too.

A vault is a folder slipbox treats as one collection of files. A `.slipbox/` folder is one of the things that make a
folder a vault ([Vaults, home and Elsewhere](vaults.md)).

```toml
# ~/notes/.slipbox/config.toml
[capture]
location = "root"              # the scratch in the folder, as ~/notes/inbox.md
file = "inbox.md"

[walk]
exclude = ["archive/"]
```

### The order they apply in

Each file overrides the ones before it. A setting no file names keeps its default.

1. the built-in defaults
2. your own file
3. the `.slipbox/config.toml` of each vault enclosing this one, the outermost first
4. the vault's own `.slipbox/config.toml`

So a folder's settings reach the vaults nested inside it too.

A vault without `.slipbox/`, such as a git repository or an Obsidian vault, has no file of its own. Home and
Elsewhere take only your file ([Home and Elsewhere](configuration.md#home-and-elsewhere)).

`slipbox info` lists the files that applied, in this order, on its `config` line.

### What only your own file can set

A folder's `.slipbox/config.toml` arrives with whatever you clone or download. So it never chooses what runs on your
machine, or what reaches the network.

These come from your own file only. In a folder's file, each is ignored, with a warning:

- **The programs slipbox runs for you:** `editor.command`, `editor.remote` and `lint.command`.
- **A language server's `command`, `args` and `environment`, and a linter's `lint-command`.** A folder's file may tune
  the servers and linters slipbox knows, but never add one. Its name would be the program run.
- **What reaches the network:** `render.images_remote`, `lsp.auto_install` and `update.check`. A folder can't have
  slipbox fetch its notes' pictures from the web, which tells their sites who read them. It can't have slipbox install
  from npm, or ask whether there's a newer release. Nor can it turn any of them off for you. What reaches the network
  is yours to allow.
- **`[trust]`.** A folder can't trust itself.
- **`walk.root_markers`.** Where vaults are is settled before any folder's file is read.
- **`git.worktrees`.** Where slipbox makes a worktree's folder, outside the vault, is yours to say.
- **A key or alias bound to a command that throws work away or runs a program:** `app.quit_force`, `note.revert`,
  `note.save_force`, `scratch.clear`, `shell.run`, `shell.filter` and `help.report_send`. A clone can't put a quit
  without saving on `ctrl+s`, or a program of its choosing on `:wq`. Your own file may: `"g m" = "shell.run make"`.

A folder's file may give a language server only its settings (`config`). They reach the server only in a vault you
trust, as a project's `.vscode/settings.json` would. Some servers' settings name programs to run.

In a vault you haven't trusted, a server gets its own defaults and your settings. On top of those come the settings that
keep it from running the project's code. Nothing of the folder's own runs.

Trust is explained in [Privacy and trust](privacy.md#trust).

### A folder's name

The `[vault]` table of a folder's `.slipbox/config.toml` is its identity, not a setting. It holds:

- its `name`, which pointers such as `slipbox://notes/inbox.md` find it by
- an `id` that tells its copies from another folder of the same name
- any `aliases` and `previous_names`

The table is read on its own, and never merged into the settings. In your own file it is ignored, with a warning.

Only `slipbox init --name` and `slipbox name` write it. Opening the folder never does. Names and pointers are in
[Vaults, home and Elsewhere](vaults.md).

```toml
[vault]
id = "3f9c2a7be1d04c55"        # random, written with the name, never changed
name = "notes"                 # what pointers name it by: slipbox://notes/inbox.md
aliases = ["n"]                # other names it answers to
previous_names = ["old-notes"] # names it had: a pointer by one still finds it
```

## Mistakes in a file

No mistake in a settings file stops slipbox. Each mistake is a warning, and the rest of the file still applies. You see
the warning in one of two places:

- in the TUI's messages (`space m` lists them all)
- on the command line's standard error

What each mistake does:

- **A file that isn't valid TOML** is left out whole. While the TUI runs, a file saved half-typed keeps what it said
  before, its last good contents, until it parses again. Your theme and keys stay as they were.
- **An unknown setting** is named and ignored. So is a retired one (`[rename]`), with the reason.
- **A value that doesn't fit** keeps the default. That is a value:
  - of the wrong type, such as text where `true` or `false` goes, or a list with something other than text in it
  - outside its set (`ui.lines = "thick"`)
  - outside its range (`ui.sidebar_width = 7`)

  Numbers are whole, except for `ui.split_ratio` and `editor.lens_max`.
- **An empty `walk.extensions`** keeps the default, since no note would be found.
- **A `capture.file` that isn't a relative `.md` path** keeps `scratch.md`. So does one that climbs out with `..`, or
  has a hidden part (`.notes/inbox.md`).
- **A mode's key table written as text** (`[keys]` with `source = "…"`) is ignored.
- **In a language server's, a language's, a linter's or a document type's table,** a field of the wrong type is
  dropped. The rest of the entry is kept. A known field spelled with underscores (`lint_command`, `file_types`) is
  dropped too. Any other field slipbox doesn't read (`scope`, `comment-token`) is kept quietly. So a section of
  Helix's `languages.toml`, or of efm-langserver's settings, pastes in as it is.

Some mistakes only show where the setting is used, and are said there:

- a key bound to a command that doesn't exist
- a key with a modifier slipbox doesn't know (`hyper+x`)
- a role or colour `[colors]` can't use

The TUI says these. `slipbox render` says the colours' mistakes too. `slipbox info` doesn't.

An older file may use the names some settings had before:

- `capture.location = "vault"`, now `"root"`
- the explorer's actions `rename_vault`, `make_vault` and `unmake_vault`, now `rename_root`, `make_root` and
  `unmake_root`
- the colour role `sidebar_vault`, now `sidebar_root`

Each still works, as its name now does, and isn't warned of.


## Choose a theme and familiar keys

Use `space u t` for the live theme picker: move through the list to preview, `enter` keeps one and `esc` returns to
the earlier theme. `space u u` opens common UI settings. Save a setting in your own file when it should persist.

[Making slipbox yours](../guides/making-it-yours.md) walks through a theme and key change. The reference explains
[theme files and role overrides](configuration.md#colours), [keys and
aliases](configuration.md#keys-aliases-and-groups),
[indentation](configuration.md#indentation-editorconfig), and [spelling](configuration.md#spelling-dictionaries).

## Check what applied

`slipbox info` lists the settings sources for a folder. Warnings identify an unknown key or invalid value. A running
TUI reloads saved settings; [Reloading](configuration.md#reloading) describes session choices and file precedence.

Your own settings decide which tools and network operations are allowed. A folder cannot trust itself or name a
program to run. Read [Privacy and trust](privacy.md) before enabling project tools.

## Themes

The theme sets every colour on the screen. slipbox has these built in:

- `tokyo-night` (Night, the default), `tokyo-night-storm`, `tokyo-night-moon` and `tokyo-night-day`
- `catppuccin-mocha`, `catppuccin-latte`, `catppuccin-frappe` and `catppuccin-macchiato`
- `dracula`, `gruvbox-dark`, `gruvbox-light`, `nord`, `solarized-dark`, `solarized-light`, `rose-pine`,
  `everforest`, `kanagawa`, `one-dark` and `monokai`
- `terminal`, which uses your terminal's own sixteen colours, so its theme shows through
- `mono`, with no colours at all: bold, dim, italics and underlines only, with links underlined

The four Tokyo Night variants use their official palettes. Night is darkest, Storm has a lighter dark background,
Moon has its own softer blue and purple accents, and Day is light.

To choose a theme:

1. Press `space u t`. It lists the themes, with the ones you've added.
2. Move through the list. The theme changes as you move.
3. Press `enter` to keep it, or `esc` to put the old one back.

| To | Use |
| --- | --- |
| switch straight to a theme | `:theme nord` |
| choose the default | the `theme` setting |
| list the themes on the command line | `slipbox themes` |

When `NO_COLOR` is set, slipbox uses `mono` whatever the theme says.

Your own themes, base16 and base24 schemes, and colour changes to single parts of the screen, are in
[Configuration](configuration.md). [Making slipbox yours](../guides/making-it-yours.md) walks through them.
