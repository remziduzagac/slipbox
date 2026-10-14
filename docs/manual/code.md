# Code

slipbox opens code as well as notes. This chapter covers how it shows code, the language servers and linters behind
it, the problems they find, and trust.

In most languages, slipbox draws a code file as a document to read like a note:

- each definition in a cell of its own
- its documentation as prose
- its imports folded away

A key away is the file as written, in source mode.

Behind both, slipbox talks to the language servers and linters you'd use in an editor. It asks them for the file's
problems, what's under the cursor, jumps, renames and completion.

Last comes trust: a folder's own code never runs unless you say so.

The examples use a project in `~/code/app`. It's a git repository, with its code in `src/` and its notes in `docs/`.

## The code view

A code file opens in the code view when slipbox maps its language. The languages it maps are TypeScript, TSX,
JavaScript (JSX too), Python, Go, Rust, Swift, PHP, Ruby, C, C++, Lua and Bash.

Other code opens in source mode: HTML, CSS, SCSS, Dockerfiles, and Vue, Svelte and Astro components.

| Key or setting | What it does |
| --- | --- |
| `space n v` | Switches the file on screen between the code view and source mode |
| `render.code = "source"` | Opens all code in source mode ([Configuration](configuration.md)) |

Take this TypeScript file, `src/shelf.ts`:

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

In a narrow window, slipbox draws it like this:

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

Every token of code is drawn as it's written. Nothing is replaced, reordered or hidden for good. What the view changes
is what's around the tokens:

- where a long line breaks
- blank rows
- boxes
- dimming
- indent guides

Line numbers stay the file's. Copying a selection copies the file's text, never the rows as drawn.

### Cells

Each definition is a cell. A definition is a function, a class, a method, a type, an interface, a struct, an enum, a
trait or an impl, as the language calls it.

A cell's header says what it is, in its language's word: `function: readNote`, `struct: Frame` or `impl: Stacker`.
The header then shows the cell's lines and its buttons.

A class is a cell of its head. Each member is a cell of its own under it, joined to it by tree lines. The class's
closing brace comes where the file has it.

Other statements are cells too, such as top-level values or a script's lines. Each run of them is titled by the names
it defines (`• limit`), or else `code`.

Cells are boxes by default. `render.code_cells = "band"` draws each on a tinted band instead. `space u c` switches
between the two.

### Documentation and comments

A definition's documentation is drawn as prose at the top of its cell. Then comes a list of its terms:

- each parameter
- what it returns, yields or raises
- any other tags

The comment markers are dropped.

slipbox reads the usual conventions:

- JSDoc, Javadoc, PHPDoc and Doxygen comments
- LuaDoc
- Python docstrings in Google, NumPy or reStructuredText style

Comment lines right above a definition document it, as Go writes them.

A Python docstring is written below its `def`. slipbox draws it at the top of its cell, like every other language's
documentation, so a page reads the same whatever language wrote it. That is the one place the view changes the order
of the file's lines.

Other comments are prose too:

- A comment that documents nothing, such as a file's opening note, is a box of its own marked `¶`.
- A comment after code on the same line is a note beside it, in the comments' colour.

Two kinds of comment stay as written:

- comments for tools: a shebang, `eslint-disable`, `@ts-ignore`, `noqa`, `# type: ignore`
- code commented out

### Imports, licences and sections

- **Imports**: the file's run of imports is one row, `▸ imports`. The row names the modules and how many there are.
  `enter` on it opens it, and folds it again.
- **A licence or a generated file's banner** at the top of the file is one row too. A licence's row looks like
  `▸ license · MIT`, naming it by its SPDX id, else by its words. A banner's row looks like
  `▸ generated · protoc-gen-go`. `enter` opens and folds it.
- **Sections**: a separator comment is a rule across the page, with its title. Separators look like
  `// ---- Reading notes ----`, `# === Setup ===`, `// MARK: Setup` or `#region Setup`. Sections head the outline and
  the breadcrumb, with the definitions under them.

### Long lines

A line too long for its cell breaks at its structure:

- after an opening bracket or a comma
- before `&&`, `||` or `?`
- before a `.` that chains

The rest of the line goes four columns further in.

A definition whose signature doesn't fit gets a parameter a row, as `readNote` does above. A line that fits is never
broken. Lines are never joined.

With wrapping off (`space u w`), lines run on and the view scrolls sideways.

### A cell's buttons and keys

Each button in a cell's header is a key too. It acts on the cell at the cursor. Click the button or press the key:

