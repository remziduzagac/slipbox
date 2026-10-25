---
status: current
created: "2026-10-18"
---

# Research: documentation structure and reader flow

Source inspection against `dev@2515a3a`, plus the live docs and comparison sites, on 2026-10-18. This is an
information-architecture review of navigation, headings, introductions and content ownership. It is not a complete
verification of every behavior claim, command example or accessibility property.

## Summary

- **The first guide assumes prior learning:** Working with agents is first in Guides, but depends on the notes made
  in Getting started. There is no guide named Working with Slipbox (*read*, docs/README.md § Guides;
  docs/guides/agents.md § Give the agent the skill).
- **Entry points compete:** Start here offers installation, quick start, familiar keys, concepts and getting started;
  the site adds audience cards, agent-led onboarding and another Learn more list. These are useful materials, but do
  not form one clear primary reading path (*read*, docs/README.md § Start here; site home; *ours*, assessment).
- **Classification is inconsistent:** the vaults guide is largely explanation plus worked examples, the lens guide is
  a feature explanation, and the CLI/configuration references also contain teaching material (*read*, named headings
  below; *ours*, classification).
- **The foundation is sound:** one Markdown content source and one docs map already feed Starlight. Reorganizing
  topics does not require a new publishing platform (*read*, site/scripts/gather.ts § readMap;
  design/distribution.md § The documentation site).
- **Good examples provide patterns, not a template to copy:** clear entry paths, named product parts and separated
  lookup material recur across Herdsman, TTT, OpenCode, Fresh and Zed (*read*, sources below; *ours*, synthesis).

## Current documentation findings

The current tree has 30 Markdown documents including its map and agent guide. Counts below came from the source
files, not estimates (*ran*, Python line count on docs/).

| Evidence | Reader consequence | Proposed treatment |
| --- | --- | --- |
| docs/README.md:11–15 | Five possible starts | One main sequence |
| docs/README.md:21; guides/agents.md:17–18 | First guide needs another tutorial | Basic tour first |
| guides/quick-start.md § Next | Four onward routes | One recommended next step |
| guides/vaults.md: 720 lines, 14 H2s | Model explained before examples | Topic owner plus workflow |
| manual/links-and-vaults.md: 923 lines | Link and root rules mixed | Separate links from vaults |
| guides/lens.md; manual/editing.md | Two lens explanations | One editing owner |
| manual/concepts.md; manual/how-it-works.md | Definitions and model overlap | Glossary vs explanation |
| manual/configuration.md: 931 lines | Teaching and exact defaults mixed | Customization vs reference |
| manual/cli.md: 1,824 lines | CLI model and catalogue mixed | Orientation plus lookup |
| manual/git.md; guides/code-and-git.md | Many Git jobs plus code setup | Git topic plus review guide |
| docs/README.md § Reference | Troubleshooting among catalogues | Visible Help destination |
| site/scripts/gather.ts:32–41 | Flat navigation already has one source | Preserve one map |

The counts alone are not defects. A long reference can be useful. The problem is having to discover which kind of
answer a page contains, and where the authoritative explanation lives (*ours*).

The repository map is already fairly comprehensive. Renaming Working with agents alone would be misleading: it is
actually an agent workflow. Adapt the existing Getting started tutorial into Working with Slipbox and order it first
instead (*ours*, based on the guide introductions).

## Comparisons

### Herdsman

The supplied [quick start](https://remziduzagac.github.io/herdsman/docs/quick-start/) was fetched directly as HTML
(HTTP 200) and its navigation/headings inspected (*ran/read*). The web browsing tool could not retrieve it; no claim
here relies on a search-result summary.

Its Start group orders Install, Quick start, Concepts, Keyboard, How to work with Herdsman. Later groups name agents,
sessions/machines, configuration and reference. The quick start proceeds through creating a workspace, mouse use,
running an agent, keyboard control, detaching and next steps (*read*). Learn the visible product and its ordinary
workflow before the integration details (*ours*).

Caution: the current quick start's mouse section also contains lengthy terminal-specific behavior. Slipbox should
borrow the overall path without adopting every detail's placement (*ours*).

### TTT

[Installation](https://tttedit.dev/getting-started/installation/) shows Introduction → Installation → Quick Start,
followed by recognizable guides such as Editor Basics, File Explorer & Workspaces, Search, Git and LSP. Settings and
Default Keybindings are under Reference (*read*). Its
[quick start](https://tttedit.dev/getting-started/quick-start/) has a clear place in that sequence (*read*).

Borrow the simple first-use sequence and concrete feature names. Do not automatically label every feature chapter
as a task guide; Slipbox needs both explanations and end-to-end workflows (*ours*).

### OpenCode

The supplied [v2 docs](https://opencode.ai/v2/docs/) has a concise product introduction and named configuration topics
such as Agents, Models, Skills, Themes, Commands, Tools and Permissions (*read*). Readers can identify a part without
knowing the implementation structure first (*ours*).

Its current intro also presents multiple installation surfaces before configuration. This review does not claim
that it supplies a complete tutorial/guide system, or that the same hierarchy fits a note/code reader (*ours*).

### Fresh

[Fresh's docs](https://getfresh.dev/docs/) separates Features, Guides, Configuration, Plugins and Developer Docs in
navigation, with explicit features such as File Explorer, Search and Replace, Language Support and Git (*read*).
Borrow clear feature names and the separation of user/developer audiences (*ours*).

Its landing page also foregrounds blog entries and the sidebar becomes extensive. That is not a reason to add a blog,
plugin section or developer API to Slipbox's user documentation (*ours*).

### Zed

[Getting Started](https://zed.dev/docs/getting-started) moves through opening a project, essential commands,
configuration, language setup and optional AI features. The surrounding navigation has separate work and AI topics
(*read*). Borrow concrete actions and a basic-product path that does not begin with AI setup (*ours*).

Zed's full sidebar is much larger than Slipbox needs. This is evidence for ordering, not for copying its page count
or adding unsupported capabilities (*ours*).

## Verification and gaps

- Read the local docs map, home page, onboarding introductions, chapter heading inventory and publishing parser.
- Read the supplied comparison pages and two additional editor documentation sites, as linked above.
- Fetched the live Slipbox docs home (HTTP 200) and confirmed the Working with agents navigation label. Deployment
  timing can differ from dev, so precise local evidence is pinned to the source revision.
- No user study has been run. Confusion and predicted improvements above are an analysis, not measured usability.
- Detailed accuracy checking, examples run in a fresh folder, a page/anchor migration inventory and screen-reader
  navigation testing remain future work. Engine draft features must not be written as current behavior.
