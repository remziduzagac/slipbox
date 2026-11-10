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

**Decision:** A small feature or fix (a setting, a key, a window) is a GitHub issue and one pull request that changes
the
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

> **Amended by D256 (2026-10-23):** the `Co-Authored-By:` trailer is a contributor's; the maintainer's commits and
> pull requests name no agent.

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

> **Amended by CIW-D1–CIW-D4 (2026-10-26):** pushes test since the nearest passing run of the same scope,
> less a verified passing pull-request tree on its base; moving a passing dev commit to test repeats no tests.
> Superseded push runs are cancelled; their commits remain in the next range.

> **Amended by D251 (2026-10-17):** a push to `dev` or `test` runs what its commits reach, as a pull request does;
> everything runs in the full run, by hand on `test`, which `main` requires; a release isn't tested again.

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

## D241: A terminal check may build its git state (2026-10-17)

**Decision:** A terminal check's notes and files still come from the sample folders (TT-D5), but the git state it
needs is made by the check, with git, in its own home: a repository's history and branches, a worktree, a bare
repository as its remote, a conflict from a real merge or rebase, an operation under way. Histories the reference set
has for itself stay in `.build/<repo>.toml`, replayed by `scripts/build-home.ts`; a state reached by doing something
(a merge that conflicts, a remote that moved, a rebase stopped) is the check's own. Amends TT-D5. As built:
`tests/terminal/checks/source-control.ts`; design/testing.md § The reference set.

**Why:** The maintainer's choice, 2026-10-17. A conflict, a remote ahead or a rebase under way can't be committed as
files, and each source-control check needs its own from its first key; made by git itself, what slipbox reads is
git's own doing.

**Cost:** Those checks' setup is code, not sample files: a case they build is in the check, not among `CASES.md`'s
files.

## D242: No merge queue, and no branch kept up to date before merging (2026-10-17)

> **Amended by D251 (2026-10-17):** pull requests merge into `dev`, which a branch is kept up to date with; a break two
> of them make together is found on `dev`'s push or in the full run, before `main`, not after.

**Decision:** `main`'s rules don't require a pull request's branch to be up to date with `main`, and there's no merge
queue. When `main` has moved under the files a pull request changes, its branch is updated (`gh pr update-branch`) and
its CI runs again before it merges. A break two pull requests make together is found by `main`'s full run after the
merge (D239) and fixed by a pull request of its own.

**Why:** The maintainer's choice, 2026-10-17. A merge queue needs an organisation's repository. Requiring branches up
to date runs CI again for every open pull request each time `main` moves, mostly for changes far apart.

**Cost:** Such a break reaches `main` before CI says so. It happened once: two pull requests, each green, broke the
typecheck together (2026-10-17), fixed within the hour.

