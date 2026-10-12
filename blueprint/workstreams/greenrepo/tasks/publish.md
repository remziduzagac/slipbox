---
status: doing
assignee: claude-cli
blocked_by: [GR-T1, GR-T2, GR-T3, GR-T4, GR-T5, GR-T6, GR-T7, GR-T8, GR-T9, GR-T10, GR-T11, GR-T12]
created: "2026-10-12"
---

# GR-T13: The repository on GitHub

slipbox public on GitHub, set as greenrepo has it (GR-D2, GR-D5, GR-D6).

## Description

- Shown to the user first, then done: the repository created (description, topics), the first push, and every
  setting: merge methods, features off, security switches (secret scanning and push protection, Dependabot alerts
  and updates, private vulnerability reporting, CodeQL's default setup with `actions`), Actions' default token and
  SHA pinning, immutable releases, pull requests from collaborators only, the rulesets (`main`: no deletion or force
  push, a pull request and the `ci` check; `v*` tags: admins only), the `release` environment, the labels.
- CI green on both systems; the first health run; the expected settings matching the live ones.
- design/repository.md and requirements.md § The repository, written under their entries.

## Acceptance criteria

- Every setting as the expected-settings file says; the user approved each before it was applied.

## Log

- 2026-10-12: the user approved the plan as listed. Before the push: the history's personal address rewritten to the
  noreply one (git filter-repo with a mailmap; a bundle of the old history kept in the session's scratch), the hashes
  the files cite remapped, gitleaks run again (the same false positive only).
- Created `remziduzagac/slipbox`, public, with its description and topics; `main` pushed alone (no tags, not the
  four old local branches).
- Applied, each read back: squash only (title and body from the pull request), merged branches deleted, update branch
  on; wiki, projects and discussions off; pull requests from collaborators only; secret scanning and push protection;
  Dependabot alerts and security updates; private vulnerability reporting; Actions' SHA pinning required; the
  workflow token read-only and unable to approve; immutable releases; CodeQL's default setup (`actions`,
  `javascript-typescript`); the `release` environment, `v*` tags only; the labels `needs info` and
  `repository-health`. The rulesets wait for CI to pass on both systems.
- CI's first run: lint and Linux passed; macOS failed 93 tests, the suite's first run on a Mac (`14.13`). Fixed on
  the `fix/macos` branch, CI run there by hand:
  - the tests' temporary folder by its real path (macOS reaches `/var/folders` through `/private`): 93 → 29;
  - a real bug where case folds: a link spelled `Note.md` to `note.md` reached the file a second time under the
    link's spelling (`reachFile`), and an existing target kept the link's spelling (`onDisk` in `links.ts`);
  - tests that assumed Linux: two files differing only in case, the installer's Rosetta case on an arm64 Mac, a
    popup too narrow for macOS's long temporary paths.
  - Probed: the runner's open-file limit is 10240, so the failures that pass alone but not in the whole run aren't
    descriptors. Bisected (the TUI tests' groups with two that failed, locally and then in macOS's file order): the
    group that starts OpenTUI's own renderer. **A real bug in the TUI:** OpenTUI's renderer makes a global `window`
    (`{}`) and leaves it; the Mermaid library's layout engine (elkjs), set up on its first diagram, takes it for a
    browser's and throws — and the library, having swapped `setTimeout` for its own while it sets up, never puts it
    back. In the TUI, a Mermaid diagram drawn as a picture, or a note with one exported from the TUI, broke every
    timer after it (autosave, the watcher's debounce, lint, search). Fixed in `diagrams.ts` (`withoutWindow`: no
    `window` while the layout runs, `setTimeout` put back whatever happens), with a test in a process of its own,
    mutation-checked. The CLI's export never had a renderer, so never broke; the text drawing doesn't use elkjs.
  - The shared parse cache stayed open on a test file's deleted sandbox; macOS's SQLite won't write a database whose
    file is gone (Linux's still does). It now follows the cache folder (`sharedParseCache`), with a test.
  - Core and vault tests bounded at 30 s like the other files; the linear-wrap test's sizes eight times apart, its
    bound between linear and quadratic.
  - The whole suite is faster everywhere since (229 s here, from about 400): the swapped `setTimeout` had been
    slowing every run after the Mermaid tests.
  - CI green on the branch, Linux and macOS (run 38247627154): `14.13`'s SQLite question answered — Apple's SQLite
    runs FTS5 and `bm25` (the search tests pass there); the binaries' signatures are checked by the release workflow.
    Squashed onto `main` as one commit, the probes left out.
