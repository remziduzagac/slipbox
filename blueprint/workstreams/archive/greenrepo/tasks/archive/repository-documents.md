---
status: done
assignee: claude-cli
blocked_by: []
created: "2026-10-12"
---

# GR-T7: The repository's documents

What users, maintainers and security researchers look for (greenrepo DOC-01, DOC-04, DOC-09, DOC-11, DOC-12, COM-05,
COM-07, COM-13, COM-14, COM-15, REL-01, UPK-05, UPK-08, UPK-11).

## Description

- `CHANGELOG.md`, Keep a Changelog's shape, with an Unreleased section for the first release.
- `MAINTAINING.md`: releasing; merging (GR-D6); dependencies; settings; the upkeep duties and the calendar; who can
  recover what (access continuity); the governance paragraph, the maintainer and the time they have.
- The versioning policy in the user docs: what is public (the CLI's commands, `--json`, exit codes, the config's
  keys), what each part of a version means before and after 1.0, how long a deprecation lasts.
- A how-it-works page in `docs/`, written for users.
- `SECURITY.md`: the versions supported, private vulnerability reporting, what to include, times in digits (an answer
  within 14 days, disclosure within 90).
- `ACCESSIBILITY.md` for the TUI; `ARCHITECTURE.md`, a short map of the code for contributors.
- `.github/ISSUE_TEMPLATE/`: a bug form (version, platform, what happened, what was expected, steps), blank issues
  off, `config.yml`'s links to the docs and the security policy.
- The README's first screen: what it is, status, where to get help, who maintains it.

## Acceptance criteria

- `tests/docs.test.ts` passes, the new docs mapped; the Markdown lint passes.

## Design text

What the root's files gain at consolidation, each piece under the section it lands in.

### design/repository.md § The repository's documents (ADDED, with GR-T13's file)

Each document is written for its own readers, kept with the code, and free of the blueprint's IDs; the two for
contributors and the maintainer may name the blueprint's files by path.

| Document | For | What it holds |
| --- | --- | --- |
| `README.md` | visitors | what slipbox is, getting started first, status, help, the maintainer |
| `docs/` | users | the guides and the manual, `docs/manual/versions.md` and `how-it-works.md` among them |
| `CHANGELOG.md` | users | Keep a Changelog 1.1.0: each release's entry, written at release time; the release's notes |
| `SECURITY.md` | researchers | the latest release supported; private reporting; 14 days to answer, 90 to disclose |
| `ACCESSIBILITY.md` | users | the keyboard, the mouse, colour and glyphs, motion, screen readers' limits, the CLI |
| `ARCHITECTURE.md` | contributors | the layers and the boundary, where things live, the invariants, the check |
| `MAINTAINING.md` | the maintainer, agents | governance, access continuity, merging, releasing, dependencies, upkeep |
| `.github/ISSUE_TEMPLATE/` | reporters | the bug form (all fields required but the output); blank issues off |

`MAINTAINING.md` holds the procedures greenrepo asks to be written (DOC-04, UPK-05, UPK-08, UPK-11, COM-13,
COM-14): the release steps (below), squash merging with Conventional Commit titles (GR-D6), Dependabot's monthly
merges, the supply chain's gates and admitting a dependency, the pins Dependabot doesn't see, the committed expected
settings compared weekly and monthly and never applied by automation, the health issue, who does what, the calendar,
and the steps behind `SECURITY.md`.

### design/distribution.md § Releases (MODIFIED, beside GR-T9's and GR-T14's changes)

Adds, after the paragraph on CI: the maintainer's steps around it are `MAINTAINING.md` § Releasing: the version
chosen by the versioning policy, the changelog's entry written (CI takes the notes from it), `package.json` and
`src/version.ts` bumped, merged through a pull request, the merged commit tagged `v<version>`, the draft checked (each
pack, `SHA256SUMS`, the installer, the formula, the SBOM, the attestations verified), then published. A tag is never
moved; a draft found wrong is deleted, and the fix released as the next patch.

### requirements.md § Agents and the CLI (MODIFIED)

The bullet "A small subset of commands is stable and versioned; the rest may change before 1.0 (D15)" gains: "What is
kept (the commands and flags, `--json` and its `schema`, the exit codes, the settings and the command names keys
call, the links slipbox writes and `.slipbox/`), what a minor and a patch release may change before 1.0 and after,
and how something is retired (deprecated at least a minor release ahead, in the changelog, and warned of while it
works) are the versioning policy, docs/manual/versions.md (greenrepo REL-01, DOC-09)." The section's "How:" line
adds docs/manual/versions.md.

Previously: only the bullet, and "How: design/tui.md § Parity with the CLI; docs/manual/cli.md."

### requirements.md § Documentation (MODIFIED; GR's requirements.md has the entry)

The entry's text gains: the manual opens with a how-it-works chapter, the ideas and promises users rely on, linking
the chapters rather than repeating them (greenrepo DOC-11); and has a versions chapter, the versioning policy. The
troubleshooting chapter's "Reporting a problem" names the issue tracker and the bug form, and sends security
problems to `SECURITY.md`.

## Log

- 2026-10-12: Written from the code and the docs: `CHANGELOG.md` (Unreleased, the first release's summary under
  Added); `MAINTAINING.md`; `SECURITY.md`; `ACCESSIBILITY.md`; `ARCHITECTURE.md`; `.github/ISSUE_TEMPLATE/`
  (`bug_report.yml`, `config.yml`); `docs/manual/versions.md` and `docs/manual/how-it-works.md`, mapped in
  `docs/README.md` and linked from the CLI chapter's "What stays stable", the install guide's "Upgrading" and
  getting started's "Where to go next"; troubleshooting's "Reporting a problem" names the issues and the security
  policy; the README's first screen (start here, status, help, the maintainer) and its documents list.
- Checked: `bun test tests/docs.test.ts` passes (8 tests); markdownlint-cli2 0.23.3 with the user's config clean on
  every Markdown file touched; typos clean; lychee `--offline` clean on the new and changed documents; the issue forms
  parse as YAML; the root documents searched for blueprint IDs with the docs test's patterns (none, but the blueprint
  paths MAINTAINING.md and ARCHITECTURE.md name). Every claim was checked against the code (`src/cli/cli.ts`'s
  `JSON_SCHEMA` and `EXIT`, `src/main.ts`, `scripts/release.ts`, `scripts/check-deps.ts`, `bunfig.toml`,
  `src/core/theme/theme.ts`'s mono roles, the workflows) or the docs and the design.
- For the user to decide: the maintainer's time (written neutrally); a successor or second person for access
  continuity; the versioning policy's commitments (warnings while deprecated, a new `schema` only in a major after
  1.0, command names in keys kept); where questions and ideas go, with blank issues off and only a bug form; the
  accessibility page's "hasn't been tried with a screen reader". `docs/guides/install.md` still says there's no public
  repository, for GR-T13 or GR-T14 to change when it's true.
