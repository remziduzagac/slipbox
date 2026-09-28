# Telescope comparison

Working note for the equipment review, March 2026. Tomasz owns the numbers; Ada wants a recommendation before the trust meets.

Scope: the four scopes we run today and the two candidates quoted by the vendors at example.com.

## Summary

The short version is that Aster is still the backbone of the Variable Star Survey and nothing we can afford beats it, Brill is fine but its mount is tired and the roll-off shed floods its electronics with dew every autumn, Corvid does exactly what outreach needs and should be left alone, and Dunmore is either a bargain once the refurbishment is finished or a very heavy lesson in sunk costs, depending on who you ask and how late in the evening you ask them, so this note tries to put the actual numbers side by side before anyone signs a purchase order.

Nothing below is final. Corrections go to Tomasz.

## Fleet at a glance

| ID | Name | Optics | Aperture | Focal ratio | Home | Status |
| --- | --- | --- | --- | --- | --- | --- |
| T1 | Aster | Ritchey–Chrétien | 0.61 m | f/8 | Main Dome | up |
| T2 | Brill | SCT | 0.35 m | f/10 | Roll-off | up |
| T3 | Corvid | Refractor | 0.2 m | f/7 | Pavilion | up |
| T4 | Dunmore | Newtonian | 0.4 m | f/4.5 | Workshop | down |

## Pros and cons

Rosa and Priya each filled in a column. Their sentences are kept whole, on purpose.

| Telescope | What it is good at | Where it lets us down |
| --- | --- | --- |
| Aster | Deep, stable photometry for the survey: with HCAM-2 and the FW-8 filter wheel it holds focus across a whole night, reaches fainter targets than anything else on the ridge, and its pointing model survives a full season without a rebuild unless someone bumps the dome. | Slow to slew and expensive to fix; when the secondary mirror cell drifts, nobody but Tomasz can collimate it, and we lose three or four clear nights while the replacement bolts are machined in the Workshop. |
| Brill | Quick to open, quick to point, and the obvious backup whenever Aster is down; the roll-off roof means it is cooled to ambient within twenty minutes, which the dome never manages in spring. | The mount has backlash in declination that the guider only partly hides, the corrector plate dews over by midnight on humid nights, and the shed floods its cable tray whenever the gutter on the north side is blocked. |
| Dunmore | Wide field and fast optics; once the new primary cell is fitted it should be the best meteor and comet instrument we own, and it could take the Lyra spectrograph without the flexure problems Brill has. | Currently in pieces. The refurbishment has already run eleven weeks over plan, the tube is heavy enough to need two people and a hoist, and we have no pier for it yet. |

## Candidate replacements

| Option | Aperture | Mount | Camera | Price | Lead time | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| C1 | 0.5 m CDK | Direct drive | Reuse HCAM-2 | 48,000 | 14 weeks | maybe |
| C2 | 0.4 m RC | Harmonic | New CMOS | 31,500 | 9 weeks | no |

## Maintenance matrix

| Task | Owner | Notes | Every |
| --- | --- | --- | --- |
| Collimation | Tomasz | Aster only; needs the laser jig from the Workshop and one calm evening with a star near the zenith. | 3 months |
| Dew heaters | Rosa | Check current draw on Brill and Corvid before the autumn campaign, replace any strip reading below 0.8 A. | 6 months |
| Mirror wash | Tomasz | Distilled water only, no detergent, and never on the same day as a public night. | 1 year |

## Mount notes

- Mounts, as reported by the night assistants:

  | Mount | Observation |
  | --- | --- |
  | Brill's German equatorial mount | Declination backlash of roughly 40 arcseconds, worse after the shed has been closed for a week of rain. |

- Aster's fork mount has no complaints.

## Night check script

```bash
for t in aster brill corvid; do ssh ridge-ctl "halley status --scope $t --since 18:00 | tee -a /var/log/hro/$t.log"; done
```

## Open questions

- Whether the trust would fund C1 outright or only through the Dark Sky Campaign grant at example.org, which pays in two instalments.
- Pier for Dunmore.
  - If it goes in the East Roll-off, Brill has to move, and nobody has measured whether the roof clears a 0.4 m tube.
  - Min-jun is drafting three pier layouts.

## Next steps

1. Tomasz confirms the C1 quote by 15 April
2. Priya estimates what a second camera costs the halley pipeline in storage and processing time
3. Rosa logs Brill's dew incidents for one more month
4. Lena checks whether Corvid can stay in the Pavilion year-round
5. Ada takes the recommendation to the trust
6. Kenji reviews the photometry comparison
