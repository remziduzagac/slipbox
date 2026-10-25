# ASI decisions

## ASI-D1: automatic installation and refresh (#50)

Accepted 2026-10-25. Install the bundled skill by default, including non-interactive installs, without prompting.
The installer, source installer and upgrade accept `--no-skill`; `SLIPBOX_NO_SKILL=1` skips automatic writes,
including Homebrew's post-install. Keep `--skill` on the source installer as a compatibility spelling.
Use the same safe writes as `skill --install`, never forcing replacements. Report destinations and refusals;
a skill failure does not turn a successful binary installation into a failure.

## ASI-D2: known agents and packaging (#50)

Accepted 2026-10-25. Detect existing Claude Code and Codex user configuration directories, honoring
`CLAUDE_CONFIG_DIR` and `CODEX_HOME`. Claude Code uses its configuration directory's `skills` folder.
Codex supports the current `~/.agents/skills` location and the configured Codex home's `skills` location.
No project directories are searched. Do not create an agent configuration directory to claim it is installed.
One bundled skill remains the mechanism (D22); the separate npx package idea remains open.

## ASI-D3: uninstall (#50)

Accepted 2026-10-25. Uninstall lists the recognized skill files for removal, then removes them with `--yes`,
using the same ownership recognition as `skill --install`: frontmatter names `slipbox`.
Report hand-written skills that do not meet that rule, and linked skills, as left alone. Remove only SKILL.md,
then its directory if empty; other files in the directory stay. Recheck ownership and links before removal.
