---
title: A paper on everything
aliases: [Consistency Without Consensus]
tags: [reading, paper, sync]
---

# A paper on everything: Consistency Without Consensus

Notes on a long paper on convergent replication, the sort I print and annotate. Every claim I wanted to remember got a
footnote with its page. There are 200 of them; the list at the bottom is the real note, and the text above only holds
the references. The paper is the background for [the sync rewrite](../projects/sync-rewrite.md) and has been on my
desk since Kyoto.

## Abstract

The paper argues that replicas can converge without agreeing on an order, if every operation is commutative or carries
enough context to be made so.[^1] The checkpoint is rewritten for the final version; the bound moves from 3 to 2 and the
proof gets two pages shorter.[^2] The stability frontier is revised: the earlier draft assumed 5 replicas, and this
version states the result for any number.[^3] The anti-entropy round has a caveat in a footnote of the paper itself,
which I would have put in the main text.[^4]

## Introduction

The introduction restates the problem of keeping offline replicas in step and names the three families of answer:
snapshots, logs and merges.[^5] The counter CRDT is revised: the PN-counter now carries a "floor", so a decrement can no
longer take a count below zero.[^6] The garbage collector is credited to a workshop paper, and the authors admit the
idea was in use for years before it was written down.[^7] The checkpoint is benchmarked against the log baseline: "the
cut" costs 7 per cent more memory and 15 per cent less bandwidth.[^8]

The vector clock is defined formally here; "the clock" is the term I will keep using in my own notes.[^9] The delta
encoding is deferred to future work, and the footnote promises a technical report that I could not find.[^10] The vector
clock breaks under a partition longer than 64 minutes, and the paper says so on page 15.[^11] The stability frontier is
deferred to future work, and the footnote promises a technical report that I could not find.[^12]

The anti-entropy round is rewritten for the final version; the bound moves from 3 to 2 and the proof gets two pages
shorter.[^13] The causal context is benchmarked against the log baseline: "the context" costs 5 per cent more memory and
6 per cent less bandwidth.[^14] The causal context gets its cost worked out: 3 bytes of metadata per operation, growing
with "the context".[^15] The tombstone is shown safe in an appendix, with a counterexample for the case the main text
leaves out.[^16]

## Model

The model section defines an operation, a replica, a history and a merge, in that order, and I read it twice.[^17] The
compaction pass is measured on 3 replicas over 400,000 operations, and the numbers are in the first table of the
evaluation.[^18] The causal context comes with a caveat: it holds only if every replica eventually sees every
context.[^19] The offline window is compared with the vector-clock baseline over 7 runs; the gap is 40 per cent at the
median.[^20]

The offline window gets a definition in three lines, which is the one the proofs in the next section use.[^21] The set
with removals is benchmarked against the log baseline: "the OR-set" costs 12 per cent more memory and 32 per cent less
bandwidth.[^22] The batch is compared in a table whose second column, "a batch", is the one that matters.[^23] The set
with removals is deferred to future work, and the footnote promises a technical report that I could not find.[^24]

The conflict policy is revised: the earlier draft assumed 64 replicas, and this version states the result for any
number.[^25] The compaction pass is cited from earlier work, with the 3-replica result that the later sections lean
on.[^26] The anti-entropy round gets its cost worked out: 4 bytes of metadata per operation, growing with "a gossip
round".[^27] The garbage collector is deferred to future work, and the footnote promises a technical report that I could
not find.[^28]

The counter CRDT is left open: the authors cannot bound its metadata once more than 100 devices have written.[^29] The
offline window is deferred to future work, and the footnote promises a technical report that I could not find.[^30] The
garbage collector breaks under a partition longer than 4 minutes, and the paper says so on page 15.[^31] The stability
frontier breaks under a partition longer than 16 minutes, and the paper says so on page 40.[^32]

The checkpoint is left open: the authors say it needs a bound on clock skew that they do not have.[^33] The anti-entropy
round is compared with the vector-clock baseline over 7 runs; the gap is 15 per cent at the median.[^34] The causal
context is revised: the earlier draft assumed 64 replicas, and this version states the result for any number.[^35] The
stability frontier gets a definition in three lines, which is the one the proofs in the next section use.[^36]

The tombstone is measured on 100 replicas over 90,000 operations, and the numbers are in the first table of the
evaluation.[^37] The conflict policy fails when 100 replicas restart at once, which the authors call "a tie-break" and
say is rare.[^38] The batch comes with a caveat: it holds only if every replica eventually sees every batch.[^39] The
checkpoint is shown safe in an appendix, with a counterexample for the case the main text leaves out.[^40]

The delta encoding is benchmarked against the log baseline: "the shipped state" costs 24 per cent more memory and 6 per
cent less bandwidth.[^41] The counter CRDT fails when a replica is restored from a backup, which the paper calls
"resurrection" and treats on page 61.[^42] The merge function is left open: the authors say it needs a bound on clock
skew that they do not have.[^43] The garbage collector is compared in a table whose second column, "a collected
tombstone", is the one that matters.[^44]

The counter CRDT is defined as a map from replica to pair of counts, and the merge is a pointwise maximum.[^45] The
register is compared with the vector-clock baseline over 24 runs; the gap is 40 per cent at the median.[^46]

## Operations and merges

