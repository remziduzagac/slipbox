# Variable Star Survey — planning document

Working plan for the Variable Star Survey (VSS) at Halden Ridge Observatory. This is the long, messy, living version:
threads of work, the options we looked at, what we decided and what is still open. The tidy summary for the trust board
lives elsewhere; this one keeps the arguments.

Owners, roughly:

- **Ada Okafor** — survey lead, final call on scope.
- **Priya Raman** — halley pipeline, photometry, archive schema.
- **Tomasz Wierzbicki** — Aster, HCAM-2, FW-8, anything with a screwdriver.
- **Rosa Delgado** — night operations, nightjar queue hygiene.
- **Kenji Mori** — visiting, comparison-star sequences and the period analysis.
- **Min-jun Seo** — intern, target list, finding charts, a lot of spreadsheet archaeology.

Related notes: [[operations-handbook]] for the night routine, [[telescope-comparison]] for why Aster does the survey
and Brill does the follow-up, and [[pipeline-cookbook]] for the halley recipes referenced below.

Status as of 2026-03-18: threads 1 and 2 are mostly decided, thread 3 is in pilot, thread 4 is half-built, thread 5 is a
list of worries. 🔭

> The survey is not the telescope and it is not the pipeline. It is the list, and whether we keep observing the list
> for five years without getting bored.
>
> — Ada, kickoff meeting, 2025-11-04

---

## Thread 1 — Target selection

The first thing everyone wanted to argue about was which stars. We started with a scraped list of about 1,900 candidates
from three public catalogues and a pile of amateur reports, and we need to get down to roughly 400 that Aster can reach,
that are bright enough for HCAM-2 in V and I, and that actually vary on timescales we can sample from one ridge. ^thread-one

### Why a fixed list and not a rolling one

We looked at three ways of running the target list:

1. **Fixed list** — choose ~400 stars once, observe them for the life of the survey, add nothing without a board vote.
2. **Rolling list** — keep a core of ~250 and rotate the remaining slots every season based on what looks interesting.
3. **Alert-driven** — a small core plus whatever the outside alert streams flag each week.

The rolling list sounded clever and would have been miserable: every rotation means new comparison stars, new finding
charts and a fresh round of "why is this one noisy". Alerts are fun, and they are what Brill is for.

> If we rotate, in three years we have 900 stars with eighteen months of data each and not one of them tells a story.
>
> — Kenji, target meeting, 2025-11-19

Decision: **fixed list**, with a reserve of 40 "bench" stars that can be promoted only when a core star is dropped for a
documented reason (too faint after all, a bright neighbour, a blend we missed).

### Cuts, in order

Min-jun applied the cuts in this order, which matters because the counts depend on it:

| Step | Cut                                  | Remaining | Notes                                        |
| ---- | ------------------------------------ | --------: | -------------------------------------------- |
| 0    | Merged candidate list                |     1,912 | duplicates resolved by position within 3″    |
| 1    | Declination > −25°                   |     1,406 | Aster below 20° altitude is not worth it     |
| 2    | 8.5 < V < 15.5 at maximum            |       988 | saturation at the bright end, SNR at the faint |
| 3    | No neighbour within 12″ brighter than it |   731 | blends are the silent killer                 |
| 4    | Known period 0.2 d – 400 d, or unknown |     602 | we cannot sample faster than ~20 min cadence |
| 5    | Amplitude > 0.1 mag                  |       447 | smaller is Lyra's problem, not ours          |
| 6    | Hand review of finding charts        |       412 | Min-jun and Kenji, two weekends, much tea    |

The final 412 split as 400 core plus 12 that went straight onto the bench because the charts looked suspicious.

### Classes in the core list

| Class                 | Count | Typical period | Typical amplitude (V) | Cadence we want      |
| --------------------- | ----: | -------------- | --------------------: | -------------------- |
| Mira / long-period    |    96 | 150–400 d      |             2.5–6 mag | every 5–7 nights     |
| Semi-regular          |   112 | 30–150 d       |           0.3–1.5 mag | every 3–4 nights     |
| Eclipsing binary      |    84 | 0.3–10 d       |           0.2–1.2 mag | dense runs at eclipse |
| Cepheid               |    31 | 2–40 d         |           0.4–1.2 mag | nightly              |
| RR Lyrae              |    44 | 0.3–0.9 d      |           0.5–1.1 mag | 20-min runs, 3 h     |
| Unknown / unclassified |   33 | ?              |                ≥0.1 mag | nightly until we know |

