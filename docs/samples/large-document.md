# Architecture Decisions

ADR-style log. Add new entries when revisiting choices.

## D1: Single repo, top-level mac/vm split (2026-04)

**Decision:** Single repo, `mac/` and `vm/` at top level.
**Why:** Single source of truth, single git history, easy cross-references.
The "VMs pull Mac configs they don't need" downside is negligible.

## D2: Stow over chezmoi or hand-rolled bash (2026-04)

**Decision:** Stow + thin bash orchestration.
**Why:** Stow's package model maps cleanly to base+overlay strategy. No
templating to learn. 30-year-old tool. chezmoi's templating isn't needed
for one Mac + similar VMs.

## D3: Layered VM config — base + scope overlay (2026-04)

**Decision:** Each VM applies `vm/base/` first, then `vm/scopes/<scope>/`.
**Why:** Stow handles overlay naturally. Editing base updates every VM;
editing scope only changes that scope. Zero duplication.

## D4: Use include directives for shared-but-divergent configs (2026-04)

**Decision:** Where a tool supports include directives, use them.
**Why:** Avoids duplicating large files for a few diverging lines.
Patterns: `[includeIf]` in git, `Include`/`Match` in SSH, sourced env files
in shell.

## D5: Curated Brewfile, never regenerated (2026-04)

**Decision:** Maintain `mac/Brewfile` by hand. Never `brew bundle dump`.
**Why:** Brewfile's purpose is "what does this setup need?" not "what's on
this machine right now?"

**Adopting hand-installed apps:** `brew install --cask --adopt <name>`
*can* register an existing `/Applications/<App>.app` with brew, but it's
unreliable for some casks (Google Chrome leaves the Caskroom slot in a
state that breaks the next install). Safer recipe: quit the app, move it
out of `/Applications/` (or just delete it — user data lives under
`~/Library/Application Support/<vendor>/`, not in the .app), then run a
plain `brew install --cask <name>`. Reserve `--adopt` for casks you've
verified handle it cleanly.

## D6: Per-environment lifecycle scripts (2026-04)

**Decision:** Each environment (mac/, vm/) has separate scripts for
install (fresh machine bootstrap), switchover (first-time Stow on existing
Mac with live configs), apply (reload tools after editing), and restow
(after adding/removing files).
**Why:** Different operations have different lifecycles and risk profiles.
Conflating them into a single "do everything" script encourages reckless
re-runs and obscures what's safe vs dangerous.

## D7: AeroSpace over yabai (earlier) — superseded by D23

> **Superseded by D23 (2026-05).** AeroSpace was replaced with macOS
> Spaces + Rectangle. The original choice over yabai stands as
> rationale for *why not yabai*; the rest is historical.

**Decision:** AeroSpace.
**Why:** No SIP-disable required. TOML config readable. Letter-named
workspaces match scope mental model.

## D8: SketchyBar at bottom, transparent floating islands (earlier)

**Decision:** Bottom, transparent bar, items grouped into rounded islands.
**Why:** Pe8er-style aesthetic. Each island is a logical group.

## D9: JankyBorders for focused-window indication (earlier)

**Decision:** JankyBorders with workspace-keyed colors.
**Why:** Native to SketchyBar/AeroSpace ecosystem. Tracks focus across
monitors. Layers with SketchyBar pill colors.

## D10: Native Swift watchers for live indicators (2026-04)

**Decision:** SketchyBar items that need event-driven, system-wide signals
(camera in use, OBS recording) are backed by small Swift binaries under
`mac/bin/`, run as user LaunchAgents. Each watcher writes a state file
under `~/.cache/sketchybar/<name>-state` and triggers a custom sketchybar
event on transitions. The matching plugin script just renders the file.

**Why:** Polling approaches were either unreliable (`pgrep VDCAssistant`
returns true long after streaming ends; modern macOS redacts unified-log
camera events) or wasteful (re-running shell scripts every few seconds for
state that rarely changes). Native APIs give an exact signal at ~0% idle
CPU:
- `kCMIODevicePropertyDeviceIsRunningSomewhere` (CoreMediaIO) for any
  app's camera use.
- OBS WebSocket v5 `RecordStateChanged` event for OBS-specific state.

**How to apply:** When adding a new live indicator, prefer this pattern
over `update_freq` polling whenever a push API exists. Source goes in
`mac/bin/<name>.swift`, build line in `mac/bin/build.sh`, registration in
`mac/apply.sh` via `install_agent <name>`. The compiled binary is
gitignored; the LaunchAgent plist is generated on apply (not stowed),
since it needs the absolute repo path baked in. Secrets read by the
watcher must live outside `~/.config/<tool>/` (which is a Stow symlink
back into the repo) — use `~/.config/dotfiles/` instead.

## D11: ctrl-cmd as AeroSpace modifier (2026-04) — superseded by D23

> **Superseded by D23 (2026-05).** AeroSpace removed. Rectangle ships
> with `ctrl-cmd-<key>` defaults that match this allocation, so the
> muscle memory carries over.

**Decision:** All AeroSpace bindings use `ctrl-cmd-<key>` as the prefix.
Replaces an earlier Hyper (`cmd-ctrl-alt-shift-`) scheme that relied on
Karabiner's caps→Hyper remap.

**Why:** Matches existing Rectangle muscle memory (Rectangle defaults to
`ctrl-cmd-arrows` for snap, `ctrl-cmd-letters` for corners/thirds). Hyper's
4-modifier safety isn't needed for this binding count. Hyper had a real
gotcha: any Hyper combo containing `Cmd+Shift+/` (i.e. `Hyper+/`) is
swallowed by macOS's global Help-menu shortcut before AeroSpace sees it,
so symbol-key bindings silently failed. ctrl-cmd avoids that.

**Tradeoffs and remediations:**
- `ctrl-cmd-F` overrode macOS's Toggle-Fullscreen system shortcut. AeroSpace
  uses F as a workspace; system fullscreen replaced by AeroSpace's
  `fullscreen` on `ctrl-cmd-Enter`. Workspace renamed F → P (see D12).
- `ctrl-cmd-Space` is the macOS emoji picker. Float toggle moved off
  `Space` to `ctrl-cmd-G`.
- Layout toggles `ctrl-cmd-/` and `ctrl-cmd-,` work cleanly under ctrl-cmd
  (they only failed under Hyper because of the Help-menu path).
- Karabiner caps→Hyper rule remains installed but unused by AeroSpace
  bindings; caps-tap → Esc still works for vim users.

## D12: Workspace P replaces F (2026-04) — superseded by D23

> **Superseded by D23 (2026-05).** Letter-named workspaces are gone with
> AeroSpace; macOS Spaces don't have user-defined letter labels.

**Decision:** Renamed the wide-monitor "free" workspace from `F` to `P`.

**Why:** With ctrl-cmd as the AeroSpace prefix (D11), `ctrl-cmd-F` is
macOS's global "Toggle Fullscreen" shortcut. Binding workspace `F` would
override that system fullscreen behavior. `P` is a free letter, no system
or app conflict.

**How to apply:** Anywhere setup-guide examples or future docs mention a
"Free / TBD" workspace, use `P`. The `M` (meeting) and `S` (scratch)
workspaces are unchanged. Auto-place rules and persistent-workspaces list
both use `P` now.

## D13: Accordion is keyboard-tabs only — no i3-style stacked layout (2026-04) — superseded by D23