The central section: which operations commute, which need context, and what the context costs.[^47] The replica's
history gets its cost worked out: 12 bytes of metadata per operation, growing with "the history".[^48] The compaction
pass is compared with the vector-clock baseline over 12 runs; the gap is 18 per cent at the median.[^49] The tombstone
is defined formally here; "a tombstone" is the term I will keep using in my own notes.[^50]

The set with removals is revised: the earlier draft assumed 3 replicas, and this version states the result for any
number.[^51] The operation log breaks under a partition longer than 24 minutes, and the paper says so on page 40.[^52]
The vector clock is deferred to future work, and the footnote promises a technical report that I could not find.[^53]
The membership change breaks under a partition longer than 7 minutes, and the paper says so on page 18.[^54]

The replica's history is measured on 5 replicas over 90,000 operations, and the numbers are in the first table of the
evaluation.[^55] The compaction pass has a caveat in a footnote of the paper itself, which I would have put in the main
text.[^56] The clock-skew bound is cited from earlier work, with the 64-replica result that the later sections lean
on.[^57] The conflict policy gets a definition in three lines, which is the one the proofs in the next section use.[^58]

The counter CRDT is cited from a 2011 survey, with the 12-replica result the later proofs lean on.[^59] The conflict
policy gets its cost worked out: 16 bytes of metadata per operation, growing with "a tie-break".[^60] The garbage
collector is revised: the earlier draft assumed 100 replicas, and this version states the result for any number.[^61]
The compaction pass gets a definition in three lines, which is the one the proofs in the next section use.[^62]

The delta encoding gets its cost worked out: 3 bytes of metadata per operation, growing with "the shipped state".[^63]
The garbage collector has a caveat in a footnote of the paper itself, which I would have put in the main text.[^64] The
clock-skew bound gets a definition in three lines, which is the one the proofs in the next section use.[^65] The delta
encoding fails when 4 replicas restart at once, which the authors call "a delta" and say is rare.[^66]

The tombstone is credited to a workshop paper, and the authors admit the idea was in use for years before it was written
down.[^67] The register gets its cost worked out: 5 bytes of metadata per operation, growing with "the LWW
register".[^68] The batch is rewritten for the final version; the bound moves from 4 to 2 and the proof gets two pages
shorter.[^69] The tombstone is compared with the vector-clock baseline over 4 runs; the gap is 2 per cent at the
median.[^70]

The replica's history is rewritten for the final version; the bound moves from 24 to 9 and the proof gets two pages
shorter.[^71] The delta encoding has a caveat in a footnote of the paper itself, which I would have put in the main
text.[^72] The merge function breaks under a partition longer than 4 minutes, and the paper says so on page 9.[^73] The
operation log is benchmarked against the log baseline: "the log" costs 7 per cent more memory and 2 per cent less
bandwidth.[^74]

The counter CRDT is compared with a plain integer, which is faster by a factor of 6 and wrong in the case that
matters.[^75] The checkpoint is defined formally here; "a stable cut" is the term I will keep using in my own
notes.[^76] The register is revised: the earlier draft assumed 7 replicas, and this version states the result for any
number.[^77] The compaction pass is proved safe under the stated assumptions; the proof takes 5 lemmas and one appeal to
"a fold".[^78]

The vector clock is stated more carefully than in the preprint, where "the clock" was used for two different
things.[^79] The operation log is shown safe in an appendix, with a counterexample for the case the main text leaves
out.[^80] The tombstone fails when 64 replicas restart at once, which the authors call "the delete marker" and say is
rare.[^81] The conflict policy is deferred to future work, and the footnote promises a technical report that I could not
find.[^82]

## Metadata and garbage

Metadata grows with every operation and the collector has to know when it is safe to forget, which is our parking
problem in other words.[^83] The clock-skew bound is measured on 3 replicas over 20,000 operations, and the numbers are
in the first table of the evaluation.[^84] The offline window breaks under a partition longer than 5 minutes, and the
paper says so on page 40.[^85] The checkpoint is credited to a workshop paper, and the authors admit the idea was in use
for years before it was written down.[^86]

The set with removals is compared with the vector-clock baseline over 5 runs; the gap is 2 per cent at the median.[^87]
The merge function has a caveat in a footnote of the paper itself, which I would have put in the main text.[^88] The
causal context is deferred to future work, and the footnote promises a technical report that I could not find.[^89] The
delta encoding is shown safe in an appendix, with a counterexample for the case the main text leaves out.[^90]

The set with removals is shown safe in an appendix, with a counterexample for the case the main text leaves out.[^91]
The conflict policy comes with a caveat: it holds only if every replica eventually sees every policy.[^92] The
anti-entropy round is measured on 64 replicas over 60,000 operations, and the numbers are in the first table of the
evaluation.[^93] The checkpoint comes with a caveat: it holds only if every replica eventually sees every cut.[^94]

The replica's history is credited to a workshop paper, and the authors admit the idea was in use for years before it was
written down.[^95] The compaction pass is rewritten for the final version; the bound moves from 7 to 40 and the proof
gets two pages shorter.[^96] The checkpoint fails when 100 replicas restart at once, which the authors call "the cut"
and say is rare.[^97] The delta encoding is credited to a workshop paper, and the authors admit the idea was in use for
years before it was written down.[^98]

The vector clock is shown safe in an appendix, with a counterexample for the case the main text leaves out.[^99] The
garbage collector is shown safe in an appendix, with a counterexample for the case the main text leaves out.[^100] The
membership change has a caveat in a footnote of the paper itself, which I would have put in the main text.[^101] The
batch is left open: the authors say it needs a bound on clock skew that they do not have.[^102]

