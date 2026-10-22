---
status: consolidated
created: "2026-10-12"
---

# GR: A green repository

> Consolidated into its parent on 2026-10-13.

slipbox's repository brought to greenrepo, the user's standard for a healthy repository (draft 2 of 2026-10-10, with
its profiles, draft 1), then published on GitHub and released. The standard sets what a repository carries, how its CI
is hardened, how releases are made and verified, which settings it has, and how it is kept well. The user settled the
scope and the choices on 2026-10-12, and agreed to the plan with them.

- [requirements.md](requirements.md): its goals, acceptance criteria and its changes to the root's requirements.
- [design.md](design.md): its changes to the root's design.
- [decisions.md](decisions.md): what was decided, and why.
- [notes.md](notes.md): how it was settled.
- [tasks/](tasks/README.md): the work, a task per file.

## Outcome

Shipped as the user settled it: slipbox's repository public on GitHub under Apache-2.0, its blueprint and history with
it (no secret found; the early commits' personal address rewritten), set and kept as greenrepo has it for its scope.
Hardened CI on Linux and macOS with one required check; Biome, zizmor and actionlint, and the docs' lint, spelling and
links in `bun run check`, the toolchain pinned in `mise.toml`; the repository's documents; the skill in the binary;
Dependabot, the scanner and the weekly health check, with the expected settings, renewals and accepted deviations
committed. On the way the user asked for previews, the one-line installer on Pages and `slipbox channel` (GR-D13 to
GR-D15), and Discussions (GR-D17). CI's first macOS run found two real bugs, fixed with regression tests: a link
spelled in another case reaching its file twice on a case-folding disk, and, in the TUI, Mermaid's layout taking
OpenTUI's global `window` for a browser's and breaking every timer after it. The first release is 0.2.1, published
2026-10-12: `v0.2.0`'s build failed on the Intel Mac, and a tag is never moved (GR-D18). `14.6` and `14.13` are done.
Left for later, as decided: the Homebrew tap and its token, after the first release (GR-D18); a docs site, an accepted
deviation until then (GR-D8). Once `main`'s rules were on, every change went through a pull request the user merged.
