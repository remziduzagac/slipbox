# Troubleshooting

This chapter helps when something in slipbox doesn't work as you expect. Each section says what you see, why, and what
to do.

Start with what slipbox sees:

- the two commands that show it, `slipbox info` and `slipbox doctor`
- the messages slipbox has shown

Then look for your problem below. The last sections say how to see more when something fails, and what to include when
you report a problem.

## What slipbox sees

### `slipbox info`

Run it in your notes folder, or name a folder with `--root ~/notes`. It shows slipbox's version, then:

- **root** and **name**: the folder slipbox takes as the top of your notes, and its name
  ([Links and roots](links-and-roots.md)).
- **notes**: how many notes it found, and how long that took.
- **index**: whether the search index has been built, and when.
- **links**: how the folder writes links, as slipbox has worked it out.
- **theme**: the theme in use.
- **config**: the config files read, in the order they apply.
- **cache**, **state** and **scratch**: where slipbox keeps this folder's index, its session and trash, and the scratch.
- **skipped**: the files it left out, and why. A file may be too large, be a link that leads outside the folder, or be a
  folder of notes inside this one.

`slipbox info --json` gives the same as data. `slipbox --version` gives the version alone.

### `slipbox doctor`

It lists, for each language, the language servers and linters slipbox would use. For each one, it says one of these:

- where it was found
- that slipbox installs it when it's first needed
- that it's missing, and how to get it

For example:

```text
python
  pyright                      not found: slipbox installs pyright@1.1.414 when it's first needed
  ruff                         not found: uv tool install ruff, pip install ruff, or brew install ruff  (…)
rust
  rust-analyzer                path  /usr/bin/rust-analyzer
```

`slipbox doctor <file>` looks at one file. It shows:

- its language
- its project's folder
- the servers that would serve it there
- what would be left out in a folder you don't trust

`slipbox doctor` only looks. It installs and runs nothing.

### Messages

In slipbox, `space m` lists everything slipbox has said since it started, warnings included. A message that went by in
the message line is there too.

## slipbox won't start

**It says it isn't starting because stdin or stdout is not a terminal:**

```text
slipbox: not starting the TUI — stdin/stdout is not a terminal.
         For scripts and agents use a subcommand, e.g. `slipbox render <note>` (see `slipbox help`).
```

slipbox needs a terminal to draw in, for its input and its output. Here, its output is going into a pipe or a file, or
its input isn't your keyboard. That happens when slipbox runs:

- from a script
- from an editor's task runner
- over SSH, as `ssh host slipbox`

Over SSH, ask for a terminal: `ssh -t host slipbox ~/notes`.

For a script or an agent, use a command instead ([The command line](cli.md)), such as `slipbox render inbox.md`.

**It says it needs a newer Bun.** Upgrade Bun. Run from its source code, slipbox needs Bun 1.4.2 or later. A release of
slipbox carries its own Bun.

**It says the folder isn't there.** The path you gave doesn't exist. slipbox says so in a line, and doesn't start.

## Keys that don't arrive

Your terminal, a multiplexer or your system can keep a key for itself. slipbox then never sees it.

Every key with `ctrl` has another way in. Usually it's under `space`, which nothing takes. For moving the cursor, it's
the arrow and page keys.

`?` lists every key, and the [Keys](keys.md) chapter has them all. Some you may need:

| Key | Its other route | What it does |
| --- | --- | --- |
| `ctrl+p` | `space f f` | the switcher |
| `ctrl+shift+p` | `:` or `space f p` | the command palette |
| `ctrl+shift+f` | `space f g` | find in every note |
| `ctrl+shift+h` | `space f shift+r` | find and replace in every note |
| `ctrl+o` | `space h p` | back |
| `ctrl+t c` | `space t c` | a new tab |
| `ctrl+tab` | `g t` | the next tab |
| `ctrl+q` | `space q q`, or `:qa` | quit |

Where keys get lost:

- **Older terminals** can't tell `ctrl+shift+f`, `ctrl+shift+h`, `ctrl+shift+p`, `ctrl+shift+n`, `ctrl+tab`,
  `ctrl+shift+tab`, `ctrl+enter` and `ctrl+backspace` from their plain forms. A terminal that speaks the kitty keyboard
  protocol tells them apart, as kitty, Ghostty and foot do. Elsewhere, use the other routes.
- **macOS** keeps `ctrl+left`, `ctrl+right`, `ctrl+up` and `ctrl+down` for switching desktops and Mission Control.
  Use their other keys, or turn those shortcuts off in System Settings (Keyboard, Keyboard Shortcuts, Mission
  Control).
- **`alt` on a Mac** is option. It reaches slipbox only when your terminal sends option as Meta. In Terminal, that's
  "Use Option as Meta key". In iTerm2, it's option as "Esc+". Otherwise option types a character.
