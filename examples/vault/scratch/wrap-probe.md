# Wrap probe

Table A — ordinary prose, no long tokens. Should wrap and fit.

| Setting | What it does | When it bites |
| --- | --- | --- |
| dew heater | Warms the corrector plate on Aster so that condensation never forms on cold, still nights near the ridge. | Only from firmware 3.2 onward, so an older controller silently keeps running the heater at full power. |
| auto-flat | Takes twilight flat fields automatically when the sky brightness falls inside the configured window. | Disabling it means somebody has to remember to take flats by hand before the first science frame. |

Table B — one very long unbreakable token. Suspected overflow case.

| Setting | Value | Note |
| --- | --- | --- |
| path | `/srv/halley/archive/2026/hcam2/raw/night-2026-03-14/calibration/flats/v-band/master-flat-v.fits` | A single token that cannot be broken at any word boundary at all. |
| url | <https://archive.example.org/halden-ridge/instruments/hcam-2/calibration/flat-fields/2026/v-band/master.fits> | Same again, even longer, also unbreakable. |
