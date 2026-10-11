---
synced_with: main@0d2823e
---

# slipbox blueprint

slipbox is a terminal markdown notes app: a shared workspace for humans and agents over plain files, where a person in
the TUI and an agent on the CLI see the same files, the same links and the same answers (D33). It is TypeScript on Bun,
one core with two faces, compiled into one binary (D5, D8). Every phase on the roadmap is built, extensibility aside,
deferred (D37), and the initial design was declared settled on 2026-10-11 (D210). Still open: the licence (`14.6`,
D193), the checks on a real Mac before the first release (`14.13`), native Windows (`14.14`–`14.17`) and Bun's own
crash reports (D199).

## Where to start

1. [design/how-it-works.md](design/how-it-works.md): how it works, end to end.
2. [roadmap.md](roadmap.md): what is done, what comes next, what waits.
3. [requirements.md](requirements.md): what slipbox must do and be, and the constraints it keeps.

## The strands

- [roadmap.md](roadmap.md): the order of work: the steps by their stable IDs, the phases, and Later.
- [ideas.md](ideas.md): ideas and alternatives, and what became of them.
- [notes.md](notes.md): how each topic was discussed.
- [research/](research/README.md): what was learned from outside, and from where.
- [decisions/](decisions/README.md): every decision with its reasons, D1 onward, and the terms since renamed.
- [requirements.md](requirements.md): what slipbox must do and be.
- [design/](design/README.md): how it works now.

There are no `tasks/` or `workstreams/` yet: they appear with the next change.

## How things are recorded

- Requirements and design are the current truth; decisions say why; workstreams propose changes, are consolidated
  into their parents when complete, and are then archived.
- Decisions are append-only: a change is a new entry, and a note goes under each earlier entry it changes.
- Work goes top-down, from the goals to the tasks; corrections go back up to the level they belong to.
- The blueprint and the code are synced both ways; `synced_with` is the last commit reconciled.

This blueprint is public, so a contributor's agent needs nothing but this README to work in it:

- Read this README and the roadmap's status line first, then only what the job needs: the requirement and design
  sections it touches, and the decisions they cite (`grep -n '^## D39:' decisions/*.md`).
- The initial design is settled (D210): every change to requirements or design goes through a workstream. That is a
  folder in `workstreams/` with a short key (`WG`) that prefixes its IDs (`WG-D1`, `WG-T1`): a README with front matter
  (`status: draft`, then `active`, `complete`, `consolidated`; `created`), a `requirements.md` and a `design.md`
  holding its changes to the root's sections as ADDED, MODIFIED (with the text as it was, "Previously: …") or REMOVED,
  each named by path and section, and its `tasks/`. It writes only inside its own folder; the root's files change when
  it is consolidated, with the person's approval.
- Work that changes neither requirements nor design is a task: one file in `tasks/`, its ID in its H1 (`# T1: …`),
  its front matter `status` (`todo`, `doing`, `review`, `done`, `dropped`), `assignee`, `blocked_by` and `created`.
- A decision is recorded only once the person agrees: in its workstream, or, for what belongs to none, as the next D
  number at the end of its theme's file in `decisions/`. An entry is never rewritten; a dated note goes under it.
- Ideas go to ideas.md by topic, each with its outcome once settled; what was learned from outside goes to research/,
  every claim with its provenance; each discussion is added to notes.md.
- A change that alters what the blueprint describes updates it in the same piece of work. Where the code and the
  blueprint disagree, say so and let the person decide; never quietly change either to match.

## Conventions

- **Provenance** of a claim: *read*, seen in a named source; *ran*, executed; *summary*, through a fetched page's
  summary; *memory*, unverified knowledge; *ours*, a value of our own with no source.
- **Step IDs.** Plan items (`0.11`, `3.3`, `21.x`) are the roadmap's step IDs, and stable: cite them rather than
  restate the work. A decision's title names its items: `grep -n '(0.10[,)]' decisions/*.md`.
- **History stays in history.** Requirements and design say what holds now, and cite the decisions behind it; how it
  came to be lives in decisions, as dated notes under the entries a change touched (D210), and in ideas and notes.
- **Markdown** is wrapped at 120 columns, tables and code included. It is checked by markdownlint-cli2 with
  `~/.markdownlint-cli2.jsonc`, given as `--config`, since the tool reads a config from the current directory only and
  doesn't walk up. A clean lint is no proof an edit landed where it was meant to: read the result.
- **User documentation** lives in `docs/` (the keymap, the configuration, the CLI) and the project's README, written
  for users and never copied from here; the design may link to it.
- **`<dotfiles>`** means `~/Projects/dotfiles` on the user's machine: the nvim render-markdown config, the herdr config
  and the workslate theme files are there.
- **The toolchain** is mise's, on a login shell's `PATH`: a non-interactive shell finds no `bun`, which looks exactly
  like bun missing. Use `zsh -lc '…'` before concluding a tool is absent.
- **Checks.** `bun run check` (the typecheck, the boundary, the supply chain's gates, the tests) runs freely. Terminal
  tests and live checks against real servers are listed for the person's approval before they run (D207). A feature
  just built is tried live by the agent, in a herdr tab of its own on the reference set, and marked done once it works
  (D209).
- **Every bug fixed gets a regression test** that fails without the fix.
- **The examples.** The reference set, `examples/home/`, holds every case of every feature, listed in its `CASES.md`:
  use it to test a feature. The demo vault, `examples/vault/`, holds the rendering fixtures (its `about-this-vault.md`
  says what each note exercises): use it when touching rendering.
- **Before changing what others rely on:**
  - Storage (D39), the walk (D40) and the CLI's commands (D18) are relied on by the index, the watcher and agents:
    change them through a decision.
  - A dependency is checked against D3 (an external binary may be optional, never required) and D192 (its licence, and
    its own dependencies') before it is added.
  - A settled decision is read before it is reopened: most were decided against an alternative that looks obvious from
    outside.
  - The phases were reasoned, not decreed: they move only deliberately, saying why (D24).
