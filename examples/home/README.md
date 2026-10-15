# home — a developer's home folder

The reference set: one person's notes, work repositories and hobbies, written to exercise every feature of slipbox
in realistic use, each case in several variations. `CASES.md` lists every case and the file that covers it.
Built for tests (`scripts/build-home.ts <dir>`), the copy is used as `$HOME`.

## The person

**Sam Rivera** — staff engineer and product lead at **Kestrel Labs**, a small company building **Kestrel**, a
route-planning app for cyclists (web app, API, a route engine). Sam rides, cooks, photographs, and volunteers on
outreach nights at the **Halden Ridge Observatory** (`../vault`, the demo vault, a sibling of this folder).

Notes are Sam's, in the first person; documents in the repositories are team documents, in the team's voice.

**Timeline:** 2026-08-15 to 2026-10-06 ("today" in the set). Q3 ends, Q4 OKRs are set, Kestrel **2.3** ships on
2026-09-30 (route sharing, the offline sync rewrite), an incident on 2026-09-22 (the sync queue stalled), a
Kyoto photo trip 2026-08-22 to 2026-08-30, a 300 km brevet on 2026-09-13.

## The cast

Each has a note in `notes/people/`, with the aliases given.

| Who | Aliases | Role | Shows up in |
| --- | --- | --- | --- |
| Priya Nair | Priya | engineering manager | 1:1s, OKRs, hiring, the incident review |
| Tomás Ruiz | Tomás, Tomas | product designer | PRDs, design reviews, route-sharing UI |
| Aiko Tanaka | Aiko | backend engineer | the sync rewrite; the Kyoto trip (Japanese captions) |
| Malik Haddad | Malik | data and infrastructure | the incident, the infra repo; his family's maqluba (Arabic) |
| Jo Becker | Jo | customer success | feedback synthesis, release notes, support escalations |
| Dr. Lena Okafor | Lena | Halden outreach coordinator | outreach nights (links into `../vault`) |

## Layout and roots

```text
home/
  README.md  CASES.md
  todo.md         no marker — home's own: a vault without one, its notes those no other vault holds
  household/      no marker — home's too: a note linking back to todo.md, found by home's walk
  notes/          .slipbox/ named "notes" — the knowledge base, synced, no git; relative markdown links
    index.md  inbox.md
    daily/        YYYY-MM-DD.md daily notes: tasks, meetings, links everywhere
    weekly/       YYYY-Www.md weekly reviews
    meetings/     1:1s, design reviews, standups, a long all-hands archive
    people/  projects/  reading/  research/  templates/  attachments/
  work/
    kestrel/      git, origin git@github.com:kestrel-labs/kestrel.git — the app: TS/TSX web app (src/),
                  Python API (api/), Go tool (tools/), Rust route engine (crates/), bash and Lua (scripts/),
                  docs/ (ADRs, architecture, runbooks), configs and data files at its top
    product/      git, origin git@github.com:kestrel-labs/product.git — PRDs, roadmap, OKRs, release plans,
                  research synthesis; GitHub-style docs: relative links and "/" links from the repository's root
    infra/        git, origin git@github.com:kestrel-labs/infra.git — k8s YAML (multi-document), TOML, INI,
                  .env files, scripts
  hobbies/
    cooking/      .obsidian/ — an Obsidian vault: wikilinks (by name, path, alias, heading, block), embedded
                  photos, recipes, a meal plan, pantry.csv, Malik's family maqluba (مقلوبة)
    cycling/      .zk/ — a zk notebook: id-slug file names, markdown links without extensions, "/" from the
                  notebook's root; rides, routes (GeoJSON), gear, maintenance, rides.csv
    photography/  .slipbox/ named "photography", no git — gear comparisons, EXIF exports, photo walks, the Kyoto
                  trip (京都; captions in Japanese), images
  Downloads/      no marker — exported transcripts, a CSV, a stray note, a PDF: the casual folder, home's, its
                  skip list leaving it out of home's index
  .build/         how the build makes the git histories and the files that can't be committed (below)
../vault/         halden, the demo vault — linked from here by relative paths (../../../vault/…)
```

