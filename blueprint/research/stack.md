---
status: current
created: "2026-09-25"
---

# Research: the stack

What the TUI framework, the markdown parser and the runtime offer, and whether the things the design rested on hold.
Written for choosing the stack on 2026-09-25: Ink against OpenTUI, and OpenTUI's `Markdown` component against remark.
The same day, OpenTUI, `mermaid-ascii` and their neighbours were installed and checked, measured rather than assumed;
those claims are *ran*, and claims read from a named file in an installed package are *read*. The language-server
protocol libraries were checked under Bun on 2026-10-01, by running a server and client and then real servers.

## Summary

- **Ink is safer on every conventional measure, but the wrong shape:** it renders React to a string and has no scroll
  container (*memory*), while OpenTUI has a cell-level renderer with frame buffers and a `ScrollBox` (*read*). This
  informed D6.
- **OpenTUI's `Markdown` component uses `marked`, which gives only `raw` text; remark gives a source position per
  node** (*read*). This informed D7.
- **Cross-compilation is a non-issue:** OpenTUI ships prebuilt natives for eight targets (*ran*). This informed
  D5 and D197.
- **OpenTUI is not Bun-only, but Bun is the only comfortable runtime:** the Node path needs Node 26.4.0+ and an
  experimental flag (*read*). This informed D5.
- **`Textarea` is not modal, but its primitives are native and complete:** named actions, bindings as data, a rope with
  undo, word boundaries and offset mapping; only `extmarks` is a JavaScript simulation (*ran*). What is missing is the
  vim grammar. This informed D11 and D134.
- **Suspend and resume exist,** so the `$EDITOR` hand-off is cheap; how a line number reaches the editor has no
  portable form (*read*, *memory*). This informed D145.
- **OpenTUI already ships most of the image capability layer,** probing and multiplexer detection included, but no
  iTerm2 path (*read*). This informed D127; the rest of the image research is in
  [terminal-images.md](terminal-images.md).
- **`mermaid-ascii` 1.0.0 is partly broken:** labelled nodes break node identity (*ran*). This informed D127.
- **The language-server protocol libraries run under Bun and in the compiled binary, both ways** (*ran*, 2026-10-01),
  and npm servers run on slipbox's own Bun. This informed D170.

## Ink and OpenTUI

Figures read on GitHub and npm (*read*, 2026-09-25):

| | Ink | OpenTUI (`anomalyco/opentui`, MIT) |
| --- | --- | --- |
| Version | v7.1.1, stable | v0.5.12 |
| Age | nine years | 14 months |
| Stars | 39.9k | 13.4k |
| npm downloads a week | 5.1M | 626k |
| Open issues and PRs | 35 (issues alone 16) | 155 (issues alone 64) |

The open counts are both GitHub's `open_issues_count`, which counts pull requests too.

- **Ink** renders React to a **string**, then diffs and reprints. It is built for CLI output (progress, prompts,
  forms), which is why Prisma, Wrangler and Gatsby use it. It has no scroll container, so a viewport over content larger
  than the screen means virtualised scrolling on a string differ (*memory*).
- **OpenTUI** has a **cell-level renderer with frame buffers**, plus `ScrollBox`/`ScrollBar`, `TextTable`, images, and
  a `TimeToFirstDraw` diagnostic: document-viewer shaped (*read*).
- It comes from `anomalyco` (the opencode people), so it is built for AI tooling: hence the `streaming` prop for
  incremental updates, useful when an agent writes a note while you watch (*read*).
- Its API is pre-1.0 and churns: 169 commits per 90 days (*read*).

### What OpenTUI offers

- **19 components,** including a **`Markdown`** component (not just `Code`), plus `TextTable`, `Textarea`,
  `ScrollBox`/`ScrollBar`, a line-number gutter, `Diff`, `Image` and an embedded terminal. Yoga flexbox layout.
  `Renderable` subclassing is the documented extension point (*read*).
- **`Markdown`'s props:** `content`, `syntaxStyle`, `conceal`, `concealCode`, `streaming`, `tableOptions`, and
  **`renderNode`**: "override rendering for a token and fall back to default rendering" (*read*).

## OpenTUI's `Markdown` and remark

OpenTUI's `Markdown` uses **`marked` 17.0.1**, not remark, confirmed in its `package.json`, with `web-tree-sitter` as a
*peer* dependency installed separately (*read*). So the remark plugin ecosystem does not apply to it. The two paths
compared:

| | OpenTUI `Markdown` | remark and a custom `Renderable` |
| --- | --- | --- |
| Parser | marked | remark |
| Source positions | `raw` text only | `Position {line, column, offset}` per node |
| Wikilinks | a hand-written marked extension | `remark-wiki-link` |
| Table layout | OpenTUI's, quality unknown | slipbox's own to write |
| Control | the `renderNode` hook | total |

- With marked, "cursor is on this rendered node, which bytes is that?" and the reverse, when an agent rewrites a range,
  would be reconstructed by walking `raw` strings and summing lengths (*ours*).
