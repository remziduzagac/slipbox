---
status: done
assignee: claude-words
blocked_by: []
created: "2026-10-12"
---

# DF-T12: Your config says root; the hover on a missing heading; named clones; the popups' titles

The follow-ups F3, F7, F11, F12.

## Description

- **F3 (DF-D22):** every config value or name that takes vault takes root too: `capture.location = "root"`, the
  explorer's actions `rename_root` and `make_root` (`[keys.explorer]`), the colour role `sidebar_root`; search
  `src/core/config.ts`, `src/tui/keys.ts` and the theme roles for others. The docs show root; the old words work.
- **F7 (DF-D26):** the hover (`shift+k`) on a link to a missing heading or block says it opens the note at its top
  (`fragmentAnchor` in `src/tui/actions.ts` has the words following uses).
- **F11 (DF-D30):** `slipbox folders default <repository> <path>` accepts a clone with a `.slipbox/` name of its
  own; `init` and `name` let a clone be named as its repository (`src/core/folders.ts`, `byRepository`).
- **F12 (DF-D31):** the which-key popup of a top-level prefix (`z`, `[`, `]`) carries its group's explanation
  in its title (`DEFAULT_GROUPS`, `src/tui/keys.ts`; the popup's drawing). Then the terminal scenario "which-key:
  z, [ and ] list every key under them" in `tests/e2e/world-fixes.ts` should check the title: say so in your report
  (the coordinator runs it).

## Acceptance criteria

- Each fix with a regression test beside the related tests, that fails without it (mutation-checked, in the Log).
- Tried on the reference set with the CLI, or headlessly as `tests/tui.test.ts` drives the TUI (D209), in the Log.
- The user docs that describe it changed in the same task, without IDs; `tests/docs.test.ts` passes.
- The new design text under its entry in DF's [design.md](../../design.md), never in the root's design files.
- The typecheck and the test files touched pass; never the whole suite (the coordinator runs it once, after merging).

## References

- Delivers: DF-D22, DF-D26, DF-D30, DF-D31.
- Docs: docs/manual/configuration.md, keys.md, screen.md, links-and-roots.md, cli.md.

## Log

- 2026-10-12 (claude-words, F3): the config's words for vault, from `core/config.ts`, `tui/keys.ts` and the theme's
  roles: `capture.location` (`ENUMS`), the explorer's `rename_vault`, `make_vault`, `unmake_vault` (`[keys.explorer]`),
  the role `sidebar_vault`. Each now says root (`root`, `rename_root`, `make_root`, `unmake_root`, `sidebar_root`); the
  old words are read as the new, unwarned: `OLD_VALUES` and `renewed` in `core/config.ts` (a value, and an explorer
  binding's action), `OLD_ROLES` in `core/theme/theme.ts`, read by `applyColorOverrides` (at the top of `[colors]` and
  in a theme's table). Docs: configuration.md (the example, `[capture]`, `[keys.explorer]`'s actions, the roles, and a
  paragraph after § Mistakes in a file naming the old words as still working), editing.md, cli.md, guides/agents.md.
- 2026-10-12 (claude-words, F3): chosen: the command ids (`vault.init`, `find.vault`…, which `[keys]` and `[aliases]`
  name) and the `[vault]` identity table keep the word, as DF-D9's terms entry keeps them: the ids are what `slipbox
  commands` lists, renaming them wider than DF-D22's examples, and the identity table is written by slipbox and read by
  every copy's slipbox, an older one losing a name written as `[root]` (recommendation). Chosen: the reference set's
  configs keep `capture.location = "vault"` and `sidebar_vault`, which now exercise the old words; CASES.md says so
  (recommendation).
- 2026-10-12 (claude-words, F7): the hover (`lsp.hover` in `tui/actions.ts`) on a link whose heading or block isn't
  there: `*No heading "pricing" in <path>: the link opens the note at its top.*`, then the note's start, where following
  opens it, titled with the path alone (it was "(nothing there)", titled `path › heading`); the heading's and path's
  punctuation escaped (`markdownText`), so `*` or `_` in them never formats. Chosen: the note's start shown under the
  sentence, as the hover of a link with no fragment shows it (recommendation). Docs: links-and-roots.md § Where a link
  lands.
- 2026-10-12 (claude-words, F11): `folderNamed` counts no copy of the same repository (`sameRepository`) as a different
  folder, so `init --name` and `name` (the CLI's own check now `folderNamed`'s, by name) let a clone take its
  repository's name. `repositoryCopies` (a folder's copies, then its repository's under other names): `setDefaultCopy`
  and `folders default` take any of them; the lookup opens a default among them, else the folder's first copy (a clone
  whose remote changed is passed over). Chosen: the TUI's `:folders-default` offers the repository's copies too, as the
  CLI's twin (recommendation); `slipbox folders` lists such a default under the repository, `*`, with its name where it
  has another (recommendation). Seen: a clone named as its repository ties with it, both called by the remote's name,
  and the first found opens (roots.md's rule) until `folders default` picks one — on the reference set the spike, found
  before kestrel, so a default chosen on kestrel's entry earlier no longer applied. Docs: links-and-roots.md § Copies of
  a folder, cli.md § `init`, § `name`, § `folders`.
- 2026-10-12 (claude-words, F12): the which-key popup of a one-key prefix titles itself with its group's explanation:
  `z › scroll: the cursor's line to the middle (z), top (t), …` (`groupExplanation` in `tui/app.ts`, drawn by
  `drawWhichKey`); a deeper one (`␣ l`, `g q`) keeps its name alone, its explanation being in the popup above. The box
  widens to the title as far as the screen allows (past the entries' 140 columns); a title still too long is cut with
  `…`, a space kept before the rule. Chosen: the explanation as `DEFAULT_GROUPS` has it (A16's, naming every key, which
  a test holds), after a colon as `[groups]` writes it — not the decision's paraphrase "scroll, fold and spelling";
  every one-key prefix alike, `g`, `y`, `ctrl+w`, `ctrl+t` and `[groups]`' own (recommendation). Docs: screen.md § The
  which-key popup, configuration.md (`[groups]`). The terminal scenario "which-key: z, [ and ] list every key under
  them…" in tests/e2e/world-fixes.ts now looks for each title's explanation (its start, which fits any pane): not run.
- 2026-10-12 (claude-words): tests, each beside its kin, each mutation-checked with a runner that undoes the fix and
  restores the file (16 mutations, each failing its test): core.test.ts "your config says root where it said vault…
  (DF-D22)" (capture.location's renewal, the explorer's, the role's, an old role at the top taken for a theme's table);
  tui.test.ts "shift+k on a link to a heading or block that isn't there… (DF-D26)" (the branch, the escaping, the
  title), "a top-level prefix's popup says its group's explanation in its title… (DF-D31)" (none, any first key's, the
  box not widened), ":folders-default offers a repository's every copy… (DF-D30)"; vault.test.ts "a clone with a
  .slipbox/ name of its own is still a copy… (DF-D30)" (`folderNamed`, `setDefaultCopy`, the lookup's check, the CLI's
  copies and its listing). Tests that said the old words now say root (`capture.location`, `sidebar_vault`).
