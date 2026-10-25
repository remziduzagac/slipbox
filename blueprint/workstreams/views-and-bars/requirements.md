# Requirements changes

## MODIFIED requirements.md § Reading

Previously: the window header selected exactly one of Read, Lens and Source as three modes (HDR-D2).

Each window has READ or SOURCE as its view, with LENS toggled inside READ. Its header shows the radio pair and the
lens toggle; its status chip shows the view (including the lens) and vim mode together. Both have their own theme
colours. Successful view switches are silent; refusals explain why (VB-D1). The breadcrumb and header retain their
independent visibility settings.

## MODIFIED requirements.md § Files beyond markdown, and code

Previously: notes opened rendered, supported data as documents, and code's `render.code` selected document or source.

Rendering defaults independently for notes, code and data through booleans, true by default. False opens SOURCE;
READ remains available where supported. Old code values and the old lens setting remain readable (VB-D2).

## ADDED requirements.md § Reading

The top bar is always shown. Its blocks distinguish the command palette, explorer zoom and workspace and git,
background tasks and a newer version. Each item is a separate mouse target; narrow layouts preserve zoom and
workspace longest. A retired top-bar setting produces one notice, not a config error (VB-D3).

## MODIFIED requirements.md § Vaults and links

Previously: choosing another vault restored its workspace; the TUI refused while any note was unsaved.

Switching vaults asks to save all and go, discard and go, or stay when edits are unsaved. After switching it releases
the old vault's notes, parses and index, retaining its workspace on disk for return. The vault list includes unnamed
vaults, home folders marked as home's, and worktrees grouped under their repository (VB-D4, VB-D5).

## Acceptance criteria

- #82: READ and SOURCE are mutually exclusive; READ and LENS can both be lit. LENS in SOURCE opens READ with lens.
  NORMAL, INSERT, VISUAL and V-LINE remain independently represented. Editing in READ opens the lens (or SOURCE
  under the existing edit preference). Moving, selecting and copying work in READ without the lens.
- #82: header glyphs in nerd, unicode and ascii, theme colours, split focus, chip segments, silent switches and
  explained refusals are tested. All three rendering defaults and legacy values have tests. Explorer wording uses zoom.
- #86: independently hovered and clicked items, changed-file count, background task list and cancellation, persistent
  upgrade offer, and narrowing order are tested on screen. The retired setting produces exactly one notice.
- #85: all three unsaved choices tested, failed saves do not leave, return restores the workspace, and alternating
  vaults releases buffers, parses and index. Unnamed vaults, home folders, grouping, recency and `/` filtering tested.
- Each implementation updates user docs and CHANGELOG and retakes and inspects affected screenshots. Named commands
  cover user actions; focused tests and terminal checks exercise the changes. No full-suite run is required here.

## MODIFIED: Permanent work and version (#94, VB-D7)

Previously: right blocks appeared only for running work or an available upgrade.

Show idle zero, active work count and running stable/short preview version. A theme role supplies the green upgrade
arrow. Work has live progress/time, only supported controls, five recent outcomes and retained failures. About shows
full version/channel, recorded predecessor and newer release notes/upgrade method. Both support click, leader key
and palette entry. Unit and terminal checks exercise idle/busy, controls, outcomes, version states and narrowing.
