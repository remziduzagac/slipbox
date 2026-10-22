---
title: Hiring a backend engineer
tags: [project, hiring]
---

# Hiring a backend engineer

One seat on the sync team, opened by Priya on 2026-08-18 after the sync rewrite grew. Candidates are named by code
here; names stay in the applicant tracker. The debrief of the first round is in
[hiring debrief](../meetings/2026-09-09-hiring-debrief.md).

## Pipeline

| Code | Stage | Last contact | Sentence from the panel |
| --- | --- | --- | --- |
| C-101 | offer out | 2026-10-02 | Explained the retry budget better than our ADR, and asked what we had measured. |
| C-102 | onsite done | 2026-09-29 | Sharp on the whiteboard, loose on Python; the take-home never questioned its assumptions. |
| C-103 | rejected | 2026-09-12 | Fluent, but could not say what happens to an op when the server is down. |
| C-104 | phone screen | 2026-10-05 | Booked for Thursday; Priya runs it, and I listen in for the second half. |
| C-105 | withdrew | 2026-09-20 | Took another offer; asked us to keep in touch, which we will. |

Sources, which the table has no room for: C-101 came by referral from Aiko, C-102 and C-104 from the job board, C-103
from a recruiter and C-105 from a meetup.

## Rubric

Scores are 1 to 4 and averaged, so the numbers are right-aligned; the bar is centred; the words stay left.

| Area | Weight | Bar | What a 4 sounds like |
| :--- | ---: | :---: | :--- |
| Systems thinking | 30 % | 3.0 | Names the failure first, then the design. |
| Python and SQL | 25 % | 3.0 | Writes the query, then the index it needs. |
| Communication | 25 % | 3.5 | Says "I don't know" early, then what they would check. |
| Collaboration | 20 % | 3.0 | Gives credit; asks the interviewer a real question. |

## Scorecards

| Code | Systems | Python | Comms | Collab | Average |
| :---: | ---: | ---: | ---: | ---: | ---: |
| C-101 | 4 | 3 | 4 | 4 | 3.75 |
| C-102 | 4 | 2 | 3 | 3 | 3.00 |
| C-103 | 2 | 3 | 3 | 2 | 2.50 |

## Rubric notes

The interview that told me the most was the one where I removed the network mid-question and asked what the candidate
did next. Candidates who said "retry" and stopped did not make it; the ones who asked what the user was seeing while
they waited did. This is also why [the queue incident](../meetings/2026-09-24-sync-queue-incident-review.md) was a
useful interview question afterwards.
