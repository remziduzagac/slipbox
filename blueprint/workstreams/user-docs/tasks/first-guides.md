---
status: todo
assignee:
blocked_by: []
created: "2026-10-11"
---

# DOC-T9: The install, getting started and making it yours guides

`docs/guides/install.md`, `docs/guides/getting-started.md` and `docs/guides/making-it-yours.md`: the guides a
newcomer reads first.

## Description

**install.md**: what you need (a terminal, and what makes it better: true colour, a Nerd Font, pictures; Bun only to
run from source); installing from source, as it is done today (`bun install`, the launcher, `--skill`); from a
release (`install.sh`, Homebrew), saying plainly that none is published yet; Windows through WSL; checking it works;
upgrading; uninstalling.

**getting-started.md**: a first session in your own folder: open it, the screen in a sentence, move, open a note
(the explorer, the switcher), follow a link and come back, search, change a line and save, tick a task, quit; where to
go next. Short.

**making-it-yours.md**: a theme, the glyphs, your own keys (remapping, the leader, aliases, which-key groups),
settings for every folder or for one, your editor, spelling dictionaries, indentation.

## Acceptance criteria

- Written as requirements.md § How they are written says: no roadmap or decision ID, no links into `blueprint/`.
- Each step checked against the code; the CLI steps run as written on the reference set (`scripts/build-home.ts`),
  noted in the Log. The TUI steps are tried live in DOC-T12.
- It sends the reader to the manual for the rest: links to chapters by file; to a section only where the section is
  certain, which DOC-T11 checks.
- Clean under markdownlint at 120 columns.

## Out of scope

- The manual (DOC-T1–DOC-T8), `docs/README.md` and the project README (DOC-T11).
- Trying the TUI steps live (DOC-T12).

## References

- Delivers: requirements.md § The documents (`guides/install.md`, `guides/getting-started.md`,
  `guides/making-it-yours.md`), § Goals (the first).
- Rests on: DOC-D2, DOC-D3, DOC-D4.
- Sources: `README.md`, `docs/keymap.md`, `docs/configuration.md`, `blueprint/design/distribution.md`,
  `scripts/install-local.sh`, `scripts/release.ts`, `src/`.

## Log
