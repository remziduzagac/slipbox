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
mouse = true
narrow_width = 90              # below this, the explorer overlays and splits stack
restore_session = true         # reopen tabs and splits when started without a path

[capture]
location = "state"             # state (never committed) | vault
file = "scratch.md"            # relative to the vault root when location = "vault"

[editor]
command = ""                   # phase 3: `$EDITOR` hand-off template with {file} and {line}

[watch]
enabled = true
debounce_ms = 120
poll_ms = 2000                 # for unwatchable directories, and when the watch limit is hit

[keys]                         # key sequence = command id; "" unbinds
# "x" = "scroll.bottom"
# "space n" = "switcher.open"
```

Key sequences are space-separated key names: `g g`, `ctrl+w v`, `space f`, `shift+tab`,
`alt+left`. Printable characters name themselves (`G`, `?`, `:`). `slipbox commands` lists every
command id, and `?` in the TUI shows every binding.

## Environment

| Variable | Effect |
| --- | --- |
| `SLIPBOX_CONFIG` | user config file |
| `SLIPBOX_GLYPHS` | force `nerd`, `unicode` or `ascii` when `glyphs = "auto"` |
| `NO_COLOR` | CLI: no colour; TUI: the `mono` theme |
| `XDG_CONFIG_HOME`, `XDG_CACHE_HOME`, `XDG_STATE_HOME` | storage roots (decision `0.10`) |
| `SLIPBOX_DEBUG` | print stack traces for unexpected CLI errors |