**Not chosen:** a merge queue (an organisation's repository first); branches required up to date.

## D251: dev, test, then main: tested as it moves, everything before a release (2026-10-17)

> **Amended by D266 (2026-10-27):** PRs keep lint, reached Linux/macOS unit tests and site; only terminal checks
> move to pushes, previews and the full run. Scope 3 disables PR-tree reuse so squash pushes retain terminal coverage.

> **Amended by CIW-D1–CIW-D4 (2026-10-26):** pushes test since the nearest passing run of the same scope,
> less a verified passing pull-request tree on its base; moving a passing dev commit to test repeats no tests.
> Superseded push runs are cancelled; their commits remain in the next range.

> **Amended by D257 (2026-10-23):** `main`'s ruleset sees `full` as a commit status the run by hand posts once it
> passed: a ruleset counts no check a run by hand reports.

**Decision:** Work moves through three branches. Every pull request merges into `dev`, now the default branch, once
reviewed and its `ci` check passed; `ci` runs the lint, the typecheck, and the tests and terminal checks the change
reaches (D239), and a push to `dev` the same on the merged commit. `dev` is moved to `test` (a fast-forward) when a
batch of work is ready to try: that publishes a preview to try by hand (GR-D13) and runs, again, what changed since
`test` last moved. `ci` run by hand on `test` runs everything — every unit test on Linux and macOS, every terminal
check on all three runners — and reports `full`; it's run whenever the maintainer wants to know where things stand,
and always before a release. `main`, the released state, is moved to `test`'s commit and tagged at once; its ruleset
takes only a commit that passed `full`, and `release.yml` refuses a tag whose commit didn't, before building without
testing again. What trying a preview or the full run finds becomes an issue, fixed by a pull request into `dev`.
Agents review and merge into `dev`, move `test` and `main`, run the full suite and release when the maintainer asks;
settings stay the maintainer's. While working, a change runs its own tests and its feature's terminal check, never
the whole suite; a pull request carries a test for the change (a bug fix's checked by undoing the fix once), the user
docs and a CHANGELOG line where users notice, the design where behaviour changes, and a decision only for a real
choice. Amends GR-D6, GR-D13, D239 and D242. Detail: `MAINTAINING.md` § From dev to a release, design/repository.md
§ CI.

**Why:** The maintainer's call, 2026-10-17: every pull request carried every test and check, and every agent the
whole ceremony around them, so a small change took twenty-five minutes and an unrelated flaky check blocked merges and
a release (0.4.0's build failed twice on checks no change had touched). A flow where each step tests what it's for —
the change in its pull request, the batch in a preview tried by hand, everything before a release — keeps `main`
tested whole while the day's work stays light.

**Cost:** A break two pull requests make together, or one only the full suite catches, sits on `dev` and `test` until
a push or a full run finds it — before `main`, never after. A release waits for a full run on its commit. The previews
and the full run are started by hand, so a batch nobody moves isn't tried.

**Not chosen:** the full suite on every move to `test` (most batches are tried, not released; the full run is a
button away); a release that tests again on every platform (the commit passed `full`, and the release's own runs
failed on unrelated flaky checks); a separate workflow for the full run (the same jobs, named `full` when run by
hand, keep one definition).

## D256: The maintainer's commits and pull requests name no agent (2026-10-23)

**Decision:** A commit or a pull request of the maintainer's carries no agent's name, however much of it an agent
wrote: no `Co-Authored-By:` trailer naming Claude, Codex or another, and no "Generated with" line in the description.
Both are left out because a squash merge takes the pull request's description and its commits' `Co-authored-by:`
trailers into the commit on `dev`. A contributor's commit made with an agent still names it in that trailer (D234,
`CONTRIBUTING.md`). The history that started afresh on 2026-10-22 was written again before 0.5.0 without the trailers
it had, its files, authors and dates the same; a hash of one of its first four commits cited elsewhere names a commit
that isn't kept. Amends D234. Detail: `AGENTS.md` § Working here, `MAINTAINING.md` § Merging a change.

**Why:** The maintainer's call, 2026-10-22: the history reads as the maintainer's own work, whatever tools made it.

**Cost:** The history doesn't say which of the maintainer's changes an agent wrote. The rule is the maintainer's alone:
nothing checks a commit for a trailer, so a contributor's keep theirs.

**Not chosen:** no trailer for anyone (a contributor's agent stays named, as D234 asks); a check in CI refusing the
trailer (it would refuse a contributor's).

## D257: `full` reported again as a commit status, the one `main`'s ruleset sees (2026-10-23)

**Decision:** `ci` run by hand, once every job passed and it reported `full`, posts a commit status `full` on its
commit with the run's own token, from a job of its own (`status`, which alone holds `statuses: write`). `main`'s
ruleset, which requires `full` from GitHub Actions, is met by that status. A ruleset counts no check that a run by hand
reports (GitHub's "Troubleshooting required status checks"), so it never saw the job's `full`: 0.5.0's commit, which
had passed it, was refused (`Required status check "full" is expected`), and reached `main` with the ruleset off for
that one push. `release.yml` still reads the check. Amends D251. Detail: design/repository.md § CI, `MAINTAINING.md`
§ From dev to a release.

**Why:** It keeps D251 as meant: `main` takes only a commit that passed the whole suite, and no one bypasses its
ruleset, with the full run's command and the repository's settings as they were.

**Cost:** Any workflow granted `statuses: write` could post the status; only this job is. A status a person posts
doesn't count, since the ruleset takes `full` from GitHub Actions alone.

**Verify:** the next release's push of `test` to `main` is taken with the ruleset on.

**Not chosen:** `main`'s ruleset requiring `ci` and leaving `full` to `release.yml` (`main` could take a commit the
whole suite never ran on); the full run started by a push to a branch of its own (a branch kept only to start it, and a
new command for the full run).

## D262: A test holds the spell checker's thread in the worker, on the thread's own clock (25.6, 2026-10-23)

**Decision:** The spell checker's worker takes a test's hold (`holdBuild` in `core/spell-thread.ts`, the `hold` op in
`core/spell-worker.ts`): the next time the thread is asked to build the dictionary with the words named, it waits first,
with `Atomics.wait` on shared memory, until the test lets it go or its limit runs out on the thread's own clock; the
hold's state (`HOLD_STATES`) is in that memory. The test that the main thread keeps its turns while a dictionary
loads counts them there, and the terminal checks hold slipbox's own thread the same way, through a preloaded test
script. Decided with issue #15 (T18), whose timed test it replaces.

**Why:** A count needs the thread held at a point the test controls. Held on the thread's own clock, a main thread held
until the dictionary is there is let go, and fails the test instead of hanging the run. It needs no child process and
no named pipe, and runs on every platform.

**Cost:** A test's op ships in the worker: a lookup by the dictionary's words on each request, and a caller in the
process could hold the thread for up to its limit. Nothing a vault or a setting holds can.

**Not chosen:** the dictionary's words a named pipe the test writes into (a child process to write it, POSIX only, and a
thread blocked in a read nothing can end); a stand-in `Worker` on the main thread that delays the request (its clock is
the main thread's: a main thread held until the dictionary is there would hang the run); turns counted while the
dictionary loads, unheld, as the syntax pass's test counts them (ticks before a build on the main thread pass it, and a
pause covering the whole load fails it).


## D266: Terminal checks after merge; unit tests and site stay on pull requests (2026-10-27)

> **Amended by D273 (2026-11-09):** a pull request runs its macOS unit tests only when it changes what differs on
> macOS or carries the `macos` label, and each macOS job waits for its Linux job; pushes and the full run keep macOS.

**Decision:** The maintainer's choice, 2026-10-27: pull requests run lint (Biome, sizes, workflows, docs and docs
tests), changes, the typecheck, boundary and dependency gates, reached unit tests on Ubuntu and macOS, CodeQL, site and
the aggregate `ci` check. Only the terminal job is skipped on pull requests. Pushes to `dev` and `test`, merge groups
and runs by hand keep the existing matrices; the manual run remains full. The aggregator and repository rulesets are
unchanged.

Scope version 3 stops emitting or trusting complete-check PR records (CIW-D2): a PR pass certifies no terminal checks.
Squash pushes retain the scope since the last complete push pass, repeating units on both platforms too; site keeps
running on every event. CIW-D1's conservative fallback, CIW-D3's promotion of an already-passed push tree and CIW-D4's
superseded-push handling remain. Amends D251 and CIW-D2. Detail: design/repository.md § CI and § What a push tests;
MAINTAINING.md.

**Why:** Organization PRs touch widely imported modules, so their reached set is nearly everything. Broad terminal runs
add a long PR wait and unrelated timing failures. Unit tests on both platforms remain before merge; site costs about 15
seconds and stays there too.

**Cost:** A terminal-only break can sit on `dev` until its push run finds it. Unit tests repeat after merge because
PR-tree reuse is disabled. A release still requires the full passing run.

**Not chosen:** treating a PR record without terminal coverage as complete; per-job range reuse in this small change,
which would require separate coverage and range contracts.

## D273: macOS on a pull request only for what differs there, and after Linux (2026-11-09)

**Decision:** The maintainer's choice on issue #65's item 3, option b (2026-10-24), with its item 4. A pull request
runs its macOS jobs only when it changes a file of what differs on macOS, or a test of one, or carries the `macos`
label; a push to `dev` or `test`, a merge group and a run by hand run them whatever changed, so every change runs on
macOS after its merge, and everything does in the full run. What differs is a list of path patterns beside `CHECKS_FOR`
(`MACOS` in `scripts/ci-scope.ts`), in groups, each saying why: the terminal's input and output; spawning processes and
the system's tools; SQLite, Apple's (every file that opens a database: the search index, the parse cache, the diagrams'
cache); the file system's paths, times and watchers; fonts and pictures; the installer; the workflows and what decides
what they run; the packages and the toolchain. A test of one is a test file that imports a file of `src/` the list
names. A file moved counts as both its paths (`--no-renames`), so one moved out of the list still runs it. `changes`
writes `macos`, false only for a pull request that changes none of them and has no `macos` label, read from the event's
file as data; a diff or labels it can't read run them. A label added starts a pull request's run (`labeled`), a whole
one. Each macOS job, `test-macos` and `terminal-macos`, named `test (macos-15)` and `terminal (macos-15)` as the matrix
named them, waits for its Linux job (`needs`) and runs only once that passed, for every event. `ci` counts a job
skipped as passed, as before, so the required checks don't change. `SCOPE_VERSION` stays 3: since D266 no pull
request's pass is taken for a push's, so a push already tests macOS on all it brought. Amends D266 and GR-D9. Detail:
design/repository.md § CI, design/testing.md § Strategy, `MAINTAINING.md` § Merging a change.

**Why:** Issue #65: the account runs at most five macOS jobs at once, and with a dozen pull requests open their checks
waited mostly on a macOS runner (PR #35's macOS terminal job about 55 minutes before it started). Most changes behave
on macOS as on Linux; option b keeps macOS on the parts that are the system's own, the changes most likely to break
there: only macOS's runs caught the parse cache failing to open, twice, the second a lock taken before its busy
timeout (#232, #235). A test goes with what it imports, not only with the folder it sits in, since the tests don't all
mirror the source's folders. After Linux, a change that fails there holds no macOS runner the others wait for.

**Cost:** A macOS-only break in a file the list doesn't name reaches `dev`, where its push run finds it; `test`'s full
run still gates a release (D251). About a fifth of the test files import a file of the list, so a change to one runs
macOS, most for a helper they only use (the folders' and real paths', `paths.ts`). `needs` is the same for every event,
so a push's and the full run's macOS jobs wait for Linux too: those runs take Linux's time, then macOS's, and a failure
on Linux leaves macOS unrun until the failed jobs are run again, which runs the jobs after them. Any label added runs a
pull request's checks again: GitHub starts a run for every label, and one that skipped its jobs would report `ci`
passed. A Dependabot pull request, given two labels a moment after it opens, starts three runs, the first two cancelled
within seconds by the next; no way was found to tell a label's run apart that couldn't let a run of skipped jobs report
`ci` passed, or cancel a real one. The list is kept by hand; a test holds each pattern to a file there is, and every
file that opens SQLite to the list, not to what differs.

**Verify:** a pull request that changes no file of the list and has no label shows `test (macos-15)` skipped and `ci`
passed, and adding the `macos` label runs it.

**Not chosen:** option a, Linux alone on a pull request, and option c, macOS on every one; a macOS job per event, to
wait for Linux on a pull request only (ideas.md § Process).

## D275: Linux's tests and terminal checks in three parts each, by file (2026-11-10)

> **Amended by D276 (2026-11-10):** `SLOW_TESTS` is rewritten from CI's own reports of each test's time, by
> `bun scripts/test-times.ts slow <run>…`, by hand and committed; each `test` job reports its tests' times, and a test
> file over its budget fails Linux's and is a warning on macOS.

**Decision:** Issue #65's item 1 (CIW-T5). CI's `test` job runs in three parts on `ubuntu-24.04`, and its `terminal`
job in three parts on each of `ubuntu-24.04` and `ubuntu-24.04-arm`, each part on a runner of its own: the matrix's
`shard`, `1/3` to `3/3`, which the job hands to `bun run test:changed` and `bun run test:terminal:changed` as
`SCOPE_SHARD`. `test` splits by test file: the tests a change reaches (D239), or, in a run of everything, every test
file under `tests/`, where a test holds every file `bun test` would find. `terminal` splits by check file
(`tests/terminal/checks/<name>.ts`): the runner's `--shard i/n` takes its part of the checks its filters chose, so a
feature's checks, and the release builds the checks of upgrading share, stay on one runner. The rule
(`scripts/ci-shard.ts`): the heaviest first, each into the part with the least so far, the lowest on a tie, and files
of the same weight in their paths' order, so the same files make the same parts. A test file weighs its seconds on a
runner when a run measured it slow (`SLOW_TESTS`: eight seconds or more), else one; a check file weighs its checks, a
check run alone counting four, a runner's cores, since nothing else runs meanwhile. Each part runs the typecheck and
the gates too, a few seconds. macOS's jobs stay whole: split, they would only wait longer for the account's five macOS
runners; each waits for every Linux part (D273). `ci` is unchanged: GitHub gives a job in parts one result, a success
only when every part passed, so a part failed or cancelled fails it. Amends GR-D9 and TT-D6. Detail:
design/repository.md § CI, design/testing.md § Strategy and the runner, `MAINTAINING.md` § Merging a change.

**Why:** Issue #65 asks for a scoped pull request's Linux checks in about five minutes. Its `test` job took 7 to 11
minutes (pull requests' runs of 2026-11-10: 420 to 683 seconds), nearly all of it the tests, one file after another; a
push's terminal checks took 15 to 18 minutes on `ubuntu-24.04` and 13 to 14 on arm (every check: 911 to 1,069 seconds,
and 773 to 837). By check file, not by area: there are five areas, and links and files holds two fifths of the checks'
time, so a part by area couldn't be shorter than about seven minutes; there are 76 check files. Weighed by recorded
time only for the slow files: by count alone, a run's parts differed by up to 100 seconds, its few slow files (31
seconds the longest) landing together. With their seconds the parts come within a slow file of each other; the rest
are too alike (0.7 seconds on average) and change too much from run to run to be worth recording.

**Cost:** More jobs at once: a pull request's three `test` parts where there was one job, a push's six terminal parts
where there were two. An account runs a limited number of jobs at once (20 on GitHub's free plan, five of them on
macOS), so with many pull requests open, Linux can queue too. Each part sets its runner up again, about 15 seconds,
and runs the typecheck and the gates. `SLOW_TESTS` is kept by hand: a test holds each name to a file there is, but a
file grown slow isn't seen until each test's time is reported (CIW-T9); a stale list only evens the parts less. The
terminal parts first run on a push to `dev`, since a pull request runs no terminal check (D266).

**Verify:** the first push to `dev` after it runs six terminal parts, each about a third of its runner's checks, and
the next full run every test and check in its parts.

**Not chosen:** two parts, whose tests would still take five to six minutes; parts by area; parts by count alone; parts
weighed by the times of earlier runs, read as each run starts, which would change its parts from one run to the next;
Bun's own `bun test --parallel` on one runner (ideas.md § Process).

## D276: Each test's time reported in CI, and a test file's held to a budget (2026-11-10)

**Decision:** Issue #65's item 6 (CIW-T9). Each `test` job, each Linux part and macOS's, has `bun test` write its
JUnit report (`--reporter=junit`, which `ci:scope` adds when `SCOPE_REPORT` names a file in the runner's temporary
folder; for a part with nothing to run, an empty report). Once the tests ran, passed or failed, `bun run test:times`
reads it: the ten slowest test files and the ten slowest tests, in the job's log and its step summary, and for each
test file over its budget, naming the file, its time and the budget, a failure on Linux and a warning on macOS (a
`::warning::` annotation, said in the step summary too). The job uploads the report as `test-times-<system>-<part>`
(`Linux-0` to `Linux-2`, the parts 1/3 to 3/3; `macOS-0`), kept 30 days, a job run again replacing its own
(`overwrite`), with no permission added and no secret. A test file's budget (`scripts/test-times.ts`) is `BUDGET`, 30
seconds on a Linux runner, as long as one test may take; or, for a file known to be slow, its own in `BUDGETS`, with
why, as `check:size` caps a file past its limit: such a file doesn't fail, and can't grow past its own unseen. Each
budget is at least twice (`HEADROOM`) the longest its file took on Linux in the runs it was chosen from, up to the
next five seconds: the ten files over 15 seconds have their own, 35 to 70 seconds. On macOS every budget is four
times Linux's (`MACOS_FACTOR`), and a file past it is a warning, not a failure: a file's time there moves too much to
tell a change that made it slower from a slow runner. The log says a file within its budget but not by one and a half
times (`MARGIN`), without failing: the early sign. Whether a file still needs a budget of its own is left to whoever
reads both systems' reports: one run sees one system. A report missing, or a file that isn't one, fails the step on
either system.
`SLOW_TESTS`, which weighs the Linux parts (D275), is rewritten from runs' reports by `bun scripts/test-times.ts slow
<run>…`: each file's longest over the runs' Linux reports, eight seconds or more, a file the runs didn't measure kept
as it was. It's run by hand and committed, so a tree's parts stay the same from one run of it to the next. Amends
D275 and GR-D9. Detail: design/testing.md § Timeout policy, design/repository.md § CI, `MAINTAINING.md` § Merging a
change.

**Why:** Issue #65: nothing showed which tests a run's time went on, and a file grown slow wasn't seen (D275 kept
`SLOW_TESTS` by hand). The budget was chosen from the job logs of 2026-11-09 and 2026-11-10, each test's time and each
file's (62 runs; 63 Linux test jobs or parts and 41 macOS jobs that passed), and this change's two runs' reports. On
Linux, of 546 test files, five took 28.5 to 32.8 seconds at their longest, five more 15.5 to 19.9, and every other
10.7 or less: 30 seconds is more than twice each of those, and a slow test added to almost any file shows. A file's
time on Linux moved up to twice from one run to the next (the worker requests' 12.8 to 29.2 seconds; most far less),
so no budget is less than twice its file's longest. One and a half times, chosen first, left the slowest files
without a budget of their own, at 19.9 and 19.2 seconds, one slow runner from turning `ci` red with nothing changed.
On macOS a run of every test took from about Linux's time to over twice it, and a file's time moved far more: the
samples' from 15 to 121 seconds, eight times, the header's from 6 to 36, the branches' panel's from 8.5 to 33, up to
five times its longest on Linux. No factor there makes a file past its budget mean a change made it slower, so it
warns; four times Linux's keeps the warning for a file gone far slower (the samples' 121 seconds within 240). A run's
report is the data, so `SLOW_TESTS` is rewritten from it rather than by reading logs.

**Cost:** A Linux job has one more way to fail: a runner more than twice as slow as any recorded could fail a file
within its budget; a file over is made faster, split, or given a budget of its own, with why, in the same pull
request. On macOS a budget only warns: a file gone slower there alone is seen, not stopped, and Linux holds the rest.
Twice the longest lets a file grow further before it fails than a closer budget would; the note at one and a half
times says it sooner. Each test job takes a few seconds more, for the report, its summary and its upload.
`SLOW_TESTS` is still rewritten by hand: a stale list only evens the parts less. A test file that fails to load is
missing from Bun's report, but the run fails anyway.

**Verify:** this change's own run, which runs every test: each `test` job's step summary lists its slowest files and
tests, its `test-times-*` artifact holds the report, and no file is over its budget. Unit tests: a file over its
budget fails on Linux and warns on macOS, the warning in the summary; each upload replaces its own.

**Not chosen:** a budget per test, which the 30-second timeout is already; each file's budget from its own recorded
time with a margin, which every file's time moving would rewrite; budgets one and a half times the longest, which left
the slowest files a slow runner from failing; macOS failing past its budget, which its times' moving would turn red
with nothing changed, and no budget there at all, which would leave a file far slower there unsaid; Bun's `--timings`
(per-file times that balance `bun test --shard`), as the parts are a change's own files, split by
`scripts/ci-shard.ts`; the times read from earlier runs as a run starts, which would change a tree's parts from one run
to the next (D275); `SLOW_TESTS` rewritten by the weekly health job, which would need a token that writes (ideas.md §
Process).
