# Observing log 2026

Night-by-night record for Halden Ridge Observatory. Times are UTC. Weather readings come from `Sable`, seeing from
`Quill` (arcsec, FWHM), sky brightness in mag/arcsec². Faults get a ticket number in the Workshop tracker. The year opened on
[the first night](#2026-01-04--first-light-of-the-year); every night's weather is under its own `### Weather`.

The rule for this page is simple: one heading per night, one table per heading, and if a night is lost to cloud it still gets a row.

---

## 2026-01-04 — first light of the year

| Time | Target / Event | Notes |
| ---- | -------------- | ----- |
| 17:42 | Dome open | 2.1 °C, RH 64 %, wind 3 m/s NW |
| 17:55 | Flats, twilight | `FW-8` B V R, 7 frames each |
| 18:40 | RZ Cas | VSS, `HCAM-2`, V, 60 s × 40 |
| 20:15 | Quill | seeing 1.8″, steady |
| 21:02 | SS Cyg | quiescent, V ≈ 12.1 |
| 23:30 | Dome closed | cloud from the west, Tern shows 60 % cover; 312 frames kept, none of them flats |

### Weather

Clear after sunset, cloud from the west by 23:00. Sable: 2.1 °C, RH 64 %.

## 2026-01-11 — Brill test night

| Time | Target / Event | Notes |
| ---- | -------------- | ----- |
| 18:05 | Roll-off open | roof motor loud on the last metre |
| 18:20 | Focus run | Brill, `HCAM-2` borrowed, best at 14 220 steps |
| 19:10 | M42 | outreach test frames for Lena, H-alpha 120 s |
| 20:00 | Fault | roof limit switch bounced twice — ticket W-0112 |
| 20:45 | Sable | 0.4 °C, RH 71 % |
| 22:10 | Roll-off closed | dew on the corrector, heater was off |

### Weather

Cold and still. Sable: −3.4 °C, RH 51 %, wind under 2 m/s all night.

## 2026-01-17 — lost to cloud

| Time | Target / Event | Notes |
| ---- | -------------- | ----- |
| 17:30 | Check | overcast, base ~900 m |
| 19:00 | Check | still overcast, light drizzle |
| 21:00 | Sable | RH 98 %, rain sensor wet |
| 21:05 | Night abandoned | nightjar queue flushed to tomorrow |
| 21:20 | Server Room | used the time to rotate `stacks` backups and test a restore to a scratch database |

### Weather

Overcast from dusk. Tern never showed a star; the dome stayed shut.

## 2026-01-24 — VSS catch-up

| Time | Target / Event | Notes |
| ---- | -------------- | ----- |
| 17:48 | Dome open | −3.5 °C, clear, wind 1 m/s |
| 18:02 | Bias + darks | 21 each, CCD at −40 °C |
| 18:30 | VSS field 07 | 11 stars, V and I, 45 s |
| 19:55 | VSS field 08 | 9 stars, one saturated (`BR-0831`), shorten to 20 s next time |
| 21:10 | VSS field 12 | 14 stars, all fine |
| 22:40 | Quill | 1.3″ — best of the month |
| 01:15 | VSS field 15 | halley flags `airmass > 2.2`, kept anyway |
| 03:05 | Dome closed | 2 612 frames ingested, 0 rejected |

### Weather

Clear, a little haze low in the south. Quill averaged 2.0″.

## 2026-02-02 — Lyra commissioning, night 1

| Time | Target / Event | Notes |
| ---- | -------------- | ----- |
| 18:10 | Lyra on Aster | Kenji on site, cable routing done in daylight |
| 18:40 | Arc lamp | Ne + Ar, 12 lines identified |
| 19:25 | Standard star | spectrophotometric standard, 300 s |
| 20:30 | Fault | Lyra slit drive stalls at 180 µm; motor current normal, so mechanical rather than electrical |
| 21:05 | Workaround | fixed slit at 150 µm for the night |
| 23:50 | Be star | Hα emission obvious in raw frame |
| 00:30 | Dome closed | Kenji happy, Tomasz less so |

## 2026-02-03 — Lyra commissioning, night 2

| Time | Target / Event | Notes |
| ---- | -------------- | ----- |
| 17:58 | Dome open | 1.2 °C, RH 55 % |
| 18:20 | Slit drive | re-greased by Tomasz, runs full range |
| 19:00 | Flat lamp | 20 flats, fringing visible past 780 nm |
| 20:10 | Nova candidate | Kenji's list, nothing unusual |
| 22:45 | Sable | wind rising, 11 m/s gusts |
| 23:00 | Dome closed | wind limit is 12 m/s; didn't wait for it |

## 2026-02-09 — public night

| Time | Target / Event | Notes |
| ---- | -------------- | ----- |
| 18:30 | Pavilion open | 46 visitors booked, 51 came |
| 18:45 | Corvid | Moon, first-quarter terminator |
| 19:20 | Corvid | Jupiter, four moons, one shadow transit |
| 20:00 | Aster live view | Orion Nebula on the pavilion screen, `HCAM-2` 5 s loop |
| 20:40 | Talk | Lena, "Why the ridge is dark", 25 min |
| 21:30 | Closed | two lost gloves, one lost child (found) |

## 2026-02-16 — Meteor Watch check

| Time | Target / Event | Notes |
| ---- | -------------- | ----- |
| 17:40 | Tern | lens cleaned, dew heater at 30 % |
| 19:00 | Detection | fireball, NE, 1.4 s, magnitude ≈ −4 |
| 21:12 | Detection | faint, probably a satellite glint |
| 23:47 | Detection | sporadic, W, 0.6 s |
| 02:30 | Tern | frame drop, 14 minutes missing |
| 05:50 | Summary | 9 detections, 2 confirmed, 7 rejected by halley |

## 2026-02-23 — Dunmore mirror out

| Time | Target / Event | Notes |
| ---- | -------------- | ----- |
| 10:00 | Workshop | primary mirror removed from Dunmore cell |
| 10:45 | Inspection | coating hazy at edge, two small pits |
| 11:30 | Measurement | mirror thickness 38 mm, weight 11.2 kg |
| 14:00 | Crate | packed for recoating, foam + desiccant, courier booked for Thursday morning |
| 16:00 | Note | no observing tonight, forecast snow |

## 2026-03-01 — Aster pointing model

| Time | Target / Event | Notes |
| ---- | -------------- | ----- |
| 18:15 | Dome open | −1.0 °C, RH 48 %, clear |
| 18:30 | Pointing run | 64 stars, all-sky grid |
| 20:20 | Model fit | RMS 14″ → 4.1″ after the new model |
| 20:35 | Check | 10 random stars, all inside the `HCAM-2` central 200 px |
| 21:00 | VSS field 03 | 12 stars, B V |
| 23:40 | Quill | 2.4″, ground layer turbulence |
| 00:10 | Dome closed | model saved as `aster-2026-03.pmod` |

## 2026-03-08 — spring equinox prep

| Time | Target / Event | Notes |
| ---- | -------------- | ----- |
| 18:25 | Dome open | 4.8 °C, wind 2 m/s S |
| 18:40 | Twilight flats | all eight `FW-8` slots, OIII last |
| 19:30 | M51 | outreach image, L 300 s × 12 |
| 21:15 | Fault | `ridge-ctl` clock drifted 2.3 s, chrony restarted |
| 21:30 | M51 continued | re-shot the first four frames with good timestamps |
| 23:55 | Dome closed | high cirrus arriving |

## 2026-03-15 — Dark Sky Campaign survey

| Time | Target / Event | Notes |
| ---- | -------------- | ----- |
| 20:00 | Sky meter | zenith 21.42 mag/arcsec² |
| 20:10 | Sky meter | toward Marrowby, 20.31 |
| 20:20 | Sky meter | toward the quarry, 21.05 |
| 21:00 | Tern | all-sky frame for the council report |
| 21:30 | Note | new LED on Mill Road is visible from the dome, unshielded and roughly 4 000 K by eye |
| 22:00 | Follow-up | Ada to write to the council lighting officer |

## 2026-03-22 — Lyra science, first run

| Time | Target / Event | Notes |
| ---- | -------------- | ----- |
| 18:30 | Dome open | 3.6 °C, RH 52 % |
| 18:50 | Arcs + flats | standard Lyra calibration block, 22 minutes |
| 19:30 | T CrB | 3 × 600 s, Kenji's monitoring target |
| 21:15 | V Sge | 2 × 900 s, S/N ≈ 40 at 5 000 Å |
| 23:00 | Fault | guider lost the star twice, wind shake |
| 00:40 | Dome closed | halley reduction queued on `ridge-arch` |

## 2026-03-29 — Tern replacement lens

| Time | Target / Event | Notes |
| ---- | -------------- | ----- |
| 14:00 | Tern | fisheye lens swapped, focus by hand in daylight |
| 18:45 | Test frames | stars round to 60° zenith, soft beyond |
| 19:30 | Fault | Tern dome heater tripped the pavilion RCD |
| 19:40 | Fix | heater moved to its own circuit, ticket W-0147 |
| 22:00 | Detection | two sporadics, both confirmed |

## 2026-04-05 — VSS long night

| Time | Target / Event | Notes |
| ---- | -------------- | ----- |
| 19:05 | Dome open | 7.1 °C, clear, dry |
| 19:20 | VSS field 18 | 16 stars, V |
| 20:40 | VSS field 19 | 10 stars, V I |
| 22:00 | VSS field 21 | 13 stars, one new variable candidate at 18:04:12 +38:21 |
| 23:30 | Quill | 1.6″ |
| 01:00 | VSS field 22 | 8 stars |
| 02:30 | VSS field 24 | 12 stars, B V R |
| 04:10 | Dome closed | 3 104 frames, a new record |

## 2026-04-12 — intern first night

| Time | Target / Event | Notes |
| ---- | -------------- | ----- |
| 19:15 | Dome open | Min-jun on the console, Rosa watching |
| 19:30 | Checklist | night-start script `night-up.sh` run by hand, step by step |
| 20:00 | Target | M13, `HCAM-2`, V 60 s × 20 |
| 21:40 | Fault | wrong filter selected (R instead of V), caught after 8 frames; the checklist now says to read `FW-8` back |
| 22:30 | Target | M3, V 60 s × 20 |
| 23:50 | Dome closed | `night-down.sh`, everything parked |

## 2026-04-19 — Lyrid watch, week 1

| Time | Target / Event | Notes |
| ---- | -------------- | ----- |
| 20:30 | Tern | full-night run started |
| 22:14 | Detection | Lyrid, 0.9 s, bright |
| 23:58 | Detection | Lyrid, 0.4 s |
| 00:37 | Detection | sporadic from the south |
| 02:05 | Detection | Lyrid, with a short train |
| 04:10 | Summary | 11 detections, 6 Lyrids |

## 2026-04-22 — Lyrid peak

| Time | Target / Event | Notes |
| ---- | -------------- | ----- |
| 20:40 | Pavilion open | Yusuf and 12 members of the Marrowby astronomy club |
| 21:10 | Sable | 5.5 °C, RH 44 %, calm |
| 22:00 | Visual count | 9 per hour, three observers |
| 00:00 | Visual count | 14 per hour |
| 01:30 | Tern | 23 detections so far |
| 02:30 | Visual count | 17 per hour — best rate of the night |
| 04:40 | Summary | 41 Tern detections, 28 Lyrids |

## 2026-05-03 — Dunmore mirror back

| Time | Target / Event | Notes |
| ---- | -------------- | ----- |
| 09:30 | Delivery | recoated mirror arrived, crate dry |
| 11:00 | Install | mirror in cell, three-point support checked |
| 14:30 | Collimation | laser first, Barlow method second |
| 21:00 | Star test | Vega, rings concentric either side of focus |
| 22:10 | Fault | tube currents, 40 minutes to settle; the fan was left off after the rebuild |
| 23:00 | Note | Dunmore usable for outreach, not science yet |

## 2026-05-17 — short night

| Time | Target / Event | Notes |
| ---- | -------------- | ----- |
| 21:10 | Dome open | 11.3 °C, wind 6 m/s W |
| 21:30 | VSS field 30 | 9 stars, V |
| 22:20 | Fault | `HCAM-2` shutter error `E41`, power-cycled |
| 22:35 | VSS field 30 | redone from the start |
| 23:40 | Dome closed | cloud from the south-west |

## 2026-06-07 — midsummer week

| Time | Target / Event | Notes |
| ---- | -------------- | ----- |
| 21:50 | Twilight | no astronomical dark until July 10 |
| 22:15 | Aster | bright targets only, VSS fields 40–42 |
| 23:30 | Quill | 2.0″ |
| 00:50 | Noctilucent cloud | Tern frames kept for the outreach blog |
| 01:30 | Dome closed | 4.2 hours of usable sky across the week |

## 2026-06-21 — maintenance day

| Time | Target / Event | Notes |
| ---- | -------------- | ----- |
| 09:00 | Dome | shutter drive belt replaced |
| 10:30 | Aster | primary mirror washed, first time since 2024 |
| 13:00 | `ridge-ctl` | OS updates, nightjar pinned to 3.4 |
| 14:30 | Sable | anemometer bearing replaced |
| 16:00 | Quill | recalibrated against Aster FWHM, offset 0.2″ |
| 17:30 | Test | dome rotation, 360° in 94 s |

## 2026-07-12 — Brill and Corvid together

| Time | Target / Event | Notes |
| ---- | -------------- | ----- |
| 22:10 | Roll-off open | 16.2 °C, RH 58 % |
| 22:25 | Brill | M27, OIII + H-alpha, 300 s each |
| 23:00 | Corvid | Saturn for the late visitor group |
| 00:30 | Fault | Brill mount lost alignment after a cable snag |
| 00:50 | Fix | two-star realign, 18 minutes lost |
| 02:10 | Roll-off closed | dew point 0.8 °C away |

## 2026-07-26 — Lyra, T CrB watch

| Time | Target / Event | Notes |
| ---- | -------------- | ----- |
| 21:55 | Dome open | 14.0 °C, clear |
| 22:10 | Calibrations | arcs, flats, 20 min |
| 22:40 | T CrB | 4 × 600 s, no change from March |
| 00:20 | Standard | second standard star, airmass 1.1 |
| 01:15 | Note | Kenji asks for weekly spectra until September |
| 01:30 | Dome closed | wind gusting to 13 m/s — above limit |

## 2026-08-12 — Perseid peak

| Time | Target / Event | Notes |
| ---- | -------------- | ----- |
| 21:30 | Pavilion open | 88 visitors, car park full by 21:50 |
| 22:00 | Corvid | Moon avoided, pointed at Albireo instead |
| 23:00 | Visual count | 32 per hour |
| 00:30 | Tern | 71 detections so far, 4 fireballs |
| 02:00 | Visual count | 58 per hour, the crowd cheered at every one |
| 03:30 | Summary | 164 Tern detections, 131 Perseids, one lost car key (not found), one found car key (not the lost one) |

## 2026-08-23 — power cut

| Time | Target / Event | Notes |
| ---- | -------------- | ----- |
| 22:04 | Dome open | 12.6 °C |
| 22:30 | VSS field 44 | 11 stars, V |
| 23:17 | Power cut | whole ridge, UPS took over |
| 23:19 | Dome | closed on UPS power, telescope parked |
| 23:55 | Power back | `ridge-arch` did not restart, fsck on `/data` |
| 01:40 | Recovery | `stacks` intact, 38 frames from 23:10–23:17 lost |

## 2026-09-05 — autumn VSS start

| Time | Target / Event | Notes |
| ---- | -------------- | ----- |
| 20:40 | Dome open | 10.9 °C, RH 61 % |
| 21:00 | VSS field 50 | 14 stars, V I |
| 22:30 | VSS field 51 | 12 stars, V |
| 00:10 | Quill | 1.5″ |
| 01:30 | VSS field 53 | 10 stars, one flagged by halley as `variable?` |
| 03:30 | Dome closed | 1 948 frames |

## 2026-09-20 — Dunmore science test

| Time | Target / Event | Notes |
| ---- | -------------- | ----- |
| 20:10 | Dunmore | first science frames with the spare `HCAM-2` adapter |
| 20:50 | Target | NGC 7789, V 90 s × 15 |
| 22:00 | Measurement | FWHM 2.6″ against Quill 1.9″, tilt suspected |
| 22:40 | Fault | focuser slips under the camera weight |
| 23:30 | Note | Tomasz to fit a stiffer focuser before October |

## 2026-09-24 — Lyra slit drive, again

| Time | Target / Event | Notes |
| ---- | -------------- | ----- |
| 19:45 | Dome open | 9.4 °C, RH 66 %, wind 4 m/s NW |
| 20:00 | Arc lamp | Ne + Ar, line centres shifted 0.6 px since July |
| 20:30 | Fault | slit drive stalls at 180 µm again, same symptom as February |
| 20:40 | Workaround | fixed slit at 150 µm, as before; Tomasz notified by message |
| 21:10 | T CrB | 3 × 600 s, weak Hα, no sign of outburst |
| 22:30 | Standard | spectrophotometric standard at airmass 1.3, 300 s |
| 23:15 | Sable | RH climbing past 80 %, dew point 3.1 °C away |
| 23:50 | Be star | 2 × 600 s, emission stronger than in March |
| 00:20 | Dome closed | humidity limit; halley reduction queued on `ridge-arch` |

## 2026-09-27 — week summary and open faults

| Date | Item | Status |
| ---- | ---- | ------ |
| 09-21 | `HCAM-2` shutter error `E41` | seen once more, logged against W-0163, spare shutter on order |
| 09-22 | Tern frame drops | 3 gaps of 5–12 min, USB hub replaced, watching |
| 09-23 | `ridge-ctl` clock | chrony now polls every 64 s, drift under 20 ms |
| 09-24 | Lyra slit drive | still stalls at 180 µm, Tomasz strips it down on Tuesday |
| 09-25 | Dunmore focuser | stiffer focuser fitted, star test waiting for a clear night |
| 09-26 | `FW-8` slot 6 (OIII) | slow to seat, about 1.8 s instead of 0.9 s — cleaned the detent |
| 09-26 | Quill | offline for 40 min after a network switch reboot, no data lost |
| 09-27 | nightjar | queue for October loaded: VSS fields 55–62, Lyra weekly T CrB |
