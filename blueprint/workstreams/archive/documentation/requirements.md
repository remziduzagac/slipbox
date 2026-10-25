# Requirements

Requirements for the agreed documentation work. The parent's requirements remain unchanged until consolidation.

## Goals

- A newcomer can install slipbox and complete one useful read/edit/save session without an agent or prior vim use.
- The first guide is **Working with Slipbox**. Working with agents remains prominent as a later workflow.
- Readers can distinguish a guided task, a feature explanation and an exhaustive lookup without opening each page.
- Each subject has one authoritative explanation; guides demonstrate it and link to the explanation or reference.
- Existing capabilities remain discoverable: notes, code, links, vaults, scratch/context, git, export, customization
  and CLI.
- The website, repository docs map and README offer a consistent route into the same Markdown content.

## Non-goals

- Changing product behavior, the engine, key bindings or the UI.
- Replacing Starlight, generating prose, reducing functionality or requiring new documentation tooling.
- Treating the engine's proposed socket, plugin or unsaved-buffer interfaces as shipped functionality.
- Screenshot capture or regeneration while the text changes; it follows as a task of its own (DOCS-D3, DOCS-T2).

## Builds on

- Root requirements.md § Documentation: Markdown as the source, guides and complete manual/reference, familiar keys,
  screenshots, no blueprint IDs in user docs, and updates with behavior changes.
- Root design/distribution.md § The documentation site: `docs/README.md` determines navigation; Starlight gathers
  content from `docs/`, with search and link checks.
- Root design/repository.md § The repository's documents: distinct audiences for user and maintainer documents.
- DOC-D1–DOC-D4 and DS-D1–DS-D6: existing documentation scope and publishing/writing practices.

## Acceptance criteria

- The agreed tree identifies a first-use route and every major existing subject has a home in its coverage map.
- A newcomer can follow Quick start and Working with Slipbox as written, with a clean disposable folder and only
  the prerequisites named in each guide.
- Representative reader questions in design.md each have one obvious first destination, without search.
- Every moved page/anchor has an explicit compatibility plan; existing URLs do not silently become dead links.
- The website's navigation and previous/next order match the docs map, with no duplicated page pretending to be
  different content; tutorials have explicit next steps.
- Settings, commands and key references keep their existing completeness tests when split or moved.
- Markdown, links and documentation tests pass; site build and internal links pass. Screenshots match the
  described states, with accurate alt text and retained capture recipes (DOCS-D3, DOCS-T2).

## Changes to the parent

### MODIFIED requirements.md § Documentation


- User documentation lives in Markdown in `docs/`, with one navigation map, `docs/README.md`, shared by GitHub and
  the Starlight site. User docs contain no blueprint IDs or links into the blueprint (DOC-D1–DOC-D4, DS-D1–DS-D6).
- The reader-facing groups are Start here, Guides, Using slipbox, Reference, Help and project information, and
  For agents. The primary learning path is introduction, installation, quick start, Working with slipbox, then the
  dedicated Reading and editing in slipbox guide. The agreed guide sequence is recorded in DOCS-D2.
- Guides teach complete tasks from stated prerequisites to a checked outcome. Topic pages own full explanations;
  reference owns exact keys, commands, settings, variables and paths. The glossary provides short definitions and
  links. Familiar keys come before vim-specific alternatives where both exist (DS-D4, DS-D6, DOCS-D2).
- The first reading/editing guide teaches rendered view, the lens, whole-source view, typing and saving as distinct
  parts of one workflow. It is second after the general first-session guide (DOCS-D2).
- CLI and agent explanations distinguish saved files from unsaved TUI buffers. Shared files do not imply access to
  unsaved text; warnings about unsaved files are advice, not locks (DOCS-D2).
- Earlier page addresses and section anchors remain valid when explanations move. Compatibility pages have explicit
  declarations in the docs map and are built without adding competing sidebar entries (DOCS-D2).