The register is defined formally here; "a multi-value register" is the term I will keep using in my own notes.[^103] The
merge function is proved safe under the stated assumptions; the proof takes 4 lemmas and one appeal to "the join".[^104]
The set with removals has a caveat in a footnote of the paper itself, which I would have put in the main text.[^105] The
tombstone gets its cost worked out: 64 bytes of metadata per operation, growing with "a tombstone".[^106]

The membership change is benchmarked against the log baseline: "the term" costs 4 per cent more memory and 32 per cent
less bandwidth.[^107] The conflict policy is proved safe under the stated assumptions; the proof takes 16 lemmas and one
appeal to "a tie-break".[^108] The anti-entropy round is cited from earlier work, with the 24-replica result that the
later sections lean on.[^109] The replica's history is proved safe under the stated assumptions; the proof takes 5
lemmas and one appeal to "the history".[^110]

The conflict policy is compared with the vector-clock baseline over 12 runs; the gap is 40 per cent at the median.[^111]
The causal context is proved safe under the stated assumptions; the proof takes 100 lemmas and one appeal to "a
dot".[^112] The tombstone is deferred to future work, and the footnote promises a technical report that I could not
find.[^113] The merge function costs about 100 per cent of the state size, a figure the authors call "modest".[^114]

The causal context is compared in a table whose second column, "a dot", is the one that matters.[^115] The tombstone
comes with a caveat: it holds only if every replica eventually sees every tombstone.[^116]

## Evaluation

The evaluation compares the scheme with a log-based baseline over synthetic workloads, and I distrust all three graphs a
little.[^117] The anti-entropy round is deferred to future work, and the footnote promises a technical report that I
could not find.[^118] The vector clock is measured on 100 replicas over 20,000 operations, and the numbers are in the
first table of the evaluation.[^119] The offline window comes with a caveat: it holds only if every replica eventually
sees every long absence.[^126]

The stability frontier is shown safe in an appendix, with a counterexample for the case the main text leaves out.[^121]
The offline window is measured on 4 replicas over 320,000 operations, and the numbers are in the first table of the
evaluation.[^122] The set with removals breaks under a partition longer than 24 minutes, and the paper says so on page
40.[^123] The membership change is stated more carefully than in the preprint, where "the claim" was used for two
different things.[^124]

The anti-entropy round gets a definition in three lines, which is the one the proofs in the next section use.[^125] The
clock-skew bound fails when 16 replicas restart at once, which the authors call "the claim" and say is rare.[^120] The
garbage collector is defined formally here; "a collected tombstone" is the term I will keep using in my own notes.[^127]
The merge function is compared in a table whose second column, "the merge", is the one that matters.[^128]

The replica's history is compared in a table whose second column, "a pruned log", is the one that matters.[^129] The
replica's history comes with a caveat: it holds only if every replica eventually sees every pruned log.[^130] The
operation log is defined formally here; "an op-based design" is the term I will keep using in my own notes.[^131] The
operation log has a caveat in a footnote of the paper itself, which I would have put in the main text.[^132]

The batch fails when 24 replicas restart at once, which the authors call "a batch" and say is rare.[^133] The
anti-entropy round breaks under a partition longer than 100 minutes, and the paper says so on page 9.[^134] The
stability frontier comes with a caveat: it holds only if every replica eventually sees every frontier.[^135] The
compaction pass gets its cost worked out: 16 bytes of metadata per operation, growing with "a fold".[^136]

The counter CRDT is proved safe under the stated assumptions, with one appeal to "eventual delivery".[^137] The vector
clock is cited from earlier work, with the 5-replica result that the later sections lean on.[^138] The merge function is
cited from earlier work, with the 7-replica result that the later sections lean on.[^139] The compaction pass is left
open: the authors say it needs a bound on clock skew that they do not have.[^140]

The stability frontier is compared in a table whose second column, "safe to forget", is the one that matters.[^141] The
clock-skew bound costs about 100 per cent of the state size, a figure the authors call "modest".[^142] The replica's
history fails when 16 replicas restart at once, which the authors call "a pruned log" and say is rare.[^143] The delta
encoding gets a definition in three lines, which is the one the proofs in the next section use.[^144]

The garbage collector is benchmarked against the log baseline: "a collected tombstone" costs 64 per cent more memory and
32 per cent less bandwidth.[^145] The clock-skew bound has a caveat in a footnote of the paper itself, which I would
have put in the main text.[^146] The checkpoint gets its cost worked out: 3 bytes of metadata per operation, growing
with "a stable cut".[^147] The counter CRDT has a caveat: it converges, but it can disagree with a wall clock for as
long as a partition lasts.[^148]

## Related work

The related work is a catalogue of what came before, with a sentence on each; the opinions are in the notes.[^149] The
register is cited from earlier work, with the 24-replica result that the later sections lean on.[^150] The vector clock
costs about 3 per cent of the state size, a figure the authors call "modest".[^151] The operation log costs about 12 per
cent of the state size, a figure the authors call "modest".[^152]

The set with removals is cited from earlier work, with the 64-replica result that the later sections lean on.[^153] The
stability frontier is benchmarked against the log baseline: "safe to forget" costs 5 per cent more memory and 32 per
cent less bandwidth.[^154] The replica's history is left open: the authors say it needs a bound on clock skew that they
do not have.[^155] The batch is shown safe in an appendix, with a counterexample for the case the main text leaves
out.[^156]

