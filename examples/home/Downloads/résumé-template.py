#!/usr/bin/env python3
"""Fill the résumé template from a small JSON file and print it as plain text."""
import json
import sys


def render(data: dict) -> str:
    lines = [data["name"], "=" * len(data["name"]), ""]
    for job in data.get("expérience", []):
        lines.append(f"{job['début']} - {job['fin']}  {job['poste']}, {job['société']}")
    return "\n".join(lines)


if __name__ == "__main__":
    with open(sys.argv[1], encoding="utf-8") as f:
        print(render(json.load(f)))
