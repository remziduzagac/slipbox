---
status: todo
assignee:
blocked_by: []
created: "2026-10-11"
---

# DOC-T8: The export, privacy and troubleshooting chapters

`docs/manual/export.md`, `docs/manual/privacy.md` and `docs/manual/troubleshooting.md`.

## Description

**export.md**: asking for an export, in the TUI and with `slipbox export`; each format (Word, PDF, a web page, an
e-book, Markdown) and what it keeps (chapters, links between the notes exported, pictures, diagrams and maths, code);
where it goes; what it never does (write over a note, fetch anything); its limits.

**privacy.md**: what slipbox sends over the network, and when: the daily update check and how to turn it off;
language servers installed from npm when first needed; a picture on the internet only as `images_remote` says. What
it never sends: no telemetry, Bun's crash reports turned off. What it runs (trust, briefly, linking code.md). What it
keeps on your machine, and where; removing it all.

**troubleshooting.md**: `slipbox doctor` and `slipbox info`; the usual problems and their fixes: keys a terminal or
multiplexer swallows, pictures not drawn, icons or colours wrong, the clipboard over SSH, a language server not found,
config warnings, the TUI refusing to start without a terminal, a note changed on disk while you edited it, search out
of date, WSL; `SLIPBOX_DEBUG`; what to include when reporting a problem.

## Acceptance criteria

- Written as requirements.md § How they are written says: no roadmap or decision ID, no links into `blueprint/`.
- Every claim checked against the code, not the design alone. Where the two disagree, the doc says what the code
  does, and the Log names the difference for the coordinator; neither the code nor the blueprint is changed here.
- Every key, setting and CLI command a chapter names exists, as the chapter names it.
- Clean under markdownlint at 120 columns; every relative link and anchor in it resolves, but those into chapters
  written in parallel, which DOC-T11 checks.
- Every network access the code makes is in privacy.md (`fetch`, `curl`, npm installs, git's remotes), checked by
  a search of `src/`, listed in the Log.

## Out of scope

- The other chapters and guides (their tasks), `docs/README.md` and the project README (DOC-T11).

## References

- Delivers: requirements.md § The documents (`manual/export.md`, `manual/privacy.md`, `manual/troubleshooting.md`).
- Rests on: DOC-D2, DOC-D3.
- Sources: `blueprint/design/export.md`, `distribution.md`, `trust.md`, `how-it-works.md` § Storage,
  `rendering.md` (pictures), `docs/configuration.md` § Environment, `docs/cli.md`, `src/`.

## Log
