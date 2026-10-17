---
status: current
created: "2026-10-16"
---

# Research: dependency-backed service boundaries

## Summary

The dependency footprint warrants a service and artifact review, not an assumption that every installed package is
shipped or automatically reachable. ENG-D12 adopts narrow service ports, resource budgets and an assessment of
isolation. This review did not build or inspect a release binary, run vulnerability scans or demonstrate an exploit.

## Inspected evidence

*Read:* `package.json` has 47 direct runtime dependencies and eight direct development dependencies at inspection.
It declares PDF, DOCX, MathJax, Hunspell and tree-sitter packages. These counts do not verify the quoted total of
204 or establish its scope. The build script uses Bun compilation with main, parse-worker and spell-worker entries.

*Read:* `src/core/export/pdf.ts:13` imports PDFKit; `src/core/export/docx.ts:30` imports DOCX;
`src/core/typeset.ts:13` loads MathJax dynamically. `src/core/parse-pool.ts:31` and
`src/core/spell-thread.ts:18` create workers. These observations identify review targets, not demonstrated security
boundaries or a complete map of their inputs and runtime permissions.

*Read:* [Bun's executable documentation](https://bun.sh/docs/bundler/executables) describes compilation and bundled
resources. The actual module/asset contents of Slipbox's released artifacts remain to be inspected.

## Design implications

*Ours:* Distinguish supply-chain integrity and known advisories from malformed-input vulnerabilities, excessive
resource consumption and intentional repository-selected execution. Existing version pins and audits remain useful;
workspace trust does not substitute for content-handling limits.

*Ours:* A narrow service port makes required data and authority reviewable, but in-process interfaces do not constrain
malicious dependency code. Lazy loading does not reduce authority once loaded. Process termination and OS-enforced
access restrictions are separate properties and need separate evidence.

## Open evidence

Inventory shipped runtime modules/assets, native and WASM components, auxiliary-resource resolution and actual
entry paths per feature. Measure existing limits and owner-loop blocking. Use those findings to assess isolation
or optional packaging; neither a smaller binary nor another process automatically establishes security.

The accepted choice is [ENG-D12](../decisions.md#eng-d12-bound-dependency-backed-services-and-assess-isolation-2026-10-16).

## Gate review

*Read:* `scripts/check-deps.ts:125` walks installed production dependency closures; line 531 reports their count.
That walk is not an exact bundle manifest. `scripts/audit.ts:37` uses a reasoned package-absence assertion for an
accepted advisory. The inspected dependency gate has no reviewed package-membership baseline.

*Read:* `src/core/export/index.ts:44` and line 51 dynamically load DOCX and PDF implementations; those modules
statically import their dependencies. Therefore a blanket ban on static heavy-package imports would reject an
existing deferred feature path. `src/core/spell-worker.ts:5` imports its spelling implementation in the worker.

*Read:* `src/core/servers/install.ts:62` uses frozen installation with scripts disabled, loading the embedded tool
lock at line 85. `scripts/audit.ts:111` selects the root application directory. `.github/workflows/audit.yml` triggers
on the root lock and invokes that audit; it does not select the site or embedded installed-tool locks.
`check-deps.ts:288` checks site specs/install policy; its production licence walk at line 300 targets the root.
These observations identify coverage work; no integrity or vulnerability audit was run for this review.

*Read:* D172 in `blueprint/decisions/code-intelligence.md` already decides that a folder's own code needs root trust.
`blueprint/design/trust.md` specifies the human prompt and CLI exclusion. The older execution-risk proposal does not
mean the decision remains open. D184 preserves the in-process JavaScript/TypeScript export approach; departures
need deliberate review rather than incidental dependency trimming.

*Read:* [Bun's bundler documentation](https://bun.sh/docs/bundler) distinguishes dynamic imports and splitting.
*Ours:* loading intent, actual startup evaluation and shipped contents need distinct evidence for the pinned release
configuration. An analysis build must state its correspondence and gaps if exact compilation metadata is unavailable.
