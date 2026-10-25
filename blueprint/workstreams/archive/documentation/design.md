# Documentation structure

This is the agreed reader-facing structure. A topic starts as a page or a
section; it becomes a folder with an overview when independent subtopics justify it. Existing addresses are retained
where the subject still fits. Evidence and comparisons live in [research.md](research.md).

## The organizing idea

A person should learn to use slipbox before being asked to configure an agent. Keep three jobs distinct:

- **Start here:** choose the product, install it and get one useful result.
- **Guides:** complete a concrete workflow, from a known starting point to an observable outcome.
- **Using Slipbox:** understand each part, how to operate it and what to expect.

Reference answers exact lookup questions. Help handles recovery and project policies. The agent-facing material has
its own audience. These distinctions guide writing; readers do not need documentation terminology to navigate them.

## Agreed tree

The guide sequence and dedicated reading/editing walkthrough are agreed (DOCS-D2).

```text
slipbox documentation
├── Start here
│   ├── What is Slipbox?
│   ├── Installation
│   └── Quick start
├── Guides
│   ├── Working with Slipbox
│   ├── Reading and editing in Slipbox
│   ├── Working across folders and vaults
│   ├── Coming from Obsidian or zk
│   ├── Reviewing changes with Git
│   ├── Exporting and sharing notes
│   ├── Working with agents
│   └── Making Slipbox yours
├── Using Slipbox
│   ├── How Slipbox works
│   ├── The screen and navigation
│   ├── Reading notes and documents
│   ├── Editing: the lens and source mode
│   ├── Finding and replacing
│   ├── Files and folders
│   ├── Links and backlinks
│   ├── Vaults, home and Elsewhere
│   ├── Scratch and context
│   ├── Code and language tools
│   ├── Git
│   ├── Exporting
│   ├── Customization
│   └── The command line
├── Reference
│   ├── Keyboard and mouse shortcuts
│   ├── Commands and flags
│   ├── Configuration settings
│   ├── Environment and storage locations
│   └── Glossary
├── Help and project information
│   ├── Troubleshooting and diagnostics
│   ├── Accessibility and terminal support
│   ├── Privacy and trust
│   └── Versions, updates and compatibility
└── For agents
    └── Helping someone use Slipbox
```

Use the project's chosen capitalization consistently when writing; title capitalization is illustrative here.
These are content destinations. Most begin with existing text; this tree does not imply forty new articles.

## The first-use path

**What is Slipbox? → Installation → Quick start → Working with Slipbox.**

The introduction gives a screenshot, a short account of reading/editing notes and code, and the TUI/CLI relationship.
It says an agent is optional. It presents one primary next step, with existing users able to jump to installation or
quick start. It does not repeat the full guarantees and glossary.

Installation gives one recommended route per platform, verification and a link to platform problems. Source builds,
preview channels, upgrade and uninstall remain reachable, without interrupting the common path.

Quick start is a short path to open a file/folder, find something, edit and save, then quit or continue. It uses a
minimal existing or disposable example and familiar keys; it does not require learning vault rules, configuring a
language server or installing an agent skill.

**Working with Slipbox** is the first guide: a coherent first session, adapted from `guides/getting-started.md`.
It introduces the screen as needed, opens and follows a link, finds a note, uses the lens, saves, handles a changed
file briefly and ends with a useful result. It can be followed independently after installation. The quick start
and guide have different depth and outcomes; avoid repeating the same long introduction in both.

The tutorial names what to observe at each step. Setup uses ordinary files or clearly explained commands; a newcomer
should not need to learn the scripting API merely to make the tutorial's input. The tour's copyable shell block
creates two notes in a new folder and initializes a vault, so the explorer, search and saved-file names match the
examples. Its setup refuses an existing folder. Stable `example` markers identify
runnable blocks in the guides; documentation tests execute the tour and the following agent examples on disposable
files. A link offers the complete keyboard reference, rather than presenting it as homework.

## Feature topics and page ownership

Each Using Slipbox page answers: what this part is, when to use it, ordinary operations, important behavior and
limits, then links to a guide and exact reference. Explain the ordinary case before edge cases. Define a new term
in place; the glossary collects short definitions and links, without being prerequisite reading.

