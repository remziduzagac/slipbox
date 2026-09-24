# workslate — workshop conventions for solo + agent work

A small system of tools and conventions for solo knowledge work
with AI agents as collaborators. Implements the VM-side agent
orchestration role described in ADR-D14 / ADR-D23.

This file is an overview + pointers. Authoritative design lives
in each project's own repo.

## Vocabulary

| Term | Meaning |
|---|---|
| **workshop** | The place. Top-level container, conventionally `~/workshop/`. |
| **workbench** | A project. `~/workshop/<project>/`. |
| **worktree** | A task thread. A git worktree on its own branch, including the project's primary `main/` checkout. |
| **worker** | An agent (claude / codex / opencode) running inside a worktree, doing focused work. |
| **foreman** | The user's maestro agent at the workshop level — orchestrates work across workbenches. |
| **rig** | CLI tool that prepares worktrees and lays out cmux panes. |
| **worklog** | CLI tool for task tracking — markdown files in `.tasks/` directories. |

## Directory layout

```
~/workshop/
├── simpletodo/                       ← workbench (umbrella)
│   ├── main/                         ← primary checkout (a worktree)
│   ├── add-list/                     ← worktree on branch add-list
│   ├── .worktree-setup.sh            ← optional setup hook
│   └── .tasks/                       ← worklog task files
│
├── dotfiles/
│   └── …
│
└── .tasks/                           ← cross-workbench managerial tasks
```

`~/.tasks/` (above the workshop) is also valid for personal /
system-level items.

## Architecture

- **foreman** runs at the workshop level (one cmux ssh tab per
  scope, persistent). Has the broad context: every workbench,
  every `.tasks/` directory, external integrations.
- **worker** runs at the worktree level (one cmux ssh tab per
  task, spawned by `rig`). Has narrow context: its task, its
  files, the relevant tdl subtree.
- **foreman ↔ workers communicate only through worklog files**
  — handoffs, comments, mentions, status changes. No in-process
  IPC, no message bus. That boundary keeps each agent's context
  clean.

  One alternative to this was flagged and never weighed: `hcom`, in
  `docs/possible-tools.md`. It is parked deliberately — the entry
  records what it would have to beat.

## Components

| Component | Type | Repo / location |
|---|---|---|
| **rig** | bash CLI for worktree + cmux orchestration | own repo (separate from dotfiles) |
| **worklog** | TypeScript-on-Bun CLI for task tracking | own repo (separate from dotfiles) |
| **foreman** | agent role + skill files / CLAUDE.md fragments | TBD — likely the future `workslate` meta-repo |

Each component is independently usable:

- `worklog` works without the rest — a standalone task tracker.
- `rig` works without `worklog` — just creates worktrees and
  lays out panes; if `worklog` is on `$PATH`, it integrates.
- A foreman is just a claude session at `~/workshop/` reading
  the conventions; the role exists even with neither tool.

## Where the design lives

The substantive design for each component is in its own repo's
`docs/design.md`. This file does not duplicate that content.

- **rig** — separate repo (delegated to another agent for
  implementation; design doc within it).
- **worklog** — separate repo (implemented; design doc within
  it).
- **workslate** as a meta-system (foreman behavior, install
  flow, cross-component conventions) — TBD; will get its own
  repo when that design phase begins.

## What lives in dotfiles

- This overview note.
- Future: workshop bootstrap glue — `vm/install.sh` additions
  that ensure the conventions are in place on a fresh VM
  (create `~/workshop/`, install `rig` and `worklog`, place
  any shared skill files).

## Status (2026-05-03)

### Component status

| Capability | Tool | State |
|---|---|---|
| Worktree creation + agent spawn | `rig` | in flight |
| Live diff viewer | lazygit pane in rig's layout | will work as soon as rig ships |
| File tree + preview | helix pane in rig's layout | works |
| Browser surface (with localhost routing) | cmux native (verified) | works |
| Approval prompts (y/n) | cmux pane attach + send-key | works manually |
| Worktree removal + archive | `rig rm` → `worklog archive` | will work as soon as rig ships |
| Clipboard relay to host | cmux native selection (OSC 52) | in dotfiles, working |
| Task tracker | `worklog` | implemented + verified |

### Quality-of-life items — not blockers

| Item | Workaround |
|---|---|
| **Conversation history browser** (searchable, multi-agent history from `~/.claude/projects/...`) | `claude --resume` for current sessions; manual JSONL inspection for older state |
| **Cross-worktree status dashboard** (every workspace's agent state at a glance) | cmux tab strip shows presence; `rig status --branch X` checks one at a time |

### Real blockers — needed before flows can run

| Blocker | What it is | Plan |
|---|---|---|
| **Worker CLAUDE.md / skill file** | A document the agent reads on session start telling it how to use worklog (call `worklog context` / `worklog current`, append `worklog log` notes, write `worklog handoff` before context fills, set `worklog status review` when done). Without it, a fresh claude session has no idea worklog exists. | Drafting next; ~200-line markdown |
| **Foreman CLAUDE.md / skill file** | Workshop-level orientation for the maestro agent: what's in `~/workshop/`, how to delegate to workers via `rig`, how to plan across workbenches, when to create cross-cutting tasks vs workbench-local ones. | Draft after first real flow run reveals what context the maestro actually needs |
| **Workshop migration** | Existing checkouts live at `~/Projects/<proj>/`; rig assumes `~/workshop/<proj>/main/`. Not migrated yet. | Migrate one project (probably `tdl` since it's most active) to validate; then the others |
| **Bootstrap convention** | A fresh VM should land in workslate convention automatically — `~/workshop/` created, rig + worklog on PATH, skill files placed. Currently implicit / by-hand for beaver. | Add to `vm/install.sh` once steps 1–3 prove the convention |

### Smaller niceties (not on critical path)

- **Approval helper.** When claude pauses on `[Y/n]` you currently attach the agent's pane. A 5-line `rig approve <branch>` (`cmux send-key y enter`) shaves friction if it becomes annoying.
- **Worklog prompts library.** A templated first-prompt flow ("Begin Work on Ticket") via `worklog context <slug>` returning a context block. The worker skill file should tell the agent to read that on start.

### Smallest path to running flows

1. ✅ worklog implemented
2. ⏳ rig lands (delegated)
3. 🔲 worker CLAUDE.md skill file
4. 🔲 migrate one project (probably `tdl` → `~/workshop/tdl/main/`) to validate Layout C
5. 🔲 run an end-to-end flow on that project: `cmux ssh beaver --name test-task` → `rig new test-task <slug>` → claude works → `rig rm test-task` → verify worklog archive
6. 🔲 foreman CLAUDE.md skill file (after step 5)
7. 🔲 vm/install.sh bootstrap additions (after step 5)

After step 5 the system is real and self-sustaining; everything below is hardening and reach.

## History

This file was originally `wt-cmux-design.md` — an in-flight
working note for the worktree+cmux orchestrator (then called
`wt`, now `rig`) and the task tracker (then `tdl`, now
`worklog`). Once each tool got its own repo and design doc,
this note lost its purpose. Trimmed to an overview + pointers
on 2026-05-03.
