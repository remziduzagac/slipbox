# Kestrel

[![build][ci-badge]][ci]
[![release](https://img.shields.io/badge/release-2.3.0-blue.svg)](CHANGELOG.md)
[![license: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
![](https://img.shields.io/badge/rust-1.82-orange.svg)
![missing badge](docs/img/coverage-badge.svg)

Kestrel plans cycling routes. Give it where you are and where you want to be, and it finds a route that prefers quiet
streets, bike paths and gentle gradients over the shortest line. Routes are saved to your account, work offline, and
since 2.3 can be shared with a link.

- A web app (TypeScript, React) in `src/`
- An API (Python) in `api/`
- A route engine (Rust) in `crates/`
- Tools (Go) in `tools/`, scripts (bash, Lua) in `scripts/`

## Quick start

```bash
git clone git@github.com:kestrel-labs/kestrel.git
cd kestrel
cp .env.example .env
npm ci
docker compose up -d postgres redis tiles
make dev
```

Open `http://localhost:5173`. The API listens on port 8080, the tile server on 8081, and
[mailhog](http://localhost:8025) catches every email the app sends.

## Documentation

Everything is under `docs/`. Start with [the architecture](docs/architecture.md) for how the pieces fit together.

| Read | When |
| --- | --- |
| [Architecture](/docs/architecture.md) | you want the map |
| [Developer setup](docs/dev-setup.md) | something does not start |
| [Sync](docs/sync.md) | edits go missing between devices |
| [Deploy runbook](/docs/runbooks/deploy.md) | you are shipping |
| [ADR 1: offline-first sync](/docs/adr/0001-offline-first-sync.md) | you ask why sync works like this |
| [Route sharing](docs/features/route-sharing.md) | you touch share links |

Contributions are welcome: see [CONTRIBUTING.md](CONTRIBUTING.md). What changed in each release is in
[CHANGELOG.md](CHANGELOG.md).

## Packages

| Package | Path | Language | What it is |
| --- | --- | --- | --- |
| web | `src/` | TypeScript | the map and the route UI |
| api | `api/` | Python | accounts, saved routes, shares |
| route-engine | `crates/route-engine/` | Rust | the A* search and edge costs |
| tiles | `crates/tiles/` | Rust | tile math |
| uploader | `tools/uploader/` | Go | GPX bulk upload |
| greeter | `tools/greeter/` | eight languages | the onboarding kata |
| geo-tiles | `vendor/geo-tiles/` | Rust | a submodule: the upstream tile cutter |

The `vendor/geo-tiles` submodule is recorded in `.gitmodules`; run `git submodule update --init` only if you work on
the tile cutter.

## Status

Kestrel is in production at [kestrel.dev](https://kestrel.dev). 2.3.0 shipped on 2026-09-30.

## Demo

A recorded ride, kept in Git LFS (`assets/demo-ride.mp4`), shows the planner end to end. Pull it with
`git lfs pull --include assets/`.

## License

[MIT](LICENSE). Copyright Kestrel Labs.

[ci-badge]: https://github.com/kestrel-labs/kestrel/actions/workflows/ci.yml/badge.svg
[ci]: https://github.com/kestrel-labs/kestrel/actions
