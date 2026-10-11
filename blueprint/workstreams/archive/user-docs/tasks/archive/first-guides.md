---
status: done
assignee: claude-guides
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

- 2026-10-11: Started (claude-guides). Reading the brief, the sources and the code.
- 2026-10-11: Tried, with slipbox's state folders in my scratch (`XDG_*`): on the reference set (`build-home.ts`),
  `info`, `doctor`, `themes`, `commands`, and `write --create` refusing over `notes/inbox.md` (exit 5); from source,
  `--version`, `-V`, `upgrade` and `upgrade --check` (both: "runs from source … update its checkout", exit 1),
  `uninstall` (lists the kept folders, removes nothing). In a scratch folder: the guide's two `write --create --stdin`
  heredocs (they make `ideas/` too), `init` and `init --dry-run`, `search`, `index`, `find`, `links`, `spell`
  (`--lang en-GB`). `install-local.sh` read, not run.
- 2026-10-11: The TUI steps driven headlessly (an `App` on a `TextCanvas`, as `tests/tui.test.ts`'s harness does) on the
  guide's two-note folder, key by key as written: first screen, `space`, `?`, the switcher, the explorer and `q`,
  `tab` / `enter` / `ctrl+o`, `/` and `space f s`, `o` / type / `esc` / `ctrl+s` / `ctrl+k`, `ctrl+l`, `ctrl+q`
  refused while unsaved; and making-it-yours' `[keys]`, `leader = '\'`, `[groups]`, `[aliases]`, `alt+z = ""`,
  `"leader u 1" = "theme.set nord"`. Each did what the guide says. Still to try live: DOC-T12.
- 2026-10-11: Differences: the README has `ctrl+e` for source mode (the code: `ctrl+k`; `ctrl+e` is end of row) and
  `alt+left` for back (the code: previous word; back is `ctrl+o`, `space h p`). The guides follow the code.
- 2026-10-11: Bug, not fixed: `scripts/install-local.sh` writes the launcher with `cat >"$bin_dir/slipbox"`, which
  follows a symlink; over a release install (`~/.local/bin/slipbox` the installer's link) it would write the launcher
  script over `<data>/versions/<v>/slipbox`. install.md says to uninstall a release first.
- 2026-10-11: Found, for the coordinator: the installer's messages show a plan ID to users ("Windows is to come, plan
  14.12"); `slipbox init`'s template points at `docs/configuration.md` (DOC-T11 moves it); a plain folder opened
  without a file shows the named folders first ("Folders"), by design, which a newcomer meets once they have any
  (getting-started says `esc` closes it); in a plain folder the CLI takes a note's own folder as the folder, so
  `slipbox backlinks ideas/coffee.md` run in `~/notes` finds none while `slipbox backlinks coffee` finds `inbox.md`;
  two keys bound to one command with different arguments show the same which-key entry; `en-GB` without a system
  `en_GB` dictionary is checked in American English, silently.
- 2026-10-11: Done: `docs/guides/install.md`, `getting-started.md`, `making-it-yours.md`, lint clean at 120; every key,
  setting and command named checked against `DEFAULT_KEYS`, `DEFAULT_SOURCE_KEYS`, `DEFAULT_CONFIG` and
  `CLI_COMMANDS`. Links into the manual by chapter only, no section anchors. Status: review (claude-guides).
- 2026-10-11: accepted by the user; done.
