---
status: consolidated
created: "2026-10-11"
---

# DOC: User documentation

> Consolidated into its parent on 2026-10-11.

slipbox's documentation for the people who use it: guides that walk through a task, and a manual that covers
everything, in Markdown in `docs/`, written for users and free of the blueprint's IDs. The keymap, configuration and
CLI references become chapters of the manual.

- [requirements.md](requirements.md): its goals, the documents it makes, what it builds on, its acceptance criteria and
  its change to the root's requirements.
- [decisions.md](decisions.md): what was decided, and why.
- [notes.md](notes.md): how it was discussed.
- [ideas.md](ideas.md): the alternatives weighed.
- [tasks/](tasks/README.md): the work, a task per file.

## Outcome

Shipped as proposed: `docs/README.md`, seven guides and fourteen manual chapters, the keymap, configuration and CLI
references among them as chapters, with no blueprint IDs; the project README rewritten as the front page; the old
references removed and every link to them moved; `tests/docs.test.ts` added. The guides were tried as written
(DOC-T12). Nothing was forced. Added on the way: the chapters' shared subjects each given one owner, and the writing
rules (requirements.md § How they are written), carried up into the root's requirements § Documentation. What the
writers found in the code (bugs, disagreements with the design, gaps) is in [notes.md](notes.md), for the user to
place. Screenshots were offered and wait for the user's word.

