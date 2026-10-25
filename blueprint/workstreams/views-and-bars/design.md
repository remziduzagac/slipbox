# Design changes

Deltas name the root section to update when consolidated. Unmentioned behaviour stays as in the consolidated root.

## MODIFIED design/terms.md § Terms

Previously: Mode meant Read, Lens or Source, View meant a window's buffer and position, and the explorer had a view.

View means a window's READ or SOURCE presentation. The lens is a toggle within READ. Mode means vim's NORMAL,
INSERT, VISUAL or V-LINE. The code's `View` still holds a buffer and its window state. The explorer's zoom names the
folder its tree shows. Workspace belongs to a vault; its zoom may be wider or narrower than either (VB-D1, VB-D4).
"Where you are" means zoom, workspace and git on the top bar. Retire the explorer's view and source mode as user
terms, preserving old decision wording and public compatibility names.

## MODIFIED design/tui.md § Screen layout (plan `3.1`)

Previously: HDR's Read, Lens and Source were one radio group, its chip replaced the view label while typing or
selecting, and WSP's hideable top bar showed vault, optional workspace and branch, with indexing at right.

READ and SOURCE form a radio pair, LENS beside READ a toggle. Opening the lens from SOURCE selects READ with it on;
closing it leaves READ. Glyphs or single characters in each glyph set occupy about three padded cells. Selected
views use view colours; lens selection remains visible alongside READ. Keep per-window state, focus, disabled
refusals, mouse occlusion, sanitization and shared width measurement from HDR (VB-D1).

The chip has two segments: `READ │ NORMAL`, `READ·LENS │ INSERT`, `SOURCE │ VISUAL`, including V-LINE selection.
The view segment uses its view colour and the mode segment its mode colour. INSERT requires SOURCE or the open lens.

The top bar always shows the `slipbox` palette chip at left. Each group has a faint background, separated by space;
items within it use a thin dim separator. Nerd blocks have rounded ends; unicode and ascii use plain ends. Each
item alone lights under the mouse. Colours come from theme tokens, with glyphs and text also carrying meaning.

The central location block contains, in order:

- explorer zoom, always shown, with explorer icon; click opens and focuses the explorer;
- workspace name with workspace glyph, without the vault prefix; click opens the vaults popup;
- branch and ahead/behind and operation as today, plus changed-file count in the changed-file colour. Branch click
  opens the branches menu; changed-count click opens the git panel. Vault identity remains in Info.

At right, conditional blocks show background work as spinner and count (indexing, exports, fetches and language
servers starting), and the available upgrade as icon and version in accent colour. Work click opens a list with
cancel per task. Upgrade click runs the existing upgrade action; its offer persists rather than scrolling away.
All buttons invoke named registry commands, reusing existing commands where applicable (VB-D3).

Narrowing order: right blocks shrink to icons then disappear; git loses ahead/behind, then cuts and drops branch,
then drops the changed count. Zoom and workspace remain, paths cut from the front to keep their end, finally icons
and short names. Every string passes through sanitize; only core/width.ts measures it.

Remove the status line's location fallback. Preserve the other status items and header settings.

## REMOVED design/tui.md § UI settings: top-bar visibility

Previously: `space u b`, the settings list and `ui.top_bar` could hide the bar; zen hid it too.

The bar is always shown, including zen. Remove its toggle and settings-list entry; read the retired config key with
one notice, not an error (VB-D3). Other UI visibility settings remain independent.

## MODIFIED design/tui.md § Source mode; § The lens: live preview; § Files beyond notes

Previously: source and lens were modes; code configured as source could not switch to its document presentation.

Use SOURCE view and READ with the lens, respectively. `[render] notes`, `code`, `data` default true and select the
opening presentation only. False opens SOURCE without disabling supported READ or its lens. Unsupported text and
unparsable data retain existing refusals. Read legacy code "document"/"source" as true/false and edit_in "live" as
"lens". View commands and toggles say nothing on success; refusals retain explanations (VB-D1, VB-D2).

