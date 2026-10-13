# Code

slipbox opens code as well as notes. In most languages it draws a code file as a document to read like a note:
each definition in a cell of its own, its documentation as prose, its imports folded away. A key away is the file as
written, in source mode. Behind both, slipbox talks to the language servers and linters you'd use in an editor, for
the file's problems, what's under the cursor, jumps, renames and completion. This chapter covers each of those, the
problems they find, and trust: a folder's own code never runs unless you say so.

The examples use a project in `~/code/app`, a git repository with its code in `src/` and its notes in `docs/`.

## The code view

A code file opens in the code view when slipbox maps its language: TypeScript, TSX, JavaScript (JSX too), Python, Go,
Rust, Swift, PHP, Ruby, C, C++, Lua and Bash. Other code (HTML, CSS, SCSS, Dockerfiles, Vue, Svelte and Astro
components) opens in source mode. `space n v` switches the file on screen between the code view and source mode, and
`render.code = "source"` opens all code in source mode ([Configuration](configuration.md)).

This TypeScript file, `src/shelf.ts`:

```ts
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// ---- Reading notes ----

/**
 * Reads a note from its folder.
 * @param folder - where the notes are
 * @param name - the note's file name
 * @returns its text
 */
export async function readNote(folder: string, name: string): Promise<string> {
  return readFile(join(folder, name), "utf8"); // always UTF-8
}

/** The notes of a folder, each read once. */
export class Shelf {
  private notes = new Map<string, string>();

  /** A note's text, if it has been read. */
  get(name: string): string | undefined {
    return this.notes.get(name);
  }
}
```

is drawn, in a narrow window, like this:

```text
▸ imports  node:fs/promises · node:path (2)

── Reading notes ─────────────────────────────────────────────────────────

┌─ function: readNote ────────────────────────────────── 6–14 ⇢ ⧉ ✎ ◎ ▾ ──
│
│ Reads a note from its folder.
│
│   folder    where the notes are
│   name      the note's file name
│   returns   its text
│
│ export async function readNote(
│     folder: string,
│     name: string
│ ): Promise<string> {
│   return readFile(join(folder, name), "utf8");  always UTF-8
│ }

┌─ class: Shelf ─────────────────────────────────────── 16–18 ⇢ ⧉ ✎ ◎ ▾ ──
│
│ The notes of a folder, each read once.
│
│ export class Shelf {
│   private notes = new Map<string, string>();
│
│ ┌─ method: get ────────────────────────────────────── 20–23 ⇢ ⧉ ✎ ◎ ▾ ──
├─┤
│ │ A note's text, if it has been read.
│ │
│ │ get(name: string): string | undefined {
│ │   return this.notes.get(name);
│ │ }
│
│ }
```

Every token of code is drawn as it's written: nothing is replaced, reordered or hidden for good. What the view changes
is what's around the tokens: where a long line breaks, blank rows, boxes, dimming and indent guides. Line numbers stay
the file's, and copying a selection copies the file's text, never the rows as drawn.

### Cells

Each definition is a cell: a function, a class, a method, a type, an interface, a struct, an enum, a trait or an
impl, as the language calls it. Its header says what it is in its language's word (`function: readNote`, `struct:
Frame`, `impl: Stacker`), then its lines and its buttons. A class is a cell of its head, then each member a cell of
its own under it, joined to it by tree lines, and its closing brace where the file has it. Other statements, such as
top-level values or a script's lines, are cells too, each run of them titled by the names it defines (`• limit`), or
`code`.

Cells are boxes by default; `render.code_cells = "band"` draws each on a tinted band instead, and `space u c`
switches between the two.

### Documentation and comments

A definition's documentation is drawn as prose at the top of its cell, then a list of its terms: each parameter, what
it returns, yields or raises, and any other tags. The comment markers go. slipbox reads the usual conventions: JSDoc,
Javadoc, PHPDoc and Doxygen comments, LuaDoc, and Python docstrings in Google, NumPy or reStructuredText style. Comment
lines right above a definition document it, as Go writes them.

A Python docstring, written below its `def`, is drawn at the top of its cell like every other language's
documentation, so a page reads the same whatever language wrote it. That is the one place the view changes the order
of the file's lines.

Other comments are prose too: a comment that documents nothing (a file's opening note, say) is a box of its own marked
`¶`, and a comment after code on the same line is a note beside it, in the comments' colour. Two kinds stay as written:
comments for tools (a shebang, `eslint-disable`, `@ts-ignore`, `noqa`, `# type: ignore`) and code commented out.

