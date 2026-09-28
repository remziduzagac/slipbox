# Halden Ridge Observatory — Operations Handbook

Numbered log of operational decisions and standing procedures. Add a new entry when a choice is
made or revisited; never renumber. Superseded entries stay, marked, so the reasoning survives.

## O1: One handbook, one numbered log (2025-02)

**Decision:** Every operational decision lives in this file as a numbered entry, `O1` onward.
**Why:** Before this, decisions were scattered across the workshop whiteboard, three
spreadsheets and Tomasz's memory. A single log is searchable and diffable, and new volunteers
can read it front to back on a cloudy night (there are plenty).

**Consequences:** Entries are never renumbered. A reversed decision gets a new entry and the
old one gets a "superseded by" note at the top.

## O2: Night assistant owns the night (2025-02)

**Decision:** The night assistant on shift has final say over whether the dome opens, closes
or stays shut, regardless of who else is on site.
**Why:** Visiting astronomers are, understandably, keen. The night assistant is the one who has
watched the Sable readings all afternoon and knows the dome's quirks.

**Consequences:** Rosa Delgado, as senior night assistant, trains every new assistant on the
same checklist (O4). Directors and engineers defer on the night; they argue about it at the
Monday meeting instead.

## O3: Observatory time is UTC, everywhere (2025-02)

**Decision:** All logs, file names, schedules and FITS headers use UTC. Local time appears only
on the public events calendar.
**Why:** Marrowby observes daylight saving; the sky does not. Two sessions in 2024 were logged an
hour off and a variable star light curve grew a mysterious step.

## O4: The opening checklist (2025-03)

**Decision:** Opening the Main Dome follows a fixed checklist, read aloud when two people are
present and ticked in the night log when alone.
**Why:** The dome is 5.2 m of steel with a slit that does not care about your fingers.

The checklist, in order:

- Confirm Sable reports humidity below 85 % and wind below 12 m/s (gusts below 18 m/s).
- Check the Tern all-sky frame for cloud on the horizon upwind.
- Confirm no one is on the catwalk or inside the dome ring.
- Power on the dome controller and wait for the green READY lamp.
- Unlock the slit, open to 25 %, pause ten seconds, listen.
- Open fully. If the shutter motor stutters, close and log it.
- Uncover Aster's primary mirror only after the dome has equalised for 20 minutes.
- Start the Quill seeing monitor and note the first FWHM value in the log.
- Start nightjar with the night's plan (O14).
- Write the opening time and initials in the night log.

> Rule of thumb from Rosa: if you had to read Sable twice to convince yourself, the answer is no.

## O5: The closing checklist (2025-03)

**Decision:** Closing mirrors opening, in reverse, with two additions: park the telescope before
the slit moves, and confirm the dome heater is off.
**Why:** In November 2024 the heater ran for four days and the Main Dome smelled like toast.

- Stop nightjar gracefully (`nightjar stop --drain`), wait for the current exposure to finish.
- Park Aster at the zenith-park position.
- Cover the primary mirror.
- Close the slit, then rotate the dome to the home position.
- Confirm the dome heater lamp is off.
- Stop Quill.
- Run the end-of-night script (O12).
- Write the closing time and initials in the night log.

## O6: Weather limits are numbers, not moods (2025-03)

**Decision:** Hard weather limits are written down and enforced by the dome controller where it
can; the night assistant enforces the rest.
**Why:** "It looked fine" is not a data point.

| Parameter        | Open allowed   | Close immediately | Source           |
| ---------------- | -------------- | ----------------- | ---------------- |
| Humidity         | < 85 %         | ≥ 90 %            | Sable            |
| Wind (sustained) | < 12 m/s       | ≥ 15 m/s          | Sable            |
| Wind (gust)      | < 18 m/s       | ≥ 20 m/s          | Sable            |
| Rain sensor      | dry            | any wet reading   | Sable            |
| Cloud (all-sky)  | < 40 % covered | > 70 % covered    | Tern             |
| Dew point margin | > 3 °C         | < 1.5 °C          | Sable (computed) |
| Seeing (FWHM)    | any            | n/a               | Quill            |

**Consequences:** The controller closes the slit on its own when rain or humidity cross the
close line. It does not know about cloud; the night assistant does.

## O7: Sable is the weather source of truth (2025-03)

**Decision:** When the Sable station disagrees with a phone weather app, Sable wins.
**Why:** Sable sits on the mast 12 m from the dome. The phone forecast is for Marrowby, 400 m
lower and in a valley that makes its own fog.

**Consequences:** If Sable is offline, the dome stays shut. There is no "use the phone" fallback.

## O8: Two-person rule for the catwalk (2025-04)

**Decision:** Nobody goes onto the outer catwalk alone, day or night.
**Why:** It is 7 m up, it is often icy, and the handrail was installed in 1987.

## O9: Control PC is `ridge-ctl`, and only it moves hardware (2025-04)

**Decision:** Only `ridge-ctl` sends commands to the mount, the dome and the filter wheel.
Laptops may view, but never drive.
**Why:** Two clients once commanded the mount at the same time. The mount chose neither.

**Consequences:** Remote observers connect to `ridge-ctl` through the gateway (O22), not
directly to hardware. The hardware serial ports are bound to `ridge-ctl` in the udev rules.

## O10: Host roles (2025-04)

**Decision:** Three hosts, each with one job.

| Host        | Role                                   | Location                 | Backed up by |
| ----------- | -------------------------------------- | ------------------------ | ------------ |
| `ridge-ctl` | Drives hardware, runs nightjar         | Main Dome control room   | `ridge-arch` |
| `ridge-arch`| Archive (stacks), halley reductions    | Server Room              | offsite disk |
| `ridge-web` | Public site, events calendar, webcam   | Server Room              | `ridge-arch` |

**Why:** When the public site and the archive shared a machine, a busy open-night webcam page
slowed the reductions to a crawl.

## O11: Start-of-night script (2025-04)

**Decision:** A single script prepares `ridge-ctl` for the night. It is idempotent: running it
twice is harmless.
**Why:** The old procedure was eleven manual steps, and step seven was frequently forgotten.

```sh
#!/bin/sh
# night-start.sh — prepare ridge-ctl for observing. Safe to re-run.
set -eu
NIGHT=$(date -u +%Y%m%d)
DATA=/data/raw/$NIGHT
mkdir -p "$DATA"
halley-cooler --target -25 --wait 600 || { echo "HCAM-2 did not reach -25 C in 10 min; check the chiller and the log before observing" >&2; exit 1; }
fw8 home && fw8 select clear
quill start --log /var/log/quill/$NIGHT.log
nightjar check-plan /etc/nightjar/plans/$NIGHT.toml
echo "night $NIGHT ready at $(date -u +%H:%M) UTC"
```

**Consequences:** If the cooler step fails, the script stops. That is on purpose.

## O12: End-of-night script (2025-04)

**Decision:** The end-of-night script copies raw frames to `ridge-arch`, verifies checksums, and
only then marks the night as transferred.
**Why:** A raw frame that exists in one place does not exist.

