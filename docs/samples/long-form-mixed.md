# Parked plan: nvim ↔ agent integration

Status: **parked — to revisit**. Captured 2026-06-10 during a longer
exploration of where the stack should go next.

Five threads live here. They're related but can be picked up
independently:

1. **`agentic.nvim` for multi-agent ACP chat** sharing sessions with
   terminal CLIs (Claude / Codex / Gemini / OpenCode).
2. **`LintaoAmons/bookmarks.nvim` for line-level notes** with a
   `<leader>aw` "wrap up and deliver to agent" hook.
3. **Herdr pane-tabs feature** request (or fork) to make multi-agent
   layouts viable without eating screen estate.
4. **Herdr socket sender from nvim** — small lua module wrapping
   `herdr pane send_text` / `send_keys`; underpins Thread 2's
   delivery channel.
5. **Herdr layout: Scenario A chosen** — 3-column at 2/3 Ghostty,
   escape-hatch ladder for breathing room. Most awaited primitives
   (`pane split --ratio`, `pane resize --amount`, `pane swap`,
   `pane focus`, `pane zoom`) landed in v0.6.10 stable — fleet
   upgraded, `herdr-3col` rewritten to use float ratios directly.
   Only `pane layout save / apply` still outstanding for future v0.7+.

The full conversation context lives in this session's transcript at
`/Users/remzi/.claude/projects/-Users-remzi-Projects-dotfiles/2748c705-70a5-42ea-8b72-8589a904be82.jsonl`.

---

## Thread 1 — `agentic.nvim`

### Why this and not something else

- Built around Zed's Agent Client Protocol (ACP). Pure ACP chat
  client; no legacy API adapters cluttering the config.
- **Sessions interchange with terminal CLIs**: a Claude session
  started in a Herdr pane is resumable from nvim and vice versa,
  because ACP providers manage sessions natively (Claude/Codex/
  Gemini/OpenCode all implement `session/list`).
- Newest in the space (active commit cadence into Jun 2026), pure
  Lua, no `lazy.nvim` lock-in → installs cleanly via `vim.pack`
  on kickstart.nvim.
- Complements Herdr instead of duplicating it: Herdr stays the
  terminal-side multiplexer, agentic.nvim is the chat front-end
  inside nvim. Same agent backend, two views.

Alternative we considered: `olimorris/codecompanion.nvim`. Heavier,
more mature, supports both ACP and MCP, has chat/inline/agent modes
and MCPHub integration. Pick CodeCompanion only if we later want
MCP servers as slash commands; otherwise agentic is the right
"do one thing well" choice for this profile.

### Setup requirements (on each VM where we run agents)

Install ACP wrappers per agent:

```sh
npm install -g acp-claude-code     # Claude Code → ACP
npm install -g codex-acp            # Codex → ACP
# gemini-cli already supports --experimental-acp natively
npm install -g auggie-acp           # Augment Code → ACP (optional)
```

Then `agentic.nvim` config (rough sketch — finalize on pilot):

```lua
require('agentic').setup({
  providers = {
    claude = { command = 'acp-claude-code' },
    codex  = { command = 'codex-acp' },
    gemini = { command = 'gemini-cli', args = { '--experimental-acp' } },
  },
})
```

### Open questions to validate during pilot

- Does it work cleanly with `vim.pack` on kickstart.nvim (no
  `lazy.nvim`)? Almost certainly yes — pure Lua — but verify.
- Can it discover a Claude session running in a Herdr pane via
  `session/list` without manual session-ID copy? Likely yes for
  Claude (writes session JSONL under `~/.claude/projects/`) but
  worth confirming the lookup mechanism.
- How does the chat UI render in narrow splits — does it stay
  usable with nvim split + chat panel side-by-side, or want a
  full split?

### When we resume

Pilot it on hawk:
1. Install `acp-claude-code` via npm
2. Add `carlos-algms/agentic.nvim` to nvim plugins (`vim.pack`)
3. Start a `claude` session in a Herdr pane on hawk
4. Open nvim in a different pane, open agentic.nvim chat
5. Verify session list shows the running Herdr-pane session
6. Resume it from nvim, send the current selection — see if the
   reply lands in both views

---

## Thread 2 — `LintaoAmons/bookmarks.nvim`

> **DROPPED 2026-09-22.** Never installed or wired. `prompt-buffer.lua`
> already covers the adjacent need — capturing `path:42-50` refs into a
> per-project scratch — and the annotation use case never became pressing
> enough to justify four open decisions plus a Thread 4 dependency.
> The analysis below is kept because the plugin comparison is still
> accurate if this is ever reconsidered.

### Why this one specifically

