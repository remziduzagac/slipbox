---
status: done
assignee:
blocked_by: [ORG-T39]
created: "2026-10-26"
---

# ORG-T40: Worker patterns and remaining duplication

## Phase gate

Design approved on 2026-10-27 ([ORG-D1–ORG-D3](../decisions.md)); the listed predecessors and PR review still apply.
Apply the [common phase
gates](../design.md#phase-sequence-and-review-gates) and [move
mechanics](../design.md#move-mechanics-history-and-compiled-verification) when applicable.

## Scope

Compare diagram, paint, regex, syntax, spelling, export and walk lifecycle policies against WorkerRequests. Record a
retain/extract outcome per mechanism. Extract only proven equivalent lifecycle helpers; preserve feature admission,
retry, cache, timeout and progress behavior. Complete the six source-clone dispositions and remaining test/protocol
clone triage from the coverage ledger; fixture sharing must preserve setup, trust, process and cleanup lifetimes.

## Evidence required

Re-run jscpd using research's version/scopes/thresholds and mapped paths. Explain retained clones and any new ones. For
an extracted lifecycle helper, test disposal, late delivery, saturation, cancellation and failure cleanup in every
adopting owner. Validate shared protocol fixtures with their specific checks; never run every terminal check. If no
shared lifecycle abstraction is justified, deliver the comparison and retained-policy rationale rather than
manufacturing a refactor. Split independent protocol or lifecycle extractions into child PRs before implementation.


## Outcome

Retain `WorkerRequests` in its existing adapters and retain the distinct diagram, paint and export lifecycles.
No additional shared lifecycle, protocol fixture or generic runner is extracted. The overlap is termination/setup
scaffolding; admission, readiness, settlement, caching and progress are different policies. No source, test, worker URL,
build entry, deadline or fixture data changes in this phase.

## Worker policy comparison

[worker-requests.ts:80][w0] configures eight held requests, an 8 MiB input budget and a 16 MiB answer limit, with a
10,000 ms default request deadline. Its FIFO line waits rather than refusing callers; the first oversized request is
admitted alone (`admit`, line 118). An active cancellation terminates its worker and unrelated queued requests continue
on a fresh one. Failure rejects the affected request; disposal rejects held/waiting work and permanently closes the
mailbox. Worker identity and request IDs reject late delivery; no feature result cache or progress protocol is installed.

| Owner and source | Admission/answer | Deadline policy | Outcome |
| --- | --- | --- | --- |
| [diagram-jobs.ts:23][w1] | Eight distinct pending keys | Ready 2,000 ms; screen 500, batch 5,000 | Retain specialized jobs |
| [paint-jobs.ts:35][w2] | Eight pending; size by request kind | 3,000 ms including readiness | Retain specialized jobs |
| [regex-jobs.ts:32][w3] | Mailbox; worker bounds matches | `1500 + chars / 1000` ms | Retain mailbox adapter |
| [syntax-thread.ts:23][w4] | Mailbox; 16 MiB input budget; uncapped answer | 20,000 ms | Retain mailbox adapter |
| [spell-thread.ts:31][w5] | Mailbox defaults; dictionaries on worker | 20,000 ms | Retain mailbox adapter |
| [jobs.ts:35][w6] | Two exports; waiting caller can cancel | No generic job deadline | Retain per-job worker |
| [walk-thread.ts:34][w7] | Mailbox; uncapped answer; listing pool of two | Step 5 min, whole 10 min | Retain mailbox adapters |

- Diagrams deduplicate by rendering inputs and retain bounded memory/disk caches, including selected failures. Screen
  timeouts retry once per key; batch timeouts do not retry. Disposal resolves pending completion promises, clears its
  own queues/caches and prevents restart. The separate ready deadline precedes the rendering deadline.
- Paint caches completed values/null failures with its own 16 MiB/512-entry policy and 8 MiB output bound. Its revision
  counter changes on every uncached lookup before deduplication/queue checks; settle polls until work ends or disposal
  closes it. There is no diagram
  retry, persistent failure key or batch policy. Late messages check both worker and current job identity.
- Regex keeps input-derived capture/match limits, owner cancellation, cached display results and explicit retry of a
  failed cached search. The plain-search path remains synchronous; only regex requests use the mailbox. An uncapped
  mailbox result is justified by worker-side match limits, not permission for unbounded matching.
- Syntax keeps the 4 MiB source admission policy at its caller and sends size estimates through its 16 MiB mailbox.
  Snapshot/cache and grammar ownership stay in the syntax layer; stopping disposes and clears the channel so a later
  call creates another. Its answer bound follows the admitted source rather than the generic result cap.
- Spelling keeps dictionaries, private-word updates, error wording and its thread-generation/hold invalidation protocol.
  Stopping disposes and clears the channel; a later call can create one. Sharing its factory with syntax would lose
  the spelling-specific generation accounting even though both use 20,000 ms mailbox requests.
- Export uses a fresh worker per job, a ready handshake, multiple progress messages and a single terminal decode.
  Cancellation/failure removes listeners, terminates once and releases the two-job permit. Prepared spool ownership
  and cleanup remain outside message settlement. A one-answer mailbox would change this progress/publication protocol.
- Walk preserves serial walk/index context across sliced requests; listings use two mailbox owners and their own
  waiter handoff. Disposal rejects listing waiters. Its slow-disk override retains ownership of step/whole deadlines;
  serialized walk context and feature admission remain outside the common mailbox.

The Markdown parse pool already uses `WorkerRequests` with its own batch-size deadline and uncapped answers; it is
covered by the mailbox fixtures. No new base worker or configuration object replaces these existing adapters.

### Why diagram/paint cleanup stays separate

The eleven-line reported pair crosses a method boundary into `stop`. Its overlapping timer/worker assignments do not
establish equivalent lifecycles: diagram settlement awaits per-job promises, paint settlement polls; diagrams clear
handlers and implement retry/persistent failure caches, paint returns cached nulls. `WorkerRequests.detach` also catches
termination errors while these specialized paths have their own call boundaries. Keep the small assignment overlap
local to preserve explicit ownership of these different readiness, listener and settlement rules.

## Repeated clone measurements

Ran jscpd **5.4.2**, exactly the research scopes and thresholds:

```sh
bunx jscpd@5.4.2 src --min-lines 10 --min-tokens 70 --format typescript \
  --reporters json,console --output tmp/issue/t40-jscpd-src
bunx jscpd@5.4.2 src tests --min-lines 10 --min-tokens 70 --format typescript \
  --reporters json,console --output tmp/issue/t40-jscpd
```

| Report | Before pairs / duplicate lines | Current pairs / duplicate lines | Reported line percentage |
| --- | ---: | ---: | ---: |
| Source | 6 / 93 | 4 / 55 | 0.09634% → 0.05518% |
| Source and tests | 104 / 1,508 | 183 / 3,141 | 0.74931% → 1.45807% |

Tool denominators are 96,532 → 99,665 source lines in 317 → 530 sources, and 201,252 → 215,422 combined lines in
438 → 1,078 sources. These are parser/minimum-token scan counts, not the repository size inventory. Pair selection and
ranges can change after a split; the net difference does not count newly duplicated behaviors or establish speedup.
Raw reports remain under ignored `tmp/issue/`; the settings, totals, all 183 current endpoints/fragment hashes and
retain dispositions are recorded in [t40-clone-dispositions.json](../manifests/t40-clone-dispositions.json).

### Six original production candidates and the new pair

Names in the first column are research's historical paths/lines, mapped to the current feature owners.

| Original pair | Disposition |
| --- | --- |
| footnotes:253 / info:251 | T10 shares row navigation; residual feature dispatch is retained |
| explorer:1163 / history:288 | T10 shares `PanelFocus.leave`; the original pair no longer qualifies |
| footnotes:264 / outline:162 | T10 shares `navigateRows`; the original pair no longer qualifies |
| data:203 / data:372 | T32 retains TOML/INI semantics; comment accumulation remains similar |
| diagram-jobs:99 / paint-jobs:54 | Retain different lifecycle policy as compared above |
| draw-panels:610 / draw-panels:680 | T36 shares `followSelection`; pin/filter behavior is preserved |

The current production pairs are TOML/INI comment accumulation (twelve lines), diagram/paint cleanup (eleven),
footnote/info coordination (sixteen) and the new buffer/note-layout parameter signature (sixteen). The last comes from
T38's compatible public forwarder: its layout body is shared, and the two signatures document their respective
boundaries. Retain these explicit contracts; no duplicate layout implementation remains.

Footnote/info's residual pair covers pin/filter/row preparation and the call to the shared navigator; feature-specific
jumps, editing and row types remain in their controllers. A generic controller would add hooks rather than remove a
second navigation implementation. TOML/INI readers retain their different sections/value/error rules.

### Test and terminal dispositions

| Group | Before | Current | Disposition |
| --- | ---: | ---: | --- |
| Unit scenarios and owner-local fixtures | 81 | 162 | Retain visible cases, captured bindings and per-file setup |
| Terminal feature scenarios | 10 | 10 | Retain explicit keys, coverage declarations and expectations |
| Headless/herdr driver fragments | 6 | 6 | Retain backend lifecycle and small read/IO methods |
| Terminal runner/shots argument glue | 1 | 1 | Retain each runner's short option parsing |

All seventeen terminal pairs have identical endpoint names, lengths and complete fragments in the baseline/current
reports. Unit growth comes from repeated split-owner scaffolding: suite contexts, imports, local CLI/output collectors,
Git/source helpers and scenario prefixes. Compatible sandbox, CLI-process, Git-panel and peek factories already share
setup. Local collectors capture different output arrays, trust/environment and process-versus-in-process calling modes;
assertions and hook lifetimes remain visible. A text clone is not evidence for merging these lifetimes or hiding cases
in a generic runner. The inventory retains each pair explicitly rather than treating a higher percentage as success.

For the protocol candidate, `tests/terminal/herdr/session.ts:303` and `tests/terminal/session.ts:459` share row/path/CLI
shape, but their backends and environment/setup ownership differ. Screen/string queries are small wrappers; they do not
justify a shared session superclass. Asynchronous `message`/`file` differ in lookup and default bounds (3,000 ms versus
`WAIT`), and the live pane and headless driver own different capture/failure paths. No common waiting helper is extracted.

## Verification

- Eight focused worker files run in separate Bun processes: **117 pass, two existing skips, zero failures**. They cover
  mailbox disposal/late delivery/saturation/cancellation/crashes, diagram retry/readiness/batch settlement, paint,
  syntax, regex, spelling, export jobs and walk/listing ownership.
- Headless harness and terminal coverage fixtures pass **45 tests, 176 assertions** across two files. No live pane,
  protocol driver, timeout, command coverage or fixture was modified.
- Source, scripts, tests, package and lock bytes remain identical to the preceding T39 child; test declarations,
  import edges, SCCs and build entries therefore remain unchanged. The active 750 ceiling and exact caps stay unchanged.
- Typecheck, boundary, sizes, Biome, changed Markdown and `check:docs` are required before publishing. No terminal
  feature run is needed for a record-only phase with no screen or protocol changes; this is not a whole-suite run.

[w0]: ../../../../src/core/foundation/workers/worker-requests.ts
[w1]: ../../../../src/core/rendering/media/diagrams/diagram-jobs.ts
[w2]: ../../../../src/core/rendering/media/paint/paint-jobs.ts
[w3]: ../../../../src/core/workspace/search/regex-jobs.ts
[w4]: ../../../../src/core/documents/syntax/syntax-thread.ts
[w5]: ../../../../src/core/documents/diagnostics/spell-thread.ts
[w6]: ../../../../src/core/rendering/export/jobs.ts
[w7]: ../../../../src/core/workspace/walk/walk-thread.ts
