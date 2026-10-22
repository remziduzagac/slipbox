# Plan

Planning notes for Q4, kept in the repository so they travel with the code. The product repository holds the
roadmap; this is the engineering side of it.

## Q4 engineering

1. Ship the retry budget behind its flag (ADR 4), then turn it on for 10 percent of accounts.
2. Retire the unsigned `?route=` links on 2026-12-31.
3. Finish the Biome trial and decide: keep ESLint, keep both, or switch.
4. Move the docs under `docs/architecture/`. Aiko has a branch for it; it waits until 2.3 has settled.

## Not in Q4

- A native app. The offline web app is enough for now.
- Turn-by-turn navigation.

## Risks

| Risk | Plan |
| --- | --- |
| Sync regressions after 2.3 | the retry budget, a weekly queue-depth review |
| One person knows the engine | pair on `crates/route-engine` every other Thursday |
| Tile costs rise | measure in October, decide in November |

The lowercase twin of this file, `plan.md`, is a scratch list from Tomás; the two only differ by case, which is a
problem on case-insensitive checkouts. One of them should go.
