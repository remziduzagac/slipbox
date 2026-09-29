# slipbox — implementation plan

Status: **phases 0–3 built**; **phase 3b (`16.x`, files beyond markdown) is next**, then 4. Phase 3
left open `4.9` (moved to `15.1`), `5.9`, the lint surface, and `7.2`–`7.4` (which wait for renames,
`7.1`). Captured 2026-09-25, phased 2026-09-25, phases 0–2 implemented 2026-09-25, phase 3
2026-09-28 — how it was built is in `docs/design/`, the decisions it needed in
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
| **4** | Vault and structure | rest of `1.x`, all `6.x`, `7.1`, embeds/aliases | Backlinks and search on a real vault |
| **5** | LSP | all of `11.x` | nvim gets slipbox's graph |
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

### Still open, and each gates work

| ID | Decision | Gates |
| --- | --- | --- |
| `6.1` | Search — own, `qmd`, or an optional `zk` tier | Phase 4 |
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
| 1.6 | Tags map |
| 1.7 | Unresolved-link set |
| 1.8 | Incremental single-file graph update |
| 1.9 | Index persistence: when, and to the cache location from 0.10 |
| 1.10 | `slipbox init` and the no-marker path — announce the degradation, offer to create |

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
| 5.9 | `HEAD`-change detection as a distinct event class — a branch switch is a mass reload |
| 5.10 | Suppress autosave during an index lock, so a half-written note misses an agent's commit |

## Search — `6.x`

*Phase 4.*

| ID | Item |
| --- | --- |
| 6.1 | **decide** own implementation, `qmd`, or an optional `zk` tier — it must live in the core |
| 6.2 | Literal search |
| 6.3 | Regex search |
| 6.4 | Scoping by tag and folder |
| 6.5 | Results list and navigation |

## Write safety — `7.x`

*Phase 3, except `7.1` which needs the graph and lands in phase 4.*

| ID | Item |
| --- | --- |
| 7.1 | Rename with link fixing, as byte-range edits from mdast positions |
| 7.2 | **Multi-file preview** of the transaction |
| 7.3 | Confirm, and warn when the tree is already dirty |
| 7.4 | Undo a rename |
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
| 9.5 | Graph queries: links and backlinks built; orphans and tags wait for `1.6`/`1.7` (phase 4) |
| 9.6 | `capture` subcommand |
| 9.7 | **Context-bundle assembler** — shared with 10.1 |
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
| 11.1 | Verify `vscode-languageserver` runs under Bun without OpenTUI |
| 11.2 | Server skeleton over stdio |
| 11.3 | `completion`, `definition`, `references`, `hover` |
| 11.4 | `rename` returning a `WorkspaceEdit` — the editor supplies the preview |
| 11.5 | `publishDiagnostics` for unresolved links |
| 11.6 | `documentSymbol` and `workspace/symbol` |

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
| 15.1 | Incremental layout — **mostly done**: parse by chunk, render by block, source mode by line |
| 15.2 | Pathological nesting — **done** as a cap: nesting past 60 renders as text, quadratic parser inputs tamed |

`15.1`: edits, reloads and leaving the lens now cost what they change (`docs/design/architecture.md`,
"Big notes", with timings from `scripts/bench.ts`). Left: a width change still re-wraps the whole
note (180 ms at 20,000 lines), and the first open parses and renders all of it (810 ms). `15.2` is
done as a cap (`docs/design/rendering.md`, "Hostile notes").

## Files beyond markdown — `16.x` (phase 3b)

*The design, and why, is `docs/idea.md`, "Files beyond markdown". Three groups: notes (markdown,
Org, AsciiDoc: the link graph), data files (JSON, YAML, TOML, INI, CSV: rendered, not notes), and
text/source files (source mode only). In order: the groundwork first, then each group.*

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
| 16.16 | Org as a note format (`uniorg`): render, headings, links, `TODO`/`DONE` tasks, tags |
| 16.17 | AsciiDoc as a note format: a line scanner to index; asciidoctor.js loaded lazily to render |

Later, on the same render: slipbox's own settings as a TOML screen with the config's schema
(defaults, allowed values, unknown keys). Diffs are a separate discussion.

## Deferred — in the design, not in this breakdown

Mermaid and LaTeX, git awareness, worktree handling, Tier 2 plugins, diffs,
document-type awareness, frontmatter validation, running the repo's linter, composing notes
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
