# Decisions: foundations

What slipbox is, what it is built on and how it is shaped, the principles and phases of the work, and the surface
agents use.

## D1: A terminal notes app: Obsidian's model without the GUI (2026-09-24)

> **Superseded by D33 (2026-10-02):** slipbox is a shared workspace for humans and agents over plain files, not
> Obsidian without the GUI.

**Decision:** slipbox is a terminal markdown notes app, starting from Obsidian's model without the GUI. It was named and
scoped on 2026-09-24, in an exploration that began as "find a nicer way to read markdown than nvim".

**Why:** markdown notes are central to working with AI agents; Obsidian needs a GUI, and most of its features aren't
wanted; nvim's markdown rendering is what prompted looking elsewhere (D2).

## D2: nvim's rendering is ruled out (2026-09-24)

**Decision:** nvim's rendering is the dissatisfaction slipbox answers, so every "just use nvim plus render-markdown"
answer is ruled out, even though nvim has every other feature on the list.

**Why:** it is where the project started (D1), and it was re-proposed three times while the idea took shape; held as a
constraint, it is not re-litigated. The nvim ecosystem confirms the gap: `obsidian.nvim` has links, backlinks and tags
but leaves rendering to `render-markdown.nvim`, and stops where slipbox begins (research/prior-art.md).

**Not chosen:** nvim plus render-markdown (ideas.md § Product).

## D3: slipbox is standalone (2026-09-24)

**Decision:** slipbox is used inside herdr but never requires herdr, tmux, zellij or any multiplexer. A bare terminal
over SSH is a first-class environment. Anything a multiplexer would provide (a second pane, detach, scrollback) slipbox
either provides itself or degrades to a lesser path that still works; multiplexer integration is detected and
optional, never assumed. An external binary can be an optional enhancement, never a requirement.

**Why:** you work on the machine that holds the repository, reached over SSH, where nothing beyond the terminal can be
assumed. herdr is our deployment context and a precedent worth copying, not a dependency. The rule shapes later
choices: the notes layer in process (D10), the clipboard over OSC 52 (D21), the built-in output sinks (D23).

## D4: Build rather than fork leaf (2026-09-25)

**Decision:** slipbox is built, not forked from leaf (`RivoLink/leaf`, Rust, MIT), which stays the quality bar for
rendering.

**Why:** leaf is a binary-only crate, so it can be forked but not wrapped, and its churn is in exactly the files a fork
would modify. It has no agent concepts and no notes or link layer, so most of the code would be new regardless: a fork
keeps the renderer and rewrites everything else. The features leaf would likely decline are the agent-workflow ones,
and the ones it would accept are the reading ones: the sign of a different product. Evidence: research/prior-art.md.

**Not chosen:** forking leaf (ideas.md § Product).

## D5: Bun and TypeScript, not Rust on basalt's crates (2026-09-25)

**Decision:** slipbox is TypeScript on Bun, compiled by `bun build --compile` into one binary. basalt is prior art: its
UX and its limitations are studied, and none of its code is reused.

**Why:** basalt's published, permissively licensed crates reopened the stack question, since "there is no wrappable
option" was only ever true of leaf. Staying won on two counts. `basalt-core` is thin in the easy places (reading vaults
and notes, writing to a note path) and supplies no table allocator, link graph, search or export, while switching would
forfeit the libraries doing the heavy lifting (remark and mdast positions, `docx`, `pdfkit`, `rehype`, `unicodeit`)
and OpenTUI's `Image`, `Diff` and `Textarea`. And `basalt-core` is an Obsidian interop layer, coupled to `.obsidian/`
discovery, which slipbox does differently. basalt, in Rust on ratatui, still cannot render bold, italic, strikethrough
or images: Rust does not make the rendering problem easier. Bun was installed on the Mac; cargo was not. Evidence:
research/prior-art.md, research/stack.md.

**Cost:** a binary of tens of MB with an embedded runtime, where Rust would give a small one.

**Not chosen:** Rust on `basalt-core` and `basalt-widgets`; contributing to basalt instead, whose scope is
Obsidian-vault compatibility, not agent workflows (ideas.md § Stack).

## D6: OpenTUI over Ink, pinned exactly (0.6, 2026-09-25)

**Decision:** the TUI is built on OpenTUI, pinned to an exact version with a written upgrade policy (`0.6`). Only the
final draw step touches it: mdast to layout stays pure and framework-agnostic. The detail is in design/how-it-works.md
§ Only the final draw step touches OpenTUI and § OpenTUI upgrade policy.

**Why:** Ink is safer on every conventional measure but the wrong shape: it renders React to a string, then diffs and
reprints, with no scroll container, so a viewport over a long document means virtualised scrolling on a string differ.
OpenTUI has a cell-level renderer with frame buffers, `ScrollBox`, `TextTable`, images and a time-to-first-draw
diagnostic: document-viewer shaped. It comes from the opencode authors and is built for AI tooling. Evidence:
research/stack.md.

