# Architecture

How the code is laid out and why, as built in phases 0–3. The *why* of the product is in `docs/idea.md`; the
decisions that gated this code are in [decisions.md](decisions.md).

## One core, three faces

```text
                 ┌──────────────────────────────────────────┐
                 │ src/core — pure TypeScript, no terminal   │
                 │ vault · walk · parse · links · graph      │
                 │ layout IR · themes · capture · watch      │
                 └───────┬──────────────┬──────────────┬────┘
                         ▼              ▼              ▼
                    src/tui         src/cli        src/lsp
                    OpenTUI         agents,        (phase 5,
                    reader          scripts         empty)
```

`src/main.ts` picks a face. A known subcommand runs the CLI. Anything else opens the TUI, but only
when stdin and stdout are terminals (plan `9.3`). The TUI is loaded with a dynamic `import()`, so a
CLI call never loads OpenTUI's native renderer.

### The boundary is enforced, not hoped for

`scripts/check-boundary.ts` (plan `0.3`) fails the build when:

| Directory | May not import |
| --- | --- |
| `src/core/` | `src/tui/`, `src/cli/`, `src/lsp/`, `@opentui/*` |
| `src/cli/` | `src/tui/`, `@opentui/*` |
| `src/lsp/` | `src/tui/`, `@opentui/*` |

It runs in CI (`.github/workflows/ci.yml`) and in `bun run check`.

### Only the final draw step touches OpenTUI

Inside the TUI, the same rule applies one level down. `src/tui/app.ts` (the model) and
`src/tui/draw.ts` (painting) talk to an abstract `Canvas` and `Host`. Only two files import
OpenTUI:

| File | What it does with OpenTUI |
| --- | --- |
| `src/tui/opentui.ts` | `Canvas` over `OptimizedBuffer`; the full-screen `Renderable` |
| `src/tui/run.ts` | `createCliRenderer`, key, paste and mouse events, resize, OSC 52, shutdown |

Shutdown saves positions and the session whatever ends the process: `ctrl+q`, or `SIGTERM`, `SIGHUP`,
`SIGINT`, `SIGQUIT` or `SIGPIPE`.

Everything else is testable headlessly with `TextCanvas` (see [testing.md](testing.md)).

## Module map

| Module | Plan items | Role |
| --- | --- | --- |
| `core/width.ts` | 0.7 | the one width function: graphemes, East Asian width, emoji |
| `core/fsutil.ts` | 4.6, 7.5 | atomic writes keeping the mode; `writeNote` (never out of the vault); reads |
| `core/sanitize.ts` | 2.9 | strips terminal escapes on the way into layout |
| `core/paths.ts` | 0.10 | config, cache and state directories; the vault key |
| `core/config.ts` | 0.9 | TOML: defaults ← user ← vault; warnings, never crashes |
| `core/vault.ts` | 1.1, 1.10, 0.12 | marker discovery, single-file mode, `init`, version stamp |
| `core/walk.ts` | 1.2, 0.11 | the walk and `WalkFilter`, shared with the watcher |
| `core/wikilink.ts` | 1.3 | micromark tokenizer for `[[link]]` and `![[embed]]` |
| `core/parse.ts` | 1.3 | remark + gfm + frontmatter + wikilinks; headings, slugs |
| `core/links.ts` | 1.4 | `LinkIndex`: case policy, collisions, markdown URLs |
| `core/graph.ts` | 1.5, 1.8, 1.9 | notes, links, backlinks, lazy parsing, persisted index |
| `core/note.ts` | 2.x | a note rendered for a pane: parse, resolve links, lay out (CLI and TUI) |
| `core/layout/*` | 2.1–2.8 | mdast → layout IR; tables; wrap; highlighting; ANSI |
| `core/layout/source.ts` | 4.13 | the markdown as a layout, with each cell's source offset |
| `core/layout/live.ts` | 4.14 | a note's blocks; the lens composed into the render |
| `core/tasks.ts` | 4.11 | a task's checkbox toggled as a one-byte edit |
| `core/editor.ts` | 4.1, 4.2, 4.12 | hand-off templates to argv, never through a shell |
| `core/nvim.ts` | 4.12 | finding and asking the running nvims |
| `core/replace.ts` | 4.16 | find's patterns (plain, regex, whole words), replacements, vim's `:s` parsed |
| `core/merge.ts` | 5.5 | line diff (Myers), three-way merge, the diff the conflict prompt shows |
| `core/theme/*` | 2.6 | semantic roles, built-in themes, base16 loader |
| `core/glyphs.ts` | 2.8 | Nerd, Unicode and ASCII glyph sets |
| `core/commands.ts` | 0.8 | `CommandRegistry` and `Keymap` |
| `core/command-specs.ts` | 0.8, parity | every command id with its CLI equivalent |
| `core/position.ts` | 3.4, 3.5, 3.15 | anchors, reading positions, session file |
| `core/watch.ts` | 5.1, 5.2 | per-directory watcher, debounce, polling fallbacks |
| `core/capture.ts` | 8.2–8.4 | scratch location, reference format, append |
| `core/clipboard.ts` | 8.5 | OSC 52 (up to 100 KB of base64), then pbcopy / wl-copy / xclip, then a file |
| `core/stale.ts` | 9.9 | advisory list of unsaved paths, pid-stamped: the TUI writes it, the CLI reads it |
| `cli/cli.ts` | 9.1–9.6 | the CLI face |
| `cli/args.ts` | 9.1 | flag parsing: flags anywhere, `--x=v` or `--x v`, `--` ends flags |
| `version.ts` | — | the version, one source |
| `tui/*` | 3.x, 5.3–5.7 | the app: reading, panes, saving and conflicts |
| `tui/buffer.ts` | 4.5–4.8 | a note's text, its undo steps, unsaved state, BOM and line endings |
| `tui/editing.ts` | 4.3 | the cursor as a text offset; insert mode |
| `tui/vim.ts` | 4.4 | counts, operators and text objects, the register, `.` |
| `tui/replacing.ts` | 4.16 | the replace row, `:s` and its confirm, `gn`'s matches |

