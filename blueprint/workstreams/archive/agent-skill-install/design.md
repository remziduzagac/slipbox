# ASI design

## MODIFIED: blueprint/design/distribution.md / the bundled skill

Previously: the installer and Homebrew do not install the bundled skill; the user supplies a destination manually.

`skill --auto` detects user agent directories and calls `installSkill` separately for each destination, reporting
success or refusal. No automatic operation uses force or follows linked destination ancestors. The installer and
source installer call it after installing the command; Homebrew calls it in a `post_install_steps` run. Upgrade calls
the new
binary after committing `current`, so its skill matches its commands, including upgrades started from the TUI.
The skip flag is forwarded as an environment skip for child invocations. Skill failures are reported separately.
Background TUI completion includes the skill report. Foreground hand-over retains it in the outcome and shows that
outcome in the restarted window's message, so destinations and refusals survive the screen being replaced.
Uninstall adds recognized skill files to its plan and checks them again before deleting only those files.

Research, read 2026-10-25: [Codex skills](https://learn.chatgpt.com/docs/build-skills),
[Codex workflows](https://developers.openai.com/cookbook/examples/codex/iterating-development-workflows-with-codex),
[Claude skills](https://code.claude.com/docs/en/skills) and
[Claude environment](https://code.claude.com/docs/en/env-vars).

Homebrew's filtered environment requires `HOMEBREW_SLIPBOX_NO_SKILL`, `HOMEBREW_SLIPBOX_CLAUDE_CONFIG_DIR` and
`HOMEBREW_SLIPBOX_CODEX_HOME` aliases. The post-install run prints its report and tolerates failure; caveats give
`slipbox skill --auto` for destinations the sandbox could not write. This is a technical adapter for ASI-D1/ASI-D2.
Source: [Homebrew cookbook](https://docs.brew.sh/Formula-Cookbook), environment filtering and post-install steps,
read 2026-10-25. Homebrew is not installed locally; its sandbox is not claimed to have been tested here.