**Cost:** pre-1.0 API churn, 169 commits per 90 days, so upgrades are not free. The pin and the pure layout keep the
surface to port thin: `Renderable`, `Box`, `Text`, scroll, input.

**Not chosen:** Ink (ideas.md § Stack).

## D7: remark, not OpenTUI's Markdown component (2026-09-25)

**Decision:** markdown is parsed by remark and its plugins into mdast and laid out by slipbox's own code, not by
OpenTUI's `Markdown` component. The layout is in design/rendering.md.

**Why:** source positions. slipbox edits, so it constantly needs the bytes behind a rendered node, and the reverse when
an agent rewrites a range; remark gives every node a position, while OpenTUI's component uses marked, which keeps only
raw text, and remark's plugins do not apply to it. marked wins only on speed and size, irrelevant when rendering one
document at a time. Positions also make a rename with link fixing a set of precise byte-range edits rather than a
re-serialisation. Evidence: research/stack.md.

**Not chosen:** OpenTUI's `Markdown` component on marked, with its `renderNode` hook (ideas.md § Stack).

## D8: One core and its faces; the core imports nothing from the TUI (0.2, 0.3, 2026-09-25)

> **Amended by D67 (2026-10-02):** the LSP face is removed; two faces remain, the TUI and the CLI.

**Decision:** slipbox is one core in pure TypeScript (vault, graph, search, assembler, writers, table layout) with faces
on it: the TUI, the CLI for agents and scripts, and an LSP for editors (D9). The code is laid out to match (`0.2`).
The core imports nothing from the TUI or OpenTUI, and a check fails the build when it does (`0.3`). slipbox stays
independent of zk but takes its boundary. The detail is in design/how-it-works.md § One core, two faces and § The
boundary is enforced, not hoped for.

**Why:** zk's lesson is its shape, not its features: an engine with a CLI and an LSP, and no TUI at all, which is why it
composes with everything. The boundary is mechanical, not stylistic: OpenTUI brings native FFI and a runtime floor, and
a face that needs no terminal must not inherit them. It makes the core snapshot-testable (`0.4`), and it is the
discipline that already insulates layout from OpenTUI (D6). The first reason given, that OpenTUI is Bun-only, proved
wrong (research/stack.md); the check stands, since a CLI or a language server that boots a terminal renderer is broken
whichever runtime loads it, and a breach would break the CLI silently. The CLI is a face on the core, like the TUI, not
a bolt-on.

**Not chosen:** zk as the engine, shelling out for the graph, backlinks, search and tags: it is an external Go binary,
so by D3 the native layer is written anyway (ideas.md § Architecture).

## D9: An LSP face, once the core is stable (11.x, 2026-09-25)

> **Superseded by D67 (2026-10-02):** the LSP face is removed: with plain paths, editors' own markdown servers
> follow links, and agents have the CLI.
>
> **Detailed by D161 (2026-10-01):** built in phase 5 as `slipbox lsp`, in vaults only, a
> thin layer on the core.
>
> **Verified (2026-10-01):** `vscode-languageserver` runs under Bun as under Node, and in the compiled binary
> (D170).

**Decision:** slipbox may offer LSP itself: `slipbox lsp`, a subcommand of the same binary speaking LSP over stdio from
the same in-memory graph, as `zk lsp` does. Not in v1: after the core is stable.

**Why:** most of the notes features map onto standard LSP methods (completion on `[[`, definition, references as
backlinks, rename, unresolved links as diagnostics, symbols, hover, code actions), so one implementation serves the
TUI, the CLI and every editor. It repairs the hand-off's weakness: nvim keeps slipbox's intelligence, so handing off to
`$EDITOR` costs the rendering only, and the face has value before the TUI is good. Offering the protocol is the
opposite direction from consuming a server, which D10 rejects. It waits because an LSP is another frozen public
contract, like the CLI and plugins.

**Verify:** `vscode-languageserver` runs cleanly under Bun, without OpenTUI.

## D10: The notes layer in process, not a language server (2026-09-25)

> **Amended by D17 (2026-09-25):** the link index is persisted in the cache (`1.9`), so a CLI call reads it rather
> than rebuilding the graph.

**Decision:** links, backlinks, completion, unresolved links and tags are slipbox's own, computed in process over
remark's parse, not taken from a PKM language server such as `markdown-oxide` or from a library. The modules are in
design/how-it-works.md § Module map.

