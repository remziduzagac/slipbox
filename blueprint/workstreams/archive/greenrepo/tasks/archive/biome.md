---
status: done
assignee: claude-cli
blocked_by: [GR-T3]
created: "2026-10-12"
---

# GR-T4: Biome, and the code formatted once

Biome formats and lints the code (GR-D7).

## Description

- `@biomejs/biome` as an exact dev dependency, a week old; `biome.json`: 120 columns, two spaces, double quotes, the
  recommended rules, with any rule the code breaks by design turned off, each with its reason.
- `bun run check` runs `biome ci`; `bun run format` formats.
- The code formatted in one commit, which only formats and fixes with safe fixes; that commit in
  `.git-blame-ignore-revs`.

## Acceptance criteria

- `bun run check` passes after the reformat, the whole suite included; no snapshot changed.

## Log

- 2026-10-12: Biome 2.5.15 (12 days old) as an exact dev dependency; `biome.jsonc` at 120 columns, two spaces,
  double quotes, trailing commas, the recommended rules with eleven turned off, each with its reason (the code's
  idioms: `!` under `noUncheckedIndexedAccess`, `while ((m = re.exec(s)))`, terminal escapes in regexes, placeholders
  like `${INPUT}`, `return done()` from a void function, a comma in a short arrow, the screen tests' runs of spaces).
  The code formatted in one commit (de86bcf, in `.git-blame-ignore-revs`), the full suite
  passing after it (1798). Then the lint's real findings fixed: unused imports, parameters and a dead function, safe
  optional chains (one reverted where a server is `""`), two `let`s typed, and four exceptions kept with a
  `biome-ignore` and its reason. `bun run lint` (`biome ci --error-on-warnings`) is in the check.

## Design text

For design/testing.md § Strategy: "Biome formats and lints the code (`biome.jsonc`: 120 columns, the recommended
rules but the code's idioms, each turned off with its reason); `bun run lint` fails on a warning, `bun run format`
writes."