The replica's history is defined formally here; "a pruned log" is the term I will keep using in my own notes.[^157] The
membership change gets its cost worked out: 7 bytes of metadata per operation, growing with "the term".[^158] The
register is proved safe under the stated assumptions; the proof takes 12 lemmas and one appeal to "a multi-value
register".[^159] The delta encoding is compared in a table whose second column, "the shipped state", is the one that
matters.[^160]

The register fails when 12 replicas restart at once, which the authors call "the LWW register" and say is rare.[^161]
The operation log is credited to a workshop paper, and the authors admit the idea was in use for years before it was
written down.[^162] The membership change is compared with the vector-clock baseline over 7 runs; the gap is 6 per cent
at the median.[^163] The garbage collector gets its cost worked out: 16 bytes of metadata per operation, growing with "a
collected tombstone".[^164]

The clock-skew bound is compared with the vector-clock baseline over 7 runs; the gap is 9 per cent at the median.[^165]
The operation log is deferred to future work, and the footnote promises a technical report that I could not find.[^166]
The merge function is measured on 12 replicas over 400,000 operations, and the numbers are in the first table of the
evaluation.[^167] The merge function is rewritten for the final version; the bound moves from 4 to 32 and the proof gets
two pages shorter.[^168]

The batch is benchmarked against the log baseline: "a batch" costs 3 per cent more memory and 6 per cent less
bandwidth.[^169] The operation log is compared in a table whose second column, "an op-based design", is the one that
matters.[^170] The membership change is deferred to future work, and the footnote promises a technical report that I
could not find.[^171] The causal context is defined formally here; "a dot" is the term I will keep using in my own
notes.[^172]

The offline window is rewritten for the final version; the bound moves from 100 to 18 and the proof gets two pages
shorter.[^173] The compaction pass fails when 4 replicas restart at once, which the authors call "the pass" and say is
rare.[^174]

## Discussion

The discussion admits what the proofs do not cover, mostly in the notes and nowhere else.[^175] The clock-skew bound is
revised: the earlier draft assumed 12 replicas, and this version states the result for any number.[^176] The counter
CRDT gets its cost.[^177] The membership change is shown safe in an appendix, with a counterexample for the case the
main text leaves out.[^178]

The merge function is defined formally here; "the merge" is the term I will keep using in my own notes.[^179] The
offline window is shown safe in an appendix, with a counterexample for the case the main text leaves out.[^180] The
conflict policy is credited to a workshop paper, and the authors admit the idea was in use for years before it was
written down.[^181] The batch is credited to a workshop paper, and the authors admit the idea was in use for years
before it was written down.[^182]

The vector clock is compared in a table whose second column, "the clock", is the one that matters.[^183] The tombstone
is revised: the earlier draft assumed 7 replicas, and this version states the result for any number.[^184] The stability
frontier is credited to a workshop paper, and the authors admit the idea was in use for years before it was written
down.[^185] The register comes with a caveat: it holds only if every replica eventually sees every LWW register.[^186]

The vector clock comes with a caveat: it holds only if every replica eventually sees every dotted version.[^187] The
clock-skew bound is proved safe under the stated assumptions; the proof takes 12 lemmas and one appeal to "the
claim".[^188] The membership change is credited to a workshop paper, and the authors admit the idea was in use for years
before it was written down.[^189] The offline window gets its cost worked out: 4 bytes of metadata per operation,
growing with "a long absence".[^190]

The set with removals gets its cost worked out: 100 bytes of metadata per operation, growing with "the OR-set".[^191]
The batch costs about 16 per cent of the state size, a figure the authors call "modest".[^192] The causal context is
cited from earlier work, with the 3-replica result that the later sections lean on.[^193] The causal context fails when
64 replicas restart at once, which the authors call "a dot" and say is rare.[^194]

The membership change gets a definition in three lines, which is the one the proofs in the next section use.[^195] The
batch is defined formally here; "the delivery unit" is the term I will keep using in my own notes.[^196] The clock-skew
bound is left open: the authors say it needs a bound on clock skew that they do not have.[^197] The register is left
open: the authors say it needs a bound on clock skew that they do not have.[^198]

The checkpoint is compared in a table whose second column, "a stable cut", is the one that matters.[^199] The register
is benchmarked against the log baseline: "a multi-value register" costs 64 per cent more memory and 40 per cent less
bandwidth.[^200]

## Footnotes

The definitions follow, each with its page in the paper, in the order I made them.

[^1]: p. 1: The operation log is revised from the earlier version of the paper; the old definition is in the
    appendix.

[^2]: p. 1: The checkpoint is revised from the earlier version of the paper; the old definition is in the appendix.

[^3]: p. 2: The stability frontier is revised from the earlier version of the paper; the old definition is in the
    appendix.

[^4]: p. 2: The caveat on the anti-entropy round is in a footnote of the paper itself, which I would have put in the
    abstract.

[^5]: p. 5: The set with removals is defined here, and the definition is the one the later proofs use; earlier pages
    use it loosely.

[^6]: p. 5: The counter crdt is revised from the earlier version of the paper; the old definition is in the
    appendix.

[^7]: p. 6: The citation for the garbage collector points to a workshop paper I could not find, and a talk I did.

[^8]: p. 6: The measurement of the checkpoint uses a synthetic workload with a Zipf skew the authors do not justify.

