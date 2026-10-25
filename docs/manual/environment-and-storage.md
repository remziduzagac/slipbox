# Environment and storage locations

This reference lists the variables slipbox reads and the folders it uses for configuration, caches, state and data.
For the settings workflow and precedence, see [Customization](customization.md). The
[privacy policy](privacy.md) explains what is kept, sent and run.

## Environment

### slipbox's own variables

| Variable | What it does |
| --- | --- |
| `SLIPBOX_CONFIG` | Names your settings file, when `--config` doesn't name one |
| `SLIPBOX_GLYPHS` | `nerd`, `unicode` or `ascii`: the icons used where `render.glyphs` is `auto` |
| `SLIPBOX_CLIPBOARD` | `file` keeps copies off the system's clipboard and the terminal's |
| `SLIPBOX_DEBUG` | When set, an unexpected error on the command line prints its stack trace |
| `SLIPBOX_PARSE_CACHE` | `off` goes without the shared parse cache. Every note is parsed afresh |
| `SLIPBOX_DIAGRAM_CACHE` | `off` goes without the diagrams remembered on disk. Every diagram is drawn afresh |
| `SLIPBOX_RELEASES_URL` | Releases are fetched from another place laid out as GitHub's releases are, such as a mirror |
| `SLIPBOX_CHANNELS_URL` | The files naming each channel's newest release are read from another place |
| `SLIPBOX_CHANNEL` | Which releases the installer installs, and the install follows: `preview` or `stable` |
| `SLIPBOX_BIN_DIR` | Where the installer puts its `slipbox` link, instead of `~/.local/bin` |

Some of them need a few more words:

- A set `render.glyphs` wins over `SLIPBOX_GLYPHS`. Any other value of `SLIPBOX_GLYPHS` is ignored.
- With `SLIPBOX_CLIPBOARD` set to `file`, copies go only to `clipboard.txt` in the vault's state folder. Pasting reads
  it back.
- `SLIPBOX_RELEASES_URL` and `SLIPBOX_CHANNELS_URL` are for the installer, `slipbox upgrade` and the update check.
- Without `SLIPBOX_CHANNELS_URL`, the channels' files are read from slipbox's site on GitHub Pages.
- `SLIPBOX_CHANNEL=preview` has the installer install the newest preview, and the install follow previews, as
  `--preview` does. `stable`, the default, means releases only.

### Variables slipbox reads

| Variable | What slipbox reads it for |
| --- | --- |
| `NO_COLOR` | When set, and not empty: no colour |
| `HOMEBREW_SLIPBOX_NO_SKILL` | Homebrew-safe alias of `SLIPBOX_NO_SKILL` |
| `HOMEBREW_SLIPBOX_CLAUDE_CONFIG_DIR` | Homebrew-safe alias of `CLAUDE_CONFIG_DIR` |
| `HOMEBREW_SLIPBOX_CODEX_HOME` | Homebrew-safe alias of `CODEX_HOME` |
| `SLIPBOX_NO_SKILL` | `1`: skip automatic agent skill installation and refresh |
| `CLAUDE_CONFIG_DIR` | Existing Claude Code user configuration; absolute path, default `~/.claude` |
| `CODEX_HOME` | Existing Codex user configuration; absolute path, default `~/.codex` |
| `DO_NOT_TRACK` | When set, and not `0` or `false`: no update check (`:upgrade` still asks, when you ask) |
| `XDG_CONFIG_HOME` | slipbox's config folder |
| `XDG_CACHE_HOME` | slipbox's cache folder |
| `XDG_STATE_HOME` | slipbox's state folder |
| `XDG_DATA_HOME` | slipbox's data folder |
| `VISUAL`, `EDITOR` | Your editor, when `editor.command` is empty |
| `SHELL` | The shell that runs a command given with `:!` (else `/bin/sh`) |
| `TERM`, `COLORTERM`, `TERM_PROGRAM` | How many colours the command line uses, and the icons (below) |
| `LC_ALL`, `LC_CTYPE`, `LANG` | A locale that isn't UTF-8 makes `render.glyphs = "auto"` plain ASCII |
| `WAYLAND_DISPLAY`, `DISPLAY` | The clipboard tools tried on Linux (`wl-copy`, `xclip`, `xsel`) |
| `WSL_DISTRO_NAME` | slipbox is in WSL, and uses Windows' clipboard |
| `XDG_RUNTIME_DIR`, `TMPDIR`, `USER` | Where the running nvims are looked for |
| `HOME` and `PATH` | Your home folder, and where programs are found (below) |
| `BUN_ENABLE_CRASH_REPORTING`, `BUN_CRASH_REPORT_URL` | slipbox sets the first to `0`, unless you have set either |

What some of them do in more detail:

- **`NO_COLOR`.** The TUI uses the `mono` theme. The command line prints plain text unless `--color always`. With
  `render.show_urls = "auto"`, a link's address shows after its text.