- marked wins only on speed and size (*memory*), which matter little when rendering one document at a time (*ours*).

## Other packages named for the stack

- **`unicodeit`** on npm is the original; leaf uses a separate Rust port of the same project (*read*).
- **`knap`** is first-party Obsidian, npm v0.6.0 (*read*).
- **`mermaid-ascii`** on npm is v1.0.0; see [below](#mermaid-ascii-is-partly-broken) (*ran*).

## Installed and checked, 2026-09-25

### Cross-compilation and the runtime floor

- **`@opentui/core@0.5.12` ships prebuilt native binaries as `optionalDependencies`** for eight targets: `darwin-x64`,
  `darwin-arm64`, `linux-x64`, `linux-arm64`, `linux-x64-musl`, `linux-arm64-musl`, `win32-x64`, `win32-arm64`
  (*ran*). So the Mac and the four Linux VMs are all covered with no toolchain, and the earlier worry about "one build
  target becoming three toolchains" was wrong. What remains is making `bun build --compile` for a foreign target embed
  *that* target's optional dependency: packaging, not compilation (*ours*).
- **Runtime floor.** OpenTUI runs on **Bun 1.3.0+ or Node.js 26.4.0+ with ESM and `--experimental-ffi`**: its own
  bundled README says so, and `package.json` sets `main` and `module` to `index.node.js` with explicit `node` export
  conditions throughout (*read*). It is not Bun-only, despite depending on `bun-ffi-structs`. The Node path needs a very
  recent Node *and* an experimental flag, so Bun is the only comfortable runtime: a strong default, not an
  impossibility (*ours*).
- **East Asian width and emoji come with it:** `string-width`, `emoji-regex` and `get-east-asian-width` arrive as
  OpenTUI dependencies (*ran*).

### `Textarea` and `EditBuffer`

The worry was that OpenTUI's editing component would be a toy, and a modal layer a large unplanned piece, the way leaf
needed `edtui` (*ours*). It is the opposite.

- **`TextareaRenderable` exposes a named action enum** of roughly 35 actions (*ran*; the handoff counted ~36):
  movement and selection in all directions, `line-home`/`line-end`, **`visual-line-home`/`visual-line-end`**,
  `buffer-home`/`buffer-end`, `delete-line`, `delete-to-line-end`/`-start`, `word-forward`/`word-backward` with select
  and delete variants, `undo`, `redo`, `select-all`, `submit`; plus `keyBindings`, `keyAliasMap` and an exported
  `defaultTextareaKeyBindings`. So **every action is named and every binding is data** (*ran*).
- **`EditBuffer` is native** and already provides (*ran*):

| Capability | Why it matters here |
| --- | --- |
| rope-backed buffer | large notes without per-keystroke copying |
| `undo` / `redo` / `canUndo` / `canRedo` / `clearHistory` | the undo requirement, done |
| `getNextWordBoundary` / `getPrevWordBoundary` | word motions, done |
| **`offsetToPosition` / `positionToOffset` / `getTextRange`** | the mdast-position mapping remark was chosen for |
| per-line `addHighlight`, `setSyntaxStyle` | syntax highlighting inside the editor |
| `setTabWidth`, `gotoLine`, `setCursorByOffset` | the ordinary things |

- **`extmarks` is the exception:** it is **not on `EditBuffer`** but in `lib/extmarks.d.ts`, as an
  `ExtmarksController` surfaced on `EditorView` and `TextareaRenderable` (*read*). And it is **not native**: its own
  upstream warning says it is *"simulating extmarks in the edit buffer and will move to a real native implementation in
  the future"*, implemented by wrapping about nineteen `EditBuffer` methods in JavaScript (*read*). Usable, but not the
  Zig layer.
- **What is missing is the vim grammar, not the primitives:** modes, operator-plus-motion composition (`d2w`, `ciw`),
  registers, counts, dot-repeat, marks and the jumplist (*ran*). That is a state machine mapping key sequences in a mode
  to sequences of existing named actions; a useful subset was estimated at a few hundred lines (*ours*). No `edtui`
  equivalent is needed, because the part that would have justified one is already native (*ours*).
- `offsetToPosition` and `positionToOffset` make remark's source positions pay off in the editor as well as the
  renderer, and the `visual-line-*` actions mean **cursor movement across a wrapped row is already handled**, one of
  the hard cases listed against live preview (*ours*).

### Suspend and resume

- **`renderer.d.ts` exports `pause()`, `suspend()` and `resume()`,** a `ScreenMode` of
  `alternate-screen | main-screen | split-footer`, an `EXPLICIT_SUSPENDED` state, and internal state preserved across
  suspension (`_suspendedMouseEnabled`, `suspendedNonAltSurfacePreserved`) (*read*). So OpenTUI can release the
  terminal and take it back, which the `$EDITOR` hand-off and running a command in the foreground both need.
- **A line number has no portable form:** `nvim +42 f`, `hx f:42`, `code --goto f:42`, `emacsclient +42`; and
  `$EDITOR` may be a string with arguments that needs splitting (*memory*).

### The image capability layer

`types.d.ts` declares (*read*):

```ts
type ImageRenderProtocol = "auto" | "kitty" | "sixel" | "blocks"
interface TerminalCapabilities {
  kitty_graphics: boolean;  sixel: boolean;
  osc52: boolean;           osc52_support: TerminalCapabilityState;
  multiplexer: TerminalMultiplexer;
  image_protocol?: ImageRenderProtocol;  // plus rgb, ansi256, unicode, hyperlinks
}
```

- `"auto" | "kitty" | "sixel" | "blocks"` is a fallback ladder (native protocol, then blocks), and
  `resolveImageRenderProtocol()` is exported to pick one (*read*).
- **Capability probing is done,** including `multiplexer` detection: the "don't sniff `$TERM`" problem (*read*).
- **OSC 52 capability is covered too** (`osc52`, `osc52_support`) (*read*), so clipboard work starts further along.
- **No iTerm2 / OSC 1337 path:** of the three protocols, OpenTUI covers two (*read*). Ghostty speaks kitty (*memory*).

### `mermaid-ascii` is partly broken

Installed `mermaid-ascii@1.0.0` (MIT, one dependency) and ran it (*ran*).

- **Bare node ids work:** `A --> B`, `A --> C`, `B --> D` renders as one `A` with two children, properly laid out.
- **Labelled nodes break node identity.** Given standard mermaid:

  ```text
  graph TD
    A[Vault] --> B[Graph]
    A --> C[Render]
    B --> D[Backlinks]
  ```

  it emits **six boxes instead of four**, drawing each edge as an isolated pair: `A[Vault]` and `A` become two
  different nodes, as do `B[Graph]` and `B`. The label syntax is not normalised away before the graph is built, so any
  real diagram, which uses labels, comes out wrong. It looks like a small parser bug (*ours*).
- Working references for a port: [`AlexanderGrooff/mermaid-ascii`](https://github.com/AlexanderGrooff/mermaid-ascii)
  (Go) and leaf's `mmdflux` (*read*).

## The language-server libraries under Bun, 2026-10-01

`vscode-languageserver` (10.1, the server's side) and `vscode-languageserver-protocol` (3.18, the client's: the
JSON-RPC connection and every message's type) run under Bun as they do under Node, and in the compiled binary. Checked
with a server and client of a few lines, then the client against vtsls, pyright, bash-language-server,
lua-language-server and vscode-css-language-server (*ran*). One library serves both directions; `vscode-languageclient`
is VS Code's own and needs its API (*memory*).

- **npm servers run on slipbox's own Bun.** vtsls, pyright and bash-language-server run under Bun, and the compiled
  binary is Bun when `BUN_BE_BUN=1` is set: it installs a server (`add --ignore-scripts --exact`, into a folder of its
  own, in two seconds) and runs it (*ran*).
- **Bun reads `bunfig.toml` and `.env` from the folder it starts in,** so a repository's preload would run with any
  server started there (*ran*, 2026-10-07).
- **Diagnostics come both ways.** Older servers send them; newer ones, the CSS server for one, wait to be asked
  (`textDocument/diagnostic`, LSP 3.17) (*ran*).
- **A server needs its settings.** Asked for them and given none, the CSS server checks nothing (*ran*); nvim-lspconfig
  ships defaults for each server (*memory*).
- **A server finds its helpers on `PATH`.** bash-language-server runs shellcheck only when it is there (*ran*); Mason's
  `bin` is often where it is (*memory*).

What slipbox does with these is D170 and the decisions it names.

## Gaps

- OpenTUI has no iTerm2 / OSC 1337 path.
- `Textarea` has no vim grammar: modes, operator-plus-motion, registers, counts, dot-repeat, marks, the jumplist.
- `extmarks` has no native implementation yet.
- There is no portable form for passing a line number to an editor.

## Sources

- OpenTUI: `anomalyco/opentui` on GitHub and npm (2026-09-25); `@opentui/core@0.5.12` as installed: its
  `package.json`, bundled README, `types.d.ts`, `renderer.d.ts` and `lib/extmarks.d.ts`.
- Ink on GitHub and npm (2026-09-25).
- `marked` 17.0.1 (OpenTUI's dependency); remark and `remark-wiki-link`.
- `mermaid-ascii@1.0.0` on npm, installed and run (2026-09-25);
  [`AlexanderGrooff/mermaid-ascii`](https://github.com/AlexanderGrooff/mermaid-ascii); leaf's `mmdflux`.
- `unicodeit` and `knap` on npm.
- `vscode-languageserver` 10.1 and `vscode-languageserver-protocol` 3.18 under Bun, with vtsls, pyright,
  bash-language-server, lua-language-server and vscode-css-language-server (2026-10-01).