> **Superseded by D23 (2026-05).** No tiling, no accordion. macOS
> Spaces + Rectangle replaced the whole layer.

**Decision:** Accept that AeroSpace's `accordion` layout is a
keyboard-navigated stack (`ctrl-cmd-h/j/k/l` cycles through siblings) and
*not* an i3-style visual stacked layout with title bars on each member of
the stack.

**Why:** macOS apps enforce internal minimum window-size constraints that
AeroSpace can't override. With `accordion-padding=80`, AeroSpace requests
inactive windows be 80px tall; Chrome/Slack/Wavebox refuse, render at
their min-size (~200px+) and overlap the focused window instead of
collapsing to a 28-30px title-bar strip. Result: only one window appears
visible. Some apps (terminals with no min-size) can produce the strip
effect, but not the typical mixed-app workspace.

**Alternatives evaluated and rejected:**
- Custom Übersicht widget for vertical tab strip (~80 LOC HTML/JS, but
  WebKit overhead per widget; and JS poll model is awkward fit).
- Custom Swift NSPanel sidebar (~300 LOC + ongoing maintenance for a
  single-user tool).
- Two SketchyBar instances (top + bottom horizontal) with column-aligned
  tab markers — markers can't be position-aligned with floating-point
  precision to actual columns; layout requires runtime spacer math.
- yabai's stack layout (works) — explicitly rejected by D7 because it
  requires disabling SIP.

**How to apply:** Use `accordion` as a "show only the focused window of
this stack" mode; navigate with focus keys. Don't try to make it look
like i3 tabs. If permanent visual tab strip becomes essential later,
revisit Übersicht (cheapest reversible path).

**Future direction (2026-04):** Two paths were evaluated for fixing the
visual side of accordion on macOS:

1. **Standalone NSPanel-overlay helper alongside AeroSpace.** Either a
   tab-stack strip (one bar at the top, click to focus a sibling, hidden
   siblings are pre-shifted down by 28px so the strip doesn't cover
   content) or a true-accordion mode (N title-bar NSPanels, one per
   sibling, with the focused window resized to fit between its title and
   the next; non-focused siblings parked off-screen). MVP cost: ~200 LOC
   for tabs / ~550 LOC for accordion. Rejected for now: payoff too
   narrow given AeroSpace already handles accordion functionally;
   per-switch latency in true-accordion mode (~50–200ms) is worse than
   AeroSpace's instant focus cycle.

2. **Custom Mac-native WM** — a "Rectangle with a brain" replacement: lets
   macOS own Spaces, tiles within the focused Space, ships its own bar
   (SketchyBar replacement) and overlays (drag-to-zone, peek hints, the
   tab-stack/accordion strips above). Cost: ~3–6 months solo, half-time.
   Trades AeroSpace's programmatic Spaces control for richer overlay UI
   (a real loss for cross-Space `move-node-to-workspace`-style features,
   a real gain for everything D13 punted on).

Neither is being built now. Revisit (2) if/when AeroSpace's limits
become the bottleneck again, or if the overlay UI becomes a clear
must-have. (1) is dominated by (2) — only build (1) if you decide
against (2) and need the visual cue badly enough to ship a 200-LOC
helper.

## D14: VM dev architecture — cmux + helix layered (2026-04, revised 2026-05, further revised by D23)

> **Further revised by D23 (2026-05).** The "Mac WM" row is no longer
> AeroSpace — see D23. VM-side agent orchestration is provided by
> **workslate** (on-VM, tmux-based) — see `docs/workslate-overview.md`
> and D23.

**Decision:** For VM-based development, the tool stack is layered with
each tool doing one job:

| Layer | Tool | Role |
|---|---|---|
| Mac WM | AeroSpace | Workspace + window tiling on Mac |
| Mac terminal app | cmux | Vertical tabs + SSH-with-cmuxd, one window per scope/project; persistent panes survive cmux disconnects |
| VM execution | shells inside cmux panes | |
| VM editor | helix (default); nvim or Zed via Remote-SSH as escape hatches | |

**Why:** Each tool genuinely does one thing well. cmux owns the
host-side multiplexing and per-scope window grouping; helix is the
default editor inside any pane, fast to start and friendly to short
edit loops. Zed via Remote-SSH (NOT SSHFS — file-sync issues) is the
escape hatch for occasional heavy refactor; not a daily driver because
spinning up multiple Zed windows per worktree is inefficient.

**Mapping to AeroSpace workspaces:** one cmux *window* per scope (Work1,
Work2, Personal, etc.). Inside, vertical tabs for sessions.

**Revised 2026-05 — tmux dropped from the *user-facing* layered stack:**
The original 2026-04 design included tmux as a user-facing layer for
long-lived shell sessions. In practice, cmux's persistent SSH panes
already cover the long-lived-session role at the user-facing level, so
the user-facing tmux layer (`.tmux.conf`, sesh session picker, manual
`prefix +` workflows) was removed.

**tmux is still required, just not user-facing:** workslate (D23) uses
tmux as its on-VM substrate for agent panes and per-project layouts.
Without `tmux` on the VM, workslate won't start. The package therefore
stays in `vm/install.sh`'s `APT_PACKAGES` as a workslate runtime
dependency — *not* as a fallback for raw ssh, which is a bonus side
effect.

**How to apply:** Treat tmux as an internal dependency of workslate,
not something the user interacts with directly. Don't add a managed
`.tmux.conf` or session-picker tooling — anything you'd want there
belongs in cmux config (the primary user-facing multiplexer) or
workslate's own configuration instead.

## D15: Stay on Chrome despite vertical-tabs envy (2026-04)

**Decision:** Chrome remains the primary browser. Vertical-tab workflows
managed via in-browser extensions (Link Map for tree-style tab management)
rather than switching to Edge/Vivaldi/Brave/Arc.

