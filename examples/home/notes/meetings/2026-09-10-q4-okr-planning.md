---
title: Q4 OKR planning
date: 2026-09-10
tags: [meeting, okr, planning]
---

# Q4 OKR planning

Thursday morning, at ten, with Priya and Tomás in the small room. The outcome is the
[Q4 OKR note](../projects/q4-okrs.md) and, once Priya cleaned it up, the
[product repository's version](../../work/product/okrs/2026-q4.md). This is the working page: what we scored, and what
we argued about.

## Candidate objectives

Twelve candidates went on the wall. Each of us gave every one a score from 0 to 10 for impact, effort, risk and
confidence, in decimals because Tomás insists.

1. Ship 2.3 with route sharing on time
2. Make offline sync boring
3. Cut cold-start time of the engine by a third
4. Support the Alps region
5. A public changelog
6. Onboarding for club organisers
7. A second route engine profile: gravel
8. Reduce support tickets about sharing by half
9. Hire the backend engineer
10. Pay down the tile-cache debt
11. A watch complication, finally
12. Documentation for external contributors

## Scoring

The full grid, three voters across, with the average on the right. Wide on purpose: it is what the whiteboard looked
like and I copied it as it stood.

| # | Objective | Imp P | Imp T | Imp S | Eff P | Eff T | Eff S | Risk | Conf | Avg | Rank | Pick |
| ---: | :--- | ---: | ---: | ---: | ---: | ---: | ---: | :---: | :---: | ---: | ---: | :---: |
| 1 | Ship 2.3 | 9.5 | 9.0 | 9.5 | 5.0 | 4.5 | 5.5 | M | 8.5 | 8.42 | 1 | yes |
| 2 | Boring sync | 9.0 | 7.5 | 9.5 | 7.0 | 6.5 | 8.0 | H | 6.5 | 7.31 | 2 | yes |
| 3 | Cold start | 6.0 | 5.5 | 8.0 | 6.0 | 5.5 | 6.5 | M | 7.0 | 6.05 | 7 | no |
| 4 | Alps region | 7.5 | 8.0 | 6.0 | 4.0 | 3.5 | 4.5 | L | 8.0 | 7.14 | 3 | no |
| 5 | Changelog | 4.0 | 3.5 | 4.5 | 2.0 | 1.5 | 2.5 | L | 9.0 | 4.80 | 10 | no |
| 6 | Club onboarding | 7.0 | 8.5 | 6.5 | 5.5 | 5.0 | 6.0 | M | 6.0 | 6.72 | 5 | yes |
| 7 | Gravel profile | 5.5 | 6.0 | 7.0 | 6.5 | 7.0 | 7.5 | H | 5.0 | 5.20 | 8 | no |
| 8 | Fewer tickets | 8.0 | 7.0 | 8.5 | 3.5 | 4.0 | 3.0 | L | 7.5 | 7.01 | 4 | yes |
| 9 | Hire backend | 8.5 | 6.0 | 8.0 | 5.0 | 4.5 | 5.0 | M | 6.5 | 6.60 | 6 | yes |
| 10 | Tile cache | 5.0 | 4.0 | 6.5 | 6.0 | 6.5 | 7.0 | M | 6.0 | 4.95 | 9 | no |
| 11 | Watch | 3.0 | 6.5 | 4.0 | 8.0 | 7.5 | 8.5 | H | 3.5 | 3.40 | 12 | no |
| 12 | Contributor docs | 3.5 | 3.0 | 5.0 | 4.0 | 3.5 | 4.5 | L | 7.0 | 4.10 | 11 | no |

## What we picked

Five objectives, which Priya says is one too many and I say is exactly the number of things we already do. Alps
scored third and still stays out, because nobody has the capacity. The picks, with an owner and a target each:

| Objective | Owner | Target |
| :--- | :---: | ---: |
| Ship 2.3 | Sam | 30 Sep |
| Boring sync | Aiko | 0 night pages |
| Club onboarding | Tomás | 12 clubs |
| Fewer sharing tickets | Jo | -50.0% |
| Backend hire | Priya | 1 signed |
| Alps region (parked) | nobody yet | Q1 |

## Key results, first pass

Each row is one source line and is long enough to wrap in a narrow window. Nothing in this table is a decision; it is
the order we talked about them.

| KR | Wording | Source | Confidence |
| --- | --- | --- | ---: |
| 1.1 | Route sharing generally available to all users on web and in both mobile apps by 30 September | PRD | 0.9 |
| 1.2 | Fewer than five new sharing-related support tickets per week for four consecutive weeks | support | 0.6 |
| 2.1 | Zero night pages from the sync queue over a rolling thirty days, measured by the on-call rota | rota | 0.5 |
| 2.2 | Offline edits survive a forced app kill in 99.5% of the soak runs we do before every release | soak | 0.7 |
| 3.1 | Twelve cycling clubs actively using the organiser onboarding flow by the end of the quarter | CS | 0.4 |
| 3.2 | Median time from sign-up to first shared route under ten minutes for new club organisers | data | 0.5 |
| 4.1 | One offer signed for the backend engineer role by 31 October, a start date by 1 December | Priya | 0.8 |
| 4.2 | Onboarding of the new hire's first PR within their first week | Priya | 0.7 |
| 5.1 | Alps regional tiles ready for the planner in a beta behind a flag by the end of November | tiles | 0.4 |
| 5.2 | Offline map download size down by a fifth for the Alps region compared to the Pyrenees baseline | tiles | 0.3 |

## Follow-ups

| Who | What |
| --- | --- |
| Sam | [ ] write the final note |
| Priya | [x] clean the draft in the product repo |
| Tomás | [ ] sketch the organiser flow |

The checkboxes in that table are only text, and nothing will tick them. The real list is the one below.

- [ ] Sam: turn the scoring table into the note by Friday
- [ ] Priya: confirm the hiring numbers with finance
- [ ] Tomás: the club onboarding sketches
