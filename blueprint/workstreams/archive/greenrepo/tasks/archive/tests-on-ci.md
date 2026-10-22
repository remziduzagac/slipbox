---
status: done
assignee: claude-cli
blocked_by: [GR-T4]
created: "2026-10-12"
---

# GR-T8: Tests fit for CI: the flaky-test policy

The suite passes on CI runners, every time (greenrepo QA-09).

## Description

- The flaky-test policy in design/testing.md's entry: no retries; a test that fails at random is fixed, or moved to a
  named quarantine with an issue, never its assertion deleted.
- The two known ones: the background index's timing under load, and the pipeline-cookbook Mermaid snapshot when
  `export.test.ts` runs first. Fixed where the cause can be found.

## Acceptance criteria

- Each fix with a test that showed the failure (run order, or a slowed machine) before it; the suite passes three times
  running.

## Design text

### design/testing.md § Strategy

The workstream's MODIFIED entry in [design.md](../../design.md). Replaces the paragraph "**Watcher tests wait for a
condition, not a fixed time.** Events arrive asynchronously and more slowly under a loaded test run, so fixed sleeps
made them flaky." with these four:

**A test waits for a condition, never a fixed time, and counts work rather than timing it.** A CI runner, or a machine
busy with other work, is slower by a different amount each run. A test waits until what it needs has happened (a
watcher's event, `App.whenIndexed`, `whenParsed`, `whenSearchIndexed`), bounded only by its timeout, which is a
backstop for a stuck test and not a measure. Where a test guards against work done in the wrong place, it counts that
work: the background index's test (`15.1`) checks that the main thread parsed none of a big note's chunks, not how
long its slices took. A test about a time itself, a timeout that must stop something, bounds it with a wide margin
(stopped at 0.2 s, checked under 3 s). Timings are the benchmark's (§ Timings), read and not asserted.

**Nothing a test file leaves behind changes another's results.** `bun test` runs every file in one process, so what
loads lazily (`16.6`), Mermaid or MathJax, is loaded by whichever file asked first. A file whose output depends on one
loads it before it renders: `tests/render.test.ts` loads Mermaid first, so the samples'
snapshots show their diagrams as the TUI draws them once it's in, whichever file ran before. What's drawn while a
library loads is tested in a process of its own.

**Flaky tests are fixed, or quarantined by name; never retried.** No test is retried, by the runner or by itself: one
that fails at random has a cause, in the code or in the test. It is fixed, the failure shown before the fix (in the bad
order, or on a slowed machine: `taskset -c 0` puts the process and its parse workers on one CPU) and gone after. While
it can't be, it is quarantined: `test.skip`, with a `// quarantined: <issue>` comment saying how it fails, its
assertions as they were. `bun test` counts it as skipped, and `grep -rn "quarantined:" tests/` lists them; it comes
back with its fix. An assertion is never deleted or loosened to make a test pass.

**CI runs the suite on Linux and macOS** (GR-D9), on every change: the same `bun run check` as a local run.

### design/testing.md § Timings

In the first paragraph, "a reload, a width change, and the CLI's `task`, `read`, `render`, `find` and `backlinks`"
becomes "a reload, a width change, the CLI's `task`, `read`, `render`, `find` and `backlinks`, and the background
index's longest slice on the main thread". Added after that paragraph:

**The background index** (`15.1`, `bun scripts/bench.ts "background index"`): a note of 20,000 lines with words of its
own, parsed on other threads, three passes; the longest main-thread slice of each, the parse slices and the note's
chunks put together. The test counts that work instead of timing it (§ Strategy). Measured 2026-10-12 on the VM, the
machine shared: 37 ms median (36 to 41).

## Log

- 2026-10-12, the background index. `tests/tui.test.ts`, "the background index parses a big note on other threads: no
  slice of it holds the keys for long (15.1)", waited on a clock (at most 400 × 50 ms) and asserted every main-thread
  slice under 250 ms. With the machine loaded by other work (a load average of 10 to 24 on 10 CPUs) it failed in each of
  four runs, three ways: a slice over 250 ms (394.7), the pass not done after 20 s (`indexing` 1), the 30 s timeout. The
  longest slice, where it was looked at, was the 40,000-line note's chunks put together (273 ms). On one CPU
  (`taskset -c 0`) it failed 3 of 3, its longest slices 324, 276 and 300 ms. Fixed: `App.whenIndexed()` waits for the
  pass however long it takes; the test counts what the main thread does for the big note, a parse from chunks a worker
  parsed every one of (`[0]`), never one whole, instead of timing it; the note is twice `BACKGROUND_PARSE` (about 4,000
  lines), its size no longer needing to make a parse here take seconds. On one CPU it passes 3 of 3 (2.4 s).
  Mutation-checked, each failing it: no threads (`unparsedOver(Infinity)`), `parseSome` without the skip, the workers'
  chunks not adopted. The timing went to the benchmark (`scripts/bench.ts`, run: 37 ms median).
- 2026-10-12, the cookbook's snapshot. The state shared: the Mermaid library, loaded lazily (16.6), the process's.
  `render.test.ts`'s snapshots ran before the library was in, so the cookbook's diagram was its code, labelled
  `mermaid`; after `export.test.ts`, which loads it, the diagram is drawn: too wide at 80, so
  `mermaid — too wide to draw`. Not a bug in the code: drawn as code while it loads and again once it's in is 16.6's
  design, and the TUI exporting then rendering draws it, as it should. Isolated in the test: `render.test.ts` loads
  Mermaid in a file-level `beforeAll`, and the snapshot is the one with the library in (one line: the label). Before:
  `bun test tests/export.test.ts tests/render.test.ts` failed (the cookbook @ 80). After: that order, `render` then
  `export`, and `render` alone pass; without the `beforeAll`, `render` alone fails (mutation-checked).
- Checked: the typecheck; `biome ci --error-on-warnings` on the files changed; the test files above. The full suite's
  three runs are the coordinator's, the CPU being shared.
- Found, not chased (asserting a time, at risk on a slow runner): `tests/core.test.ts` "diffLines" (20,000 lines in
  under 200 ms) and "hostile notes stay fast" (each under 2 s); `tests/render.test.ts` "a long paragraph wraps in
  linear time" (a ratio of two timings, under 3); `tests/cli.test.ts` "review cycle 5: replace answers in linear time"
  (a process, under 10 s); `tests/vault.test.ts` "slipbox index --home" (the activity mark, written at the command's
  start, under 5 s old after the pass). Within the margin: the 0.3 s nvim probe checked under 3 s (`core.test.ts`), the
  0.2 s linter timeout under 3 s (`servers.test.ts`).