Other bookmark plugins (`tomasky/bookmarks.nvim`,
`crusj/bookmarks.nvim`, `chentoast/marks.nvim`, etc.) are either
outdated or single-list. `LintaoAmons/bookmarks.nvim` is **the
multi-list bookmark plugin** — one collection per task / topic /
agent-conversation. That maps cleanly to "wrap up this list of
notes and deliver to an agent."

Each bookmark: file + line + description + list. JSON-persisted,
telescope-pickable. Active list switchable from the picker.

### Decisions pending (need user input before wiring)

#### Decision 1 — Keybindings

Two options:

| Style | Marks own `m`-prefix | `<leader>m*` only |
| --- | --- | --- |
| `mm` add | sacrifices a native vim-mark letter, faster muscle memory | safer, slower |
| `mi` add with annotation | | |
| `mx` delete | | |
| `<leader>ml` list active | shared | shared |
| `<leader>mL` switch list | shared | shared |
| `<leader>mc` create list | shared | shared |
| `<leader>md` delete list | shared | shared |
| `<leader>mr` rename list | shared | shared |

User TBD.

#### Decision 2 — Sign-column style

Emoji `🔖` vs text glyph (`▶` plain, `◆` annotated)?

User TBD.

#### Decision 3 — Wrap-up content (the `<leader>aw` bundle)

What goes into the markdown bundle delivered to an agent?

Levels:
- **Minimum**: bookmarks (file:line + annotation) only
- **+ snippets**: 3 lines of context around each bookmark
- **+ scratch buffer**: a parked free-form note buffer
- **+ visual selection**: current selection appended
- **+ git diff** since list was created

User TBD. Suggest: bookmarks + 3-line snippets as v1; layer in
scratch/selection later.

#### Decision 4 — Delivery channel

One key, three keys, or configurable?

- `<leader>aw` → Herdr socket → agent pane (one-shot delivery)
- `<leader>aW` → save to `/tmp/session-notes-<ts>.md` (manual reference)
- `<leader>aY` → pbcopy / system clipboard

User TBD. Suggest: three-keybind variants for flexibility.

### Storage strategy (decided)

- Local per-VM (default `~/.local/share/nvim/bookmarks/bookmarks.json`).
- NOT synced via dotfiles — bookmarks are session/task data, not
  config. Plugin config lives in dotfiles; bookmarks JSON stays
  local per machine.
- List names are free-form per task (not auto-by-branch); revisit
  later if manual create+switch feels heavy.

### Proposed wrap-up output format

```markdown
# Session notes: auth-refactor

## Bookmarks

### `auth/middleware.ts:42`
> token decode looks wrong — should bail if header missing
```ts
    const token = req.headers.authorization?.split(' ')[1];
    const decoded = jwt.verify(token, SECRET);  // ← throws on null
    req.user = decoded;
```

### `auth/routes.ts:18`
> unprotected route, intentional?
```ts
    router.post('/refresh', refreshHandler);
```

## Free-form notes

(scratch buffer content if any)
```

### When we resume

1. Lock in the four decisions above
2. Add `LintaoAmons/bookmarks.nvim` to
   `vm/base/.config/nvim/lua/custom/plugins/`
3. Wire keybinds + signs + telescope picker
4. Write the `<leader>aw` wrap-up function (stub first — save to
   file; later add Herdr-socket delivery once Thread 4 lands)
5. Stow + sync to all VMs

---

## Thread 3 — Herdr pane-tabs feature

### The problem

Herdr's current pane layout is split-only. To run nvim + multiple
agents side-by-side, you split into N panes — which eats screen
real estate quickly (4 panes = tiny). What we want is
**browser-style tabs *within* a pane region**: nvim takes the left
half, the right half is a single pane slot that tabs between
`claude`, `codex`, `gemini`.

This isn't natively supported. Workspace-level tabs in Herdr swap
**entire layouts**, not single pane slots.

### Three paths

| Path | Effort | Outcome |
| --- | --- | --- |
| **A. File feature request** at `github.com/ogulcancelik/herdr` | 15 min | Maintainer may accept; defers the decision |
| **B. Workaround via agentic.nvim** | Already covered by Thread 1 | nvim hosts a single chat panel that swaps between agents; no need for Herdr pane-tabs since ACP routes to multiple agents from one nvim panel |
| **C. Fork Herdr and add it** | Significant — Rust, layout engine, UI, socket API | Best learning + upstream PR but real time cost |

### Recommendation when we resume

1. **File the issue first** (Path A). Cheap, may unblock.
2. **Lean on Thread 1 (`agentic.nvim`)** for multi-agent UX since
   ACP routing from one nvim panel sidesteps the Herdr pane-tabs
   need entirely.
3. **Defer the fork decision** until weeks of real use show whether
   pane-tabs are still missing.

### Issue draft (rough text for filing)

