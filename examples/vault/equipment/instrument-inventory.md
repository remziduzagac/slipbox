# Instrument inventory — what we own, where it is, who looks after it

A running overview of the instruments, sensors and computers at
Halden Ridge Observatory. It is the first place to look before a
night, a repair, or a grant report that asks "what do you
actually have?"

The detailed manuals live next to each instrument's folder. This
note only says what, where, who and how healthy — and it is
updated whenever someone swaps a part, not once a year.

## Vocabulary

| Term | Meaning |
|---|---|
| **instrument** | Anything that produces science data: a camera, the spectrograph, the filter wheel. |
| **sensor** | Something that watches the site rather than the sky: Sable, Quill, Tern. |
| **host** | One of the three ridge computers. Named `ridge-*`, never renamed, never repurposed. |
| **owner** | The person who answers for it. Not the only person allowed to touch it. |
| **custodian** | Whoever holds the spare parts and the manuals for it — usually Tomasz. |
| **night log** | The per-night record kept by the night assistant in `logs/nights/`. |
| **red tag** | A physical tag hung on anything that must not be powered on until it is removed. |

## Where things live

```
Halden Ridge Observatory
├── Main Dome (5.2 m)
│   └── Aster 0.61 m RC ── FW-8 ── HCAM-2        (Lyra swaps in for HCAM-2)
├── East Roll-off
│   └── Brill 0.35 m SCT ── spare CCD on loan    (outreach nights only)
├── Visitor Pavilion
│   ├── Corvid 0.2 m refractor                   (public eyepiece sessions)
│   └── basement: Server Room
│       ├── ridge-ctl    control PC, runs nightjar and the night scripts
│       ├── ridge-arch   archive server, stacks (PostgreSQL) + raw FITS
│       └── ridge-web    public site, weather page, meteor gallery
├── Workshop
│   └── Dunmore 0.4 m Newtonian                  (in pieces, see refurb log)
└── Mast on the north knoll: Sable, Quill, Tern
```

The mast is 40 m from the dome on purpose: close enough for one
cable run, far enough that dome heat does not spoil the seeing
figures.

## Ownership

- **Tomasz Wierzbicki** owns every piece of hardware on this page unless a row says otherwise.
  He also keeps the red tags, which live in a biscuit tin in the Workshop.
- **Priya Raman** owns the three hosts and everything that runs on them: halley, nightjar, stacks.
- **Lena Hofstetter** owns Corvid and the public weather page on `ridge-web`.
- **Rosa Delgado** is the first responder at night for anything with a status marker below ✅.
- **Min-jun Seo** keeps this note current, as part of the intern handbook.

  Ownership is about answering questions, not gatekeeping. Anyone trained may open a panel;
  they write a line in the night log when they do.

## Science instruments

| Instrument | What it is | Status and notes |
|---|---|---|
| **HCAM-2** | Thermoelectrically cooled 4k×4k CCD on Aster, 15 µm pixels, runs at −30 °C on a normal night | ✅ In service. Dark current back within spec after the March desiccant change. |
| **Lyra** | Low-resolution long-slit spectrograph, R ≈ 900, swaps onto Aster in place of HCAM-2 | ⚠️ Usable, but the slit mechanism sticks below −5 °C. Warm it with the dome heater first. |
| **FW-8** | Eight-position filter wheel: U B V R I, H-alpha, OIII and clear, between Aster and the camera | 🔧 Position 6 (H-alpha) misreports its index roughly once in forty moves. Home it twice. |
| **Spare CCD** | Older 2k×2k camera, on loan to the roll-off for outreach use on Brill | ✅ Fine for public nights. Not calibrated for survey work, and nobody should pretend otherwise. |

## Site sensors

| Sensor | What it is | Status and notes |
|---|---|---|
| **Sable** | Weather station on the mast: wind, humidity, rain, sky temperature, pressure | ✅ Feeds nightjar every 30 s. The rain sensor is the only thing allowed to close the dome alone. |
| **Quill** | Differential image-motion seeing monitor with its own small tube | ⚠️ Reads about 0.2″ high since the tube was knocked in June. Re-collimation is on the list. |
| **Tern** | Fisheye all-sky camera for cloud cover and the Meteor Watch project | ✅ Captures every 20 s from dusk to dawn; detections go to the meteor gallery on `ridge-web`. |

## Hosts

| Host | Role | State |
|---|---|---|
| `ridge-ctl` | Control PC: nightjar scheduler, night start/stop scripts, device drivers | ✅ Healthy |
| `ridge-arch` | Archive: stacks database, raw and reduced FITS, nightly backups | ⚠️ Disk 78 % full |
| `ridge-web` | Public site, weather page, meteor gallery at <https://ridge.example.org> | ✅ Healthy |

