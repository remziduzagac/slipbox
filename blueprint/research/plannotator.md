---
status: current
created: "2026-10-14"
---

# Research: Plannotator and plannotator-tui, reviewing an agent's plan

[`plannotator/plannotator-tui`](https://github.com/plannotator/plannotator-tui), noted by the user on 2026-10-14 as a
competitor or alternative, and the product it belongs to, Plannotator. Read on 2026-10-14 from the TUI's README,
source, decision record, releases and issues, and the head of Plannotator's README; neither was installed or run. Its
ideas for how slipbox and an agent work together are in [ideas.md](../ideas.md) § Agent surface.

## Summary

- **Adjacent, with real overlap; Plannotator is the one to watch.** plannotator-tui is a focused annotator: select text
  in a Markdown file or in an agent's reply, mark it, and send numbered feedback to the agent (*read*: README). It
  doesn't edit the file, review git or search notes. Both it and slipbox review in the terminal what an agent wrote,
  send feedback through herdr and ship an agent skill. Plannotator, the browser app it belongs to (9.4k stars), reviews
  plans and diffs and hooks into nine agents (*summary*: its README's head): the audience, people supervising coding
  agents, is slipbox's.
- **The feedback goes straight back to the agent.** `herdr agent prompt` delivers it as the agent's next message
  (*read*: `src/delivery.rs`); slipbox's scratch is copied and pasted (`space s c`).
- **It reads the agent's replies, not only files.** `last` picks one of the agent's recent replies from its session's
  transcript, for eight or more agents (*read*: README, `crates/plannotator-tui-hosts`).

## What it does

**Opens** (*read*: README) a file or a folder (a tree with each file's count of annotations), or `last`: an agent's
recent reply, from the transcripts of Claude Code, Codex, pi, Copilot CLI, Droid, Hermes and OpenCode among others.

**Annotates** (*read*: README): a selection marked as a comment (💬), approval (👍) or rejection (✗). The feedback is
exported numbered, with lines: `# Annotations on plan.md`, `## Annotation 1 (line 12)`. `E` sends only the notes new
or changed since the last send; `S` sends and closes; `F` finishes and archives; `U` undoes; `H` restores.

**Stores** (*read*: README) the annotations as JSON under `~/.plannotator/`, "nothing written next to your files", in
the browser app's format, so both share them; what was sent is kept in an archive, `index.jsonl`.

**With herdr** (*read*: README, `gh repo list plannotator`): Herdr Annotate (662 stars), a herdr plugin that bundles
the binary: `prefix+o` reviews a folder, `prefix+shift+o` the agent's last reply; `herdr terminal` reviews a pane's
recent output.

**Its skill** (*read*: `skills/plannotator-tui/SKILL.md`): the agent writes a plan, runs `plannotator-tui herdr open
<file>`, and ends its turn; the review comes back as the next user message. Marked "Draft; not yet wired into an
installer".

**Headless** (*read*: README): `--export`, `--annotate <file> <quote> <text>`, `--snapshot`, `--bench`.

## Stack, distribution and activity

**Stack** (*read*: `Cargo.toml`, the crates' READMEs; *ran*: `wc`): Rust, about 20k lines in three crates, ratatui.
Markdown through `pulldown-cmark` and `tui-markdown`; code blocks deliberately not highlighted (no syntect); a wide
table's cells wrap; reference links and footnotes lose their targets when a block is drawn alone.

**Installs** (*read*: README, LICENSE): a Homebrew tap, `cargo install`, binaries for macOS, Linux and Windows. MIT.

**Activity** (*read*: `gh`, 2026-10-14): created 2026-08-28; 16 releases, v0.9.4 on 2026-09-25; last push 2026-10-07;
175 stars, 22 forks, 6 open issues; 112 of about 123 commits by one author; a record of 15 decisions
(`docs/decisions.md`). Not built yet: git diffs and pull requests (#59, "sharing state with the plannotator browser
app"), configurable keys (#58), finding files (#99).

**Plannotator** (`backnotprop/plannotator`; *summary*: its README's head): TypeScript, 9.4k stars, created 2025-12; a
review surface in the browser that "plugs directly into your agent through its hooks and commands": plans and specs
annotated, diffs and pull requests reviewed (git, jj, GitHub, GitLab), HTML artifacts, "AI built in".

## Beside slipbox

| Area | slipbox | plannotator-tui |
| --- | --- | --- |
| Its job | read, review and edit an agent's files | annotate a document or a reply, send it back |
| Changes the file | yes: the lens, source mode, vim's and a desktop's keys | no: notes kept outside it |
| Feedback to the agent | the scratch, copied (`space s c`); the CLI | `E` / `S`, sent through `herdr agent prompt` |
| An agent's reply | no | yes, from eight or more agents' transcripts |
| Rendering | tables, highlighted code, pictures, diagrams, maths | `pulldown-cmark`; plain code blocks |
| Git review | changes, signs, blame, a merge's broken links | no (#59; the browser app has it) |
| Links, search, roots | yes | a folder's tree |
| For agents | the whole CLI (`write`, `capture`, …) and a skill | `--annotate` and `--export`; a draft skill |
| Systems | macOS, Linux, Windows through WSL | and Windows itself |

## Not found out

How Plannotator hooks into Claude Code's plan mode: only its README's head was read, so "through hooks" is a summary.
How well the TUI renders and how fast it is: it wasn't run. The same organisation's `2n`, "directory-based notes for
the terminal", wasn't looked at.

## Sources

- [`plannotator/plannotator-tui`](https://github.com/plannotator/plannotator-tui): README, `Cargo.toml`, LICENSE,
  `src/delivery.rs`, `crates/plannotator-tui-hosts`, `skills/plannotator-tui/SKILL.md`, `docs/decisions.md`, issues
  #58, #59 and #99; `gh` for the figures (2026-10-14).
- [`backnotprop/plannotator`](https://github.com/backnotprop/plannotator): its README's head.
- The `plannotator` organisation's repositories (`gh repo list plannotator`): Herdr Annotate, `2n`.
