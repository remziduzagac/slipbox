# slipbox — implementation plan

Status: **phases 0–5c built** — 3b (`16.x`, files beyond markdown), 4 (vaults, renames, search, git, embeds), 5
(`19.x` and `16.18`–`16.23`: language servers and more languages; its LSP face, `11.x`, removed in 5b), 5b (`20.x`,
plain paths) and 5c (`21.x`, paths inside, conventions at the edges) included. Scout (`6.10`) is postponed: it became
trailscout, its own project, which slipbox will reach through its SDK once that exists. Captured 2026-09-25, phased
2026-09-25, phases 0–2 implemented 2026-09-25, phase 3 2026-09-28, phases 3b and 4 by 2026-10-01, 5b by 2026-10-03,
5c and the rest of 5 by 2026-10-07 — how it was built is in `docs/design/`, the decisions it needed in
`docs/design/decisions.md`.

The design lives in `docs/idea.md` — what slipbox is, why each decision went the
way it did, and what was ruled out. This file is the other half: the units of work, with
stable IDs so they can be referred to without re-deriving the list.

The clusters below are dependency order. The **Phases** section assigns them to phases, and
each cluster heading says which phase it belongs to.

## How to use this file

**Read in this order.** **Phases** says what happens when. **Principles** is the two rules that
constrain everything (CLI parity, and agent integration being incremental). **Decisions** records
what is settled and what still gates work. Everything after that is the item lists, one per
cluster, each labelled with its phase.

Cluster names are not phase numbers — `3.x` is the TUI and lands in phase 2. The IDs exist to be
cited, not to imply an order.

- IDs are stable. Cite them (`3.3`, `10.1`) rather than restating the work.
- An item is one sitting's work or less. If it isn't, split it and add a decimal.
- Items marked **decide** produce an answer, not code. They gate the items under them.
- Items marked **constraint** are not schedulable — they are requirements on other items,
  and they get retrofitted by audit if treated as tasks.

---

## Phases

| Phase | Focus | Clusters | Finish line |
| --- | --- | --- | --- |
| **0** | Codebase, CLI skeleton | Step 0, thin `9.1`–`9.3` | Boundary enforced in CI; fixture vault; `--json` exists |
| **1** | Rendering — leaf parity | `1.1`–`1.3`, all `2.x`, `slipbox render` | Replaces leaf for reading `docs/` |
| **2** | The app — beat leaf | `3.x`, `5.1`–`5.4`, `8.x`, link-follow, `9.3`–`9.4` | **An agent can drive it** |
| **3** | Editing | all of `4.x`, `5.5`–`5.10`, `7.2`–`7.5`, lint surface | Small edits stop provoking `$EDITOR` |
| **3b** | Files beyond markdown | all of `16.x` | Any text file opens; data files render; code has an outline |
| **4** | Vault and structure | `17.x`, rest of `1.x`, `6.x`, `7.1`, embeds | Backlinks and search on a real vault |
| **5** | LSP, code intelligence | `11.x`, `19.x`, `16.18`–`16.23` | nvim gets slipbox's graph; slipbox the servers' |
| **5b** | Plain paths, virtual vaults | `20.x` | Open any file or folder and work: paths, derived vaults |
| **5c** | Paths inside, conventions at the edges | `21.x` | Other tools' links read and written; no vaults |
| **6+** | Export, images, extensibility | `10.x`, `12.x`, `13.x` | — |

`14.x` distribution is not a phase. It lands whenever the thing first needs to run on a VM,
probably during phase 2.

### Why this order

**Phase 3b comes before the vault (decided 2026-09-29).** Viewing and editing come first: the
review work slipbox serves — reading what agents produced, configs and code as much as notes — needs
every text file to open well before the vault grows broader concepts.

**Phase 5b came next (decided 2026-10-02, built by 2026-10-03).** Plain paths and virtual vaults (`docs/idea.md`,
"Plain paths, virtual vaults") change what a link is and what a vault is; the rest of phase 5 (`16.18`–`16.23`)
waited, since it doesn't depend on either. The LSP face phase 5 built (`11.x`) was removed in it: with plain paths,
editors' own servers follow the links, and agents have the CLI.

**Phase 5c was decided 2026-10-05, after a review, and built by 2026-10-07.** Paths inside, conventions at the edges
(`docs/idea.md`, "Paths inside, conventions at the edges") revises phase 5b after a survey of other tools: `/` as a
root, other tools' link conventions followed, `slipbox://` pointers between named folders, and no vaults to meet. The
rest of phase 5 (`16.18`–`16.23`) waited on it, as it did on 5b, and followed (done 2026-10-07).

**Phase 1 is rendering because it de-risks the premise.** If the rendering is not better than
leaf's, nothing after it matters. It is also self-contained — parse, layout, theme — and needs
no graph, so it is a real milestone rather than scaffolding.

**Phase 2 is "beat leaf", which is a sharper target than "add features".** Phase 1 reaches
parity; phase 2 fixes what leaf does badly and what has already caused friction in daily use:
one file at a time, history that stores only a path, no reading position, no mouse selection.

Two things are pulled early into phase 2 deliberately:

- **The watcher.** Read-only reload with no editing yet means no conflict cases, so it is
  cheap — and it delivers "an agent rewrites a note while you watch", the product's core
  premise, three phases before it would otherwise arrive.
- **Scratch capture.** It is inherently CLI-shaped, so it is the first real exercise of the
  parity rule rather than a late bolt-on.

**Link-following is split out of the graph and pulled into phase 2.** Following a `[[link]]`
*is* navigation, so leaving it to phase 4 would make phase 2's navigation incomplete and
phase 3 an editor that cannot traverse its own vault. Backlinks and the persisted index came
forward too, with the phase 2 CLI (see `docs/design/decisions.md`); tags, unresolved-link lists,
aliases and heading references stay in phase 4, where the rest of the graph lands.

**LSP is phase 5, not phase 3.** Its entire value is the graph — `[[` completion, definition,
references-as-backlinks, rename-with-link-fixing. Before phase 4 it has almost nothing to
serve. What belongs in phase 3 instead is **linting**, which needs no LSP at all: run
`markdownlint-cli2` and surface the violations.

### Relationship to the design's proposed v1

`docs/idea.md` proposes a v1 cut of read-and-navigate plus capture. That maps to
**phases 1 and 2 plus the link-follow slice of phase 4**, and it is deliberately not identical:
the design's cut bundles wikilinks, search and one theme together, while the phases split
search into 4 and keep only link-following in 2.

**Where the two differ, this file is the one that is scheduled.** The design's cut stays useful
as the statement of what "usable" means, and its done-test — replacing leaf for `docs/`, and
the scratch replacing `prompt-buffer.lua` — becomes the finish line for phases 1 and 2
respectively.

---

## Principles

**Everything the UI can do, the CLI can do.** Not a feature wish — it is how the
architecture stays honest. Forcing every action to be CLI-reachable forces every action into
the core, which is the boundary `docs/idea.md` already commits to. Without the rule
the boundary decays into "core is whatever the TUI happened not to need".

Stated precisely so it does not become aspirational:

> **The CLI must reach every state change, not every interaction.**

| CLI reaches it | TUI only |
| --- | --- |
| open, render, follow a link, search, capture, export, rename, graph queries | scroll, cursor, modes, conflict prompt |

That is one stated exception class — interaction needs a human at a terminal — instead of
arguing it case by case.

It pays for itself immediately rather than being overhead: `slipbox render file.md` to stdout
is how the renderer gets snapshot-tested in phase 1.

**Expect the CLI to churn at each phase boundary — except for a small stable subset.** Redesign
is normal while nothing depends on it, and cheaper than guessing the surface up front. But agents
start depending on it in phase 1–2 (see below), and redesigning under a live consumer has a real
cost. So the rule has two halves:

- **Stable from phase 1, versioned:** `render`, `capture`, and a couple of graph queries. These
  are what an agent or an nvim keybinding will call, so breaking them breaks a workflow.
- **Everything else churns freely**, with pre-1.0 breakage declared up front rather than
  apologised for later.

---

**Parity is also the delivery mechanism, not just hygiene.** If an agent can only reach what the
CLI exposes, then every gap in parity is a gap in the thing slipbox exists for. That makes the
rule structural rather than something to quietly relax under deadline.

---

**The agent surface is incremental, not a later phase.** The CLI is the agent-communication
mechanism from the start and it grows with each phase, rather than being designed once at the
end.

**From phases 1–2 slipbox must already be usable by an agent**, because the intended daily mode
is UI and agent together — not UI first with agents bolted on afterwards. A notes app whose
agent story arrives in phase 6 would be a notes app that never got tested the way it is meant
to be used.

Early distribution is deliberately cheap: a `bunx`-style invocation, or a manual local install
during development. It is local, so manual is fine — what matters is that an agent can invoke
it, not that it is packaged well. Proper packaging (`14.x`) stays late.

**A server, later, is not ruled out.** The design records three options for the agent surface —
a server like nvim's, per-agent plugins, or a CLI — and picks the CLI. That is a *starting*
choice, not a permanent one. The natural trigger for revisiting it is `9.4`: a CLI invocation
is a second process with a second graph, so it cannot see an unsaved buffer and cannot raise
the TUI's conflict prompt. A socket to the running instance is exactly what fixes that. If
`9.4` turns out to hurt in practice, the server becomes the answer rather than a rejected
option.

