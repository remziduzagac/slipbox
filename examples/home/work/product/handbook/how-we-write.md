# How we write

The handbook is a vault of its own, so this page links out to the product repository with paths that climb out of it.
Start from the [product README](../README.md), which says where each kind of document lives.

## Style

| Do | Don't |
| --- | --- |
| Lead with the decision, then the reasons | Lead with the history |
| Use the customer's words, in quotes | Paraphrase what they meant |
| Give a number and a date | Say "soon" or "a lot" |
| Name an owner for every open question | Leave questions for "the team" |
| Link the source: the interview, the ticket | Cite "feedback" |
| Write `kestrel.app` and `2.3` in code font | Bold things to make them important |

## Rules we keep

1. Wrap prose at 120 columns, tables and code included.
2. One idea to a paragraph; one decision to a heading.
3. A PRD names its non-goals. The process is in [the plan](../prd/plan.md), and the exported checklist is the file
   called [plan](../prd/plan) beside it.
4. Links inside the repository are GitHub's: relative from the file, or from the root with a leading slash. Inside this
   handbook the root is the handbook's own, so a leading slash stops here.
5. Dates are ISO: 2026-09-30, never 30/09.
6. Ask for review the way [how we review](how-we-review.md) says, and use the words in [the glossary](/glossary.md).

## Where to link

Most links on this page are relative, and the few that start with a slash are from the handbook's root. Both work on
GitHub; relative ones survive moving a folder, root ones survive moving a file.

- Requirements: [route sharing](../prd/route-sharing.md) and [offline sync](../prd/offline-sync.md)
- The quarter: [Q4 roadmap](../roadmap/q4.md) and [Q4 OKRs](../okrs/2026-q4.md)
- Shipping: [2.3 plan](../releases/2.3-plan.md) and [release notes](../releases/2.3-notes.md)
- Reviewing: what to send is under [before you ask](how-we-review.md#before-you-ask), what a reviewer owes you under
  [approving](how-we-review.md#approving)
