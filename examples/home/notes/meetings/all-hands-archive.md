---
title: All-hands archive
tags: [meeting, all-hands, archive]
---

# All-hands archive: January 2024, the first one

Every all-hands since we started, appended monthly by whoever took the notes (mostly me). Newest at the bottom. Each
entry has the company, the product and the people, the same three parts every time, so that it can be skimmed.

## Company

Kestrel Labs, six people in a rented room above a bike shop, one product still in a private beta with 1,200 riders. We
agreed on a name, a first paying customer (a cycling club) and a rule: ship something rideable every month.

### Product

#### Shipped

- Nothing public yet; the private planner draws a line on a map

##### Next

- GPX import, the web planner beta

###### Questions

Only one question, from Aiko: can we keep the meeting under thirty minutes? We did, by not having slides.

### People

Welcome and thanks: Sam Rivera wrote the first planner in a weekend, and Jo Becker (customer success) found the first
thousand riders. The offsite is booked for the summer.

> [!note] Will we ever do a paid tier?
> Not this year. We want the planner to be good enough that you would, and the club accounts will tell us.

## February 2024 all-hands, 2024-02-07

February brought 1,314 monthly active riders and a team of 6. The retro for last month was short, which is a good sign.

### Product

#### Shipped

- web planner beta
- GPX import
- elevation profile

#### Next

- emailing a route as a GPX file
- tile cache v1

#### Numbers

| Metric | Last month | This month | Change |
| --- | ---: | ---: | ---: |
| Monthly riders | 1,200 | 1,314 | +114 |
| Routes planned | 3,942 | 4,336 | +394 |
| Crash-free sessions | 99.3% | 99.4% | +0.1 |

##### Metrics export

```yaml
month: 2024-02
riders: 1314
regions: [benelux]
crash_free: 99.4
```

### People

Welcome and thanks: Aiko Tanaka (backend) goes full-time on the 12th, after a month of evenings. Jo Becker (customer
success) was thanked for the first support macros. A designer joins in the spring.

> [!tip] Why is the Android app behind iOS?
> One engineer fewer on that side for two months; the hire fixes it.

## March 2024 all-hands, 2024-03-06

March brought 1,438 monthly active riders and a team of 6. The last release went out on a Friday and nothing happened.
Aiko, who went full-time last month, took her first on-call shift.

### Product

#### Shipped

- emailing a route as a GPX file
- tile cache v1
- Android app alpha

#### Next

- iOS app alpha
- turn-by-turn voice

#### Numbers

| Metric | Last month | This month | Change |
| --- | ---: | ---: | ---: |
| Monthly riders | 1,314 | 1,438 | +124 |
| Routes planned | 4,336 | 4,745 | +409 |
| Crash-free sessions | 99.4% | 99.5% | +0.1 |

People and hiring
-----------------

Welcome and thanks: Aiko Tanaka (backend) was thanked for the first sync prototype. The designer we were waiting for has
signed.

> [!warning] Can I get a day for the volunteer outreach nights?
> Yes, and Sam has already done the paperwork for the first batch.

## April 2024 all-hands, 2024-04-03

April brought 1,575 monthly active riders and a team of 7. Sam showed the new build times and got applause.

### Product

#### Shipped

- iOS app alpha
- turn-by-turn voice
- surface-type colouring

#### Next

- bike-type profiles
- offline maps, first cut

#### Numbers

| Metric | Last month | This month | Change |
| --- | ---: | ---: | ---: |
| Monthly riders | 1,438 | 1,575 | +137 |
| Routes planned | 4,745 | 5,197 | +452 |
| Crash-free sessions | 99.5% | 99.6% | +0.1 |

### People

Welcome and thanks: Tomás Ruiz (design) joined on Monday with a notebook full of sketches of the planner. The checklist
below is the one he went through.

#### Checklist for new hires

- [ ] Before day one
  - [x] Laptop ordered
  - [ ] Accounts
    - [ ] Source control
      - [ ] Two-factor set up
      - [x] Added to the team
    - [x] Chat and calendar
  - [ ] Desk and chair
- [ ] First week
  - [ ] Meet the team
  - [ ] Ship something small

> [!important] What is the plan for the engine?
> Rust, one crate at a time, with benchmarks in CI so we can prove it is faster.

## May 2024 all-hands, 2024-05-01

May brought 1,725 monthly active riders and a team of 7. Tomás drew the club account screens on the whiteboard during
the meeting, and we kept them.

### Product

#### Shipped

- bike-type profiles
- offline maps, first cut
- club accounts

#### Next

- weather overlay
- segment heat map

#### Numbers