| Subject | Authoritative explanation | Guides and lookup |
| --- | --- | --- |
| UI, modes, focus, tabs, splits, mouse | The screen and navigation | Working with Slipbox; shortcuts |
| Markdown, tables, images, math, diagrams | Reading notes and documents | Basic tour; configuration |
| Lens, source, save, undo, external changes | Editing | Basic tour; agent workflow; shortcuts |
| Switcher, search, replace, history, tags/types | Finding and replacing | Basic tour; shortcuts/commands |
| Explorer, create, rename, move, copy, trash | Files and folders | Across-folders workflow; commands |
| Link forms, resolution, backlinks, repairs | Links and backlinks | Across-folders guide; commands |
| Root detection, home, Elsewhere, pointers | Vaults, home and Elsewhere | Across-folders guide; configuration |
| Scratch references and context bundles | Scratch and context | Agent workflow; commands |
| Code view, completion, servers, problems | Code and language tools | Reviewing changes; configuration |
| Changes, branches, review, merge, rebase | Git | Reviewing changes; shortcuts |
| Formats, attachments, combined documents | Exporting | Exporting and sharing; commands |
| Themes, keys, config scopes and overrides | Customization | Making Slipbox yours; settings |
| CLI usage, output, saved files, safe writes | The command line | Agent workflow; commands/flags |
| Guarantees, index, disk, saved/unsaved model | How Slipbox works | Basic tour; agent workflow |
| Network, tool execution, trust and privacy | Privacy and trust | Link from code/Git and agent guides |
| Exact names/defaults/syntax | Reference | Link to the owning explanation |

A guide may show a setting or shortcut as part of a task. It links to its authoritative definition rather than
copying a full catalogue. The glossary never becomes a second manual. Working with agents is written to the person;
Helping someone use Slipbox is written to their agent. `slipbox skill` remains the agent's command-use contract.

## When a topic grows

Split by reader question, not an arbitrary length target. A split needs an independent purpose and an overview
that makes the relationship clear. For example, Git can grow into Overview, Changes and commits, Branches and
worktrees, Reviewing changes, and Merge/rebase. CLI reference can grow by command family, with a command index.
Configuration can grow by area, keeping one settings index and completeness tests across all pages.

These are candidate subdivisions, not approved page creation. Start with the present coverage and extract the
largest mixed-purpose chapters first. Do not repeat every feature as a guide and a manual page just for symmetry.

## Existing content coverage and likely changes

| Current material | Proposed home and treatment |
| --- | --- |
| docs/README.md | Map with the agreed groups/order; remains the navigation source |
| Site home | What is Slipbox?/front door; clear primary route and secondary audience paths |
| guides/install.md | Installation; move secondary lifecycle detail out of the main sequence as needed |
| guides/quick-start.md | Quick start; retain a short independent route |
| guides/getting-started.md | Working with Slipbox, first in Guides; refine prerequisites and outcomes |
| guides/keys-you-know.md | The screen and navigation; keep familiar-key onboarding, link full shortcuts |
| guides/lens.md | Editing/lens explanation and tutorial material; retire duplication with compatible links |
| guides/agents.md | Working with agents; workflow, with Scratch/context explanations in their owner |
| guides/code-and-git.md | Reviewing changes with Git; code-view explanation goes to Code and language tools |
| guides/vaults.md | Explanations to Vaults; worked examples become Working across folders and vaults |
| guides/from-obsidian-or-zk.md | Migration guide, retaining the compatibility caveats |
| guides/exporting.md | Exporting and sharing notes, one complete task |
| guides/making-it-yours.md | Making Slipbox yours, a focused configuration workflow |
| manual/concepts.md | Glossary; conceptual explanations belong in their feature owner |
| manual/how-it-works.md | How Slipbox works; short introduction belongs on the front door |
| manual/screen.md | The screen and navigation |
| manual/reading.md | Reading notes and documents; theme explanation moves to Customization |
| manual/finding.md | Finding and replacing |
| manual/editing.md | Editing/lens; move Scratch into its own context topic |
| manual/files.md | Files and folders |
| manual/links-and-vaults.md | Split links/backlinks from vault/home/Elsewhere explanations |
| manual/code.md | Code and language tools; trust policy links to its owner |
| manual/git.md | Git, with subdivisions if needed; guide keeps a single review task |
| manual/export.md | Exporting, the behavior and format differences |
| manual/keys.md | Keyboard and mouse shortcuts, with lookup completeness retained |
| manual/configuration.md | Explain customization separately; exact settings/environment/storage in Reference |
| manual/cli.md | CLI orientation separately; exhaustive commands/flags in Reference |
| manual/troubleshooting.md | Troubleshooting and diagnostics, a visible help destination |
| manual/privacy.md | Privacy and trust policy owner; Code links to it for policy |
| manual/versions.md | Versions, updates and compatibility |
| docs/agent-guide.md | Helping someone use Slipbox; preserve the raw Markdown endpoint |
| Root ACCESSIBILITY.md | Accessibility/terminal-support route; link the root policy, avoid a second policy |
| Root README/help links | Concise entry points into the agreed start path; no parallel tutorial |

