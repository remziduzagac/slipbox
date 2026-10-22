# Spike findings

What the three heuristics did on 5,000 random queries over the Kestrel road graph, run on the laptop with the lid open.
The first plan is in the README; the earlier write-up is [[sync-rewrite]] in my notes, from the same week, in the
style I use for spikes.

## Timings

| Heuristic | Median | p95 | Nodes expanded | Notes |
| --- | ---: | ---: | ---: | --- |
| euclidean | 41 ms | 188 ms | 12,400 | the baseline |
| landmarks | 17 ms | 72 ms | 4,100 | needs a preprocessing pass |
| alt | 13 ms | 51 ms | 3,300 | landmarks plus triangle inequality |

## Conclusion

Landmarks are worth it, and ALT is worth it only if the preprocessing fits the nightly build. It does not yet, so the
engine keeps the euclidean heuristic with a cap and the spike stays a spike.

This clone is not recorded anywhere: the notes folder does not know it exists, so a copy of the notes made without it
would have lost this file, and the findings with it.
