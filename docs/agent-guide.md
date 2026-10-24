# Helping someone use slipbox

<a id="slipbox-agent-guide"></a>

Use this guide to help a person understand, set up or troubleshoot slipbox. It gives you slipbox's ideas in the order
to teach them, the setup path, and the fixes for common problems.

The documentation lives at <https://remziduzagac.github.io/slipbox/docs/>. Send the person there for more detail. Check
any command you're unsure of against those pages, or against `slipbox help`, instead of guessing.

This guide teaches you to guide a person. To use slipbox yourself, from its command line, read its skill instead:
`slipbox skill` prints it, and `slipbox skill --install ~/.claude/skills` installs it where your agent finds skills.

## What slipbox is

slipbox is a terminal app for reading, reviewing and editing Markdown and code. It is made to sit beside a coding
agent. The person uses its full-screen view; an agent or a script uses its command line. Both work on the same plain
saved files. Unsaved TUI changes remain in its buffer until saved.

## Teach these, in this order

1. **Notes are files.** A note is a Markdown file in a folder. slipbox has no proprietary database of notes; indexes
   are rebuildable caches. Opening a folder writes nothing
   into it.
2. **The screen.** The explorer is on the left, the note on the right, the status line at the bottom. The mouse works
   everywhere: click a note, a link, a tab.
3. **Two keys teach the rest.** `space` shows the keys that can follow it. `?` lists every key, with a filter. The
   person doesn't need vim: the arrows and the shortcuts of other editors work
   ([Keys you already know](https://remziduzagac.github.io/slipbox/docs/guides/keys-you-know/)).
4. **Moving and finding.** `ctrl+p` opens a note by name, `enter` follows a link, `ctrl+o` goes back, `space f s`
   searches every note.
5. **Editing.** `i` opens the lens (the Markdown around the cursor), `i` again types, `esc` steps back out, `ctrl+s`
   saves. `ctrl+k` shows the whole note as Markdown.
6. **Vaults.** A vault is a folder whose notes belong together: a git repository, an Obsidian vault, a zk notebook, or
   a folder with `.slipbox/`. Links resolve and search works within the vault. The home folder is a vault too, home,
   and everything outside home and every vault is Elsewhere, with no index. A link into another vault opens a peek;
   `o` goes there ([Working across folders and vaults](https://remziduzagac.github.io/slipbox/docs/guides/vaults/)).
7. **Working with an agent.** The scratch collects places to hand to an agent (`space s a` adds one, `space s y`
   copies the scratch). `space s c` copies a note with what it links to and what links to it.
8. **Trust.** A folder's own tools, scripts and hooks run only once the person trusts that vault.

The full list of terms is the [Glossary](https://remziduzagac.github.io/slipbox/docs/manual/concepts/) page.

## Install

Use the learning path in order: [What is slipbox?](manual/introduction.md), [Installation](guides/install.md),
[Quick start](guides/quick-start.md), [Working with slipbox](guides/getting-started.md), then
[Reading and editing in slipbox](guides/lens.md). Explain the view/typing distinction before adding agent setup.
The person may use slipbox independently; do not require an agent skill merely to read and edit a note.

macOS and Linux, and Windows through WSL:

```bash
curl -fsSL https://remziduzagac.github.io/slipbox/install.sh | sh
```

Then check it:

```bash
slipbox --version
slipbox doctor
```

[Installation](https://remziduzagac.github.io/slipbox/docs/guides/install/) covers previews, running from source,
upgrading and removing it.

## A first session

Have the person open a folder of their notes:

```bash
slipbox ~/notes
```

Then walk them through the [Quick start](https://remziduzagac.github.io/slipbox/docs/guides/quick-start/). For a longer
tour, use [Working with slipbox](https://remziduzagac.github.io/slipbox/docs/guides/getting-started/).

If they come from Obsidian or zk, their vault or notebook opens as it is. See
[Coming from Obsidian or zk](https://remziduzagac.github.io/slipbox/docs/guides/from-obsidian-or-zk/).

## Settings

- The person's settings: `~/.config/slipbox/config.toml`.
- A vault's own settings: `.slipbox/config.toml` in that vault. These can't run programs or reach the network.
- `space u u` lists the settings you can change in the TUI, kept for the vault, and `space u t` picks a theme.

Every setting is in [Configuration](https://remziduzagac.github.io/slipbox/docs/manual/configuration/). Themes, keys
and fonts are in [Making slipbox yours](https://remziduzagac.github.io/slipbox/docs/guides/making-it-yours/).

## When something is wrong

Start with what slipbox sees:

- `slipbox doctor` lists the language servers and linters, and where each was found.
- `slipbox info` (or `space v i` in the app) describes the vault a note is in.
- `space m` lists every message slipbox has shown.

Common problems, each with its fix in
[Troubleshooting](https://remziduzagac.github.io/slipbox/docs/manual/troubleshooting/):

| What the person sees | Where to look |
| --- | --- |
| slipbox won't start | "slipbox won't start" |
| A key does nothing (often a terminal or multiplexer taking it) | "Keys that don't arrive" |
| Pictures don't show | "Pictures aren't drawn" |
| Icons or colours look wrong | "Icons or colours look wrong" |
| Copying doesn't reach the clipboard over SSH | "Copying over SSH" |
| A language server isn't found | "A language server isn't found" |
| A warning about the config | "Config warnings" |
| Search misses a recent change | "Search seems out of date" |

To report a bug, the person can open an issue at <https://github.com/remziduzagac/slipbox/issues>.

## Where to read more

- [Working with agents](https://remziduzagac.github.io/slipbox/docs/guides/agents/): slipbox beside an agent, on the
  same files.
- [Keys](https://remziduzagac.github.io/slipbox/docs/manual/keys/): every key.
- [The command line](https://remziduzagac.github.io/slipbox/docs/manual/cli/): every command, its output and exit
  codes.
