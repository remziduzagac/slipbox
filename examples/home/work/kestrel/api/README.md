# Kestrel API

The Python service behind the app: routes, shares and the sync endpoints. It owns the OpenAPI spec; the web app and
the Go uploader both generate their clients from it.

## Run it

```bash
cd api
python3 -m venv .venv && . .venv/bin/activate
pip install -e '.[dev]'
python -m kestrel_api.app --port 8080
```

Settings come from `settings.json5` (local overrides) and `../config/app.toml` (the shared defaults). Set
`KESTREL_ENV=staging` to point at the staging queue; see the [dev setup](../docs/dev-setup.md) for the rest.

## Test

```bash
pytest -q            # unit tests, no network
pytest -q -m slow    # the sync tests that need a local Redis
ruff check . && pyright
```

`ruff` and `pyright` are configured in `pyproject.toml`; CI runs the same two commands.

## The spec

The contract is [`openapi.yaml`](openapi.yaml). From the repository root it is [/api/openapi.yaml](/api/openapi.yaml),
and that is the form the CI workflow uses. Shared shapes live in `schemas/`: `route.json` for a route and
`common.json` for the ids and points both it and the spec reuse.

Change the spec first, then the handlers. The `x-sync` extension on each path says whether the endpoint takes part in
the offline queue, and [ADR 0001](../docs/adr/0001-offline-first-sync.md) explains why.

## The generated reference

`openapi.yaml` is rendered to [the API reference](../docs/generated/api.md) by `make docs`. The folder is in
`.gitignore` (a copy is committed for the site): regenerate it with `make docs`, never edit it by hand.

## Layout

| Path | What is in it |
| --- | --- |
| `kestrel_api/app.py` | The app factory and the route registrations |
| `kestrel_api/models.py` | Dataclasses for routes and shares |
| `kestrel_api/sync.py` | The sync endpoints, the biggest module |
| `kestrel_api/half_written.py` | Sam's unfinished import handler, kept out of the app until it parses |
| `scripts/migrate_v1.py` | The 2019 migration; run once, kept for the record |
| `schemas/` | JSON schemas shared with the web app |

## Known rough edges

- `half_written.py` does not parse. It is not imported anywhere, so the service runs, but `ruff` reports it.
- `migrate_v1.py` is Python 2 and is excluded from the lint config on purpose.