### What this puts in phase 2

`9.3` (no-TTY behaviour) and `9.4` (cross-process semantics) land in phase 2, where agents first
depend on them for real. `9.8` (the agent-facing skill) tracks every phase.

**`8.1` — the capture path — is `slipbox capture`.** Phase 2's finish line is that the scratch
replaces `prompt-buffer.lua`, and that captures from the *code* buffer being edited in nvim,
where slipbox has no entry point. Since editors and agents can drive the CLI from phase 1–2, an
nvim keybinding calls `slipbox capture` instead of writing to a local scratch, and the loop
closes without slipbox ever needing to browse code. The capture direction belongs in the CLI,
not the TUI.

**`9.8` should track each phase, not arrive at the end.** This is the
`kepano/obsidian-skills` pattern the design already cites — a CLI *plus* a skill teaching agents
to drive it, from Obsidian's own CEO. A CLI with no skill means every agent rediscovers the
surface by trial and error, which is worse than a smaller surface that is documented.

## Decisions

Design decisions live in `docs/idea.md`. This section carries only the ones that affect
*what gets built when*, plus the ones still open. Git history holds the record of how any of them
changed.

### Settled

| Decision | When | Where |
| --- | --- | --- |
| Phasing 0–6+ | 2026-09-25 | Phases, above |
| CLI parity, with a stable subset from phase 1 | 2026-09-25 | Principles, above |
| Agent integration is incremental from phase 1–2 | 2026-09-25 | Principles, above |
| A server is deferred, not rejected | 2026-09-25 | Principles, above |
| `8.1` the capture path — `slipbox capture` is it | 2026-09-25 | Principles, above |
| `9.4` cross-process semantics | 2026-09-25 | below |
| `0.10` storage layout | 2026-09-25 | `docs/design/decisions.md` |
| `0.11` the file walk | 2026-09-25 | `docs/design/decisions.md` |
| `9.1` the CLI command list | 2026-09-25 | `docs/design/decisions.md`, `docs/design/cli.md` |
| `1.4` link resolution | 2026-09-25 | `docs/design/decisions.md` |
| `3.5` reload anchoring | 2026-09-25 | `docs/design/decisions.md` |
| `3.11` mode taxonomy and dispatch | 2026-09-25 | `docs/design/decisions.md` |
| Phase 2 is read-only; `4.1`–`4.2` stay in phase 3 | 2026-09-25 | `docs/design/decisions.md` |
| Phase 3 order and editing design | 2026-09-28 | below |
| Files beyond markdown: three groups, phase 3b before the vault | 2026-09-29 | `docs/idea.md`, `16.x` below |
| `6.1` search: our own index, Scout later | 2026-10-01 | `docs/design/decisions.md` |
| Phase 5: language servers both ways, linters, diagnostics everywhere | 2026-10-01 | below |
| `19.6` trust: everything trusted, as in nvim and Helix (revised by `23.1`) | 2026-10-01 | `docs/design/decisions.md` |
| `23.1` run nothing of a folder's own, unless you trust its root | 2026-10-07 | `docs/design/decisions.md` |
| `12.x` the terminal's own first: Unicode, then pictures in the theme's colours | 2026-10-08 | `12.x` |

### Phase 3 decided 2026-09-28 — editing, in five steps

1. **Checkbox toggle** (`4.11`): the first write. One byte-range edit, atomic, through the same
   write path everything after it uses.
2. **Hand-off, both kinds** (`4.1`, `4.2`, `4.12`): one `{file}` / `{line}` template, and whether
   slipbox waits for it. *Suspend* steps aside for `$EDITOR` in this terminal and reloads on
   return; *remote* tells an editor already running elsewhere (nvim's `--server`, `code -g`) to
   open the note and keeps going, the watcher picking up its saves.
3. **Source mode with the modal layer** (`4.3`, `4.4`, `4.13`): **source mode is another layout
   of the same note** — the raw markdown, a source line per row, lightly highlighted — so
   everything built on the layout (motions, find, `*`, visual, the mouse, wrap, line numbers,
   scrollbars) works unchanged, and the keys stay the ones the rendered view has. Editing is a
   layer over that: vim-shaped (insert, operators and motions, `.`, counts), every operator a
   named command. A good editor, consistent with the other modes; not all of vim.
4. **Saving and conflicts** (`4.5`–`4.10`, `5.5`–`5.7`): atomic saves, autosave after a long
   idle, the dirty marker, and the vim-shaped conflict prompt when an agent writes a note with
   unsaved changes.
5. **Live preview** (`4.14`): the rendered layout with the block under the cursor swapped for its
   source layout, edited in place. It needs per-block re-layout (`15.1`, at least for one block).
   Its look is tuned once it works.

Tables are edited in source mode only; frontmatter is spliced by byte range (`7.6`); undo is kept
as source edits so it survives an external reload (`4.5`).

### `9.4` decided 2026-09-25 — disk is the contract

The question is only about **reads**. Writes are covered by the existing design — the CLI writes
atomically, the TUI's watcher sees it, the vim-shaped prompt fires — and two graphs cannot
diverge, since both read the same disk. Reads are the gap: with autosave on a long idle delay, an
agent can read up to half a minute of stale content plus however long you were typing.

**Decision: the CLI sees the filesystem and nothing else. "Saved" is the commit point.**

This is correct semantics rather than a compromise. An agent acting on a half-written unsaved
sentence is *worse* than one acting on the last saved version — unsaved means not yet real. Git
works the same way: tools see the working tree, not your editor's undo buffer. So staleness stops
being a bug and becomes a definition.

| Direction | Behaviour |
| --- | --- |
| **CLI reads** | Files, plus the persisted cache when it is fresh. Never sees unsaved buffers |
| **CLI writes** | Writes atomically and returns. The TUI treats it as any external writer |
| **Conflict** | Raised by the TUI, never by the CLI. An agent is not blocked by your open editor |

Two things make that honest rather than merely simple:

- **Flush at handoff.** The moments freshness actually matters are user-initiated: `capture`,
  building a context bundle, invoking an agent from inside slipbox. Those flush dirty buffers
  first. In-process, no IPC, and it covers the case that would otherwise bite daily.
- **Advisory staleness, not silence.** The TUI maintains a small file in the state dir — never in
  the vault — listing paths with unsaved changes, stamped with its pid so a reader can ignore it
  after a crash. The CLI surfaces it: a warning in human output, a `stale` array in `--json`. The
  agent then decides, or asks. **Advisory only — never a lock.**

**Explicitly ruled out:** lock files; shadow copies of dirty buffers; the CLI raising the TUI's
prompt; the CLI refusing to write a file that is open and dirty. The shadow copy is the tempting
one and it is the worst — an agent editing against text you then discard produces work against
content that never existed.

**Escalation trigger, so this links to the server question by a measurable condition:** if the
advisory warning fires often enough to be noise, that is the signal to bring the socket forward —
the deferred option 1. Not a hunch, a threshold.

Two consequences: **`1.9` matters earlier**, because a CLI invocation should read a fresh cache
rather than rebuild the graph every time an agent calls; and concurrent CLI writes are
last-writer-wins at the byte level, which atomic writes make safe (no torn files), with an
optional `--if-unchanged` for careful writers.

### Phase 5 decided 2026-10-01 — language servers, linters, and slipbox's own

1. **slipbox is an LSP client for the code it opens** (`19.x`). A language's servers are found: the user's config
   first, then the project, then `PATH` and known places. Those published on npm — JavaScript ones, and prebuilt
   binaries shipped through npm such as Biome or tsgo — are installed when first needed, into slipbox's own data
   folder: pinned, their install scripts off, never globally (`[lsp] auto_install = false` stops it). Native servers
   are never installed — the system is the user's — only found, or set in the config.
2. **Linters, by the same rule.** Where a server lints already (pyright; clippy through rust-analyzer; gopls's
   staticcheck; clangd's clang-tidy; shellcheck through bash-language-server), that is used. Other linters run only
   where the project has their config, the project's own copy first (`node_modules/.bin`, `.venv/bin`,
   `vendor/bin`, bundler): one on npm is installed like a server, a native one is found or configured. A linter with
   an LSP mode joins as an add-on server; one without runs through the lint surface (`3.21`, widened).
3. **Settings in the formats other tools already read** — nothing slipbox-only to learn or keep in step:
   - a tool's own config files (`eslint.config.js`, `ruff.toml`, `pyrightconfig.json`, `.markdownlint-cli2.jsonc`)
     are its settings, and slipbox never restates them, so the editor, CI and slipbox agree;
   - which servers run, and how, takes Helix's `languages.toml` shape — `[language-server.<name>]` (`command`,
     `args`, `config`, `environment`) and `[[language]]` (`name`, `language-servers`, `roots`, `formatter`) — so a
     Helix section pastes in;
   - a server's `config` is its own settings, the same JSON nvim's `settings`, Zed's and VS Code's take;
   - a linter without LSP is described in efm-langserver's keys (`lint-command`, `lint-formats` in vim's
     errorformat, `lint-stdin`);
   - a project's `.vscode/settings.json` answers its servers' settings requests, as VS Code would.

   A program to run stays the user's choice: `command`, `args`, `environment` and `lint-command` are read from the
   user's config only, never a vault's (as `lint.command` is).