**Why:** Several tools are Chrome-locked or Chrome-best:
- "Claude in Chrome" extension and related Anthropic browser MCP
- Passbolt (and most password managers' best integration)
- Corporate SSO extensions that team-policy targets Chrome only
- Chrome-specific debugging APIs used by some dev tooling

The accumulated Chrome-only surface is too large to swap browsers cleanly.
Edge/Brave can install Chrome Web Store extensions but Anthropic and other
vendors only test the Chrome path; subtle bugs surface at the worst moment.

**Alternatives evaluated and rejected:**
- **Arc**: in maintenance mode (The Browser Company pivoted to Dia).
- **Edge / Vivaldi / Brave**: native vertical tabs but break Chrome-only
  tooling.
- **Wavebox**: heavy (Electron + per-app sandboxes) and paid for the
  workspace features.

**Workaround for tab-management itch:** Link Map extension (free, Chrome
Web Store, IndexedDB-backed). Tree-style tab manager that bridges
"open tabs" and "saved-for-later" in a unified vertical sidebar. Reduces
the need for many Chrome windows per scope — most workspaces collapse to
one Chrome window with a rich Link Map tree.

## D16: Shell tooling baseline for VMs (2026-04)

**Decision:** Every VM gets a baseline of modern CLI tools, installed via
the host distro's package manager (apt on Ubuntu).

**Tier 1 — install on every VM:**

| Tool | Replaces / adds |
|---|---|
| tmux | Terminal multiplexer — **runtime dependency of workslate** (it manages tmux sessions per project on the VM). Not user-facing; cmux is the primary multiplexer per D14 revision. |
| fzf | Fuzzy finder, used by many other tools |
| zoxide | Smart `cd` (frecency-based jump) |
| starship | Cross-shell prompt (fast, scope-aware) |
| eza | `ls` (colors, git, tree mode) |
| bat | `cat` (syntax highlighting, paging) |
| fd | `find` (sane defaults, fast) |
| ripgrep (`rg`) | `grep -r` (much faster) |
| delta | `git diff` pager (side-by-side, syntax) |
| atuin | Shell history (encrypted, searchable, syncable) |
| lazygit | Git TUI (also handles git worktrees natively via `w` key) |
| tealdeer (`tldr`) | `man` (cheatsheet examples) |

**Tier 2 — install when actually needed:**

`mise` (language version manager), `direnv` (per-dir env), `just` (task
runner), `jq`/`yq` (JSON/YAML), `httpie`/`xh` (HTTP debugging), `bottom`
(`htop` replacement), `dust` (`du`), `duf` (`df`), `yazi` (TUI file
manager), `glow` (markdown viewer).

**zsh plugins** (manual sourcing, no oh-my-zsh):

| Plugin | Effect |
|---|---|
| zsh-autosuggestions | Inline grey suggestions from history |
| zsh-syntax-highlighting | Real-time syntax check |
| fzf-tab | Replaces tab-completion menu with fzf picker |

**Why:** This is the consensus stack among CLI-heavy developers. Each
tool earns its place every day; the alternatives ("install only what you
need") guarantee you'll repeatedly hit a missing tool at a bad moment.

**How to apply:** When `vm/base/install.sh` is wired, install Tier 1 via
apt + a one-shot fetch for the few tools not packaged (sesh, atuin if not
in repo). Tier 2 stays manual — install per-VM as the use case appears.

## D17: cmux layouts deferred until usage patterns emerge (2026-04)

**Decision:** Don't write `cmux.json` layouts yet. Reserve a future Stow
package at `mac/config/cmux/cmux.json` (Stows to `~/.config/cmux/`) for
when concrete per-scope layouts become obvious from daily use.

**Why defer:** cmux supports per-workspace custom-command layouts via a
JSON schema documented at https://cmux.com/docs/custom-commands.
Conceptually they fit the scope model perfectly — one command per
codename launches that scope's canonical pane/surface arrangement
(SSH into the VM, open an editor in a split, optionally a browser
surface, etc.). But the *exact* shape of each scope's layout depends on
real workflow patterns we haven't lived yet:
- Whether each scope wants 2-column or 3-column inside its cmux window
- Whether the agent pane shares with the editor or stays on its own
- Whether a browser surface is part of the default layout or only opened
  on demand
- Whether per-project subdirectories want their own sub-layouts

Writing the JSON before those patterns settle just guarantees rewrites.

**How to apply:** Once a scope has been used for ~a week and the layout
crystallizes, add an entry to `mac/config/cmux/cmux.json` with that
scope's preferred shape (workspace name, color, cwd, layout tree of
panes/surfaces, optional shortcut). Bind a hotkey or trigger from cmux's
command palette. See `cmux.com/docs/custom-commands` for the schema.

Layouts can also live per-repo at `<repo>/.cmux/cmux.json` — useful for
project-specific shapes that shouldn't apply globally.

Beware: keybindings inside `cmux.json` collide with AeroSpace bindings
when cmux is focused. Pick distinct ones (e.g. `Cmd+Shift+<digit>`)
unless you *want* the in-cmux shortcut to differ from outside.

## D18: Mac shell tooling baseline (2026-04)

**Decision:** Mac host gets a small shell-tooling baseline mirroring a
subset of the VM Tier 1 (D16): `fd`, `bat`, `git-delta`, `eza`, `xh`.
These extend the existing `stow`/`git`/`jq` line in the Brewfile.

**Why these five:**
- **fd**: `find` replacement with saner defaults; pairs with `rg` and
  `fzf`. Earns its slot daily.
- **bat**: `cat` with syntax highlighting; also serves as the preview
  backend other tools (fzf, delta) plug into.
- **git-delta**: best-in-class diff pager; one-time wire-up in
  `~/.gitconfig` and forget. Pairs with bat.
- **eza**: `ls` replacement with git/tree integration. Aliases land in
  shell config when that file is added (not yet — see "How to apply").
- **xh**: Rust httpie. Faster + lighter than httpie; strictly better for
  the one-shot HTTP-debug case. Picked over `posting` (TUI client,
  overlaps with xh) and over httpie itself.

**Rejected for now:**
- **pass**: GPG-keyed CLI password store — conflicts with the existing
  direction toward 1Password CLI / Keychain (see top-level CLAUDE.md
  Secrets section). Don't add a third secret store.
- **grex**: regex generator; cute but used twice a year. Install ad-hoc
  when needed, not as a baseline.
- **thefuck**: typo-retry shell hook adds 100–300ms to startup for what
  fzf history + atuin already cover. Hard skip.
- **posting**: TUI HTTP client; overlaps with xh. Pick xh for one-shots,
  reach for Insomnia/Bruno-class tools if saved-collection workflow ever
  becomes a real need.

**Deferred (kept for later):**
- **jrnl**: plain-text journal CLI. Interesting as a stable, scriptable
  capture interface that AI agents could append to (unlike Apple Notes,
  which is intentionally human-only — see aerospace.toml `Apple Notes →
  float` rule). Worth installing only if committed to a single capture
  target file — most likely inside the Obsidian vault so jrnl entries
  show up alongside hand-written notes on workspace R, with optional
  shell function `j` for instant capture and a Zed task for longer
  entries. Skip until the capture-target question is settled; otherwise
  it fragments alongside Obsidian quick-capture and adds nothing.
- **cbonsai**: ASCII bonsai tree generator. Pure aesthetic, no workflow
  value. Install only if you decide you want a `clear; cbonsai -l`
  vibe-boot on new tabs.

**How to apply:** After `brew bundle` installs the new tools, wire them
in:
1. **delta** — add to `~/.gitconfig` (Stowed):
   `[core] pager = delta`,
   `[interactive] diffFilter = delta --color-only`,
   `[delta] navigate = true`, `side-by-side = true`.
2. **eza** — defer aliases until a Mac shell-config Stow package exists
   (no `mac/config/zsh/` yet). When added, mirror VM aliases:
   `ls=eza`, `ll=eza -lah --git --group-directories-first`,
   `tree=eza --tree --git-ignore`. Keep the Mac and VM lists in sync.
3. **fd, bat, xh** — no config; install and use.

The VM-side baseline (D16) already includes these. This ADR only covers
the Mac host so cross-environment muscle memory stays consistent.

## D19: Mac shell config package + Tier-1 parity (2026-04)

**Decision:** The Mac host gains a Stow-managed shell-config package at
`mac/config/zsh/` plus the rest of the Tier-1 CLI tools from D16, so
muscle memory between Mac and VMs converges. New tools added to the
Brewfile: `ripgrep`, `fzf`, `zoxide`, `lazygit`, `starship`, `atuin`,
`yq`, `bottom`, `dust`, `zsh-autosuggestions`, `zsh-syntax-highlighting`.
`fzf-tab` is cloned (no brew formula).

**Layout:**

```
mac/config/zsh/
  .zshrc          Stow-symlinked to ~/.config/zsh/.zshrc
  aliases.zsh     sourced from .zshrc
  .gitignore      ignores plugins/, local.zsh, .zsh_history
  plugins/        fzf-tab cloned here at install time (gitignored)
```

**ZDOTDIR mechanics:** zsh reads `~/.zshenv` first, before any other
config. We use that file to set `ZDOTDIR=$HOME/.config/zsh` so the rest
of the config lives under `~/.config/` and is Stow-managed like every
other tool. `~/.zshenv` cannot be Stow-symlinked — it must live at
`$HOME`, but the existing `mac/config/` package targets `~/.config/`.
Rather than introduce a second Stow target tree, `mac/install.sh` writes
the one ZDOTDIR line into `~/.zshenv` idempotently.

**Plugin order:** completion (`compinit`) first, then `fzf-tab`, then
`zsh-autosuggestions`, then `zsh-syntax-highlighting` last. Syntax
highlighting must be the final source — it wraps the line editor and
will miss prior-defined widgets if it loads earlier. fzf-tab must come
after compinit (it intercepts the menu) and before syntax-highlighting.

**Why curated, not oh-my-zsh / zinit / zplug:** plugin managers add
~100ms to shell startup and a maintenance surface for features we don't
need. Three sourced files + brew-installed plugins do everything a
plugin manager would, faster, with less to break.

**Local overrides:** `~/.config/zsh/local.zsh` is gitignored and sourced
last. Per-machine path tweaks, secret env vars, and one-off aliases
belong there — not in the committed `.zshrc`.

**Rejected for now:**
- **tmux on Mac**: cmux already provides session/tabs. Install if you
  ever start a Mac terminal outside cmux; otherwise unused.
- **mise / direnv**: defer until language-versioned dev work moves onto
  the Mac host (currently it lives on VMs).
- **tealdeer (`tldr`)**: nice-to-have, not yet daily.
- **yazi / superfile**: TUI file manager. Skipped because Finder + cmux
  shell handle the 95% case. If a need surfaces, prefer **yazi** —
  vim-style keys match the rest of the stack (helix, cmux), Lua plugin
  layer is genuinely useful, and async I/O makes it noticeably faster
  on large dirs. **superfile** wins only if you specifically want
  Finder-feel TUI; it lacks a real plugin layer and is newer/smaller
  community.

**How to apply (existing machine):**
```
brew bundle install --file=mac/Brewfile   # pulls the new tools
./mac/install.sh                          # writes ~/.zshenv, clones fzf-tab
./mac/restow.sh                           # links ~/.config/zsh
exec zsh                                  # reload shell
atuin login                               # if you want history sync
```

The next time the VM-side stack diverges from D16's Tier-1 list, update
this ADR's parity claim explicitly — don't let the two drift silently.

## D20: Keyboard shortcut allocation policy (2026-04)

**Decision:** Each layer of the Mac/VM stack owns a distinct modifier
*flavor*. New bindings must respect the allocation; don't add a binding
in a layer that's already claimed by a layer above it.

### Layered capture order

A keystroke is consumed at the topmost layer that binds it. Anything
lower in the stack never sees a key the layer above already caught.

```
keystroke
   ↓
[1] macOS system    Cmd+Tab, Ctrl+Cmd+F (fullscreen), Ctrl+Cmd+Q (lock),
                    Cmd+Shift+Q (logout), Cmd+Shift+3/4/5 (screenshot),
                    Ctrl+arrows / Ctrl+1..9 (Spaces — disabled by default)
   ↓
[2] AeroSpace       ctrl+cmd+*, ctrl+cmd+alt+*, alt+shift+*
                    (see mac/config/aerospace/aerospace.toml)
   ↓
[3] cmux app        cmd+*, cmd+shift+*, alt+cmd+* (selected),
                    ctrl+1..4, ctrl+alt+cmd+. (palette)
   ↓ SSH passthrough — only what cmux didn't catch reaches the VM
   ↓
[4] tmux            Ctrl+B (prefix) + chord
   ↓
[5] helix / nvim    plain letters, ctrl+letter, alt+letter,
                    Space (helix leader)
```

### Modifier-flavor allocation

| Modifier | Owner | Notes |
|---|---|---|
| `ctrl+cmd+*`        | AeroSpace                    | Window-manager actions; never bind in cmux/VM. |
| `ctrl+cmd+alt+*`    | AeroSpace                    | Window-move + resize; never bind elsewhere. |
| `alt+shift+*`       | AeroSpace `move-node-to-workspace` | Globally consumed; never bind in cmux or VM tools. |
| `cmd+*`             | cmux app (when focused) + macOS | Per-app; doesn't reach VM. |
| `cmd+shift+*`       | cmux app + macOS             | Per-app; doesn't reach VM. |
| `alt+cmd+*`         | cmux app (selected combos)   | cmux uses many but not all — `alt+cmd+w/]/[` are free and used by D20's remap. |
| `ctrl+letter`       | tmux + editors (passes through) | Safe in VM tools; macOS rarely binds plain `ctrl+letter`. |
| `alt+letter`        | tmux + editors (passes through) | cmux's `macos-option-as-alt = true` keeps these usable. |
| Plain letters / digits | editors                   | Always pass through. |

### "Do not bind" rules

When configuring a tool inside the VM (tmux, helix, nvim), do
**not** use:

- `Ctrl+Cmd+*` — AeroSpace eats it before cmux/SSH ever see it.
- `Alt+Shift+*` (especially digits and the workspace letters
  `P/M/S/C/R/A/O`) — AeroSpace globally consumes for
  `move-node-to-workspace`. Particularly tempting for tmux window-switch
  bindings; resist.
- `Cmd+*` — never reaches the VM (cmux/macOS catch). If tempted, this
  belongs in cmux's settings, not in the VM tool's config.

When configuring cmux, do **not** use `Ctrl+Cmd+*` for any new
binding — it'll silently never fire because AeroSpace claims it first.

### Confirmed safe modifier flavors per layer

For new bindings in each tool, use these:

- **AeroSpace**: stick with `ctrl+cmd+*` family; don't migrate to
  `alt+shift+*` for new actions (that's reserved for window moves).
- **cmux**: prefer `alt+cmd+*` (most combos free) or `cmd+shift+*`
  (most combos free). Avoid `ctrl+cmd+*`.
- **tmux**: stick with `Ctrl+B` prefix + ASCII chord. If you need a
  no-prefix bind, plain `Ctrl+letter` works (provided macOS doesn't
  reserve the specific letter — `Ctrl+F`, `Ctrl+Cmd+F`, etc.).
- **helix / nvim**: defaults are all safe. Plugin authors who use
  `Cmd+P` etc. won't work over SSH; use the editor's leader-key
  conventions (`Space p` / `<leader>p`) instead.

### Concrete remaps (this rule's first application)

cmux defaults conflicted with AeroSpace bindings on three keys.
Overrides committed at `mac/config/cmux/settings.json`:

| Action | cmux default | Override |
|---|---|---|
| Close window (`closeWindow`) | `cmd+ctrl+w` | `cmd+opt+w` |
| Next sidebar tab (`nextSidebarTab`) | `cmd+ctrl+]` | `cmd+opt+]` |
| Previous sidebar tab (`prevSidebarTab`) | `cmd+ctrl+[` | `cmd+opt+[` |

`Ctrl+Cmd+F` (cmux's `toggleFullScreen`) was left alone — it overlaps
with macOS system Toggle-Fullscreen but cmux's full-screen wins inside
its own window, and the user accepted that semantics.

**How to apply (when changing cmux bindings):**

1. Edit `mac/config/cmux/settings.json` (Stowed to
   `~/.config/cmux/settings.json`).
2. Quit + relaunch cmux. cmux reads the file at startup only.

**How to apply (when adding new AeroSpace bindings):**

1. Edit `mac/config/aerospace/aerospace.toml`.
2. `aerospace reload-config` — picks up immediately, no restart.

## D21: Split Ghostty configs for Ghostty.app vs cmux (TODO, not urgent)

**Problem:** Ghostty.app and cmux both read `~/.config/ghostty/config`,
so they share `background-opacity` and `background-blur`. cmux appears
to ignore `background-blur`, so the same `background-opacity = 0.7`
makes cmux's terminal pane look noticeably darker than Ghostty.app's
(unblurred dark wallpaper bleeds through directly in cmux).

**Deferred plan (when this becomes annoying enough to fix):**

```
mac/config/ghostty/
  config-base       # everything shared: theme, palette, fonts, padding,
                    # keybinds, font-family, cursor, clipboard, etc.
  config            # `config-file = config-base` + Ghostty-only:
                    #   background-opacity = 0.7
                    #   background-blur = 20
  config-cmux       # `config-file = config-base` + cmux-tuned:
                    #   background-opacity = 0.85   (no blur to compensate)
```

- `~/.config/ghostty/config` (Stow target — cmux reads here) → points
  at `config-cmux`.
- `~/Library/Application Support/com.mitchellh.ghostty/config`
  (Ghostty.app reads here, currently mirrored from `~/.config/ghostty/`
  by `mac/apply.sh`) → repointed at `config` directly.

Each app gets its own opacity; cmux compensates for the missing blur
by going more opaque. ~30 LOC of edits across the three files plus a
small `apply.sh` tweak.

**Not blocking:** the current single-config setup is acceptable; the
visual mismatch is real but not painful. Revisit if/when cmux either
adds blur support (problem disappears) or you find yourself using cmux
heavily and the dimness becomes a daily irritant.

## D22: SSH access to OrbStack VMs (2026-04)

> **Note (2026-05):** the `crane` scope mentioned throughout the
> examples below was retired. Active code/config now uses
> `tux / beaver / otter / owl / hawk`. The recipes in this ADR are
> still correct — just substitute the current scope list when
> re-running them.

**Decision:** Address every OrbStack VM as `ssh <codename>` from the Mac
host, routed through OrbStack's SSH bridge. SSH config uses `Match exec
"orb info %n"` to auto-detect any running OrbStack VM, with no need to
maintain a per-VM list.

### Why bridge over `.orb.local`

OrbStack exposes VMs through two transports:

| Path | Transport | Auth source | Survives VM recreation? |
|---|---|---|---|
| `ssh <vm>@orb` (or via `Host orb` block) | OrbStack's local helper-binary FD-pass proxy | `~/.orbstack/ssh/id_ed25519` (OrbStack-managed, auto-deposited in every VM) | ✓ |
| `ssh <vm>.orb.local` | Plain network SSH against the VM's IP | `~/.ssh/id_*` from your regular keys, must be in the VM's `/home/<user>/.ssh/authorized_keys` | ✗ — fresh VMs have empty authorized_keys |

The bridge path is strictly better: OrbStack maintains its key chain
across VM lifecycles, and you never touch a VM's authorized_keys. The
`.orb.local` path "works the first time" only when an old VM had a
manual `ssh-copy-id`; recreate it and `.orb.local` fails with
publickey-denied while the bridge keeps working untouched. Standardize
on the bridge.

### Codename-as-identity (relates to ADR-D14)

VM hostnames mirror the AeroSpace workspace codenames: `crane` (work),
`owl` (financial), `hawk` (real estate), `beaver` (personal-dev),
`otter` (low-touch personal). This makes
`ctrl-cmd-1` → workspace 1 → `ssh crane` → crane VM all carry the
same identity through every layer (workspace → cmux window → VM
hostname → SSH alias). No mental translation step.

### The SSH config block

Lives at the end of `~/.ssh/config`. OrbStack's auto-injected
`Include ~/.orbstack/ssh/config` is at the top of the file (added by
OrbStack on install — leave it alone).

```sshconfig
# OrbStack VM auto-routing — `ssh <name>` works for any running
# OrbStack VM. Match exec runs `orb info <name>`; if it succeeds (the
# VM exists), the OrbStack bridge directives below apply. Non-OrbStack
# hosts fall through to other config blocks normally.
Match originalhost * exec "orb info %n >/dev/null 2>&1"
    User %n
    Hostname 127.0.0.1
    Port 32222
    IdentityFile ~/.orbstack/ssh/id_ed25519
    IdentitiesOnly yes
    UserKnownHostsFile ~/.orbstack/ssh/known_hosts
    ProxyCommand '/Applications/OrbStack.app/Contents/Frameworks/OrbStack Helper.app/Contents/MacOS/OrbStack Helper' ssh-proxy-fdpass 501
    ProxyUseFdpass yes
    StrictHostKeyChecking accept-new
    ServerAliveInterval 30
    ForwardAgent yes
```

The Hostname/Port/IdentityFile/ProxyCommand quartet is copied verbatim
from OrbStack's `Host orb` block in `~/.orbstack/ssh/config` — that's
the actual transport. We replicate it because SSH config doesn't
re-evaluate `Host` blocks after a `HostName` substitution, so chaining
through `HostName orb` (the naive approach) silently fails.

### Per-scope SSH keys + agent forwarding

**Decision:** all private keys live on Mac only. Each AeroSpace scope
(workspace codename) gets its own ed25519 key:

```
~/.ssh/id_ed25519_tux       — Mac itself / personal-life
~/.ssh/id_ed25519_beaver    — personal-dev VM
~/.ssh/id_ed25519_otter     — low-touch personal VM
~/.ssh/id_ed25519_crane     — work VM
~/.ssh/id_ed25519_owl       — financial VM
~/.ssh/id_ed25519_hawk      — real-estate VM
```

Generation (one-shot for all six):

```sh
for scope in tux beaver otter crane owl hawk; do
    ssh-keygen -t ed25519 -N '' \
        -f ~/.ssh/id_ed25519_$scope \
        -C "remzi $scope $(date +%Y-%m-%d)"
    ssh-add --apple-use-keychain ~/.ssh/id_ed25519_$scope
done
```

`--apple-use-keychain` stores the (empty) passphrase in macOS Keychain
so `ssh-agent` auto-loads all keys at login.

**`ForwardAgent yes`** in the routing block above forwards the Mac's
ssh-agent socket into every VM session. Inside a VM, `ssh-add -l` shows
every key the Mac holds, available for signing. **Private keys never
copy to a VM.** A compromised or destroyed VM loses nothing — the
canonical store is Mac, backed up via Time Machine.

Trade-off: a session-active VM with root access could use the
forwarded agent to authenticate as you to other services until you log
out. Acceptable for local OrbStack VMs you trust; do **not** enable
forwarding for untrusted remote hosts.

### Per-VM authorized_keys (currently dormant)

Each VM's `/home/remzi/.ssh/authorized_keys` has been pre-seeded with
its matching scope pubkey (`id_ed25519_<scope>.pub`). This file is
**not used today** because OrbStack VMs don't run sshd listening on
port 22 — the bridge handles all auth via the helper-binary FD-pass.
The deposited keys sit dormant; they activate the moment you ever
enable sshd on a VM (`sudo systemctl enable --now ssh`), at which
point direct `.orb.local` SSH would also work.

Pre-seeding script (run once per VM if recreating):

```sh
for scope in beaver otter crane owl hawk; do
    cat ~/.ssh/id_ed25519_${scope}.pub | ssh ${scope}@orb \
      'mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys'
done
```

### Three lessons hard-won during this setup

1. **Use `%n`, not `%h`, for `User` in dynamic blocks.** `%h` resolves
   to the post-substitution Hostname (here `127.0.0.1`), which makes
   OrbStack route to whatever the "default" container is — usually the
   first one created — regardless of which alias you typed. `%n` is
   always the original-hostname-as-typed, which is what we want.
   Symptom of getting this wrong: `ssh crane` lands in the `otter` VM.

2. **`Match originalhost * exec "<probe>"` auto-discovers VMs.** The
   probe runs once per SSH invocation. If `orb info <name>` exits 0,
   the block applies. If non-zero (no such VM), the block is skipped
   and SSH falls through to other rules. This means new VMs work
   immediately with zero config edits, and non-OrbStack hosts
   (`github.com`, etc.) still route through their own dedicated
   blocks. Per-SSH cost is one local RPC (~10–30ms); negligible.

3. **`Host orb` block ≠ `HostName orb`.** OrbStack's `Host orb`
   directive contains a ProxyCommand that talks to a helper binary via
   FD-pass — it's not literally a TCP connection to a host called
   "orb". Setting `HostName orb` in any other block doesn't trigger
   re-evaluation of that block; SSH just tries to DNS-resolve "orb"
   and fails. If you want the bridge in another alias, copy the actual
   directives, don't chain.

### Maintenance caveats

- **The ProxyCommand path is hardcoded.** If OrbStack ever moves
  `OrbStack Helper.app` or rebrands, the literal path breaks. Recovery:
  re-run `cat ~/.orbstack/ssh/config` and copy the new ProxyCommand
  verbatim into the block.
- **The `501` argument is the macOS UID.** Confirm yours with `id -u`
  and adjust if not 501.
- **`orb` must be in PATH** when SSH evaluates `Match exec`. It is for
  interactive shells. If running ssh from a stripped environment that
  lacks it, replace `orb` with the absolute path to the binary
  (`which orb` shows the location).

### Why this is not a Stow package

The literal `~/.ssh/config` contains machine-specific paths
(OrbStack helper-binary location, user UID) and pre-existing
hand-edited blocks (GitHub keys, Colima includes). Tracking it
verbatim would cause merge friction on a fresh Mac without saving
work. Re-deriving the file from this ADR is a 30-second copy-paste,
which is faster than maintaining a Stow package with per-machine
patches.

### Future enhancement — helix "stack-and-flush" AI clipboard helper

Pending design (worth implementing once helix is committed as the only
VM editor): keybinds that accumulate `path:line` references and labeled
snippets into `~/.cache/ai-clipboard.md`, then flush the whole stack to
the clipboard in one paste for a CC/OC prompt that references multiple
files/chunks.

Rough keybind shape:
- `space y l` → append `path:line` for cursor
- `space y p` → append path only
- `space y c` → append the selection with a `--- path:line ---` header
- `space y v` → view current stack
- `space y f` → flush stack to clipboard, clear file
- `space y x` → clear without flushing

VM-side variant uses OSC 52 escape instead of `pbcopy` so cmux relays
clipboard back to Mac. Works around helix's missing per-selection
line-number variables (multi-cursor on its own can't yank N
`path:line` refs because `%{cursor_line}` only resolves the primary
selection's line). Stack-based design is editor-agnostic — same shape
works in nvim if helix ever proves restrictive for this case.

Not blocking; the simpler `space y l` plus content yank covers most
prompts. Promote to live config when the multi-ref case bites
regularly.

### Fresh-Mac runbook (single-paste recovery)

Bootstrapping a new Mac to the working state captured by this ADR:

```sh
# 1. Install OrbStack — populates ~/.orbstack/ssh/config and adds the
#    `Include ~/.orbstack/ssh/config` line at the top of ~/.ssh/config.
brew install --cask orbstack

# 2. Append the auto-routing block to ~/.ssh/config.
mkdir -p ~/.ssh
cat >> ~/.ssh/config <<'EOF'

# OrbStack VM auto-routing — `ssh <name>` works for any running
# OrbStack VM. See ADR-D22 in docs/decisions.md.
Match originalhost * exec "orb info %n >/dev/null 2>&1"
    User %n
    Hostname 127.0.0.1
    Port 32222
    IdentityFile ~/.orbstack/ssh/id_ed25519
    IdentitiesOnly yes
    UserKnownHostsFile ~/.orbstack/ssh/known_hosts
    ProxyCommand '/Applications/OrbStack.app/Contents/Frameworks/OrbStack Helper.app/Contents/MacOS/OrbStack Helper' ssh-proxy-fdpass 501
    ProxyUseFdpass yes
    StrictHostKeyChecking accept-new
    ServerAliveInterval 30
    ForwardAgent yes
EOF
chmod 600 ~/.ssh/config

# 3. Generate one ed25519 key per scope; load each into Keychain.
for scope in tux beaver otter crane owl hawk; do
    ssh-keygen -t ed25519 -N '' \
        -f ~/.ssh/id_ed25519_$scope \
        -C "remzi $scope $(date +%Y-%m-%d)"
    ssh-add --apple-use-keychain ~/.ssh/id_ed25519_$scope
done

# 4. (Optional) Pre-seed authorized_keys on each VM you've created.
#    Skip this if VMs don't exist yet — do it after creating each one.
for scope in beaver otter crane owl hawk; do
    cat ~/.ssh/id_ed25519_${scope}.pub | ssh ${scope}@orb \
      'mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys'
done

# 5. Smoke test.
for scope in beaver crane hawk otter owl; do
    ssh -o BatchMode=yes ${scope} 'echo authenticated' \
        && echo "✓ ${scope}" || echo "✗ ${scope}"
done

# 6. Upload pubkeys to the matching GitHub accounts (manual, web UI).
#    GitHub → Settings → SSH and GPG keys → New SSH key.
#    Title format: <scope>-<YYYY-MM>, e.g. crane-2026-04.
for scope in tux beaver otter crane owl hawk; do
    echo "--- $scope ---"
    cat ~/.ssh/id_ed25519_${scope}.pub
done
```

Total time on a fresh Mac with OrbStack already installed: under a
minute for the SSH side. Adding the GitHub pubkeys is whatever your
copy-paste rhythm allows.

## D23: Drop AeroSpace — macOS-native + Rectangle + Wavebox + cmux + workslate (2026-05)

**Decision:** Replace the AeroSpace-based Mac WM stack with:

- **Mac windowing** — macOS Spaces + Mission Control for workspace
  switching; **Rectangle** for keyboard-driven window placement
  (halves / quarters / thirds). No tiling WM, no `on-window-detected`
  rules.
- **Browser identity** — **Wavebox** as primary, with per-scope app
  groups providing the per-context split that Chrome's profile-per-
  scope was attempting. The `chrome-scope` helper stays as a
  fallback (see `mac/docs/chrome-profiles.md`).
- **VM access** — **cmux** unchanged (one window per scope, persistent
  SSH panes).
- **VM agent orchestration** — **workslate** (on the VM, tmux-based)
  manages per-project panes, worker agents, and worktrees. See
  `docs/workslate-overview.md`.
- **Task tracking** — **worklog** (markdown-file-based CLI + TUI).

**Why:**

- AeroSpace's `on-window-detected` rules depend on window titles, which
  many of the apps actually in use here don't expose stably (cmux per
  SSH host, Chrome per profile suffix, Wavebox, OrbStack, Ghostty).
  When a workspace's rule didn't match, restarts would consolidate
  the unmatched windows on workspace 0 — hit twice in a 24-hour
  stretch with phantom windows.
- macOS Spaces handle the multi-display + multi-context split natively
  and survive reboots without ruleset upkeep. They lose programmatic
  cross-Space window movement (a real cost), but for daily flow that
  was rarely worth the rule-maintenance overhead.
- Rectangle's defaults overlap heavily with the muscle memory built
  up under D11 (`ctrl-cmd-<key>`), so the keyboard layer was a
  near-zero-cost transition.

**What was archived, then deleted (2026-09-25):**

`mac/archive/aerospace/` held the config, helpers, SketchyBar plugins and
full setup guide. Removed once it was clear AeroSpace was not coming back —
it had sat unused for four months, and the linter was reporting 127 issues
in a setup guide nobody would follow again.

The *reasoning* is what mattered and it lives here, in this ADR and in D7
and D11. The files are recoverable from git history if ever needed:

```sh
git log --all --diff-filter=D -- mac/archive/aerospace   # find the deletion
git show 7285618:mac/archive/aerospace/config/aerospace.toml
git checkout 7285618 -- mac/archive/aerospace              # restore the tree
```

`7285618` is the last commit that contains it.

**What's removed from the active stack:**

- `mac/config/aerospace/` (moved to archive)
- `mac/bin/aerospace-*` (moved to archive; `.swift` sources only —
  compiled binaries dropped)
- `cask "aerospace"` from `mac/Brewfile`; replaced with
  `cask "rectangle"`.
- `mac/docs/aerospace-setup-guide.md` (moved to archive)
- AeroSpace + Karabiner mentions in `mac/switchover.sh` TOOLS,
  `mac/install.sh` post-install steps, `mac/apply.sh` reload section,
  `mac/macos-defaults.sh` comment, `mac/README.md` stack list, and
  per-folder CLAUDE.md notes.
- Workspace pills + layout-status pills in `sketchybarrc`. The bar
  is now status-only (clock, compute, memory, audio, camera, OBS).

**Supersedes:** D7, D11, D12, D13 (all AeroSpace-specific).
**Further revises:** D14 (VM dev architecture — "Mac WM" row no
longer AeroSpace; workslate provides on-VM agent orchestration).

**How to apply:**

- Window placement: macOS-native Spaces (Mission Control settings →
  set up per-scope Spaces, optionally pin Wavebox / Slack / Obsidian
  / OBS to specific Spaces). Rectangle hotkeys for placement within a
  Space. No rules to maintain.
- Per-scope browser context: prefer Wavebox app groups. If a tool is
  Chrome-locked (Claude in Chrome, corporate SSO extensions —
  see D15), use `chrome-scope <scope>` from `mac/local/bin/`.
- Per-VM agent flow: cmux SSH into the VM, then `workslate` for
  agent orchestration; `worklog` for task tracking. tmux remains as
  the substrate workslate uses on the VM, not user-facing.
- New ADRs that touch window placement or per-scope context should
  reference D23 rather than D7/D11/D12/D13.

## D24: Launcher-driven Space placement via Hammerspoon (2026-05-10)

**Decision:** Route per-scope windows to specific macOS Desktops via
**switch-then-launch** — synthesize the system `Ctrl+N` Space-switch
hotkey via Hammerspoon, *then* let the launcher's `open` / `cmux
new-window` create the window on the now-active Desktop. After-the-fact
window movement (`hs.spaces.moveWindowToSpace`) is **not used**; that
API is broken on macOS Sequoia (Hammerspoon issue
[#3698](https://github.com/Hammerspoon/hammerspoon/issues/3698) — the
function returns success but doesn't actually move windows). The pivot
to keystroke-based switching was forced by that regression.

**Components:**

- `mac/hammerspoon/.hammerspoon/init.lua` — owns the scope→Desktop
  mapping (single source of truth, single screen for now) and exposes
  `scope.gotoScopeSpace(name)` over `hs.ipc`. Implementation: move
  cursor to primary screen center (so the symbolic-hotkey dispatcher
  targets primary) → send `Ctrl+N`. Also exposes
  `scope.closeAllScopeWindows()` for the post-restart fixup flow.
- `mac/local/bin/chrome-scope` — Chrome profile launcher. Calls
  `hs -c "scope.gotoScopeSpace('<scope>')"`, sleeps briefly, then
  `open -na "Google Chrome" --profile-directory=…`. Chrome's new
  window is born on the now-active Desktop. Works from anywhere
  (terminal, Raycast).
- `mac/local/bin/cmux-scope` — cmux per-scope window launcher. Same
  switch-then-create flow, plus cmux CLI calls to name the new window
  and seed an SSH workspace. **Only fully functional from inside a
  cmux-managed terminal** (cmux's CLI authenticates via Unix
  peer-credentials check; outside cmux, `cmux ping` fails with
  "Broken pipe"). From Raycast / non-cmux shells, the script bails
  early after the Space switch and leaves window creation to the user
  via cmux's UI.
- `mac/local/bin/cmux-rebootstrap` — post-restart fixup. cmux's
  `restore-session` brings windows back across quit/relaunch cycles
  but always on Desktop 1 (macOS doesn't persist per-window Space
  assignment for cmux). Since we can't move them, this script
  recreates each scope on its target Desktop via `cmux-scope <scope>`.
  Misplaced restored windows on Desktop 1 are left for the user to
  close manually (closing them automatically destabilizes cmux's
  window-placement anchor and breaks the create loop).
- `mac/local/share/scope-routing/` — 14 Raycast script-command
  wrappers (7 scopes × 2 tools). Stowed to `~/.local/share/scope-routing/`;
  Raycast's Settings → Extensions → Script Commands is configured to
  scan that directory.

**Why this design (after the original moveWindowToSpace plan failed):**

- `Ctrl+N` is dispatched by `WindowServer` directly (symbolic-hotkey
  layer), bypassing the broken `CGSConnection` path. Reliable.
- "Switch first, then create" sidesteps the problem entirely — the
  window is born on the right Desktop, no movement needed.
- Window-finding (for "focus existing" cases) uses Hammerspoon's
  cross-Space window enumeration filtered by macOS title and
  bundle ID. Titles are ones we set via `cmux rename-window`, so
  the matching is deterministic (this is *not* the title-fragility
  D23 rejected — that was about matching titles we don't control).

**Hard limitations baked into the design:**

| Limitation | Cause | Workaround |
|---|---|---|
| `hs.spaces.moveWindowToSpace` doesn't move windows | Hammerspoon issue #3698 / Apple's CGSConnection restrictions on Sequoia | Switch-then-launch instead of launch-then-move |
| `hs.spaces.gotoSpace` doesn't switch Spaces | Same | Synthesize `Ctrl+N` hotkey via `hs.eventtap.keyStroke` |
| cmux CLI fails outside cmux-managed shells (Broken pipe) | cmux's socket auth via process attribution; no readable token in any settings/keychain file | `cmux-scope` detects `$CMUX_SOCKET_PATH` and bails early outside cmux. Raycast invocations only do the Space switch + bring cmux forward |
| cmux's restore-session loses per-window Desktop assignment | macOS NSWindowRestoration in cmux saves window state but not Space ID | `cmux-rebootstrap` closes restored windows, recreates fresh on right Desktops via crex (full state) or cmux-scope (minimal) |
| cmux's session JSON doesn't preserve startup commands or SSH targets | cmux schema only saves CWDs and structure | Accept the limitation; user re-runs `ssh <vm>` inside each window after rebootstrap |
| AI session continuity (claude/opencode/codex resume across cmux restarts) | cmux doesn't track agent session IDs | Use each agent's native `--resume` flag manually; out of scope for our routing |
| `Ctrl+N` targets the focused screen, not always primary | macOS symbolic-hotkey dispatcher uses the focused window's screen | Move cursor to primary before sending the keystroke. Note: secondary-screen-focused terminals may still misroute — run `cmux-scope` from primary |
| Yabai would solve all of the above | Requires SIP-disable | Rejected per ADR-D7 (security cost) |

**Why not Yabai or `hs._asm.undocumented.spaces`:**

| Option | Verdict |
|---|---|
| **Yabai** | Rejected — SIP-disable. Same blocker as D7. |
| **Native Automator / Shortcuts** | No public API for window→Space movement. |
| **AppleScript via System Events** | `assigned to space` is private. Mission Control UI scripting is slow and fragile. |
| **`hs._asm.undocumented.spaces`** | Predecessor of `hs.spaces`. Same underlying private CGSConnection API; almost certainly broken in the same way on Sequoia. Skipped without testing. |
| **Hammerspoon `hs.eventtap.keyStroke`** ✅ | Public, reliable. The actual mechanism we ship. |

**Defaults shipped (single screen, main monitor):**

```
Desktop 1 → tux       (personal / dotfiles)
Desktop 2 → beaver    (workslate / worklog dev)
Desktop 3 → owl
Desktop 4 → hawk      (ESO)
Desktop 5 → otter
Desktop 6 → other     (catch-all)
```

Secondary screen left unmapped intentionally — fewer Spaces and the
single-screen flow covers the actual use cases. Extend later if a
real routing case appears.

**Required user setup (first-time per machine):**

1. `brew bundle install` (adds `cask "hammerspoon"` to Brewfile).
2. `./mac/restow.sh` (stows `init.lua` to `~/.hammerspoon/`,
   wrappers to `~/.local/bin/`, Raycast scripts to
   `~/.local/share/scope-routing/`).
3. Open Hammerspoon once → grant Accessibility permission.
4. From the Hammerspoon console once: `hs.ipc.cliInstall()` (needs admin).
5. Create 7 macOS Desktops on the main monitor in Mission Control.
6. Enable "Switch to Desktop 1–6" hotkeys in System Settings → Keyboard
   → Keyboard Shortcuts → Mission Control.
7. Add `~/.local/share/scope-routing/` to Raycast's Script Commands
   directory list.
8. From a cmux terminal, run the bootstrap loop once to create the
   per-scope cmux windows.

**Operating workflow:**

- Daily: `chrome-scope <scope>` or Raycast `chrome: <scope>` works
  from anywhere — Chrome window appears on the right Desktop. cmux
  navigation: `cmux-scope <scope>` from inside cmux works fully;
  from outside cmux, only the Space switch happens.
- After cmux quits + restarts: run `cmux-rebootstrap` from a cmux
  terminal. It recreates each scope window on its target Desktop
  via `cmux-scope`. Inside-window content (running ssh sessions,
  shells, processes) is not restored — the user re-establishes
  per-window state manually.

**Composes with:** D23 (macOS-native + Rectangle + Wavebox stack);
D15 (Chrome stays primary for tools that need it).
**Doesn't supersede anything** — adds a routing layer on top of D23
without contradicting any of its choices.


---

## D25: Documentation categories — ideas, plans, and a tools register (2026-09-25)

**Decision:** Split repo documentation into four kinds rather than three, and
scope the README-per-directory rule to exclude Stow payload.

| Kind | Where | Kept current? |
|---|---|---|
| Standing references | `docs/*.md` | yes |
| Decision log | `docs/decisions.md` | yes, append-only |
| **Candidate register** | **`docs/possible-tools.md`** | **yes** |
| Captured scope | `docs/ideas/` | dated, not frozen |
| Planned work | `docs/plans/` | dated, not frozen |

### Why `docs/ideas/` separate from `docs/plans/`

`docs/plans/` held two documents that open with `Status: **parked**` and are
organised as threads with next steps. A design that has been thought through but
has no threads and no next steps does not fit that shape — calling it a plan
implies a commitment that was never made.

So: **ideas are *what this would be and why*; plans are *what to do about it*.**
An idea graduates by *getting* a plan rather than becoming one: the idea keeps the
design and the ruled-out options, the plan takes the work breakdown and the
sequencing, and a pointer joins them. Neither kind is frozen — a parked document
stays as its snapshot, one under active discussion is updated in place, and the
`Status:` line says which.

The trigger was the slipbox design, which lived only in Claude's
memory store — the wrong home for something meant to be re-read cold months
later.

### Why `docs/possible-tools.md` is a register, not an idea

Tools that were evaluated but not adopted kept accumulating as memory notes:
`hcom`, `slk`, `lazyrsync`, `hygg`, the agent-plus-notes reference repos, and
`leaf` before it was adopted. Each carried real work — install routes, maturity
cautions, the specific questions to answer before committing.

That is not an idea, because it never graduates into a plan; it is a standing
register that keeps gaining entries. It is **the waiting room for this file**: a
candidate sits there until installed, then earns a `mac/Brewfile` line and an ADR
here if the choice mattered. Rejected candidates stay, with the reason, so they
are not re-evaluated from scratch.

### Why the README rule now exempts Stow payload

`CLAUDE.md` said "Every directory should have a `README.md`". Followed literally
inside a Stow package, that scatters symlinked READMEs through `$HOME`.

GNU Stow 2.4.1's built-in ignore list contains `^/README.*`, but **anchored to the
package root**. So `vm/base/README.md` is skipped while
`vm/base/.config/git/README.md` would be symlinked to `~/.config/git/README.md` on
every VM. Verified with a dry run against a throwaway package: the top-level
README was ignored, the nested one was linked.

The rule now applies to non-payload directories — `docs/`, `docs/plans/`,
`vm/docs/`, `vm/lib/`, `vm/scopes/` — and stops at the payload boundary.
Documentation for a package's contents belongs in its top-level README or in the
relevant `docs/` folder. Existing practice already agreed: no `.config/<tool>`
directory in this repo has a README.

**Composes with:** D14 (codename-as-identity, for the scope docs);
the curated-Brewfile rule in `CLAUDE.md`, which `possible-tools.md` feeds.
**Supersedes nothing** — it subdivides an existing convention and narrows one
rule that was overbroad.