| Metric | Last month | This month | Change |
| --- | ---: | ---: | ---: |
| Monthly riders | 1,575 | 1,725 | +150 |
| Routes planned | 5,197 | 5,692 | +495 |
| Crash-free sessions | 99.6% | 99.7% | +0.1 |

### People

Welcome and thanks: Tomás Ruiz (design) was thanked for the club account screens, and Jo Becker (customer success) for
sitting in on the first club calls.

> [!info] Do we have a security contact?
> Malik, until we hire one. The address is on the status page.

##### A note from the room

A longer message that the notetaker wrote down verbatim, with every step of the story and without trimming, because
the person asked that it be kept exactly: we started with six people and one idea, and every month since then we have
shipped something rideable, sometimes small, sometimes with a lot of ceremony, and that is the whole company in one
sentence.

## June 2024 all-hands, 2024-06-05

June brought 1,889 monthly active riders and a team of 7. Weather overlay day: half the room spent the break looking at
the rain over Ghent.

### Product

#### Shipped

- weather overlay
- segment heat map
- public API v1

#### Next

- API keys for partners
- tile cache v2

#### Numbers

| Metric | Last month | This month | Change |
| --- | ---: | ---: | ---: |
| Monthly riders | 1,725 | 1,889 | +164 |
| Routes planned | 5,692 | 6,233 | +541 |
| Crash-free sessions | 99.7% | 99.8% | +0.1 |

##### Metrics export

```yaml
month: 2024-06
riders: 1889
regions: [benelux]
crash_free: 99.8
```

### People

Welcome and thanks: Jo Becker (customer success) was thanked for the weather overlay feedback, collected from forty
riders in two weeks.

> [!note] How do I report a customer story?
> Post it in the support channel with a screenshot, and Jo will pick it up.

## July 2024 all-hands, 2024-07-03

July brought 2,068 monthly active riders and a team of 8. Priya ran her first all-hands from the back of the room. The
room above the bike shop is getting small.

### Product

#### Shipped

- API keys for partners
- tile cache v2
- onboarding redesign

#### Next

- dark theme
- accessibility pass

#### Numbers

| Metric | Last month | This month | Change |
| --- | ---: | ---: | ---: |
| Monthly riders | 1,889 | 2,068 | +179 |
| Routes planned | 6,233 | 6,824 | +591 |
| Crash-free sessions | 99.2% | 99.3% | +0.1 |

### People

Welcome and thanks: Priya Nair (engineering manager) joined this month and takes over planning and the on-call rota. Sam
was thanked for handing it over without complaint.

> [!tip] Will offline mode kill battery life?
> We measure it in every release; the target is under 3 percent an hour.

## August 2024 all-hands, 2024-08-07

August brought 2,265 monthly active riders and a team of 8. Two people were on holiday, so the meeting was held over
video.

### Product

#### Shipped

- dark theme
- accessibility pass
- heart-rate overlay

#### Next

- FIT file export
- route collections

#### Numbers

| Metric | Last month | This month | Change |
| --- | ---: | ---: | ---: |
| Monthly riders | 2,068 | 2,265 | +197 |
| Routes planned | 6,824 | 7,474 | +650 |
| Crash-free sessions | 99.3% | 99.4% | +0.1 |

People and hiring
-----------------

Welcome and thanks: Jo Becker (customer success) was thanked for turning a month of support mail into a list of ten
fixes.

> [!warning] Is the roadmap public?
> A trimmed version, in the changelog, from next quarter.

## September 2024 all-hands, 2024-09-04

September brought 2,480 monthly active riders and a team of 8. The partner API got its first outside user, who found a
bug in the first hour.

### Product

#### Shipped

- FIT file export
- route collections
- multi-day trip planner

#### Next

- Pyrenees region tiles
- search by place

#### Numbers

| Metric | Last month | This month | Change |
| --- | ---: | ---: | ---: |
| Monthly riders | 2,265 | 2,480 | +215 |
| Routes planned | 7,474 | 8,184 | +710 |
| Crash-free sessions | 99.4% | 99.5% | +0.1 |

### People

Welcome and thanks: Priya Nair (engineering manager) was thanked for the first quarterly plan. The offsite is booked for
the winter.

> [!important] Can we hold the all-hands in the afternoon?
> We tried it. Nobody prefers it. Back to ten.

## October 2024 all-hands, 2024-10-02

October brought 2,715 monthly active riders and a team of 9. Malik started on Monday and spent the first week reading
dashboards. The room above the bike shop is gone; we have two floors now.

### Product

#### Shipped

- Pyrenees region tiles
- search by place
- ride history import

#### Next

- notes on routes
- saved searches

#### Numbers