4. **Diagnostics from every source look alike, in every mode** — syntax (`16.9`), lint (`3.21`), servers, linters —
   in source mode, the lens and the rendered view:
   - a bar beside the text: a line with problems shows how many, coloured by the worst (error, warning, info,
     hint); in the rendered view, on the row its source line starts on;
   - the text itself underlined or highlighted where the problem is, mapped through the layout when rendered;
   - the bar and the marks each toggled on its own (`space u`), and remembered like the other UI settings.
5. **slipbox serves markdown to editors** (`11.x`, removed in `20.23`): `slipbox lsp`, in vaults only
   (`.slipbox/`), marksman staying for markdown elsewhere. A thin layer on the core, with `vscode-languageserver`
   for the protocol; the TUI keeps calling the core directly. Renames are edits the editor applies (they skip
   slipbox's undo log), and lint findings stay off over the LSP, since the editor runs its own linter.
6. **New languages** (`16.18`–`16.23`): Swift, HTML and CSS, PHP, Dockerfile, the web frameworks (Vue, Svelte,
   Astro); Ruby and C/C++ decided and done (`16.23`).

**Trust (`19.6`), decided with the user:** everything is trusted — revised 2026-10-07 by `23.x`, so that nothing of a
folder's own runs unless you trust its root. Servers and linters run wherever slipbox opens a file, the project's
own copies (`node_modules/.bin`, `.venv/bin`, `vendor/bin`) included, and they run the project's code — build
scripts, `eslint.config.js` — as they do under nvim or Helix; nothing asks first. What stays is the rule above: a
vault's committed config never names a program to run.

**Order:** `11.1` (the protocol library, for both directions), then the markdown server (`11.x`), then the
diagnostics display on today's findings (`19.8`–`19.11`), then the client and finding servers (`19.1`–`19.7`),
reading features, editing features, linters, and the languages.

### Still open, and each gates work

| ID | Decision | Gates |
| --- | --- | --- |
| `10.5` | PDF base — `pdfkit` or `@react-pdf/renderer` | Phase 6+ |

## Step 0 — codebase

*Phase 0.*

Everything here is cheap now and expensive later. That is the only thing they have in
common, and the only reason they are step 0.

| ID | Item | Why it cannot wait |
| --- | --- | --- |
| 0.1 | **Done.** Repo, licence, README, `bun init`, strict TS | — |
| 0.2 | **Done.** Module layout `core/` `tui/` `cli/` `lsp/` | The three-faces split |
| 0.3 | **Done.** CI check: `core/` must not import `tui/` | OpenTUI is Bun-only FFI; a breach kills the CLI silently |
| 0.4 | **Done.** Test runner + snapshot harness | Snapshotting the pure layout stage *is* the strategy |
| 0.5 | **Done.** **Fixture vault** — wikilinks, collisions, wide tables, CJK, frontmatter, CRLF | All tests use it |
| 0.6 | **Done.** Pin OpenTUI exactly, write the upgrade policy | Pre-1.0, 169 commits per 90 days |
| 0.7 | **Done.** One width function; nothing else measures text | Display width governs each wrap and cursor position |
| 0.8 | **Done.** **Command registry** — every action named | Palette, keymaps, modal layer and plugins all consume it |
| 0.9 | **Done.** Config loader — TOML, user plus vault marker, vault wins | Almost everything reads config |
| 0.10 | **Decided, done.** storage: config vs cache vs **state** | Paths bake in; moving them needs a migration |
| 0.11 | **Decided, done.** the walk: extensions, ignores, symlinks, caps | Changes graph, perf, indexing, watching |
| 0.12 | **Done.** Version stamp in the vault marker dir | Nothing to migrate *from* without it |

## Core: vault and graph — `1.x`

*Phase 1 for `1.1`–`1.3`; phase 2 for link-follow from `1.4`, `1.5`, `1.8`–`1.10`; the rest phase 4.*

| ID | Item |
| --- | --- |
| 1.1 | **Done.** Vault root discovery: marker dir, precedence, `--root`, single-file mode |
| 1.2 | **Done.** File walk implementing 0.11 |
| 1.3 | **Done.** Parse pipeline: remark + gfm + frontmatter + wiki-link |
| 1.4 | **Decided, done.** link resolution, then build it: `nameToPath` as lists, collisions, case policy |
| 1.5 | **Done.** Backlinks map |
| 1.6 | **Done.** Tags map: frontmatter `tags` and `#tags` in the text, nested, one tag whatever its case |
| 1.7 | **Done.** Unresolved-link set (and ambiguous links): the Problems panel, This file and All, `slipbox problems` |
| 1.8 | **Done.** Incremental single-file graph update |
| 1.9 | **Done.** Index persistence: when, and to the cache location from 0.10 |
| 1.10 | **Done.** `slipbox init` and the no-marker path — announce the degradation, offer to create |
| 1.11 | **Done.** Embeds drawn in place: `![[note]]`, `#Heading`, `#^block`; read-only, loops and depth capped |

## Rendering — `2.x`

*Phase 1.*

| ID | Item |
| --- | --- |
| 2.1 | **Done.** **mdast to layout IR — pure, framework-agnostic** |
| 2.2 | **Done.** Blocks and inlines: headings, lists, code, quotes, emphasis |
| 2.3 | **Done.** **Table allocator**, including the aggregate-minimum overflow bug |
| 2.4 | **Done.** Wrapping over 0.7 |
| 2.5 | **Done.** Code-fence syntax highlighting |
| 2.6 | **Done.** Theme tokens, built-ins, base16 loader |
| 2.7 | **Done.** Readability defaults: render-width inset, inline-code background, bold fg, border contrast |
| 2.8 | **Done.** Glyph capability: Nerd Font detection and an ASCII fallback set |
| 2.9 | **constraint** strip terminal escapes from text on the way into layout |

## TUI — `3.x`

*Phase 2.*

| ID | Item |
| --- | --- |
| 3.1 | **Done.** Renderer bootstrap, sidebar / content / status layout |
| 3.2 | **Done.** Scroll with viewport-only rendering |
| 3.3 | **Done.** Buffers, tabs, one split |
| 3.4 | **Done.** Reading position per note |
| 3.5 | **Decided, done.** reload anchoring — line number, heading, node id or content hash |
| 3.6 | **Done.** Back/forward history stack |
| 3.7 | **Done.** File explorer |
| 3.8 | **Done.** Quick switcher |
| 3.9 | **Done.** Outline |
| 3.10 | **Done.** Command palette over 0.8 |
| 3.11 | **Decided, done.** mode taxonomy and dispatch order, plus the key collisions |
| 3.12 | **Done.** Default keymap |
| 3.13 | **Done.** **Message sink** — one place for errors, warnings and script stderr |
| 3.14 | **Done.** Narrow-terminal collapse |
| 3.15 | **Done.** Session restore |
| 3.16 | **Done.** Filters match each typed word with its letters together, words in any order — not letter by letter |
| 3.17 | **Done.** Footnotes: the right panel's second view (`space n f`): each footnote, its references, jumps |
| 3.18 | **Done.** Footnotes added (`space n shift+f`, `a`, `+`), edited, renamed, deleted; `slipbox footnotes … add` |
| 3.19 | **Done.** Info: the right panel's first view — the file's place, vault, counts, state, properties, tags |
| 3.20 | **Done.** Properties edited in a floating editor (`e`, `space n shift+p`): the frontmatter, written back |
| 3.21 | **Done.** The lint surface: markdownlint-cli2's findings by line, status line, Problems; `problems --lint` |

## Editing — `4.x`

*Phase 3.*

| ID | Item |
| --- | --- |
| 4.1 | **Done.** `$EDITOR` hand-off using OpenTUI `suspend()` / `resume()` |
| 4.2 | **Done.** `editor.command` template with `{file}` and `{line}` — there is no portable line-number flag |
| 4.3 | **Done.** In-app editor — built as `NoteBuffer` with `editing.ts` and `vim.ts`, not on `Textarea` |
| 4.4 | **Done.** Modal layer — state machine over the named actions from 0.8 |
| 4.5 | **Done.** Undo/redo wiring, surviving external reload |
| 4.6 | **Done.** Atomic save, temp plus rename |
| 4.7 | **Done.** Autosave, long idle delay |
| 4.8 | **Done.** Dirty-state indicators |
| 4.9 | **Done** (`15.1`). Incremental reparse |
| 4.10 | **Done.** Flush dirty buffers at handoff points — capture, context bundle, invoking an agent |
| 4.11 | **Done.** Checkbox toggle — a key and a click on `[ ]`; the first write |
| 4.12 | **Done.** Remote hand-off — open the note in an editor already running (nvim `--server`), no wait |
| 4.13 | **Done.** Source mode — the raw markdown as a layout, so the reading keys work unchanged |
| 4.14 | **Done.** Live preview — the block under the cursor as its source, edited in place (the lens) |
| 4.15 | **Done.** The lens scrolls inside a block taller than its maximum, with "↑ N lines" on its rules |
| 4.16 | **Done.** Find and replace — a replace row under find (`ctrl+h`); vim's `:s` with `g` `i` `c`; `cgn` and `.` |
| 4.17 | **Done.** The lens opens on the cursor's innermost section whole when it fits, and moves section to section |

## Concurrency — `5.x`

*Phase 2 for `5.1`–`5.4`; phase 3 for `5.5`–`5.10`.*

| ID | Item |
| --- | --- |
| 5.1 | **Done.** Watcher, debounce, ignore own writes |
| 5.2 | **Done.** Watch-registration failure path — inotify limits on the Linux VMs; degrade loudly |
| 5.3 | **Done.** Silent reload when clean |
| 5.4 | **Done.** Surface an external change the moment it lands |
| 5.5 | **Done.** Vim-shaped conflict prompt — `(L)oad` `(K)eep` `(D)iff` `(M)erge` |
| 5.6 | **Done.** Autosave aborts on mtime change |
| 5.7 | **Done.** Post-`(K)eep` state: autosave off until an explicit, confirmed save |
| 5.8 | **Done.** Incremental graph update from watch events |
| 5.9 | **Done.** `HEAD` moves as one event: git's changes held while it writes; no moves; each branch its tabs |
| 5.10 | **Done.** Autosave waits out git's index lock, and so does the watcher's news (`5.9`) |
| 5.11 | **Done.** Git's marks in the explorer: each changed file's state, a folder with one; asked in the background |
| 5.12 | **Done.** A merge's conflicts in Problems and `slipbox problems`: each unmerged file at its first marker |
| 5.13 | **Done.** What this branch changed against the base, and a note's diff: `space g c`, `space g d`; CLI |
| 5.14 | **Done.** The worktrees by branch: `space g w` opens this note in another; `slipbox worktrees` |

## Search — `6.x`

*Phase 4.*

| ID | Item |
| --- | --- |
| 6.1 | **Decided.** Our own index in the core (SQLite FTS5), a scan until it's built; an outside engine later |
| 6.2 | **Done** (`find`, `space f g`). Literal search: every match |
| 6.3 | **Done** (`find --regex`). Regex search |
| 6.4 | **Done.** Scoping by tag and folder: `#tag` / `tag:x` (nested tags too), `path:folder/` |
| 6.5 | **Done.** Results list and navigation in the TUI (`space f s`): ranked as you type, the words marked |
| 6.6 | **Done.** The search index: FTS5 in the cache, a row per file, BM25; caught up by size and mtime |
| 6.7 | **Done.** The change feed: every change to the vault's files through the graph (`onChange`) |
| 6.8 | **Done.** `slipbox search` (ranked; the index, else a scan), `slipbox index`; `[search] engine` |
| 6.9 | **Done.** The TUI keeps the index: built in idle slices, kept by the feed; unsaved notes searched as shown |
| 6.10 | **Postponed** (2026-10-07): Scout became trailscout, its own project; slipbox uses its SDK when that exists |
| 6.11 | **Done.** better-sqlite3 for the index: its own SQLite (3.53.4); Bun 1.4.2 and up, glibc 2.34 |
| 6.12 | **Done.** Sections are scout's: the containment tree cut to the 400–1500 band; a hit cites its section |
| 6.13 | **Dropped** (2026-10-07). `@slipbox/links` for scout: scout became trailscout (`6.10`), its own project |

## Write safety — `7.x`

*Phase 3, except `7.1` which needs the graph and lands in phase 4.*

| ID | Item |
| --- | --- |
| 7.1 | **Done** (`17.15`). Rename with link fixing, as byte-range edits from mdast positions |
| 7.2 | **Done** (`17.15`). **Multi-file preview** of the transaction |
| 7.3 | **Done** (`17.15`). Confirm, and warn when the tree is already dirty |
| 7.4 | **Done.** Undo a rename: `space v shift+u`, `slipbox undo` — the files as they were, what moved back |
| 7.5 | **constraint** never write outside the vault root — decide what a symlink out means |
| 7.6 | **Decided, done.** frontmatter is spliced by byte range, never parsed and re-serialised |

## Scratch capture — `8.x`

*Phase 2.*

| ID | Item |
| --- | --- |
| 8.1 | **Done.** The capture path is `slipbox capture`, called from nvim — see Decisions |
| 8.2 | **Done.** Storage location per 0.10 |
| 8.3 | **Done.** Accumulator: `path:line` refs and excerpts |
| 8.4 | **Done.** Markdown format carrying source refs |
| 8.5 | **Done.** Clipboard: **OSC 52**, then `pbcopy` / `wl-copy`, then write a file and print the path |

## CLI face — `9.x`

*Phase 0 for `9.1`–`9.2`, thin. `9.3`–`9.4` in phase 2, when agents start using it for real.
`9.8` tracks every phase. The rest grows as the phases do — see Agent integration above.*

| ID | Item |
| --- | --- |
| 9.1 | **Decided, done.** the command list — read `zk` and `nb` first |
| 9.2 | **Done.** `--json` output separate from human output; stable exit codes; versioning |
| 9.3 | **Done.** **No-TTY behaviour** — never start a TUI when stdout is a pipe |
| 9.4 | **Done.** Cross-process semantics — **decided**: disk is the contract. See Agent integration |
| 9.9 | **Done.** Advisory staleness file — TUI writes dirty paths plus its pid; CLI surfaces them |
| 9.10 | **Done.** `--if-unchanged` for writers that must not clobber |
| 9.5 | **Done.** Graph queries: links, backlinks, `tags`; orphans in `slipbox problems` (and the Problems panel) |
| 9.6 | **Done.** `capture` subcommand |
| 9.7 | **Done.** Context bundle: `slipbox context <note>`, `space s c` — the note, its links and backlinks |
| 9.8 | **Done.** The agent-facing skill that teaches the CLI |

## Export — `10.x`

*Phase 6+.*

| ID | Item |
| --- | --- |
| 10.1 | **Prototype.** Assembler: embeds drawn in, links inside the document or their text, pictures as on screen |
| 10.2 | **Prototype.** HTML writer: one file, its pictures inside it; print-friendly |
| 10.3 | **Prototype.** Markdown writer: portable — GitHub's heading ids, pictures copied beside it |
| 10.4 | **Prototype.** DOCX writer, by `docx` (MIT): `slipbox export`, `space n o` |
| 10.5 | **Prototype.** PDF writer, by `pdfkit` (MIT; decided 2026-10-09): the machine's fonts, embedded |
| 10.6 | **Prototype.** EPUB packaging over 10.2, zipped by `fflate` (MIT) |
| 10.7 | **Dropped** (2026-10-09). A headless-browser tier: an external tool |
| 10.8 | **Dropped** (2026-10-09). A pandoc tier: an external tool |
| 10.9 | **Prototype.** Compose: notes picked in order, one document — `space n shift+o`; the CLI takes several |
| 10.10 | **Prototype.** A picture a format doesn't hold made PNG first: BMP, GIF, WebP (libwebp as wasm) |
| 10.11 | **Prototype.** PDF lines laid out by slipbox: a picture in a sentence, maths on the baseline, code tinted |
| 10.12 | **Prototype.** Emoji in a PDF in black and white, from a font that draws them so (Noto Emoji, Symbola…) |
| 10.13 | **Deferred** (2026-10-09). Colour emoji in a PDF: the colour emoji font's own pictures, in a line (`10.11`) |
| 10.14 | **Prototype.** Where an export goes, in a Save As window: places, the folder's folders and files, the name |

Decided 2026-10-09 with the user: no external tool — every format is TypeScript or JavaScript under a permissive
licence, and a format that would need a tool isn't offered. Word first, then the rest; an export goes beside its note
by default. Later the same day: what a format can't take made PNG first (`10.10`), the PDF's lines laid out by
slipbox (`10.11`), emoji in black and white for now (`10.12`), colour later (`10.13`). Design:
`docs/design/export.md`.

## LSP face — `11.x`

*Phase 5. Removed in phase 5b (`20.23`, 2026-10-02): with plain paths, editors' own servers follow the links, and
agents use the CLI. The rows below record what was built.*

| ID | Item |
| --- | --- |
| 11.1 | **Done.** `vscode-languageserver` and the protocol package under Bun and compiled, both ways (decisions) |
| 11.2 | **Done.** Server skeleton over stdio: `slipbox lsp`, a graph per vault (`.slipbox/` only), kept current |
| 11.3 | **Done.** `completion`, `definition`, `references`, `hover`: notes, aliases, `#heading`, `#^block`, embeds |
| 11.4 | **Done.** `rename` returning a `WorkspaceEdit` — the editor supplies the preview |
| 11.5 | **Done.** `publishDiagnostics`: broken and ambiguous links, conflicts; lint only with `[lsp] lint = true` |
| 11.6 | **Done.** `documentSymbol` and `workspace/symbol` |
| 11.7 | **Done.** Link ranges: where each link ends as well as where it starts, in the graph's records |
| 11.8 | **Done.** Unsaved text: an open document's text stands for its file's until it's closed |
| 11.9 | **Done.** Heading rename in the core: `[[note#Heading]]`, `note.md#heading` fixed everywhere; TUI, CLI too |
| 11.10 | **Done.** `willRenameFiles`: a note moved in the editor's file tree has its links fixed |
| 11.11 | **Done.** Code actions: make a missing note, pick an ambiguous link's target; the context bundle |
| 11.12 | **Done.** nvim's setup documented: slipbox where `.slipbox/` is, marksman elsewhere |

## Code intelligence — `19.x`

*Phase 5. Decided 2026-10-01 (Decisions, above): slipbox is an LSP client for the languages it opens; servers and
linters found, the npm ones installed privately; settings in the formats other tools read; diagnostics from every
source shown alike in every mode.*

| ID | Item |
| --- | --- |
| 19.1 | **Done.** Client: spawn, initialize, document sync, shutdown, restart after a crash; one per server and root |
| 19.2 | **Done.** Languages and servers: Helix's `[language-server.x]` and `[[language]]`; defaults per language |
| 19.3 | **Done.** Roots per language, from markers (`package.json`, `Cargo.toml`, `go.mod`, `pyproject.toml`…) |
| 19.4 | **Done.** Finding: the user's config, the project (`node_modules/.bin`, `.venv/bin`…), `PATH`, Mason |
| 19.5 | **Done.** Private installs: npm packages with Bun into slipbox's folder, pinned, scripts off; `auto_install` |
| 19.6 | **Decided:** trusted everywhere — servers and linters run the project's code (revised by `23.1`) |
| 19.7 | **Done.** `slipbox doctor`: per language, each server and linter — found where, installable, or how to get it |
| 19.8 | **Done.** Diagnostics: one list per file from every source — syntax, lint, links; servers to come |
| 19.9 | **Done.** The bar: a column beside the text, each line's worst sign in its colour, the count past one |
| 19.10 | **Done.** Ranges marked at a level (errors by default): in source mode, the lens and the rendered view |
| 19.11 | **Done.** Toggles (`space u d`, `shift+d`) and `[diagnostics]`; the status line takes every source |
| 19.12 | **Done.** Hover in a float; signature help as `(` and `,` are typed (`19.16`) |
| 19.13 | **Done.** Definition, type definition, implementations, references: a jump, or a list when there are several |
| 19.14 | **Done.** The server's symbols where tree-sitter has none; the switcher's `#` the workspace's symbols |
| 19.15 | **Done.** Rename, code actions, formatting: through `App.writeBuffer`, previewed like slipbox's renames |
| 19.16 | **Done.** Completion in insert mode: on a trigger at once, on a word after a pause; narrowed as typed |
| 19.17 | **Done.** Several servers per file: a main one and add-ons, merged; Helix's `only-features` splits the work |
| 19.18 | **Done.** Linters with an LSP mode as add-ons, where the project has their config; the project's copy first |
| 19.19 | **Done.** Linters without LSP in efm-langserver's keys (`lint-command`, `lint-formats`); hadolint, yamllint |
| 19.20 | **Done.** Server settings from a project's `.vscode/settings.json`, over the config's, as VS Code does |
| 19.21 | **Done.** markdownlint-cli2 found as a server is, else from the private install, rather than `npx` |
| 19.22 | **Done.** CLI: `slipbox diagnostics <file>` — servers' and linters' findings, `--json`, for agents, scripts |
| 19.23 | **Done** (2026-10-07). Live: rust-analyzer, gopls, clangd, sourcekit-lsp, ruby-lsp, taplo, hadolint… |

## Plain paths, virtual vaults — `20.x` (phase 5b)

*The design, and why, is `docs/idea.md`, "Plain paths, virtual vaults" (decided 2026-10-02, revised after a review).
In order: link semantics, the migration and identity first; the index and what it shows second; repairs, the CLI and
the merge review after; the removals as their replacements land, the sweep last.*

*Revised by `21.x`: `21.12` removed `20.4`, `20.5`'s instances, `20.6`, `20.12`, `20.13` and `20.20`'s `vault:path`;
`20.14` and `20.15` show roots (`21.9`); `20.2`'s `/` starts from the nearest root first (`21.2`); `20.3`'s markers
widened by `21.1`; `20.2`'s `[[…]]` as text and `20.22`'s removal of resolving by name revised by `21.3` (wikilinks
read within their root); `20.11`'s links resolved per root, not per instance (`21.8`, `21.12`). The rows record what
was built.*

| ID | Item |
| --- | --- |
| 20.1 | **Done.** The converter: `[[…]]` and `/…` links as relative paths, labels kept, fragments checked; previewed |
| 20.2 | **Done.** Links are paths: `[[…]]` is text; `/` the filesystem's root; a broken link stays so till fixed |
| 20.3 | **Done.** Vault boundaries: the nearest `.slipbox/` or git checkout; both in one folder, one; nested apart |
| 20.4 | **Done.** Collections apart from instances: local ids; remotes and first commits as evidence; plain folders |
| 20.5 | **Done.** Durable state: instances, their locations, confirmed moves; state by instance; today's moved once |
| 20.6 | **Done.** Names: short, unique here, `.` for a collision, a worktree's branch now (`@`); never in a file |
| 20.7 | **Done.** Settings: the nearest `.slipbox/config.toml`, then outer ones, then yours; programs yours only |
| 20.8 | **Done.** The index on demand: folders opened, links followed, CLI paths; ignored and hidden when reached |
| 20.9 | **Done.** The background auto-index of the home folder: low priority, paused while working, resumable |
| 20.10 | **Done.** Freshness: sizes and times checked, folders listed again; coverage; a CLI refresh; drives away |
| 20.11 | **Done.** The parse cache by content hash, parser version and format; links resolved per instance |
| 20.12 | **Done.** The `vault:path` form: link without text, hover, backlinks, previews; the original on `space u r` |
| 20.13 | **Done.** Completion offers `vault:path` and the full path, and writes the relative path |
| 20.14 | **Done.** The status line: the vault and its branch (`pathfinder · main`), a worktree `pathfinder@refactor` |
| 20.15 | **Done.** The explorer's roots: the vault opened, vaults followed into, pinned ones; never overlapping |
| 20.16 | **Done.** Search by vault: the current one, then linked ones, then everything on a key; `--scope` |
| 20.17 | **Done.** Repairs: changes made elsewhere fix the index; link fixes as plans; a moved vault's from the state |
| 20.18 | **Done.** Generated edits as plans: tied to file hashes, stale ones refused; the CLI plans, then applies |
| 20.19 | **Done.** Renames and moves on paths: the files linking in, and the moved file's own relative links |
| 20.20 | **Done.** The CLI: `vault:path` in and out (`href` to write); files as saved; diagnostics, search, fixes |
| 20.21 | **Done.** The merge review: links `git merge-tree`'s result breaks; after a merge, git's renames as evidence |
| 20.22 | **Done.** Removed: the home vault, `[[vault:note]]`, resolving by name, links through redirects (`20.3`) |
| 20.23 | **Done.** Removed: the LSP face (`slipbox lsp`, `src/lsp/`, `[lsp] lint`, the nvim setup); the client stays |

`20.1` comes before `20.2`: the converter needs today's resolution, which `20.2` and `20.22` remove from reading (the
converter keeps it, as a legacy reader of its own). `20.23` was done second: the LSP face read wikilinks throughout,
and removing it first spared rewriting its tests only to delete them. `20.17`–`20.19`
reuse today's rename and move engine (`7.1`–`7.3`, `17.12`, `17.15`) on paths; `17.12`'s redirects become evidence
for a repair. Performance (`20.11`) is measured, not assumed. Each item ends with its tests listed for the user's
approval before any is run.

