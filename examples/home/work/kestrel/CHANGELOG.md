+++
title = "Kestrel changelog"
tool = "release-tool"
version = 0.4.1
updated = 2026-09-30
+++

# Changelog

All notable changes to Kestrel are listed here. The format follows [Keep a Changelog][keepachangelog], and the
project follows [Semantic Versioning][semver]. The release tool writes the version headings and the compare links
at the bottom of this file; people write everything between them.

## [Unreleased]

### Added

- Retry budget for the sync queue, see ADR 0004 (`docs/adr/0004-retry-budget.md`). Behind the `retry_budget`
  feature flag until 2.4.

### Changed

- The docs site builds from `mkdocs.yml` on every merge to `main`, not just on release.

## [2.3.0] - 2026-09-30

Route sharing and the offline sync rewrite. The full story, with screenshots and the upgrade notes, is in the
[2.3 release notes](docs/release-notes/2.3.md).

### Added

- **Route sharing.** A rider can share a route with a signed link that expires after 72 hours by default.
  Anyone with the link can view the route; only the owner can edit it. ([#412][pr-412])
- Share dialog in the route map, with copy-link and "stop sharing" buttons. ([#431][pr-431])
- `GET /v1/shares/{id}` and `DELETE /v1/shares/{id}` in the API.
- Offline-first sync: edits are written to a local op log and replayed against the server when the network is back.
  ([#388][pr-388])
- `scripts/drain-queue.sh` for support, to drain a stuck sync queue by hand.

### Changed

- The route engine's edge costs now come from `crates/route-engine`; the Python cost model is gone. ([#401][pr-401])
- `config/regions.yaml` carries a tile `endpoint` per region instead of one global tile server.
- Minimum supported browsers: Safari 16, Chrome 110.

### Fixed

- The sync queue no longer stalls when a single op is rejected with a 409; it is parked and the rest go on.
  This is the bug behind the incident of 2026-09-22. ([#419][pr-419])
- Route names with combining marks were cut in the middle of a grapheme in the route list.
- Share links with a trailing `.` pasted from chat clients no longer 404.

### Security

- Share links are HMAC-signed with a per-environment secret; the old unsigned `?route=` links stop working on
  2026-12-31.

## [2.2.1] - 2026-08-19

### Fixed

- Elevation profile crashed on routes with no elevation data (all-flat GPX files).
- `Cargo.lock` was out of date after the 2.2.0 release; the engine build now uses `--locked`.

## [2.2.0] - 2026-07-28

### Added

- GPX export for saved routes.
- Dark map style, following the system setting.

### Changed

- Segment export (`data/segments.csv`) quotes every field that contains a comma, a quote or a newline.

### Removed

- The Android prototype's importer is no longer built (`legacy/`). It is kept for reference.

## [2.1.0] - 2026-05-12

### Added

- Saved routes sync between devices (online only).
- Region config: Netherlands, Denmark and the Alps.

## [2.0.0] - 2026-02-03

First release of the rewritten app: a TypeScript web client, a Python API and the Rust route engine.

### Removed

- The 1.x Android app and its Ruby importer.

## [1.4.0] - 2019-11-20

### Fixed

- The GPX importer rejected files whose first track had no name.

[keepachangelog]: https://keepachangelog.com/en/1.1.0/
[semver]: https://semver.org/spec/v2.0.0.html
[pr-388]: https://github.com/kestrel-labs/kestrel/pull/388
[pr-401]: https://github.com/kestrel-labs/kestrel/pull/401
[pr-412]: https://github.com/kestrel-labs/kestrel/pull/412
[pr-419]: https://github.com/kestrel-labs/kestrel/pull/419
[pr-431]: https://github.com/kestrel-labs/kestrel/pull/431
[Unreleased]: https://github.com/kestrel-labs/kestrel/compare/v2.3.0...HEAD
[2.3.0]: https://github.com/kestrel-labs/kestrel/compare/v2.2.0...v2.3.0
[2.2.1]: https://github.com/kestrel-labs/kestrel/compare/v2.2.0...v2.2.1
[2.2.0]: https://github.com/kestrel-labs/kestrel/compare/v2.1.0...v2.2.0
[2.1.0]: https://github.com/kestrel-labs/kestrel/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/kestrel-labs/kestrel/compare/v1.4.0...v2.0.0
[1.4.0]: https://github.com/kestrel-labs/kestrel/releases/tag/v1.4.0