**Why:** one distributable: `bun build --compile` gives a single executable, and a separate Rust server beside it
undoes that. The graph lives in slipbox's own memory, so any surface agents get answers from a map lookup, not two hops
through a server. LSP is shaped for editors' requests, not a TUI's own needs. No library was worth depending on
(`obsidian-utils` had 618 downloads a week, `obsidian-vault-parser` 8). It stays small because remark does the hard
part: one pass builds the name map and the backlinks, and following, completion and unresolved links are lookups;
roughly 300 to 600 lines, and the whole graph rebuilt in about 25 ms on this repository's markdown, so no persisted
index was needed at that scale. How names resolve (collisions, case, Obsidian's conventions) is D41.

**Cost:** none of `markdown-oxide`'s polish (heading-level links, block references, aliases), left as refinements for
later.

**Not chosen:** `markdown-oxide`; `obsidian-utils` or `obsidian-vault-parser` (ideas.md § Architecture).

## D11: Every user action is a named command (0.8, 2026-09-25)

**Decision:** every user-facing action goes through one named command registry from the first commit, even with no
plugins and no palette (`src/core/commands.ts`). Each command is declared in `src/core/command-specs.ts` with the CLI
invocation that reaches the same state change, or marked as an interaction; tests fail when a command is implemented
without a spec or specified without an implementation. The detail is in design/tui.md § Parity with the CLI and
docs/manual/keys.md.

**Why:** the palette, the keymaps, the modal editing layer and any future plugin tier all consume the registry, so each
is an addition rather than a refactor. It costs almost nothing up front, and retrofitting it means touching every
action. Configuration reached the same rule from the other side, since keymaps must be rebindable (D12): the same
decision seen from two directions. A command's CLI field is how parity (D14) is checked.

## D12: Configuration in TOML, the user's then the vault's (0.9, 2026-09-25)

> **Amended by D62 (2026-10-02):** deeper over broader: the nearest `.slipbox/config.toml`, then outer ones, then
> the user's; a key naming a program to run comes from the user's only.

**Decision:** configuration is TOML at two levels: the user's in `~/.config/slipbox/` and the vault's in `.slipbox/`,
the vault's overriding the user's. A `--config` flag and a `SLIPBOX_CONFIG` variable name the user's file, and slipbox
runs correctly with no config at all. Keymaps are rebindable, every action being a named command (D11). The keys are
in docs/manual/configuration.md.

**Why:** theming and user scripts both need configuration, so it was load-bearing from the start. Without a user level,
every vault needs its own copy of your keymaps. TOML matches herdr, helix, starship and yazi in this stack and takes
comments, and zk's `.zk/config.toml` reached the same choice independently (research/prior-art.md). JSON has no
comments; a TypeScript config is executable, a much bigger commitment and a startup cost.

**Not chosen:** JSON; a TypeScript config (ideas.md § Configuration).

## D13: The agent surface is a CLI; a server is deferred, not rejected (2026-09-25)

**Decision:** agents drive slipbox through a CLI they call, in the style of an Obsidian CLI. A server like nvim's, which
agents connect to, is deferred, not rejected. Plugins per coding agent are a complement, not a rival: one skill teaches
the CLI (D22). The surface evolves with development rather than being designed once.

**Why:** a CLI assumes nothing about the environment (no server to keep alive, no multiplexer, no per-agent plugin) and
works from phase 1. Agents are already fluent in shell, as the herdr and nvim-remote skills show by shelling out, so
one surface serves Claude Code, Codex, Gemini and scripts alike. Obsidian's own answer is the same:
`kepano/obsidian-skills`, by its CEO, is a CLI plus a skill that teaches agents to drive it (research/prior-art.md).
The server keeps a concrete trigger: a CLI call is a second process with a second graph, so it cannot see an unsaved
buffer or raise the TUI's conflict prompt, and a socket to the running instance is what solves that (D17 says when).

**Cost:** the CLI is a public API: it freezes a contract as firmly as a plugin API, only failing more politely, so it
gets a JSON mode, stable exit codes, versioning and a small first surface (D18).

**Not chosen:** a server like nvim's, for now; plugins per coding agent as the mechanism (ideas.md § Agent surface).

## D14: The CLI reaches every state change, not every interaction (2026-09-25)

> **Amended by D156 (2026-10-09):** git in the editor is the TUI's alone, with no CLI equivalents: an agent has
> `git` itself.

**Decision:** everything the UI can do, the CLI can do, stated precisely: the CLI must reach every state change, not
every interaction. Interactions (scrolling, the cursor, modes, the conflict prompt) need a human at a terminal and are
the TUI's only: one stated class of exceptions instead of an argument case by case. The detail is in design/tui.md
§ Parity with the CLI.

**Why:** forcing every action to be reachable from the CLI forces it into the core (D8); without the rule the boundary
decays into "core is whatever the TUI happened not to need". It is also the delivery mechanism: an agent reaches only
what the CLI exposes, so every gap in parity is a gap in what slipbox exists for, which makes the rule structural
rather than something to relax under a deadline. It paid for itself at once: `slipbox render` to stdout is how the
renderer is snapshot-tested.

## D15: The CLI churns, except a small stable subset (2026-09-25)

> **Detailed by GR-D16 (2026-10-12):** what is kept, what each part of a version may change before 1.0 and after,
> and how something is retired are the versioning policy, docs/manual/versions.md, its promises kept as written.

**Decision:** the CLI may change at each phase boundary, with pre-1.0 breakage declared up front, except a small subset
that is stable and versioned from phase 1: `render`, `capture` and a couple of graph queries. The stable commands now
are in docs/manual/cli.md § What stays stable.

**Why:** redesign is normal while nothing depends on the surface, and cheaper than guessing it up front; but agents
depend on it from phases 1 and 2 (D16), and the stable commands are what an agent or an nvim keybinding calls, so
breaking them breaks a workflow.

## D16: Agents drive slipbox from phases 1 and 2 (2026-09-25)

**Decision:** the agent surface is incremental, not a later phase: the CLI is the agent mechanism from the start and
grows with each phase, and slipbox is usable by an agent from phases 1 and 2. Early distribution is deliberately cheap,
a `bunx`-style invocation or a manual local install (docs/manual/cli.md § For agents and scripts); proper packaging
(`14.x`) comes later.

**Why:** the intended daily mode is the UI and an agent together, not the UI first with agents bolted on afterwards; a
notes app whose agent story arrives in phase 6 never gets tested the way it is meant to be used. Early on, what matters
is that an agent can invoke it, not that it is packaged well.

## D17: Disk is the contract (9.4, 9.9, 9.10, 2026-09-25)

**Decision:** a CLI call sees the filesystem and nothing else; "saved" is the commit point. The CLI reads files, and the
persisted cache when it is fresh, never an unsaved buffer; it writes atomically and returns, and the TUI treats that as
any external write. Conflicts are raised by the TUI, never by the CLI, so an agent is never blocked by an open editor.
Two supports keep this honest: user-initiated hand-offs (capture, a context bundle, invoking an agent from slipbox)
flush unsaved buffers first; and the TUI keeps a small file in the state directory, never in the vault, listing the
paths it holds unsaved, stamped with its pid, which the CLI reports as a warning or a `stale` array (`9.9`): advisory
only, never a lock. Concurrent CLI writes are last-writer-wins, safe because atomic, and `--if-unchanged` serves
careful writers (`9.10`). The link index is persisted (`1.9`), so a call reads it rather than rebuilding the graph.
The detail is in docs/manual/cli.md § Unsaved changes in a running slipbox.

**Why:** writes were already covered (atomic writes, the watcher, the conflict prompt), and two graphs cannot diverge
over one disk; reads were the gap. An agent acting on a half-written unsaved sentence is worse than one acting on the
last saved version: unsaved means not yet real. Git works the same way: tools see the working tree, not the editor's
undo buffer. So staleness stops being a bug and becomes a definition.

**Not chosen:** lock files; shadow copies of unsaved buffers, the worst, since an agent would edit against text you
might then discard; the CLI raising the TUI's prompt; the CLI refusing to write a file that is open and unsaved
(ideas.md § Agent surface).

**Verify:** the advisory warning stays rare in daily use; if it fires often enough to be noise, the socket of D13
comes forward.

## D18: The CLI command list: small, read against zk and nb (9.1, 9.2, 9.3, 2026-09-25)

> **Detailed by GR-D10, GR-D15 (2026-10-12):** the commands now include `skill`, the skill built into the binary,
> and `channel`, the releases an install follows, beside `upgrade` and `uninstall` (D199, `14.8`); docs/manual/cli.md
> lists them all.

**Decision:** the first command list is small on purpose, read against zk's and nb's. Stable from v1: `render`,
`capture`, `scratch`, `resolve`, `links`, `backlinks`; free to churn: `ls`, `outline`, `find`, `replace`, `task`,
`read`, `write`, `send`, `history`, `init`, `info`, `themes`, `commands`. Global flags: `--root`, `--config`, `--json`,
`--color`. `--json` always prints one object (`schema`, `ok`, `command`, `data`, `warnings`, `stale`), apart from the
human output; human output goes to stdout and diagnostics to stderr. Exit codes are stable: `0` ok, `1` error, `2`
usage, `3` not found, `4` ambiguous, `5` refused. `slipbox [path]` never starts the TUI when stdin or stdout is not a
terminal (`9.3`). The commands as they are now, the JSON contract and the exit codes are in docs/manual/cli.md.

**Why:** the CLI is a public API (D13), so it gets a JSON mode apart from human output, stable exit codes, explicit
versioning and a deliberately small first surface. zk is automation-first and its CLI the design reference; nb's very
large surface is a second one (research/prior-art.md). The stable commands are those an agent or an nvim keybinding
calls (D15).

## D19: The capture path is `slipbox capture` (8.1, 9.6, 2026-09-25)

**Decision:** capture is the CLI's `slipbox capture`: an nvim keybinding, an agent or a shell calls it, and the user
reads the scratch in the TUI. The capture direction belongs in the CLI, not the TUI. The detail is in docs/manual/cli.md
§ Capture and the scratch.

**Why:** phase 2's finish line is the scratch replacing `prompt-buffer.lua`, which captures from the code buffer being
edited in nvim, where a notes app has no entry point. Since editors and agents drive the CLI from phases 1 and 2
(D16), an nvim keybinding calls `slipbox capture` instead of writing to a local scratch, and the loop closes without
slipbox ever needing to browse code. Capture is CLI-shaped, so it is the first real exercise of parity (D14).

**Not chosen:** rewriting phase 2's done-test; an nvim-side sender keeping its own scratch (ideas.md § Capture).

## D20: The scratch: per project, in state, markdown with its references (8.2–8.4, 2026-09-25)

**Decision:** the scratch is per project and lives in the state directory (D39) by default, in the vault on
request (`capture.location = "vault"`). It is markdown, readable and pasteable as it is, and each entry carries its
source reference (`path:42-50`, as `prompt-buffer.lua` writes them). It and the context bundle share one writer
(D32). The detail is in docs/manual/cli.md § The scratch and the context bundle.

**Why:** scratch capture, the accumulator of `prompt-buffer.lua` (references and excerpts collected per project, then
handed to an agent), is the closest thing to the product's reason for existing and the feature with no competitor. A
scratch inside the vault, a git repository, needs a `.gitignore` line and gets committed by accident; outside it, an
agent working in the repository cannot see it, so the vault stays an option. Markdown, not a custom format. The scratch
is hand-picked and the bundle derived from the graph: the same thing at two scales, so one writer and two collectors.

**Not chosen:** a custom format; the cache directory, which holds only what can be rebuilt (ideas.md § Capture).

## D21: The clipboard: OSC 52, then a local tool, then a file (8.5, 2026-09-25)

**Decision:** copying (the scratch, a context bundle) sets the clipboard by OSC 52 first, then by a local tool
(`pbcopy`, `wl-copy`), then writes a file and prints its path. The tools are listed in design/how-it-works.md § Module
map (`core/clipboard.ts`).

**Why:** handing text to an agent usually means the clipboard, and a bare SSH session is first-class (D3), where
`pbcopy` is not available. OSC 52 sets the local clipboard from a remote session: slipbox running on a VM, the
clipboard on the Mac.

**Cost:** multiplexers may need OSC 52 enabled (tmux's `set-clipboard on`, a different switch from the
`allow-passthrough` that graphics need), and some terminals cap the payload, so a large bundle may need the file.

## D22: A skill teaches the CLI, kept with every phase (9.8, 2026-09-25)

> **Extended by ASI-D1–ASI-D3 (2026-10-26):** install and upgrade maintain the bundled skill in detected
> agent user configurations. Skip controls and ownership/link checks preserve user files; the npx package idea stays
> open.

> **Detailed by GR-D10 (2026-10-12):** the skill is built into the binary: `slipbox skill` prints it and
> `--install <dir>` writes it, so each release carries the skill that matches its commands.

**Decision:** an agent-facing skill teaches the CLI (`skills/slipbox/SKILL.md`), updated with each phase rather than
written at the end. How it is installed is in docs/manual/cli.md § For agents and scripts.

**Why:** a CLI plus a skill teaching agents to drive it is the `kepano/obsidian-skills` pattern (D13): the skill is
how the CLI gets discovered, not an alternative to it. A CLI with no skill means every agent rediscovers the surface by
trial and error, which is worse than a smaller surface that is documented.

## D23: Extensibility in three tiers; the built-in path stands alone (13.x, 2026-09-25)

> **Amended by D37 (2026-10-09):** the whole of `13.x` is deferred: for the future, not planned now.
>
> **Amended by D36 (2026-10-07):** Tier 2, in-process plugins, is dropped.

**Decision:** people extend slipbox with their own scripts in three tiers, cheapest first. Tier 0: a key or palette
entry bound to a shell command with context substituted (`{file}`, `{line}`, `{selection}`, `{vault}`, `{backlinks}`),
early, possibly in v1. Tier 1: the CLI, already an extension mechanism. Tier 2: TypeScript plugins loaded in process,
deferred until a real extension needs what the cheap tiers can't express; if ever, local only first, with no registry
and no auto-install. Output goes to built-in sinks that need nothing installed: suspend and run in the foreground (the
floor), a scratch or output buffer (the default), an optional embedded terminal. A multiplexer's "run it beside me" is
a detected bonus behind an external-pane provider whose null backend is built and tested first, and nothing essential
lives only behind a backend. Arguments go as argv, never a shell string (`13.2`, D159). The one thing done in v1
is the command registry (D11).

**Why:** the cheap tiers give most of the value. Tier 0 is about 50 lines, needs no API and freezes no internals, as
yazi's openers, lf's commands, `fzf --bind execute()` and vim's `!` show. Tier 1 costs nothing extra: the work that
serves agents serves users. Tier 2 freezes internals into a contract, pre-1.0 on a pre-1.0 OpenTUI, and punches
through the pure layout (D6); one bad plugin takes the TUI down unless every hook is wrapped; and a shared plugin
ecosystem is a supply-chain question. Bun imports TypeScript directly, so Tier 2 would be cheap when its time came: a
reason to keep the door open. By D3, "extend slipbox" cannot mean "have slipbox drive another tool".

## D24: Phases 0 to 6+, moved only deliberately (2026-09-25)

> **Amended by D37 (2026-10-09):** extensibility (`13.x`) left phase 6+, deferred.
>
> **Amended by D35 (2026-10-05):** phase 5c added, after 5b.
>
> **Amended by D34 (2026-10-02):** phase 5b added, before the rest of phase 5.
>
> **Amended by D31 (2026-09-29):** phase 3b added, before the vault.

**Decision:** the work is phased: 0 the codebase and a CLI skeleton, 1 rendering, 2 the app, 3 editing, 4 the vault and
structure, 5 LSP and code intelligence, 6+ export, images and extensibility. The plan's clusters of items are in
dependency order and the phases assign them; a cluster's number is not its phase. Distribution (`14.x`) is not a
phase: a cheap local invocation from phase 1, real packaging whenever slipbox first needs to run on a VM. The phases
were reasoned, not decreed: they move only deliberately, with the reason said. The phases, their items and their
finish lines are in roadmap.md.

**Why:** dependency order, each phase ending at a finish line that can be checked. Phase 0 holds only what is cheap now
and expensive later: storage paths bake in and need a migration to move, the palette, keymaps and modal layer all
consume the command registry, and every test uses the fixture vault. The reasons for the order are D25 to D30.

## D25: Phase 1 is rendering, because it de-risks the premise (2026-09-25)

**Decision:** phase 1 is rendering, to leaf's level (parse, layout, theme, `slipbox render`); it is done when slipbox
replaces leaf for reading `docs/`.

**Why:** if the rendering is not better than leaf's, nothing after it matters. It is also self-contained and needs no
graph, so it is a real milestone rather than scaffolding.

## D26: Phase 2 beats leaf, and pulls in the watcher and capture (2026-09-25)

**Decision:** phase 2 is "beat leaf": it fixes what leaf does badly and what already caused friction in daily use (one
file at a time, a history that stores only a path, no reading position, no mouse selection), and it ends when an agent
can drive it. Two things are pulled in early on purpose: the watcher and scratch capture. No-TTY behaviour (`9.3`) and
the cross-process semantics (`9.4`) land here too, where agents first depend on them.

**Why:** "beat leaf" is a sharper target than "add features". The watcher is cheap while nothing is edited, since a
read-only reload has no conflict cases, and it delivers "an agent rewrites a note while you watch", the product's core
premise, three phases early. Capture is CLI-shaped, so it is the first real exercise of parity (D14) rather than a
late bolt-on.

## D27: Link-following, backlinks and graph queries in phase 2 (1.5, 9.5, 2026-09-25)

**Decision:** following a `[[link]]` is split out of the graph and pulled into phase 2. Backlinks (`1.5`), the graph
queries (`9.5`) and the persisted index (`1.9`) come with phase 2's CLI; the TUI's backlinks panel, tags, lists of
unresolved links, aliases and heading references stay in phase 4 with the rest of the graph.

**Why:** following a link is navigation: left to phase 4, phase 2's navigation would be incomplete and phase 3 an
editor that cannot traverse its own vault. The stable CLI subset promises a couple of graph queries from phase 1
(D15), and the backlinks map falls out of the same parse as link-following. With agents calling the CLI routinely,
rebuilding the graph on every call would be waste (D17).

## D28: Phase 2 is read-only; the hand-off stays in phase 3 (4.1, 4.2, 2026-09-25)

**Decision:** phase 2's TUI never writes a note: it browses, renders, copies text, holds several notes and follows
external changes. The `$EDITOR` hand-off (`4.1`, `4.2`) stays in phase 3 with the rest of editing, though idea.md's v1
cut listed it. Phase 3's own order is D144.

**Why:** the hand-off belongs with the rest of editing, and a read-only phase 2 keeps the watcher free of conflict
cases (D26).

**Not chosen:** the hand-off in phase 2, as the v1 cut had it (ideas.md § Phasing).

## D29: The LSP face waits for the graph; phase 3 gets linting (2026-09-25)

> **Amended by D67 (2026-10-02):** the LSP face phase 5 built was removed in phase 5b.

**Decision:** the LSP face is phase 5, not phase 3. What phase 3 gets instead is linting, which needs no LSP: run
`markdownlint-cli2` and show what it finds (the lint surface, D160).

**Why:** the LSP's whole value is the graph (completion on `[[`, definition, references as backlinks, rename with link
fixing), and before phase 4 it has almost nothing to serve.

