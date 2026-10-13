# Decisions: the documentation site

## DS-D1: The docs as a website on GitHub Pages, with Starlight, as herdsman's are (2026-10-14)

**Decision:** The user docs are also a website: Astro Starlight, served by the repository's Pages site at `docs/`,
built and deployed by Actions with the installer. Starlight's search, sidebar, themes and edit links, as they come.

**Why:** The user's, comparing slipbox's docs with herdsman's, which are such a site: slipbox's had the content, about
83,000 words, but read only as Markdown on GitHub, with no search or navigation beyond the map. herdsman's site is the
same tool, already run by the same person. Starlight is MIT, as Astro is.

**Cost:** A second set of packages (276, for the site's build only, never in slipbox), one weak-copyleft among
them: lightningcss (MPL-2.0, CSS at build time, as accepted for use). sharp, Astro's optional image processing, and its
libvips (LGPL-3.0-or-later) aren't installed: the site turns image processing off, and an override puts a placeholder
in sharp's place (the user's call, 2026-10-14: nothing to distribute, so nothing owed, but native binaries never used
are surface for nothing). A CI job; the Pages job installs packages now. Meets greenrepo's DOC-06, a deviation until now
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

## DS-D5: The reference chapters' lists generated from the code (2026-10-14)

**Decision:** The keys, configuration and command-line chapters keep their prose; their lists of keys, settings and
commands are generated from the code (the keymap, the config's defaults and their doc comments, the command specs)
between markers, and a test fails when what's there differs from what the generator writes.

**Why:** As herdsman's configuration reference is generated: the lists can't fall behind the code. Today's tests check
that each key and command is mentioned; generated, each is also described as the code says.
