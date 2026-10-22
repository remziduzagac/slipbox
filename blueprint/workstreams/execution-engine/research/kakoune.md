---
status: current
created: "2026-10-16"
---

# Research: Kakoune

Source inspected at `4d4ee86c2d039c2a5f29f109e7e59105d2073046`. Not built or run. Claims about Kakoune are *read*;
Slipbox adaptations are *ours*. The scope is session command delivery, execution context and JSON UI.

## Summary

Kakoune demonstrates a small separation between session commands and presentation/input transport. Explicit
execution context lets automation edit text while preserving the person's selection. Borrow that intent through
Slipbox's document operations; keep the existing TUI and checked edit contracts.

## Two distinct surfaces

`src/remote.cc:756` sends a Command message to the session socket. At line 820 the server executes it through
`CommandManager` in an empty context; errors go to the debug buffer and the socket closes. This inspected command
path does not return a correlated typed success/failure result. [Source][remote].

`doc/json_ui.asciidoc` defines a separate newline-delimited JSON-RPC UI on stdin/stdout: draw, status, menus and
information flow outward; keys, paste, resize, scroll and mouse input flow inward. This is a presentation/input
contract, not a revision-checked document API. [Protocol][json].

Adaptation: keep application operations and session control distinct under one invocation contract. Direct edits
must not require simulated keys or a visible editor. Session actions deliberately use the real TUI. Retain typed
results, receipts and frame acknowledgement; successful delivery alone cannot establish successful execution.
A full remote renderer protocol is unnecessary for the current local control and test requirements.

## Context is a deliberate choice

`doc/pages/execeval.asciidoc:21` documents explicit client targeting; line 29 documents draft execution in copied
selection/input context, allowing buffer changes without changing the client's selection. The same page separately
documents a try-client form that falls back to the current context. [Execution context][context].

Adaptation: application edits address document IDs and revisions and leave view focus/cursors to the TUI's anchor
updates. Visible-session input names its view and expected context. Reject a missing target rather than falling
back to whichever view the person has since selected. No additional private agent cursor or draft-editor runtime
is needed to obtain the useful property.

## Limits

Kakoune's command language, hooks, shell composition and multi-client editor are not proposed ENG features. This
review did not establish its concurrency, access-control or undo guarantees. The JSON UI protocol does not establish
that document and view coordinates have identical meanings, or that its transport should replace Slipbox's Canvas.

[remote]: https://github.com/mawww/kakoune/blob/4d4ee86/src/remote.cc
[json]: https://github.com/mawww/kakoune/blob/4d4ee86/doc/json_ui.asciidoc
[context]: https://github.com/mawww/kakoune/blob/4d4ee86/doc/pages/execeval.asciidoc
