# Accessibility and terminal support

slipbox supports keyboard navigation, configurable colours, plain glyphs and CLI output, but the TUI is not verified
as a screen-reader interface. Choose a workflow that works with your terminal and assistive tools rather than
assuming a full-screen terminal is accessible by default.

## Reading and input choices

Use arrows and familiar editor shortcuts, the mouse, or vim-style keys. `space` shows action groups and `?` lists
bindings. The [shortcut reference](keys.md) covers the available controls. Some combinations depend on what the
terminal sends; [Troubleshooting](troubleshooting.md#keys-that-dont-arrive) explains how to diagnose a missing key.

Use `mono` or `NO_COLOR` for attributes without colour, and `render.glyphs = "ascii"` when icons are unclear. Themes
and per-role overrides can change contrast. These settings improve presentation; they are not a claim of measured
accessibility conformance.

## Screen readers and plain output

The TUI redraws a grid and draws its own cursor. A screen reader following new terminal lines may lose the reading
position. The CLI can provide a simpler interface:

```bash
slipbox render ~/notes/inbox.md --plain --glyphs ascii
slipbox read ~/notes/inbox.md
slipbox outline ~/notes/inbox.md
```

These commands print and exit. They do not provide a live follow stream, and they read saved files. You can also
use your own editor for the same Markdown files, or hand off the current note with `space n e`.

## Terminal-specific problems

Check [Troubleshooting](troubleshooting.md) for glyphs, images, clipboard behavior over SSH and Windows/WSL limits.
[Installation](../guides/install.md) lists supported platforms. Do not assume every terminal forwards the same mouse,
clipboard or modifier-key events.

## Policy and reporting

[Accessibility](../../ACCESSIBILITY.md) is the project's maintained policy and reporting route. It describes the
current limitations and available accommodations. Report a barrier with the terminal, assistive tool, theme/glyph
settings, attempted action and observed result; avoid including private note contents in an issue.