### Imports, licences and sections

- **Imports**: the file's run of imports is one row, `▸ imports`, naming the modules and how many. `enter` on it
  opens it, and folds it again.
- **A licence or a generated file's banner** at the top of the file is one row too: `▸ license · MIT` (by its SPDX
  id, else its words), or `▸ generated · protoc-gen-go`. `enter` opens and folds it.
- **Sections**: a separator comment, such as `// ---- Reading notes ----`, `# === Setup ===`, `// MARK: Setup` or
  `#region Setup`, is a rule across the page with its title. Sections head the outline and the breadcrumb, with the
  definitions under them.

### Long lines

A line too long for its cell breaks at its structure: after an opening bracket or a comma, before `&&`, `||` or `?`,
or before a `.` that chains, the rest four columns further in. A definition whose signature doesn't fit gets a
parameter a row, as `readNote` does above. A line that fits is never broken, and lines are never joined. With
wrapping off (`space u w`), lines run on and the view scrolls sideways.

### A cell's buttons and keys

Each button in a cell's header is a key too, acting on the cell at the cursor. Click the button or press the key:

| Button | Keys | What it does |
| --- | --- | --- |
| `▾` / `▸` | `space k f`, `z a` | fold the cell to its header (a class with its members), or open it |
| `✎` | `space k e` | edit the cell: the lens on all its lines |
| `⧉` | `space k y` | copy its lines, as the file has them |
| `⇢` | `space k r` | where its definition is used, from its language server |
| `⚠ n` | `space k p` | its problems, in the Problems panel; shown when it has some |
| `◎` | `space k s` | add it to the scratch, with its path and lines, for an agent |

A cell folds whole: there's no folding inside one, of an `if` or a loop.

### Moving and editing

The cursor moves over the text of the cells, never their borders — but a folded cell's header, its one row, where
`z a` opens it again. The outline (`space o`) and the breadcrumb list the definitions, as in source mode, and `] ]` and
`[ [` move from one to the next.

Editing works as in a rendered note ([Editing](editing.md) has the lens and source mode). The editing keys (`i`, `a`,
`o`…) open the lens on the cursor's cell: its lines as written, highlighted, the code view around it, and the key again
types there. `space n l` opens the lens too, and `space k e` opens it on a whole cell, however tall. `esc esc` closes
the lens, and the cell is drawn again. With `editor.edit_in = "source"`, the editing keys switch the window to source
mode and type there instead.

## Source mode for code

In source mode a code file is the file as written, highlighted by its language. slipbox parses these languages
itself: TypeScript, TSX, JavaScript, Python, Bash, Lua, Go, Rust, Swift, PHP, Ruby, C, C++, HTML, CSS, SCSS,
Dockerfiles, and Vue, Svelte and Astro components. Others are highlighted line by line.

For a language it parses, slipbox gives the file:

- **An outline**: its definitions (functions, classes, methods, types and the like; a Dockerfile's stages; a
  stylesheet's rules and `@media` blocks; a page's headings and ids), nested as they are, in the outline (`space o`)
  and the breadcrumb; `] ]` and `[ [` move between them. A component's parts (a Vue file's template, script and style,
  a page's `<script>`) are each an entry, coloured in their own language. A file slipbox can't outline itself takes its
  language server's outline, when it has a server.
