# slipbox — handoff

Written 2026-09-25 for whoever picks this up next, human or agent; updated 2026-10-09. Phases 0–5c
are built (`docs/plan.md`, "Phases").
Read this, then `docs/idea.md`, then `docs/plan.md`, then `docs/design/` for how it was built.

## What you are building

A terminal markdown notes app: **a shared workspace for humans and agents over plain files** — the same files,
links and answers for a person in the TUI and an agent on the CLI. Not a markdown previewer with extras, and not
Obsidian without the GUI (reframed 2026-10-02; `docs/idea.md`, "What it is").

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
decided"): a file's root is its `.slipbox/` or the home vault (a git repository was offered, not
assumed; since `20.3` it's a vault by itself); storage keyed by a vault's id; aliases and previous
names; `[[vault:note]]`, paths and backlinks across vaults; moves kept as redirects; switching
vaults in the TUI; renames across vaults with a preview (`7.1`–`7.3`).
Next in phase 4: the rest of `1.x`, search (`6.x`), embeds. Still open: `7.4` (rename undo); `4.9`
(incremental reparse) moved to `15.1`, now mostly done (a note re-parses by chunk); `5.9` (a `HEAD`
change as a branch switch) and the lint surface (markdownlint-cli2) are not built.

**Updated 2026-10-03.** Built since: search (`6.x`), the lint surface (`3.21`), a branch switch as one event (`5.9`),
rename undo (`7.4`: `space v shift+u`, `slipbox undo`), and phase 5's LSP face (`11.x`) and code intelligence (`19.x`:
language servers and linters for code). Left in phase 5: `16.18`–`16.23`. **Decided 2026-10-02, built by 2026-10-03:**
plain paths and virtual vaults (`20.x`; `docs/idea.md`, "Plain paths, virtual vaults"). Done: the converter (`20.1`),
links as plain paths (`20.2`: `[[…]]` is text, `/` the filesystem's root, a move never resolves a link), vault
boundaries (`20.3`: the nearest `.slipbox/` or git checkout), collections apart from instances (`20.4`: local instance
ids in `vaults.json`, copies told by their evidence), personal state by instance (`20.5`: moves confirmed, never
guessed; today's state moved once), the LSP face removed (`20.23`), names for display (`20.6`: unique here, `work.docs`,
`name@branch`), settings deeper over broader (`20.7`), git-ignored and hidden files indexed when reached (`20.8`), the
background auto-index of `~` (`20.9`), freshness and coverage (`20.10`), the parse cache shared by content (`20.11`: a
second copy read ~150× faster). The `vault:path` form on screen (`20.12`) and in link completion (`20.13`). The vault
and its branch in the status line (`20.14`). The explorer's roots (`20.15`). Search by vault (`20.16`). Repairs from
what the state knows (`20.17`). Generated edits as plans (`20.18`: `--plan`, `slipbox apply`). Renames and moves on
paths, code comments included (`20.19`). The CLI takes and gives `vault:path` (`20.20`: any note argument, `--from`;
`shown`; `resolve`'s `href`, the relative path to write). The merge review (`20.21`: `slipbox merge-review`, `space g
m`; after a merge or a pull, git's renames are evidence for the relink). The removals (`20.22`): nothing resolves by a
name — until `21.3` read wikilinks again within their root; `[[vault:note]]` and redirects stay the converter's — and no
home vault: a plain folder opened is an unnamed instance, walked and indexed as a vault is (`~` and `/` listed a level
at a time). Next, then: phase 5's grammars (`16.18`–`16.22`; `16.23` asked about Ruby and C/C++) — built 2026-10-07,
below.

**Updated 2026-10-07.** Built since: paths inside, conventions at the edges (`21.x`; `docs/idea.md`, "Paths inside,
conventions at the edges"; `docs/design/decisions.md`, `21.x`). A file's **root** is its nearest folder holding
`.git`, `.slipbox/`, `.obsidian/` or `.zk/` (`21.1`); a leading `/` starts from it, then the filesystem (`21.2`);
wikilinks are read again within it — names, paths, aliases, attachments, ties ambiguous (`21.3`); each folder's link
convention is found — your setting, its tool's, its notes', ours — and written (`21.4`, `21.5`). **Named folders**
(`21.6`): a `.slipbox/` name, else a repository's remote, with its copies and a default here (`folders.json`);
`slipbox://name[@branch]/path` pointers reach them (`21.7`). State is kept by root's path, positions by file, and a
named folder moved by hand takes its state along (`21.8`); the screen shows what the file says, roots by name or path
(`21.9`); `slipbox folders`, `slipbox name`, pointers as arguments, `root`/`name` in the JSON, `--scope here`
(`21.10`); repairs offered after moves made elsewhere (`21.11`). Gone (`21.12`): vaults as a concept — collections,
instances, display names, `vault:path`, the move question, `previous_names` written on rename, `slipbox vaults`. The
terminal scenarios for `21.x` (`tests/e2e/world-links.ts` and others) were run in full the same day — 111 scenarios
in six panes; the 17 that failed were fixed (`d0eff65`): one was slipbox's own (a named folder moved by hand had its
state carried, but its move was lost at the start, never said nor its relink offered), the rest scenarios still in
the old words.

Also built 2026-10-07: the rest of phase 5 — grammars, outlines and highlighting for Swift (`16.18`), HTML, CSS and
SCSS (`16.19`), PHP (`16.20`), Dockerfile (`16.21`), Vue, Svelte and Astro, each part in its own language (`16.22`),
Ruby, C and C++ (`16.23`, decided in) — and jumps to type definitions and implementations (`19.13`). Left: Scout
(`6.10`), postponed until trailscout, its successor, has an SDK, and phase 6+ (export, images, extensibility).

**Updated 2026-10-08.** Built since, as prototypes tried with the user before they're marked done: code as a notebook
(`24.x`, `docs/design/code-view.md`) — TypeScript, TSX, JavaScript and Python read as a document, definitions in open
boxes, comments as prose, the lens on a whole cell — and pictures (`12.x`, `docs/design/rendering.md`): a local image
drawn under its `▣ alt` line where the terminal speaks Kitty graphics or sixel, one online fetched as `[render]
images_remote` says, `![[picture.png]]` by name, and pictures in an embedded note. Also: line numbers on by default, the
lens counting rows from the cursor, and opening on a whole section (`4.17`); macOS's cmd-arrow keys. The plan now marks
every built item done. Next in `12.x`, the terminal's own first: `12.7` confirmed, Mermaid as Unicode (`12.10`), maths
as text (`12.11`), then SVG (`12.15`) and pictures of both by choice, in the theme's colours (`12.16`, `12.17`). Left
beyond that: `24.9`, `24.17`, export (`10.x`), extensibility (`13.x`), distribution (`14.x`), `22.x`, and Scout
(`6.10`).

**Updated 2026-10-09.** All of `12.x` is built — and, with `24.x`, marked done once the user had tried them: SVG
(`12.15`), Mermaid and a display's maths as pictures by choice (`12.16`, `12.17`), and Kitty pictures drawn as Unicode
placeholders, sent once (`12.7`). Extensibility (`13.x`) is deferred, the whole of it. Left: `24.9`, `24.17`, export
(`10.x`), distribution (`14.x`), `22.x`, and Scout (`6.10`). Built the same day: the code view generic (`24.9`) — every
grammar with definitions drawn as a document from its own tree-sitter queries — a long signature a parameter a row
(`24.19`), receivers dimmed (`24.21`), a licence or generated header folded (`24.22`); `24.20` deferred, `24.17`
dropped.

Export (`10.x`, `docs/design/export.md`) began the same day, decided with the user: no external tool — every format
TypeScript or JavaScript under a permissive licence (the headless browser, `10.7`, and pandoc, `10.8`, dropped) — Word
first, an export beside its note by default. Built, as prototypes to try: the assembler (`10.1`: embeds drawn in,
links inside the document, pictures, diagrams and maths drawn), Word (`10.4`, by `docx`), PDF (`10.5`, by `pdfkit`,
in the machine's fonts), a web page (`10.2`), an e-book (`10.6`) and portable Markdown (`10.3`):
`slipbox export <note…> --to …` and `space n o`; several notes as one document, picked in order (`10.9`,
`space n shift+o`). Left after export: distribution (`14.x`, with the licence to decide: `14.6`), `22.x`, Scout
(`6.10`).

## The documents

| File | What it is | When to read it |
| --- | --- | --- |
| `docs/handoff.md` | this file — orientation and traps | first |
| `docs/idea.md` | *what and why* — captured scope, the reasoning, and what was ruled out | before designing |
| `docs/plan.md` | *what to do*. Work items with stable IDs, grouped into phases | before writing anything |
| `docs/design/` | *how it's built*: the code as it is (start at its README) | before changing code |
| `examples/vault/` | the demo vault, and the rendering fixtures; see `about-this-vault.md` | when you touch rendering |
| `examples/home/` | the reference set: every case of every feature, listed in `CASES.md` | when you test a feature |

Cite item IDs (`0.11`, `3.3`) rather than restating work. They are stable.

**`<dotfiles>` in either document** means the dotfiles repo, at `~/Projects/dotfiles` on this
machine. Those references point at real files worth reading — the nvim render-markdown config,
the herdr config, the workslate theme files — but they are outside this repo.

## Environment on this machine

Ubuntu 25.10, aarch64. **mise** manages the toolchain and installs on demand — bun 1.4.2 (slipbox's floor:
better-sqlite3 panics Bun 1.3), node lts and nvim 0.12.2 are already present, and anything else you need, `mise` will
fetch.

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
  with two faces (TUI, CLI; a third, the LSP face, was removed in `20.23`). The CLI must run without a terminal
  renderer, and the only thing that keeps that true is a check that fails the build.
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
- **A file's root** is its nearest folder holding a root marker — `.git`, `.slipbox/`, `.obsidian/`, `.zk/`, one root
  when several share a folder (`20.3`, `21.1`) — else the plain folder it's in, by its path, walked and indexed as a
  root is (`20.22`); `$HOME` and `/` never (opened, they're listed a level at a time). Nothing is ever written into a
  root by opening it; its state is kept by its path (`21.8`). See `docs/idea.md`, "Paths inside, conventions at the
  edges".
- **PKM layer in-process**, not by depending on a language server. slipbox *offering* an LSP was built in
  phase 5 and removed in `20.23`: with plain paths, editors' own servers follow the links, and agents use the CLI.
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