- **zellij** takes several `ctrl` keys for itself, among them `ctrl+p`, `ctrl+t`, `ctrl+o` and `ctrl+q`. Its locked
  mode passes every key through to slipbox.
- **tmux** takes only its prefix, `ctrl+b`, which slipbox doesn't use. If `esc` seems slow inside tmux, lower its
  `escape-time` setting.
- **Windows Terminal** keeps some keys for itself, among them `ctrl+shift+p`, `ctrl+shift+f`, `ctrl+tab` and
  `ctrl+shift+tab`. Use the other routes, or unbind them in its settings.

You can move any key to one that reaches slipbox, in your config's `[keys]` ([Configuration](configuration.md)).

## Pictures aren't drawn

slipbox draws a note's pictures only where all of these hold ([Reading](reading.md) has the details):

- **Your terminal draws pictures**, with the Kitty graphics protocol or sixel. kitty, Ghostty, WezTerm and foot do.
  Elsewhere, a picture is its line: `▣` and its description.
- **No multiplexer stands in the way.** tmux, zellij or screen between slipbox and the terminal must pass the picture
  protocol on, and often they don't. Try slipbox in the terminal itself.
- **`render.images` isn't `"never"`.**
- **The picture is alone in its paragraph.** Beside text, a picture is its `▣` line.
- **It's a kind slipbox draws:** PNG, JPEG, WebP, GIF or SVG.
- **It's on your machine.** A picture on the internet is fetched only as `render.images_remote` says. By default, it's
  its link until `enter` on it asks to fetch it ([Privacy](privacy.md)).

Diagrams and maths are drawn in characters, unless you set `render.mermaid = "picture"` or `render.math = "picture"`.
Those, too, need a terminal that draws pictures.

## Icons or colours look wrong

**Boxes or question marks where icons should be.** slipbox uses Nerd Font icons in Ghostty, kitty and WezTerm, which
carry them. Elsewhere, it uses plain Unicode symbols. If your terminal's font lacks them:

- Set `render.glyphs = "unicode"`, or `"ascii"`, the safest.
- Or type `:glyphs unicode` in slipbox.
- While `render.glyphs` is `"auto"`, the variable `SLIPBOX_GLYPHS` chooses too.

If you've installed a Nerd Font, `render.glyphs = "nerd"` uses its icons in any terminal.

slipbox chooses `ascii` by itself on the Linux console, or when your locale isn't UTF-8.

**Colours look wrong or garish.** The themes use 24-bit colour, and in a terminal without it they can look wrong.
Choose the `terminal` theme, which uses your terminal's own colours. Press `space u t`, or set `theme = "terminal"` in
your config.

**No colour at all.** `NO_COLOR` is set in your environment. slipbox then uses its `mono` theme, which marks things
with bold, underline and reversed text instead.

## Copying over SSH

slipbox copies two ways at once:

- It sends the text to your terminal (the OSC 52 sequence). The terminal puts it on the clipboard of the machine you're
  sitting at.
- It hands the text to the system's clipboard tool: `pbcopy` on macOS, and `wl-copy`, `xclip` or `xsel` on Linux.

Over SSH, the tool is the remote machine's. So the copy reaches you only through your terminal.

- **Your terminal must let programs set the clipboard.** Many do. Some ask, or need it turned on in their settings.
- **Inside tmux**, let programs set it. Put `set -g set-clipboard on` in your tmux config.
- **Large copies** (more than about 75 KB of text) aren't sent to the terminal, which would refuse them.
- **When nothing took it**, slipbox writes the text to a file, and says where:
  `clipboard unavailable — wrote ~/.local/state/slipbox/…/clipboard.txt`.
  But a terminal can't say whether it took the text. So a copy may also go nowhere without a word. Try a small one
  first.

Pasting works the other way round. Your terminal's own paste (`cmd+v`, `ctrl+shift+v`) types the text into slipbox,
over SSH too. When the system clipboard can't be read, `p` puts what you copied last in slipbox.

## A language server isn't found

A code file shows no problems, or slipbox says `rust: rust-analyzer isn't installed … — slipbox doctor says more`.

- **Run `slipbox doctor <file>`.** It says which servers that file would have, and where each was looked for.
- **A server published on npm** is installed the first time it's needed, which needs the network. If installing
  failed, the message says why, and `space m` shows it again. slipbox tries again the next time it starts. With
  `lsp.auto_install = false`, it isn't installed. Install it yourself, or turn that back on.
- **Any other server** (rust-analyzer, gopls, lua-language-server and others) is yours to install, and
  `slipbox doctor` says how. slipbox finds it on your `PATH`, in Mason's folder, `~/.cargo/bin`, `~/go/bin` or
  `~/.local/bin`.
