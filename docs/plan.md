# slipbox — implementation plan

Status: **phases 0–4 built** — 3b (`16.x`, files beyond markdown) and 4 (vaults, renames, search, git, embeds)
included; **phase 5 (`11.x`, `19.x`: language servers, both ways) has begun**. Scout (`6.10`) waits for Scout.
Captured 2026-09-25, phased 2026-09-25, phases 0–2 implemented 2026-09-25, phase 3 2026-09-28, phases 3b and 4 by
2026-10-01 — how it was built is in `docs/design/`, the decisions it needed in `docs/design/decisions.md`.

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
| **6+** | Export, images, extensibility | `10.x`, `12.x`, `13.x` | — |

`14.x` distribution is not a phase. It lands whenever the thing first needs to run on a VM,
probably during phase 2.

### Why this order

**Phase 3b comes before the vault (decided 2026-09-29).** Viewing and editing come first: the
review work slipbox serves — reading what agents produced, configs and code as much as notes — needs
every text file to open well before the vault grows broader concepts.

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
5. **slipbox serves markdown to editors** (`11.x`): `slipbox lsp`, in vaults only (`.slipbox/`), marksman staying
   for markdown elsewhere. A thin layer on the core, with `vscode-languageserver` for the protocol; the TUI keeps
   calling the core directly. Renames are edits the editor applies (they skip slipbox's undo log), and lint
   findings stay off over the LSP, since the editor runs its own linter.
6. **New languages** (`16.18`–`16.23`): Swift, HTML and CSS, PHP, Dockerfile, the web frameworks (Vue, Svelte,
   Astro); Ruby and C/C++ to decide.

**Order:** `11.1` (the protocol library, for both directions), then the markdown server (`11.x`), then the
diagnostics display on today's findings (`19.8`–`19.11`), then the client and finding servers (`19.1`–`19.7`),
reading features, editing features, linters, and the languages.

### Still open, and each gates work

| ID | Decision | Gates |
| --- | --- | --- |
| `19.6` | Trust: servers and linters run the project's code (build scripts, eslint configs, its binaries) | `19.4` |
| `16.23` | Ruby and C/C++ | Phase 5 |
| `10.5` | PDF base — `pdfkit` or `@react-pdf/renderer` | Phase 6+ |

## Step 0 — codebase

*Phase 0.*

Everything here is cheap now and expensive later. That is the only thing they have in
common, and the only reason they are step 0.

| ID | Item | Why it cannot wait |
| --- | --- | --- |
| 0.1 | Repo, licence, README, `bun init`, strict TS | — |
| 0.2 | Module layout `core/` `tui/` `cli/` `lsp/` | The three-faces split |
| 0.3 | **CI check: `core/` must not import `tui/`** | OpenTUI is Bun-only FFI; a breach kills CLI and LSP silently |
| 0.4 | Test runner + snapshot harness | Snapshotting the pure layout stage *is* the strategy |
| 0.5 | **Fixture vault** — wikilinks, collisions, wide tables, CJK, frontmatter, CRLF | Everything tests against it |
| 0.6 | Pin OpenTUI exactly, write the upgrade policy | Pre-1.0, 169 commits per 90 days |
| 0.7 | **One width function**; nothing else measures text | Display width governs every wrap and cursor position |
| 0.8 | **Command registry** — every action named | Palette, keymaps, modal layer and plugins all consume it |
| 0.9 | Config loader — TOML, user plus vault marker, vault wins | Almost everything reads config |
| 0.10 | **decide** storage: config vs cache vs **state** | Paths bake in; moving them needs a migration |
| 0.11 | **decide** the walk: extensions, ignores, symlinks, caps | Changes the graph, perf, indexing and watching |
| 0.12 | Version stamp in the vault marker dir | Nothing to migrate *from* without it |

## Core: vault and graph — `1.x`

*Phase 1 for `1.1`–`1.3`; phase 2 for link-follow from `1.4`, `1.5`, `1.8`–`1.10`; the rest phase 4.*

| ID | Item |
| --- | --- |
| 1.1 | Vault root discovery: marker dir, precedence, `--root`, single-file mode |
| 1.2 | File walk implementing 0.11 |
| 1.3 | Parse pipeline: remark + gfm + frontmatter + wiki-link |
| 1.4 | **decide** link resolution, then build it: `nameToPath` as lists, collisions, case policy |
| 1.5 | Backlinks map |
| 1.6 | **Done.** Tags map: frontmatter `tags` and `#tags` in the text, nested, one tag whatever its case |
| 1.7 | **Done.** Unresolved-link set (and ambiguous links): the Problems view (`space v p`), `slipbox problems` |
| 1.8 | Incremental single-file graph update |
| 1.9 | Index persistence: when, and to the cache location from 0.10 |
| 1.10 | `slipbox init` and the no-marker path — announce the degradation, offer to create |
| 1.11 | **Done.** Embeds drawn in place: `![[note]]`, `#Heading`, `#^block`; read-only, loops and depth capped |

## Rendering — `2.x`

*Phase 1.*

| ID | Item |
| --- | --- |
| 2.1 | **mdast to layout IR — pure, framework-agnostic** |
| 2.2 | Blocks and inlines: headings, lists, code, quotes, emphasis |
| 2.3 | **Table allocator**, including the aggregate-minimum overflow bug |
| 2.4 | Wrapping over 0.7 |
| 2.5 | Code-fence syntax highlighting |
| 2.6 | Theme tokens, built-ins, base16 loader |
| 2.7 | Readability defaults: render-width inset, inline-code background, bold fg, border contrast |
| 2.8 | Glyph capability: Nerd Font detection and an ASCII fallback set |
| 2.9 | **constraint** strip terminal escapes from text on the way into layout |

## TUI — `3.x`

*Phase 2.*

| ID | Item |
| --- | --- |
| 3.1 | Renderer bootstrap, sidebar / content / status layout |
| 3.2 | Scroll with viewport-only rendering |
| 3.3 | Buffers, tabs, one split |
| 3.4 | Reading position per note |
| 3.5 | **decide** reload anchoring — line number, heading, node id or content hash |
| 3.6 | Back/forward history stack |
| 3.7 | File explorer |
| 3.8 | Quick switcher |
| 3.9 | Outline |
| 3.10 | Command palette over 0.8 |
| 3.11 | **decide** mode taxonomy and dispatch order, plus the key collisions |
| 3.12 | Default keymap |
| 3.13 | **Message sink** — one place for errors, warnings and script stderr |
| 3.14 | Narrow-terminal collapse |
| 3.15 | Session restore |
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
| 4.1 | `$EDITOR` hand-off using OpenTUI `suspend()` / `resume()` |
| 4.2 | `editor.command` template with `{file}` and `{line}` — there is no portable line-number flag |
| 4.3 | In-app editor — built as `NoteBuffer` with `editing.ts` and `vim.ts`, not on `Textarea` |
| 4.4 | Modal layer — state machine over the named actions from 0.8 |
| 4.5 | Undo/redo wiring, surviving external reload |
| 4.6 | Atomic save, temp plus rename |
| 4.7 | Autosave, long idle delay |
| 4.8 | Dirty-state indicators |
| 4.9 | Incremental reparse |
| 4.10 | Flush dirty buffers at handoff points — capture, context bundle, invoking an agent |
| 4.11 | Checkbox toggle — a key and a click on `[ ]`; the first write |
| 4.12 | Remote hand-off — open the note in an editor already running (nvim `--server`), no wait |
| 4.13 | Source mode — the raw markdown as a layout, so the reading keys work unchanged |
| 4.14 | Live preview — the block under the cursor as its source, edited in place (the lens) |
| 4.15 | The lens scrolls inside a block taller than its maximum, with "↑ N lines" on its rules |
| 4.16 | Find and replace — a replace row under find (`ctrl+h`); vim's `:s` with `g` `i` `c`; `cgn` and `.` |

## Concurrency — `5.x`

*Phase 2 for `5.1`–`5.4`; phase 3 for `5.5`–`5.10`.*

| ID | Item |
| --- | --- |
| 5.1 | Watcher, debounce, ignore own writes |
| 5.2 | Watch-registration failure path — inotify limits on the Linux VMs; degrade loudly |
| 5.3 | Silent reload when clean |
| 5.4 | Surface an external change the moment it lands |
| 5.5 | Vim-shaped conflict prompt — `(L)oad` `(K)eep` `(D)iff` `(M)erge` |
| 5.6 | Autosave aborts on mtime change |
| 5.7 | Post-`(K)eep` state: autosave off until an explicit, confirmed save |
| 5.8 | Incremental graph update from watch events |
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
| 6.10 | Scout, an outside engine: behind the same API, told of changes by the feed (`slipbox changes`) |

## Write safety — `7.x`

*Phase 3, except `7.1` which needs the graph and lands in phase 4.*

| ID | Item |
| --- | --- |
| 7.1 | **Done** (`17.15`). Rename with link fixing, as byte-range edits from mdast positions |
| 7.2 | **Done** (`17.15`). **Multi-file preview** of the transaction |
| 7.3 | **Done** (`17.15`). Confirm, and warn when the tree is already dirty |
| 7.4 | **Done.** Undo a rename: `space v shift+u`, `slipbox undo` — the files as they were, what moved back |
| 7.5 | **constraint** never write outside the vault root — decide what a symlink out means |
| 7.6 | **decide** frontmatter is spliced by byte range, never parsed and re-serialised |

## Scratch capture — `8.x`

*Phase 2.*

| ID | Item |
| --- | --- |
| 8.1 | The capture path is `slipbox capture`, called from nvim — see Decisions |
| 8.2 | Storage location per 0.10 |
| 8.3 | Accumulator: `path:line` refs and excerpts |
| 8.4 | Markdown format carrying source refs |
| 8.5 | Clipboard: **OSC 52**, then `pbcopy` / `wl-copy`, then write a file and print the path |

## CLI face — `9.x`

*Phase 0 for `9.1`–`9.2`, thin. `9.3`–`9.4` in phase 2, when agents start using it for real.
`9.8` tracks every phase. The rest grows as the phases do — see Agent integration above.*

| ID | Item |
| --- | --- |
| 9.1 | **decide** the command list — read `zk` and `nb` first |
| 9.2 | `--json` output separate from human output; stable exit codes; versioning |
| 9.3 | **No-TTY behaviour** — never start a TUI when stdout is a pipe |
| 9.4 | Cross-process semantics — **decided**: disk is the contract. See Agent integration |
| 9.9 | Advisory staleness file — TUI writes dirty paths plus its pid; CLI surfaces them |
| 9.10 | `--if-unchanged` for writers that must not clobber |
| 9.5 | **Done.** Graph queries: links, backlinks, `tags`; orphans in `slipbox problems` (and the Problems view) |
| 9.6 | `capture` subcommand |
| 9.7 | **Done.** Context bundle: `slipbox context <note>`, `space s c` — the note, its links and backlinks |
| 9.8 | The agent-facing skill that teaches the CLI |

## Export — `10.x`

*Phase 6+.*

| ID | Item |
| --- | --- |
| 10.1 | **Assembler**: resolve embeds, rewrite wikilinks by export-set membership, absolutise assets, map frontmatter |
| 10.2 | HTML writer |
| 10.3 | Markdown writer |
| 10.4 | DOCX writer |
| 10.5 | **decide** `pdfkit` or `@react-pdf/renderer`, then build the PDF writer |
| 10.6 | EPUB packaging over 10.2 |
| 10.7 | Optional headless-browser tier |
| 10.8 | Optional pandoc tier |

## LSP face — `11.x`

*Phase 5.*

| ID | Item |
| --- | --- |
| 11.1 | **Done.** `vscode-languageserver` and the protocol package under Bun and compiled, both ways (decisions) |
| 11.2 | **Done.** Server skeleton over stdio: `slipbox lsp`, a graph per vault (`.slipbox/` only), kept current |
| 11.3 | **Done.** `completion`, `definition`, `references`, `hover`: notes, aliases, `#heading`, `#^block`, embeds |
| 11.4 | `rename` returning a `WorkspaceEdit` — the editor supplies the preview |
| 11.5 | **Done.** `publishDiagnostics`: broken and ambiguous links, conflicts; lint only with `[lsp] lint = true` |
| 11.6 | **Done.** `documentSymbol` and `workspace/symbol` |
| 11.7 | **Done.** Link ranges: where each link ends as well as where it starts, in the graph's records |
| 11.8 | **Done.** Unsaved text: an open document's text stands for its file's until it's closed |
| 11.9 | Heading rename in the core: `[[note#Heading]]` and `note.md#heading` fixed everywhere; TUI and CLI too |
| 11.10 | `willRenameFiles`: a note moved in the editor's file tree has its links fixed |
| 11.11 | Code actions: make a missing note, pick an ambiguous link's target; the context bundle as a command |
| 11.12 | nvim's setup documented: slipbox where `.slipbox/` is, marksman elsewhere |

## Code intelligence — `19.x`

*Phase 5. Decided 2026-10-01 (Decisions, above): slipbox is an LSP client for the languages it opens; servers and
linters found, the npm ones installed privately; settings in the formats other tools read; diagnostics from every
source shown alike in every mode.*

| ID | Item |
| --- | --- |
| 19.1 | Client core: spawn, initialize, document sync, shutdown, restart after a crash; one per root and language |
| 19.2 | Languages and servers: Helix's `[language-server.x]` and `[[language]]`; defaults per language |
| 19.3 | Roots per language, from markers (`package.json`, `Cargo.toml`, `go.mod`, `pyproject.toml`…) |
| 19.4 | Finding: the user's config, the project (`node_modules/.bin`, `.venv/bin`, `vendor/bin`), `PATH`, Mason |
| 19.5 | Private installs: npm packages with Bun into slipbox's data folder, pinned, scripts off; `[lsp] auto_install` |
| 19.6 | **decide** trust: servers and linters run the project's code — where, and asked how often |
| 19.7 | `slipbox doctor`: per language, each server and linter — found where, installed, or missing and how to get it |
| 19.8 | Diagnostics: one store per file from every source — syntax, lint, servers, linters — by severity |
| 19.9 | The bar: a column beside the text, each line's count coloured by its worst severity, in every mode |
| 19.10 | Ranges marked: underlined or highlighted in source mode, the lens and the rendered view |
| 19.11 | Toggles (`space u`) and `[diagnostics]`; the status line and Problems take every source |
| 19.12 | Hover and signature help in a float |
| 19.13 | Definition, references, implementation, type definition: a jump, or a list when there are several |
| 19.14 | Document and workspace symbols: the outline and the switcher take the server's when there is one |
| 19.15 | Rename, code actions, formatting: through `App.writeBuffer`, previewed like slipbox's renames |
| 19.16 | Completion in insert mode |
| 19.17 | Several servers per file: a main one and add-ons, merged; Helix's `only-features` to split the work |
| 19.18 | Linters with an LSP mode as add-ons, where the project has their config; the project's copy first |
| 19.19 | The lint surface widened: linters without LSP in efm-langserver's keys (`lint-command`, `lint-formats`) |
| 19.20 | Server settings from a project's `.vscode/settings.json`: `workspace/configuration` as VS Code answers |
| 19.21 | markdownlint-cli2 from the private install rather than `npx` |
| 19.22 | CLI: `slipbox diagnostics <file>` — the servers' and linters' findings, `--json`, for agents and scripts |

## Images — `12.x`

*Phase 6+.*

| ID | Item |
| --- | --- |
| 12.1 | Capability probe — query the channel, never sniff `$TERM` |
| 12.2 | `images = auto \| always \| never` override |
| 12.3 | Protocol emit: kitty, iTerm2, sixel |
| 12.4 | Unicode half-block fallback |
| 12.5 | **constraint** alt text plus path is the floor — a note never becomes unreadable |
| 12.6 | Sizing from cell pixel geometry |
| 12.7 | Transmit once, place by id |
| 12.8 | Scroll behaviour — unicode placeholders |
| 12.9 | Decode cache keyed by path, size and mtime |

## Extensibility — `13.x`

*Phase 6+.*

| ID | Item |
| --- | --- |
| 13.1 | Tier 0: commands shelling out with context substitution |
| 13.2 | **constraint** arguments passed as argv, never interpolated into a shell string |
| 13.3 | Sink: suspend and run in the foreground |
| 13.4 | Sink: scratch or output buffer |
| 13.5 | Sink: embedded terminal — optional, and never the path everything routes through |
| 13.6 | Optional external-pane providers with a null backend, built and tested first |

## Distribution — `14.x`

*Not a phase. A cheap local invocation exists from phase 1 so agents can call it; real
packaging lands whenever it first needs to run on a VM.*

| ID | Item |
| --- | --- |
| 14.1 | `bun build --compile` per target |
| 14.2 | Release assets: darwin-arm64, linux-arm64, linux-x64 |
| 14.3 | Homebrew formula |
| 14.4 | Update path |

## Performance — `15.x`

*Future optimization; not scheduled. Found in the phase 2 review (timings in
`docs/design/tui.md`, "Known limits"). Neither matters for ordinary notes.*

| ID | Item |
| --- | --- |
| 15.1 | **Done.** Incremental layout: parse by chunk, render by block, source mode by line; big notes on threads |
| 15.2 | Pathological nesting — **done** as a cap: nesting past 60 renders as text, quadratic parser inputs tamed |

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
| 16.18 | Swift: grammar, highlighting, outline (phase 5, as are the rest) |
| 16.19 | HTML and CSS, SCSS with it: grammars, outlines (HTML's headings and ids, CSS's rules) |
| 16.20 | PHP |
| 16.21 | Dockerfile |
| 16.22 | Vue, Svelte, Astro: a file's template, script and style, each in its own language |
| 16.23 | **decide** Ruby and C/C++ |

Later, on the same render: slipbox's own settings as a TOML screen with the config's schema
(defaults, allowed values, unknown keys). Diffs are a separate discussion.

## Vaults — `17.x` (phase 4)

*The design, and why, is `docs/idea.md`, "Vaults — decided 2026-09-30": a file's root is decided by
the file; derived data in the cache, personal data in the state, `.slipbox/` only for what is
shared; names that mean the same on every machine. In order: roots and storage, then names, then
links across vaults, then the TUI, then renames.*

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

`17.18` revised `17.1` (2026-09-30): a git repository without `.slipbox/` was a root of its own;
now every vault has a `.slipbox/` — one model, no fallbacks — and a repository is offered: made a
vault (committed, or private through `.git/info/exclude`) or not now, remembered. A `.slipbox/`
without an identity gets one when first opened.

`17.16` is for compatibility: links written by other editors and agents name files by their paths,
not by vault names, and every form of it reaches the file, counts as a backlink, and survives a
rename in its own form.

`17.15` is where `7.1`–`7.3` land: a note's rename rewrites links as byte-range edits, previews every
file it touches (7.2), and warns when a vault's git tree already has changes (7.3); the old name goes
to `previous_names`. `7.4` (undo) stays open.

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

## Deferred — in the design, not in this breakdown

Mermaid and LaTeX, git awareness (beyond `5.9`, `5.10`, `17.19`), Tier 2 plugins, diffs,
document-type awareness, frontmatter validation, composing notes
into one document, and everything under the design's community-plugin tier. They get IDs
when they get scheduled.

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