**Not chosen:** the LSP face in phase 3 (ideas.md § Phasing).

## D30: The phases are the schedule; v1 says what "usable" means (2026-09-25)

**Decision:** idea.md's proposed v1 (read and navigate, plus capture) maps to phases 1 and 2 plus the link-following
slice of phase 4; where the two differ, the phases are the schedule. The v1 cut stays the statement of what "usable"
means, and its done-tests are finish lines: slipbox replacing leaf for reading `docs/` ends phase 1, and the scratch
replacing `prompt-buffer.lua` ends phase 2.

**Why:** the v1 cut bundles wikilinks, search and one theme together, while the phases put search in phase 4 and keep
only link-following in phase 2. Both done-tests are measurable and are things already done daily, so the comparison is
honest. Finishing, not feasibility, is the risk, and a tool you can open tomorrow beats a design you can admire.

**Not chosen:** the v1 cut as the schedule (ideas.md § Phasing).

## D31: Phase 3b, files beyond markdown, before the vault (16.x, 2026-09-29)

**Decision:** phase 3b, files beyond markdown (`16.x`), comes before phase 4, the vault. What it opens, and how, is
D107.

**Why:** viewing and editing come first: the review work slipbox serves, reading what agents produced (configs and
code as much as notes), needs every text file to open well before the vault grows broader concepts.