## Writing rules

- **Realistic.** Every case appears where a person like Sam would really write it: a wide table because a capacity
  plan is wide, a footnote because a reading note cites a page. No lorem ipsum, no "test case" headings.
- **Fictional.** No real people or companies; well-known places, open-source tools and file formats are fine.
- **Consistent.** Names, aliases, dates and facts as above, and as other files state them.
- **Every case a file is meant to cover is concretely there,** each variation its own instance.
- **Markdown is wrapped at 120 columns** — except where a case needs otherwise (an overlong table row, a long code
  line, an unwrapped paragraph): then the file's purpose in `CASES.md` says so.
- **Links follow each root's convention:** `notes/` and `photography/` relative markdown paths; `cooking/`
  wikilinks; `cycling/` zk's extensionless links; the repositories GitHub's (relative, and `/` from the
  repository's root). Between roots: relative paths, and some `slipbox://<name>/<path>` pointers (the 21.x design:
  `notes`, `photography`, `kestrel`, `product`, `infra`, `halden`). A broken link is there on purpose, and written
  as it would naturally break (a note not written yet, a file since moved).
- **Binary files** (images, a PDF) are small and valid, made with a script, never copied from elsewhere.

## The build: `.build/`

`scripts/build-home.ts <dir>` copies `home/` to `<dir>/home` and halden to `<dir>/vault`, then:

- **Git histories** — one file per repository, `.build/<repo>.toml`, replayed with `git` in order:

  ```toml
  remote = "git@github.com:kestrel-labs/kestrel.git"

  [[commit]]
  branch = "main"                          # created from the branch it's first used on, else from main
  from = "main"                            # for a branch's first commit: where it starts (default: main)
  date = "2026-08-17T10:12:00+02:00"
  author = "Sam Rivera <sam@kestrel.dev>"
  message = "Route engine: first draft of the A* search"
  add = ["crates/route-engine/src/lib.rs"]          # as the file is in home/ (its final state on main)
  write = { "docs/routing.md" = "…the text it had then…" }   # a file's earlier content, given here
  rename = { "docs/routing.md" = "docs/routing/overview.md" }
  delete = ["docs/old-notes.md"]

  [[commit]]
  branch = "main"
  date = "2026-09-29T17:40:00+02:00"
  author = "Priya Nair <priya@kestrel.dev>"
  message = "Merge branch 'feature/route-sharing'"
  merge = "feature/route-sharing"          # a merge commit: that branch into this one

  [[worktree]]
  branch = "agent/sync-retry"
  path = "../kestrel-agent-sync-retry"
  ```

  A commit's changes apply in this order: `rename`, then `write`, `add`, `delete`. After the last commit on `main`,
  its tree equals the folder in `home/`; the build checks it. Files of the folder no commit adds stay untracked (a
  local `.env`, an ignored folder).
- **Files that can't be committed** — `.build/extras.toml`: hostile file names (a bidi override, control
  characters), a symlink, a file too big to index, an unreadable file, each with where it goes and why:

  ```toml
  [[file]]
  path = "Downloads/invoice\u202Efdp.md"   # TOML escapes allowed: a right-to-left override in the name
  kind = "file"                              # file (default) | symlink | big | unreadable
  content = "# Invoice\n"
  why = "a bidi override in a file name never reaches the terminal"

  [[file]]
  path = "notes/projects/kestrel-current.md"
  kind = "symlink"
  target = "kestrel-v2-3.md"                 # relative to the link's folder, or absolute
  why = "a symlinked note inside the root"

  [[file]]
  path = "notes/research/gps-traces.md"
  kind = "big"
  size = 6000000                             # bytes; over walk.max_file_size (4 MiB)
  why = "listed as skipped, never parsed"
  ```
