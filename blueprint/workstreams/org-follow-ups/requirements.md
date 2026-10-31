# ORF requirements

## ADDED — blueprint/requirements.md: Maintainability follow-up acceptance

ORF-R1: Close all six items of issue #170 with implemented work or explicit evidence-backed retained findings, using
ORG-R1–ORG-R10 and ORG-D1–ORG-D3. ORG's TUI-owned buffers and App.writeBuffer authority take precedence over ENG.

ORF-R2: Fix the overflowing timer first with a regression observed to fail without the fix. Then investigate the
intermittent deadlines without raising any limit or concealing an unexplained failure behind retries.

ORF-R3: Remove all seven handwritten source caps and nine test caps through cohesive feature splits, preserving the
invariants and identities named by ORG-T11. Source aim/ceiling remains 500/600; tests remain 1,000/1,500. Generated
locks keep their separate policy. Any permitted import-only cap delta is measured and recorded under ORG-D2.

ORF-R4: Account for every T41 unused-code candidate with proof of removal or a reason to retain. Move suitable App-wide
scenarios to focused tests with equivalent assertions and measured D239 reach; preserve shared integration journeys.