```sh
#!/bin/sh
# night-end.sh — ship the night's raw data to the archive and verify it.
set -eu
NIGHT=${1:-$(date -u -d '12 hours ago' +%Y%m%d)}
SRC=/data/raw/$NIGHT
rsync -a --checksum "$SRC/" "ridge-arch:/archive/incoming/$NIGHT/"
ssh ridge-arch "cd /archive/incoming/$NIGHT && sha256sum -c MANIFEST.sha256" || exit 2
ssh ridge-arch "stacks-ingest --night $NIGHT --source aster --instrument hcam2 --notify ops@example.org --on-failure=keep-raw"
touch "$SRC/.transferred"
```

Raw frames stay on `ridge-ctl` for 14 days after `.transferred` appears, then a cron job removes
them. Fourteen, not seven, because of the Easter 2025 incident (O31).

## O13: Night log format (2025-05)

**Decision:** The night log is a plain text file per night, one line per event, UTC timestamp
first.
**Why:** It gets read at 04:00 by a tired person and grepped at 14:00 by a curious one. Plain
text serves both.

Each line looks like:

```text
2025-05-14T21:42Z RD  open   dome open, Sable 71% 4.2m/s, Quill FWHM 1.9"
2025-05-14T21:44Z RD  note   Kenji on remote via gateway, observing VSS field 112
2025-05-14T23:10Z RD  warn   humidity rising 82%, watching
2025-05-15T00:03Z RD  close  humidity 90%, controller closed slit, confirmed manually
```

The second column is initials, the third is one of `open`, `close`, `note`, `warn`, `fault`.

## O14: nightjar plans are files, reviewed like code (2025-05)

**Decision:** Each night's observing plan is a TOML file under `/etc/nightjar/plans/`, kept in the
`ridge-ops` repository and reviewed by a second person before 17:00 UTC on the day.
**Why:** A typo in a plan once pointed Aster at the Sun's position for "twilight flats". The
safety interlock caught it. We would rather catch it at review.

```toml
# /etc/nightjar/plans/20250514.toml
[night]
date      = "2025-05-14"
observer  = "RD"
telescope = "aster"
camera    = "hcam2"

[[block]]
name     = "vss-field-112"
program  = "VSS"
filters  = ["V", "R"]
exposure = 90
repeats  = 12
priority = 2

[[block]]
name     = "twilight-flats-dawn"
kind     = "flat"
filters  = ["B", "V", "R", "I"]
sun_alt  = [-10.0, -4.0]   # degrees; the interlock refuses anything above -3.0 regardless of what this file says
```

**Consequences:**

- nightjar refuses a plan with no `observer`.
- A plan not merged by 17:00 falls back to the standing VSS plan.
- Visiting astronomers submit plans through Priya, who reviews them with the visitor, not for
  them.

## O15: The standing VSS plan (2025-05)

**Decision:** When nothing else is scheduled, Aster runs the Variable Star Survey standing plan.
**Why:** Four hundred variable stars do not observe themselves, and an idle telescope on a clear
night is the most expensive thing on the ridge.

The standing plan rotates through fields by cadence class:

| Cadence class | Stars | Revisit       | Filters     | Typical exposure |
| ------------- | ----- | ------------- | ----------- | ---------------- |
| Fast          | 38    | every night   | V           | 30 s             |
| Medium        | 141   | every 3 days  | V, R        | 60 s             |
| Slow          | 196   | every 10 days | B, V, R     | 90 s             |
| Calibration   | 27    | every night   | B, V, R, I  | 20 s             |

## O16: Filter wheel slots are fixed (2025-05)

**Decision:** The FW-8 slot assignment does not change without an entry here.
**Why:** halley maps slot numbers to filter names from a config file. Swapping filters physically
without updating the config gives you beautiful H-alpha frames labelled "U".

| Slot | Filter  | Notes                                                  |
| ---- | ------- | ------------------------------------------------------ |
| 1    | U       | Low throughput; long exposures only                    |
| 2    | B       |                                                        |
| 3    | V       | Primary survey filter                                  |
| 4    | R       |                                                        |
| 5    | I       | Fringing on HCAM-2 above 800 nm; halley defringes      |
| 6    | H-alpha | 7 nm bandpass                                          |
| 7    | OIII    | 8.5 nm bandpass                                        |
| 8    | clear   | Focus and pointing only, never science                 |

### Swapping a filter

1. Log the intent in the night log with `note`.
2. Park Aster, home FW-8, power it down.
3. Swap the filter, wearing gloves, holding it by the cell.
4. Update `/etc/halley/filters.toml` and commit it to `ridge-ops`.
5. Power FW-8 up and take one clear-sky test frame in the new slot.
6. Add a line to this entry with the date and your initials.

## O17: Calibration frames every night (2025-06)

**Decision:** Every observing night gets bias, dark and flat frames, even if the science was
washed out.
**Why:** Calibrations are cheap, stable-ish, and the only way to notice a failing cooler before
it ruins a month of photometry.

- 21 bias frames at start of night.
- 11 darks at each science exposure length used, taken at end of night.
- Twilight flats in each filter used, dusk or dawn, whichever is clear.
- If both twilights are cloudy, dome flats against the flat-field screen; mark them `dome=1`.

> Dome flats are a last resort. They are consistently 2 % off twilight flats in B, and nobody
> has worked out why. Priya's bet is the screen lamp; Tomasz's bet is the screen.

## O18: halley versions are pinned per season (2025-06)

**Decision:** The pipeline version used for reductions is pinned at the start of each observing
season (September) and only patch releases go in mid-season.
**Why:** A mid-season change to the aperture photometry code shifted every magnitude by 0.004.
Small, real, and very annoying to explain in a paper.

**Consequences:** Feature work on halley happens on a branch and lands between seasons. Priya
keeps a changelog on the archive host; the latest release notes are also mirrored at
https://example.org/halley/releases for visiting astronomers.

## O19: Archive layout on `ridge-arch` (2025-06)

**Decision:** The archive is organised by night, then telescope, then instrument.
**Why:** Most questions are "what happened on the night of…". Organising by target made that
question a query; organising by night makes it `ls`.

```text
/archive/
  incoming/<YYYYMMDD>/            # raw, as shipped by night-end.sh
  raw/<YYYYMMDD>/<telescope>/<instrument>/
  reduced/<YYYYMMDD>/<telescope>/<instrument>/
  calib/<YYYYMMDD>/master_{bias,dark_<exp>,flat_<filter>}.fits
  catalogue/                      # stacks database dumps, nightly
  public/                         # anything the outreach site may show
```

## O20: stacks database backups (2025-07)

**Decision:** The stacks PostgreSQL database is dumped nightly at 12:00 UTC and copied to the
offsite disk every Sunday.
**Why:** Noon is the quietest hour on the ridge: nobody observing, nobody reducing, the visitor
pavilion still shut.