## D32: The context bundle (9.7, 2026-10-01)

**Decision:** `slipbox context <note>` (`space s c` in the TUI) writes one markdown document for an agent: the notes
asked for, what they link to and what links to them, each as a reference followed by its text fenced as it is on disk,
by the scratch's writer (D20). Gathering is deterministic: breadth first, links in the order they are written,
backlinks by path. The limit is on files, not characters, and what is past it is named. It is read from disk: the TUI
saves unsaved notes first (D17). The detail is in docs/manual/cli.md § The scratch and the context bundle.

**Why:** the bundle is the scratch's other half, gathered from the link graph where the scratch is hand-picked, and
written the same way. It is not the export assembler (`10.1`): an agent reads `[[links]]` as they are, and the
bundle's references say where each file is; rewriting links or resolving embeds would only make the text differ from
the file the agent will edit. The same vault gives the same bundle. A limit on files keeps whole notes whole, and
naming what is left out tells the agent to ask.

**Not chosen:** the export assembler, which the plan had expected the bundle to share; a limit on characters (ideas.md
§ Context bundle).

## D33: A shared workspace for humans and agents over plain files (2026-10-02)

> **2026-10-25:** Clarified by WSP-D1: workspace also names the personal working state kept in a place; the user
> introduction no longer calls slipbox itself a workspace. The glossary distinguishes the two.

