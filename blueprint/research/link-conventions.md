---
status: current
created: "2026-10-05"
---

# Research: link conventions in other tools

How other tools give a link its meaning: their roots, a leading `/`, links by name, moves, and links between separate
folders; then how Obsidian and zk write a link. Written for the model of links as paths inside, with conventions at the
edges (plan `21.x`). A survey on 2026-10-05 covered Obsidian, Logseq, VS Code, Foam, Dendron, marksman, markdown-oxide,
zk, org-roam, Denote, the nvim note plugins, GitHub, Gitea and the static site generators; its record names the tools,
not the pages read. How Obsidian and zk write links was read from their own settings and zk's source on 2026-10-06,
while building `21.4`.

## Summary

- **Every tool has a root, and the root gives a root-relative link its meaning** (*read*). This informed D69.
- **A leading `/` means a root everywhere, never the filesystem's;** slipbox's filesystem meaning (`20.2`) had no
  precedent (*read*). This informed D70.
- **Linking by name breaks in known ways,** and paths avoid all of them; but wikilinks stay common, so reading them
  matters (*read*). This informed D71.
- **No tool updates links after a move made outside it, and none links across vaults with backlinks** (*read*). This
  informed D68.
- **A relative link between separate repositories holds only while the folders are laid out alike,** and relinking per
  machine fights itself (*ours*). This informed D75.
- **Obsidian's link extension follows the link's style, and zk writes a markdown link from a note but a wikilink from
  the notebook's top** (*read*, 2026-10-06). This informed D72.

## Roots

**Every tool has a root,** and the root gives a root-relative link its meaning (*read*): Obsidian's vault, Logseq's
graph, zk's notebook (`.zk/`), marksman's project (`.git` or `.marksman.toml`), VS Code's open folder, GitHub's
repository. Tools that support casual use either make the opened folder the root (VS Code) or offer fewer features
without one (marksman's single-file mode) (*read*).

## A leading `/`

**A leading `/` means a root everywhere,** never the filesystem's (*read*):

- GitHub: "relative to the repository root";
- VS Code: "the current workspace root";
- Gitea, Hugo, Docusaurus and Foam likewise;
- zk switched to its notebook root, then the filesystem, in September 2026;
- Obsidian never writes one, its developers calling it ambiguous.

slipbox's filesystem meaning (`20.2`) had no precedent.

## Links by name

**Linking by name breaks in known ways** (*read*):

- a link silently re-pointed at a newly made note of the same name (Markdown Memo);
- a resolution order users can't predict (Obsidian);
- ambiguity settled alphabetically (Foam).

Paths avoid all of it (*ours*); wikilinks stay common, so reading them matters (*read*).

## Moves and links across vaults

- **No tool updates links after a move made outside it** (*read*).
- **None links across vaults with backlinks** (*read*): Obsidian and Logseq only through `obsidian://` and
  `logseq://` URIs; Dendron through `dendron://vault/…`, its vaults declared in config.

## Links between separate repositories

A relative link between separate repositories works for slipbox, editors, the shell and agents while the folders are
laid out alike, and for no one when they aren't (*ours*). Relinking per machine then fights itself: a repository shared
by two machines with different layouts gets "fixed" back and forth (*ours*).

## How Obsidian and zk write links

Read from the tools' own settings and zk's source on 2026-10-06 (*read*):

- **Obsidian's extension follows the style:** a wikilink drops `.md`, a markdown link keeps it.
- **Obsidian's default "shortest"** says nothing of a markdown link.
- **zk writes a markdown link from the note and a wikilink from the notebook's top.** That is what its source does,
  not what its docs' `{{path}}` suggests; a custom template says nothing.

## Gaps

- No tool was found that updates links after a move made outside it.
- No tool was found that links across vaults with backlinks.
- None of the tools surveyed gives a leading `/` the filesystem's meaning.

## Sources

- The survey of 2026-10-05: Obsidian, Logseq, VS Code, Foam, Dendron, marksman, markdown-oxide, zk, org-roam, Denote,
  the nvim note plugins, GitHub, Gitea and the static site generators (Hugo and Docusaurus named); Markdown Memo for
  name links.
- Obsidian's link settings, and zk's source and docs (`{{path}}`), on 2026-10-06.