| Button | Keys | What it does |
| --- | --- | --- |
| `▾` / `▸` | `space k f`, `z a` | Folds the cell to its header (a class with its members), or opens it |
| `✎` | `space k e` | Edits the cell: the lens on all its lines |
| `⧉` | `space k y` | Copies its lines, as the file has them |
| `⇢` | `space k r` | Shows where its definition is used, from its language server |
| `⚠ n` | `space k p` | Shows its problems, in the Problems panel. The button shows when the cell has some |
| `◎` | `space k s` | Adds it to the scratch, with its path and lines, for an agent |

A cell folds whole. You can't fold part of one, such as an `if` or a loop.

### Moving and editing

The cursor moves over the text of the cells, never their borders. The one exception is a folded cell's header, its one
row, where `z a` opens it again.

The outline (`space o`) and the breadcrumb list the definitions, as in source mode. `] ]` and `[ [` move from one to
the next.

Editing works as in a rendered note. [Editing](editing.md) has the lens and source mode.

| Keys | What it does |
| --- | --- |
| The editing keys (`i`, `a`, `o`…) | Open the lens on the cursor's cell. Then the key types there |
| `space n l` | Opens the lens too |
| `space k e` | Opens the lens on a whole cell, however tall |
| `esc esc` | Closes the lens. The cell is drawn again |

The lens shows the cell's lines as written, highlighted, with the code view around it.

With `editor.edit_in = "source"`, the editing keys switch the window to source mode, and type there instead.

## Source mode for code

In source mode, a code file is the file as written, highlighted by its language.

slipbox parses these languages itself: TypeScript, TSX, JavaScript, Python, Bash, Lua, Go, Rust, Swift, PHP, Ruby, C,
C++, HTML, CSS, SCSS, Dockerfiles, and Vue, Svelte and Astro components. Others are highlighted line by line.

For a language it parses, slipbox gives the file an outline and a check for syntax errors.

**An outline**: the file's definitions, nested as they are, in the outline (`space o`) and the breadcrumb. `] ]` and
`[ [` move between them. The definitions are:

- functions, classes, methods, types and the like
- a Dockerfile's stages
- a stylesheet's rules and `@media` blocks
- a page's headings and ids

A component's parts are each an entry, coloured in their own language. These parts are a Vue file's template, script
and style, or a page's `<script>`.

A file slipbox can't outline itself takes its language server's outline, when it has a server.

**Syntax errors**: where the parser finds an error, the text is underlined. The error is counted among the file's
problems, described below. It's counted here and in the code view, where a cell's header counts its own.

Syntax errors are checked as you pause typing. They show once you leave insert mode, since a half-typed line is always
broken. Once a language server has answered, its own errors take their place.

## Links in code

In source mode, these are links in a code file, and `enter` follows them:

- a URL
- a path with an extension that names a file of the vault

A path is read from the file's folder, else from the vault's top. A leading `/` is the vault's top. `:42` after a path
opens that line, as in `./retry.ts:12`.

Paths count in comments and in strings, so you can follow an import's path too.

The code view draws a comment's paths as links too, beside its URLs and Markdown links. `enter` follows them as in
source mode.

Code has no wikilinks.

A path in a comment counts as a backlink of the file it names. Moving or renaming that file rewrites the path, as it
does a note's links ([Links and vaults](links-and-vaults.md)).

## Language servers

A language server is the program an editor asks about code. VS Code, Neovim and Helix use the same ones.

slipbox asks them for:

- a file's problems
- what's under the cursor
- definitions and references
- renames
- fixes
- formatting
- completion

A server starts when a file of its language is first shown. It's told about the file as you type, after a short pause,
never at each key. It's told again when you save. It stops when you quit.

### Which servers

Each language has a main server. Where the project has their config, it has add-ons too. An add-on is a linter's
server, run beside the main one.

These are built in:

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

For TypeScript, the server depends on the project's TypeScript:

- TypeScript 7 has its server built in. It's used where the project's TypeScript is 7, or where there is none.
- `vtsls` brings its own TypeScript. It's used where the project's TypeScript is older.

An add-on runs only where the project has its config:

| Add-on | Runs where the project has |
| --- | --- |
| `eslint` | an ESLint config |
| `biome` | `biome.json` |
| `stylelint` | a stylelint config |
| `ruff` | `ruff.toml`, or a `[tool.ruff]` table in `pyproject.toml` |

Each add-on loads the project's own setup, so slipbox, your editor and your CI agree.

