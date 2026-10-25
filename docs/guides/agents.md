# Working with agents

slipbox is made to sit beside a coding agent: Claude Code, Codex, or any agent that runs shell commands. You read and
edit in slipbox's TUI, and the agent uses slipbox's command line.

Both work on saved files on disk. If you have no unsaved edits, the screen reloads a file changed by another
program. If you have unsaved edits, slipbox asks which text to keep.
The agent reads what you have saved, not text still unsaved in the lens.

This guide sets that up. Then it walks through a session:

- the agent finding and changing notes
- you handing it references and context
- each of you seeing what the other did

## Give the agent the skill

Start here after [Working with slipbox](getting-started.md) and the [reading/editing guide](lens.md). Review
[Scratch and context](../manual/scratch-and-context.md) for the capture tools used later in this workflow.

You need slipbox installed ([Installation](install.md)) and a folder of notes. This guide uses `~/slipbox-tour`,
with the two notes that [Working with slipbox](getting-started.md) makes in it: `inbox.md` and `ideas/coffee.md`.

slipbox comes with a skill for agents. It's a short Markdown file, built into slipbox, that teaches an agent the
command line:

- which command for what
- `--json`
- the exit codes
- the safe way to write

An agent that reads skills, such as Claude Code, loads it when you mention your notes or slipbox.

The installer, Homebrew and the source installer install the matching skill automatically for detected Claude Code
and Codex user configurations. Upgrades refresh it; source users rerun `scripts/install-local.sh` after updating.
See [Installation](install.md) for detected paths and the `--no-skill` / `SLIPBOX_NO_SKILL=1` skip options.

If you installed an agent later, run `slipbox skill --auto` to detect it. For a specific destination, use:

```bash
slipbox skill --install ~/.claude/skills
```

It writes the skill to `~/.claude/skills/slipbox/SKILL.md`, where Claude Code finds it, and says where.

For a manually chosen destination, run it again after an upgrade. If the skill there is already this one, it writes nothing
and says so. It won't write over a `SKILL.md` that slipbox didn't write, or write through a link, unless you add
`--force`.

For another agent, give `--install` the folder that agent reads skills from. Or have the agent run `slipbox skill`,
which prints the skill.

From source, `scripts/install-local.sh` installs both the launcher and regular skill files for detected agents.
It reports the launcher path and missing `PATH` entry. An older linked skill is preserved; replace it manually
with `slipbox skill --install <folder> --force` if you want automatic refreshes.

Uninstall previews recognized skills and removes them with `--yes`. Its ownership check, like `skill --install`,
is the frontmatter name `slipbox`; links and files that do not match stay and are reported.

The first tour already made `~/slipbox-tour` a vault. Check it before using the short note names below; `root` should
name this practice folder. If you use your own notes instead, open their existing vault.

<!-- example: agent-context -->

```bash
cd ~/slipbox-tour
slipbox info
```

You see:

- the folder slipbox works in (`root`)
- its name, if it has one
- how links are written there (`links`)
- where slipbox keeps its state and the scratch

## Open slipbox beside the agent

Split your terminal, using your terminal's own panes, tmux or zellij. Run slipbox in one pane and the agent in the
other, both in `~/slipbox-tour`.

```bash
slipbox ~/slipbox-tour
```

Both now use the vault marked by `~/slipbox-tour/.slipbox/`. In general, the nearest `.git`, `.slipbox/`,
`.obsidian/` or `.zk/` determines the vault. Without a marker, files under your home folder belong to home; files
outside home and all marked vaults belong to Elsewhere. An unmarked subfolder is not an isolated vault. See
[Vaults, home and Elsewhere](../manual/vaults.md).

## Watch the agent write

Open `inbox.md` in slipbox, and ask the agent to add a task to it. The agent runs something like this:

<!-- example: agent-first-write -->
```bash
slipbox write inbox --append --paragraph -- '- [ ] Call the plumber'
```

In slipbox, the note reloads at once. A message at the top right says `↻ inbox.md changed on disk — reloaded`. A note
the agent creates shows up in the explorer the same way.

If you have unsaved changes to that note, slipbox keeps both versions and asks what to do:

| Key | Does |
| --- | --- |
| `l` | Loads theirs |
| `k` | Keeps yours |
| `d` | Shows the differences |
| `m` | Merges the two |

