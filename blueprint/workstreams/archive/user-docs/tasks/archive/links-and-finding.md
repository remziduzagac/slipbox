---
status: done
assignee: claude-links
blocked_by: []
created: "2026-10-11"
---

# DOC-T5: The links and roots, and finding chapters

`docs/manual/links-and-roots.md` and `docs/manual/finding.md`: how slipbox reads and writes links across folders,
and every way to find something.

## Description

**links-and-roots.md**: what a root is and how slipbox finds it (its markers), a plain folder, `.slipbox/` and
`slipbox init`, a folder's name and pointers to it (`slipbox://`), switching roots (`space v`), worktrees as roots;
the forms a link takes (paths, `/`, relative, wikilinks, headings and blocks, links in front matter, links to the
repository's own hosting); conventions (how a folder writes links, and how slipbox tells); where a link lands, and how
it says so; following links (`enter`, into a new tab or the split, back and forward); writing links (`space l i`,
completion); backlinks; links kept through renames and moves; relinking and repairs; converting a folder's links;
tags; links that reach nothing.

**finding.md**: the switcher, search across notes (what it searches, where a hit opens, across roots), finding in a
note and finding and replacing (in a note, in every note, `:%s`), the outline and footnotes panes, history (back,
forward, `space h`), tags, document types (ADRs and the like: listed, ordered, `] t`), the palette as a way to find
a command.

## Acceptance criteria

- Written as requirements.md § How they are written says: no roadmap or decision ID, no links into `blueprint/`.
- Every claim checked against the code, not the design alone. Where the two disagree, the doc says what the code
  does, and the Log names the difference for the coordinator; neither the code nor the blueprint is changed here.
- Every key, setting and CLI command a chapter names exists, as the chapter names it.
- Clean under markdownlint at 120 columns; every relative link and anchor in it resolves, but those into chapters
  written in parallel, which DOC-T11 checks.

## Out of scope

- The other chapters and guides (their tasks), `docs/README.md` and the project README (DOC-T11).
- The merge review (DOC-T7); the explorer's renames, as a file operation (DOC-T6), beyond what they do to links.

## References

- Delivers: requirements.md § The documents (`manual/links-and-roots.md`, `manual/finding.md`).
- Rests on: DOC-D2, DOC-D3.
- Sources: `blueprint/design/links.md`, `roots.md`, `search.md`, `document-types.md`, `tui.md` (§ Following
  links, Switching roots, History, Side panes), `docs/keymap.md`, `docs/cli.md`, `src/core/`, `src/tui/`.

## Log

- 2026-10-11: claude-links took it (status doing). Reference set built in my scratch, `$HOME` pointed at its `home/`
  for the CLI runs, `slipbox index --home` run there so pointers and backlinks from other roots resolve.
- 2026-10-11: tried on it: `info` in every root (each convention and its source), `links` and `resolve` over
  `notes/research/link-styles.md` (every form), pointers (`slipbox://kestrel/...`, `@agent/sync-retry`, an old name,
  an unknown name), wikilinks and aliases in `hobbies/cooking`, `link` from notes, cooking and cycling,
  `backlinks` of `work/kestrel/docs/architecture.md` (other roots' included), `search` with `--scope` and the query's
  forms, `find`, `tags`, `types adr`, `problems`, `convert-links --dry-run`, `init` and `name --dry-run`.
- 2026-10-11: difference, `links` CLI: an external URL's `shown` loses a slash (`https:/example.org/spec#frag`), in
  the text output and `--json` (`src/cli/cli.ts`, the `links` command runs a URL through `graph.abs`). A bug.
- 2026-10-11: difference: a remote two named folders share (`work/kestrel`, and its clone
  `notes/research/route-engine-spike` named `engine-spike` by its `.slipbox/`) makes the qualified pointer
  `slipbox://github.com/kestrel-labs/kestrel/...` ambiguous, and a hosting URL to it from `notes` external; the reason
  says "2 repositories are called github.com/kestrel-labs/kestrel: name one by its remote" and lists that name twice,
  which can't be acted on. roots.md's table says copies of one repository open the default copy. Likely a bug.
- 2026-10-11: difference: `slipbox init --name notes --dry-run` in a folder says it would name it `notes`, while the
  real run refuses (exit 5, a different folder has the name). The dry run doesn't predict the refusal.
- 2026-10-11: difference: search's linked scope (`--scope linked`, `ctrl+a` once) takes in a worktree a note links
  into by a `@branch` pointer (`~/work/kestrel-agent-sync-retry`, its hits doubling the main checkout's); roots.md
  § Search scope says every scope leaves worktrees out. `scopeRoots` in `src/core/scope.ts` leaves them out of `all`'s
  rest only. The doc says what the code does, briefly.
- 2026-10-11: difference: following an attachment (a picture, a PDF) copies its path with the message "images render
  in a later phase" (`fileLink` in `src/tui/actions.ts`); pictures are drawn now. A stale message.
- 2026-10-11: difference, README (DOC-T11's): it says `alt+left` goes back and `alt+right` forward; `src/tui/keys.ts`
  binds them to words, back is `ctrl+o` (`space h p`) and forward `space h n`.
- 2026-10-11: note: the fixture `notes/research/link-styles.md` says a wikilink is text in the notes root; slipbox
  reads it as a link there (`[[kestrel-v2-3]]` resolves), as links.md says. The fixture's prose is stale, not the code.
- 2026-10-11: difference: a link whose heading or block isn't in its note opens the note at its reading position
  (where you last left it), not its top as links.md § Where a link lands says: `headingAnchor` returns no anchor and
  `makeView` falls back to the saved position (`src/tui/actions.ts`, `src/tui/app.ts`). A missing heading is said, a
  missing block isn't. The doc says what the code does.
- 2026-10-11: placed between chapters, for the coordinator: the footnotes view's changes (`a`, `e`, `r`, `d`,
  `space n shift+f`) are in finding.md § Footnotes, as no chapter claims footnote editing; what makes a tag is in
  links-and-roots.md § Tags, listing tags in finding.md § Tags; go to a line, `f`/`t` and `*`/`#` in finding.md, the
  heading jumps left to reading.md (linked).
- 2026-10-11: written: `docs/manual/links-and-roots.md` (539 lines) and `docs/manual/finding.md` (266 lines). Lint
  clean at 120; every key checked against `src/tui/keys.ts` (the find row's `alt` keys against `src/tui/app.ts`),
  every `:` alias against `DEFAULT_ALIASES`, every setting against `DEFAULT_CONFIG`, every command against
  `slipbox help`. Links into other chapters name only the files, no anchors. Status review.
- 2026-10-11: accepted by the user; done.