- **Syntax errors**: where the parser finds an error, the text is underlined and counted among the file's problems,
  below, here and in the code view, where a cell's header counts its own. They're checked as you pause typing and shown
  once you leave insert mode, since a half-typed line is always broken. Once a language server has answered, its own
  errors take their place.

## Links in code

In source mode, a URL in a code file, or a path with an extension that names a file of the root, is a link, and
`enter` follows it. A path is read from the file's folder, else from the root (a leading `/` is the root), and
`:42` after it opens that line: `./retry.ts:12`. Paths count in comments and in strings, so an import's path can be
followed too. The code view draws a comment's paths as links too, beside its URLs and Markdown links, and `enter`
follows them as in source mode. Code has no wikilinks.

A path in a comment counts as a backlink of the file it names, and moving or renaming that file rewrites it, as it
does a note's links ([Links and roots](links-and-roots.md)).

## Language servers

A language server is the program an editor asks about code: VS Code, Neovim and Helix use the same ones. slipbox asks
them for a file's problems, what's under the cursor, definitions and references, renames, fixes, formatting and
completion. A server starts when a file of its language is first shown, is told about the file as you type (after a
short pause, never at each key) and when you save, and stops when you quit.

### Which servers

Each language has a main server and, where the project has their config, add-ons: a linter's server, run beside the
main one. These are built in:

| Languages | Servers, the main one first |
| --- | --- |
| TypeScript, TSX, JavaScript, JSX | TypeScript's own (`typescript`) or `vtsls`; add-ons `eslint`, `biome` |
| Python | `pyright`; add-on `ruff` |
| Rust | `rust-analyzer` |
| Go | `gopls` |
| Lua | `lua-language-server` |
| Bash | `bash-language-server` |
| JSON, JSON with comments | `vscode-json-language-server`; add-on `biome` |
| YAML | `yaml-language-server` |
| TOML | `taplo` |
| CSS | `vscode-css-language-server`; add-ons `stylelint`, `biome` |
| SCSS, Less | `vscode-css-language-server`; add-on `stylelint` |
| HTML | `vscode-html-language-server` |
| Dockerfile | `docker-langserver` |
| PHP | `intelephense` |
| Swift | `sourcekit-lsp` |
| C, C++ | `clangd` |
| Ruby | `ruby-lsp` |

For TypeScript, TypeScript 7 has its server built in: it's used where the project's TypeScript is 7 or there is none,
and `vtsls`, which brings its own TypeScript, where the project's is older. An add-on runs only where the project has
its config: `eslint` with an ESLint config, `biome` with `biome.json`, `stylelint` with a stylelint config, `ruff` with
`ruff.toml` or a `[tool.ruff]` table in `pyproject.toml`. Each loads the project's own setup, so slipbox, your editor
and your CI agree.

A language with no server built in (Java, Kotlin, Zig…) gets one when you set it up, below.

### Where slipbox finds them

A server runs in its project's top folder: the nearest folder above the file holding the language's first root marker
(`tsconfig.json`, then `package.json`, then `.git`, for TypeScript), never `~` or `/`; else the file's own folder.

Its program is looked for, in order:

1. the path your config gives it, when its `command` is a full path;
2. the project's own copy, in `node_modules/.bin`, `.venv/bin`, `venv/bin` or `vendor/bin`, but only in a root you
   trust;
3. your `PATH`;
4. the folders you install tools into: Mason's `bin` (Neovim's installer), `~/.cargo/bin`, `~/go/bin`, `~/.local/bin`;
5. slipbox's own installs.

A server written for Node runs on slipbox's own Bun, so you don't need Node. TypeScript's own server is taken only
from the project or slipbox's install, since a `tsc` on your `PATH` may be an older TypeScript with no server.

### Installing servers