- Nightly: `pg_dump` to `/archive/catalogue/`, kept 30 days.
- Weekly: the Sunday dump goes to the offsite disk in the director's office in Marrowby.
- Quarterly: Priya restores one dump to a scratch database and runs the consistency checks.

> A backup you have never restored is a rumour.

## O21: Dunmore stays off the network during refurbishment (2025-07)

**Decision:** The 0.4 m Dunmore Newtonian is not connected to `ridge-ctl` or the observatory
network until the refurbishment is signed off.
**Why:** Half-rebuilt mounts do surprising things when a scheduler finds them.

**Consequences:** Dunmore test runs use a laptop on the workshop bench network, which is
physically separate.

## O22: Remote access through one gateway (2025-07)

**Decision:** All remote access goes through a single gateway host with per-person keys. There is
no VPN to the hardware network.
**Why:** Visiting astronomers log in from hotel Wi-Fi on four continents. One door is easier to
watch than several.

### The gateway client block

Remote observers add this to their SSH client configuration. The gateway name is a placeholder
here; the real one is in the welcome pack.

```text
# Halden Ridge — remote observing. Replace the key path with your own.
Host hro-gw
    HostName gw.example.invalid
    User observer
    IdentityFile ~/.ssh/hro_ed25519
    IdentitiesOnly yes
    ServerAliveInterval 30

Host ridge-ctl
    ProxyJump hro-gw
    User observer
    LocalForward 5901 localhost:5901   # the nightjar status display; view-only unless the night assistant grants control
```

### Who gets a key

- Staff: permanent key, reviewed each January.
- Visiting astronomers: a key valid for their allocation plus three days.
- Students: a key valid for their placement, view-only on the scheduler.
- Volunteers: no remote key; they observe on site with a night assistant.

### Revoking a key

1. Remove the public key from the gateway's `authorized_keys`.
2. Log the revocation in `ridge-ops/access.md` with the date and reason.
3. Tell the person, politely, even if they already know.

## O23: Public webcam delays by ten minutes (2025-08)

**Decision:** The public webcam on `ridge-web` shows images from the Tern all-sky camera with a
ten-minute delay, and never shows the inside of the dome.
**Why:** The delay stops the webcam being used to time visits to the car park at night. The dome
rule stops it showing people's faces while they work.

## O24: Visitor Pavilion open nights (2025-08)

**Decision:** Open nights run on the first and third Friday of each month, weather permitting,
with Corvid on the pavilion terrace.
**Why:** Lena Hofstetter's surveys found Fridays beat Saturdays for families and Saturdays beat
Fridays for couples; Fridays won by eleven votes.

| Item                  | Detail                                                     | Owner   | Fallback if cloudy                 |
| --------------------- | ---------------------------------------------------------- | ------- | ---------------------------------- |
| Telescope             | Corvid on the terrace, Brill in the roll-off for groups    | Lena    | Planetarium show on the projector  |
| Maximum visitors      | 60 booked, 10 walk-in                                      | Lena    | Same                               |
| Staff on site         | 1 night assistant, 2 volunteers, 1 outreach lead           | Rosa    | 1 volunteer may go home early      |
| Booking               | Through the events calendar on the public site             | Lena    | Email everyone by 16:00 local      |
| Red torches           | Handed out at the door, collected at the door              | Yusuf   | Same, fewer of them go missing     |

> Visitors will point white phone torches at the terrace. Smile, hand them a red one, repeat.

## O25: Documentation categories

**Decision:** Observatory documentation falls into four categories, each with a home: this
handbook (decisions and standing procedures), runbooks (step-by-step for one task), logs (what
happened), and ideas (what might happen one day).
**Why:** The workshop wiki had become a single page titled "Stuff", 14,000 words long, with the
dome motor wiring diagram between a cake rota and a list of meteor showers.

### What goes where

| Category  | Home                     | Changes when                         | Example                                  |
| --------- | ------------------------ | ------------------------------------ | ---------------------------------------- |
| Handbook  | this file                | a decision is made or reversed       | O6 weather limits                        |
| Runbooks  | `runbooks/`              | the procedure changes                | Replacing the dome shutter belt          |
| Logs      | `logs/` and night logs   | every night, every maintenance visit | 2025-05-14 night log                     |
| Ideas     | `ideas/`                 | whenever someone has one             | A second all-sky camera on the roll-off  |

### Why ideas are separate from runbooks

An idea that sits in the runbooks folder looks like a procedure. In March 2025 a volunteer found
an "idea" note describing how one *might* realign Brill's finder and followed it, step by step,
on a night when nobody had checked whether the idea worked. It did not. Ideas now live in their
own folder with a banner at the top of each: "Not a procedure. Do not follow."

### Why the handbook links out rather than inlining runbooks

A handbook entry says *what we decided and why*. A runbook says *how*. When the how changes (a
new belt supplier, a different torque value), the decision usually does not. Keeping them apart
means changing a torque value does not rewrite history.

### Naming

- Handbook entries: `O<number>: <short title>`, the number never reused.
- Runbooks: verb first, `replace-shutter-belt.md`, `realign-brill-finder.md`.
- Logs: date first, `2025-05-14-night.md`, `2025-06-02-dunmore-bench.md`.
- Ideas: noun first, `second-allsky-camera.md`.

## O26: Meteor Watch detections are auto-filed, human-confirmed (2025-08)

**Decision:** The Tern all-sky camera's detection software files candidate meteors automatically
into stacks, but nothing is published until a human confirms it.
**Why:** In its first week Tern "detected" 212 meteors, 190 of which were aircraft, 14 were a
moth, and 8 were meteors. The moth has since been named Gerald.

| Candidate type    | Auto-filed | Human review needed | Publishable |
| ----------------- | ---------- | ------------------- | ----------- |
| Single-frame streak | yes      | yes                 | after review |
| Multi-frame track | yes        | yes                 | after review |
| Blinking track    | no         | n/a                 | never (aircraft) |
| Slow blob         | no         | n/a                 | never (insect, cloud, Gerald) |

## O27: Dark Sky Campaign data is shared openly (2025-09)

**Decision:** Sky brightness readings taken for the Dark Sky Campaign are published as open data
every month, raw and uncorrected, alongside a plain-language summary for the Marrowby council.
**Why:** The council asked for "the numbers, not your interpretation". Fair.