> **Clarified by D226 (2026-10-13):** slipbox is described as the terminal companion for coding agents; the shared
> workspace is how it is one.

**Decision:** slipbox is a shared workspace for humans and agents over plain files: a person in the TUI and an agent on
the CLI see the same files, the same links and the same answers, and a feature earns its place by how well it serves
that shared work. It is not a markdown previewer with extras, and not Obsidian without the GUI, as D1 had it.

**Why:** working with agents was the motivating problem from the start (D1), and the UI and an agent together is the
intended daily mode (D16); the reframing makes that shared work, not Obsidian's model, the measure of a feature. It
was made the same day as plain paths and virtual vaults (D56), whose principle is one answer everywhere: the TUI
and the CLI on the same index.

## D34: Phase 5b, plain paths, before the rest of phase 5 (20.x, 2026-10-02)

**Decision:** phase 5b, plain paths and virtual vaults (D56), comes before the rest of phase 5 (`16.18`–`16.23`).

**Why:** plain paths and virtual vaults change what a link is and what a vault is; the rest of phase 5 depends on
neither, so it waited. The LSP face phase 5 had built was removed in 5b (D67).

## D35: Phase 5c, after a review of 5b (21.x, 2026-10-05)

**Decision:** phase 5c, paths inside and conventions at the edges (D68), revises phase 5b and comes before the
rest of phase 5, which waited on it as it had on 5b.