A language with no server built in, such as Java, Kotlin or Zig, gets one when you set it up. See
[Settings for servers](#settings-for-servers), below.

### Where slipbox finds them

A server runs in its project's top folder. That's the nearest folder above the file holding the language's first
project marker (its `roots`), but never `~` or `/`. If there's none, it's the file's own folder. For TypeScript, the
markers are `tsconfig.json`, then `package.json`, then `.git`.

slipbox looks for the server's program in this order:

1. the path your config gives it, when its `command` is a full path
2. the project's own copy, in `node_modules/.bin`, `.venv/bin`, `venv/bin` or `vendor/bin`, but only in a vault you
   trust
3. your `PATH`
4. the folders you install tools into: Mason's `bin` (Neovim's installer), `~/.cargo/bin`, `~/go/bin`, `~/.local/bin`
5. slipbox's own installs

A server written for Node runs on slipbox's own Bun, so you don't need Node.

TypeScript's own server is taken only from the project or slipbox's install. That's because a `tsc` on your `PATH` may
be an older TypeScript, with no server.

### Installing servers

slipbox installs a server published on npm when it isn't found anywhere. It does so the first time a file needs it,
into slipbox's own folder (`~/.local/share/slipbox/tools/`), and a message says so.

These are the servers slipbox installs: `typescript`, `vtsls`, `eslint`, `biome`, `pyright`, `bash-language-server`,
`vscode-json-language-server`, `vscode-css-language-server`, `vscode-html-language-server`, `yaml-language-server`,
`stylelint`, `docker-langserver` and `intelephense`.

slipbox installs the version it was built with:

- from a lockfile that fixes every package's version and contents
- with no install scripts run
- with nothing installed globally

When a new slipbox pins a newer version, the server is installed again before it next starts. With installing off,
`slipbox doctor` says the server is behind.

`lsp.auto_install = false` stops installing. slipbox then says once that a server is missing.

Installing reaches npm over the network, so only your own config sets it. A folder's `.slipbox/config.toml` that sets
it is ignored, with a warning ([Privacy](privacy.md)).

The others are native programs, and slipbox never installs them: `rust-analyzer`, `gopls`, `lua-language-server`,
`taplo`, `sourcekit-lsp`, `clangd`, `ruby-lsp` and `ruff`.

Install them as you would for any editor. If one is missing, slipbox says so once, and `slipbox doctor` says how to get
it. A server slipbox didn't install is yours to update.

`lsp.enabled = false` runs no language server at all.

### `slipbox doctor`

`slipbox doctor` lists each language's servers and linters, and where each was found:

| Shown | Where it was found |
| --- | --- |
| `config` | In your config |
| `project` | In the project |
| `path` | On your `PATH` |
| `user-install` | In your install folders |
| `slipbox` | In slipbox's own installs |

For one not found, it says that slipbox installs it when it's first needed, or how to get it.

`slipbox doctor` only looks. It starts nothing and installs nothing.

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

`slipbox doctor <file>` takes one file. It shows:

- its language
- its project's top folder
- the servers that would serve it there, the main one first
- its linters
- what it would have had but can't find

In a vault you don't trust, a warning says so, and what that leaves out. Each server left out is listed as
`not run here`, with why.

Given a note, `slipbox doctor` says slipbox serves no language of it. Notes are slipbox's own.

[Troubleshooting](troubleshooting.md) has more on a server that doesn't start.

### When a server fails

A server that crashes is started again, and told its files again. If it crashes more than three times in five minutes,
it's left stopped, and a message says so.

If a server doesn't start, or doesn't answer in 20 seconds, slipbox says so once, with the last thing it printed. The
server isn't started again.

### Settings for servers

Servers are set up as Helix sets them up. So a section of Helix's `languages.toml` pastes into your slipbox config:

```toml
[language-server.pyright]
config = { python = { analysis = { typeCheckingMode = "strict" } } }

[[language]]
name = "python"
language-servers = ["pyright", { name = "ruff", only-features = ["diagnostics", "format"] }]
```

- `[language-server.<name>]` changes a server, or adds one. Its keys are `config` (its settings, merged into slipbox's
  defaults), `command`, `args`, `environment` and `required-root-patterns`.
- `[[language]]` changes a language, or adds one. Its keys are `name`, `language-servers` (the main one first),
  `roots`, `file-types`, `language-id` and `linters`. A server's entry can take `only-features` or `except-features`,
  to limit what it's used for.

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

