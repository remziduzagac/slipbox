"""Import handler for partner GPX uploads. Started on the train, not finished."""
from .models import Route


def parse_gpx(body: bytes) -> list[Route]
    routes = []
    for chunk in body.split(b"<trk>"):
        if not chunk.strip():
            continue
        name = chunk.split(b"<name>")[1].split(b"</name>")[0]
        routes.append(Route(id=name.decode(), name=name.decode(), km=0.0)


def import_upload(request):
    routes = parse_gpx(request.body)
    # TODO: dedupe against existing routes by name + length
    return {"imported": len(routes)}
