# Decisions: the documentation site

## DS-D1: The docs as a website on GitHub Pages, with Starlight, as herdsman's are (2026-10-14)

**Decision:** The user docs are also a website: Astro Starlight, served by the repository's Pages site at `docs/`,
built and deployed by Actions with the installer. Starlight's search, sidebar, themes and edit links, as they come.

**Why:** The user's, comparing slipbox's docs with herdsman's, which are such a site: slipbox's had the content, about
83,000 words, but read only as Markdown on GitHub, with no search or navigation beyond the map. herdsman's site is the
same tool, already run by the same person. Starlight is MIT, as Astro is.

**Cost:** A second set of packages (282, for the site's build only, never in slipbox): two weak-copyleft among them,
lightningcss (MPL-2.0, CSS at build time) and sharp's libvips (LGPL-3.0-or-later, installed as Astro's optional
package, never run); a CI job; the Pages job installs packages now. Meets greenrepo's DOC-06, a deviation until now
(GR-D8, whose "until after the first release" this ends early).

**Not chosen:** VitePress (as able, but not what herdsman runs); MkDocs Material (Python in the toolchain); GitHub's
rendering alone, as before.

## DS-D2: `docs/` stays the one source; the site gathers it (2026-10-14)

**Decision:** The pages stay Markdown in `docs/`, as DOC wrote them; before each build, a script gathers them into the
site, the docs map giving the sidebar, the links rewritten to the site's addresses. Only the site's home is its own.

**Why:** GitHub keeps rendering `docs/`, `tests/docs.test.ts` keeps checking it, and an edit is made once. herdsman's
pages are MDX in the site's own folder; slipbox's had the tests and the GitHub readers to keep.

**Not chosen:** moving the pages into the site as MDX (two places to read them, the tests rewritten).

## DS-D3: A front door: paths, a quick start, the concepts, an agent guide (2026-10-14)

**Decision:** The docs' home starts each reader on their path (new to slipbox, beside an agent, coming from Obsidian
or zk, reviewing code), with buttons to install and to the quick start, and a prompt to paste into an agent, which
reads `docs/agent-guide.md` and walks the person through slipbox. A quick start (two minutes), a concepts page (each
term in a few lines) and the agent guide are new pages; the map's groups are Start here, Guides, The manual,
Reference, About slipbox and For agents.

**Why:** herdsman's front door, which the user pointed to: a reader finds their way without reading a chapter first.
The skill teaches an agent to use slipbox; the agent guide teaches it to teach a person.

## DS-D4: Plain sentences (2026-10-14)

**Decision:** The docs are rewritten to the rules in requirements.md § How they are written: short sentences, one idea
each, steps as numbered steps, tables for what is looked up, colons only to introduce.

**Why:** The comparison: herdsman's docs read quickly; slipbox's, accurate, stacked clauses with colons and semicolons
("It's a window like any other: the scratch rendered, the lens to edit it, …"), DOC's rule "colons, commas and
semicolons rather than dashes" taken further than it meant.

## DS-D5: The reference chapters stay written by hand, in plain sentences (2026-10-14)

**Decision:** The keys, configuration and command-line chapters stay written by hand; their prose is rewritten to
DS-D4's rules like every page's, their tables and the configuration's TOML listing kept as they are.

**Why:** The user's call, once the chapters were read for generating them: the keys chapter pairs related keys in a
row (a key and its leader form, next and previous) with descriptions a person wrote; the configuration's "Every key" is
a TOML file to copy, every default and its values in comments; the command line's entries explain each flag. A list
generated from the keymap, the defaults or the specs would be flatter. And what generating was for, lists that can't
fall behind the code, the tests already hold: every default key, every setting's default, every command and flag.

**Not chosen:** the lists generated from the code between markers, a test failing when they differ (first proposed,
after herdsman's generated configuration reference).
