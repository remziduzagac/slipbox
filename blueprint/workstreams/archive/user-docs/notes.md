# Notes: user documentation

## Shape (2026-10-11)

- The user asked to work on the user documentation next, after the reconciliation (root notes.md).
- What exists: the README (101 lines) and three references in `docs/`: the keymap (728 lines), the configuration
  (388) and the CLI (718), with about 150 roadmap IDs between them. No installation guide, no getting started, nothing
  on the concepts (roots, links, named folders, trust), no task guides, no troubleshooting or privacy page.
- **Questions:** 1 the format; 2 the structure; 3 the roadmap and decision IDs in the docs; 4 who comes first.
- 1, format: Markdown in `docs/`, readable on GitHub and in slipbox itself (DOC-D1).
- 2, structure: "guides + manual", the user's own answer between the two offered (guides with the references, or one
  manual): read as task guides plus a manual of chapters, the references becoming chapters (DOC-D2).
- 3, IDs: removed; the blueprint keeps them (DOC-D3).
- 4, audience: people first; the agent skill stays the agents' guide, checked against the docs (DOC-D4).
- The scope (requirements.md § The documents): accepted by the user as proposed, "accept, go ahead". The workstream
  is active, on the roadmap, and split into tasks: a task per reference become a chapter (DOC-T1–DOC-T3), the other
  chapters in pairs by subject (DOC-T4–DOC-T8), the guides in two (DOC-T9, DOC-T10), all written in parallel; then the
  map, the links and the checks (DOC-T11), and the guides tried as written (DOC-T12).

## What writing the docs found in the code (2026-10-11)

The writers checked every claim against the code and tried the CLI on the reference set; the docs say what the code
does now. What they found, for the user to place: bugs become root tasks, disagreements a decision either way.

- **Bugs, where the design is right:**
  - A folder's `.slipbox/config.toml` overrides your `render.images_remote` and `lsp.auto_install`: a cloned folder
    can make slipbox fetch its web pictures, or install from npm, against your own settings (only `update.check` is
    yours alone).
  - The Markdown export copies whatever a picture link names into its `.export.assets/`: a text file, a file outside
    the root.
  - `slipbox export -o` replaces a note of another root without asking (the TUI asks); `-o missing-folder/` writes a
    file named after the folder.
  - `slipbox mv note existing-folder/` (and `space n m`) renames the note beside the folder instead of moving it in.
  - `space n r` on an unsaved note whose file hasn't changed opens the conflict prompt; `esc` then turns autosave off.
  - `slipbox links` drops a slash from a web address (`https:/…`).
  - Two named folders sharing one remote: the qualified pointer is ambiguous, a hosting URL resolves as external, and
    the error names the same repository twice.
  - `init --name x --dry-run` says it would succeed where the run refuses (the name taken).
  - `undo` after an `apply` of a move warns about the path it moved from.
  - `scripts/install-local.sh` writes through a symlink: over a release install, it overwrites the binary.
  - `space c f` always sends `tabSize: 2`, whatever the file's indentation (read, not run).
  - In the code view a path in a comment isn't followed; source mode follows it.
  - The rail's `±` does nothing on a click; help's mouse list is out of date; which-key's `[`, `]`, `z` descriptions
    leave keys out; following a picture link says "images render in a later phase".
  - IDs shown to users: the retired `[rename]` warning (`21.12`), the installer's Windows error (`14.12`).
  - Messages and JSON still say "vault" (`mode: "vault"`, "in this vault"); `themes` says `builtin`, `types`
    `built-in`.
- **Where the code and the design disagree, for the user to decide which is right:**
  - Search's linked scope takes in a worktree a note links into by `@branch` (the design: every scope leaves
    worktrees out).
  - A link to a missing heading opens the note where you left it (the design: at its top); a missing block isn't
    reported.
  - slipbox's own syntax errors show in source mode only, not the code view (code-view.md: both).
  - The session is restored whenever no note is named, `slipbox ~/notes` included (tui.md: without a path only).
  - `SLIPBOX_GLYPHS` replaces only `auto` (rendering.md: it forces the set).
  - lsp.md's server table: no biome for SCSS and Less; `.jsonc` a language of its own; Ruby takes `Gemfile` and
    `Rakefile`; no built-in server for Java or Kotlin.
- **Gaps, for the user:** nothing empties slipbox's trash; the CLI can't make an empty note; while typing, `ctrl+z`,
  `ctrl+y`, `shift`+arrows and the page keys do nothing; a `shift`+arrow selection in source mode isn't one `d` acts
  on; a release can't install the agent skill; a Markdown export's pictures answer `![[name]]` lookups; Obsidian's
  `==highlight==` and `%%comment%%` show as typed.
- **Stale text:** `examples/vault/about-this-vault.md`, `examples/home/CASES.md` and the reference set's
  `link-styles.md` say Mermaid and maths show as code, and wikilinks are plain text in `notes/`.
- **On the user's machine,** from the writers' tries: a `slipbox send` opened a scratch copy of a note in the user's
  nvim, and an export made `~/Desktop/coffee.docx`. Screenshots: offered, the user to say.
- (2026-10-11) Settled item by item by the user, and taken up in the workstream DF (`workstreams/doc-findings/`).