#### The unclassified 33

These are the ones Kenji cares about most and the ones most likely to be wrong. Several are probably blends that step 3
missed because the neighbour is faint in V and bright in I. Rule: any unclassified star that has not shown variability
above 0.1 mag after 60 usable nights gets moved to the bench, no discussion.

### Open questions for thread 1

- Do we keep the three stars that are within 40′ of the Moon's path for a week a month, or accept the gaps?
- Is 15.5 at maximum really reachable in I with HCAM-2 in a 120 s exposure at our sky brightness? Tomasz thinks so,
  Priya's first test frames say "barely".
- Who owns the bench? Currently "Min-jun, until September", which is not a plan.

---

## Thread 2 — Calibration

Nobody enjoys this thread and every result depends on it.

### Flats, darks, bias: what we settled on

HCAM-2 is a cooled CCD with a well-behaved dark current at −30 °C, so darks are cheap. Flats are the hard part because
FW-8 has eight positions and the survey uses only V and I, but the other projects use the rest and nobody wants to give
up twilight.

Options considered:

- **Twilight flats every night** — best quality, costs 25–35 minutes of twilight that Meteor Watch and outreach also want.
- **Dome flats with the new LED panel** — repeatable, available in daytime, colour mismatch with the night sky in I.
- **Sky flats built from the survey frames themselves** — free, but needs enough frames per night and masks for stars.

> Dome flats in V, twilight flats in I twice a week, and a sky-flat check in halley every night that shouts if the two
> disagree by more than half a percent. That is the whole policy. Please do not make it cleverer.
>
> — Tomasz, calibration meeting, 2026-01-08

Decision: Tomasz's policy, as quoted. The halley check is described in [[pipeline-cookbook]] under "flat drift".

### Comparison stars

Each target gets three comparison stars and one check star from the same frame. Kenji built the sequences; Priya stores
them in stacks so halley never reads them from a spreadsheet again.

```toml
# comp-sequences/vss-0117.toml — one target, its comparisons and check star
[target]
id = "VSS-0117"
ra = "06:42:18.3"
dec = "+22:15:07"
class = "semi-regular"

[[comparison]]
label = "A"
ra = "06:42:31.9"
dec = "+22:13:51"
v = 11.204
i = 10.388

[[comparison]]
label = "B"
ra = "06:41:58.0"
dec = "+22:17:40"
v = 11.871
i = 11.020

[check]
label = "K"
ra = "06:42:05.2"
dec = "+22:12:26"
v = 12.017
expected_scatter_mmag = 12   # if the check star wanders more than this, the night is suspect, not the target
```

#### Why three comparisons and not an ensemble of twenty

An ensemble is statistically nicer. It is also much harder to debug at 03:00 when one comparison turns out to be a
low-amplitude variable itself, which happened twice in the first month. Three named stars and one check star is small
enough that Rosa can eyeball the light curves of all four during the night.

### Zero points and colour terms

Colour terms are measured on photometric nights from a standard field and stored per filter per season. We re-measure
after anything touches the optical train: a mirror wash, the FW-8 rebuild, the HCAM-2 window cleaning.

Current values (winter 2026, after the mirror wash): V zero point 22.511, colour term −0.029; I zero point 21.990, colour
term +0.015. The wash bought us 0.09 mag in V, which is about what Tomasz promised.

### Open questions for thread 2

- Does the LED dome-flat panel drift with temperature? Tomasz has a logger on it; results due in April.
- Do we need a separate flat set for the two weeks a year the dome slit is misaligned after the winter service?

---

## Thread 3 — Scheduling with nightjar

nightjar is our scheduler: it reads the target list, the cadence rules, the weather from Sable and the seeing from Quill,
and emits a queue that `ridge-ctl` works through. Before the survey it only scheduled outreach and ad-hoc programmes, so
this thread is really "teach nightjar about cadence".

### The problem

With 400 targets and the cadence table from thread 1, a clear night has more requests than it has time. On a typical
winter night Aster gets about 10.5 hours of dark sky; the survey wants roughly 14 hours of it. Something has to lose.

