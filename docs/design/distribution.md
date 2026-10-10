# Distribution

How slipbox gets from this repository to someone's machine, and what keeps that path honest (plan `14.x`). Decided
with the user on 2026-10-10, after trailscout's packaging design (`docs/plan.md`, "Distribution"): macOS and Linux
first, Windows if it isn't difficult; no signing at first; a daily update check, on; XDG's folders kept.

## Folders

`core/paths.ts`, `storeDir` (`14.9`). Every file slipbox keeps is one of four kinds — config, cache, state, data —
and each kind has one folder (decision `0.10`, `docs/design/decisions.md`, which lists what's in each):

| Platform | Config | Cache, state, data |
| --- | --- | --- |
| Linux, macOS | `~/.config/slipbox` | `~/.cache/slipbox`, `~/.local/state/slipbox`, `~/.local/share/slipbox` |
| Windows | `%APPDATA%\slipbox` | `%LOCALAPPDATA%\slipbox\cache`, `\state`, `\data` |

An `XDG_*` variable set to an absolute path is taken on every platform. macOS keeps XDG's folders, not `~/Library`:
the dotfiles people keep and sync are there. On Windows the config may roam with a profile; a database never does.

The cache carries a `CACHEDIR.TAG` (`ensureCacheHome`), written when the cache is first made — by the link index, the
search index, the parse cache or a picture — so backup tools that know the tag skip it: it's all rebuilt when missing.

## The supply chain

`scripts/check-deps.ts` (`14.10`) runs in `bun run check` and in CI, and fails on:

- **A version not exact** in `package.json`, dependencies and dev dependencies alike. `bun.lock` pins the rest, and
  CI installs with `--frozen-lockfile`.
- **An install gate off** in `bunfig.toml`'s `[install]`: `ignoreScripts = true` (no package's install script runs —
  the tree-sitter grammars' would build native bindings slipbox doesn't use), `minimumReleaseAge = 604800` (a version
  is taken only once it's been published a week: a package taken over and republished is mostly found and pulled by
  then), and `exact = true` (so `bun add` pins).
- **A licence slipbox doesn't take**, in any package the binary can bundle: `package.json`'s dependencies and theirs,
  found as Node finds them, optional ones where installed. Taken: permissive licences (MIT, ISC, BSD, Apache-2.0,
  0BSD, BlueOak, Zlib, CC0, Unlicense), an SPDX expression's `OR` by either side and `AND` by both. Weak copyleft is
  taken only by name, each one asked about first (`NAMED`: `elkjs`, EPL-2.0; `@resvg/resvg-wasm`, MPL-2.0; and
  `dictionary-en`'s SCOWL terms). A package naming no licence fails, unless its own `LICENSE` was read and recorded
  (`DECLARED`: `png-js`, `typeahead`).
- **An action not pinned** by its commit's full hash in `.github/workflows/`: a tag can be moved. A pinned action's
  version, too, is a week old before it's taken. CI runs with `contents: read` and checks out without keeping
  credentials.

## Notices

`bun scripts/check-deps.ts --notices <file>` writes, from the same walk, the third-party notices a release ships beside
the binary (`14.2`): every package's own licence and notice files; where a package ships none, the standard text of
its licence (`notices/licenses/`, from SPDX's list) with its author put in; for a licence that asks for the source
(MPL, EPL, LGPL), where the source is. Then what's compiled into packages' WebAssembly and has no package of its own —
Hunspell (taken under MPL-1.1) in `hunspell-asm`, libwebp in `@jsquash/webp` — and Bun's own licence page, since the
runtime is in the binary: Bun is MIT, and links JavaScriptCore and WebKit (LGPL-2), tinycc (LGPL-2.1) and the
libraries it lists, the LGPL's text after it. slipbox's own licence is still to decide (`14.6`).
