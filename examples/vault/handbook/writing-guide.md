---
title: Writing guide for notes, logs and reports
description: How Halden Ridge Observatory writes its night logs, working notes and monthly reports.
tags:
  - handbook
  - writing
  - logs
  - style
aliases:
  - style guide
  - how to write a night log
---

# Writing guide

This guide covers everything we write down at Halden Ridge: night logs, working notes, incident reports and the
monthly report to the trust. It is maintained by Ada Okafor, with long-suffering contributions from Priya Raman
(who reads every log the pipeline chokes on) and Rosa Delgado (who writes most of them at three in the morning).

The short version: write for the person who opens this note in two years, knows nothing about tonight, and is
trying to work out why frame 4417 of the Variable Star Survey looks wrong. That person is usually you.

## Why we bother

A log that says "clouds, closed" is not a log. It is a shrug with a timestamp. The archive in `stacks` keeps every frame we have ever taken, but it cannot tell anyone why the dome closed at 23:40, which filter was stuck, or that the Sable weather station had been reading two degrees warm since the Workshop door was left open. Only the notes can. When the Kiso-Hara Astronomical Society asked for our 2025 photometry of the eclipsing binaries, Kenji Mori spent a week reconstructing three nights because the logs said "some issue with FW-8" and nothing more; that week is the reason this guide exists.

## Naming notes

### File names

- Use lower-case words joined by hyphens: `dunmore-mirror-cell.md`, not `Dunmore Mirror Cell (NEW).md`.
- Put the date first for anything that happens on a day: `2026-03-14-night-log.md`.
- Never put a person's name in a file name; people move on, notes stay.
- Avoid version suffixes like `-final` or `-v2`; the history lives in git, not in the name.
- Keep names under 50 characters so they fit in the sidebar without truncating.

### Titles

- The first heading is the title and matches the `title` field in the frontmatter.
- A title says what the note is about, not what kind of note it is: "Dunmore secondary mirror spider" beats
  "Notes (Dunmore)".
- For decisions, phrase the title as the decision: "Move Tern to the pavilion roof".

### Folders

| Folder       | What goes in it                         | Who owns it        | Review cadence |
| ------------ | --------------------------------------- | ------------------ | -------------- |
| `logs/`      | Night logs, one per observing night     | Night assistant    | Weekly         |
| `handbook/`  | Procedures, this guide, runbooks        | Director           | Quarterly      |
| `projects/`  | Project notes: VSS, Dunmore, Meteor     | Project lead       | Monthly        |
| `incidents/` | Anything that broke or nearly broke     | Chief engineer     | After each     |
| `outreach/`  | Visitor nights, school talks, posters   | Outreach lead      | Monthly        |
| `reports/`   | Monthly reports to the trust            | Director           | Monthly        |
| `scratch/`   | Half-formed thoughts, allowed to rot    | Whoever wrote it   | Never          |

## Headings

- One `#` heading per note: the title.
- Use `##` for the main sections and `###` for subsections; stop there. If you need a fourth level, the note wants
  to be two notes.
- Headings are nouns or short phrases, not sentences: "Focus run", not "We then ran the focus routine".
- A night log always has the same sections in the same order, so a search for `## Weather` finds every one.

## Night logs

### Required sections

1. **Summary**: two or three lines. Was the night usable, and for what?
2. **Weather**: numbers from Sable and Quill, plus what you saw with your own eyes.
3. **Observations**: the table described below.
4. **Problems**: anything that failed, with times.
5. **Handover**: what the next person needs to know before opening the dome.

### A good entry

```md
## Problems

- 22:14 FW-8 stuck between V and R during slot change. Dome lights on, wheel clicked twice, then moved.
  Frames 4411–4416 (all V) are fine; 4417 was taken mid-move and is marked `bad` in stacks.
- 22:30 Re-homed FW-8 from `ridge-ctl` (`fw8 home`), no further sticking tonight.
- Told Tomasz by message; he wants the wheel's belt tension checked before Friday.
```

### A bad entry

```md
## Problems

- filter wheel weird again
- some frames bad??
- fixed it
```

The bad entry is not wrong, exactly. It is just useless: which wheel, which frames, how was it fixed, and does
anyone need to do anything? Every one of those questions costs someone twenty minutes later.

### Another good entry, for a quiet night

```md
## Summary

Clear from 20:50 to 04:10, seeing 1.4–1.9" on Quill. Full VSS block A (38 targets) on Aster with HCAM-2.
Nothing broke. Closed at 04:12 on humidity (Sable 91%). No handover items.
```

