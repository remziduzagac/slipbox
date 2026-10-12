# Notes: a green repository

## Adopting greenrepo (2026-10-12)

- The user shared greenrepo (draft 2) and its profiles (draft 1), their standard for repositories, as guidance for
  adjusting slipbox's repository, creating it on GitHub, pushing, and making the release flows.
- The comparison found much already met by distribution's work (`14.x`): actions pinned by commit and checked, no
  kept credentials, values through `env`, a native runner per platform, releases drafted by CI from a tag with
  `SHA256SUMS` and attestations, a POSIX installer checking sums, `upgrade` touching only its own installs, exact pins,
  a frozen lockfile, the cooldown, no install scripts, the licence gate, one check command, strict types, a
  regression test for every bug, and docs whose reference a test keeps whole.
- And missing: the licence, AGENTS.md, a single toolchain pin, a formatter and linter, `.editorconfig`, Conventional
  Commits, a flaky-test policy, the changelog, the versioning policy, the maintaining procedures, the docs checks, CI's
  hardening (`permissions: {}`, timeouts, concurrency, an aggregator, zizmor and actionlint, macOS, CodeQL),
  Dependabot, a scanner, secret scanning, every setting and the upkeep; for the conditions, an SBOM, a release
  environment, access continuity, governance, a how-it-works page, deprecation notes, a docs site, the skill in the
  release, a security policy, issue forms, accessibility and architecture.
- The user's answers: public; Apache-2.0; the blueprint goes in the repository; hardened CI; the recommendations for
  the rest (GR-D2 to GR-D9).

## Where greenrepo doesn't fit (2026-10-12)

Feedback for the draft, to give the user:

- The TypeScript profile assumes Node, pnpm and Vitest. On Bun: the toolchain pinned in `mise.toml` (or a
  `.bun-version` read by setup-bun's `bun-version-file`); `bun install --frozen-lockfile`; bunfig's
  `minimumReleaseAge` and `ignoreScripts` for the admission rows; `bun test`; `bun build --compile` for the build;
  Dependabot's `bun` ecosystem.
- Conventional Commits and a blueprint's IDs fit when the ID moves into the scope or the body.
- `tests/docs.test.ts` checks that the reference covers every command, flag and key, rather than generating it: it
  meets DOC-03's intent, which the standard could say.

## Previews and the installer (2026-10-12)

- The user runs slipbox on their VMs and asked for a preview channel through the one way slipbox is distributed, and a
  one-line installer like herdsman's. Answers: previews from a `test` branch (GR-D13), the installer on GitHub Pages
  (GR-D14), `slipbox channel` (GR-D15), all as herdsman's.
- Then, "ok lets do your suggestions": `test`'s ruleset requires the `ci` check too, so only a commit that passed it
  becomes a preview; `stable` names the highest `v` version, not the latest published; `slipbox channel` on a
  Homebrew or source install exits 5, saying how that one updates; `uninstall` takes the `channel` file with the
  install's links.
