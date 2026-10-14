# Decisions: process

How the work on slipbox is done and recorded: the design documents, the tests, trying what is built, and the blueprint
itself.

## D206: The design describes the code as it is (2026-09-25)

> **Amended by D210 (2026-10-11):** the design moved into the blueprint, `blueprint/design/`; the rule holds there.

**Decision:** The design documents describe the code as built, and are kept true to it: when the code changes
behaviour, the matching design document changes in the same commit.

**Why:** The design is what is read before changing code (the handoff's map of the documents), so it has to say
what the code does.

## D207: Terminal tests are listed for approval before they run (20.x, 2026-10-02)

> **Amended (2026-10-06):** for `21.x` and the terminal tests' gaps, the user let new scenarios be written and run
> without waiting; what ran is still reported.
>
> **Amended by D209 (2026-10-10):** trying a feature just built counts as approved.

**Decision:** Each item ends with the tests it needs listed for the user's approval before any is run: the terminal
scenarios driven in a herdr pane and live checks against real servers and linters. The headless suite
(`bun run check`) runs freely while working.

**Why:** The user's instruction (2026-10-02), after a session that installed linters for live probes and drove
terminal tests unasked: those touch the user's machine and panes. Set in the plan for `20.x` and `21.x`.

## D208: Prototypes are tried before they are marked done (2026-10-08)

> **Amended by D209 (2026-10-10):** the agent tries them itself.

**Decision:** A feature built as a prototype (`24.x`, `12.x`) is tried with the user before the roadmap marks it
done.

**Why:** Not recorded; the handoff's update of 2026-10-08 states the practice.

## D209: The agent tries what it builds (2026-10-10)

**Decision:** A built feature is tried live by the agent, in a herdr tab of its own on the reference set
(`examples/home/`, built by `scripts/build-home.ts`), and marked done when it works, rather than handed to the user to
try. The user is asked only what needs their judgement. What a try finds is fixed, each fix with a regression test.

**Why:** Trying `22.2` and `22.3` took minutes and found nothing the user had to judge. The same day every prototype
was tried this way, and the bugs found were fixed: a read-only window that took typing, the commit editor's first
letter, source control's selection after staging, a config warning that hid an escape, git's attribute guard failing
open.

## D210: The blueprint, and the initial design settled (2026-10-11)

> **Amended by D223 (2026-10-13):** a small change goes by an issue and one pull request, which changes the design
> file it touches; workstreams stay for bigger work.

**Decision:** slipbox's design documents become a blueprint, the user's method for keeping a project's thinking beside
its code. `docs/idea.md`, `docs/plan.md`, `docs/handoff.md` and `docs/design/decisions.md` were split by strand into
`blueprint/` in one commit; `docs/design/` moved to `blueprint/design/`, except the keymap, the configuration
reference and the CLI reference, which stay in `docs/` as user documentation. Decisions are numbered D1 onward, each
title naming its plan item; the plan's item IDs stay as the roadmap's step IDs. Nothing is backfilled: the initial
design is settled now, past phases stay ticked on the roadmap, and from here every change to requirements or design
goes through a workstream.

**Why:** The user's method, adopted for slipbox: thinking otherwise lives in chat histories and one person's head,
every agent starts without it, and design and code drift apart unnoticed. The blueprint keeps current truth
(requirements, design) apart from history (ideas, notes, research, decisions), and gives every fact one home. It
replaces the handoff's rule that the documents state only what is decided and leave how it changed to git: decisions
now keep dated notes.

**Not chosen:** backfilling workstreams for past phases, because the phases are built and the roadmap already records
them; keeping the plan's item IDs as decision IDs, because one item can need several decisions and a decision can span
items (ideas.md § Process).

## D223: A small change by an issue and one pull request (2026-10-13)

**Decision:** A small feature or fix (a setting, a key, a window) is a GitHub issue and one pull request that changes the
code, its tests, the docs and the design file it touches together, with a decision recorded where it settles
something; a workstream is for work that spans several areas or changes how the project works. The issue says what's
asked; the pull request's body names it.

**Why:** The user's answer, 2026-10-13, for the gutter's signs (#22) and reporting a problem from inside slipbox (#23):
a workstream for a setting is mostly ceremony.

**Amends:** D210, whose every change to requirements or design went through a workstream.

## D227: The README doesn't name the maintainer (2026-10-13)

**Decision:** The README's first screen says who may contribute and points to `MAINTAINING.md` for how slipbox is
maintained, without naming the maintainer. This amends the requirement, from greenrepo's standard (GR-D1), that it
say who maintains it.

**Why:** The user's call, 2026-10-13, with the README's opening rewritten (D226): not needed there.

## D230: A pull request of the docs alone skips the tests (2026-10-14)

**Decision:** CI's `changes` job reads what a pull request changed (its merge commit against its base). When every
file is the docs' (`docs/`, `blueprint/`, `site/src/`, a Markdown file at the top), the `test` and `terminal` jobs are
skipped, and `lint` runs the tests that read the docs (`bun run test:docs`: the docs' and the site's tests). The two
tests that read a chapter from elsewhere moved there: the configuration's listing against the defaults, and help's
mouse list (`src/tui/mouse-help.ts`) against the keys chapter. A test fails when any other test reads the docs, so
none is skipped with them. A push to `main`, a merge group, a run by hand and a diff that can't be read run everything;
the required check (`ci`) counts a skipped job as passed, as it did. Decided by an issue (#59) and one pull request
(D223).

**Why:** The user's request, 2026-10-14, after a pull request of a few Markdown files waited twelve minutes on the
terminal tests, and longer while macOS runners queued; nothing in it could change their result.

**Cost:** A file put in the docs' paths that a test or a build reads without the tests knowing (a test reading the
docs by a path the check doesn't recognise) would be skipped with them. The check looks for the repository's root
joined with `docs`, `blueprint`, `site` or a top-level Markdown file.

**Not chosen:** `paths-ignore` on the workflow: a required check that never starts blocks the merge. A list of test
files kept by hand in the workflow: the test on `test:docs` keeps it in one place, and true.