Only your own config can set `command`, `args` and `environment`, or name any server slipbox doesn't build in. A
folder's `.slipbox/config.toml` comes with whatever you clone. So it may tune a known server's `config`, but it never
names a program to run. [Configuration](configuration.md) explains the files and their order.

In a vault you trust, a project's `.vscode/settings.json` sets its servers' settings too, as VS Code would read it:

- over your config's settings
- comments allowed
- per-language sections (`"[python]"`) left out

A tool's own config files, such as `eslint.config.js`, `ruff.toml` and `pyrightconfig.json`, are the tool's to read.
slipbox never restates them.

### Several servers on one file

A file's main server does everything. By default, an add-on gives:

- its problems
- its fixes (code actions)
- its formatting

A question with one answer, such as hover or a definition, goes to the first server that answers it. References and
code actions come from every server, together.

## What's under the cursor

These keys ask about what's under the cursor:

| Keys | What it does |
| --- | --- |
| `shift+k` | Shows what's under the cursor in a floating window: its type and documentation, from the server |
| `g d` | Goes to the definition |
| `g y` | Goes to the definition of its type |
| `g shift+i` | Goes to what implements it: an interface's classes, an abstract method's overrides |
| `g r` | Lists its references: every place it's used |

One place opens at once. Several places are a list to pick from, each `file:line` with its line's text.

A definition outside the vault, in a dependency's types for instance, opens as a file of its own.

`esc` or `q` closes the floating window.

In a note, these keys work on links ([Links and vaults](links-and-vaults.md)):

- `shift+k` shows where the link under the cursor lands.
- `g d` follows it.
- `g r` lists the note's backlinks.

A file with no server says so. `slipbox doctor` says which server it would have.

## Renaming, fixing and formatting

- **`space c r`** renames the symbol under the cursor. The server's name for it is typed already. Then you see a
  preview of every line it changes in every file, before and after. `enter` makes the change, and `esc` changes
  nothing. In a note, the same key renames the heading the cursor is under, with every link to it.
- **`space c a`** lists the code actions for the cursor's line. These are every server's fixes and refactorings, the
  preferred ones first, each with the server it came from. In a note, slipbox's own fixes come first, such as naming a
  fragile link's note for sure.
