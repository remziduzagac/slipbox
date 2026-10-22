---
title: Feedback synthesis with Jo
date: 2026-09-05
tags: [meeting, research, customers]
---

# Feedback synthesis with Jo

Saturday morning, a long coffee with [Jo](../people/jo-becker.md) while she walked me through the last two weeks of
support mail. The cleaned version of this lives in the product repo as the
[September synthesis](../../work/product/research/synthesis-2026-09.md); here is the raw version, with what I
believe and what I do not.

## Customer quotes

> People want to share a route and cannot find where.
>
> > One customer, quoted by Jo from a long thread:
> >
> > > I made a route for my club ride, pressed the thing that looks like sharing, and it wanted me to sign in. I am
> > > signed in. I sent them a screenshot instead.
> >
> > She added that this was the third screenshot that week.
>
> The pattern is the same in every thread: the share icon is read as "save".

> > Another one, from the offline beta
> >
> > It worked on the train, but when I got to the station it said "syncing" for ten minutes and then it was fine.
> > I would not have noticed if it had not said anything.

## Counts

| Theme | Threads | Share |
| --- | ---: | ---: |
| Sharing | 14 | 38% |
| Offline | 9 | 24% |
| Elevation | 5 | 14% |
| Other | 9 | 24% |

Total: 37 threads in 17 days.

## Tags I use

- #feedback/sharing: the main one, 14 threads
- #feedback/offline for the sync complaints, and #feedback/offline/ios for the ones that name the phone
- After punctuation: (#support) or "#urgent", or the list item (#feedback/sharing/android)
- Not tags: C# the language, a ticket number like #2026, or the URL fragment page#top

Related: #customers, #route-sharing, #project and #projects (two different tags, I keep mixing them up).

## Tickets worth reading

- <https://support.kestrel.example/tickets/48211> the club ride one
- <https://support.kestrel.example/tickets/48377> the iOS "syncing" one, with the video
- www.kestrel.example/status is where Jo keeps the status page, and her bare address in the mail was
  support@kestrel.example

## Broken references

I wrote these while looking at the PRD and have not fixed them yet:

- The price question is in [the pricing section](../../work/product/prd/route-sharing.md#pricing), but the PRD has
  no such heading; the nearest are "Goals" and "Metrics"
- The decision about the trim is [in the third paragraph](../../work/product/prd/route-sharing.md#^trim-decision),
  a block id Tomás and I never added
- The older survey note is [somewhere](../research/survey-2026.md), and I never wrote it

## What I take away

1. Sharing is the first problem, because nobody can find it
2. Offline "syncing" is a trust problem, not a speed problem
3. Pricing is not a theme yet and I should stop writing about it
