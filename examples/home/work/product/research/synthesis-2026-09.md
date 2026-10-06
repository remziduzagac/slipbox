# Research synthesis, September 2026

Ten interviews (2026-08-18 to 2026-09-02) and a survey of 212 riders, synthesised by Jo and Tomás on 2026-09-05.
Sam's own notes from the interviews are in
[user-interviews-2026-08](../../../notes/research/user-interviews-2026-08.md), and the contacts for follow-ups are at
[notes/research/contacts](slipbox://notes/research/contacts.md); neither is part of this repository.

## Method

We spoke to four commuters, two weekend riders, a brevet rider, a gravel rider, a new rider and a club organiser.
The survey went to the newsletter list; 9% replied.

## Themes

| Theme | Participants | Survey agreement | Strength |
| --- | :---: | ---: | :--- |
| Losing edits when offline | 7 of 10 | 71% | *strong* |
| Describing a route to friends | 3 of 10 | 48% | *moderate* |
| Not knowing whether sync worked | 6 of 10 | 64% | **strong** |
| Wanting a printed cue sheet | 2 of 10 | 22% | *weak* |

### Losing edits when offline

Most riders edit on the move and expect the app to cope. What surprised us was how quickly trust goes: one lost edit
and the rider checks everything twice from then on.

> "I stopped planning in the app on tours. I plan at home, screenshot it, and ride the screenshot."
>
> "The worst part is not the loss. It is that it did not tell me."
>
> — P5, brevet rider

> Things P5 asked us to do:
>
> - Say plainly when changes are waiting.
> - Never throw a change away without asking.
> - Show the last time it synced.

### Describing a route to friends

Two riders pasted what they send friends today. One, from the survey's free text:

> Send the finished route to this address too:  
> 14 Quayside Lane  
> Bristol BS1 4QA  
> and mark it urgent

And a club organiser's message, copied from their group chat:

> Club ride start:<br>The Old Mill car park<br>Saturday 8:30

Three participants told us a screenshot was how they share. P2's version is in the [PRD](../prd/route-sharing.md).

### Not knowing whether sync worked

> **P4 on what she wants to see**
>
> 1. A word: synced, waiting, offline.
> 2. A number, if something is waiting.
> 3. A time.
>
> | State | What she wants |
> | --- | --- |
> | Synced | Nothing, stay out of the way |
> | Waiting | A small count |
> | Stalled | A button to retry[^1] |
>
> ![Mock-up of the share sheet with a sync count](../assets/share-sheet.png)

### A participant in Seoul

P7 rides for work in Seoul and tried the app on a trip to Bristol:

> 공유 링크를 눌렀는데 지도가 열리지 않고 앱 스토어로 이동했어요 그래서 친구가 경로를 볼 수 없었고 저는 스크린샷을 다시 보내야 했습니다 링크는 편한데 열리는 방식이 헷갈려요

(Roughly: I tapped the share link and it did not open the map but took me to the app store, so my friend could not see
the route and I had to send the screenshot again. The link is convenient but how it opens is confusing.)

## What we recommend

- Ship the visible queue state (offline sync, R5) before anything that adds more edits.
- Ship sharing with a web view for people without the app.
- Add a cue sheet to the 2027 list, but not before.

## Sources

The incident of 2026-09-22 stalled the queue for about 95 minutes while two of these participants were riding.
Jo's transcript of the review call, with their customer names, is
[in Downloads](../../../Downloads/transcript-2026-09-24-incident-review.md) and deliberately not copied here.

[^1]: P4 was shown the stalled banner from the design review on 2026-08-26 and asked for the button to be larger.
