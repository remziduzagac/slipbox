# Component inventory

The pieces the app is built from, as designed. Update this page when a component changes, not when a screen does.

## Sheets

The share sheet slides up from the bottom, covers at most two thirds of the screen and carries a link, a copy button and
the system share targets. The link field runs the full width of the sheet less 16 on each side. How it behaves from
first tap to sent link is in [[share-flow]].

## Buttons

| Component | Where | States |
| --- | --- | --- |
| Primary button | Share sheet, save route | rest, pressed, disabled, busy |
| Quiet button | Route card, sheet footer | rest, pressed |
| Icon button | Map toolbar | rest, pressed, toggled |
| Copy chip | Share sheet link field | rest, copied (2 s), failed |

## Banners

A banner sits under the status bar and never covers the map controls.

- **Offline** shows while the device has no network and the queue has pending changes.
- **Sync stalled** appears when the queue has not drained for fifteen minutes with the network up (R6), and offers
  a retry; see the incident of 2026-09-22.
- **Link expired** replaces the route card when a shared link is past its 72 hours.

## Tokens

Spacing is a 4-point scale, corner radius is 12 for sheets and 8 for chips, and the accent is the same blue in light
and dark. Type is the system face at 13, 15 and 20.