The summary follows a fixed template so month-to-month comparisons are easy. See
[the campaign page](https://example.org/dark-sky/marrowby) for the published months.

> Ada, at the September meeting: "If the numbers go the wrong way, we publish those too. Especially
> those."

## O28: Dunmore refurbishment milestones (2025-09)

**Decision:** The Dunmore refurbishment is tracked as fixed milestones, each signed off by the
chief engineer before the next starts.
**Why:** Refurbishments expand to fill the workshop. Milestones give them edges.

| Milestone | Scope                                                      | Status (2026-01) | Signed off |
| --------- | ---------------------------------------------------------- | ---------------- | ---------- |
| M1        | Strip, inspect, catalogue every part                       | done             | TW 2025-10 |
| M2        | Re-aluminise primary and secondary mirrors                 | done             | TW 2025-12 |
| M3        | New drive motors and encoders on both axes                 | in progress      |            |
| M4        | Bench tests on the workshop network (O21)                  | not started      |            |
| M5        | Install in the East Roll-off, first light                  | not started      |            |
| M6        | Connect to `ridge-ctl`, add to nightjar                    | not started      |            |

## O29: Workshop tool sign-out (2025-09)

**Decision:** Tools that leave the workshop are signed out on the clipboard by the door.
**Why:** The torque wrench spent six weeks in the boot of a volunteer's car.

- Hand tools: sign out if leaving the building.
- Power tools: sign out always, even to the car park.
- Optical tools (collimators, the Cheshire eyepiece, the laser): sign out always, return the same
  day.
- The good screwdrivers: ask Tomasz. He will say no. Ask anyway.

## O30: Collimation schedule (2025-10)

**Decision:** Aster is collimated every three months and after any mirror cleaning; Brill before
every outreach season; Corvid never (it is a refractor, and it would be rude).
**Why:** Aster's star images drifted from round to comet-shaped between checks when the interval
was six months.

## O31: The Easter 2025 incident — why raw data stays 14 days (2025-10)

**Decision:** Raw frames stay on `ridge-ctl` for 14 days after transfer instead of 7.
**Why:** Over the Easter weekend of 2025 the archive's incoming disk filled silently. The
end-of-night script's checksum verification failed, but the failure email went to a mailbox
nobody reads over a bank holiday. Seven days later the cleanup job deleted the originals of two
nights that had never been ingested.

### What we changed

1. Cleanup waits 14 days, not 7.
2. Cleanup only removes a night if `.transferred` exists *and* stacks confirms the ingest.
3. The failure email goes to `ops@example.org`, which forwards to the on-call phone.
4. The archive disk alarm triggers at 80 %, not 95 %.

### What we did not change

The two lost nights were mostly cloudy. We are grateful to the cloud, which is not a sentence
anyone at an observatory expects to write.

> The rule that came out of it: every automatic deletion must check two independent facts before
> it deletes anything.

## O32: Emergency contacts board (2025-10)

**Decision:** A laminated emergency contacts board hangs in the control room, the workshop and the
pavilion. Phone numbers are not reproduced anywhere else in this handbook.
**Why:** Phone numbers in a document drift out of date and then get trusted.

## O33: Lyra spectrograph scheduling (2025-11)

**Decision:** Lyra is mounted on Aster only on nights allocated as spectroscopy nights, at most
six per month, and never on open-night Fridays.
**Why:** Swapping HCAM-2 for Lyra takes 90 minutes and a steady hand. Doing it on a night with
sixty visitors on the terrace has been tried once.

### Spectroscopy night allocations, first half of 2026

| Month    | Nights                  | Primary user      | Target list                                  |
| -------- | ----------------------- | ----------------- | -------------------------------------------- |
| January  | 8, 9, 22, 23            | Kenji Mori        | Be stars, bright novae if any                |
| February | 5, 6, 19, 20            | Priya Raman       | VSS calibration spectra                      |
| March    | 5, 6, 12, 26            | Kenji Mori        | Be stars, follow-up of January targets       |
| April    | 2, 9, 16, 30            | Min-jun Seo       | Student project: symbiotic stars             |
| May      | 7, 14, 28               | open call         | To be allocated in March                     |
| June     | none                    | n/a               | Short nights; HCAM-2 only                    |

## O34: Visiting astronomers get a buddy (2025-11)

**Decision:** Every visiting astronomer is paired with a staff buddy for the length of their
visit.
**Why:** Kenji Mori's first visit from the Kiso-Hara Astronomical Society went fine, but he spent
his first evening looking for the kettle, the fuse box and, eventually, anyone.

The buddy:

- Meets the visitor at the Marrowby bus stop or the car park.
- Walks them through O4, O5 and O8 in person.
- Shows them the kettle.
- Checks in daily, and at least once during their first night.

## O35: Intern projects are real projects (2025-12)

**Decision:** Student interns work on something the observatory actually needs, with a named
mentor, a written goal, and a presentation at the end.
**Why:** Min-jun Seo's placement produced the Tern false-positive filter that now keeps Gerald out
of the meteor catalogue. Make-work produces nothing.

| Intern      | Year | Project                                 | Mentor           | Outcome                                  |
| ----------- | ---- | --------------------------------------- | ---------------- | ---------------------------------------- |
| Min-jun Seo | 2025 | Tern false-positive filter              | Priya Raman      | Deployed; 94 % fewer false candidates    |
| Min-jun Seo | 2026 | Symbiotic star spectra with Lyra        | Kenji Mori       | In progress                              |

## O36: Dome shutter maintenance (2025-12)

**Decision:** The dome shutter belt, rollers and limit switches are inspected monthly and the belt
replaced every two years or at the first sign of fraying, whichever comes first.
**Why:** The belt is the one part whose failure leaves the dome open in the rain.

### Monthly inspection

- Visually inspect the belt along its full length with the slit at 50 %.
- Check roller bearings for play by hand, power isolated.
- Trigger each limit switch manually and confirm the controller sees it.
- Wipe the rain sensor with a dry cloth.
- Log the inspection with initials and any findings.

### Belt replacement

The belt replacement runbook lives at `runbooks/replace-shutter-belt.md`. It takes two people and
most of a day. Book it for a cloudy forecast, which on the ridge is not hard.

### Manual close

If the shutter motor fails with the slit open, the slit can be wound closed by hand with the crank
stored behind the control room door. It takes about 140 turns. Two people take turns. Bring the
crank back.

> Every night assistant winds the slit closed by hand once during training, on a dry afternoon,
> so the first time they do it is not at 03:00 in sleet.

## O37: Power cuts and the UPS (2026-01)

**Decision:** On mains failure the UPS carries `ridge-ctl`, the dome controller and the mount for
at least 20 minutes, long enough to park and close. Everything else drops.
**Why:** The ridge loses mains about six times a year, usually in winter storms, which are also
the nights you most want the dome shut.

| Load                    | On UPS | Runtime at full load | Notes                                   |
| ----------------------- | ------ | -------------------- | --------------------------------------- |
| `ridge-ctl`             | yes    | 45 min               |                                         |
| Dome controller + motor | yes    | 25 min               | Motor draw dominates                    |
| Aster mount             | yes    | 40 min               |                                         |
| HCAM-2 + chiller        | no     | n/a                  | Warms up slowly; no harm done           |
| `ridge-arch`            | own UPS| 60 min               | Shuts down cleanly after 10 min on battery |
| `ridge-web`             | no     | n/a                  | The public site can wait                |
| Pavilion lights         | no     | n/a                  | Emergency lighting has its own batteries |

On a power cut during an observing night:

1. `nightjar` notices the UPS signal and aborts the current exposure.
2. The mount parks automatically.
3. The night assistant closes the slit from the controller, or by hand (O36) if the controller
   is not responding.
4. The night assistant logs a `fault` line and goes home if power is not back in an hour.

## O38: Snow on the dome (2026-01)

**Decision:** The dome does not open with snow on it, even if the sky is clear.
**Why:** Snow sliding off an opening shutter falls into the dome, onto the telescope, which is the
one place it must never be.

Clearing snow is a daytime job, from the ground, with the long brush. Never from the catwalk
(O8 applies twice as hard in winter).

## O39: Quill seeing values in FITS headers (2026-01)

**Decision:** Every HCAM-2 frame records the most recent Quill FWHM value and its age in the FITS
header.
**Why:** Reducers kept asking "what was the seeing?" and the answer was always in a different log.

```text
QUILLFWH=                 1.84 / Quill seeing FWHM, arcsec, zenith-corrected
QUILLAGE=                   42 / seconds since the Quill measurement above was taken, at frame start
QUILLVER= 'q2.3.1'             / Quill firmware
```

## O40: The halley configuration file (2026-02)

**Decision:** halley reads one configuration file per season, checked into `ridge-ops`, with
comments on every non-obvious value.
**Why:** A value without a reason gets "tidied" by the next person.

```toml
# /etc/halley/season-2025-26.toml — pinned for the 2025–26 season (O18)
[photometry]
aperture_radius_fwhm = 1.5     # multiples of the frame's measured FWHM
annulus_inner_fwhm   = 3.0
annulus_outer_fwhm   = 5.0
zero_point_source    = "calibration-stars"   # see O15; never the catalogue zero point, which is off by 0.02 in B for our filter set

[flat]
prefer    = "twilight"
fallback  = "dome"       # see O17 for why dome flats are a last resort
max_age_d = 7

[archive]
root     = "/archive"
database = "postgresql://halley@ridge-arch/stacks"
```

## O41: Incident reviews are blameless and written down (2026-02)

**Decision:** Every incident that damages equipment, loses data, or makes someone feel unsafe gets
a written review within a week, in the format below.
**Why:** People who are blamed stop reporting. We would like the reports.

### Review format

- What happened, in time order, UTC.
- What we expected to happen instead.
- Why the difference, as far as we can tell.
- What we are changing, each with an owner and a date.
- What we are deliberately not changing, and why.

### Reviews so far

| Date       | Incident                                   | Severity | Review author     | Outcome summary |
| ---------- | ------------------------------------------ | -------- | ----------------- | --------------- |
| 2025-04-21 | Raw frames of two nights lost after archive disk filled over the Easter weekend and cleanup ran on schedule | data loss | Priya Raman | O31: cleanup waits 14 days and checks two independent facts before deleting anything; disk alarm at 80 %; failure mail to ops@example.org, which pages the on-call phone instead of a mailbox nobody reads on a bank holiday |
| 2025-08-02 | Tern filed 212 meteor candidates in a week, most aircraft, fourteen a moth, since named Gerald | nuisance | Min-jun Seo | O26: nothing auto-published; Min-jun's false-positive filter deployed in December and cut false candidates by 94 %; Gerald has not been seen since, although nobody is certain he has left |
| 2025-11-14 | Dome heater left on for four days after a hurried close in sleet | minor | Rosa Delgado | O5 gained "confirm the dome heater lamp is off"; a timer relay now cuts the heater after 12 hours whatever the switch says; the dome no longer smells like toast |
| 2026-01-09 | Mains lost for 3 h in a storm; slit closed by hand in 140 turns | none | Tomasz Wierzbicki | O37 confirmed; the crank was found behind the door where it belongs, which the review notes with some pride |
| 2026-02-17 | Visitor stepped onto the terrace step in the dark and turned an ankle | injury (minor) | Lena Hofstetter | Step edge painted with glow-in-the-dark strip, checked against the red-light rule with Yusuf; first-aid kit moved from the workshop to the pavilion |

## O42: Red light only after dark (2026-02)

**Decision:** After astronomical dusk, only red light is used in the domes, the roll-off, and on
the terrace, including phone screens (night mode, lowest brightness).
**Why:** Dark adaptation takes twenty minutes to build and one phone screen to destroy, and a
white torch on the terrace spoils sixty people's view at once.

Exceptions, in full:

- An injury or emergency: use any light you need, immediately.
- The workshop, with its door shut.
- The server room.

> Yusuf's note on the pavilion door, translated for the handbook: "Your eyes are the best
> instrument we own tonight. Please be gentle with them." 🔭

## O43: Volunteer observers (2026-03)

**Decision:** Volunteers may observe with Brill and Corvid unaccompanied after training, and with
Aster only with a night assistant present.
**Why:** Yusuf Haddad has logged more Brill hours than anyone on staff and deserves the keys to the
roll-off. Aster costs more than the pavilion.

| Level     | Brill              | Corvid            | Aster                   | Training required                  |
| --------- | ------------------ | ----------------- | ----------------------- | ---------------------------------- |
| New       | with staff         | with staff        | watch only              | O4, O5, O8, O42 walkthrough        |
| Trained   | alone              | alone             | with night assistant    | Three supervised nights on Brill   |
| Senior    | alone, may train   | alone, may train  | with night assistant    | Sign-off by Rosa                   |

## O44: Supplies we never run out of (2026-03)

**Decision:** A short list of supplies is checked on the first of each month and reordered when
below the minimum.
**Why:** Running out of lens tissue at 23:00 is a special kind of sad.

- Lens tissue and optical cleaning fluid (minimum: 2 packs, 1 bottle).
- Red torch batteries (minimum: 40 AA).
- Spare red torches (minimum: 15; they walk).
- Desiccant packs for the filter wheel and HCAM-2 housing (minimum: 10).
- Fuses for the dome controller (minimum: 5 of each rating on the label).
- Coffee (minimum: "enough"; Rosa decides).
- Tea (minimum: also "enough"; Kenji has opinions).
- Hand warmers for winter open nights (minimum: 60 pairs, November to March).

## O45: Rebuilding `ridge-ctl` from scratch (2026-04)

**Decision:** `ridge-ctl` can be rebuilt from a blank disk by one person in an afternoon, using
only the `ridge-ops` repository and the offsite disk.
**Why:** The control PC is eleven years old. It will die on a clear night; the only question is
which one.

### Principles

- Nothing on `ridge-ctl` is configured by hand that is not also written down in `ridge-ops`.
- Hardware bindings (serial ports, USB IDs) are in udev rules in the repository, not in anyone's
  head.
- The rebuild is rehearsed twice a year on the spare PC in the workshop, which is also eleven
  years old, but differently.

### Hardware bindings

The udev rules pin every device to a stable name so that nightjar and halley never have to guess
which `/dev/ttyUSB` is which after a reboot.

```ini
; /etc/ridge/devices.ini — stable names for hardware on ridge-ctl.
; Serial numbers are the real ones on the ridge; the vendor IDs are those of the adapters we use.
[mount]
device  = /dev/ridge-mount
serial  = HRO-MNT-0042
baud    = 9600

[dome]
device  = /dev/ridge-dome
serial  = HRO-DOM-0007
baud    = 19200

[fw8]
device  = /dev/ridge-fw8
serial  = HRO-FW8-0013
baud    = 9600

[quill]
device  = /dev/ridge-quill
serial  = HRO-QUL-0003
baud    = 115200
note    = the Quill head shares a USB hub with the dome controller; if either misbehaves after a storm, reseat the hub first
```

### The rebuild, start to finish

This is the single-paste version. Read it through once before pasting any of it, and paste it one
numbered block at a time.

```sh
# 1. Install the base system from the observatory image on the offsite disk.
#    The image is named hro-base-<YYYY-MM>.img; use the newest one.
sudo dd if=/media/offsite/images/hro-base-2026-03.img of=/dev/sda bs=4M status=progress conv=fsync

# 2. After first boot, clone ridge-ops and run the host setup for ridge-ctl.
git clone ssh://git@ridge-arch.example.invalid/ridge-ops.git /opt/ridge-ops
cd /opt/ridge-ops && sudo ./hosts/ridge-ctl/setup.sh --with-udev --with-nightjar --with-halley-client --no-archive

# 3. Restore the device bindings and reload udev.
sudo cp /opt/ridge-ops/hosts/ridge-ctl/99-ridge-devices.rules /etc/udev/rules.d/
sudo udevadm control --reload && sudo udevadm trigger

# 4. Confirm every device is where it should be.
for d in mount dome fw8 quill; do test -e /dev/ridge-$d && echo "ok   $d" || echo "MISSING $d"; done

# 5. Restore the gateway's known key for ridge-ctl so remote observers are not warned.
sudo cp /media/offsite/keys/ridge-ctl/ssh_host_ed25519_key* /etc/ssh/ && sudo systemctl restart ssh

# 6. Dry run: home everything, open nothing.
nightjar selftest --dry-run --no-dome
```

### After the rebuild

1. Take one set of bias frames and compare the median level with the last good night.
2. Point Aster at a bright star with the dome shut (it is fine; the dome does not mind) and check
   the mount reports sane coordinates.
3. Log the rebuild in the night log and in `ridge-ops/hosts/ridge-ctl/HISTORY.md`.

## O46: Brill in the East Roll-off (2026-04)

**Decision:** Brill's roll-off roof opens and closes by hand only. It is not connected to the
Sable interlock.
**Why:** The roll-off roof motor was removed in 2019 after it tried to close on the telescope. A
roof that only moves when a human pushes it cannot surprise that human.

**Consequences:**

- Brill is never left observing unattended.
- The roll-off has its own copy of the O6 weather table taped inside the door.
- Anyone observing with Brill checks Sable on the roll-off tablet every 30 minutes.

## O47: Corvid lives indoors (2026-04)

**Decision:** Corvid is stored in the pavilion and carried to the terrace for each open night.
**Why:** It weighs 14 kg with its mount and is the one telescope volunteers can safely carry. Left
outdoors, it would weigh 14 kg plus the local spider population.

## O48: Nightjar priorities (2026-05)

**Decision:** nightjar resolves conflicts between observing blocks by priority number, then by
cadence urgency, then by altitude.

| Priority | Who uses it                        | Can pre-empt       |
| -------- | ---------------------------------- | ------------------ |
| 0        | Targets of opportunity (novae, etc.) | everything       |
| 1        | Allocated visiting astronomer time | 2, 3, 4            |
| 2        | VSS fast and calibration cadences  | 3, 4               |
| 3        | VSS medium and slow cadences       | 4                  |
| 4        | Engineering, tests, pretty pictures | nothing           |

**Why:** A bright nova appeared in March 2026 during a visiting astronomer's allocation. The
astronomer was delighted to be pre-empted. Not everyone will be, which is why priority 0 needs the
director's or the night assistant's approval and a line in the night log.

> Targets of opportunity are rare. When one arrives, write down everything: the time you heard,
> who told you, what you did first. Future you will want the timeline.

## O49: Photometry quality flags (2026-05)

**Decision:** halley assigns every VSS measurement a quality flag, and only flags `A` and `B` go
into the published light curves.

| Flag | Meaning                                              | Published |
| ---- | ---------------------------------------------------- | --------- |
| A    | Seeing < 2.5", airmass < 1.5, no warnings            | yes       |
| B    | Seeing < 3.5" or airmass < 2.0, no warnings          | yes       |
| C    | Anything with a halley warning (saturation, cosmic)  | no        |
| D    | Calibration missing or older than seven days         | no        |
| X    | Manually rejected by a reviewer                      | no        |

**Why:** Early light curves mixed good and marginal points and looked noisier than the stars
really are. Kenji put it more politely.

## O50: Public data releases (2026-06)

**Decision:** VSS light curves are released publicly twice a year, in January and July, with a
short release note.
**Why:** Continuous release sounded good until we had to explain why a point moved between two
downloads.

Each release note covers:

- The halley version used (O18).
- How many stars and measurements are included, by quality flag.
- Any stars dropped or added, with reasons.
- Known issues, stated plainly.
- How to cite the release.

## O51: Cleaning the Aster primary (2026-06)

**Decision:** Aster's primary mirror is washed at most once a year, in June, when the nights are
short anyway. Between washes it is blown with clean dry air only.
**Why:** Every wash risks the coating more than a little dust costs in throughput. The June wash
also lines up with the O30 collimation that must follow it.

### The wash, in outline

1. Book two people and a full day in the workshop.
2. Remove the mirror cell following `runbooks/remove-aster-primary.md`.
3. Rinse with distilled water, then the mild detergent solution, then distilled water again.
4. Drain on edge, never wipe.
5. Reinstall, collimate (O30), take a test frame, compare throughput with last season.

> "Never wipe" is in bold in the runbook, underlined on the workshop whiteboard, and was once
> embroidered onto a tea towel by a volunteer. It remains good advice.

## O52: Kenji's remote observing hours (2026-07)

**Decision:** Remote observers in time zones far from the ridge get a night assistant on site but
may run their own blocks from home, through the gateway (O22).
**Why:** Kenji observes from a timezone where the ridge's midnight is his breakfast. He is sharper
at breakfast than we are at midnight, and he knows his targets better than anyone here.

## O53: What a quiet night looks like in the logs (2026-07)

**Decision:** None. This entry exists so new night assistants know what normal looks like.

```text
2026-07-03T20:58Z MS  note   start-of-night script ok, HCAM-2 at -25.1C after 7 min
2026-07-03T21:17Z MS  open   dome open, Sable 64% 3.1m/s, Tern clear, Quill FWHM 1.7"
2026-07-03T21:40Z MS  note   twilight flats V R done, B skipped (too dark by the time V finished)
2026-07-03T21:44Z MS  note   nightjar running standing VSS plan, 38 fast-cadence fields queued
2026-07-04T00:12Z MS  note   Quill 1.5", best of the week; took a picture of the Moon for the pavilion noticeboard, priority 4, 3 min
2026-07-04T02:31Z MS  warn   dew margin 2.2C, watching
2026-07-04T02:55Z MS  close  dew margin 1.4C, closed by hand ahead of the controller
2026-07-04T03:20Z MS  note   end-of-night script ok, 412 frames transferred and verified
```

## O54: Handbook review cadence (2026-08)

**Decision:** The whole handbook is read by at least two staff each September, before the season
starts, and every entry is marked still-true, needs-update, or superseded.
**Why:** A handbook that is not re-read becomes the old wiki page titled "Stuff".

- Ada reads the odd-numbered entries.
- Tomasz reads the even-numbered entries.
- Anyone else is welcome, and usually finds the most.
- Disagreements go on the agenda of the first Monday meeting of the season.

## O55: Where this handbook lives (2026-09)

**Decision:** This handbook lives in the `ridge-ops` repository beside the runbooks, and a copy is
printed and kept in a ring binder in the control room.
**Why:** The control room binder works when `ridge-arch` does not, which is exactly when you need
it most. It is reprinted after each September review (O54).

The public version, with access details and internal addresses removed, is published at
https://example.org/hro/handbook for other small observatories to borrow from. Borrow freely;
tell us what you changed.

## O56: Monday meeting format (2026-09)

**Decision:** The Monday meeting runs for 45 minutes, in the pavilion, with a fixed agenda, and
ends on time even if the agenda does not.
**Why:** The old Monday meeting had no agenda, ran for two hours, and once spent forty minutes on
the colour of the new pavilion bins.

### The agenda

1. Last week's nights: clear, cloudy, lost, and why (5 minutes, Rosa).
2. Faults and incidents opened or closed (10 minutes, Tomasz).
3. Data: ingests, backlogs, anything stuck in `incoming/` (5 minutes, Priya).
4. Outreach: bookings, open nights, school visits (5 minutes, Lena).
5. Handbook: any entry proposed, changed or superseded this week (10 minutes, Ada).
6. Anything else (10 minutes, strictly).

### Minutes

Minutes are written during the meeting by whoever is not speaking, rotated weekly, and filed as
`logs/<YYYY-MM-DD>-monday.md`. They record decisions and owners, not discussion.

> If a decision in the minutes changes how the observatory runs, it is not finished until it has
> an O-number in this handbook.

## O57: School visits (2026-09)

**Decision:** School groups visit on weekday afternoons in term time, see the Main Dome with the
slit open and the telescope parked, and look at the Sun through the pavilion's filtered solar
telescope, which is the only telescope on the ridge allowed to point at the Sun.
**Why:** Children are much more excited by a moving dome than by a slideshow, and a daytime visit
does not need a bus home at midnight.

| Age group | Group size | Length  | Content                                         | Staff                 |
| --------- | ---------- | ------- | ----------------------------------------------- | --------------------- |
| 7–9       | up to 25   | 90 min  | Dome, solar telescope, "how big is the Moon"    | Lena + 1 volunteer    |
| 10–13     | up to 30   | 2 h     | Dome, solar telescope, Tern meteor examples     | Lena + 2 volunteers   |
| 14–18     | up to 30   | 2.5 h   | All of the above, plus a real VSS light curve   | Lena + Priya or Min-jun |

The solar telescope has its own rules:

- It is set up only by Lena or a trained volunteer.
- The filter is inspected for pinholes before every session, against a bright lamp, indoors.
- It is never left unattended while pointed at the Sun, not even "just for a second".
- Nobody improvises a solar filter for any other telescope. Ever.

> The pavilion finder scopes all have their caps glued on for school visits. It looks untidy. It
> is on purpose.

## O58: Accessibility on open nights (2026-09)

**Decision:** Every open night has at least one telescope with an eyepiece reachable from a seated
position, and the terrace path is kept clear and lit with low red strip lights.
**Why:** Lena's visitor survey found that one visitor in twelve had difficulty with the Corvid
eyepiece at standing height, and several simply left rather than ask.

- Corvid's tripod is set to its lowest height for the first half hour of every open night.
- A second eyepiece on a flexible extension is available on request.
- Brill's roll-off has a ramp, not steps, since the 2025 rebuild.
- Live images from Brill are shown on the pavilion screen for anyone who prefers to sit indoors.
- Booking asks, gently and optionally, whether a visitor needs any of the above.

## O59: Data retention (2026-09)

**Decision:** How long each kind of data is kept, in one place.
**Why:** The question came up at three different Monday meetings and got three different answers.

| Data                          | Where                     | Kept                            | Why                                            |
| ----------------------------- | ------------------------- | ------------------------------- | ---------------------------------------------- |
| Raw frames on `ridge-ctl`     | `/data/raw/`              | 14 days after verified transfer | O31                                            |
| Raw frames in the archive     | `/archive/raw/`           | forever                         | Science; disks are cheap, nights are not       |
| Reduced frames                | `/archive/reduced/`       | until the next season's reprocess | Can always be regenerated from raw           |
| stacks nightly dumps          | `/archive/catalogue/`     | 30 days                         | O20                                            |
| stacks weekly offsite dumps   | offsite disk              | 2 years                         | O20                                            |
| Night logs                    | `ridge-ops/logs/`         | forever                         | Tiny, and endlessly useful                     |
| Tern all-sky frames           | `/archive/tern/`          | 90 days, detections forever     | Most frames are empty sky or Gerald            |
| Public webcam images          | `ridge-web`               | 7 days                          | O23; nobody needs last month's webcam          |
| Visitor bookings              | events calendar           | 12 months, then deleted         | We do not need to remember who came            |

## O60: Training records (2026-09)

**Decision:** Every person who operates any telescope has a one-page training record in
`ridge-ops/training/`, listing what they are signed off for and when.
**Why:** "I think Min-jun did the catwalk training?" is a question that should have a written
answer.

Each record lists:

- Name and role.
- Sign-offs, each with the date and the signing staff member's initials: O4 opening, O5 closing,
  O8 catwalk, O36 manual close, O42 red light, O43 volunteer level.
- Anything the person is *not* yet signed off for, so that nobody assumes.
- A review date, one year after the most recent sign-off.

## O61: Things we decided not to do (2026-09)

**Decision:** Record the decisions not to do something, with the reason, so they are not
re-proposed every six months without new information.
**Why:** Ideas come back. That is fine. They should come back knowing why they left.

| Idea                                               | Decided  | Reason                                                                           |
| -------------------------------------------------- | -------- | -------------------------------------------------------------------------------- |
| Fully robotic Aster with no night assistant        | 2025-05  | Weather on the ridge changes faster than the interlock can be trusted to notice  |
| Motorise Brill's roll-off roof again               | 2025-06  | O46; the last motor tried to close on the telescope                              |
| Move the archive to a hosted service               | 2025-10  | The ridge's uplink is 20 Mbit/s on a good day; a night's raw data is 30 GB        |
| Live-stream the Aster camera to the public site    | 2025-12  | Science frames look like grey static to visitors; Tern is prettier               |
| Replace the night log with a web form              | 2026-02  | Plain text survives every outage and every tired person (O13)                    |
| Hold open nights on Saturdays as well              | 2026-04  | Not enough volunteers; revisit if the volunteer roster passes 20                 |

## O62: This handbook's own conventions (2026-09)

**Decision:** Entries follow the same shape so they can be skimmed in the control room binder at
03:00.

- The heading is `## O<number>: <short title> (<YYYY-MM>)`.
- The first paragraph is **Decision**, then **Why**.
- **Consequences** appear when there are any worth writing down.
- Procedures longer than about ten steps move to a runbook (O25) and are linked, not inlined.
- A superseded entry keeps its text and gets a quoted note at the top pointing to its successor.
- Tables beat prose for anything with more than three comparable items.
- UTC throughout (O3).

> The handbook is a working document. If something here is wrong, the fix is a new entry or an
> edited one, not a sticky note on the binder. Sticky notes fall off, usually onto the floor of
> the Main Dome, where they are found in spring by whoever cleans it.

## O63: Open nights on the second Saturday (2025-03) — superseded by O24

> **Superseded by O24 (2025-08).** Open nights moved to the first and third Friday. The reasoning
> below is kept because the question of Saturdays keeps coming back (see O61).

**Decision:** One open night a month, on the second Saturday.
**Why:** It was the night the previous outreach coordinator was free.

**Consequences:** Attendance averaged 22, mostly couples. Families stayed away because of Saturday
sports. Lena's first survey (O24) came out of this.

## O64: Winter shutdown week (2026-09)

**Decision:** The observatory closes to visitors for the last week of December and the first week
of January. Science observing continues if a night assistant volunteers.
**Why:** Staff have families, the road up the ridge is often closed by snow anyway, and the dome
maintenance backlog (O36, O38) is easiest to clear when nobody is booked.

During the shutdown:

- The pavilion heating is set to frost protection only.
- `ridge-web` shows a shutdown notice on the events calendar.
- The weekly offsite backup (O20) still runs; someone drives the disk down to Marrowby.
- The night assistant rota for the shutdown is agreed at the first Monday meeting in December.
- Anyone who does observe during the shutdown gets first pick of the leftover biscuits.

## O65: Tern camera housing heater (2026-09)

**Decision:** The Tern all-sky camera's dome heater runs whenever the dew margin is below 4 °C,
controlled by `ridge-ctl` from the Sable readings.
**Why:** A dewed-up all-sky dome reports 100 % cloud on a perfectly clear night, and the night
assistant, obeying O6, keeps the dome shut. This happened on three consecutive clear nights in
October 2025 before anyone climbed up to look.

```sh
# /etc/cron.d/tern-heater — every two minutes, switch the Tern heater from the Sable dew margin.
*/2 * * * * ridge  /opt/ridge-ops/bin/tern-heater --on-below 4.0 --off-above 5.0 --sable http://sable.example.invalid/api/v1/current --log /var/log/tern-heater.log
```

**Consequences:** The heater draws 12 W and is not on the UPS (O37). A power cut during a damp
night means the all-sky frames go grey within twenty minutes; the night assistant should treat
Tern as blind until the heater has been back on for half an hour.

## O66: Handbook entry template

**Decision:** New entries start from this template, copied into the end of the file.
**Why:** O62 describes the shape; a template makes it the default.

```text
## O<next number>: <short title> (<YYYY-MM>)

**Decision:** <one or two sentences: what we do now>
**Why:** <what happened, or what we expect to happen, that makes this the right call>

**Consequences:** <optional: what changes elsewhere, what we gave up, what to watch for>
```

Before adding an entry, check:

- Is this a decision, or a procedure? Procedures go in `runbooks/` (O25).
- Does it reverse an earlier entry? If so, mark that entry superseded in the same change.
- Has it been discussed at a Monday meeting (O56)? If not, bring it to the next one first.
- Will the person reading the binder at 03:00 understand it without asking anyone?

> Last word, from the first page of the original binder, in Tomasz's handwriting: "Write it down.
> The ridge forgets nothing, but people do."

## Appendix: glossary

Terms that appear throughout the handbook, for new staff and visitors reading the binder.

| Term             | Meaning                                                                          |
| ---------------- | -------------------------------------------------------------------------------- |
| Aster            | The 0.61 m Ritchey–Chrétien in the Main Dome; the main science telescope         |
| Brill            | The 0.35 m Schmidt–Cassegrain in the East Roll-off                               |
| Corvid           | The 0.2 m refractor used on the pavilion terrace for open nights                 |
| Dunmore          | The 0.4 m Newtonian being refurbished in the workshop (O21, O28)                 |
| HCAM-2           | The CCD camera on Aster, cooled to −25 °C                                        |
| Lyra             | The low-resolution spectrograph, mounted on spectroscopy nights only (O33)       |
| FW-8             | The eight-slot filter wheel in front of HCAM-2 (O16)                             |
| Tern             | The all-sky camera; clouds, meteors, and occasionally Gerald                     |
| Sable            | The weather station on the mast; the weather source of truth (O7)                |
| Quill            | The seeing monitor; its values go into every FITS header (O39)                   |
| halley           | The data reduction pipeline, pinned per season (O18, O40)                        |
| nightjar         | The scheduler that runs the night's plan on `ridge-ctl` (O14, O48)               |
| stacks           | The archive database on `ridge-arch` (O19, O20)                                  |
| Dew margin       | Air temperature minus dew point; below 1.5 °C the dome closes (O6)               |
| FWHM             | Full width at half maximum of a star image; smaller is better seeing             |
| Night assistant  | The person who owns the night (O2)                                               |
| Standing plan    | What Aster observes when nothing else is scheduled (O15)                         |
| Target of opportunity | Something unexpected and bright enough to pre-empt the plan (O48)           |

### Abbreviations

- **HRO**: Halden Ridge Observatory.
- **VSS**: the Variable Star Survey.
- **UPS**: uninterruptible power supply (O37).
- **UTC**: the only time zone this handbook uses (O3).
- **TOO**: target of opportunity.
- **RC**: Ritchey–Chrétien, Aster's optical design.
- **SCT**: Schmidt–Cassegrain telescope, Brill's optical design.
- **FITS**: the image file format every frame is saved in.

Abbreviations for people in the night log are initials only: `RD`, `MS`, `TW`, `PR`, `LH`, `KM`,
`YH`, `AO`. A new person picks initials that do not clash with anyone already listed in
`ridge-ops/training/` (O60); if they do clash, the newer person adds a digit, and is teased about
it for exactly one week.

### Where to ask

- Anything about the night: the night assistant on shift.
- Anything about hardware: Tomasz, or the fault log in `ridge-ops/faults/`.
- Anything about data: Priya, or `ops@example.org`.
- Anything about visitors: Lena.
- Anything about this handbook: Ada, or bring it to the Monday meeting (O56).
- Anything about biscuits: Rosa, who will deny everything.
- Anything else: the Monday meeting, which exists for exactly this.

If you are reading this in the control room binder at night and none of the above can be reached,
the rule is the same as ever: close the dome, park the telescope, and write down what happened.