### Three scheduling strategies

We looked at three:

1. **Greedy by urgency** — each target has a "due date" from its cadence; pick the most overdue observable one next.
2. **Block scheduling** — split the night into blocks by class (Miras early, RR Lyrae runs in the middle, and so on).
3. **Nightly optimiser** — solve the whole night at dusk with a proper solver and replan when the weather changes.

Greedy is a week of work and slews a lot; blocks are two weeks and brittle when clouds eat a block; the optimiser is
six weeks or more and nobody could explain its choices at 02:00.

> I have to be able to look at the queue and say why that star is next. If I can't, I'll override it, and then it
> isn't a schedule any more, it's a suggestion.
>
> — Rosa, scheduling meeting, 2026-01-22

Decision: **greedy by urgency**, with one exception: RR Lyrae and eclipse runs are "reservations" that nightjar books
first and greedy fills around. That gives us the protected long runs from option 2 without the brittleness.

### Cadence rules as nightjar sees them

```yaml
# nightjar/rules/vss.yaml
programme: vss
priority_base: 50
filters: [V, I]
rules:
  - class: mira
    every_nights: 6
    grace_nights: 3
    exposure: { V: 60, I: 30 }
  - class: semi-regular
    every_nights: 3
    grace_nights: 2
    exposure: { V: 90, I: 45 }
  - class: cepheid
    every_nights: 1
    grace_nights: 1
    exposure: { V: 90, I: 60 }
  - class: rr-lyrae
    reservation: { length_hours: 3, cadence_minutes: 20, max_per_night: 1 }
    exposure: { V: 120, I: 90 }
  - class: eclipsing
    reservation: { around_ephemeris_minima: true, window_hours: 2.5 }
    exposure: { V: 90, I: 60 }
limits:
  min_altitude_deg: 30
  max_moon_illumination_for_faint: 0.6   # stars fainter than V=14 skip bright-Moon nights
  max_seeing_arcsec: 3.2                 # Quill median over the last ten minutes
```

### Pilot results (February)

We ran nightjar with these rules for 19 nights in February. Twelve were usable.

| Metric                                | Target | Pilot result | Comment                                                     |
| ------------------------------------- | -----: | -----------: | ----------------------------------------------------------- |
| Targets observed on cadence           |   90 % |         71 % | Miras fine; semi-regulars behind after the cloudy week      |
| RR Lyrae runs completed               |     12 |            9 | three cut short by cloud, one by a dome fault               |
| Mean slew per exposure (s)            |   < 40 |           52 | greedy wanders across the meridian; see below               |
| Nights Rosa overrode the queue        |      0 |            3 | twice for a bright Moon edge case, once for a satellite pass |
| Queue replans per night (median)      |      — |            7 | mostly weather; fine                                        |

#### Slew overhead

Greedy picks the most overdue star regardless of where it is, so the telescope zig-zags. A cheap fix: when two
candidates are within 10 % of each other in urgency, prefer the nearer one. Min-jun prototyped it:

```python
def pick_next(candidates, pointing, now):
    """Choose the next target: most overdue first, but break near-ties by slew distance."""
    ranked = sorted(candidates, key=lambda c: c.urgency(now), reverse=True)
    best = ranked[0]
    close = [c for c in ranked if c.urgency(now) >= 0.9 * best.urgency(now)]
    return min(close, key=lambda c: slew_seconds(pointing, c.position(now)))
```

The replay itself is one query against stacks and one halley command:

```sql
SELECT night, count(*) AS frames, avg(slew_s) AS mean_slew FROM frame WHERE night >= '2026-02-01' GROUP BY night;
```

Early numbers from replaying the February logs: mean slew down from 52 s to 37 s, on-cadence fraction unchanged. Not yet
merged; Rosa wants a week of live nights with it first.

### Open questions for thread 3

Short ones first:

- Friday outreach.
- Bright Moon.
- Satellites.

In full:

- How does nightjar share Aster with outreach evenings? Lena needs the first two hours on Fridays from April to September.
- Should bright-Moon nights switch the whole survey to I only, rather than skipping faint targets?
- The satellite-pass override: is it worth teaching nightjar about it, or is Rosa's judgement cheaper?

---

## Thread 4 — The halley pipeline