- 2026-10-12 (claude-words): tried on a scratch copy of the reference set, HOME and state its own, `slipbox index
  --home` first: `folders default github.com/kestrel-labs/kestrel ~/notes/research/route-engine-spike` (refused
  before) makes the qualified pointer, `slipbox://kestrel/…` and the spike's own name open the spike, `folders` lists
  it under kestrel; back with `folders default kestrel ~/work/kestrel`; `~/work/product` refused, exit 5. `name kestrel`
  in the spike (dry run, then run) and `init --name kestrel` in a plain clone of kestrel's remote: done; `name product`
  and `init --name product` still refused. `scratch path` in notes: in the root with `vault` and `root`, the state
  folder with a warning (`must be one of state, root`) for `bogus`. Headlessly (the App and a TextCanvas, as
  tui.test.ts): `shift+k` on feedback-synthesis's `#pricing` and `#^trim-decision` shows the sentence over the PRD's
  start, titled `~/work/product/prd/route-sharing.md`; the popups of `z`, `[`, `]`, `g`, `y`, `ctrl+w` at 236 and 120
  columns (whole at 236; `z` and `g` cut at 120); a config with `rename_vault`, `make_vault`, `unmake_vault` and
  `sidebar_vault`: no warning, bound to the root actions, the role coloured.
- 2026-10-12 (claude-words): checks: the typecheck and the boundary pass; core.test.ts, vault.test.ts, docs.test.ts and
  home.test.ts's CASES test pass; tui.test.ts 651 of 662 under load, the 11 failures (Mermaid pictures, the lint
  surface, search's 30 s timeouts, linters, a component's comments) passing rerun alone, none in what this task
  touched. Not the whole suite (the coordinator's, after merging).
- 2026-10-12: accepted on the coordinator's recommendation, the user having said to take them as answers until done; done.
