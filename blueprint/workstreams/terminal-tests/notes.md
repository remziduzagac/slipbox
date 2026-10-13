# Notes: terminal tests

## Proposed (2026-10-13)

- While upgrading OpenTUI (Dependabot's #12), the user asked: rename "e2e" — end to end should mean everything; one
  check per feature, small related ones grouped; no new document set per test or task, the sample folders extended
  instead. Then: test, then fix, never test-fix-test; parallel as much as possible; and research a headless terminal,
  as a headless browser is, to run the tests in CI on every system. Agreed to each, with one limit taken from the
  coordinator: a unit test checking one rule may keep its few inline lines. Then "migrate current test to bun terminal
  while migrating also apply my suggestions about granularity and also ensure coverage, draft the testing workstream".

## The headless terminal (2026-10-13)

- **`Bun.Terminal`** (read: bun.com's reference; Bun 1.3.5's notes): a pseudo-terminal in the runtime, POSIX only;
  `new Bun.Terminal({ cols, rows, data(term, data) })`, `Bun.spawn(argv, { terminal })`, `write`, `resize`,
  `setRawMode`, `close`.
- **`@xterm/headless`** 6.0.0 (ran: npm, MIT, no dependencies, published 2025-12-22): xterm.js without rendering; the
  buffer's lines and cells (characters, colours as RGB, attributes), the cursor; it answers a terminal's queries
  through `onData`.
- **Prototype** (ran, the session's scratch, 2026-10-13): slipbox on the demo vault in a 120×34 `Bun.Terminal`, its
  output written to the headless xterm: the screen drawn in about 300 ms; the top bar and the explorer read as text; a
  cell's foreground read as RGB; `ctrl+p` and typing filtered the switcher to `telescope-comparison`; `ctrl+q` quit,
  exit 0. Two lessons: isolate `XDG_*` as the runner does (the first try read real state), and wire the emulator's
  replies back.
- **Not chosen** (read: npm, the projects' pages): Microsoft's `tui-test` 0.1.0 (xterm.js and node-pty; a native
  module our gates forbid; its own runner on Node); VHS (scripted recordings); tmux (`capture-pane`, colours by escape
  codes).

## Today's terminal tests, run on OpenTUI 0.5.14 and 0.5.12 (2026-10-13)

- 135 scenarios in five herdr panes: 129 pass on both versions; the same six fail on both, their checks waiting for
  screens that later work changed (or something broke): "pinned tabs, save all, the change list, moving lines, the
  word count" (alpha never moved below bravo); "lint: a stand-in linter's finding…" (the gutter's pattern); "world/
  content: code in every grammar…" (no `SOURCE` on the status line); "links: next / previous, follow…"; "lens: a link
  followed from it…"; "world/content: a 4,000-line TypeScript file…". To settle in their areas' tasks.