| Metric | Last month | This month | Change |
| --- | ---: | ---: | ---: |
| Monthly riders | 2,480 | 2,715 | +235 |
| Routes planned | 8,184 | 8,959 | +775 |
| Crash-free sessions | 99.5% | 99.6% | +0.1 |

##### Metrics export

```yaml
month: 2024-10
riders: 2715
regions: [benelux, pyrenees]
crash_free: 99.6
```

### People

Welcome and thanks: Malik Haddad (data and infra) joined with an opinion about our database and a plan to fix it.

#### Checklist for new hires

- [ ] Before day one
  - [x] Laptop ordered
  - [ ] Accounts
    - [ ] Source control
      - [ ] Two-factor set up
      - [x] Added to the team
    - [x] Chat and calendar
  - [ ] Desk and chair
- [ ] First week
  - [ ] Meet the team
  - [ ] Ship something small

> [!info] Will we ever do a paid tier?
> Not this year. We want the planner to be good enough that you would, and the club accounts will tell us.

## November 2024 all-hands, 2024-11-06

November brought 2,973 monthly active riders and a team of 9. The mood was good; the Pyrenees tiles went out without a
hitch.

### Product

#### Shipped

- notes on routes
- saved searches
- offline maps v2

#### Next

- mobile widgets
- gravel profile experiment

#### Numbers

| Metric | Last month | This month | Change |
| --- | ---: | ---: | ---: |
| Monthly riders | 2,715 | 2,973 | +258 |
| Routes planned | 8,959 | 9,810 | +851 |
| Crash-free sessions | 99.6% | 99.7% | +0.1 |

### People

Welcome and thanks: Tomás Ruiz (design) was thanked for the notes-on-routes screens, drawn on the train.

> [!note] Why is the Android app behind iOS?
> One engineer fewer on that side for two months; the hire fixes it.

## December 2024 all-hands, 2024-12-04

December brought 3,256 monthly active riders and a team of 9. The year-end retro had a list of things to stop doing, and
it was longer than the list of things to start.

### Product

#### Shipped

- mobile widgets
- gravel profile experiment
- weather-aware departure time

#### Next

- route comments
- tile cache v3

#### Numbers

| Metric | Last month | This month | Change |
| --- | ---: | ---: | ---: |
| Monthly riders | 2,973 | 3,256 | +283 |
| Routes planned | 9,810 | 10,744 | +934 |
| Crash-free sessions | 99.7% | 99.8% | +0.1 |

### People

Welcome and thanks: Aiko Tanaka (backend) was thanked for the on-call handbook, which is four pages and already used.

> [!tip] Can I get a day for the volunteer outreach nights?
> Yes, and Sam has already done the paperwork for the first batch.

##### A note from the room

A longer message that the notetaker wrote down verbatim, with every step of the story and without trimming, because
the person asked that it be kept exactly: we started with six people and one idea, and every month since then we have
shipped something rideable, sometimes small, sometimes with a lot of ceremony, and that is the whole company in one
sentence.

Year one, in review
===================

Twelve months, twelve shipped things, no outage longer than an hour, and a team that likes each other. The aim for the
next year is to stay small, say no more often, and make the planner work with no signal.

## January 2025 all-hands, 2025-01-01

January brought 3,565 monthly active riders and a team of 10. The all-hands was held on New Year's Day over coffee, with
half the team.

### Product

#### Shipped

- route comments
- tile cache v3
- climb difficulty scores

#### Next

- group ride planning
- sunrise and sunset routing

#### Numbers

| Metric | Last month | This month | Change |
| --- | ---: | ---: | ---: |
| Monthly riders | 3,256 | 3,565 | +309 |
| Routes planned | 10,744 | 11,764 | +1,020 |
| Crash-free sessions | 99.2% | 99.3% | +0.1 |

People and hiring
-----------------

Welcome and thanks: our new mobile engineer joined on the 6th. Malik Haddad (data and infra) was thanked for the first
backup restore that actually worked.

> [!warning] What is the plan for the engine?
> Rust, one crate at a time, with benchmarks in CI so we can prove it is faster.

## February 2025 all-hands, 2025-02-05

February brought 3,904 monthly active riders and a team of 10. Priya reminded everyone that holidays are not optional.

### Product

#### Shipped

- group ride planning
- sunrise and sunset routing
- bike shop finder

#### Next

- unit preferences
- import fixes for odd GPX files

#### Numbers

| Metric | Last month | This month | Change |
| --- | ---: | ---: | ---: |
| Monthly riders | 3,565 | 3,904 | +339 |
| Routes planned | 11,764 | 12,883 | +1,119 |
| Crash-free sessions | 99.3% | 99.4% | +0.1 |

##### Metrics export

