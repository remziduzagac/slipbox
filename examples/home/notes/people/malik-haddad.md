---
title: Malik Haddad
aliases: [Malik, مالك]
tags: [people, kestrel, infra]
role: Data and infrastructure
team: Kestrel Labs
birthday: 1988-05-30
email: malik@kestrel.dev
timezone: Europe/Berlin
oncall:
  rota:
    week_1: Aiko
    week_2: Malik
    week_3: Sam
    week_4: Malik
  escalation: Priya
  pager_hours: "22:00-07:00"
oncall_notes: |
  	check the queue age before the depth
  	restart the worker only after capturing the stuck batch
  		drain script lives in scripts/drain-queue.sh
---

# Malik Haddad (مالك)

Data and infrastructure. He owns the pipelines, the cluster and the pager rota, and is the only person who can read the
queue metrics without a coffee. His family is from Amman and his name in Arabic is مالك, which he writes on the
team whiteboard to make the point that our tooling must cope with it.

## Working together

- Likes a precise question: give him the time range, the service and what you saw
- Answers in the thread, never in a private message, so the answer is kept
- Hates a restart before the evidence is saved; a stuck batch is a gift
- Overlap with Aiko is four hours; he knows her rota better than she does

## On-call notes

His own on-call crib sheet is in the frontmatter above (the `oncall_notes` block), tabs and all, because he pastes it
from his terminal. The week-by-week rota is in the nested `oncall.rota` map.

## مالك والعائلة

His family's maqluba (مقلوبة) is in my cooking notes; he promised the recipe if I did the dishes. The Arabic
heading above says "Malik and the family", which is how he labelled the folder of photos from his sister's
wedding.

A short mixed line: the dish is called مقلوبة, which means "upside down", and it earns the name when you turn the
pot over.

## 1:1s and reviews

Priya does his reviews. The notes that mention him:

- [Incident review](../meetings/2026-09-24-sync-queue-incident-review.md), which we wrote together
- [Priya 1:1, 17 September](../meetings/2026-09-17-priya-1on1.md), on the on-call load

Back to the [index](../index.md).

## Birthday

30 May. He picks the restaurant and expects us to follow.
