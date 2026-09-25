# Configuration

TOML, in two levels, with the vault winning (plan `0.9`):

1. built-in defaults
2. the user file: `--config <file>`, else `$SLIPBOX_CONFIG`, else
   `$XDG_CONFIG_HOME/slipbox/config.toml`
3. the vault file: `<vault>/.slipbox/config.toml`

slipbox runs correctly with no config at all. None of these crash it:

- a broken file
- an unknown key
- a wrong type
- a value outside its set (`glyphs`, `show_urls`, `location`)
- a number out of range (`inset` 0–40, `sidebar_width` 8–200, `poll_ms` ≥ 50…)

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
extensions = ["md", "markdown"]
exclude = []                   # gitignore syntax, on top of .gitignore
max_file_size = 4194304        # bytes; larger notes are listed as skipped

[ui]
sidebar = true                 # explorer beside the content on wide terminals
sidebar_width = 30
outline = false                # outline pane on the right on wide terminals
outline_width = 32
split_ratio = 0.5              # first window's share of a split (0.2–0.8)
mouse = true
narrow_width = 90              # below this, panes overlay and splits stack
restore_session = true         # reopen tabs and splits when started without a path
cursorline = true              # band on the cursor row
line_numbers = false           # source line numbers in a gutter
readable_width = false         # cap the text column at readable_max, centred
readable_max = 100
zen = false                    # no chrome; readable width on
scrolloff = 3                  # rows kept between the cursor and the view's edge

[input]
leader = "space"               # the key `leader` means in [keys] and [groups]
which_key = true               # the popup for pending key sequences
which_key_delay_ms = 500       # before it shows for prefixes other than the leader

[capture]
location = "state"             # state (never committed) | vault
file = "scratch.md"            # relative to the vault root when location = "vault"

[editor]
command = ""                   # phase 3: `$EDITOR` hand-off template with {file} and {line}

[watch]
enabled = true
debounce_ms = 120
poll_ms = 2000                 # backstop tick, unwatchable directories, degraded mode

[keys]                         # key sequence = command spec; "" unbinds a default
"x" = "cursor.bottom"
"leader n n" = "switcher.open"
"ctrl+o" = ""

[keys.visual]                  # visual mode (movement keys extend by themselves)
"Y" = "visual.yank"

[keys.explorer]                # key = explorer action: down up open_tab open collapse
"o" = "open"                   #   open_split top bottom close leave

[keys.outline]                 # key = outline action: down up jump fold unfold
"za" = "fold"                  #   top bottom close leave

[keys.resize]                  # key = resize action: narrower wider shorter taller
"<" = "narrower"               #   equalize leave

[aliases]                      # `:` aliases; "" removes a default
wq = "app.quit"

[groups]                       # which-key groups by prefix: "name" or "name: explanation"
"leader n" = "notes: reload, info"
```

The notation is in [keymap.md](keymap.md): space-separated key names such as `g g`,
`ctrl+w shift+h` or `leader l n`. `G` means `shift+g`, and modifiers may be written in any order.
A command spec is a command id, optionally followed by an argument (`"tab.goto 3"`,
`"theme.set nord"`). `slipbox commands` lists every id, and `space ?` in the TUI lists every
binding.

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
| `XDG_CONFIG_HOME`, `XDG_CACHE_HOME`, `XDG_STATE_HOME` | storage roots (decision `0.10`) |
| `SLIPBOX_DEBUG` | print stack traces for unexpected CLI errors |