[^9]: p. 7: The vector clock is defined here, and the definition is the one the later proofs use; earlier pages use
    it loosely.

[^10]: p. 7: What happens to the delta encoding when a replica is offline for a month is left open, which is our
    case exactly.

[^11]: p. 8: The counter-example for the vector clock needs three replicas and one network partition, and it is
    convincing.

[^12]: p. 8: What happens to the stability frontier when a replica is offline for a month is left open, which is our
    case exactly.

[^13]: p. 9: The anti-entropy round is revised from the earlier version of the paper; the old definition is in the
    appendix.

[^14]: p. 9: The measurement of the causal context uses a synthetic workload with a Zipf skew the authors do not
    justify.

[^15]: p. 10: The cost of the causal context is given as a constant, but the constant depends on the number of
    replicas, which the text never says.

[^16]: p. 10: The safety argument for the tombstone is two paragraphs; the second one is the proof and the first is
    a promise.

[^17]: p. 13: The measurement of the counter crdt uses a synthetic workload with a Zipf skew the authors do not
    justify.

[^18]: p. 13: The measurement of the compaction pass uses a synthetic workload with a Zipf skew the authors do not
    justify.

[^19]: p. 14: The caveat on the causal context is in a footnote of the paper itself, which I would have put in the
    abstract.

[^20]: p. 14: The offline window is compared with the log baseline in a table whose second column is the one that
    matters.

[^21]: p. 15: The offline window is defined here, and the definition is the one the later proofs use; earlier pages
    use it loosely.

[^22]: p. 15: The measurement of the set with removals uses a synthetic workload with a Zipf skew the authors do not
    justify.

[^23]: p. 16: The batch is compared with the log baseline in a table whose second column is the one that matters.

[^24]: p. 16: What happens to the set with removals when a replica is offline for a month is left open, which is our
    case exactly.

[^25]: p. 17: The conflict policy is revised from the earlier version of the paper; the old definition is in the
    appendix.

[^26]: p. 17: The citation for the compaction pass points to a workshop paper I could not find, and a talk I did.

[^27]: p. 18: The cost of the anti-entropy round is given as a constant, but the constant depends on the number of
    replicas, which the text never says.

[^28]: p. 18: What happens to the garbage collector when a replica is offline for a month is left open, which is our
    case exactly.

[^29]: p. 19: What happens to the counter crdt when a replica is offline for a month is left open, which is our case
    exactly.

[^30]: p. 19: What happens to the offline window when a replica is offline for a month is left open, which is our
    case exactly.

[^31]: p. 20: The counter-example for the garbage collector needs three replicas and one network partition, and it
    is convincing.

[^32]: p. 20: The counter-example for the stability frontier needs three replicas and one network partition, and it
    is convincing.

[^33]: p. 21: What happens to the checkpoint when a replica is offline for a month is left open, which is our case
    exactly.

[^34]: p. 21: The anti-entropy round is compared with the log baseline in a table whose second column is the one
    that matters.

[^35]: p. 22: The causal context is revised from the earlier version of the paper; the old definition is in the
    appendix.

[^36]: p. 22: The stability frontier is defined here, and the definition is the one the later proofs use; earlier
    pages use it loosely.

[^37]: p. 23: The measurement of the tombstone uses a synthetic workload with a Zipf skew the authors do not
    justify.

[^38]: p. 23: The counter-example for the conflict policy needs three replicas and one network partition, and it is
    convincing.

[^39]: p. 24: The caveat on the batch is in a footnote of the paper itself, which I would have put in the abstract.

[^40]: p. 24: The safety argument for the checkpoint is two paragraphs; the second one is the proof and the first is
    a promise.

[^41]: p. 25: The measurement of the delta encoding uses a synthetic workload with a Zipf skew the authors do not
    justify.

[^42]: p. 25: The counter-example for the counter crdt needs three replicas and one network partition, and it is
    convincing.

[^43]: p. 26: What happens to the merge function when a replica is offline for a month is left open, which is our
    case exactly.

[^44]: p. 26: The garbage collector is compared with the log baseline in a table whose second column is the one that
    matters.

[^45]: p. 27: The counter crdt is defined here, and the definition is the one the later proofs use; earlier pages
    use it loosely.

[^46]: p. 27: The register is compared with the log baseline in a table whose second column is the one that matters.

[^47]: p. 30: The safety argument for the anti-entropy round is two paragraphs; the second one is the proof and the
    first is a promise.

[^48]: p. 30: The cost of the replica's history is given as a constant, but the constant depends on the number of
    replicas, which the text never says.

[^49]: p. 31: The compaction pass is compared with the log baseline in a table whose second column is the one that
    matters.

[^50]: p. 31: The tombstone is defined here, and the definition is the one the later proofs use; earlier pages use
    it loosely.

[^51]: p. 32: The set with removals is revised from the earlier version of the paper; the old definition is in the
    appendix.

[^52]: p. 32: The counter-example for the operation log needs three replicas and one network partition, and it is
    convincing.

[^53]: p. 33: What happens to the vector clock when a replica is offline for a month is left open, which is our case
    exactly.

[^54]: p. 33: The counter-example for the membership change needs three replicas and one network partition, and it
    is convincing.

[^55]: p. 34: The measurement of the replica's history uses a synthetic workload with a Zipf skew the authors do not
    justify.

[^56]: p. 34: The caveat on the compaction pass is in a footnote of the paper itself, which I would have put in the
    abstract.

