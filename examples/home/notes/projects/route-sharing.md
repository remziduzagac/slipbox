---
title: Route sharing
aliases: [sharing]
tags: [project/kestrel, feature]
---

# Route sharing

My working note on the feature that carried 2.3. The documents live in the repositories; this note pulls the parts I
keep needing into one page, as embeds, so they stay current as the owners edit them. The release is
[Kestrel 2.3](kestrel-v2-3.md) and the longer feature doc is
[route sharing in the Kestrel docs](../../work/kestrel/docs/features/route-sharing.md).

## Goals

The product requirements document, heading only:

![goals](../../work/product/prd/route-sharing.md#goals)

## The decision on links

The architecture decision that settled how a shared link is signed, the one paragraph of it that matters:

![decision](../../work/kestrel/docs/adr/0003-sharing-links.md#^decision)

## What the feature does, in the team's words

The feature doc as a whole, short enough to read inline:

![the feature doc](../../work/kestrel/docs/features/route-sharing.md)

## Status, and the way the three notes point at each other

This note, the release note and the sync note quote each other's blocks, so a reader at any of them can follow the
thread of the release from wherever they land.
![the release's sync excerpt](kestrel-v2-3.md#^sync-excerpt) ^status-block

## Pieces I still owe this page

I left some behind while the pieces were moving. Where the revoke button lives, the page I promised Tomás after the
review: ![revoke placement](revoke-placement.md). The preview card as a chat app draws it, a screenshot I never
exported: ![preview card](../attachments/preview-card-chat.png). Jo's list of the chat apps riders named in the
interviews, which I meant to attach: ![chat apps](../attachments/chat-apps-from-interviews.csv). The two Tomás asked
for, ![revoke placement](revoke-placement.md) and ![preview card](../attachments/preview-card-chat.png), side by side,
then on the next line the list again ![chat apps](../attachments/chat-apps-from-interviews.csv).

The whiteboard photo from the review, ![whiteboard](../attachments/whiteboard-2026-08-26.png), is the quickest way
back into the argument about the share sheet.

The three pieces again, one under another, for the version I send to Tomás:

![goals again](../../work/product/prd/route-sharing.md#goals)
![the decision again](../../work/kestrel/docs/adr/0003-sharing-links.md#^decision)
![and the whole doc, once more](../../work/kestrel/docs/features/route-sharing.md)

## Not written yet

The questions that come up in support every week deserve a page: [the sharing FAQ](sharing-faq.md). Jo has asked for it;
when someone creates it, that link stops being broken.

## Notes to self

- Ask Tomás whether the share sheet should show the expiry before or after the copy button.
- The ADR says 72 hours and that is what shipped; the PRD's goal still says 30 days. Ask Priya if it stays as history.
- Check that the deep link opens the offline map if the recipient has no signal.