## Navigation and URLs

The tree describes topics before paths. Changing a title or sidebar group does not require changing the URL.
Prefer retaining existing URLs when the page's subject remains. Split pages need an explicit old-page/anchor map:
keep a useful landing page or a tested redirect/anchor bridge as appropriate for GitHub Pages. Update repository
links, site cards, previous/next links, screenshots, raw agent links and CLI help pointers together.

`docs/README.md` remains the one navigation source. `site/scripts/gather.ts` currently reads only H2 groups and flat
page lists; nested pages need a deliberate extension with tests if the agreed tree requires them. A navigation node
may be a group or overview, not a duplicated page. Site-specific home presentation may stay in MDX; substantive user
explanations remain in shared Markdown. No second manually maintained site sidebar.

## Order of work after agreement

1. Agree the tree, audience order and owners; resolve the questions in notes.md.
2. Inventory headings/anchors and map every existing section to its destination. Verify behavior claims against code
   or focused runs where they are doubtful; a structural review is not a complete technical accuracy audit.
3. Establish navigation and the first-use path in a small coherent change, preserving URLs and cross-links.
4. Reshape the largest mixed-purpose chapters and guides by subject, preserving completeness checks as they move.
5. Add descriptive screenshot placeholders, update examples, site cards and agent onboarding; check links and build
   the site. Capture screenshots in the later image pass (DOCS-D3).
6. Walk real reader journeys, fix dead ends and only then remove redundant material.

Implementation is tracked in DOCS-T1. Current source and runtime behavior govern the explanations; proposed engine
capabilities are not documented as already available. Public deployment follows the normal branch/release workflow.

## Reader checks for the outline

- I installed it. How do I read and change my first note? Start here → Quick start; Guides → Working with Slipbox.
- What is the lens, and how do I save or resolve an external edit? Using Slipbox → Editing.
- Why did opening this folder use a bigger vault? Using Slipbox → Vaults, home and Elsewhere.
- How do I rename a note without breaking links? Using Slipbox → Files and folders, then Links and backlinks.
- How do I give an agent the current context safely? Guides → Working with agents.
- How do I review a branch or settle a merge? Guides → Reviewing changes; Using Slipbox → Git for details.
- Which flag/key/config value do I need? Reference → Commands, Shortcuts or Configuration.
- Why does the CLI miss my unsaved text? Using Slipbox → The command line/How Slipbox works.
- What does it send or run, and can I use it accessibly? Help → Privacy and trust/Accessibility.

These are review scenarios. The first-session view/edit/save and live-settings examples were exercised on disposable
notes in Herdsman; that is verification of the steps, not a claim of a completed usability study.

## Implementation boundaries

Keep the existing `guides/` and `manual/` addresses where their subject fits. Navigation expresses the agreed groups;
physical paths need not be renamed merely to mirror group labels. Add focused pages for vaults, scratch/context,
customization, CLI orientation, environment/storage and accessibility. Preserve existing section anchors when moving
text, with onward links to the new owner. Compatibility pages are declared in the docs map and built but excluded
from the primary sidebar. Every page must be either a navigation destination or an explicit compatibility page.

Screenshots were descriptive placeholders while the text settled (DOCS-D3), then captured from their recipes under
the same names (DOCS-T2). The tour's shots use `examples/guide/slipbox-tour/`, the vault its setup block makes. The docs
check still accepts a documented placeholder for a capture to come, and tells it from a missing image. The site home
uses the same first-use path, with a screenshot hero.

## Parent design changes

### MODIFIED design/distribution.md § The documentation site


**The site** (`site/`, DS-D1) is an Astro Starlight project of its own: its packages in `site/package.json`, exact,
under the repository's own install gates, repeated in `site/bunfig.toml` (no install script, a week's age), checked by
`bun run check:deps` (`siteProblems`), updated by Dependabot with the rest. It's served at
`https://<owner>.github.io/<name>/docs/` (`base: /slipbox/docs`), with Starlight's search (Pagefind, built with the
site), its sidebar, light and dark themes, and an edit link on each page. Pictures pass through as they are (no image
processing). sharp, Astro's optional package for it, is overridden by a placeholder (`site/stubs/sharp`), so neither it
nor its libvips (LGPL-3.0) is installed.