All three are on the pavilion UPS, which buys about 25 minutes —
long enough for nightjar to park Aster and close the dome, not
long enough to finish a reduction run.

## Status (2026-09-28)

### What each marker means

- ✅ in service, nothing to do
- ⚠️ usable with a known workaround, written in the row
- 🔧 in repair or waiting for a part; use only if the row says how
- ❌ out of service and red-tagged; do not power on

### Open problems — detail

| Item | Problem | Plan |
|---|---|---|
| **FW-8 index drift** ⚠️ | The optical index sensor on position 6 sometimes reports position 5 after a move, so a frame labelled H-alpha is in fact taken through OIII. halley catches it only when the sky background looks wrong, which is not every time. Rosa has seen it four times since August, always after a long slew on a cold night. | Tomasz suspects a loose index flag; a replacement is ordered from the maker. Until it arrives, nightjar homes the wheel twice before every H-alpha sequence and halley flags any frame whose header and background disagree. |
| **Lyra slit sticking** 🔧 | Below −5 °C the slit carriage stops a few hundred microns short, so the first spectrum of a cold night has a slit wider than the header claims and the line widths look fatter than they are. | Run the dome heater for 20 minutes before mounting Lyra. Longer term, swap the grease for a low-temperature one when the unit comes off in November. |
| **Quill offset** ⚠️ | After the June knock the seeing values run about 0.2″ high compared with stars measured on HCAM-2 frames the same night. Nothing breaks, but the seeing plot on the public page looks gloomier than the sky. | Min-jun will re-collimate it on the next clear afternoon with Tomasz watching. Until then halley applies a flat −0.2″ correction and says so in the plot caption. |
| **`ridge-arch` disk** ⚠️ | The raw FITS partition is at 78 %. At the current rate of the Variable Star Survey it reaches 90 % around mid-November, which is where the backup job starts refusing to run and leaves a very polite and very easy to miss message in its log. | Priya will move 2024 raw frames to the cold-storage drive, then decide between a second disk and compressing older raw data. Either way the decision is written up before the partition reaches 85 %. |
| **Dunmore** ❌ | The 0.4 m Newtonian is in pieces in the Workshop for the Dunmore Refurbishment: primary out for recoating, secondary cell rebuilt, tube rings still to be machined. It is red-tagged so nobody wires it to a mount by mistake. | The recoated primary is due back in October. The refurb log in `projects/dunmore/` has the full list; this row only exists so the inventory is honest. |

### Smaller niceties (not blocking anything)

- **A label printer for the Server Room.** The three hosts look identical, and twice this year someone has unplugged the wrong one. Lena has offered her outreach label maker, which prints in a cheerful font nobody asked for.
- **A shared spares list.** Spare fuses, filter-wheel belts and the one spare Sable anemometer cup are in three different drawers. A single table in this note would do.

### Smallest path to all green

1. ✅ HCAM-2 desiccant changed (March)
2. ✅ Sable rain sensor recalibrated (July)
3. ⏳ FW-8 index flag replaced — part ordered, due mid-October
4. 🔲 Quill re-collimated on a clear afternoon
5. 🔲 `ridge-arch` raw partition below 70 % — move the 2024 raw frames, then decide on the second disk
6. 🔲 Lyra re-greased when it comes off Aster in November
7. 🔲 Dunmore reassembled and moved out of this note into a normal row

## Spares

| Part | Drawer | Count |
|---|---|---|
| FW-8 drive belt | Workshop, drawer 3 | 2 |
| Sable anemometer cup | Workshop, drawer 5 | 1 |
| UPS fuses (10 A) | Server Room shelf | 6 |

- Take one, write one line in the night log.
- Take the last one, tell Tomasz the same day.

## History

This inventory started as a sheet of paper taped inside the
Workshop door, listing which cables went where. Ada asked for it
to become a note after a visiting astronomer spent an evening
looking for a filter wheel that had been in the roll-off for a
month. Last full walk-round by Min-jun Seo and Tomasz Wierzbicki
on 2026-09-28.

Changes to this note follow one rule: the row changes the same
day the hardware does. A part swapped on Tuesday and written up
on Friday is how the filter wheel went missing in the first
place. If the change is large — a new instrument, a host
retired, a telescope moved between buildings — add a dated line
here as well, so the next walk-round knows what to look for.

Questions about a row go to its owner first, then to Tomasz.
Questions about the note itself go to Min-jun.