**Why:** a review of 5b and a survey of other tools: 5c follows other tools' link conventions, makes `/` the nearest
root, points between named folders with `slipbox://` pointers, and leaves no vaults to meet. Like 5b, it changes what a
link is, and the rest of phase 5 depends on none of it.

## D36: In-process plugins dropped (13.x, 2026-10-07)

**Decision:** Tier 2 of extensibility, in-process plugins (D23), is dropped.

**Why:** the commands of `13.x` cover what plugins would, and a shared plugin ecosystem is a supply-chain question.

## D37: Extensibility deferred, the whole of it (13.x, 2026-10-09)

> **Amended by D155 (2026-10-10):** `:!cmd` is the part of `13.1` that runs what you type yourself; the rest of
> `13.x` stays deferred.

**Decision:** all of `13.x` is deferred, with the user: commands that shell out (`13.1`), the output sinks
(`13.3`–`13.5`) and the external-pane providers (`13.6`) are for the future, not planned now. `13.2`, arguments as
argv, stays a constraint on whatever is built. This amends D23 and D24.

**Why:** the user's call while sorting what was left once images (`12.x`) were done: for the future, not planned now.

## D226: slipbox described as the terminal companion for coding agents (2026-10-13)

> **Amended by SEO-D1 (2026-10-26):** the shared line leads with the person: read, review and edit what your
> coding agent writes, in your terminal. Site metadata, shared links and agent-readable docs use it (SEO-D2–SEO-D6).