## Paths inside, conventions at the edges — `21.x` (phase 5c)

*Proposed 2026-10-05 and reviewed with the user; approved, and built 2026-10-06 and 07. The design, and why, is
`docs/idea.md`, "Paths inside, conventions at the edges";
the decision record `docs/design/decisions.md`, `21.x`. In order: roots and the one model inside first; the
conventions read, then found, then written; names and pointers next; state, words and what's shown after; the
removals as their replacements land, the sweep last.*

| ID | Item |
| --- | --- |
| 21.1 | **Done.** Roots from markers: `.git`, `.slipbox/`, `.obsidian/`, `.zk/`; `root_markers`, yours; the nearest |
| 21.2 | **Done.** Links as paths inside: `/` from the nearest root, then the filesystem; extensionless; to a folder |
| 21.3 | **Done.** Wikilinks read within their root: names, paths, aliases, attachments; ties ambiguous; no root |
| 21.4 | **Done.** Conventions found: your setting, the root's tool's (Obsidian, zk), the notes' majority, ours |
| 21.5 | **Done.** Links written in the convention: completion, the picker, `slipbox link`; renames keep each form |
| 21.6 | **Done.** Named folders: by remote (short, qualified), by `.slipbox/` name and id; copies, defaults; lookup |
| 21.7 | **Done.** `slipbox://` pointers, `@branch` too: read, followed, backlinked, renamed; clashes asked; relinked |
| 21.8 | **Done.** Personal state by root, positions by file; carried with a named folder's move; today's moved once |
| 21.9 | **Done.** What's shown: the file's own forms; files by path in lists; the status line and explorer by roots |
| 21.10 | **Done.** Words: `folders [default]`, `name`, pointers as args; `root`/`name` in JSON; `--scope here` |
| 21.11 | **Done.** Repairs: the relink offered after moves made elsewhere; typed `research:x.md` flagged and fixed |
| 21.12 | **Done.** Gone: `vault:path`, `previous_names`, collections, instances, display names, `vault-moved`, vaults |
| 21.13 | **Done.** The sweep: the docs, the skill, the README, the e2e scenarios (run 2026-10-07; findings fixed) |