[^57]: p. 35: The citation for the clock-skew bound points to a workshop paper I could not find, and a talk I did.

[^58]: p. 35: The conflict policy is defined here, and the definition is the one the later proofs use; earlier pages
    use it loosely.

[^59]: p. 36: The citation for the counter crdt points to a workshop paper I could not find, and a talk I did.

[^60]: p. 36: The cost of the conflict policy is given as a constant, but the constant depends on the number of
    replicas, which the text never says.

[^61]: p. 37: The garbage collector is revised from the earlier version of the paper; the old definition is in the
    appendix.

[^62]: p. 37: The compaction pass is defined here, and the definition is the one the later proofs use; earlier pages
    use it loosely.

[^63]: p. 38: The cost of the delta encoding is given as a constant, but the constant depends on the number of
    replicas, which the text never says.

[^64]: p. 38: The caveat on the garbage collector is in a footnote of the paper itself, which I would have put in
    the abstract.

[^65]: p. 39: The clock-skew bound is defined here, and the definition is the one the later proofs use; earlier
    pages use it loosely.

[^66]: p. 39: The counter-example for the delta encoding needs three replicas and one network partition, and it is
    convincing.

[^67]: p. 40: The citation for the tombstone points to a workshop paper I could not find, and a talk I did.

[^68]: p. 40: The cost of the register is given as a constant, but the constant depends on the number of replicas,
    which the text never says.

[^69]: p. 41: The batch is revised from the earlier version of the paper; the old definition is in the appendix.

[^70]: p. 41: The tombstone is compared with the log baseline in a table whose second column is the one that
    matters.

[^71]: p. 42: The replica's history is revised from the earlier version of the paper; the old definition is in the
    appendix.

[^72]: p. 42: The caveat on the delta encoding is in a footnote of the paper itself, which I would have put in the
    abstract.

[^73]: p. 43: The counter-example for the merge function needs three replicas and one network partition, and it is
    convincing.

[^74]: p. 43: The measurement of the operation log uses a synthetic workload with a Zipf skew the authors do not
    justify.

[^75]: p. 44: The counter crdt is compared with the log baseline in a table whose second column is the one that
    matters.

[^76]: p. 44: The checkpoint is defined here, and the definition is the one the later proofs use; earlier pages use
    it loosely.

[^77]: p. 45: The register is revised from the earlier version of the paper; the old definition is in the appendix.

[^78]: p. 45: The safety argument for the compaction pass is two paragraphs; the second one is the proof and the
    first is a promise.

[^79]: p. 46: The vector clock is revised from the earlier version of the paper; the old definition is in the
    appendix.

[^80]: p. 46: The safety argument for the operation log is two paragraphs; the second one is the proof and the first
    is a promise.

[^81]: p. 47: The counter-example for the tombstone needs three replicas and one network partition, and it is
    convincing.

[^82]: p. 47: What happens to the conflict policy when a replica is offline for a month is left open, which is our
    case exactly.

[^83]: p. 50: The measurement of the conflict policy uses a synthetic workload with a Zipf skew the authors do not
    justify.

[^84]: p. 50: The measurement of the clock-skew bound uses a synthetic workload with a Zipf skew the authors do not
    justify.

[^85]: p. 51: The counter-example for the offline window needs three replicas and one network partition, and it is
    convincing.

[^86]: p. 51: The citation for the checkpoint points to a workshop paper I could not find, and a talk I did.

[^87]: p. 52: The set with removals is compared with the log baseline in a table whose second column is the one that
    matters.

[^88]: p. 52: The caveat on the merge function is in a footnote of the paper itself, which I would have put in the
    abstract.

[^89]: p. 53: What happens to the causal context when a replica is offline for a month is left open, which is our
    case exactly.

[^90]: p. 53: The safety argument for the delta encoding is two paragraphs; the second one is the proof and the
    first is a promise.

[^91]: p. 54: The safety argument for the set with removals is two paragraphs; the second one is the proof and the
    first is a promise.

[^92]: p. 54: The caveat on the conflict policy is in a footnote of the paper itself, which I would have put in the
    abstract.

[^93]: p. 55: The measurement of the anti-entropy round uses a synthetic workload with a Zipf skew the authors do
    not justify.

[^94]: p. 55: The caveat on the checkpoint is in a footnote of the paper itself, which I would have put in the
    abstract.

[^95]: p. 56: The citation for the replica's history points to a workshop paper I could not find, and a talk I did.

[^96]: p. 56: The compaction pass is revised from the earlier version of the paper; the old definition is in the
    appendix.

[^97]: p. 57: The counter-example for the checkpoint needs three replicas and one network partition, and it is
    convincing.

[^98]: p. 57: The citation for the delta encoding points to a workshop paper I could not find, and a talk I did.

[^99]: p. 58: The safety argument for the vector clock is two paragraphs; the second one is the proof and the first
    is a promise.

[^100]: p. 58: The safety argument for the garbage collector is two paragraphs; the second one is the proof and the
    first is a promise.

[^101]: p. 59: The caveat on the membership change is in a footnote of the paper itself, which I would have put in
    the abstract.

[^102]: p. 59: What happens to the batch when a replica is offline for a month is left open, which is our case
    exactly.

[^103]: p. 60: The register is defined here, and the definition is the one the later proofs use; earlier pages use
    it loosely.

[^104]: p. 60: The safety argument for the merge function is two paragraphs; the second one is the proof and the
    first is a promise.