## Data flow for one note

```text
file bytes ──readText──▶ text (BOM noted, invalid UTF-8 → U+FFFD)
          ──parseMarkdown──▶ mdast with positions + frontmatter
          ──renderTree(width, glyphs, resolveLink)──▶ Layout { lines, links, headings }
          ──▶ tui/draw.ts through Canvas          (TUI)
          ──▶ layout/ansi.ts to a string          (slipbox render)
```

Link statuses (resolved, unresolved, ambiguous) are decided during layout by a resolver function
injected from the graph, so the layout stays pure and knows nothing about the vault.

## Dependencies

Runtime dependencies, all pure JavaScript except OpenTUI:

| Package | Used for |
| --- | --- |
| `@opentui/core` **0.5.12, pinned exactly** | the TUI renderer and input |
| `unified`, `remark-parse`, `remark-gfm`, `remark-frontmatter` | parsing, with source positions |
| `mdast-util-to-string` | heading text fallback |
| `highlight.js` | code-fence highlighting, in the core so CLI and TUI match |
| `get-east-asian-width` | the width function |
| `ignore` | gitignore semantics for the walk |
| `smol-toml`, `yaml` | config; frontmatter and base16 schemes |

No external binary is required (hard constraint 1). The clipboard tools are used when present
and never needed.

### OpenTUI upgrade policy (plan `0.6`)

OpenTUI is pre-1.0 and moves fast, so it is pinned to an exact version in `package.json`
(`"0.5.12"`, no caret). To upgrade:

1. Read the changelog from the pinned version to the target.
2. Bump the pin, run `bun run check`. The `OpenTUI end to end` test in `tests/tui.test.ts`
   exercises the adapter through OpenTUI's own test renderer.
3. Launch the TUI and check the four things the adapter uses: `drawText` and `fillRect` output,
   key names (`keyName` in `tui/keys.ts`), mouse events, and `copyToClipboardOSC52`.
4. Only `tui/opentui.ts` and `tui/run.ts` should need changes. If anything else does, the
   boundary has leaked; fix that first.

## Storage

Decision `0.10`. Nothing derived is ever written into the vault.

| What | Where |
| --- | --- |
| user config | `$XDG_CONFIG_HOME/slipbox/config.toml` (or `--config`, `$SLIPBOX_CONFIG`) |
| vault config | `<vault>/.slipbox/config.toml`, plus `.slipbox/version` |
| user themes | `$XDG_CONFIG_HOME/slipbox/themes/*.yaml` (base16 / base24) |
| link index | `$XDG_CACHE_HOME/slipbox/<key>/index.json` |
| reading positions | `$XDG_STATE_HOME/slipbox/<key>/positions.json` |
| session | `$XDG_STATE_HOME/slipbox/<key>/session.json` |
| clipboard fallback (no OSC 52 or clipboard tool) | `$XDG_STATE_HOME/slipbox/<key>/clipboard.txt` |
| scratch | `$XDG_STATE_HOME/slipbox/<key>/scratch.md`, or in the vault by config |
| staleness | `$XDG_STATE_HOME/slipbox/<key>/dirty/<pid>.json` |

`<key>` is `<basename>-<sha256(realpath)[:12]>`.

## Performance, measured

Measured on this machine (aarch64 VM) on 2026-09-25:

| Case | Time |
| --- | --- |
| `slipbox render` of a note, cold 5,000-note vault | 175 ms end to end, including Bun start-up |
| rebuild of the 5,000-note index from cache | 55 ms |
| backlinks map over 5,000 cached notes | 23 ms |
| first full parse of 5,000 notes (≈15 MB) | 11 s, once; the TUI does it in the background |
| parse + layout of the 56 KB `large-document.md`, warm | 45 ms + 12 ms |
| the same, cold process | ≈170 ms |

The graph parses lazily. The walk alone supplies every note name, which is all link resolution
needs, so `render` and `resolve` never parse the whole vault. `backlinks`, `ls --json` and
`outline` parse what they need and persist it. The TUI paints the first note straight away and
parses the rest in 12 ms slices between frames, showing `indexing N…` in the top bar.

Parsing costs about 2 ms per 3 KB note, which is remark's own speed. Parsing in worker threads is
the next lever. It belongs with phase 4's vault-scale work.