`21.1` comes first: `/`, wikilinks and conventions each read a root. `21.2`–`21.5` change no behaviour for relative
links, which stay as they are. `21.6` and `21.7` replace what vaults gave links between folders before `21.12` removes
it. Each item ends with its tests listed for the user's approval before any is run.

## Images — `12.x`

*Phase 6+.*

| ID | Item |
| --- | --- |
| 12.1 | **Done.** Capability probe — OpenTUI's, which asks the terminal; never `$TERM` |
| 12.2 | **Done.** `[render] images = auto \| never` |
| 12.3 | **Done.** Protocol emit through OpenTUI: Kitty graphics (herdr draws them too), sixel |
| 12.4 | **Dropped.** No half-block fallback: where a terminal draws no images, `▣ alt` and its link (decided) |
| 12.5 | **constraint** alt text plus path is the floor — a note never becomes unreadable |
| 12.6 | **Done.** Sizing from cell pixel geometry: the text width, proportions kept, at most 12 rows |
| 12.7 | **Done.** Sent once, drawn as Kitty's Unicode placeholders: text that scrolls; sixel waits on scroll |
| 12.8 | **Done.** Scroll behaviour — a picture cut where it scrolls out of sight |
| 12.9 | **Done.** Decode cache keyed by path and mtime |
| 12.10 | **Done.** Mermaid as Unicode drawing (`beautiful-mermaid`, no browser): flowchart, state, sequence, ER… |
| 12.11 | **Done.** Maths read, `$…$` (Obsidian's rule: no space inside, no digit after) and `$$`, as Unicode |
| 12.12 | **Done.** Images online: `ask` (the link; `enter` asks — once, or its site), `show`, `never` |
| 12.13 | **Done.** Obsidian's `![[picture.png]]`: found as its link is; `\|300`, `\|240x180` its size |
| 12.14 | **Done.** A picture in an embedded note: found from where that note is, drawn inside its frame |
| 12.15 | **Done.** SVG drawn: rasterised by resvg (WebAssembly) into the cache — `![x](d.svg)`, `12.16`, `12.17` |
| 12.16 | **Done.** Mermaid as a picture, by choice where images work (`12.10` the default), via `12.15` |
| 12.17 | **Done.** Display maths typeset by MathJax as a picture, by choice, via `12.15`; inline stays text |

Decided 2026-10-08 with the user: the terminal's own first — Unicode drawing and text, the default where images work
too — then pictures, by choice; every picture slipbox makes in the theme's colours. Maths is in. The order: `12.7`
checked, then `12.10`, `12.11`, `12.15`, `12.16`, `12.17`. A Mermaid kind `beautiful-mermaid` doesn't draw, or a
diagram that doesn't parse, stays its code block; a formula, its source. Passed over: `mermaid-cli` (a headless
Chromium per diagram), `mermaid-ascii` (labelled nodes broken, `docs/idea.md`).

