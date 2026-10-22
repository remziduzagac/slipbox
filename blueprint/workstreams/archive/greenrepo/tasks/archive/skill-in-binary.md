---
status: done
assignee: claude-cli
blocked_by: [GR-T4]
created: "2026-10-12"
---

# GR-T12: The skill in the binary

A release install gets the skill that matches it (GR-D10).

## Description

- `slipbox skill` prints `skills/slipbox/SKILL.md`, built into the binary; `slipbox skill --install <dir>` writes
  `<dir>/slipbox/SKILL.md`, saying where, and refuses to write over a file it didn't write unless asked.
- The docs: the CLI chapter, the agents guide (a release install has the skill now), the install guide; the skill
  mentions it.
- The design text under its entry in [design.md](../../design.md).

## Acceptance criteria

- Tests of both, and of the compiled binary printing the skill; tried live (D209); `tests/docs.test.ts` passes.

## Design text

No design section lists the CLI's commands one by one: the list is D18's, and the user's reference is
`docs/manual/cli.md` (how-it-works.md § The parts), which this task updated. The design's pieces:

**design/distribution.md § Releases**, a paragraph after the one on `RELEASE` ("Run from source, or built by hand…"):

> The skill for agents, `skills/slipbox/SKILL.md`, is built into the binary by Bun's text import (`core/skill.ts`), so
> each release carries the skill that matches its commands (GR-D10). `slipbox skill` prints it; `slipbox skill
> --install <dir>` writes `<dir>/slipbox/SKILL.md` atomically, and run again with the same skill there, writes
> nothing. It writes over an earlier slipbox's skill (its front matter names it `slipbox`), never over another file,
> and never through a link — `~/.claude/skills/slipbox` linked to a checkout's `skills/slipbox` by
> `scripts/install-local.sh --skill`, whose file it would change — unless `--force`, which removes the link, never
> what it leads to, and writes in its place (exit 5 otherwise). The installer and Homebrew don't install it: where an
> agent reads skills is the user's to say. `tests/distribution.test.ts` checks the packed binary prints the source's
> file.

**design/how-it-works.md § Module map**, a row after `core/update.ts`'s:

```text
| `core/skill.ts` | GR-D10 | the skill for agents, built in: printed; installed, never over another's file or a link |
```

**design/testing.md § Strategy (`0.4`)**, the `tests/distribution.test.ts` row: "a release built, installed,
upgraded, removed" becomes "a release built (its binary printing the skill), installed, upgraded, removed".

## Log

- 2026-10-12: `src/core/skill.ts` (the skill as a text import, `isSlipboxSkill`, `installSkill`: atomic through
  `atomicWrite`, the refusals as `SkillRefused`), `src/markdown.d.ts` (the `*.md` module's type); the `skill` command
  in `src/cli/cli.ts` (help, `CLI_COMMANDS`, `MAX_ARGS`, `FLAGS`, the handler, refusals exit 5) and `--install`,
  `--force` in `src/cli/args.ts`. No command spec: like `upgrade` and `uninstall`, it's no TUI action. A link at
  `<dir>/slipbox` or its `SKILL.md` is refused too (beyond the task's text): writing through a source checkout's link
  would change the checkout's skill. The skill gains a line on `slipbox skill`; the docs: `docs/manual/cli.md` (the
  table, `### skill`, § For agents and scripts), `docs/guides/agents.md` (§ Give the agent the skill),
  `docs/guides/install.md` (a release carries it; again after an upgrade; uninstall leaves it), the README.
- Checked: Bun's text import is embedded by package.json's build (its autoload flags off): a toy compiled with those
  flags printed the file after the file was moved away. Tests in `tests/cli.test.ts`: print (human, `--json`);
  install, said where, relative to the cwd; again a no-op; an older slipbox skill updated; `--dry-run` writes nothing
  and refuses as the run would; another's file refused (exit 5) and written over with `--force`; a folder or file in
  the way refused even with `--force`; a linked folder or file refused, `--force` replacing the link and leaving its
  target; `isSlipboxSkill`'s cases. Six mutants of `installSkill` (each refusal, the no-op, the dry run, the unlink,
  the not-a-folder check) each fail a test. `tests/distribution.test.ts`: the packed binary's `skill` equals the
  source's file. Ran: those two files (cli.test.ts filtered to the skill, help and upgrade tests; distribution.test.ts
  whole, 42 pass), `tests/docs.test.ts`, the typecheck, the boundary, Biome on the touched files, markdownlint on the
  touched Markdown.
- Tried live (D209): `bun src/main.ts skill | head`, `| cmp` with the file; `--install` into a scratch folder: dry
  run, written, again unchanged, an older skill updated, another's refused and forced, a linked folder refused and
  forced (the link's target unchanged). `bun run build`, the binary copied out and run from `/tmp`: `skill` equals the
  file; `--install` written, then unchanged.
