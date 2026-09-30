# slipbox — handoff

Written 2026-09-25 for whoever picks this up next, human or agent; updated 2026-09-29. Phases 0–3
are built.
Read this, then `docs/idea.md`, then `docs/plan.md`, then `docs/design/` for how it was built.

## What you are building

A terminal markdown notes app: **Obsidian's model without the GUI, with agent integration as
the distinguishing feature.** Not a markdown previewer with extras.

It exists because markdown notes are central to working with AI agents, Obsidian needs a GUI
and most of its features aren't wanted, and nvim's markdown rendering was the specific
dissatisfaction that started it.

## Repository state

Phases 0–3 are implemented: the core, the rendering pipeline, the TUI with editing (source mode, a
vim-shaped normal mode, the lens, autosave and the conflict prompt, hand-off to `$EDITOR` or a
running nvim) and the agent CLI — which reaches every state change the TUI makes: find, replace,
tasks, safe writes — with tests (`bun run check`: headless, and the CLI as a process) and terminal
tests (`bun run e2e`, slipbox driven in a herdr pane; see `docs/design/testing.md`), all on the demo
vault in `examples/vault`. `docs/design/` describes the code as
it is and is kept in step with it; `docs/design/decisions.md` answers the decide items. Phase 3b,
files beyond markdown (`16.x`; the design is `docs/idea.md`, "Files beyond markdown"), is done: data
files render and source code goes through tree-sitter (Org and AsciiDoc were tried and dropped).
Phase 4 has begun with the vaults (`17.x`, done 2026-09-30; the design is `docs/idea.md`, "Vaults —
decided"): a file's root is its `.slipbox/` or the home vault (a git repository is offered, not
assumed); storage keyed by a vault's id; aliases and previous names; `[[vault:note]]`, paths and
backlinks across vaults; moves kept as redirects; switching vaults in the TUI; renames across vaults
with a preview (`7.1`–`7.3`).
Next in phase 4: the rest of `1.x`, search (`6.x`), embeds. Still open: `7.4` (rename undo); `4.9`
(incremental reparse) moved to `15.1`, now mostly done (a note re-parses by chunk); `5.9` (a `HEAD`
change as a branch switch) and the lint surface (markdownlint-cli2) are not built.

## The documents

| File | What it is | When to read it |
| --- | --- | --- |
| `docs/handoff.md` | this file — orientation and traps | first |
| `docs/idea.md` | *what and why* — captured scope, the reasoning, and what was ruled out | before designing |
| `docs/plan.md` | *what to do*. Work items with stable IDs, grouped into phases | before writing anything |
| `docs/design/` | *how it's built*: the code as it is (start at its README) | before changing code |
| `examples/vault/` | the demo vault, and the rendering fixtures; see `about-this-vault.md` | when you touch rendering |

Cite item IDs (`0.11`, `3.3`) rather than restating work. They are stable.

**`<dotfiles>` in either document** means the dotfiles repo, at `~/Projects/dotfiles` on this
machine. Those references point at real files worth reading — the nvim render-markdown config,
the herdr config, the workslate theme files — but they are outside this repo.

## Environment on this machine

Ubuntu 25.10, aarch64. **mise** manages the toolchain and installs on demand — bun 1.3.13,
node lts and nvim 0.12.2 are already present, and anything else you need, `mise` will fetch.

**The trap that will bite you first:** mise puts tools on `PATH` from a *login* shell. A
non-interactive `ssh beaver 'bun --version'` finds nothing and looks exactly like bun being
missing. Use `zsh -lc '...'` before concluding a tool is absent.

**Not installed:** cargo/rustc (not needed — the stack is TypeScript), `leaf`, `zk`, `chafa`.
`leaf` is the rendering quality bar and is installed on the Mac (`leaf-markdown-viewer` via
brew); if you want to compare rendering here, the project ships a `leaf-linux-arm64` release
asset.

## Where phase 0 started

**Phase 0 in `docs/plan.md`.** It is not generic scaffolding — every item in it is there
because it is cheap now and expensive later. Two deserve special attention:

- **`0.3` — a CI check that `core/` never imports `tui/`.** The whole architecture is one core
  with three faces (TUI, CLI, LSP). The CLI and LSP must run without a terminal renderer, and
  the only thing that keeps that true is a check that fails the build.
- **`0.8` — every action is a named command from the first commit.** The palette, the keymaps,
  the modal editing layer and any future plugin tier all consume that registry. Retrofitting it
  means touching every action.

