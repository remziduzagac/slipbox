---
status: done
assignee: claude-cli
blocked_by: [GR-T9]
created: "2026-10-12"
---

# GR-T10: Dependabot and the scanner

Dependencies kept current and watched (greenrepo DEP-01, DEP-02, DEP-04, UPK-01).

## Description

- `.github/dependabot.yml`: `bun` and `github-actions`, grouped, monthly, a cooldown of 7 days to match the
  supply chain's.
- A scanner (OSV-Scanner on `bun.lock`, or `bun audit`, whichever reads it) on a schedule and when `bun.lock`
  changes, never blocking unrelated pull requests; findings fixed or ignored in its config with a reason and a date.

## Acceptance criteria

- zizmor and actionlint clean; the scanner run once locally on `bun.lock`.

## Design text

### ADDED design/repository.md § Dependencies

**Dependabot** (`.github/dependabot.yml`) proposes updates for Bun's packages (`package.json`'s exact pins and
`bun.lock`) and for the workflows' actions (their commit pins and version comments): monthly, each ecosystem's
grouped into one pull request, titled as a Conventional Commit (`build(deps): …`, `ci(deps): …`; GR-D6). A version
is proposed only once it's seven days old (its cooldown), the week `bunfig.toml`'s `minimumReleaseAge` asks; a test
holds the two together. Security updates are Dependabot's alerts', opened at once, apart from these. They're merged
on the upkeep calendar (MAINTAINING.md; greenrepo UPK-01).

**The scanner** is `bun run audit` (`scripts/audit.ts`): `bun audit`, which reads `bun.lock` and asks npm's advisory
database about every package in it, the dev tools too, since they run here and in CI. It was chosen over
OSV-Scanner because it reads `bun.lock` itself and Bun is already pinned: no tool or action to add.
`.github/workflows/audit.yml` runs it weekly (Mondays, 04:17 UTC), on a pull request or a push to `main` that changes
`bun.lock`, the list or the workflow, and by hand. It's never in `bun run check` nor a required check: a new advisory
fails its own run, not unrelated work, and the health issue reports it.

An advisory looked at and accepted is listed in `scripts/audit.ts`' `ACCEPTED`: by package, its GHSA ids, why, and
the date to look again. Past that date its ids are no longer passed to `bun audit --ignore`, so it counts again and
the run fails until it's fixed or looked at anew. `bun audit` has no config file of its own, hence the list in code;
a test checks the list (dates, ids, reasons, none twice) and that an entry counts again after its date.

### MODIFIED design/distribution.md § The supply chain

Its closing sentence points to the above: "Dependabot and the scanner keep the dependencies current and watched:
repository.md § Dependencies." (written with GR-T9's text for the section).

## Log

- 2026-10-12: `.github/dependabot.yml`: `bun` and `github-actions`, monthly, `cooldown: default-days: 7`, one group
  per ecosystem (`applies-to: version-updates`, `patterns: ["*"]`), Conventional Commit prefixes. A test in
  `tests/distribution.test.ts` checks both ecosystems, monthly, grouped, the cooldown equal to bunfig's
  `minimumReleaseAge`.
- The scanner: `bun audit` (Bun 1.4.2) reads this repository's `bun.lock` and works; OSV-Scanner wasn't tried, as it
  would be a tool to install and pin. Run here against npm's registry: 18 advisories in three packages, all held back
  by a dependent's range (`bun audit fix --dry-run`). Each was looked at; none reaches slipbox, so each is accepted
  until 2027-01-12 with its reason in `scripts/audit.ts`:
  - `@xmldom/xmldom` 0.9.10 (13 advisories): speech-rule-engine pins it, through mathjax-full; only MathJax's
    accessibility code and menu load speech-rule-engine, and `src/core/typeset.ts` loads neither. Bundling
    `typeset.ts`, `parse.ts` and `spell.ts` (the only importers of mathjax-full, remark-math and hunspell-asm) with
    `bun build --metafile` showed neither speech-rule-engine nor xmldom in it.
  - `katex` 0.16.47 (1, low): micromark-extension-math's HTML output, which slipbox doesn't use; not in the bundle.
  - `nanoid` 2.1.11 (4): in the bundle, through hunspell-asm and emscripten-wasm-loader, which call `nanoid(45)`
    only; the advisories need a size from outside or a custom or non-secure generator (read in each advisory).
  `bun run audit` then reports "No vulnerabilities found (checked 238 packages, 18 ignored)", exit 0.
- `.github/workflows/audit.yml`: schedule, pull request and push paths (`bun.lock`, `scripts/audit.ts`, the workflow),
  by hand; `permissions: {}`, the job `contents: read`, a timeout, the pull request concurrency of `ci.yml`; Bun from
  `mise.toml`, nothing installed. zizmor (offline and online) and actionlint (with ShellCheck) clean, Dependabot's
  config included in zizmor's run. The scanner's tests (`ignoreArgs`, `acceptedProblems`) each fail under a mutation.
- For the health check (GR-T11): the audit's weekly run is Monday 04:17 UTC; the health workflow can read its last
  run on `main` (`gh run list --workflow audit.yml`).