[When a file changes on disk](../manual/editing.md#when-a-file-changes-on-disk) explains each answer.

![The conflict prompt: inbox.md changed on disk while it had unsaved changes, with its four
answers](../images/agents-conflict.png)

The agent hears about your unsaved changes too. While slipbox holds them, every command the agent runs warns
`unsaved changes in a running slipbox: inbox.md`. With `--json`, the note is listed in `stale`. The skill tells the
agent to ask you before writing such a note.

## Writes that never clobber yours

An agent that rewrites a note reads it first. It writes back only if nothing changed in between:

```bash
slipbox read ideas/coffee --json                          # the text, and its sha
slipbox write ideas/coffee --stdin --if-unchanged <sha> < new.md
```

If you saved the note meanwhile, the write is refused with exit code 5, and nothing is written. The refusal says:

`ideas/coffee.md changed since 126e8ecc93bebd26 (now a743dde9aa817bd7); not written`

The agent then reads the note again and makes its change on your version.

Every write is atomic and stays inside the vault.

Some commands change many files at once: `mv`, `convert-links` and `replace --all`. For those:

- `--dry-run` shows each line the command would change.
- With `--plan`, the command saves the change for `slipbox apply` to make after you've looked.
- `slipbox undo` takes the last one back.

## The command line and `--json`

Everything the agent does is a `slipbox` command. With `--json`, each one prints exactly one JSON object, holding
`ok`, `data`, `warnings` and `stale`.

The exit codes are fixed:

| Code | Means |
| --- | --- |
| 0 | ok |
| 3 | not found |
| 4 | ambiguous |
| 5 | refused |

The commands the agent uses most:

```bash
slipbox search grinder setting --json       # notes ranked by the words
slipbox find 'pour-over' --json             # every line holding the text
slipbox links ideas/coffee --json           # its links, and whether each reaches something
slipbox backlinks ideas/coffee --json       # the notes linking to it
slipbox link ideas/coffee --from inbox      # a link to write, the way this folder writes them
```

`slipbox commands` lists each of the TUI's actions beside the command that does the same.
[The command line](../manual/cli.md) has every command and what it prints.

## Hand the agent references: the scratch

The scratch is a Markdown file where references collect for your next prompt. There's one per vault, and one for
Elsewhere. You and the agent both add to it. You read it, and paste it into the agent.

1. In slipbox, open `ideas/coffee.md`.
2. Put the cursor on the line `A ratio of 1 to 16 suits a pour-over.`, and press `space s a`. The scratch gets that
   line's place, `path:line`: `` **At:** `ideas/coffee.md:5` ``.

   If you select lines first (`shift+v`, then `j`), the scratch gets `path:line-line` and the lines themselves.
3. The scratch opens, floating in the middle of the screen, ready to type after **Note:**. Say what you want about the
   place: an idea, a question, or what the agent should do there (`check the ratio for the small pot`). Then press
   `esc` and `q` to go back to the note. If you say nothing, the empty **Note:** goes.
4. Press `space s s` to open the scratch again, or `space s r` to keep it in the window on the right while you work.
   `capture.open_in = "right"` makes the right its usual place. It changes as the agent adds to it:

   ```bash
   slipbox capture "Is 1 to 16 right for the small pot?"
   slipbox capture --ref ideas/coffee.md:3-5 --snippet      # the place, and its lines fenced
   slipbox capture --ref ideas/coffee.md:5 "Check the ratio"   # the place, and a note on it
   ```

5. Press `space s y` to copy the whole scratch, to paste into a prompt.

`space s d` clears the scratch, after asking.

In a code file's code view, `space k s` adds the cell at the cursor, with its path and lines.

When you review what the agent changed, a change at a time, `c` sends one back the same way: the file, its lines, the
diff and your note ([Review an agent's change](code-and-git.md#review-an-agents-change)).

An agent clears the scratch only with `slipbox scratch clear --if-unchanged <sha>`. So nothing added since it read the
scratch is lost.

The scratch lives in slipbox's own state folder, not among your notes. `slipbox scratch path` says where.
`capture.location = "root"` keeps it in the vault instead, as `capture.file` names it. That setting never puts it in
a folder of Elsewhere's ([Configuration](../manual/configuration.md)).

### From nvim

`slipbox capture` works from any editor. In nvim, these two mappings add the cursor's line, or the selected lines with
their text:

```lua
vim.keymap.set("n", "<leader>pc", function()
  vim.fn.system({ "slipbox", "capture", "--ref", vim.fn.expand("%:p") .. ":" .. vim.fn.line(".") })
end)
vim.keymap.set("v", "<leader>pc", function()
  local s, e = vim.fn.line("v"), vim.fn.line(".")
  if s > e then s, e = e, s end
  vim.fn.system({ "slipbox", "capture", "--snippet", "--ref", ("%s:%d-%d"):format(vim.fn.expand("%:p"), s, e) })
end)
```

They add to the scratch of the folder nvim is working in. A path inside that folder is stored relative to it.

## Give the agent a topic: the context bundle

A note's context is one Markdown document that holds:

- the note
- the notes and files it links to
- the notes linking to it

1. On a note, press `space s c`. slipbox copies its context. A message says what went in:
   `copied the context of ideas/coffee.md: 2 files (0 linked, 1 linking to it), …`.
2. Paste it into the agent's prompt.

Each file is a section with its path, its lines and why it's there. Then comes its text, as it is on disk. Unsaved
notes are saved first, so the context holds what you see.

The agent can gather the same itself:

```bash
slipbox context ideas/coffee
slipbox context ideas/coffee --depth 2 --limit 40 --no-backlinks
```

| Flag | Does |
| --- | --- |
| `--depth` | Follows links further out (1 by default) |
| `--limit` | Caps the files (25) |
| `--no-backlinks` | Leaves out the notes linking in |

What didn't fit is named at the end. `context.depth`, `context.limit` and `context.backlinks` change the defaults.

## Let the agent see what you're reading

The TUI records what you read, within a second of each change:

- the note on screen
- the open tabs
- the notes read lately, with the line you were on

The agent reads it:

```bash
slipbox history --json        # data.current: the note on screen; data.read: newest first
```

So "the note I'm looking at" in a prompt needs no path. To point at a line, press `y r`. It copies the cursor's
`path:line`, to paste.

It works the other way round too. `slipbox send ideas/coffee --line 5` opens the note at that line in your running
nvim, as `space n s` does from slipbox. The skill tells the agent to do so only when you ask.

## Where next

**Next guide:** [Making slipbox yours](making-it-yours.md).

- [The command line](../manual/cli.md): every command, its JSON and its exit codes.
- [Editing](../manual/editing.md): saving, autosave and the conflict prompt.
- [Configuration](../manual/configuration.md): the scratch's place, the context's defaults, your editor.
- [Reviewing changes with Git](code-and-git.md): reviewing what an agent changed, a change at a time, and its branch
  before you
  merge it.