- **`space c f`** formats the file as its server does. The server is asked to indent as the file is indented: by its
  `.editorconfig`, else by its own lines, else by its language's habit
  ([Indentation](configuration.md#indentation-editorconfig)).

What a server changes is made in slipbox's buffers. Each file's changes are one undo step.

- A file on screen is left unsaved, for you to save.
- A file that isn't on screen is saved at once, so an agent reading the disk sees the change.

## Completion

In insert mode in a code file, the server's completions show under the cursor. They show:

- at once, after a character the server names, such as a `.`
- else once you've begun a word and paused

Ten show at a time, the best match first, each with its detail dimmed. Typing narrows them. A space or an operator
closes the list.

The chosen one goes in with what comes with it, such as an import at the top of the file.

A completion that's a snippet leaves the cursor on its first placeholder. Typing replaces it. `tab` and `shift+tab` go
to the next and previous placeholder.

After `(` and `,`, the signature of the function being called shows above the cursor, with its current parameter
marked. It stays until `)`, or until you leave insert mode.

[Editing](editing.md#completion) has the list's keys, and completion in notes.

## Linters

The linters with a server of their own (ESLint, Biome, stylelint, Ruff) run as add-ons, as described above.

Two linters without a server are built in. Each runs only where the project has its config:

| Linter | Checks | Runs where the project has |
| --- | --- | --- |
| `hadolint` | Dockerfiles | `.hadolint.yaml` or `.hadolint.yml` |
| `yamllint` | YAML | `.yamllint`, `.yamllint.yaml` or `.yamllint.yml` |

Install them yourself. If one is missing, slipbox says so once.

You can add any linter that prints its findings a line each. You describe it in efm-langserver's keys, so a linter set
up for efm pastes in. A language's `linters` names it:

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

When a linter checks depends on what it reads:

- A linter that reads its input (`lint-stdin = true`, the default) checks the text as you type, half a second after
  you pause.
- A linter that reads the file (`lint-stdin = false`) checks it after each save.

A linter runs from the nearest folder holding one of its `root-markers`. With `require-marker`, it runs only where
there is one. In a vault you trust, the project's own copy comes first.

`lint-formats` are vim's errorformat. [Configuration](configuration.md) has every key.

Only your own config can set a linter's `lint-command`.

Notes have their linter too, markdownlint by default. [Editing](editing.md) covers when it runs.

`lint.command`, in your own config, runs another linter on notes instead. It takes a command and its arguments, and
the files are appended. The linter must print its findings as markdownlint-cli2 does
(`inbox.md:3 MD013/line-length Line length`).

`lint.enabled = "off"` turns off the note linter and the linters without a server. The linters' servers are language
servers, which `lsp.enabled` turns off.

## Problems

A file's problems come from every source alike:

- its language servers
- its linters
- slipbox's own syntax check, in source mode and the code view
- for a note, slipbox's checks of its links, and the note linter's findings

A note's own problems are these:

- A link that reaches nothing. A link to a note not written yet is information, and one to a missing file is a
  warning.
- A link that reaches several notes.
- A heading or block a link names that its note hasn't.
- git's conflict markers, which are an error.

Each problem has a severity: error, warning, information or hint.

`diagnostics.severity` is the least severity that shows. It's `warning` by default, so a note's links to notes not
written yet don't mark every page. `info` shows them too.

A server's or a linter's problems are for the text they were found in. So typing hides them until they answer again.

### Where they show

- **Line numbers**: with line numbers on (the default), a line's number takes the colour of its worst problem, in
  bold.
- **The problems bar**: with line numbers off, a column beside the text shows the sign of a line's worst problem. The
  sign is on the row the line starts on. After it comes how many problems there are, when more than one (`+` past
  nine).
- **Marks**: the problem's own text is underlined in its severity's colour.
- **The status line** counts them by severity: `✖ 1  ⚠ 3  ℹ 2`.
- **A code cell's header** counts its own, as its `⚠ n` button.

The bar's signs are these:

| Severity | Sign | With ASCII glyphs |
| --- | --- | --- |
| Error | `✖` | `E` |
| Warning | `⚠` | `W` |
| Information | `ℹ` | `I` |
| Hint | `·` | `.` |

`diagnostics.bar` sets when a file has the bar:

| `diagnostics.bar` | The bar |
| --- | --- |
| `"auto"` (the default) | Shows once the file has had a problem, and stays |
| `"on"` | Always shows |
| `"off"` | Never shows |

With `diagnostics.bar = "auto"`, the text doesn't move as problems come and go. `space u d` turns the bar on or off.

`diagnostics.marks` sets which problems are underlined. `space u shift+d` goes through its values in turn:

| `diagnostics.marks` | Underlines |
| --- | --- |
| `"error"` (the default) | Errors |
| `"warning"` | Warnings and up |
| `"info"` | All |
| `"off"` | None |

A link that reaches nothing, or several notes, keeps its own colour whatever the setting.

A click on a sign or a coloured line number opens the Problems panel at that problem. A click on the status line's
count opens it on the file's problems, or on the vault's when the file has none.

### The Problems panel

The Problems panel opens across the bottom of the screen. [The screen](screen.md#the-problems-panel) has its keys, and
how to resize it.

It has two tabs, **This file** and **All**.

**This file** (`space n q`) lists every problem of the file on screen, in order. Each problem shows:

- its sign
- `line:column`
- what's wrong
- who found it (`markdownlint MD013`, `pyright`)
- the line's text, under it

The tab opens on the problem at or after the cursor. Moving through the list takes the note there and highlights the
problem. `enter` goes to it and gives the note the keys.

**All** (`space v p`, `:problems`) shows what's wrong across the vault, in sections that fold:

- Broken links
- Ambiguous links
- Fragile links
- Frontmatter: a note breaking its document type's rules
- Lint: the note linter's findings, when it runs
- Conflicts: during a merge
- Orphans: notes nothing links to

Each time the All tab opens, it checks the vault again. In the All tab:

| Key | What it does |
| --- | --- |
| `enter` | Opens the note at the problem, in a tab of its own |
| `o` | Opens it in this window instead |
| `s` | Opens it in the split |
| `l` and `h` | Unfold and fold a section |
| `/` | Keeps the problems whose note, line or link matches what you type |

[Links and vaults](links-and-vaults.md) explains broken, ambiguous and fragile links. [Git](git.md#merge-conflicts)
explains conflicts.

### From the command line

`slipbox diagnostics <file>` gives a file's problems from every source, a line each, sorted by place:

```text
$ slipbox diagnostics inbox.md --severity info
inbox.md:12:3: warning slipbox no-heading: no heading "plans" in ideas/coffee.md
inbox.md:14:1: info slipbox unresolved: no note at ideas/tea.md yet
```

It works in this order:

1. It starts the file's servers as the TUI would. When installing is on, it installs one from npm first.
2. It waits until each server has answered and gone quiet, for at most `--timeout` seconds (60).
3. It runs the file's linters.

Syntax errors come from slipbox's own check when no server answered. For a note, its own problems and the note
linter's are included.

- `--severity` sets the least severity shown. It's `diagnostics.severity` by default.
- `--json` gives each problem's place, severity, source and message.

It exits 1 when an error is shown, so a script can stop on one.

`slipbox problems` lists the vault's link problems, its orphans and a merge's conflicts, as the All tab does. `--lint`
adds the note linter's findings. [The command line](cli.md) has both commands in full.

## Trust

Opening a folder never runs code it brings with it, unless you trust it. A repository you clone can hold:

- programs (`node_modules/.bin`)
- settings that name programs
- build scripts a server would run
- git hooks

In a vault you don't trust, slipbox runs none of them.

You trust a vault, such as a git repository, and everything in it. [Links and vaults](links-and-vaults.md) explains
vaults.

### What runs anyway

The programs you chose run anyway:

- your editor
- git
- the servers and linters named in your config, found on your `PATH`, in your install folders, or installed by
  slipbox

Each runs as you set it up.

Trusted or not, a folder's own config never names a program for slipbox to run. Only your own config can set these:

- `editor.command` and `editor.remote`
- `lint.command`
- a server's `command`, `args` and `environment`
- a linter's `lint-command`
- a server or linter slipbox doesn't build in
- `[trust]` itself

Nor can a folder bind a key or alias to a command that runs a program or throws work away
([Configuration](configuration.md) lists them).

### What a vault you don't trust leaves out

- **Its programs**: the project's own copies in `node_modules/.bin`, `.venv/bin`, `venv/bin` and `vendor/bin` aren't
  used, for servers and linters alike. Nor is a program its settings name.
- **Its settings**: a server's settings are its defaults and yours. They're never the folder's `.slipbox/config.toml`
  or its `.vscode/settings.json`.
- **Servers in a safe mode**:
  - `rust-analyzer` runs without build scripts, procedural macros or `cargo check`.
  - `gopls` runs without downloading the toolchain a `go.mod` names, and without cgo.
  - `vtsls` never switches to the project's TypeScript. TypeScript 7's server is taken only from slipbox's install.
  - `pyright` is given the virtual environment's packages, without running its Python.
- **Servers not run**, as they can't work without running the project's code:
  - the ESLint and stylelint servers, since their config is code
  - `ruby-lsp`, where there's a `Gemfile`
  - `sourcekit-lsp`, where there's a `Package.swift`
  - `lua-language-server`, where `.luarc.json` names a plugin
- **The note linter** skips a note under a markdownlint config that is code (`.cjs`, `.mjs`) or loads code.
- **git** runs none of the repository's hooks, filters or other programs ([Git](git.md#what-slipbox-runs)).

This has a cost. In a vault you don't trust:

- a Rust project's macros show errors
- ESLint finds nothing
- the project's own TypeScript isn't used
- a Ruby or Swift package gets no server

### Trusting a vault

You never edit a file to trust a vault. slipbox asks the first time it matters, when a file's servers there would run
with something left out:

```text
Trust ~/code/app? Its own tools would run code it holds — eslint not run (its config is code). Only a folder you
know (y trusts it; n keeps it safe)
```

- `y` trusts it. Its servers start again at once, as they'd run anywhere.
- `n` or `esc` keeps it safe.

Either answer is kept in slipbox's own state, never in the folder, so it isn't asked again.

slipbox asks about the vault you opened, with one answer for every project in it. Else it asks about the file's
project. It never asks while you're typing, but after your next key. A folder of notes alone is never asked.

| Command | In the palette | What it does |
| --- | --- | --- |
| `:trust` | "Trust this vault" | Trusts the vault of the file on screen |
| `:untrust` | "Stop trusting this vault" | Stops trusting it |

An answer holds for the folders under it. The nearest answer counts.

To trust folders ahead of time, list them in your own config's `trust.roots`:

```toml
[trust]
roots = ["~/code/*", "~/notes"]   # paths, ~, globs; each with what's inside it
```

A vault listed there is trusted whatever you answered. A folder's own `[trust]` is ignored, since a folder can't trust
itself.

The command line never asks, and has no way to trust a vault, since an agent could be talked into it. In a vault you
don't trust, its commands say on standard error what they left out. `slipbox doctor` says whether a vault is trusted,
and what that limits.