## Extensibility — `13.x`

*Deferred, the whole of it (2026-10-09, with the user): for the future, not planned now.*

| ID | Item |
| --- | --- |
| 13.1 | **Deferred.** Tier 0: commands shelling out with context substitution |
| 13.2 | **constraint** arguments passed as argv, never interpolated into a shell string |
| 13.3 | **Deferred.** Sink: suspend and run in the foreground |
| 13.4 | **Deferred.** Sink: scratch or output buffer |
| 13.5 | **Deferred.** Sink: embedded terminal — optional, and never the path everything routes through |
| 13.6 | **Deferred.** Optional external-pane providers with a null backend, built and tested first |

## Distribution — `14.x`

*Not a phase. A cheap local invocation exists from phase 1 so agents can call it; real
packaging lands whenever it first needs to run on a VM.*

| ID | Item |
| --- | --- |
| 14.1 | `bun build --compile` per target, `--no-compile-autoload-bunfig --no-compile-autoload-dotenv` |
| 14.2 | Release assets: darwin-arm64, linux-arm64, linux-x64 |
| 14.3 | Homebrew formula |
| 14.4 | Update path |
| 14.5 | Alpine (musl): the SQLite loader picks the glibc build there; better-sqlite3 ships musl builds too |
| 14.6 | **decide** slipbox's licence — MIT, Apache-2.0, or both — then a `LICENSE` file and the notices it ships |