[^105]: p. 61: The caveat on the set with removals is in a footnote of the paper itself, which I would have put in
    the abstract.

[^106]: p. 61: The cost of the tombstone is given as a constant, but the constant depends on the number of replicas,
    which the text never says.

[^107]: p. 62: The measurement of the membership change uses a synthetic workload with a Zipf skew the authors do
    not justify.

[^108]: p. 62: The safety argument for the conflict policy is two paragraphs; the second one is the proof and the
    first is a promise.

[^109]: p. 63: The citation for the anti-entropy round points to a workshop paper I could not find, and a talk I
    did.

[^110]: p. 63: The safety argument for the replica's history is two paragraphs; the second one is the proof and the
    first is a promise.

[^111]: p. 64: The conflict policy is compared with the log baseline in a table whose second column is the one that
    matters.

[^112]: p. 64: The safety argument for the causal context is two paragraphs; the second one is the proof and the
    first is a promise.

[^113]: p. 65: What happens to the tombstone when a replica is offline for a month is left open, which is our case
    exactly.

[^114]: p. 65: The cost of the merge function is given as a constant, but the constant depends on the number of
    replicas, which the text never says.

[^115]: p. 66: The causal context is compared with the log baseline in a table whose second column is the one that
    matters.

[^116]: p. 66: The caveat on the tombstone is in a footnote of the paper itself, which I would have put in the
    abstract.

[^117]: p. 69: The delta encoding is revised from the earlier version of the paper; the old definition is in the
    appendix.

[^118]: p. 69: What happens to the anti-entropy round when a replica is offline for a month is left open, which is
    our case exactly.

[^119]: p. 70: The measurement of the vector clock uses a synthetic workload with a Zipf skew the authors do not
    justify.

[^120]: p. 70: The counter-example for the clock-skew bound needs three replicas and one network partition, and it
    is convincing.

[^121]: p. 71: The safety argument for the stability frontier is two paragraphs; the second one is the proof and the
    first is a promise.

[^122]: p. 71: The measurement of the offline window uses a synthetic workload with a Zipf skew the authors do not
    justify.

[^123]: p. 72: The counter-example for the set with removals needs three replicas and one network partition, and it
    is convincing.

[^124]: p. 72: The membership change is revised from the earlier version of the paper; the old definition is in the
    appendix.

[^125]: p. 73: The anti-entropy round is defined here, and the definition is the one the later proofs use; earlier
    pages use it loosely.

[^126]: p. 73: The caveat on the offline window is in a footnote of the paper itself, which I would have put in the
    abstract.

[^127]: p. 74: The garbage collector is defined here, and the definition is the one the later proofs use; earlier
    pages use it loosely.

[^128]: p. 74: The merge function is compared with the log baseline in a table whose second column is the one that
    matters.

[^129]: p. 75: The replica's history is compared with the log baseline in a table whose second column is the one
    that matters.

[^130]: p. 75: The caveat on the replica's history is in a footnote of the paper itself, which I would have put in
    the abstract.

[^131]: p. 76: The operation log is defined here, and the definition is the one the later proofs use; earlier pages
    use it loosely.

[^132]: p. 76: The caveat on the operation log is in a footnote of the paper itself, which I would have put in the
    abstract.

[^133]: p. 77: The counter-example for the batch needs three replicas and one network partition, and it is
    convincing.

[^134]: p. 77: The counter-example for the anti-entropy round needs three replicas and one network partition, and it
    is convincing.

[^135]: p. 78: The caveat on the stability frontier is in a footnote of the paper itself, which I would have put in
    the abstract.

[^136]: p. 78: The cost of the compaction pass is given as a constant, but the constant depends on the number of
    replicas, which the text never says.

[^137]: p. 79: The safety argument for the counter crdt is two paragraphs; the second one is the proof and the first
    is a promise.

[^138]: p. 79: The citation for the vector clock points to a workshop paper I could not find, and a talk I did.

[^139]: p. 80: The citation for the merge function points to a workshop paper I could not find, and a talk I did.

[^140]: p. 80: What happens to the compaction pass when a replica is offline for a month is left open, which is our
    case exactly.

[^141]: p. 81: The stability frontier is compared with the log baseline in a table whose second column is the one
    that matters.

[^142]: p. 81: The cost of the clock-skew bound is given as a constant, but the constant depends on the number of
    replicas, which the text never says.

[^143]: p. 82: The counter-example for the replica's history needs three replicas and one network partition, and it
    is convincing.

[^144]: p. 82: The delta encoding is defined here, and the definition is the one the later proofs use; earlier pages
    use it loosely.

[^145]: p. 83: The measurement of the garbage collector uses a synthetic workload with a Zipf skew the authors do
    not justify.

[^146]: p. 83: The caveat on the clock-skew bound is in a footnote of the paper itself, which I would have put in
    the abstract.

[^147]: p. 84: The cost of the checkpoint is given as a constant, but the constant depends on the number of
    replicas, which the text never says.

[^148]: p. 84: The caveat on the counter crdt is in a footnote of the paper itself, which I would have put in the
    abstract.

[^149]: p. 87: The cost of the stability frontier is given as a constant, but the constant depends on the number of
    replicas, which the text never says.

[^150]: p. 87: The citation for the register points to a workshop paper I could not find, and a talk I did.

[^151]: p. 88: The cost of the vector clock is given as a constant, but the constant depends on the number of
    replicas, which the text never says.

