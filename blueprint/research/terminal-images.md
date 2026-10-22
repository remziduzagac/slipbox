---
status: current
created: "2026-09-25"
---

# Research: images in the terminal

What drawing images inline in a terminal takes: the protocols, how support can be known, what stands in the way, what
works below the protocols, and the details that bite in practice. Written for the image design (plan `12.x`) on
2026-09-25. The record names no sources for the protocol facts, so they are marked *memory*; one observation was made on
this machine (*ran*). What OpenTUI already provides (a capability probe, kitty and sixel, an `Image` component) is in
[stack.md](stack.md) § The image capability layer.

## Summary

- **There are three protocols in practice:** the kitty graphics protocol, iTerm2 inline images (OSC 1337) and sixel.
  Support is uneven and version-dependent, so a table of terminal names is a hint, not a decision procedure (*memory*).
  This informed D127.
- **The environment describes the outer terminal, not the channel:** inside a herdr pane, `TERM` is still
  `xterm-ghostty` and `TERM_PROGRAM` still `ghostty` (*ran*). Support has to be asked of the terminal, not read from
  `$TERM` (D127).
- **Multiplexers are the actual obstacle:** the terminal usually supports images; the thing in the middle usually
  doesn't (*memory*).
- **Below the protocols, Unicode blocks in true colour approximate an image in any colour terminal** (*memory*).
- **Sizing, redraws, scrolling and caching are where images bite** (*memory*): each needs designing from the start.

## Protocols

- In practice there are three: the **kitty graphics protocol**, **iTerm2 inline images** (OSC 1337) and **sixel**
  (*memory*).
- Ghostty, the terminal here, implements the kitty graphics protocol (*memory*).
- Support is uneven and version-dependent, so any table of terminal names is a hint, not a decision procedure
  (*memory*).

## Knowing support: the channel, not the environment

- Inside a herdr pane on this machine, `TERM` is still `xterm-ghostty` and `TERM_PROGRAM` is still `ghostty` (*ran*).
  Those describe the *outer* terminal, and say nothing about whether graphics escapes survive the multiplexer in
  between.
- So a naive `$TERM` check would confidently conclude that images work, then emit escape sequences into a pane that
  swallows them, which usually looks like garbage on screen, not like nothing (*memory*).
- Detection will be wrong sometimes, and the user knows what they are looking at (*ours*).

## Multiplexers

- **tmux** needs `allow-passthrough` turned on (*memory*).
- **zellij** lacked support for a long time, and added the kitty protocol in 0.45 (2026-08) (*memory*).
- **herdr's** behaviour was left unverified on 2026-09-25, deliberately: an implementation detail, not a design input
  (*ours*).

This is the same shape as the external-pane provider: detect, degrade, never require (*ours*).

## Below the protocols

- **Unicode half-block or quadrant blocks with true colour** give a recognisable approximation that works in any colour
  terminal; `chafa` is the reference implementation to study (*memory*).
- **Alt text plus the path** is always readable (*ours*).

## Details that bite

- **Sizing needs cell pixel geometry:** `ws_xpixel` / `ws_ypixel` from `TIOCGWINSZ`, or `CSI 14 t` / `CSI 16 t`.
  Without it, pixels cannot be converted to rows, and images come out the wrong size (*memory*).
- **Transmit once, place many.** The kitty protocol supports image IDs and separate placement, so re-sending image data
  on every redraw is avoidable; re-sending it is the usual cause of "images make the TUI feel slow" (*memory*).
- **Scrolling is where this gets buggy.** By default a placed image floats over the screen rather than scrolling with
  the text under it. The kitty protocol's unicode placeholders make an image behave like text and scroll correctly;
  without them, every scroll needs an explicit reposition or hide (*memory*). It is better designed for from the start
  than discovered in a long note (*ours*).
- **Caching:** decode and scale once per (path, size), keyed by mtime (*ours*).

## Gaps

- herdr's handling of graphics escapes was not checked on 2026-09-25, on purpose; the build later recorded that herdr
  draws kitty graphics too (plan `12.3`).

## Sources

- The kitty graphics protocol (image IDs, separate placement, unicode placeholders); iTerm2 inline images (OSC 1337);
  sixel.
- tmux (`allow-passthrough`); zellij 0.45 (2026-08); herdr.
- `chafa`.
- `TIOCGWINSZ` (`ws_xpixel`, `ws_ypixel`); `CSI 14 t` and `CSI 16 t`.
- This machine: Ghostty, inside a herdr pane (2026-09-25).
