# PRD: route sharing

**Status:** shipped in 2.3 (2026-09-30) · **Owner:** Sam Rivera · **Design:** Tomás Ruiz · **Engineering:** Aiko

> [!NOTE]
> This PRD is the record of what we decided before building. What shipped, and what we learned since, is in the
> [release notes](../releases/2.3-notes.md) and the metrics table below.

## Problem

Riders plan a route and then describe it to their friends in a chat message: a screenshot, a place name, "we turn left
at the church". Three of the ten riders we interviewed in August did exactly that, and two of them said their friends
then planned a different route and arrived somewhere else.

> "I made the perfect loop, sent a screenshot, and my brother rode the other way round. It was fine, but it was not
> the loop." (P2)

The research that led here is in [the September synthesis](/research/synthesis-2026-09.md); the quarter's plan for it
is under [route sharing in the Q4 roadmap](../roadmap/q4.md#route-sharing).

## Goals

- A rider can send a route as a link in under ten seconds from the route card.
- Someone without the app sees the route, read-only, in a browser, without signing in.
- A rider with the app can open the link and save the route to their own library in two taps.
- Shared links expire after 30 days unless the owner renews them (shipped as 72 hours with no renewal; see ADR 0003).

## Non-goals

- Editing a route together. That is a 2027 theme.
- Public discovery of routes: a link is private to whoever has it.
- Sharing rides (what you did) as opposed to routes (what you plan); rides have a different privacy model.

## User stories

- [x] As a rider, I tap **Share** on a route card and get a link.
- [x] As a rider, I copy the link with one tap and see that it was copied.
- [x] As a friend without the app, I open the link and see the route on a map.
- [x] As a friend with the app, I open the link and the app shows the route with a **Save** button.
- [ ] As a rider, I see who opened my link. (Cut for 2.3, to be reconsidered.)
- [X] As a rider, I can turn a link off before it expires.

## Metrics

| Measure | Baseline | Target | Result (Oct 5) |
| --- | ---: | ---: | ---: |
| Routes shared per active rider per month | 0.0 | 0.6 | 0.4 |
| Links opened by non-members | n/a | 30% | 41% |
| Non-member to sign-up within 7 days | n/a | 8% | 5% |
| Support tickets about sharing | n/a | < 5/week | 3/week |

## Notes for engineering

> [!TIP]
> A link in a chat app shows a preview card. Make sure the route's name and distance are in the page title.

> [!IMPORTANT]
> A shared link exposes the route's start point. For routes starting at someone's home, offer to trim the first 200 m.

> [!WARNING]
> Links must not be forgeable. A link carries the route id, its expiry and an HMAC signature over both (ADR 0003), and
> the server rate-limits lookups.

> [!CAUTION]
> Do not log the full link in the app's analytics: the code is a credential for the route.

> [!faq]- What happens to a link when the route is deleted?
> The link works until it expires, at most 72 hours, with a banner saying the owner removed the route, then a 410.

> [!question]+ Should viewers see the owner's name?
> Current design says no, only "Shared by a Kestrel rider". Jo hears the opposite from customers who share with clubs.

<!-- markdownlint-disable-next-line MD013 -->
> [!tip] Test the preview card in the three chat apps riders named most often before raising the rollout past 10%
> Jo has the list from the interviews; the card's title and image are what people judge it by.

## Review comments

Pasted from the design review thread, as written:

> Priya: we agreed in review that
> [!note] means the banner, not the sheet.

> [!] still open: who renews?

> [ !note] from the design crit, pasted as is

## Open questions

- Who can renew a link, the owner only or anyone with edit rights on the route? Owner: Tomás.
- Does a link opened in the in-app browser of a chat app count as a non-member visit? Owner: Malik.
- Is 30 days right? The median rider plans a trip about three weeks ahead, so a link made for it could expire the week
  before the trip. Owner: Sam.

## Implementation

The decision on link format is recorded as [ADR 0003](slipbox://kestrel/docs/adr/0003-sharing-links.md). The engineering
view, with the endpoints and the data model, is in
[the feature doc](../../kestrel/docs/features/route-sharing.md) in the app repository, which is a sibling checkout of
this one.

### Rollout

1. Internal dogfood from 2026-09-14.
2. 10% of riders from 2026-09-22; paused for two days by the sync incident.
3. Everyone with 2.3 on 2026-09-30.
   1. Android and web first.
   2. iOS after review.