**Its pages are gathered from `docs/`** (`site/scripts/gather.ts`, before each build; DS-D2): the docs map's
(`docs/README.md`) `##` sections are the sidebar's groups and their lists its pages, in order; a page's H1 is its
title and its first paragraph its description; the links between the docs become the site's addresses
(`../manual/keys.md#leader` → `/slipbox/docs/manual/keys/#leader`), a link to a repository file outside `docs/` goes to
it on GitHub, code is left as it is; each page's edit link opens its file in `docs/`. The screenshots are copied in, and
the agent guide is also served as its Markdown (`/slipbox/docs/agent-guide.md`), for an agent to read. What's
gathered isn't committed. Compatibility page paths are declared as `legacy-page` comments in the same docs map.
They are built and searchable but absent from the primary sidebar; `readLegacyPages` validates their path shape.
`splitPage` keeps explicit earlier-section anchors in the body while skipping them when extracting a description.
The home (`site/src/content/docs/index.mdx`) is the site's own: the paths, the buttons, the
first-use sequence, workflow cards and lookup routes (DS-D3, DOCS-D2).

**Built** by `bun run site` (the site's install, then `gather`, `astro build` under Bun, and
`site/scripts/check-links.ts`, which fails on a link within the site to a page or heading that isn't there, or to a
path on the domain outside it but the installer's files). CI's `site` job runs it on every change, inside the
required `ci` check; `pages.yml` runs it and puts the site at `_site/docs/`.

Previously:

> ## The documentation site
>
> **The site** (`site/`, DS-D1) is an Astro Starlight project of its own: its packages in `site/package.json`, exact,
> under the repository's own install gates, repeated in `site/bunfig.toml` (no install script, a week's age), checked by
> `bun run check:deps` (`siteProblems`), updated by Dependabot with the rest. It's served at
> `https://<owner>.github.io/<name>/docs/` (`base: /slipbox/docs`), with Starlight's search (Pagefind, built with the
> site), its sidebar, light and dark themes, and an edit link on each page. Pictures pass through as they are (no image
> processing). sharp, Astro's optional package for it, is overridden by a placeholder (`site/stubs/sharp`), so neither
> it
> nor its libvips (LGPL-3.0) is installed.
>
> **Its pages are gathered from `docs/`** (`site/scripts/gather.ts`, before each build; DS-D2): the docs map's
> (`docs/README.md`) `##` sections are the sidebar's groups and their lists its pages, in order; a page's H1 is its
> title and its first paragraph its description; the links between the docs become the site's addresses
> (`../manual/keys.md#leader` → `/slipbox/docs/manual/keys/#leader`), a link to a repository file outside `docs/` goes
> to
> it on GitHub, code is left as it is; each page's edit link opens its file in `docs/`. The screenshots are copied in,
> and
> the agent guide is also served as its Markdown (`/slipbox/docs/agent-guide.md`), for an agent to read. What's
> gathered isn't committed. The home (`site/src/content/docs/index.mdx`) is the site's own: the paths, the buttons, the
> agent prompt, the cards (DS-D3).
>
> **Built** by `bun run site` (the site's install, then `gather`, `astro build` under Bun, and
> `site/scripts/check-links.ts`, which fails on a link within the site to a page or heading that isn't there, or to a
> path on the domain outside it but the installer's files). CI's `site` job runs it on every change, inside the
> required `ci` check; `pages.yml` runs it and puts the site at `_site/docs/`.

### ADDED design/distribution.md § Documentation structure

The docs map orders Start here, Guides, Using slipbox, Reference, Help and project information, and For agents.
Guides begin with Working with slipbox and the dedicated Reading and editing in slipbox walkthrough; the guide
sequence follows DOCS-D2. Topic pages own explanations; references own exact lookup. Moved material has onward links,
with earlier addresses and anchors retained by the compatibility fixture in `tests/fixtures/documentation/`.

`tests/docs.test.ts` checks links, earlier anchors, complete command/key coverage, and that every screenshot recipe's
picture is shown, the site home's included (or described by a placeholder until it is taken). `tests/site.test.ts`
checks groups, guide order, map coverage including compatibility pages, and page metadata. The screenshots are taken
from their recipes in `tests/terminal/shots/` once the text they illustrate is settled (DOCS-D3, DOCS-T2).

## Keeping the tour and captures in step

`examples/guide/slipbox-tour/` is the tour's sample vault, including its `.slipbox/` marker. The executable
documentation
test compares the guide setup's two notes and marker with this sample before running the agent write. A change to the
tour's notes or steps updates that folder and its recipes in `tests/terminal/shots/<doc>.ts`. When changed text alters
what a capture shows, retake it with `bun run shots <name>` and inspect the PNG before committing.
