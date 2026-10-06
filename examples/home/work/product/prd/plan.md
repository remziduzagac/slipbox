# PRD process plan

How an idea becomes a requirements document, and the document becomes a release. This is the maintained version of the
checklist exported from the old wiki, which still sits beside this file as `plan` until the wiki is deleted.

## Stages

| Stage | Output | Owner | Ready when |
| --- | --- | --- | --- |
| Idea | One paragraph and a customer quote | anyone | it has a source |
| Draft | A PRD with problem, goals, non-goals | Sam | goals have numbers |
| Review | Comments from design and engineering | Tomás, Priya | two working days passed |
| Commit | A key result and a roadmap slot | Priya | the quarter has capacity |
| Ship | Release plan and notes | Jo | the checklist is green |
| Close | Metrics filled in, questions answered | Sam | 30 days after release |

## What a PRD contains

1. **Problem**, written as something a customer said.
2. **Goals**, each with a number and a date.
3. **Non-goals**, so the review does not drift.
4. **User stories**, as a task list: each can be checked off when it ships.
5. **Metrics**, a table of the measure, the baseline and the target.
6. **Open questions**, each with an owner.

## Timeboxes

- Draft to review: one week.
- Review to commit: two working days of comments, then a decision at the Tuesday planning meeting.
- A PRD with no change for 30 days is closed or moved to `drafts/`.

## Differences from the wiki checklist

The wiki version had five steps and no "Close". We added it after offline sync v1 shipped without anyone checking the
numbers. The wiki's spelling of the design reviewer's name has also been fixed.

Links copied from the wiki lost their extensions, like [the offline sync PRD](offline-sync); GitHub won't follow them,
so fix one when you touch its line.