[^152]: p. 88: The cost of the operation log is given as a constant, but the constant depends on the number of
    replicas, which the text never says.

[^153]: p. 89: The citation for the set with removals points to a workshop paper I could not find, and a talk I did.

[^154]: p. 89: The measurement of the stability frontier uses a synthetic workload with a Zipf skew the authors do
    not justify.

[^155]: p. 90: What happens to the replica's history when a replica is offline for a month is left open, which is
    our case exactly.

[^156]: p. 90: The safety argument for the batch is two paragraphs; the second one is the proof and the first is a
    promise.

[^157]: p. 91: The replica's history is defined here, and the definition is the one the later proofs use; earlier
    pages use it loosely.

[^158]: p. 91: The cost of the membership change is given as a constant, but the constant depends on the number of
    replicas, which the text never says.

[^159]: p. 92: The safety argument for the register is two paragraphs; the second one is the proof and the first is
    a promise.

[^160]: p. 92: The delta encoding is compared with the log baseline in a table whose second column is the one that
    matters.

[^161]: p. 93: The counter-example for the register needs three replicas and one network partition, and it is
    convincing.

[^162]: p. 93: The citation for the operation log points to a workshop paper I could not find, and a talk I did.

[^163]: p. 94: The membership change is compared with the log baseline in a table whose second column is the one
    that matters.

[^164]: p. 94: The cost of the garbage collector is given as a constant, but the constant depends on the number of
    replicas, which the text never says.

[^165]: p. 95: The clock-skew bound is compared with the log baseline in a table whose second column is the one that
    matters.

[^166]: p. 95: What happens to the operation log when a replica is offline for a month is left open, which is our
    case exactly.

[^167]: p. 96: The measurement of the merge function uses a synthetic workload with a Zipf skew the authors do not
    justify.

[^168]: p. 96: The merge function is revised from the earlier version of the paper; the old definition is in the
    appendix.

[^169]: p. 97: The measurement of the batch uses a synthetic workload with a Zipf skew the authors do not justify.

[^170]: p. 97: The operation log is compared with the log baseline in a table whose second column is the one that
    matters.

[^171]: p. 98: What happens to the membership change when a replica is offline for a month is left open, which is
    our case exactly.

[^172]: p. 98: The causal context is defined here, and the definition is the one the later proofs use; earlier pages
    use it loosely.

[^173]: p. 99: The offline window is revised from the earlier version of the paper; the old definition is in the
    appendix.

[^174]: p. 99: The counter-example for the compaction pass needs three replicas and one network partition, and it is
    convincing.

[^175]: p. 102: The citation for the offline window points to a workshop paper I could not find, and a talk I did.

[^176]: p. 102: The clock-skew bound is revised from the earlier version of the paper; the old definition is in the
    appendix.

[^177]: p. 103: The cost of the counter crdt is given as a constant, but the constant depends on the number of
    replicas, which the text never says.

[^178]: p. 103: The safety argument for the membership change is two paragraphs; the second one is the proof and the
    first is a promise.

[^179]: p. 104: The merge function is defined here, and the definition is the one the later proofs use; earlier
    pages use it loosely.

[^180]: p. 104: The safety argument for the offline window is two paragraphs; the second one is the proof and the
    first is a promise.

[^181]: p. 105: The citation for the conflict policy points to a workshop paper I could not find, and a talk I did.

[^182]: p. 105: The citation for the batch points to a workshop paper I could not find, and a talk I did.

[^183]: p. 106: The vector clock is compared with the log baseline in a table whose second column is the one that
    matters.

[^184]: p. 106: The tombstone is revised from the earlier version of the paper; the old definition is in the
    appendix.

[^185]: p. 107: The citation for the stability frontier points to a workshop paper I could not find, and a talk I
    did.

[^186]: p. 107: The caveat on the register is in a footnote of the paper itself, which I would have put in the
    abstract.

[^187]: p. 108: The caveat on the vector clock is in a footnote of the paper itself, which I would have put in the
    abstract.

[^188]: p. 108: The safety argument for the clock-skew bound is two paragraphs; the second one is the proof and the
    first is a promise.

[^189]: p. 109: The citation for the membership change points to a workshop paper I could not find, and a talk I
    did.

[^190]: p. 109: The cost of the offline window is given as a constant, but the constant depends on the number of
    replicas, which the text never says.

[^191]: p. 110: The cost of the set with removals is given as a constant, but the constant depends on the number of
    replicas, which the text never says.

[^192]: p. 110: The cost of the batch is given as a constant, but the constant depends on the number of replicas,
    which the text never says.

[^193]: p. 111: The citation for the causal context points to a workshop paper I could not find, and a talk I did.

[^194]: p. 111: The counter-example for the causal context needs three replicas and one network partition, and it is
    convincing.

[^195]: p. 112: The membership change is defined here, and the definition is the one the later proofs use; earlier
    pages use it loosely.

[^196]: p. 112: The batch is defined here, and the definition is the one the later proofs use; earlier pages use it
    loosely.

[^197]: p. 113: What happens to the clock-skew bound when a replica is offline for a month is left open, which is
    our case exactly.

[^198]: p. 113: What happens to the register when a replica is offline for a month is left open, which is our case
    exactly.

[^199]: p. 114: The checkpoint is compared with the log baseline in a table whose second column is the one that
    matters.

[^200]: p. 114: The measurement of the register uses a synthetic workload with a Zipf skew the authors do not
    justify.
