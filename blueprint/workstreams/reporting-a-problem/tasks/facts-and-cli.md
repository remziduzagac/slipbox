---
status: doing
assignee: claude-5
created: "2026-10-24"
---

# RPT-T1: The facts, and `slipbox report`

What slipbox knows of itself, the system and the terminal, and `slipbox report` printing it (RPT-D1, RPT-D5;
design.md § The facts, § From the CLI).

## Description

- `core/report.ts`: the facts — the version, the channel (the installer's install only), the release's platform or
  "from source or built by hand", Bun's version; how it was installed, in the form's words; the system, kernel,
  processor and WSL; the terminal (its answer to XTVERSION when the TUI has one, `TERM_PROGRAM` and its version,
  `TERM`, the size), the multiplexer (OpenTUI's, else the environment's) and SSH, as presence only. Each sanitized and
  cut to a line. Their sections as Markdown, and the form's fields by id.
- `cli/report.ts`: `slipbox report` (and `--json`: `{ facts, fields, body, url }`), dispatched by `cli/cli.ts` before
  any vault is looked for; the size only when stdout is a terminal; an argument refused.

## Acceptance criteria

- Unit tests: each install (the installer's, stable and preview; Homebrew's; a release placed by hand; source); Linux,
  macOS, WSL; tmux, zellij, screen, herdsman, herdr, OpenTUI's own; SSH by each variable, never its value; a value
  with escapes.
- CLI tests: `slipbox report` and `--json` anywhere, in a vault with a broken config, writing no state; with an
  argument, refused.