halley already reduced single frames for other projects. For the survey it needs to do differential photometry at scale,
keep every measurement traceable back to its raw frame, and write to stacks without anyone copying CSV files around.

### What landed so far

- Calibration stage reads the policy from thread 2 and records which flat, dark and bias it used for every frame.
- Aperture photometry with three apertures per star (2.0, 2.5, 3.0 × FWHM); the middle one is the default.
- Differential magnitudes against the three named comparisons, with the check star's residual stored alongside.
- A nightly report e-mailed to the survey list: frames in, frames rejected and why, stars measured, flat-drift status.
- Writes to stacks in one transaction per night, so a crash leaves nothing half-written.

### The nightly run

The night-stop script on `ridge-ctl` kicks halley on `ridge-arch` once the dome is closed:

```sh
#!/bin/sh
# night-stop.sh — close up, then hand the night to halley (runs as the obs user on ridge-ctl)
set -eu
NIGHT=$(date -u -d '12 hours ago' +%Y-%m-%d)
RAW=/data/raw/$NIGHT

nightjar queue --close --reason "night-stop"
rsync -a --partial "$RAW/" "ridge-arch:/archive/raw/$NIGHT/"
ssh ridge-arch "halley run --programme vss --night $NIGHT --config /etc/halley/vss.toml --report survey@example.org"
echo "night-stop: handed $NIGHT to halley at $(date -u +%H:%M)Z" | logger -t night-stop
```

### Schema in stacks

| Table            | Rows (Mar 2026) | Key                              | What it holds                                                         |
| ---------------- | --------------: | -------------------------------- | --------------------------------------------------------------------- |
| `frame`          |          38,204 | `frame_id`                       | one row per raw exposure, with filter, airmass, Quill seeing, Sable humidity |
| `calibration`    |          38,204 | `frame_id`                       | which master flat, dark and bias were applied                         |
| `measurement`    |         611,520 | `(frame_id, star_id, aperture)`  | instrumental magnitudes and errors                                    |
| `diff_mag`       |         203,840 | `(frame_id, star_id)`            | differential magnitude, check-star residual, quality flag             |

#### Traceability rule

Every row in `diff_mag` must be reproducible from the raw frame and the config hash stored with it. Priya's test: pick
ten random rows each month, rerun halley on their frames from scratch, compare to the stored values to 1 mmag. Two months
passed; the third found an airmass rounding bug that was, happily, ours and not the physics.

### Light-curve storage

Measurements plus a cache keyed by star and config hash: fast, and a stale cache is obvious because the hash changes.
Details are in [[pipeline-cookbook]] under "light-curve cache".

### Known issues

A typical bad line from the nightly report, for reference:

```text
2026-03-04T02:17:44Z halley.reject frame=38112 star=VSS-0231 reason=psf_elongated fwhm=3.9 ell=0.31 after_filter_change=62s
```

- Frames taken during the first 90 s after a filter change sometimes have a slightly elongated PSF; halley flags them but
  does not yet drop them. Suspect FW-8 settling. Tomasz is looking at the wheel's detent spring.
- The nightly report says "0 rejected" when the rejection step crashes, which is the wrong kind of optimism.
- Stars near the chip edge get the wrong aperture on nights when the guider drifts more than 8 px; roughly 0.4 % of rows.

### Open questions for thread 4

- Do we reprocess the whole survey when the colour terms change, or only apply a correction on read?
- Who is on call for halley when Priya is away? Right now the honest answer is "nobody, and it waits".

---

## Thread 5 — Publishing

The trust's charter says the data is public. That is easy to agree with and a lot of work to do properly.

### What we publish, and when

| Product                    | Audience            | Format                  | Cadence              | Embargo  | Where                                  |
| -------------------------- | ------------------- | ----------------------- | -------------------- | -------- | -------------------------------------- |
| Nightly summary plot       | public, volunteers  | PNG on the public site  | every morning        | none     | `ridge-web`, the "last night" page     |
| Light curves (V, I)        | researchers         | CSV + JSON              | monthly              | 3 months | https://data.example.org/hro/vss/      |
| Full measurement table     | researchers         | Parquet                 | yearly data release  | 6 months | https://data.example.org/hro/vss/dr/   |
| Period catalogue           | researchers, public | CSV + short paper       | at DR2 and DR4       | none     | the trust's report series              |