> **Feature request: tabbed pane groups (browser-style tabs within a pane region)**
>
> Currently Herdr panes can only be split. For workflows that
> involve one persistent editor (nvim) + multiple agent CLIs
> (claude, codex, gemini) accessed one at a time, splits eat screen
> estate quickly.
>
> Request: a "tabbed pane group" — a pane slot that holds N
> processes with a tab strip, only one visible at a time, like
> browser tabs.
>
> Use case: left half = nvim. Right half = tabbed group with
> claude / codex / gemini. Switch agents without losing nvim's
> space.
>
> Workspace-level tabs in Herdr already swap full layouts. This
> feature is the more granular version at the pane-group level.

---

## Thread 4 — Herdr socket sender from nvim

### What it is

A small nvim lua module that uses `herdr pane send_text` and
`herdr pane send_keys` to deliver text from nvim to a running agent
in a Herdr pane. Underpins Thread 2's `<leader>aw` delivery
channel, and is independently useful for "send selection to
agent" workflows even without bookmarks.

### Sketch

```lua
-- ~/.config/nvim/lua/custom/herdr-send.lua
local M = {}

local function get_agent_pane(agent_name)
  local raw = vim.fn.systemlist('herdr agent list --json')
  local list = vim.fn.json_decode(table.concat(raw, '\n'))
  -- Pick the first pane labeled <agent_name>, or first agent if none
  for _, a in ipairs(list) do
    if a.agent == agent_name then return a.pane_id end
  end
  return list[1] and list[1].pane_id or nil
end

function M.send(text, opts)
  opts = opts or {}
  local pane = opts.pane or get_agent_pane(opts.agent or 'claude')
  if not pane then
    vim.notify('No agent pane found', vim.log.levels.WARN)
    return
  end
  vim.fn.system({'herdr','pane','send_text',pane,text})
  vim.fn.system({'herdr','pane','send_keys',pane,'Return'})
end

return M
```

### Default keybinds (proposal)

| Key | Action |
| --- | --- |
| `<leader>sc` (v-mode) | Send selection to first `claude` pane |
| `<leader>sx` (v-mode) | Send selection to first `codex` pane |
| `<leader>sg` (v-mode) | Send selection to first `gemini` pane |
| `<leader>sp` | Pick target pane interactively |

### When we resume

Lightweight; can land independently of Threads 1–3.

---

## Thread 5 — Herdr layout: Scenario A chosen

### What landed

After exploring two layouts at length, settled on **Scenario A**:

```
[ Wavebox 1/3 ]   [ Ghostty 2/3 — sidebar 22 + 3-column content ]
                    │ col1 main agent ~140c │ col2 nvim ~140c │ col3 others ~75c │
```

- **Wavebox** at 1/3 screen — most web apps render fine at this width
  (Slack, GitHub, Jira, Linear, ChatGPT, etc.). Exceptions:
  Canva/Figma (canvas-heavy) — handle case-by-case.
- **Ghostty** at 2/3 screen — content area ~365 cols after 22-col
  sidebar.
- **One Ghostty tab per VM**, each running `hvm <vm>` (the `hvm`
  helper sets the tab title to the VM name via OSC 2).
- **Per project**: one Herdr workspace, with the 3-column layout
  built via `herdr-3col` (in `vm/base/.config/zsh/.zshrc`).
- **Per worktree**: grouped child workspace under the source — same
  3-column layout once `herdr pane layout save/apply` ships
  (currently a manual rebuild per worktree).

### Column purpose + ergonomic calibration

| Col | Role | Target width | Rationale |
| --- | --- | --- | --- |
| col1 | Main agent (claude/codex/gemini TUI) | ~140c | Closest to screen center (~46% mid) — eye rest |
| col2 | nvim | ~140c | Comfortable for single-buffer code at 120-char limit |
| col3 | Others stack (codex+gemini in vertical sub-panes) | ~75c | Narrow but sufficient for peripheral TUIs (>60c minimum) |

The 120-char ergonomic limit is the calibration point. Going above
~140c per column doesn't help readability — it just adds whitespace.
Going below ~120c per column tightens code below the comfort
threshold.

Per-pane size measured via `tput cols` after the user's manual tune:
~121/121/54 — close to target ratios; refinement deferred to v0.7+
when `--ratio` lands in stable.

### Scenario B (alternative considered, rejected for now)

**Scenario B** = two Herdr workspace tabs per project:
- Tab 1: nvim alone (full Ghostty width)
- Tab 2: agents 2-column (main + others stack)

Math at 2/3 Ghostty: Tab 1 nvim gets 365c, Tab 2 main agent ~237c,
others ~128c. More breathing room everywhere; sidebar still rolls
state across both tabs. Would pair beautifully with `agentic.nvim`
(Thread 1) since the chat panel could split Tab 1 while Tab 2 hosts
the native TUIs.