A server published on npm that isn't found anywhere is installed the first time a file needs it, into slipbox's own
folder (`~/.local/share/slipbox/tools/`), and a message says so. slipbox installs the version it was built with, from
a lockfile that fixes every package's version and contents, with no install scripts run and nothing installed
globally. When a new slipbox pins a newer version, the server is installed again before it next starts (with
installing off, `slipbox doctor` says it's behind). Those are:
`typescript`, `vtsls`, `eslint`, `biome`, `pyright`, `bash-language-server`, `vscode-json-language-server`,
`vscode-css-language-server`, `vscode-html-language-server`, `yaml-language-server`, `stylelint`, `docker-langserver`
and `intelephense`.

`lsp.auto_install = false` stops installing; a server that's missing is then said once. Installing reaches npm over
the network, so only your own config sets it: a folder's `.slipbox/config.toml` that does is ignored, with a warning
([Privacy](privacy.md)).

The others are native programs, never installed by slipbox: `rust-analyzer`, `gopls`, `lua-language-server`, `taplo`,
`sourcekit-lsp`, `clangd`, `ruby-lsp` and `ruff`. Install them as you would for any editor; a missing one is said once,
and `slipbox doctor` says how to get it. A server slipbox didn't install is yours to update.

`lsp.enabled = false` runs no language server at all.

### `slipbox doctor`

`slipbox doctor` lists each language's servers and linters and where each was found: in your config (`config`), in
the project (`project`), on your `PATH` (`path`), in your install folders (`user-install`) or in slipbox's own installs
(`slipbox`). One not found says that slipbox installs it when it's first needed, or how to get it. It only looks: it
starts nothing and installs nothing.

```text
python
  pyright                      not found: slipbox installs pyright@1.1.414 when it's first needed
rust
  rust-analyzer                path  /usr/bin/rust-analyzer
go
  gopls                        user-install  ~/go/bin/gopls
lua
  lua-language-server          not found: your package manager (brew install lua-language-server)
yaml
  yaml-language-server         not found: slipbox installs yaml-language-server@1.24.0 when it's first needed
  yamllint (linter)            path  /usr/bin/yamllint  (where the project has .yamllint or .yamllint.yaml…)
```

`slipbox doctor <file>` takes one file: its language, its project's top folder, the servers that would serve it there
(the main one first), its linters, and what it would have had but can't find. In a root you don't trust, a warning
says so and what that leaves out, and each server left out is listed as `not run here`, with why. Given a note, it
says slipbox serves no language of it: notes are slipbox's own.

[Troubleshooting](troubleshooting.md) has more on a server that doesn't start.

### When a server fails

A server that crashes is started again and told its files again; one that crashes more than three times in five
minutes is left stopped, and a message says so. One that doesn't start, or doesn't answer in 20 seconds, is said once
with the last thing it printed, and not started again.

### Settings for servers

Servers are set up as Helix sets them up, so a section of Helix's `languages.toml` pastes into your slipbox config:

```toml
[language-server.pyright]
config = { python = { analysis = { typeCheckingMode = "strict" } } }

[[language]]
name = "python"
language-servers = ["pyright", { name = "ruff", only-features = ["diagnostics", "format"] }]
```

- `[language-server.<name>]` changes a server, or adds one: `config` (its settings, merged into slipbox's defaults),
  `command`, `args`, `environment` and `required-root-patterns`.
- `[[language]]` changes a language, or adds one: `name`, `language-servers` (the main one first), `roots`,
  `file-types`, `language-id` and `linters`. A server's entry can take `only-features` or `except-features` to limit
  what it's used for.

A server you add needs only its command and a language for it:

```toml
[language-server.jdtls]
command = "jdtls"

[[language]]
name = "java"
file-types = ["java"]
roots = ["pom.xml", "build.gradle", ".git"]
language-servers = ["jdtls"]
```

`command`, `args` and `environment`, and any server slipbox doesn't build in, are your own config's only: a folder's
`.slipbox/config.toml` comes with whatever you clone, so it may tune a known server's `config` but never name a
program to run ([Configuration](configuration.md) explains the files and their order).

In a root you trust, a project's `.vscode/settings.json` sets its servers' settings too, as VS Code would read it:
over your config's, comments allowed, per-language sections (`"[python]"`) left out. A tool's own config files
(`eslint.config.js`, `ruff.toml`, `pyrightconfig.json`) are the tool's to read; slipbox never restates them.

### Several servers on one file

A file's main server does everything. An add-on, by default, gives its problems, its fixes (code actions) and its
formatting. A question with one answer (hover, a definition) goes to the first server that answers it; references and
code actions come from every server, together.

## What's under the cursor

| Keys | What it does |
| --- | --- |
| `shift+k` | what's under the cursor, in a floating window: its type and documentation, from the server |
| `g d` | go to the definition |
| `g y` | go to the definition of its type |
| `g shift+i` | go to what implements it: an interface's classes, an abstract method's overrides |
| `g r` | its references: every place it's used |

One place opens at once; several are a list, each `file:line` with its line's text, to pick from. A definition outside
the root, in a dependency's types for instance, opens as a file of its own. `esc` or `q` closes the floating window.

In a note these keys work on links: `shift+k` shows where the link under the cursor lands, `g d` follows it and `g r`
lists the note's backlinks ([Links and roots](links-and-roots.md)).

A file with no server says so; `slipbox doctor` says which it would have.

## Renaming, fixing and formatting

- **`space c r`** renames the symbol under the cursor: the server's name for it typed already, then a preview of every
  line it changes in every file, before and after. `enter` makes it; `esc` changes nothing. In a note, the same key
  renames the heading the cursor is under, with every link to it.
- **`space c a`** lists the code actions for the cursor's line: every server's fixes and refactorings, the preferred
  ones first, each with the server it came from. In a note, slipbox's own fixes come first, such as naming a fragile
  link's note for sure.
- **`space c f`** formats the file as its server does, asked to indent as the file is indented: its `.editorconfig`,
  else its own lines, else its language's habit ([Indentation](configuration.md#indentation-editorconfig)).

What a server changes is made in slipbox's buffers, each file's changes one undo step. A file on screen is left
unsaved for you to save; one that isn't is saved at once, so an agent reading the disk sees the change.

## Completion

In insert mode in a code file, the server's completions show under the cursor: at once after a character the server
names (a `.`), else once you've begun a word and paused. Ten show at a time, the best match first, each with its
detail dimmed; typing narrows them, and a space or an operator closes the list. The chosen one goes in with what comes
with it, such as an import at the top of the file. A completion that's a snippet leaves the cursor on its first
placeholder: typing replaces it, and `tab` and `shift+tab` go to the next and previous.

After `(` and `,` the signature of the function being called shows above the cursor, its current parameter marked,
until `)` or leaving insert mode. [Editing](editing.md#completion) has the list's keys, and completion in notes.

## Linters

The linters with a server of their own (ESLint, Biome, stylelint, Ruff) run as add-ons, above. Two linters without a
server are built in, each run only where the project has its config: `hadolint` for Dockerfiles (with
`.hadolint.yaml`) and `yamllint` for YAML (with `.yamllint`). Install them yourself; one that's missing is said once.

You can add any linter that prints its findings a line each. It's described in efm-langserver's keys, so a linter set
up for efm pastes in, and a language's `linters` names it:

```toml
[linter.mypy]
lint-command = "mypy --show-column-numbers --no-error-summary"
lint-stdin = false
lint-formats = ["%f:%l:%c: %trror: %m", "%f:%l:%c: %tarning: %m"]
root-markers = ["mypy.ini", ".mypy.ini"]
require-marker = true

[[language]]
name = "python"
linters = ["mypy"]
```

A linter that reads its input (`lint-stdin = true`, the default) checks the text as you type, half a second after you
pause; one that reads the file (`lint-stdin = false`) checks it after each save. It runs from the nearest folder
holding one of its `root-markers` (with `require-marker`, only where there is one), the project's own copy first in a
root you trust. `lint-formats` are vim's errorformat; [Configuration](configuration.md) has every key. A linter's
`lint-command` is your own config's only.

Notes have their linter too, markdownlint by default ([Editing](editing.md) covers when it runs). `lint.command`, in
your own config, runs another linter on notes instead: a command and its arguments, the files appended, as long as
it prints its findings as markdownlint-cli2 does (`inbox.md:3 MD013/line-length Line length`). `lint.enabled = "off"`
turns off the note linter and the linters without a server; the linters' servers are language servers, which
`lsp.enabled` turns off.

## Problems

A file's problems come from every source alike: its language servers, its linters, slipbox's own syntax check (in source
mode and the code view), and, for a note, slipbox's checks of its links and the note linter's findings. A note's own
problems are a link that reaches nothing (a note not written yet is information; a missing file, a warning) or reaches
several notes, a heading or block a link names that its note hasn't, and git's conflict markers (an error).

Each problem has a severity: error, warning, information or hint. `diagnostics.severity` is the least that shows:
`warning` by default, so a note's links to notes not written yet don't mark every page; `info` shows them too.

A server's or a linter's problems are for the text they were found in: typing hides them until they answer again.

### Where they show

- **Line numbers**: with line numbers on (the default), a line's number takes the colour of its worst problem, bold.
- **The problems bar**: with line numbers off, a column beside the text shows, on the row a line starts on, the sign of
  its worst problem (`✖` error, `⚠` warning, `ℹ` information, `·` hint; with ASCII glyphs `E`, `W`, `I`, `.`), then how
  many there are when more than one (`+` past nine). `diagnostics.bar = "auto"` (the default) gives a file the bar once
  it has had a problem and keeps it, so the text doesn't move as problems come and go; `"on"` always, `"off"` never.
  `space u d` turns it on or off.
- **Marks**: the problem's own text is underlined in its severity's colour. `diagnostics.marks` sets which: `"error"`
  (the default), `"warning"` and up, `"info"` for all, or `"off"`; `space u shift+d` goes through them in turn. A link
  that reaches nothing, or several notes, keeps its own colour whatever the setting.
- **The status line** counts them by severity: `✖ 1  ⚠ 3  ℹ 2`.
- **A code cell's header** counts its own, as its `⚠ n` button.

A click on a sign or a coloured line number opens the Problems panel at that problem; a click on the status line's
count opens it on the file's problems (on the root's, when the file has none).

### The Problems panel

The Problems panel opens across the bottom of the screen ([The screen](screen.md#the-problems-panel) has its keys,
and how to resize it). It has two tabs:

- **This file** (`space n q`): every problem of the file on screen, in order, each with its sign, `line:column`, what's
  wrong and who found it (`markdownlint MD013`, `pyright`), the line's text under it. It opens on the problem at or
  after the cursor. Moving through the list takes the note there and highlights the problem; `enter` goes to it and
  gives the note the keys.
- **All** (`space v p`, `:problems`): what's wrong across the root, in sections that fold: Broken links, Ambiguous
  links, Fragile links, Frontmatter (a note breaking its document type's rules), Lint (the note linter's findings, when
  it runs), Conflicts (during a merge) and Orphans (notes nothing links to). `enter` opens the note at the problem in a
  tab of its own; `o` opens it in this window instead, and `s` in the split. Each opening checks the root again.

In the All tab, `l` and `h` unfold and fold a section, and `/` keeps the problems whose note, line or link matches
what you type. [Links and roots](links-and-roots.md) explains broken, ambiguous and fragile links, and
[Git](git.md#merge-conflicts) conflicts.

### From the command line

`slipbox diagnostics <file>` gives a file's problems from every source, a line each, sorted by place:

```text
$ slipbox diagnostics inbox.md --severity info
inbox.md:12:3: warning slipbox no-heading: no heading "plans" in ideas/coffee.md
inbox.md:14:1: info slipbox unresolved: no note at ideas/tea.md yet
```

It starts the file's servers as the TUI would (installing one from npm first, when that's on), waits until each has
answered and gone quiet, for at most `--timeout` seconds (60), then runs its linters. Syntax errors come from slipbox's
own check when no server answered. For a note, its own problems and the note linter's are included. `--severity` sets
the least shown, `diagnostics.severity` by default. It exits 1 when an error is shown, so a script can stop on one,
and `--json` gives each problem's place, severity, source and message.

`slipbox problems` lists the root's link problems, its orphans and a merge's conflicts, as the All tab does;
`--lint` adds the note linter's findings. [The command line](cli.md) has both in full.

## Trust

Opening a folder never runs code it brings with it, unless you trust it. A repository you clone can hold programs
(`node_modules/.bin`), settings that name programs, build scripts a server would run, and git hooks; in a root you
don't trust, slipbox runs none of them. You trust a root, such as a git repository, and everything in it ([Links and
roots](links-and-roots.md) explains roots).

### What runs anyway

The programs you chose: your editor, git, and the servers and linters named in your config, found on your `PATH`, in
your install folders, or installed by slipbox. Each runs as you set it up.

Trusted or not, a folder's own config never names a program for slipbox to run: `editor.command`, `editor.remote`,
`lint.command`, a server's `command`, `args` and `environment`, a linter's `lint-command`, a server or linter slipbox
doesn't build in, and `[trust]` itself are your own config's only. Nor can a folder bind a key or alias to a command
that runs a program or throws work away ([Configuration](configuration.md) lists them).

### What a root you don't trust leaves out

- **Its programs**: the project's own copies in `node_modules/.bin`, `.venv/bin`, `venv/bin` and `vendor/bin` aren't
  used, for servers and linters alike, nor a program its settings name.
- **Its settings**: a server's settings are its defaults and yours, never the folder's `.slipbox/config.toml` or its
  `.vscode/settings.json`.
- **Servers in a safe mode**: `rust-analyzer` without build scripts, procedural macros or `cargo check`; `gopls`
  without downloading the toolchain a `go.mod` names, and without cgo; `vtsls` never switching to the project's
  TypeScript, and TypeScript 7's server only from slipbox's install; `pyright` given the virtual environment's packages
  without running its Python.
- **Servers not run**, as they can't work without running the project's code: the ESLint and stylelint servers (their
  config is code), `ruby-lsp` where there's a `Gemfile`, `sourcekit-lsp` where there's a `Package.swift`, and
  `lua-language-server` where `.luarc.json` names a plugin.
- **The note linter** skips a note under a markdownlint config that is code (`.cjs`, `.mjs`) or loads code.
- **git** runs none of the repository's hooks, filters or other programs ([Git](git.md#what-slipbox-runs)).

The cost: in a root you don't trust, a Rust project's macros show errors, ESLint finds nothing, the project's own
TypeScript isn't used, and a Ruby or Swift package gets no server.

### Trusting a root

You never edit a file to trust a root. The first time it matters, when a file's servers there would run with
something left out, slipbox asks:

```text
Trust ~/code/app? Its own tools would run code it holds — eslint not run (its config is code). Only a folder you
know (y trusts it; n keeps it safe)
```

`y` trusts it, and its servers start again at once, as they'd run anywhere. `n` or `esc` keeps it safe. Either answer
is kept in slipbox's own state, never in the folder, so it isn't asked again. It asks about the root you opened (one
answer for every project in it), else the file's project; never while you're typing, but after your next key. A folder
of notes alone is never asked.

`:trust` trusts the root of the file on screen, and `:untrust` stops trusting it (in the palette, "Trust this root"
and "Stop trusting this root"). An answer holds for the folders under it, the nearest answer counting.

To trust folders ahead of time, list them in your own config's `trust.roots`:

```toml
[trust]
roots = ["~/code/*", "~/notes"]   # paths, ~, globs; each with what's inside it
```

A root listed there is trusted whatever you answered. A folder's own `[trust]` is ignored: a folder can't trust
itself.

The command line never asks, and has no way to trust a root: an agent could be talked into it. In a root you don't
trust, its commands say what they left out on standard error, and `slipbox doctor` says whether a root is trusted and
what that limits.