```yaml
month: 2025-02
riders: 3904
regions: [benelux, pyrenees]
crash_free: 99.4
```

### People

Welcome and thanks: Priya Nair (engineering manager) was thanked for the planning template, which two other teams in the
building have copied.

> [!important] Do we have a security contact?
> Malik, until we hire one. The address is on the status page.

## March 2025 all-hands, 2025-03-05

March brought 4,275 monthly active riders and a team of 10. A quiet month, which the notes keep short on purpose.

### Product

#### Shipped

- unit preferences
- import fixes for odd GPX files
- status page

#### Next

- loop-route suggestions
- web editor refresh

#### Numbers

| Metric | Last month | This month | Change |
| --- | ---: | ---: | ---: |
| Monthly riders | 3,904 | 4,275 | +371 |
| Routes planned | 12,883 | 14,107 | +1,224 |
| Crash-free sessions | 99.4% | 99.5% | +0.1 |

### People

Welcome and thanks: Jo Becker (customer success) was thanked for the list of customer devices that QA now tests against.

> [!info] How do I report a customer story?
> Post it in the support channel with a screenshot, and Jo will pick it up.

## April 2025 all-hands, 2025-04-02

April brought 4,681 monthly active riders and a team of 11. A QA engineer started and asked for every phone in the
drawer.

### Product

#### Shipped

- loop-route suggestions
- web editor refresh
- smaller offline map downloads

#### Next

- first Rust engine prototype
- benchmark suite for the engine

#### Numbers

| Metric | Last month | This month | Change |
| --- | ---: | ---: | ---: |
| Monthly riders | 4,275 | 4,681 | +406 |
| Routes planned | 14,107 | 15,447 | +1,340 |
| Crash-free sessions | 99.5% | 99.6% | +0.1 |

### People

Welcome and thanks: our new QA engineer joined on the 7th. Malik Haddad (data and infra) was thanked for the status
page, which nobody has needed yet.

#### Checklist for new hires

- [ ] Before day one
  - [x] Laptop ordered
  - [ ] Accounts
    - [ ] Source control
      - [ ] Two-factor set up
      - [x] Added to the team
    - [x] Chat and calendar
  - [ ] Desk and chair
- [ ] First week
  - [ ] Meet the team
  - [ ] Ship something small

> [!note] Will offline mode kill battery life?
> We measure it in every release; the target is under 3 percent an hour.

## May 2025 all-hands, 2025-05-07

May brought 5,126 monthly active riders and a team of 11. Sam showed the first Rust engine prototype and got a long
silence, then applause.

### Product

#### Shipped

- first Rust engine prototype
- benchmark suite for the engine
- Pyrenees tile refresh

#### Next

- surface-aware costs in the prototype
- cost model tests

#### Numbers

| Metric | Last month | This month | Change |
| --- | ---: | ---: | ---: |
| Monthly riders | 4,681 | 5,126 | +445 |
| Routes planned | 15,447 | 16,915 | +1,468 |
| Crash-free sessions | 99.6% | 99.7% | +0.1 |

### People

Welcome and thanks: Sam Rivera (staff engineer) was thanked for the Rust prototype, and for writing the benchmark down
before showing it.

> [!tip] Is the roadmap public?
> A trimmed version, in the changelog, from next quarter.

## June 2025 all-hands, 2025-06-04

June brought 5,613 monthly active riders and a team of 11. The benchmark chart took up most of the meeting.

### Product

#### Shipped

- surface-aware costs in the prototype
- cost model tests
- support ticket dashboard

#### Next

- bike-lane data from a second source
- route summary page

#### Numbers

| Metric | Last month | This month | Change |
| --- | ---: | ---: | ---: |
| Monthly riders | 5,126 | 5,613 | +487 |
| Routes planned | 16,915 | 18,522 | +1,607 |
| Crash-free sessions | 99.7% | 99.8% | +0.1 |

##### Metrics export

```yaml
month: 2025-06
riders: 5613
regions: [benelux, pyrenees]
crash_free: 99.8
```

People and hiring
-----------------

Welcome and thanks: Aiko Tanaka (backend) was thanked for pairing on the cost model; Sam says the tests are hers.

> [!warning] Can we hold the all-hands in the afternoon?
> We tried it. Nobody prefers it. Back to ten.

## Mid-year all-hands, extra session: the Rust engine prototype demo, the benchmark results, hiring for support and QA, the offsite dates, the new office, the on-call rota, the support load, the club ride calendar, the Pyrenees tile refresh, the status page, thanks and apologies for the Friday release, and anything else anyone wrote on the whiteboard

The agenda line is as it was pasted. The all-hands itself was uneventful.

## July 2025 all-hands, 2025-07-02

