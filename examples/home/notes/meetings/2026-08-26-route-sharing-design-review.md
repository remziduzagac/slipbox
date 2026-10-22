---
title: Route sharing design review
date: 2026-08-26
attendees: [Sam, Tomás, Jo]
tags: [meeting, design-review, route-sharing]
---

# Route sharing design review

Wednesday, 10:00 Berlin, 17:00 in Kyoto; I joined from the hotel. [Tomás](../people/tomas-ruiz.md) and Jo were in
the room. Goal: agree what the share sheet does in 2.3 so Tomás can finish the flows while I am away. The product
side is in the [PRD](../../work/product/prd/route-sharing.md); this is only what we decided in the room.

## What we looked at

Tomás sketched the three states of the sheet on the whiteboard. He sent me a photo before anyone could wipe it.

![Whiteboard with three share-sheet states: link, people, export](../attachments/whiteboard-2026-08-26.png)

The first Figma export of the same screen is still in my downloads. I linked it here and never moved it in, so it
is a hole for now:

![share sheet v2](../attachments/share-sheet-v2.png)

The same photo, cropped to the "people" state, which I pasted again for Tomás without a caption:

![](../attachments/whiteboard-2026-08-26.png)

## Decisions

| # | Decision | Why | Owner |
| --- | --- | --- | --- |
| 1 | Link sharing on, `visibility: link` | Per the [ADR](../../work/kestrel/docs/adr/0003-sharing-links.md) | Sam |
| 2 | `Copy link` first, people second | Jo: 8 of 10 tickets are "how do I send this" [^tickets] | Tomás |
| 3 | Links expire in 2.3, lifetime per the ADR; field `expires_at` | Cheaper now than a later migration | Sam |
| 4 | GPX export stays secondary | Tester: "תמיד שולחים קישור, אף פעם לא קובץ" | Jo |
| 5 | Copy on the button: [Copy link](../../work/product/prd/route-sharing.md) | Tomás owns the copy | Tomás |

[^tickets]: Counted by Jo from the August support queue, 31 tickets mentioning "share".

## Open questions

> [!question] Can a link be revoked?
> We said yes, and then nobody could say where the button lives. Options:
>
> - On the route page, under the three dots
> - In the account settings, with the list of all links
> - Both, which doubles the work
>
> Decide before the 2.3 freeze:
>
> - [ ] Tomás sketches both placements
> - [x] Sam checks that revocation is cheap on the API side
> - [ ] Jo asks three customers where they would look
>
> See the [route-sharing PRD](../../work/product/prd/route-sharing.md) for the current wording.

> [!warning] Privacy
> A link can leak a home address if the route starts at home.
>
> > [!tip] Mitigation
> > Trim the first and last 200 m on public links (later narrowed to an opt-in switch for the first 200 m, see the PRD).
> >
> > > [!note] Detail
> > > The trim is on the server, not the client, so older apps get it too.

1. Things to settle with Tomás
   - > [!info] Revoked links
     > The share sheet needs a state for "link revoked" and a message for a recipient who opens one.
   - The empty state when a route has never been shared
2. Things to settle with Jo
   - [ ] Draft the macro for support: "How to stop sharing a route"

> [!example] The trim, with numbers
> | Route | Start trimmed | End trimmed |
> | --- | ---: | ---: |
> | Commute | 200 m | 200 m |
> | Brevet 300 | 200 m | 200 m |

> ## Jo's notes from the support tool
> A heading inside a quote, because Jo pasted her notes from the support tool as a quote and I kept the structure:
> most people who ask about sharing want to send one route to one friend.

- ## Revocation
  Written on my phone, where the notes app turned an indented title into a heading: the button goes on the route
  page first.

## Next

- Tomás: revised flows by Friday, while I am away
- Jo: the support macro and the three calls
- Me: the revocation endpoint estimate, back on 31 August