- **A folder you don't trust** doesn't get its project's own copy of a tool (its `node_modules/.bin`, its `.venv`).
  Some servers run limited there, or not at all. `slipbox doctor <file>` says what's left out. `:trust` trusts the
  folder ([Code](code.md)).
- **A server elsewhere.** Name its command in your config, under `[language-server.<name>]`
  ([Configuration](configuration.md)).

## Config warnings

When a config file has a mistake, slipbox says so and carries on:

```text
slipbox: warning: config: ~/notes/.slipbox/config.toml: unknown key "ui.nope"
slipbox: warning: config: ~/notes/.slipbox/config.toml: "render.images" must be one of auto, never (got "sometimes")
```

- **An unknown setting, or a wrong value**, is skipped. The default, or what an earlier file set, stays.
- **A file that isn't valid TOML** is skipped whole, and the warning says where it went wrong.
- **A folder's settings that only your own config may set** are ignored, each with a warning. They include a program
  to run, keys for commands that throw work away, and `[trust]`. [Configuration](configuration.md) lists them.

Where you see the warnings:

- The command line prints them on its error output, and in `--json`'s `warnings`.
- slipbox shows them in the message line, and `space m` lists them.

`slipbox info` shows which files were read.

Fix the file and save it. slipbox reloads its config when a config file is saved. You can also press `space v c` to
reload it.

## A note changed on disk while you edited it

Someone else (an agent, a sync tool, your editor) wrote to a note while you had unsaved changes in it. slipbox never
writes over their version, or loses yours, without asking:

```text
ideas/coffee.md changed on disk, and you have unsaved changes
```

It offers four answers:

| Key | Does |
| --- | --- |
| `l` | Loads theirs |
| `k` | Keeps yours |
| `d` | Shows the differences |
| `m` | Merges the two |

`space n c` asks again. [When a file changes on disk](editing.md#when-a-file-changes-on-disk) explains each answer.

## Search seems out of date

The TUI keeps its index up to date as files change, whoever changes them. The command line brings it up to date
before each search, with every file whose size or time changed since. If a search still misses something:

- **The file is left out.** `slipbox info` lists files skipped, and why. A file may be over `walk.max_file_size`, say,
  or be a folder of notes inside this one (search it there). Files under `walk.exclude` are left out too.
- **It's in another folder of notes.** Searching across folders uses each folder's own index, as it was last built.
  `slipbox index --refresh ~/notes` brings that one up to date now.
- **The index is damaged or confused.** `slipbox index --rebuild` builds it again from the files. The cache can always
  be deleted, and slipbox makes it again. `slipbox info` shows where it is.

`search.engine = "scan"` searches the files themselves every time, without an index. It's slower, but never stale.

## Windows (WSL)

slipbox runs on Windows inside WSL, in a terminal such as Windows Terminal. Most of it works as on Linux. A few things
differ:

- **Notes on a Windows drive** (`/mnt/c/…`). A change a Windows program makes there reaches slipbox only in the files
  it has open, and reading is slower. slipbox says so once when you open such a folder. Notes kept in WSL's own
  folders (`~/notes`) are watched in full.
- **The clipboard** is Windows' own. Pasting from it can take a moment where slipbox has to ask PowerShell for it.
- **Keys.** Windows Terminal keeps some for itself ([Keys that don't arrive](#keys-that-dont-arrive)).
- **PDF exports** use Windows' fonts first ([Exporting](export.md)).

## Seeing more when something fails

When a command fails with an error slipbox didn't expect, set `SLIPBOX_DEBUG` to see where it happened:

```bash
SLIPBOX_DEBUG=1 slipbox export ideas/coffee.md
```

The error's full trace follows its message. It works for the command line's own output, not with `--json`.

## Reporting a problem

Report a bug in slipbox's issues on GitHub, with the bug report form:
[github.com/remziduzagac/slipbox/issues](https://github.com/remziduzagac/slipbox/issues).

A question, or an idea for slipbox, goes in its [Discussions](https://github.com/remziduzagac/slipbox/discussions)
instead.

A useful bug report holds:

- **The version**: `slipbox --version`, and how you installed it (a release, Homebrew, or from source).
- **Your system and terminal**: the operating system, the terminal and its version, and any multiplexer (tmux, zellij)
  or SSH between them.
- **What you did, what you expected, and what happened instead**, with the steps to make it happen again. Use a small
  example note, never your own private notes.
- **What slipbox said**: the message (`space m` lists them), or the command's output with `SLIPBOX_DEBUG=1`.
- **For language servers**: `slipbox doctor <file>`'s output.
- **For a folder's behaviour**: `slipbox info`'s output. It shows your folders' paths, so remove what you'd rather not
  share.

Never report a security problem in an issue, which anyone can read. A security problem is, for example, a note or a
folder that makes slipbox run something you didn't trust. Report it privately, as
[slipbox's security policy](../../SECURITY.md) says.
