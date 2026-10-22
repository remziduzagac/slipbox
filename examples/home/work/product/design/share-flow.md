# Share flow

Design notes for sharing a route, written in Obsidian before the folder's link setting existed, which is why most links
are wikilinks. Pieces are described in [[components]]; the requirements are in the PRD, [[route-sharing]], which lives
in `prd/` and so is out of reach from this folder.

## Steps

1. The rider taps **Share** on a route card. The sheet opens with the link already made (see [[components]]).
2. The link field shows `kestrel.dev/s/` and the signed link. **Copy** puts it on the clipboard, the chip says "Copied".
3. A rider without the app opens the link in a browser and sees the route, read-only, with an install banner.
4. A rider with the app lands on the route and a **Save** button.

## Decisions

- The sheet is [[components#Sheets]], never a full-screen modal: the map stays visible behind it.
- The copy chip is the one in the [component inventory](components.md#buttons); no new button style.
- Expired links show the **Link expired** banner, see [[components#Banners|the banner list]].
- Offline, the sheet is disabled with a one-line reason, not hidden: [the inventory](components.md#buttons) has the
  disabled state.
- Open question for Tomás: should the sheet remember the last target? The prototype is in
  [Figma](https://figma.com/file/kestrel-share).

## Notes from reviews

- Priya asked for the link to be selectable, not only copyable ([components.md](components.md#sheets) has the field).
- Aiko needs the whole signed link to fit the field without wrapping; the field's width is in
  [the inventory](components.md#sheets).
- Jo wants the expiry date visible in the sheet; tracked in [the roadmap](../roadmap/q4.md).