- **`XDG_CONFIG_HOME`, `XDG_CACHE_HOME`, `XDG_STATE_HOME` and `XDG_DATA_HOME`** set slipbox's four folders, described
  [below](#where-slipbox-keeps-things). One that isn't an absolute path is ignored.
- **`TERM`, `COLORTERM` and `TERM_PROGRAM`** also say which icons `render.glyphs = "auto"` picks. It picks Nerd Font
  icons in Ghostty, kitty and WezTerm.
- **`TERM=linux`** makes `render.glyphs = "auto"` plain ASCII too.
- **`PATH`** is where slipbox finds programs: language servers, linters, git, the clipboard's tools.
- **`BUN_ENABLE_CRASH_REPORTING` at `0`** means a crash sends no report.

### Variables slipbox sets

A command run with `:!` gets two variables:

| Variable | Its value |
| --- | --- |
| `SLIPBOX_ROOT` | The vault's top folder |
| `SLIPBOX_FILE` | The path of the file in the window |

## Where slipbox keeps things

slipbox writes nothing derived or personal into your folders. It writes nothing at all by opening one.

What it keeps, it keeps in four folders of its own, XDG's, on macOS too:

| Folder | Where | What it holds |
| --- | --- | --- |
| config | `$XDG_CONFIG_HOME/slipbox`, else `~/.config/slipbox` | your settings and your themes |
| cache | `$XDG_CACHE_HOME/slipbox`, else `~/.cache/slipbox` | indexes and pictures: rebuilt when missing |
| state | `$XDG_STATE_HOME/slipbox`, else `~/.local/state/slipbox` | workspaces, the scratch, the trash, your answers |
| data | `$XDG_DATA_HOME/slipbox`, else `~/.local/share/slipbox` | tools installed, your words, slipbox itself |

A vault has a folder of its own in the cache folder, and another in the state folder. Both are named by the vault's
key. The key is the vault's folder name and twelve characters of a hash of its path, such as `notes-84ec07632af6`.

Home gets its folders the same way. Elsewhere has one state folder for the machine, `elsewhere`, and no cache.
`slipbox info` prints the two folders.

In a vault itself there is only `.slipbox/`, where a vault has one. It holds:

- `config.toml`
- `version`, the version of its format

### Config

| File | What it holds |
| --- | --- |
| `config.toml` | Your settings |
| `themes/` | Your themes, each a `.yaml` file |

### Cache

| File | What it holds |
| --- | --- |
| `CACHEDIR.TAG` | It tells backup tools to skip the folder |
| `parsed.db` | Notes as parsed, by their content, shared by every copy of a folder on the machine |
| `diagrams.db` | Diagrams as drawn, by their source and how they're drawn, for every vault on the machine |
| `exports/` | An export's output while it's prepared, removed once it's written |
| `images/` | Pictures fetched from the internet, a file each, and SVG pictures, diagrams and maths as drawn |
| `<key>/index.json` | The vault's links |
| `<key>/search.db` | The vault's search index |
| `<key>/walk.json` | Home's walk, kept: the notes, files and folders it found, so opening home never walks it |

### State

For the machine:

| File | What it holds |
| --- | --- |
| `roots.json` | Every vault seen, home among them; the moves of those that moved |
| `links.json` | Your answers about symlinks that lead out: each followed or not, with where it led then |
| `folders.json` | Named folders: their names, copies and defaults |
| `trust.json` | Your answers when asked whether to trust a vault |
| `positions.json` | Where you were in each note, the newest 5,000 |
| `autoindex.json` | How far the background index has got |
| `activity` | When the command line last ran |
| `plans/` | Plans saved with `--plan`, for `slipbox apply`. Each is removed once applied |
| `update.json` | When the update check last asked, what it found, and a version you skipped |
| `restart/` | What a restart leaves for the slipbox it starts: where you were, and your tabs. Read and removed by it |
| `upgrade-<pid>.json` | What an upgrade running while you work said, until slipbox reads it |

For each vault, in `<key>/`:

| File | What it holds |
| --- | --- |
| `session.json` | Your workspaces (tabs and splits), and what they share: panes, settings changed in the TUI, recents |
| `scratch.md` | The scratch, unless `capture.location` puts it in the vault |
| `trash/` | What you deleted, to restore, for 30 days. `trash.json` lists it |
| `renames.json` | The last 20 renames and moves, to undo |
| `redirects.json` | Moves seen, to repair the links that pointed at the old place |
| `heads.json` | Each branch's last commit seen |
| `export.json` | Where an export last went |
| `clipboard.txt` | A copy no clipboard could take |
| `dirty/` | The notes with unsaved changes in a running TUI, so the command line can say a file is out of date |

### Data

| File | What it holds |
| --- | --- |
| `tools/` | Language servers and markdownlint-cli2 installed from npm, each at the version slipbox pins |
| `spell/words.txt` | Your own words |
| `versions/`, `current` | slipbox itself, when its installer installed it |
| `upgrade.lock` | While an upgrade runs: so that two never run at once |
| `channel` | The releases it follows (`slipbox channel`) |

The cache can be deleted while slipbox isn't running. All of it is rebuilt.

The state folder holds what you would miss, the scratch and the trash among it.

`slipbox uninstall --purge` removes slipbox with all four folders. It lists every path first
([Installation](../guides/install.md)).