The demo vault, `examples/vault/`, holds the rendering fixtures for `0.5` — the wide-table case that
started the project, a 1,231-line document, 216 dense table rows, and a note covering every link
form and display width. Its notes are invented (a fictional observatory's), written to keep the
awkward things real notes contain. The vault cases (name collisions, CRLF and encodings, images, the `.slipbox/`
marker) live in the test vault, `tests/fixtures/vault/`.

**Three decisions gated phase 0**, and are recorded in `docs/design/decisions.md`:

| ID | Decision |
| --- | --- |
| `0.10` | Storage layout — config vs cache vs **state**, and what the per-vault hash hashes |
| `0.11` | The file walk — extensions, ignore rules, symlinks, size caps, error handling |
| `9.1` | The CLI command list |

`0.11` is the one most likely to be underestimated: this app's thesis is that vaults *are* git
repos, so the walk meets `node_modules/`, `target/` and vendored `README.md` files. Get it wrong
and `[[README]]` resolves into a dependency, the 25 ms graph measurement becomes seconds, and the
watcher subscribes to tens of thousands of files.

## Hard constraints — do not violate these

These were each decided after a wrong turn. `docs/idea.md` records them as constraints precisely so
they are not re-litigated.

1. **slipbox is standalone.** It will be *used* inside herdr, but must never *require* herdr,
   tmux or zellij. A bare terminal over SSH is a first-class environment. Multiplexer
   integration is detected and optional, never assumed.
2. **nvim's rendering is the dissatisfaction.** Every "just use nvim plus render-markdown"
   answer is ruled out by that, even though nvim has every other feature on the list. This was
   re-proposed three times while the idea was taking shape; don't make it four.
3. **CLI parity: everything the UI can do, the CLI can do.** Precisely — *the CLI must reach
   every state change, not every interaction.* Scrolling, cursor movement, mode switches and the
   conflict prompt are legitimately TUI-only. Everything else is reachable from the CLI. This is
   not a feature policy; it is what forces every action into the core.
4. **The core imports nothing from the TUI.** See `0.3`.
5. **Disk is the contract between the CLI and the TUI.** A CLI invocation is a second process
   and sees the filesystem only — never an unsaved buffer. That is a definition, not a
   limitation.
6. **Agent usability from phase 1–2, not later.** The intended daily mode is UI and agent
   together. A notes app whose agent story arrives in phase 6 never got tested the way it is
   meant to be used.

## Decisions already made — read before reopening

`docs/idea.md` carries the reasoning. Summary of what is settled, so you know what *not* to
spend a day on:

- **Build, don't fork.** leaf is the quality bar but is a binary-only crate with churn in
  exactly the files a fork would touch. basalt is better architected and permissively licensed
  on its libraries, which reopened the stack question — answered: stay on Bun/TypeScript,
  because `basalt-core` is thin in the *easy* places and switching forfeits the JS export and
  rendering libraries.
- **Stack:** Bun + OpenTUI + remark. remark over marked because mdast carries source positions
  and slipbox edits. OpenTUI over Ink because Ink renders to a string and has no scroll
  container.
- **A file's root** is the nearest `.slipbox/` above it, else the home vault (loose files, a folder
  at a time); `$HOME` and `/` never. Every vault has a `.slipbox/` with its id and name; a git
  repository without one is offered (committed or private), never assumed and never written to
  unasked. See `docs/idea.md`, "Vaults — decided".
- **PKM layer in-process**, not by depending on a language server. slipbox *offering* an LSP is a
  separate and approved thing (phase 5).
- **Editing:** an in-app editor *and* `$EDITOR` hand-off (or a running nvim). Live preview is a
  lens: an explicit, framed editing session, not the rendered view quietly un-rendering the cursor
  line.
- **Concurrency:** autosave on with a long idle delay, a vim-shaped conflict prompt
  (`(L)oad` `(K)eep` `(D)iff` `(M)erge`), and **autosave never wins a conflict**.
- **Export:** slipbox writes its own formats; pandoc is an optional tier, never required.
- **Themes** are first-class and built in, defaulting to Tokyo Night.
- **The agent surface is a CLI first.** A server like nvim's is deferred, not rejected, with a
  concrete trigger recorded.

## Already verified empirically — don't redo this

Measured by installing and running, not by reading documentation:

- **OpenTUI ships prebuilt natives for eight targets** including `linux-arm64` and its musl
  variant. Cross-compilation is not a problem.
- **OpenTUI is not Bun-only** despite `bun-ffi-structs`. It also runs on Node 26.4+ with
  `--experimental-ffi`. Bun is still the only comfortable runtime.
- **`Textarea` is not modal, but its primitives are native and complete** — ~36 named actions,
  remappable bindings, and an `EditBuffer` with a rope, undo/redo, word boundaries and
  `offsetToPosition`/`positionToOffset`. The modal layer is a state machine over named actions,
  not a new editor. **Exception:** `extmarks` is *not* native and *not* on `EditBuffer` — it is a
  JavaScript simulation with an upstream warning.
- **`suspend()` / `resume()` / `pause()` exist**, so the `$EDITOR` hand-off is as cheap as the
  idea document claims.
- **OpenTUI already ships most of the image capability layer** —
  `ImageRenderProtocol = "auto" | "kitty" | "sixel" | "blocks"` plus `TerminalCapabilities` with
  `kitty_graphics`, `sixel`, `osc52` and **multiplexer detection**. No iTerm2 path.
- **`mermaid-ascii` v1.0.0 is partly broken.** Bare node ids render correctly; labelled nodes
  (`A[Vault]`) duplicate, emitting six boxes for a four-node graph. Do not treat it as working.

## Traps

- **Non-interactive shells hide the toolchain.** See Environment.
- **Don't trust a clean lint as proof an edit landed correctly.** Line-length checks pass happily
  on a correctly-formatted line in the wrong place. Read the result.
- **Markdown here is wrapped at 120 columns**, tables and code included, matching the dotfiles
  convention the documents were written under. `<dotfiles>` has a `markdownlint-cli2` config if
  you want to lint — note it reads config from the *current directory only* and does not walk up,
  so run it from a directory that has one.
- **State decisions, don't narrate them.** These documents record what *is* decided and what was
  decided *against*. They deliberately do not carry "this used to say X" — git holds that.

## What not to do

- Don't change storage (`0.10`), the walk (`0.11`) or the CLI list (`9.1`) without updating
  `docs/design/decisions.md`: each is relied on by the index, the watcher and agents.
- Don't add a dependency without checking it against constraint 1. An external binary can be an
  optional enhancement; it cannot be required.
- Don't reopen the settled list above without reading the reasoning first. Most of it was
  decided against an alternative that looks obvious from the outside.
- Don't treat the phases as immovable. They were reasoned, not decreed — but move them
  deliberately, and say why.