July brought 6,146 monthly active riders and a team of 12. The second customer success hire started, so Jo has someone
to share the queue with.

### Product

#### Shipped

- bike-lane data from a second source
- route summary page
- faster elevation lookups

#### Next

- closed-road warnings
- Android widget fixes

#### Numbers

| Metric | Last month | This month | Change |
| --- | ---: | ---: | ---: |
| Monthly riders | 5,613 | 6,146 | +533 |
| Routes planned | 18,522 | 20,281 | +1,759 |
| Crash-free sessions | 99.2% | 99.3% | +0.1 |

### People

Welcome and thanks: our second customer success hire joined on the 1st. Jo Becker was thanked for the onboarding doc she
wrote for her.

> [!important] Will we ever do a paid tier?
> Not this year. We want the planner to be good enough that you would, and the club accounts will tell us.

##### A note from the room

A longer message that the notetaker wrote down verbatim, with every step of the story and without trimming, because
the person asked that it be kept exactly: we started with six people and one idea, and every month since then we have
shipped something rideable, sometimes small, sometimes with a lot of ceremony, and that is the whole company in one
sentence.

## August 2025 all-hands, 2025-08-06

August brought 6,730 monthly active riders and a team of 12. Tickets about closed roads doubled; we talked about it for
twenty minutes.

### Product

#### Shipped

- closed-road warnings
- Android widget fixes

#### Next

- club ride calendar
- export to cycling computers

#### Numbers

| Metric | Last month | This month | Change |
| --- | ---: | ---: | ---: |
| Monthly riders | 6,146 | 6,730 | +584 |
| Routes planned | 20,281 | 22,209 | +1,928 |
| Crash-free sessions | 99.3% | 99.4% | +0.1 |

### People

Welcome and thanks: Tomás Ruiz (design) was thanked for the closed-road warning, drawn and shipped in a day.

> [!info] Why is the Android app behind iOS?
> One engineer fewer on that side for two months; the hire fixes it.

## September 2025 all-hands, 2025-09-03

September brought 7,369 monthly active riders and a team of 12. The club ride calendar launched on the same day as the
first club night.

### Product

#### Shipped

- club ride calendar
- export to cycling computers

#### Next

- keyboard shortcuts in the planner
- dark theme for the map

#### Numbers

| Metric | Last month | This month | Change |
| --- | ---: | ---: | ---: |
| Monthly riders | 6,730 | 7,369 | +639 |
| Routes planned | 22,209 | 24,317 | +2,108 |
| Crash-free sessions | 99.4% | 99.5% | +0.1 |

### People

Welcome and thanks: Priya Nair (engineering manager) was thanked for the club night; she brought the chairs.

> [!note] Can I get a day for the volunteer outreach nights?
> Yes, and Sam has already done the paperwork for the first batch.

## October 2025 all-hands, 2025-10-01

October brought 8,070 monthly active riders and a team of 13. The new office wifi was the longest agenda item.

### Product

#### Shipped

- keyboard shortcuts in the planner
- dark theme for the map

#### Next

- support chat in the app
- first contributor guide

#### Numbers

| Metric | Last month | This month | Change |
| --- | ---: | ---: | ---: |
| Monthly riders | 7,369 | 8,070 | +701 |
| Routes planned | 24,317 | 26,631 | +2,314 |
| Crash-free sessions | 99.5% | 99.6% | +0.1 |

##### Metrics export

```yaml
month: 2025-10
riders: 8070
regions: [benelux, pyrenees]
crash_free: 99.6
```

### People

Welcome and thanks: our new engine engineer joined on the 6th. Malik Haddad (data and infra) was thanked for fixing the
office network over a weekend.

#### Checklist for new hires

- [ ] Before day one
  - [x] Laptop ordered
  - [ ] Accounts
    - [ ] Source control
      - [ ] Two-factor set up
      - [x] Added to the team
    - [x] Chat and calendar
  - [ ] Desk and chair
- [ ] First week
  - [ ] Meet the team
  - [ ] Ship something small

> [!tip] What is the plan for the engine?
> Rust, one crate at a time, with benchmarks in CI so we can prove it is faster.

## November 2025 all-hands, 2025-11-05

November brought 8,836 monthly active riders and a team of 13. The first contributor guide went out; nobody has used it
yet.

### Product

#### Shipped

- support chat in the app
- first contributor guide

#### Next

- engine cold-start measurements
- drafts of the two big design decisions

#### Numbers

| Metric | Last month | This month | Change |
| --- | ---: | ---: | ---: |
| Monthly riders | 8,070 | 8,836 | +766 |
| Routes planned | 26,631 | 29,158 | +2,527 |
| Crash-free sessions | 99.6% | 99.7% | +0.1 |