**Rejected because**:
- Nvim at 140c (Scenario A) already comfortable for single-buffer —
  the extra 225c in Scenario B is mostly whitespace
- TUI agents at 140c already past their comfortable rendering — the
  extra 97c in Scenario B's main column is also whitespace
- Tab switching adds friction vs always-visible 3-column
- Less peripheral awareness of agent output (only sidebar; no live
  pane content visible)

**Trigger to revisit B**: if Tab 1 use cases regularly demand nvim +
chat panel split (each at 50%), OR if `pane swap` never ships and
the "rotate active agent into col1" workflow stays broken.

### Escape-hatch ladder for nvim breathing room

| Need | Action | Cost | Win |
| --- | --- | --- | --- |
| A little more room | `prefix+b` (close sidebar) | Lose sidebar status visibility | +22c distributed across columns |
| Vsplit / IDE-style layout | `prefix+z` (zoom nvim) | Hide agent panes (sidebar still works if open) | nvim gets full ~365c → 182/182 vsplit comfortable |
| Heavy vsplit daily | Dedicated nvim tab in workspace | Extra setup + 2 nvim processes | Always-available wide nvim |

Default flow stays at rung 0 (3-col + sidebar). Step up only when
needed. Dedicated nvim tab is **parked as future option** — only
worth building if zoom proves repetitive in actual use.

### Sub-decision: half-screen Ghostty alternative

Briefly considered: **1/2 Wavebox + 1/2 Ghostty**. Math: 265c content,
nvim 132/132 vsplit (at the 120 limit, tight). Rejected because Tab 1
in Scenario B doesn't gain enough to compensate for tighter splits.
2/3 Ghostty wins for any layout that involves nvim splits.

### Status update 2026-06-14 — most of these landed in v0.6.10 stable

What was supposedly "waiting on v0.7+" turned out to be in v0.6.10
stable (terse release notes had hidden them — actual binary picked
up the full preview-promoted set). Fleet upgraded across the board:

- Mac (via brew upgrade), beaver/otter/owl (vendor `herdr update`),
  hawk (already there from the brief preview detour). All on v0.6.10
  matching versions, so thin-client + image paste still work.
- `pane split --ratio FLOAT` → `herdr-3col` now uses 0.405 / 0.685 /
  0.4 directly; lands at 121/121/54 on a 304-col Ghostty (target was
  122/122/52). Close enough to call done.
- `pane resize --amount FLOAT`, `pane swap`, `pane focus`, `pane
  zoom`, `pane layout`, `pane neighbor`, `pane edges` — all available
  in stable now.
- Only `pane layout save / apply` (save current layout as named
  template, apply to a new workspace) doesn't appear in the v0.6.10
  CLI yet — `pane layout` exists but takes only a pane id, not a
  save/apply subcommand. That's still preview-only / future work.

`herdr-v07-release-watch` scheduled task stays running — useful for
catching `pane layout save / apply` and whatever else lands in true
v0.7+.

### Open questions for when we revisit

- Does `prefix+z` zoom preserve nvim's split state when unzooming?
  (Almost certainly yes — zoom is purely visual — but verify.)
- When sidebar is closed, do agent toast notifications still fire?
  Config has `[ui.toast] delivery = "terminal"` so Ghostty handles
  notifications via OSC; should be independent of sidebar visibility.
- Does the existing v0.6.8 `sidebar_width = 22` setting actually
  apply on reload, or only on full server restart? Observed
  inconsistency on beaver — applied via `server reload-config` with
  no diagnostics but visible change wasn't obvious. Re-test on next
  fresh session.

---

## Compose order (when we resume)

These threads layer naturally:

1. ~~**Thread 4 (Herdr socket sender)** first~~ — its stated purpose was
   Thread 2's delivery channel. With Thread 2 dropped it has no
   consumer; revisit only if something else needs to send text into a
   Herdr pane from nvim.
2. ~~**Thread 2 (bookmarks)**~~ — dropped 2026-09-22, see above.
3. **Thread 1 (agentic.nvim)** — fully independent, just an nvim plugin
   install + ACP wrappers. Now the first thing to build if this plan is
   picked back up.
4. **Thread 3 (Herdr pane-tabs)** — filed 2026-09-21 as a Discussions
   idea, not an issue: herdrdev/herdr runs a bugs-only issue policy and
   auto-closed the earlier #3775 with a pointer to Ideas.
5. **Thread 5 (Herdr layout)** — passive; triggered by the v0.7+
   release watch task. When it fires, rewrite `herdr-3col` and
   evaluate `pane layout save/apply` as a replacement primitive.

Realistic chunk for one focused session: Thread 4 + Thread 2 wiring
(stop before the agent-delivery wiring). Then a separate session for
Thread 1 pilot. Thread 3 is mostly off our plate after filing the
issue. Thread 5 is hands-off until the release watch alerts us.