- Changes visible to users update the docs in the same piece of work. Tests preserve command/flag, default-key,
  mouse and configuration coverage, navigation order, earlier anchors and working internal links (DS-D5, DOCS-D2).
- The guides and the screen chapter carry screenshots, made by a script from slipbox itself on the sample folders and
  retaken when the UI changes, by anyone, in one command (DF-D19, D236). While text is being restructured, a
  described placeholder may stand in until the text settles and the capture is taken (DOCS-D3, DOCS-T2).
- The site is built from those Markdown pages with search. The home presents one primary first-use path, then
  workflows and lookup routes. Agent-facing onboarding and the raw agent-guide endpoint remain available; the
  installed `slipbox skill` remains the agent's CLI contract (DS-D1–DS-D3, DOCS-D2).
- The repository's README is a concise front door. Maintainer, architecture, security and accessibility policies
  remain written for their own audiences, linked from user-facing explanations rather than copied (GR-D1, D227).

How: docs/README.md; design/distribution.md § The documentation site and § Documentation structure; the writing
principles in workstreams/archive/docs-site/requirements.md § How they are written.

Previously:

> ## Documentation
>
> - slipbox ships user documentation in Markdown in `docs/`: guides for the tasks a newcomer meets, and a manual
>   covering every key, setting, command and behaviour, written for users, without the blueprint's IDs and never
>   linking into it; the blueprint links to the docs, not the reverse (DOC-D1, DOC-D2, DOC-D3).
> - The docs are also a website on GitHub Pages, `https://<owner>.github.io/<name>/docs/`: built from `docs/`, their one
>   source, by Starlight, with search, deployed with the installer (DS-D1, DS-D2). Its home starts each kind of reader
>   on their own path; a quick start, a concepts page and an agent guide, which a person's own agent reads to walk them
>   through slipbox, are pages of their own (DS-D3). The pages a newcomer reads first give a familiar key before vim's,
>   and a page lists those keys (DS-D6).
> - They read easily: short sentences, one idea each, steps as numbered steps, tables for what is looked up (DS-D4). The
>   reference chapters (keys, configuration, the command line) stay written by hand, their lists held whole by the tests
>   (DS-D5).
> - A change users will see updates the docs in the same piece of work. `tests/docs.test.ts` keeps them whole: every
>   link and anchor landing, every CLI command and flag and every default key in the manual, no ID; the configuration
>   chapter's defaults are tested against the code's.
> - They're written for a person at a terminal who knows Markdown, not necessarily vim: what slipbox does now, in plain
>   words, each subject explained in one chapter and linked from the rest. The agent skill stays the agents' guide,
>   checked against the CLI chapter (DOC-D4).
> - The guides and the screen chapter carry screenshots, made by a script from slipbox itself on the reference set and
>   retaken when the UI changes, by anyone, in one command (DF-D19, D236).
> - The manual opens with a how-it-works chapter, the ideas and promises users rely on, linking the chapters rather than
>   repeating them, and has a versions chapter, the versioning policy (GR-D16). Troubleshooting's "Reporting a problem"
>   names the issue tracker and its bug form, sends questions and ideas to Discussions (GR-D17), and security problems
>   to the security policy.
> - Beside `docs/`, the repository's own documents: the changelog, the maintaining procedures, the security policy,
>   accessibility, architecture and the issue forms, each written for its own readers, kept with the code like the rest
>   and free of the blueprint's IDs (GR-D1). The README's first screen says what slipbox is, its status, where to get
>   help and how it is maintained, without naming the maintainer (D227).
>
> How: docs/README.md; workstreams/archive/docs-site/requirements.md § How they are written (DS-D4, replacing DOC's
> rules where they differ: workstreams/archive/user-docs/requirements.md § How they are written); the site:
> design/distribution.md § The documentation site; the screenshots: design/testing.md § The terminal tests; the
> repository's documents: design/repository.md § The repository's documents.