The longest disagreement in the whole planning process, preserved because we will have it again next year when someone new joins the team and asks why the embargo exists at all:

| Position | Argued by | Argument | Outcome |
| --- | --- | --- | --- |
| No embargo at all | Lena | the public paid for the telescope, volunteers take half the data, and an embargo looks like we have something to hide from the good people of the town of Marrowby, who can see the dome from the high street | rejected |
| Three-month embargo | Priya | time to catch calibration mistakes first; a wrong public light curve is worse than a late one | adopted |
| Six-month embargo | Kenji | the period catalogue needs a full season before anyone else fits it | rejected |

> I lost the argument and I still think the nightly plot being public from day one is the most useful thing we do.
>
> — Lena, publishing meeting, 2026-02-12

### README that ships with every release

````markdown
# HRO Variable Star Survey — data release

Photometry of 400 variable stars from Halden Ridge Observatory, Aster 0.61 m + HCAM-2, filters V and I.

## Files

- `lightcurves/VSS-NNNN.csv` — one file per star: `bjd, filter, mag, err, flag`
- `measurements.parquet` — every differential measurement, with frame and config hashes

## Flags

| Flag | Meaning                               |
| ---- | ------------------------------------- |
| 0    | good                                  |
| 1    | check-star residual above threshold   |
| 2    | near chip edge, aperture uncertain    |

Questions: survey@example.org. Please cite the release DOI, not this README.
````

### Open questions for thread 5

- A DOI for each release: which of the free services, and who signs up for the account on behalf of the trust?
- Do we publish the bench stars too? They are data, but they are data we decided not to trust.
- Yusuf asked whether volunteers who take data should be named as co-authors on the catalogue. Ada says yes, in some
  form; we need a rule before DR1, not after.

---

## Risks

- HCAM-2 cooler fails — spare cooler head on the shelf; swap is a day.
- Priya away for a month — on-call rota for halley, and document the nightly run.
- Dunmore refurbishment eats Tomasz — survey work gets Tuesdays, written down.
- Streetlights brighten the sky — Dark Sky Campaign; monthly sky brightness from Tern.
- Volunteer fatigue — shorter shifts, a better queue, fewer 03:00 overrides.

⚠️ The last row is the one that ends surveys. Every other risk is hardware.

## Timeline

- 2025-11 — kickoff, target cuts.
- 2025-12 — comparison sequences for the first 200 stars.
- 2026-01 — calibration policy, nightjar strategy chosen.
- 2026-02 — nightjar pilot, halley writes to stacks.
- 2026-03 — full 400-star sequences, slew tie-break under test.
- 2026-04 — survey start, officially; everything before is "commissioning".
- 2026-10 — DR0 internal release, embargo clock starts.
- 2027-01 — DR1 public.

## Meeting log, abbreviated

### 2026-02-26

Present: Ada, Priya, Tomasz, Rosa, Kenji, Min-jun.

> Rosa: the queue is fine. What I need is for it to tell me when it gave up on something.
>
> Priya: halley can tell you that in the morning.
>
> Rosa: in the morning I am asleep.

Actions:

- Priya: nightjar writes a "dropped" line to the night log whenever a target misses its grace window.
- Tomasz: FW-8 detent spring, before the April start.
- Min-jun: finding charts for the last 38 stars.
- Kenji: period search on the first 60 nights of the Cepheids, as a sanity check on timing.

### 2026-03-12

Present: Ada, Priya, Rosa, Lena, Yusuf.

> Yusuf: the volunteers want to know which star they are looking at, not just that the queue is running.
>
> Lena: we can put the current target and its light curve on the pavilion screen. It is the best outreach we have.

Actions:

- Lena and Priya: "now observing" panel on the pavilion screen, fed from nightjar's current queue entry.
- Ada: co-authorship rule for volunteers, draft by the end of April.

## Compose order (what to finish before April)

1. FW-8 settling fix — everything downstream is cleaner with it.
2. The "dropped" log line in nightjar — cheap, and Rosa asked twice.
3. Slew tie-break, after a week of live nights.
4. halley's rejection-step crash reporting.
5. The volunteer co-authorship rule. ✅ once it is written down, not before.

Anything not on this list waits until after the first month of the real survey.

Related: #dome/shutter (the refit sets our first observing season) and #survey/planning.