People and hiring
-----------------

Welcome and thanks: Tomás Ruiz (design) was thanked for the diagrams in the contributor guide.

> [!warning] Do we have a security contact?
> Malik, until we hire one. The address is on the status page.

## December 2025 all-hands, 2025-12-03

December brought 9,676 monthly active riders and a team of 13. Priya asked everyone to write down one thing that should
be boring next year.

### Product

#### Shipped

- engine cold-start measurements
- drafts of the two big design decisions

#### Next

- offline-first sync design (ADR 0001)
- route engine in Rust (ADR 0002)

#### Numbers

| Metric | Last month | This month | Change |
| --- | ---: | ---: | ---: |
| Monthly riders | 8,836 | 9,676 | +840 |
| Routes planned | 29,158 | 31,930 | +2,772 |
| Crash-free sessions | 99.7% | 99.8% | +0.1 |

### People

Welcome and thanks: Sam Rivera (staff engineer) was thanked for the two design decision drafts, and everyone who
commented on them.

> [!important] How do I report a customer story?
> Post it in the support channel with a screenshot, and Jo will pick it up.

## January 2026 all-hands, 2026-01-07

January brought 10,595 monthly active riders and a team of 14. The two design decisions were read out loud, one
paragraph each, and nobody objected.

### Product

#### Shipped

- offline-first sync design (ADR 0001)
- route engine in Rust (ADR 0002)

#### Next

- Rust engine behind a flag
- club accounts, second pass

#### Numbers

| Metric | Last month | This month | Change |
| --- | ---: | ---: | ---: |
| Monthly riders | 9,676 | 10,595 | +919 |
| Routes planned | 31,930 | 34,963 | +3,033 |
| Crash-free sessions | 99.2% | 99.3% | +0.1 |

### People

Welcome and thanks: our new platform engineer joined on the 5th. Aiko Tanaka (backend) and Sam were thanked for the two
ADRs.

> [!info] Will offline mode kill battery life?
> We measure it in every release; the target is under 3 percent an hour.

## February 2026 all-hands, 2026-02-04

February brought 11,602 monthly active riders and a team of 14. The Rust engine behind a flag cut the 60 km Alps test
route from eleven seconds to under two.

### Product

#### Shipped

- Rust engine behind a flag
- club accounts, second pass

#### Next

- engine cold-start work
- public API v2

#### Numbers

| Metric | Last month | This month | Change |
| --- | ---: | ---: | ---: |
| Monthly riders | 10,595 | 11,602 | +1,007 |
| Routes planned | 34,963 | 38,286 | +3,323 |
| Crash-free sessions | 99.3% | 99.4% | +0.1 |

##### Metrics export

```yaml
month: 2026-02
riders: 11602
regions: [benelux, pyrenees]
crash_free: 99.4
```

### People

Welcome and thanks: Malik Haddad (data and infra) was thanked for the benchmark rig behind the Rust numbers.

> [!note] Is the roadmap public?
> A trimmed version, in the changelog, from next quarter.

##### A note from the room

A longer message that the notetaker wrote down verbatim, with every step of the story and without trimming, because
the person asked that it be kept exactly: we started with six people and one idea, and every month since then we have
shipped something rideable, sometimes small, sometimes with a lot of ceremony, and that is the whole company in one
sentence.

## March 2026 all-hands, 2026-03-04

March brought 12,704 monthly active riders and a team of 14. This was the offsite month, so the all-hands was a full day
away from the desks.

### Product

#### Shipped

- engine cold-start work
- public API v2
- contributor docs draft

#### Next

- Alps offline maps, scoped
- watch complication, cut

#### Numbers

| Metric | Last month | This month | Change |
| --- | ---: | ---: | ---: |
| Monthly riders | 11,602 | 12,704 | +1,102 |
| Routes planned | 38,286 | 41,923 | +3,637 |
| Crash-free sessions | 99.4% | 99.5% | +0.1 |

### People

Welcome and thanks: the whole team was thanked for the offsite day, and Jo Becker for the picnic.

> [!tip] Can we hold the all-hands in the afternoon?
> We tried it. Nobody prefers it. Back to ten.

### Offsite day, March 2026

The printed agenda, as I copied it off the door:

```text
09:00  Coffee and arrivals
09:20  Welcome, how the day works (Priya)
09:30  The quarter in numbers (Sam)
09:45  Questions on the numbers
10:00  Demo: the Rust engine behind its flag (Sam)
10:10  Demo: club accounts, second pass (Tomás)
10:20  Demo: the queue metrics dashboard (Malik)
10:30  Demo: sync prototype on two phones (Aiko)
10:45  Break
11:00  Scope of 2.3: what is in, what is out (Sam, Priya)
11:20  Route sharing: what a link is (Tomás)
11:35  Route sharing: what a link must never do (Malik)
11:50  Offline sync rewrite in ten minutes (Aiko)
12:00  Questions on the 2.3 scope
12:15  Packing the bikes
12:30  Lunch ride, 25 km easy; the van is for the sceptics
13:45  Lunch, properly
14:00  Hiring: the backend seat and the engine seat (Priya)
14:20  What support hears, and what it cannot answer (Jo)
14:40  On-call rota and the runbooks (Malik)
14:55  Break
15:05  Roadmap vote, three dots each
15:30  Alps tiles: scope it or park it (Sam)
15:45  Offline maps: download size, again (Aiko)
15:55  Watch complication: one last time (Tomás)
16:05  Contributor docs: who owns them (Priya)
16:15  Retro for the quarter, one sticky note each
16:35  Reading the sticky notes aloud
16:50  Dates: the next all-hands, the summer offsite
16:55  Thanks
17:00  Walk to the place by the canal
17:20  Dinner
```

### Roadmap vote

Three dots each, and the votes as counted at the end of the day:

| # | Candidate | Votes | Decision |
| ---: | --- | ---: | :---: |
| 1 | route sharing, with revocation | 14 | yes |
| 2 | offline sync rewrite | 13 | yes |
| 3 | Alps offline maps | 9 | later |
| 4 | gravel profile | 6 | later |
| 5 | watch complication | 3 | no |
| 6 | onboarding for club organisers | 8 | later |
| 7 | documentation for external contributors | 4 | later |
| 8 | public changelog | 2 | no |
| 9 | pay down the tile-cache debt | 5 | later |
| 10 | engine cold-start time, a third less | 9 | yes |
| 11 | fewer support tickets about sharing | 11 | yes |
| 12 | hire the backend engineer | 12 | yes |
| 13 | queue age alert instead of depth | 7 | yes |
| 14 | link expiry in 2.3 | 4 | no |
| 15 | GPX export as a secondary action | 6 | yes |
| 16 | copy-link button first on the share sheet | 10 | yes |
| 17 | map labels in more languages | 5 | later |
| 18 | push notifications for shared routes | 2 | no |
| 19 | shared route comments | 3 | later |
| 20 | read-only club pages | 6 | later |
| 21 | rider profiles | 1 | no |
| 22 | dark theme for the share page | 5 | later |
| 23 | route preview images for links | 8 | later |
| 24 | soak tests before every release | 11 | yes |
| 25 | on-call rota with a second person | 9 | yes |
| 26 | runbooks in one folder | 7 | yes |
| 27 | status page automation | 3 | later |
| 28 | iOS widget for the next ride | 4 | later |
| 29 | Android tablet layout | 1 | no |
| 30 | faster tile downloads on mobile data | 6 | later |
| 31 | weather-aware share text | 1 | no |
| 32 | export to cycling computers, second pass | 5 | later |
| 33 | search by place, fuzzy matching | 4 | later |
| 34 | elevation profile on shared links | 7 | later |
| 35 | multi-language support articles | 3 | later |
| 36 | customer story page | 2 | no |
| 37 | a paid tier for clubs | 5 | later |
| 38 | security contact on the status page | 8 | yes |
| 39 | ride history import, fixes | 3 | later |
| 40 | a quieter release cadence | 6 | later |

Welcome and thanks: a spring intern starts on Monday, and the checklist below is theirs. Jo Becker (customer success)
was thanked for the sharing macros.

#### Checklist for new hires

- [ ] Before day one
  - [x] Laptop ordered
  - [ ] Accounts
    - [ ] Source control
      - [ ] Two-factor set up
      - [x] Added to the team
    - [x] Chat and calendar
  - [ ] Desk and chair
- [ ] First week
  - [ ] Meet the team
  - [ ] Ship something small

> [!warning] Will we ever do a paid tier?
> Not this year. We want the planner to be good enough that you would, and the club accounts will tell us.

## May 2026 all-hands, 2026-05-06

May brought 15,232 monthly active riders and a team of 14. The sync rewrite plan took the whole hour, and nobody minded.

### Product

#### Shipped

- sync rewrite plan
- on-call rota for the sync queue

#### Next

- queue-depth alert
- Rust engine as the default

#### Numbers

| Metric | Last month | This month | Change |
| --- | ---: | ---: | ---: |
| Monthly riders | 13,911 | 15,232 | +1,321 |
| Routes planned | 45,906 | 50,265 | +4,359 |
| Crash-free sessions | 99.6% | 99.7% | +0.1 |

### People

