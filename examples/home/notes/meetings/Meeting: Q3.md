---
title: "Meeting: Q3"
date: 2026-09-30
tags: [meeting, retro]
---

# Meeting: Q3

The Q3 retro, the afternoon 2.3 shipped. The calendar export saved it under the name of the event, which is
`Meeting: Q3` with a colon in it. I kept it that way because renaming it would break the link from the invite.

Facts for the record: we planned three objectives, shipped two and a half, and learned what the half cost us. The
plan for the next quarter is in [the Q4 OKRs](../projects/q4-okrs.md).

## Went well

- Route sharing shipped on the date we promised, with no one working a weekend
- The soak tests found the retry problem (after it hit us once in production, but they found the next one)
- Onboarding changes landed (the numbers are good: 41% finish, up from 28%)

## Went badly

- The 22 September incident: two and a half hours of a stalled queue, which cost us a customer call and an evening
- The sync rewrite took 5 weeks longer than the first estimate (the work: 3 weeks; the unknowns: 2)
- Documentation lagged: the runbook was in the wrong place when we needed it

## What we try next

1. A ceiling on every retry loop (an alert at a:b, where a is the ceiling and b the age)
2. A standing "unknowns" line in every estimate
3. One person owns each document, by name, in the header

Ratio for next time (unknowns:work) should be 2:3, not 1:5; and the estimate template gets a line for it (see item 2).

## Actions

- [x] Write the retro up (this)
- [ ] Share with Priya and the team
- [ ] Review the three "next" items in the Q4 mid-quarter check-in
