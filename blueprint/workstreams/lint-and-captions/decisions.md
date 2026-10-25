# LC decisions

## LC-D1: Filter lint presentation after the run (`3.21`, #91, 2026-10-25)

**Decision:** The linter keeps its own rules and runs unchanged. Hide MD013 where the configured view already wraps
prose, fits tables or wraps fenced code. `lint.follow_view = false` disables this filtering; `lint.ignore` hides
explicit rule IDs. Vaults may set both, since neither runs code. Problems reports hidden counts and reasons and
offers `a` (`problems.show_all`) to reveal all findings. The status count follows visibility. This amends D160.

**Why:** Raw line length can warn about width the rendered view already handles. Fences that scroll still benefit
from the warning. Altering the linter's config would also change CI and other editors; filtering its output doesn't.

**Cost:** Keep raw findings and classify their source blocks. Unknown or unreadable blocks keep their findings.

**Not chosen:** Silently dropping findings or editing the vault's markdownlint configuration.