Welcome and thanks: Aiko Tanaka (backend) was thanked for the sync rewrite plan, which fits on two pages.

> [!important] Why is the Android app behind iOS?
> One engineer fewer on that side for two months; the hire fixes it.

## June 2026 all-hands, 2026-06-03

June brought 16,679 monthly active riders and a team of 14. The queue-depth alert had its first false alarm, which Malik
called a success.

### Product

#### Shipped

- queue-depth alert
- Rust engine as the default

#### Next

- sync rewrite, first slice
- route sharing spike

#### Numbers

| Metric | Last month | This month | Change |
| --- | ---: | ---: | ---: |
| Monthly riders | 15,232 | 16,679 | +1,447 |
| Routes planned | 50,265 | 55,040 | +4,775 |
| Crash-free sessions | 99.7% | 99.8% | +0.1 |

##### Metrics export

```yaml
month: 2026-06
riders: 16679
regions: [benelux, pyrenees]
crash_free: 99.8
```

### People

Welcome and thanks: Malik Haddad (data and infra) was thanked for the queue-depth alert and the runbook that goes with
it.

> [!info] Can I get a day for the volunteer outreach nights?
> Yes, and Sam has already done the paperwork for the first batch.

## July 2026 all-hands, 2026-07-01

July brought 18,264 monthly active riders and a team of 14. Route sharing was shown for the first time, with Tomás
clicking through a prototype.

### Product

#### Shipped

- sync rewrite, first slice
- route sharing spike

#### Next

- soak-test harness
- share sheet, first cut

#### Numbers

| Metric | Last month | This month | Change |
| --- | ---: | ---: | ---: |
| Monthly riders | 16,679 | 18,264 | +1,585 |
| Routes planned | 55,040 | 60,271 | +5,231 |
| Crash-free sessions | 99.2% | 99.3% | +0.1 |

### People

Welcome and thanks: Tomás Ruiz (design) was thanked for the share-sheet states, and Jo Becker for testing them with
customers.

> [!note] What is the plan for the engine?
> Rust, one crate at a time, with benchmarks in CI so we can prove it is faster.

## August 2026 all-hands, 2026-08-05

August brought 19,999 monthly active riders and a team of 14. Sam showed the first cut of the share sheet and got
applause.

### Product

#### Shipped

- soak-test harness
- share sheet, first cut
- token endpoint for share links

#### Next

- share sheet behind a flag
- queue metrics dashboard

#### Numbers

| Metric | Last month | This month | Change |
| --- | ---: | ---: | ---: |
| Monthly riders | 18,264 | 19,999 | +1,735 |
| Routes planned | 60,271 | 65,996 | +5,725 |
| Crash-free sessions | 99.3% | 99.4% | +0.1 |

### People

Welcome and thanks: Aiko Tanaka (backend) was thanked for the soak-test harness, which has already found two bugs.

> [!tip] Do we have a security contact?
> Malik, until we hire one. The address is on the status page.

## September 2026 all-hands, 2026-09-02

September brought 21,899 monthly active riders and a team of 14. The retro for last month was short, which is a good
sign. 2.3 is four weeks out.

### Product

#### Shipped

- share sheet behind a flag
- queue metrics dashboard
- tile-cache migration plan

#### Next

- 2.3 release candidate
- sharing links design (ADR 0003)

#### Numbers

| Metric | Last month | This month | Change |
| --- | ---: | ---: | ---: |
| Monthly riders | 19,999 | 21,899 | +1,900 |
| Routes planned | 65,996 | 72,266 | +6,270 |
| Crash-free sessions | 99.4% | 99.5% | +0.1 |

People and hiring
-----------------

Welcome and thanks: Jo Becker (customer success) was thanked for counting the sharing tickets. The backend role is open
and the first interviews are this week.

> [!warning] How do I report a customer story?
> Post it in the support channel with a screenshot, and Jo will pick it up.

##### A note from the room

A longer message that the notetaker wrote down verbatim, with every step of the story and without trimming, because
the person asked that it be kept exactly: we started with six people and one idea, and every month since then we have
shipped something rideable, sometimes small, sometimes with a lot of ceremony, and that is the whole company in one
sentence.

One line the notetaker did not wrap, kept as typed in the shared document during the meeting, because it was a stream of questions and answers read aloud one after the other and nobody stopped to break the line: 2.3 route sharing question answered, offline question answered, pricing question deferred, hiring question answered by Priya, roadmap question answered by Sam, Alps question deferred to Q4, watch question answered with a no.

### 2.3

The 2.3 release is on 30 September. The plan, the risks and the dates are on the
[release note](../projects/kestrel-v2-3.md); route sharing and the offline sync rewrite are the two big things. The
next all-hands will be the first one after it ships.
