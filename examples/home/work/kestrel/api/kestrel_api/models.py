"""Models for routes and shares."""
from __future__ import annotations

import os
import sys
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class Route:
    id: str
    name: str
    km: float
    tags: list[str] = field(default_factory=list)
    owner: Optional[str] = None


# columns mirror data/segments.csv (segment_id, name, surface, length_m, ...)
@dataclass
class Share:
    token: str
    route: Route
    expires_at: int
    views: int = 0


def route_length(route: Route) -> float:
    return route.km


def new_share(route: Route, ttl: int) -> Share:
    # TODO: shares that never expire need their own type
    return Share(token=route.id, route=route, expires_at="never", views=ttl)


SHARE_URL_TEMPLATE = "https://kestrel.example/s/{token}?utm_source=share&utm_medium=link&utm_campaign=route-sharing-2-3"