`14.6`, noted 2026-10-09: the user means to open-source slipbox and hopes for contributors; MIT, Apache-2.0 and dual
"MIT OR Apache-2.0" were weighed and the choice parked (`package.json` says MIT; there's no `LICENSE` file yet).
Whatever is picked, the compiled binary bundles libraries whose licences ask for something when it's distributed:

- **Weak copyleft**, accepted for use (decided 2026-10-09): `elkjs` (EPL-2.0, under beautiful-mermaid) and
  `@resvg/resvg-wasm` (MPL-2.0). Shipped, each needs its licence text and where its source is; a change to their own
  files would have to be shared. Neither reaches slipbox's own code.
- **unicodeit**'s symbol table is the LaTeX Project Public License's (LPPL), beside its MIT code.
- **Apache-2.0**, whose licence and NOTICE go along: `mathjax-full`, `typeahead`, `@swc/helpers` (under fontkit),
  `@jsquash/webp` and its `wasm-feature-detect`; the libwebp `@jsquash/webp` compiles (and the binary embeds) is
  BSD-3-Clause, its notice too.
- `jszip` is "MIT OR GPL-3.0-or-later": taken under MIT.
- **Hunspell** (`25.6`), which `hunspell-asm` (MIT) compiles and the binary embeds, is "MPL-1.1 OR GPL-2.0 OR
  LGPL-2.1": taken under MPL-1.1, weak copyleft as above (decided 2026-10-10). The dictionaries shipped are
  `dictionary-en` (MIT and BSD, from SCOWL) and `dictionary-tr` (MIT), each with its licence text.

The rest are permissive (MIT, ISC, BSD, BlueOak, Zlib); the grammars built into `grammars/` are MIT, their licences
in `grammars/licenses/`. A new dependency's licence, and its own dependencies', is checked before it's added.

## Performance — `15.x`

*Future optimization; not scheduled. Found in the phase 2 review (timings in
`docs/design/tui.md`, "Known limits"). Neither matters for ordinary notes.*

| ID | Item |
| --- | --- |
| 15.1 | **Done.** Incremental layout: parse by chunk, render by block, source mode by line; big notes on threads |
| 15.2 | **Done.** Pathological nesting, as a cap: nesting past 60 renders as text, quadratic parser inputs tamed |

`15.1`: edits, reloads and leaving the lens cost what they change (`docs/design/architecture.md`, "Big notes", with
timings from `scripts/bench.ts`); a big note's first open parses on other threads behind a one-line `reading…`
(380 ms at 20,000 lines, its first frame at once), and a width change re-wraps it in 70 ms, its ASCII by ranges. Laying
out only what's in view would take the rest; no ordinary note needs it. `15.2` is done as a cap
(`docs/design/rendering.md`, "Hostile notes").

## Files beyond markdown — `16.x` (phase 3b)

*The design, and why, is `docs/idea.md`, "Files beyond markdown". Three groups: notes (markdown:
the link graph), data files (JSON, YAML, TOML, INI, CSV: rendered, not notes), and text/source files
(source mode only). In order: the groundwork first, then each group.*

| ID | Item |
| --- | --- |
| 16.1 | **Done.** File groups: which extensions are notes, data, text; their config (other note formats off) |
| 16.2 | **Done.** A reader per format (blocks with lines, headings, links, tasks, a tree); markdown the first |
| 16.3 | **Done.** The walk and index see data and text files: link targets by path; the graph stays notes |
| 16.4 | **Done.** Any text file opens (source mode only for code); the CLI's writers take all groups; `ls --files` |
| 16.5 | **Done.** Explorer: notes and renderables, a key for all text files, patterns; `ctrl+p` and find follow |
| 16.6 | **Done.** Lazy loading: parsers and grammars loaded on first use |
| 16.7 | **Done.** Tree-sitter (TS, Python, shell, Lua, Go, Rust): multi-line strings and comments over highlight.js |
| 16.8 | **Done.** Code outline and breadcrumb: functions, classes, methods, from a query per language |
| 16.9 | **Done.** Syntax errors in code: gutter mark, underline, status count, out of insert; syntax only |
| 16.10 | **Done.** Links in code comments: paths that resolve, `path:line`, URLs; into the graph as backlinks |
| 16.11 | **Done.** Render TOML and INI: sections as headings, key–value rows, comments dimmed, records as tables |
| 16.12 | **Done.** Render YAML and JSON the same way: nested objects as headings to a depth, then rows |
| 16.13 | **Done.** Render CSV/TSV as a table: header detection, lazy layout past a size |
| 16.14 | **Done.** Data files' lens (blocks: sections, keys, rows); a parse error on leaving insert → source mode |
| 16.15 | **Done.** Links out of data files: paths that resolve, URLs, `$ref`, includes; into the graph |
| 16.16 | **Dropped** (built, then removed 2026-09-30). Org as a note format — see `docs/idea.md` |
| 16.17 | **Dropped** (built, then removed 2026-09-30). AsciiDoc as a note format — see `docs/idea.md` |
| 16.18 | **Done.** Swift: grammar, highlighting, outline (built from source into `grammars/`) |
| 16.19 | **Done.** HTML and CSS, SCSS with it: grammars, outlines (HTML's headings and ids, CSS's rules) |
| 16.20 | **Done.** PHP; its HTML highlighted as HTML |
| 16.21 | **Done.** Dockerfile: its stages in the outline |
| 16.22 | **Done.** Vue, Svelte, Astro (and a page's scripts and styles): each part in its own language |
| 16.23 | **Decided and done** (2026-10-07): Ruby and C/C++ have grammars, as the rest |

Later, on the same render: slipbox's own settings as a TOML screen with the config's schema
(defaults, allowed values, unknown keys). Diffs are a separate discussion.

## Vaults — `17.x` (phase 4)

*The design, and why, is `docs/idea.md`, "Vaults — decided 2026-09-30": a file's root is decided by
the file; derived data in the cache, personal data in the state, `.slipbox/` only for what is
shared; names that mean the same on every machine. In order: roots and storage, then names, then
links across vaults, then the TUI, then renames.*

*Revised by `20.x` and `21.x`: `17.2` and `17.8` removed in `20.22`; `17.4`'s `previous_names`, `17.6` and `17.7`'s
`previous_names` in `21.12`; `17.14` shows the named folders (`21.10`); `17.3`'s id keying replaced by state by root's
path (`21.8`); `17.12`'s redirect following removed in `20.22`; `17.18` revised by `20.3` and `21.1` (a git checkout,
`.obsidian/` or `.zk/` is a root by itself). The rows record what was built.*

| ID | Item |
| --- | --- |
| 17.1 | **Done.** Roots: the nearest `.slipbox/`, else the home vault; never `~` or `/` (revised by `17.18`) |
| 17.2 | **Done.** The home vault: `~/.local/share/slipbox/home/`, made on first use; loose files' links look beside |
| 17.3 | **Done.** Storage keyed by the vault's id; state kept by path before ids moved over once |
| 17.4 | **Done.** Vault identity in `.slipbox/config.toml`, `[vault]`: `id`, `name`, `aliases`, `previous_names` |
| 17.5 | **Done.** Distinct names suggested: a vault's (`x-plan` inside `x`; a known name refused), a new note's |
| 17.6 | **Done.** The machine's vaults, `vaults.json`: recorded on each open; `slipbox vaults` lists them |
| 17.7 | **Done.** Note `aliases` resolve like names; `previous_names` (vault and note) as a checked fallback, said so |
| 17.8 | **Done.** Interwiki links `[[vault:name]]`, `#heading`, `\|text`; "unknown vault", where it was last seen |
| 17.9 | **Done.** Path links across roots: `[t](../other/x.md)` reaches the file in whichever root holds it |
| 17.10 | **Done.** Following a link into another vault switches the TUI to it; back returns; its index refreshed |
| 17.11 | **Done.** Backlinks across vaults, from each vault's index as of its last indexing |
| 17.12 | **Done.** Moves detected by content hash; redirects kept in the state; a link to the old path follows them |
| 17.13 | **Done.** Explorer: vault folders with their own icon, the vault's name dimmed beside |
| 17.14 | **Done.** The launcher: `~`, or a loose folder opened without a file, shows the known vaults and the folder |
| 17.15 | **Done.** Renames across vaults (with `7.1`–`7.3`): links fixed in every reachable vault after a preview |
| 17.16 | **Done.** Path links as other tools write them: `../` out of the root, `~/`, absolute, `file://`; wiki too |
| 17.17 | **Done.** Nested vaults known to each other unopened; paths into them; the demo vault holds two, to test |
| 17.18 | **Done.** Every vault has `.slipbox/` with id and name; a git repository is offered, not assumed |
| 17.19 | **Done.** Git worktrees: separate vaults of one repository, told apart from `.git`; the branch shown |
| 17.20 | **Superseded** by `20.x` (2026-10-02, the same day, before it was built) |
| 17.21 | **Superseded** by `20.x` (2026-10-02, the same day, before it was built) |
| 17.22 | **Superseded** by `20.x` (2026-10-02, the same day, before it was built) |
| 17.23 | **Superseded** by `20.x` (2026-10-02, the same day, before it was built) |
| 17.24 | **Superseded** by `20.x` (2026-10-02, the same day, before it was built) |

`17.20`–`17.24` (decided 2026-10-02 morning, decisions.md `17.20`) made a folder enough: a scope without a marker,
identity optional. Superseded the same day by `20.x`, which goes further — links are paths and vaults derived.

`17.18` revised `17.1` (2026-09-30): a git repository without `.slipbox/` was a root of its own;
then every vault had a `.slipbox/` — one model, no fallbacks — and a repository was offered: made a
vault (committed, or private through `.git/info/exclude`) or not now, remembered. A `.slipbox/`
without an identity got one when first opened. Revised again by `20.3` and `21.1`: a git checkout,
`.obsidian/` or `.zk/` is a root by itself, and nothing is written into a root by opening it.

`17.16` is for compatibility: links written by other editors and agents name files by their paths,
not by vault names, and every form of it reaches the file, counts as a backlink, and survives a
rename in its own form.

`17.15` is where `7.1`–`7.3` land: a note's rename rewrites links as byte-range edits, previews every
file it touches (7.2), and warns when a vault's git tree already has changes (7.3); the old name went to
`previous_names` until `21.12`. `7.4` (undo) is done since: `space v shift+u`, `slipbox undo`.

## Explorer: making and changing files — `18.x` (phase 4)

*Decided 2026-09-30 with the user: buttons as well as keys, file operations with the rename's link fixing, a trash
rather than an unlink, nvim-tree's keys where they fit. The design is `docs/design/tui.md`, "Files in the explorer".*

| ID | Item |
| --- | --- |
| 18.1 | **Done.** Buttons: a new note and folder on the explorer's title; rename, move, delete on the selected row |
| 18.2 | **Done.** Keys: `n` / `N` new note, folder (`space n n` too); `r` rename, `m` move, `d` delete, `u` restore |
| 18.3 | **Done.** Folders renamed and moved like notes: every link to anything in them fixed, after a preview |
| 18.4 | **Done.** Delete to the vault's trash (in its state), links that break said; restore; `:trash` |
| 18.5 | **Done.** Copy, cut and paste (`y`, `x`, `p`): a copy (`name-copy`), or a move with links fixed |
| 18.6 | **Done.** CLI: `slipbox cp`, `rm`, `trash [restore]`; `mv` takes a folder |
| 18.7 | **Done.** A nested vault's row: its folder renamed, moved, deleted; a fourth button renames the vault |
| 18.8 | **Done.** The move picker is a tree: the explorer's folds, `←` / `→` fold, typing filters under the parents |
| 18.9 | **Done.** The selected row's buttons become one, `…` (and `.`): a menu of its actions, each with its key |
| 18.10 | **Done.** Questions float in a window: the answer typed, OK / Cancel; a yes-or-no's Yes / No (`y`, `n`) |
| 18.11 | **Done.** `v` makes a folder a vault, `shift+v` a nested vault a plain folder; `init <folder>`, `deinit` |
| 18.12 | **Done.** A plan's writes into another vault's files reach its index at once (a second rename finds them) |
| 18.13 | **Done.** Leader keys for every file action: `space n` notes, `space d` folders, `space v` vaults |

## Notes over time and by their shape — `22.x`

*Later; from the design's list of what was deferred (`docs/idea.md`), given IDs 2026-10-07.*

| ID | Item |
| --- | --- |
| 22.1 | A note's history: its commits (`git log --follow`), an older version opened to read, the diff to it |
| 22.2 | Frontmatter checked against a folder's rules (required keys, their types): findings in Problems |
| 22.3 | Document types by their conventions (ADRs, plans, skills): listed and moved between by type |

## Running nothing of a folder's own — `23.x`

*Decided 2026-10-07 with the user; revises `19.6`. The design, and why: `docs/design/decisions.md`, `23.x`.*

| ID | Item |
| --- | --- |
| 23.1 | **Decided.** A folder's own code never runs unless you trust its root: the TUI asks, or `[trust] roots` |
| 23.2 | **Done.** Programs only from your config, `PATH`, your installs, slipbox's: never a folder's own |
| 23.3 | **Done.** A server's settings yours alone: no folder's `.slipbox/config.toml` or `.vscode/settings.json` |
| 23.4 | **Done.** Servers in safe modes (rust-analyzer, gopls, TS, pyright); ruby-lsp, sourcekit-lsp, lua… held back |
| 23.5 | **Done.** Linters whose config is code not run: ESLint, stylelint, markdownlint-cli2's `.cjs`/`customRules` |
| 23.6 | **Done.** git: no fsmonitor, hooks, filters or drivers (`--attr-source` from the empty tree), no textconv |
| 23.7 | **Done.** `[trust] roots` (paths, `~`, globs) in your config only, never a root's; the CLI never asks |
| 23.10 | **Done.** The TUI asks once per root when it matters; answers in `trust.json`; `:trust`, `:untrust` |
| 23.8 | **Done.** `slipbox doctor` and the TUI say a root isn't trusted, once, and what that limits |
| 23.9 | **Done** (2026-10-07). Bun reads no `bunfig.toml` or `.env` of the folder it starts in |

## Code as a notebook — `24.x`

*Decided 2026-10-07 with the user: code renders too — not to look like markdown, but to read like a document. The
design: `docs/design/code-view.md`.*

| ID | Item |
| --- | --- |
| 24.1 | **Decided.** Tokens verbatim, whitespace and decoration ours; shared categories mapped per language |
| 24.2 | **Done.** TS, TSX, JS: the document view by default (`[render] code`), `space n v` to source |
| 24.3 | **Done.** Definitions as titles: kind in the margin, name bold, keywords dim; a blank row before each |
| 24.4 | **Done.** Doc comments rendered as markdown; JSDoc's tags a definition list |
| 24.5 | **Done.** Imports folded into one row naming them; `enter` unfolds |
| 24.6 | **Done.** Long lines broken at their structure; the author's breaks kept, line numbers the file's |
| 24.7 | **Done.** Indent guides; braces and semicolons dimmed |
| 24.8 | **Done.** Folding any definition: `▾` / `▸`, `space k f`, `z a` (editing a row in place is `24.17`) |
| 24.9 | **Done.** The code view generic: each grammar's own queries, conventions as exceptions (below) |
| 24.10 | **Done.** The lens on code: a line, a doc comment, the imports as written, highlighted; `esc esc` back |
| 24.11 | **Done.** Comments as prose: markers gone; separators as sections; after code, notes in the margin |
| 24.12 | **Done.** Python: docstrings above their definitions; JSDoc, Google, NumPy, reST read into one shape |
| 24.13 | **Done.** A notebook: prose at full width, a cell per definition (boxes or bands), its header's buttons |
| 24.14 | **Done.** Cells touch; tree lines join a class to its members, two columns in; a comment a cell |
| 24.15 | **Done.** Boxes of a top and a left line, blank rows around them; the tree's lines; comments keep lines |
| 24.16 | **Done.** The lens on code opens on the cursor's cell whole when it fits, and moves cell to cell |
| 24.17 | **Dropped** (2026-10-09). Typing in a row in place: the lens is where notes and code are edited |
| 24.18 | **Dropped** (2026-10-08). Folding inside a cell — an `if`'s body, a loop's: a cell folds whole |
| 24.19 | **Done.** A definition's long signature: a parameter a row, `)` at its indent; not calls |
| 24.20 | **Deferred** (2026-10-09). Tabular code in columns: assignments, enum members, keys — columns inside rows |
| 24.21 | **Done.** A receiver dimmed with its `.` or `->` (`this.`, `self.`, `$this->`), not bare; with `24.9` |
| 24.22 | **Done.** A licence header, or a "generated" banner, folded into a row naming it, as the imports are |

`24.9`, decided 2026-10-09 with the user: tree-sitter already gives every grammar slipbox parses the queries its outline
and its comments' links use — definitions with their names and ranges, and comments. The code view is built on those
for the 13 grammars with definitions (TypeScript, TSX, JavaScript, Python, Go, Rust, Swift, PHP, Ruby, C, C++, Lua,
Bash); markup and config (HTML, Vue, Svelte, Astro, CSS, SCSS, Dockerfile) keep source mode. A definition's kind is
read from its node's type name; its documentation is the comment lines right above it, markers stripped; `@param`-style
tags are terms, any other doc is markdown prose; imports are a run of top-level nodes named so. What a language does
its own way is an exception (Python's docstrings), not a mapping. `24.11`–`24.16`'s TypeScript and Python become the
generic view and their exceptions, their tests the proof nothing was lost. It replaces "Rust, Go mapped". Every file
keeps its source mode, the document view or not: `space n v` switches, `[render] code = "source"` opens code in it. A
cell's header says what it is in its language's word, `struct: Frame`, `method: add` (the user's, 2026-10-09).

## Editing fundamentals — `25.x`

*Decided 2026-10-09 with the user: what a good editor does, short of an IDE, built in this order before git (`26.x`).
Not wanted: vim's marks, macros, named registers and block selection.*

| ID | Item |
| --- | --- |
| 25.1 | **Prototype.** Indentation per file — `.editorconfig`, else the file's own, else its language's |
| 25.2 | **Prototype.** Comments toggled: `gc` and a motion, `gcc`, a selection's lines, `ctrl+/`; each language's |
| 25.3 | **Prototype.** Brackets: `%` to the matching one (a motion too), both marked; pairs closed as typed, opt-in |
| 25.4 | **Prototype.** Replace across files in the TUI: previewed as a rename is, undoable; `replace --all` |
| 25.5 | **Prototype.** Word completion without a language server: the open files' words, `ctrl+n` / `ctrl+p` |
| 25.6 | **Prototype.** Spelling in notes: misspelt words marked, their suggestions, a word added to your own list |
| 25.7 | **Prototype.** A command run: `:!cmd`, its output in a window; lines filtered through one (`:'<,'>!sort`) |
| 25.8 | **Prototype.** A server's snippets: their tab stops and placeholders filled in turn, `tab` to the next |

`25.1` covers saving as `.editorconfig` says too: trailing whitespace trimmed, the final newline added, only where it
asks. `25.7` is the part of `13.1` that runs what you type yourself; the rest of `13.x` stays deferred. `25.8`:
completion with a language server is `19.16`'s, done; it asks for no snippets (`snippetSupport: false`), so a function
comes without its arguments' places to fill — added 2026-10-09 at the user's asking.

`25.6`, decided 2026-10-10 with the user: English and Turkish come with slipbox, and any other language is the user's own
Hunspell dictionary (`[spell] dictionaries`, else the system's). Hunspell runs as WebAssembly (`hunspell-asm`): it
opens Turkish in 270 ms and about 20 MB, where nspell (pure JavaScript) took 950 ms and 250 MB for the same answers.
Spelling is off by default (`space u s`); a note's front matter `lang:` names its languages.

## Git in the editor — `26.x`

*Decided 2026-10-09 with the user, built after `25.x`. Today's git support reads, at the branch's level (`5.11`–`5.14`,
`20.21`); this is the working tree's. It runs the system's `git`, as now, with `23.6`'s guards where a root isn't
trusted. It's the TUI's alone, no CLI equivalents: an agent has `git` itself.*

| ID | Item |
| --- | --- |
| 26.1 | **Prototype.** Changed lines in the gutter against what's staged, unsaved text too; `]c` `[c`; preview, undo |
| 26.2 | A source control view by the explorer: staged, unstaged, untracked, conflicted; stage, unstage, discard |
| 26.3 | Commit: its message in a floating editor; amend. In a root not trusted its hooks don't run, and it says so |
| 26.4 | Blame: who changed the cursor's line, when, the commit's message; a file's history with `22.1` |
| 26.5 | Branches: switched to or made from a picker, unsaved notes saved or kept first |
| 26.6 | Later, opt-in: stash; fetch, pull, push — asked for, never automatic; a conflict view: ours, theirs, both |

`26.2` stages, unstages or discards a file or one change, and opens its diff; discarding asks first.

## Deferred — in the design, not in this breakdown

Sorted 2026-10-07. Mermaid and LaTeX are `12.10`–`12.11` and `12.15`–`12.17`; composing notes, `10.9`; a note's history,
frontmatter rules and document types, `22.x`; the live checks with native servers, `19.23`. Diffs and git awareness are
built (`space g d`, `space g c`, the explorer's marks, worktrees, merge review); the working tree's git is `26.x`. Tier
2 plugins are dropped: `13.x`'s commands cover what they would, and a shared plugin ecosystem is a supply-chain
question. Anything else under the design's community-plugin tier gets an ID when it is scheduled.

## Constraints and gotchas

- **The assembler appears three times** — export, the context bundle, and composing notes.
  Build `10.1` once and three features get cheaper. It argues for early work despite export
  being late.
- **Autosave and the conflict prompt are dead code without the in-app editor.** `4.7`,
  `5.5`, `5.6` and `5.7` have nothing to do until `4.3` exists.
- **Constraints are not tasks.** `2.9`, `7.5`, `12.5` and `13.2` must live inside the items
  they constrain, or they arrive later as an audit.
- **`0.10` has a second half** that is easy to miss: what the per-vault hash actually hashes.
  An absolute path means state does not travel between the Mac and the VMs, and every git
  worktree of one repo keys separately — which may be right for the graph and wrong for
  reading position.
- **`1.9` is load-bearing earlier than it looks.** If agents call the CLI routinely from phase
  2, every invocation rebuilding the graph is waste, so cache persistence stops being a
  "later, if it grows" item.
- **`0.11` and `5.2` are the same decision seen twice.** What the walk excludes is what the
  watcher does not subscribe to; deciding them apart guarantees they disagree.

Open decisions live in **Decisions**, above — this list is only for traps that survive after
the decisions are made.
