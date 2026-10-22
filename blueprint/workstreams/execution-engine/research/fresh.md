---
status: current
created: "2026-10-16"
---

# Research: Fresh

Source inspected at `b4fde85c61d855409cb44c1b8cdf04ded085b6c7`. Not built or run. All Fresh claims below are *read*;
Slipbox adaptations are *ours*. This is a focused review of its control path, not a full editor audit.

## Summary

Fresh is the closest comparison for agents accessing a live terminal editor. Its CLI reuses the plugin scripting
API, while its control listener delivers work to the editor loop. Borrow shared access and explicit outcome
ownership; retain Slipbox's typed operation boundary, scoped grants and current UI.

## Shared API and discovery

`crates/fresh-editor/src/main.rs:4902` implements `script_run`; line 4955 sends `ClientControl::RunScript`.
`script_help_text` at line 4580 describes an async body with an editor global and JSON return value. The same file
embeds `fresh.d.ts` at line 4424 and derives API search/help information from those declarations. Its CLI dispatcher
at line 4058 is a hand-written match over verbs. This is evidence of shared plugin access and build-matched API
help, not evidence of a CLI generated wholly from typed operation descriptors. [Source][main].

Adaptation: generate operation discovery and CLI validation from the definitions shipped with Slipbox. Return
build/protocol information and examples that distinguish saved content, live documents and visible-session effects.
Keep workflow explanations authored. Do not add script evaluation to gain access to existing handlers.

## Ownership and asynchronous completion

`crates/fresh-editor/src/server/local_control.rs:194` drains requests on the editor loop, using existing file-open
machinery. Its completion drain at line 289 takes only request IDs owned by that control host.
`server/command_access.rs:121` records an outcome; line 144 drains by owner and expires unclaimed outcomes. Source
unit tests at lines 435 and 463 cover one-time delivery and leaving another host's result intact. These tests were
read, not executed. [Listener][listener], [outcomes][access].

Adaptation: adapters observe engine-owned receipts. No transport drains a shared result queue destructively. A
socket disconnect removes its waiter, not another client's result or an admitted mutation. A task's settled result
and an adapter's delivery acknowledgement are different facts. Existing bounded receipt retention remains sufficient.

## Target identity and authority

`server/command_access.rs:36` defines a window target and a binary script grant; line 282 validates the token before
submitting a script. Its wrapper documents why active-window state is unreliable after an await (line 238).
The inspected `run_script` changes the active window; its comment at line 302 explicitly describes fallback when
the stored window no longer exists. This is an inspected path, not a claim about every Fresh API. [Source][access].

Adaptation: resolve explicit document/workspace/view identities before scheduling, preserve them across waits and
reject a closed target. Never substitute the currently active target. Retain per-operation effects and grants:
sharing an API with scripts would otherwise imply broad plugin authority, as Fresh's own grant documentation says.
Workspace trust and agent access answer different questions.

## Endpoint discovery and stream handling

`server/ipc/mod.rs:122` distinguishes alive, dead and unreachable probes; line 156 removes endpoint files only on a
dead verdict. `server/ipc/platform_unix.rs:64` maps permission denial to blocked. `main.rs:3979` keeps one buffered
reader across replies; line 4009 bounds the handshake read. [IPC][ipc], [Unix probe][unix], [client][main].

Adaptation: report denied/unreachable separately from absent. Inconclusive probes never authorize deletion. Use one
bounded decoder per connection, including across handshake and invocation replies. Test multiple frames arriving
in one read as well as fragmented frames. These details fit the existing local protocol; no daemon is required.

## Limits

No plugin sandbox, cross-workspace isolation, cancellation guarantee or runtime reliability was established by this
inspection. Fresh's daemon and scripting breadth are context, not requirements for ENG. Its UI was not evaluated.

[main]: https://github.com/sinelaw/fresh/blob/b4fde85/crates/fresh-editor/src/main.rs
[listener]: https://github.com/sinelaw/fresh/blob/b4fde85/crates/fresh-editor/src/server/local_control.rs
[access]: https://github.com/sinelaw/fresh/blob/b4fde85/crates/fresh-editor/src/server/command_access.rs
[ipc]: https://github.com/sinelaw/fresh/blob/b4fde85/crates/fresh-editor/src/server/ipc/mod.rs
[unix]: https://github.com/sinelaw/fresh/blob/b4fde85/crates/fresh-editor/src/server/ipc/platform_unix.rs
