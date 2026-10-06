from dataclasses import dataclass
from typing import Optional

@dataclass
class Route:
    id: str
    name: str
    km: float
    tags: list[str]
    owner: Optional[str] = ...

@dataclass
class Share:
    token: str
    route: Route
    expires_at: int
    views: int = ...

def route_length(route: Route) -> float: ...
def new_share(route: Route, ttl: int) -> Share: ...

SHARE_URL_TEMPLATE: str