## Tables for observations

Every night log has one observation table. Columns are fixed so that `halley` can parse them; do not rename or
reorder them.

| Time (UTC) | Target      | Filter | Exposure (s) |
| ---------- | ----------- | ------ | ------------ |
| 20:58      | V0412 Cyg   | V      | 60           |
| 21:03      | V0412 Cyg   | R      | 60           |
| 21:11      | RR Lyr      | V      | 30           |
| 21:15      | RR Lyr      | B      | 45           |
| 21:24      | SW And      | V      | 90           |
| 21:31      | SW And      | I      | 90           |
| 21:40      | Flat, dusk  | clear  | 2            |
| 22:05      | Standard 14 | V      | 20           |
| 22:09      | Standard 14 | B      | 30           |
| 22:14      | Standard 14 | R      | 20           |
| 22:31      | UV Boo      | V      | 120          |
| 22:48      | UV Boo      | H-alpha| 300          |
| 23:20      | Dark        | —      | 120          |
| 23:27      | Bias        | —      | 0            |
| 23:35      | M 57        | OIII   | 600          |
| 23:49      | M 57        | H-alpha| 600          |
| 00:02      | Dark        | —      | 600          |

- Times are UTC, always. The pavilion clock is local time and has been wrong since the power cut in April 2025.
- One row per exposure series, not per frame; the frame numbers live in `stacks`.
- Use the target names from the VSS target list, exactly as spelled there.
- Use an em dash (—) for "not applicable", never an empty cell.

## Units

- Seeing in arcseconds with the `"` symbol: `1.6"`. Quill reports FWHM; say so if you quote something else.
- Temperatures in °C, humidity in %, wind in m/s, pressure in hPa.
- Exposure times in seconds, no unit in the table (the header says it), unit in prose: "a 300 s exposure".
- Magnitudes to two decimals unless the pipeline gives more and you mean it.
- Mirror and dome dimensions in metres or millimetres, never inches, even for Dunmore, whose original drawings
  are all in inches and are a source of ongoing sorrow for Tomasz.

## Citing instruments and software

When you write about a measurement, name the instrument that made it and, if it matters, its configuration. Write "HCAM-2 on Aster, binned 2×2, gain 1.2 e⁻/ADU, FW-8 slot 3 (R)" rather than "the camera", because in 2027 there may be an HCAM-3 and nobody will remember which one "the camera" meant; the same goes for software, so write "halley 4.2.1, nightjar schedule `vss-a-2026-03`" and not "the pipeline", and when a result depends on a calibration frame, give its `stacks` id so anyone can pull it back out.

- Instrument names are proper nouns: Aster, Brill, Corvid, Dunmore, Lyra, Quill, Sable, Tern.
- Product-style codes keep their capitals and hyphen: HCAM-2, FW-8.
- Software names are lower-case and in backticks when you mean the command: `halley`, `nightjar`, `stacks`.
- Hosts are always in backticks: `ridge-ctl`, `ridge-arch`, `ridge-web`.

## Links

- Link to other notes with relative links: see [the operations handbook](operations-handbook.md) for dome
  procedures and [the Dunmore project page](../projects/dunmore-refurbishment.md) for the mirror work.
- Link to the incident note from the night log, and from the incident back to the log, as in
  [the FW-8 incident](../incidents/2026-03-14-fw8-stuck.md).
- The public calendar is at <https://halden-ridge.example.org/calendar>; the internal wiki lives at
  <https://wiki.example.invalid/hro> and is not reachable from outside the ridge.
- Style questions go to [the monthly report template](../reports/template.md) or to
  [the glossary](glossary.md) before they go to Ada.

## Incident reports

### Structure

1. What happened, with times in UTC.
2. What we saw first, and who saw it.
3. What we did, in order, including the things that did not work.
4. What it cost: lost hours, lost frames, damaged hardware.
5. What changes, with an owner for each change.

Items 1–5 are the shared template; incidents that touched hardware carry two more, numbered on from
where the template stops (the gap is the template's sixth, "sign-off", which lives in the header):

7. The part, by name and serial number, and where it is now.
8. Whether the vendor has been told, and the reference they gave.

Before item 1 comes a step nobody skips, numbered zero so that it cannot be mistaken for part of
the template:

0) Make the hardware safe: dome closed, telescope parked, power isolated if anything smells.
1) Then, and only then, open the note.

