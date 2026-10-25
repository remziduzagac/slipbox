# Decisions

## VB-D1: Views and vim modes are separate (#82)

A window has READ or SOURCE as its view. The lens is a toggle inside READ, never a third view; SOURCE has no lens.
Mode means NORMAL, INSERT or VISUAL (including V-LINE). The chip shows both, in separate coloured segments.
The explorer's view is called its zoom, leaving view for the window's presentation.

This replaces HDR-D2's three-way radio group with READ and SOURCE as a radio pair and LENS as a toggle.
Clicking LENS in SOURCE selects READ with the lens open. Header buttons use glyphs or single characters in every
set, padded to about three cells. Successful switches are silent; refusals still explain why.

Reason: presentation and editing state must both be visible without overloading one word or one chip.
Source: issue #82. Preserve HDR-D2; add a dated amendment there at consolidation.

On narrow screens, shorten the view to R/R·L/S, then the vim mode to N/I/V/V-L before the file name. Without a
window the chip says NORMAL.

## VB-D2: Rendering is a default per file kind (#82)

`render.notes`, `render.code` and `render.data` are booleans, true by default. False opens SOURCE without disabling
READ. Keep reading code's old "document" and "source" as true and false, and `editor.edit_in = "live"` as "lens".
Reason: choosing an opening view must not remove a supported presentation.
Source: issue #82; amends HDR's refusal for code configured as source and roadmap `24.2`.

## VB-D3: One permanent bar with distinct groups (#86)

The top bar groups the palette chip, location, background work and upgrade availability. Location is explorer zoom,
workspace and git, each independently clickable; changed files have their own target. Background work is a spinner
and count opening a cancellable list; upgrade availability persists until acted on or no longer applicable.
Retire `space u b` and `ui.top_bar`, reading the latter with one notice. Remove the location fallback in the status
line. Reason: location and pending work need a stable, discoverable place.
Source: issue #86; amends WSP-D4 and WSP-D5. Preserve their entries and add dated amendments at consolidation.

Amended 2026-10-25 by VB-D7 (#94): permanent work count and running version replace the conditional spinner blocks.

## VB-D4: Switching vaults asks and releases content (#85)

A workspace belongs to a vault; switching vault switches workspace. Unsaved notes offer save all and go, discard
and go, or stay. Only workspace state on disk survives the switch: old notes, parses and index are released.
Reason: a switch must preserve a deliberate choice about edits and must not accumulate vault contents in memory.
Source: issue #85; extends WSP-D1 and WSP-D2 without changing their state ownership rules.

Removing a vault marker retains its unsaved-note refusal: it also rewrites links, beyond switching workspaces.

## VB-D5: The list includes all vaults and home workspaces (#85)

The vaults popup includes every known vault, named or unnamed, most recent first, with `/` filtering.
Home folders opened by name appear and are marked as home's. Worktrees group beneath their repository.
Reason: unnamed vaults must remain reachable, and many worktrees must not overwhelm the list.
Source: issue #85; its home-folder and worktree questions are settled as above.

The CLI exposes the same known-vault rows with `slipbox vaults`, including JSON; `folders` continues to describe
pointer names and default copies.

## VB-D6: A git workspace is labelled by its vault (#85, #86)

Agreed 2026-10-25. Show the vault's name in the workspace item, with its branch in the adjacent git item:
`◈ kestrel │ ⎇ main`. The branch is said once. Home folders keep their folder name, and home's top keeps `~`.
This changes only the label: workspaces still belong to their vault, with one per branch in a git checkout.

## VB-D7: Permanent work count and version, with live popups (#94)

Agreed 2026-10-25; amends VB-D3's conditional right blocks and spinner. Show zero dim, active work bright, and the
running version always, previews shortened to `x.y.z-P`. A newer version adds a green arrow in its own theme role.
Keep the existing narrowing order. Reason: idle work and the running build need a discoverable place too.

Work opens by count, `space b` or palette. Show progress, elapsed time and supported named controls: indexing can
stop, restart and pause; exports, fetches and server startup stop and restart; downloading upgrades stop until
`current` moves. Keep five recent outcomes plus failures until dismissed, without retaining completed closures.
About opens by version or arrow, `space a` or palette. Show full version/channel, the replaced version when recorded,
and newer release notes plus Upgrade or the package manager's instruction. Record the replaced version beside the
new binary before the atomic current move; it never provides rollback. Source: issue #94; extends `3.1` and `14.4`.
