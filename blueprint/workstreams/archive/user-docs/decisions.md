# Decisions: user documentation

## DOC-D1: Markdown in `docs/`, nothing built (2026-10-11)

**Decision:** The user documentation is plain Markdown in `docs/`, linked relatively, readable on GitHub and in
slipbox itself. No site generator.

**Why:** The user's choice. It needs no toolchain or dependencies (D192, D201), and slipbox reading its own docs, links
and pictures included, is the best demonstration of it.

**Not chosen:** a static docs site, now or later (ideas.md § Documentation).

## DOC-D2: Guides and a manual (2026-10-11)

**Decision:** Two parts. Guides walk through a task from start to end, short, in the order someone meets it. The
manual covers everything, a chapter per area, and is where a guide sends you for the rest; the keymap, configuration and
CLI references are chapters of it.

**Why:** The user's answer, "guides + manual". A guide is read once, to get going; the manual is looked things up in.

**Not chosen:** guides with the references beside them as they are, a single manual without guides, or a fuller
README alone (ideas.md § Documentation).

## DOC-D3: No roadmap or decision IDs in the user docs (2026-10-11)

**Decision:** The user docs carry no roadmap step IDs (`21.4`) and no decision IDs (`D17`); the blueprint keeps them,
and links one way, from the blueprint to the docs, never back.

**Why:** The user's choice. The docs are written for users (the spec's "User documentation"); an ID means nothing to
someone using slipbox.

## DOC-D4: People first; the skill stays the agents' (2026-10-11)

**Decision:** The docs are written for a person installing and using slipbox. Agents keep their own guide, the skill
(`skills/slipbox/SKILL.md`), which is checked against the docs so the two never disagree; the CLI's chapter serves both.

**Why:** The user's choice.

**Not chosen:** every guide written for people and agents alike, or agents first (ideas.md § Documentation).
