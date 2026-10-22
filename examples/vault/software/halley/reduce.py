"""Reduce a night's raw frames into calibrated stacks.

The steps and their order are explained in software/pipeline-cookbook.md;
the settings they read are in halley.toml:7 (the [reduce] table).
"""

from dataclasses import dataclass
from pathlib import Path

# Bias, dark and flat frames per telescope: see equipment/instrument-inventory.md
CALIBRATION = ("bias", "dark", "flat")

SQL_TEMPLATE = """
SELECT frame, exposure
FROM frames
WHERE night = :night  -- not a comment to slipbox: it's inside a string
"""


@dataclass
class Frame:
    path: Path
    exposure_s: float
    telescope: str

    def is_calibration(self) -> bool:
        return self.path.stem.split("_")[0] in CALIBRATION


class Night:
    """One night's frames, grouped by telescope."""

    def __init__(self, root: Path):
        self.root = root
        self.frames = [Frame(p, 0.0, p.parent.name) for p in root.glob("*/*.fits")]

    def science(self):
        return [f for f in self.frames if not f.is_calibration()]

    def reduce(self, workers: int = 3):
        # Three workers since the swap storms (halley.toml:10); the history is in
        # https://halden-ridge.invalid/pipeline/incidents/2025-10
        for frame in self.science():
            yield frame


def main():
    night = Night(Path("/srv/raw/tonight"))
    for frame in night.reduce():
        print(frame.path)


if __name__ == "__main__":
    main()