**Decision:** Wherever slipbox describes itself, it is the terminal companion for coding agents: "Read, review and edit
what your agent writes, with Markdown and code rendered cleanly, an editor that's necessary and sufficient, and agent
integration built in." The README opens with that, then a paragraph for each claim: an idea followed from the plan to
the code, rendered, with themes, keys and settings your own; editing intuitive yet innovative, in the lens; the editor
necessary and sufficient, your own editor for more; usage discovered as you go (vim's keys or the usual ones, `space`,
`?`, `:` and the mouse); the command line and the skill, guarded writes, reloads and the conflict prompt; the scratch;
any folder, opened as it is. `package.json`, the documentation's index and the repository's description take the line
whole; the Homebrew formula and `slipbox help`, which have room for less, its first sentence. It clarifies D33, which
says how slipbox works with agents, a shared workspace over plain files; this says who it is for and what it gives them.
The editor's scope is unchanged (D134): small edits in slipbox, `$EDITOR` a key away, and not an IDE (requirements.md §
Non-goals).

**Why:** The user's call, 2026-10-13: slipbox is more than a Markdown reader. "A terminal Markdown notes app"
undersold what was built for working beside an agent (the scratch, the context bundle, a branch's changes reviewed,
language servers), and the descriptions had drifted into six wordings, `package.json` still with D1's "Obsidian's
model without the GUI", which D33 had superseded. Decided by an issue (#33) and one pull request (D223).

**Not chosen:** a comprehensive editor, raising its scope in the requirements; "AI companion"; a line saying slipbox
has no AI of its own; "notes app" as the lead (ideas.md § Product).

## D229: The scratch floats in the middle for quick capture, or sits on the right by a setting (8.3, 2026-10-13)

**Decision:** `space s s` opens the scratch in a floating window in the middle of the screen, three quarters of it: a
window like any inside, the scratch rendered and the lens to edit it, every key. `q` closes it, back where you were,
what was typed saved; `esc` leaves typing and the lens first, as anywhere, and closes it last. It opens empty too.
`[capture] open_in = "right"`, or Scratch opens in the UI settings, puts it in the window on the right instead (in a
split already, its other window), and `space s r` opens it there whatever the setting. A capture in the TUI (`space s
a`, a code cell's `space k s`) opens the scratch on the new entry, typing: an entry says where it's at and your note on
it, `**At:**` its reference (and its lines, fenced) and `**Note:**` after it, and the cursor waits after `**Note:**`.
`esc`
then `q` takes you back; a `**Note:**` left empty goes as the scratch closes, or as the TUI adds the next. A rule
(`---`) divides each entry from the one before. `slipbox capture` writes the same shape: `**At:**` on a reference, its
text after `**Note:**`; text alone is just the text. What an agent adds opens nothing. Decided by an issue (#43) and one
pull request (D223).

**Why:** The user's call: the scratch is for capturing a note, an idea or a reference quickly. Opened as a tab, it took
the place of the note you were in, and a capture never showed what it had added. A floating window over the note is
there and gone with a key, as the properties and commit editors are; the window on the right is for keeping it in sight
while you gather. A capture is for saying something about the place it points at — an idea, a question, a thing for
an agent to do — so the scratch reads as places with a note on each, pasted as they are into an agent's prompt, and
typing the note needs no key first. `Note`, as general as what you'd say, was the user's pick.

**Cost:** A capture takes `esc` `q` to get back to the note. One more setting. Entries already in a scratch keep their
old shape.

**Not chosen:** the tab, as before; asking before a floating scratch closes with unsaved typing (it is slipbox's own
file, and saving is what you would answer); opening it when an agent adds, which would take the keys from whatever you
were typing; `**For:**` and `**Do:**`, tried first, `Do` fitting only what an agent should do; `Comment`; no label
for your text, or the reference and your text on one line (no room for a snippet between); the labels as plain text
(`Note:`, which a `---` under it would make a heading), or as a list; dropping an empty `**Note:**` when another
program adds (the TUI's cursor may be on it).

## D235: No source file over 1,500 lines; App keeps state and wiring, features their own modules (2026-10-15)

**Decision:** No source file is over 1,500 lines. A feature goes in a module of its own; `App` (`src/tui/app.ts`) keeps
the TUI's shared state (tabs, views, buffers) and the wiring, and a feature's code works on it from its own file, as
`actions.ts` does for the commands. `bun run check:size` (`scripts/check-size.ts`), in `bun run check` and CI's lint
job, fails on a file past the limit; the seven past it on 2026-10-15 are capped (their size then, plus what the tasks
under way were adding) and may only shrink, the check saying when a cap can come down. The big files are split next,
after the tasks under way (VV-T2, VV-T4, VV-T7, GIT-T3), before the rest of VV and GIT.

**Why:** The user's, 2026-10-15: `src/tui/app.ts` had reached 11,500 lines and 436 methods, a class that does
everything, against single responsibility and separation of concerns; three agents changing it at once slowed VV. It
grew because every feature's state lived in `App` and only the commands' entry points were kept out (`actions.ts`), new
code matching the code around it, with no limit to stop it.

**Not chosen:** splitting later, after VV and GIT: the seventeen tasks left would each add to it first.
