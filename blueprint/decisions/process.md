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

> **Amended by D239 (2026-10-17):** a pull request of code runs the tests and the terminal checks its files reach,
> no longer all of them; one of the docs alone still runs only the docs' tests.

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

## D234: A contributing guide, a code of conduct and a pull request template, before contributions open (2026-10-14)

**Decision:** The repository has `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` and `.github/pull_request_template.md`, while
pull requests still come from collaborators only (GR-D5). The guide says where each thing goes (bugs to the issue form,
questions and ideas to Discussions, a vulnerability to private reporting), that pull requests are collaborators' for
now, and what one needs: a Conventional Commit title, one change, docs and blueprint kept true, a test, `bun run check`,
an agent named in a `Co-Authored-By:` trailer. The code of conduct is the Contributor Covenant 2.1 as written, its
contact this repository's private reporting form, a report saying it's about conduct; an abusive comment can go to
GitHub with Report content. The template is that checklist. This supersedes GR-D5's "no contributing guide, code of
conduct or pull request template"; an AI policy beyond the trailer still waits.

**Why:** The user's call, 2026-10-14, when GitHub's community profile listed the three as missing. The guide is useful
to a reporter now, and the template to collaborators and agents; the code of conduct is the house rules for issues and
Discussions, which are open to anyone.

**Cost:** The private reporting form is made for vulnerabilities: a conduct report there is the one private channel a
repository under a personal account has (reports to a repository's own maintainers are an organisation's feature), and
the maintainer has no email address for it.

**Not chosen:** a code of conduct of the project's own, shorter: the Covenant is the one people know, and GitHub's
profile recognises it. Waiting until pull requests open, as GR-D5 had it.

## D236: The docs' screenshots taken in the headless terminal (2026-10-17)

**Decision:** The docs' screenshots are taken in the headless terminal the terminal tests use (TT-D2), not in a herdr
pane: `bun run shots [name…]` drives slipbox at 120×34 and draws each screen, read cell by cell with its colours, into
`docs/images/<name>.png`. The shots are a file per doc, `tests/terminal/shots/<doc>.ts`, so docs written side by side
add theirs apart, and a test holds the pictures and the shots to each other. For them the headless terminal answers
Kitty's graphics query, so a note's pictures are placeholder cells the shot draws its pictures over. Amends DF-D19
(made in a herdr pane) and TT-D2 (herdr kept for the screenshots).

**Why:** The maintainer's choice, for the docs of VV and GIT (VV-T9, GIT-T8), over retaking them in herdr: anyone can
retake them with one command, with no multiplexer and no real terminal, from the screen the terminal tests already
read. Drawn from it, a screen comes out as herdr's did, cell for cell.

**Cost:** A picture shows the headless terminal's screen, not a real one's: its widths and its answers are the ones the
terminal tests trust (TT-D2), which the real-terminal set checks in herdr.

## D239: A pull request runs the tests and the terminal checks its change reaches; main runs them all (2026-10-17)

**Decision:** CI runs, for a pull request, only the tests and the terminal checks its files reach; every push to
`main`, and every release, still runs them all, on every runner. The tests: each that uses a changed file — imports
it at any depth, or names it by its path from the repository — and a changed snapshot's own. The terminal checks,
which drive slipbox as a process and so import none of it: a changed check file's; for a changed file of the app's,
the checks of the features a table (`CHECKS_FOR`, `scripts/ci-scope.ts`) names it under, and every check for one it
doesn't list; every check for a change to their harness or the samples. The packages, the lockfile, the toolchain,
the workflows and a file nothing names run everything, as a push does. The terminal job is skipped when no check is
reached; the test job still runs the typecheck, the boundary and the supply chain's gates. `bun run test:changed` and
`bun run test:terminal:changed` run the same locally, against where the branch left `origin/main`, and `bun run
check` runs the first: test while working, what the change reaches. A failure on `main` that a pull request didn't
reach gets a pull request of its own. Amends GR-D9 (the tests on every change) and D230. Detail:
design/repository.md § CI.

**Why:** The maintainer's call, 2026-10-17: a pull request waited on, and was blocked by, every test and check,
though most never touch what it changed. A check failing at random elsewhere stopped an unrelated merge (removing the
Intel Mac's build waited on a symlink check's race, already fixed on `main`), and every runner ran the whole set for a
one-file fix. Testing while working, and the whole set after each merge, keeps both.

**Cost:** A break that only two pull requests together make, or one a check the table doesn't tie to the file would
catch, reaches `main` before CI says so — after the merge, not before. The table is kept by hand: a file put under
a feature whose checks don't exercise it, or one exercised by checks elsewhere, narrows the run wrongly; a test holds
it to the files and the checks there are, not to what each check runs. A file nothing names runs everything, so a
gap costs time, not cover.

**Not chosen:** Bun's own `bun test --changed`, which follows imports only: not a path a test runs or reads, a
snapshot, or the terminal checks. Requiring a branch up to date with `main` before it merges, or a merge queue (an
organisation's repository): each still runs everything, more often. Checks chosen by the commands they declare: a
changed file can't be tied to the commands it serves without running them.