When a log refers to frames by number, a numbered list can use the frame numbers directly. The
night of 2026-03-14 crossed a thousand frames during block B:

998. V, 60 s, variable target VSS-0117, fine.
999. V, 60 s, the same target, a satellite trail across the check star.
1000. R, 60 s, the wheel stopped mid-slot here (the FW-8 incident).
1001. R, 60 s, after `fw8 home`, fine again.

### Example

```md
# 2026-03-14 FW-8 stuck mid-slot

- 22:14 UTC: wheel stopped between V and R (Rosa, night log).
- 22:16: soft reset from nightjar failed; wheel reported "in position".
- 22:30: `fw8 home` on ridge-ctl recovered it.
- Cost: one frame (4417), 16 minutes of VSS block A.
- Change: check belt tension monthly (owner: Tomasz). Add a position check to nightjar before each exposure
  (owner: Priya).
```

## Checking notes before you commit

The script below lives in `tools/` on `ridge-ctl` and checks that every night log has the required sections,
that times look like UTC, and that nobody has put a real password in a note (it has happened once).

```bash
#!/usr/bin/env bash
# check-notes.sh: sanity checks for night logs before they go into the vault
set -euo pipefail

vault="${1:-$HOME/vault}"
required=("## Summary" "## Weather" "## Observations" "## Problems" "## Handover")
status=0

for log in "$vault"/logs/*-night-log.md; do
  for section in "${required[@]}"; do
    if ! grep -qxF "$section" "$log"; then
      echo "missing '$section' in $(basename "$log")"; status=1
    fi
  done
  if grep -nE '\b(password|passwd|secret)\s*[:=]' "$log"; then
    echo "possible secret in $(basename "$log"), remove it and tell Tomasz"; status=1
  fi
done

find "$vault" -name '*.md' -newer "$vault/.last-check" -print0 | xargs -0 -r grep -nE '^\| [0-9]{2}:[0-9]{2} +\|' | awk -F'|' '$2 !~ /^ [0-2][0-9]:[0-5][0-9] +$/ { print "odd time: " $0 }'
touch "$vault/.last-check"
exit "$status"
```

Run it like this before pushing:

```bash
cd ~/vault && ./tools/check-notes.sh . && git add logs/ && git commit -m "Night log $(date -u +%F)"
```

## HTML in notes

Markdown covers almost everything. Where it does not, a few HTML tags are allowed, and nothing
else: keep them for things the reader would otherwise miss.

- A forced line break inside a table cell or list item: `Aster<br>Main Dome`, which renders as
  Aster<br>Main Dome.
- Keys, when a procedure says what to press: save the plan with <kbd>Ctrl</kbd>+<kbd>S</kbd>.
- Powers and chemistry: the flat field falls off as r<sup>2</sup> near the edge, and the dome
  dehumidifier removes about 3 litres of H<sub>2</sub>O on a damp night.

<!-- an HTML comment: invisible when rendered, so never put anything in one that a reader needs -->

For a long justification that most readers can skip, fold it:

<details><summary>Why</summary>
Night logs are read on the control room screen at 03:00 by someone tired. A folded paragraph keeps
the log short for them and complete for the person who opens it in two years.
</details>

## Monthly reports

- Keep the report to two pages when printed; the trust reads it on paper at the Marrowby library.
- Start with three numbers: clear hours, usable hours, frames archived.
- One paragraph per project: VSS, Dunmore Refurbishment, Dark Sky Campaign, Meteor Watch.
- Put the outreach numbers (visitors, school groups, Corvid sessions) in a short list, not a table.

Lena Hofstetter writes the outreach section and has asked, politely and repeatedly, that the rest of us stop describing visitor nights as "busy" and start writing down how many people came, how many of them looked through Corvid, how many were children, and whether the Dark Sky Campaign leaflets ran out, because the council meeting in June wants numbers and "busy" does not survive a council meeting.

## Checklist before closing a note

- The frontmatter has a title, description and tags.
- The title matches the first heading.
- All times are UTC and say so once.
- Every instrument and host is named, not "the camera" or "the server".
- Units are present and consistent.
- Bad frames are marked in `stacks` and mentioned in the note.
- Problems have an owner, or explicitly say "no action".
- Links to related notes work (click them once).
- The check script passes.

## See also

- [Operations handbook](operations-handbook.md)
- [Glossary](glossary.md)