## MODIFIED design/tui.md § Going into a vault (plans `17.10`, `17.14`, `21.10`)

Previously: unsaved notes refused a switch; `space v v` listed named folders, with worktrees represented once.

Resolve pending properties edits first as today. Unsaved notes then open a choice: save all and go, discard and go,
or stay. Save through App.writeBuffer; only switch after all saves succeed. Discard goes without keeping the edits;
stay leaves the current vault and workspace. Failed saves explain the failure and keep the current vault (VB-D4).

Persist the outgoing workspace to disk. Release its buffers, parses and index, and references held by views,
controllers and pending background work, before completing the destination's restoration. Preserve return history as
paths and positions, not old buffer graphs; ctrl+o restores from disk. Test alternating vaults and return, including
memory ownership, not merely visible tabs. Preserve existing git-state clearing and watcher/config switching.

The vaults popup, `space v v`, `:folders` and the workspace click, lists every known vault regardless of pointer name,
most recent first, filterable with `/`. Include named home folders, marked as home's, and group worktrees under their
repository (VB-D5). Named-folder pointer lookup and default-copy selection remain distinct functions. `slipbox vaults`
exposes the
same ordered rows as text and JSON; `slipbox folders` retains pointer names and copy defaults.

## MODIFIED design/tui.md § Positions; § Side panes

Previously: workspace ownership and explorer zoom were defined, but users read the explorer's view and the vault
list was the named folders.

Use explorer zoom throughout current design and user strings. A workspace belongs to a vault: branch, named home
folder, home's own, or vault fallback, with WSP's existing precedence and shared vault state unchanged. The explorer
zoom can span other vaults without switching workspace. Changing vault restores that vault's workspace (VB-D4).

## MODIFIED design/roots.md § Named folders; § Home; § Worktrees

Previously: named folders supplied the switch list; home-folder workspaces and worktrees were separate concepts.

Separate the all-vault switch list from pointer naming: unnamed known vaults appear too. Include home-folder
workspaces with their home marker, and worktrees nested under their repository, keeping each worktree a vault of its
own with its own workspace and content boundary (VB-D5). Pointer names and copy defaults keep their meaning.

## MODIFIED design/code-view.md

Previously: render.code "document" or "source" controlled whether the document view was available.

Use the boolean opening default, reading both legacy strings; SOURCE always remains available and READ remains
available for supported code regardless of that default (VB-D2).

## Consolidation notes

Append dated amendments under HDR-D2, WSP-D4 and WSP-D5; preserve their original entries. Update current terminology
through root requirements and design, without rewriting historical decisions. Keep this workstream until its tasks
and the whole batch's review and validation are complete.


## Review refinements (VB-D1–VB-D5)

The status chip narrows the view to R/R·L/S, then vim mode to N/I/V/V-L, before shortening the file name. Without a
window it says NORMAL. Removing a vault marker keeps the existing unsaved-note refusal: it rewrites links, rather
than only switching vaults. A cancelled index warns of incomplete search and backlinks and names reindex as the retry.
The upgrade item clears when skipped, installed or no longer newer; merely closing its offer keeps it.

## MODIFIED design/tui.md § The top bar (#94, VB-D7)

Previously: work was a spinner/count only while running, and upgrades alone showed a version at right (VB-D3).

Always show the work count and running version; previews shorten to `x.y.z-P`. An available upgrade adds a green
arrow in `upgrade_available`. Preserve narrowing. Work opens a live list by click, `space b` or palette, with task
progress, elapsed seconds and supported Stop/Restart/Pause/Resume controls. Keep five recent outcomes plus older
failures until dismissed, retaining no completed closures. Refresh elapsed time only while the list is open.

About opens by version/arrow, `space a` or palette. Show full version/channel and the previous version from the
current version's `previous.json`, recorded before the atomic upgrade commit. Show a newer release's notes address
and Upgrade, or `howToUpgrade` for other installations. No rollback. Escape closes both popups.
