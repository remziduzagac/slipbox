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

## Releases

`scripts/release.ts` (`14.2`), in two steps. `build` compiles each target — this machine's when none is named — with
package.json's own `build`, so its autoload flags are always on (`14.1`), and defines the release in it
(`core/release.ts`, `RELEASE`: the repository releases come from and the platform it's for). A target built for this
machine is run once (`--version`) first. Each is packed, with its notices, as `slipbox-<version>-<target>.tar.gz`, a
folder of that name inside. `finish` writes `SHA256SUMS` over the packs, refusing another version's beside them, and
the installer.

| Asset | Bun's target |
| --- | --- |
| `darwin-arm64` | `bun-darwin-arm64` |
| `darwin-x64` | `bun-darwin-x64-baseline` |
| `linux-x64` | `bun-linux-x64-baseline` |
| `linux-arm64` | `bun-linux-arm64` |

x64 takes Bun's baseline build: it runs on any x64 processor, with no AVX2 asked for, and a terminal program loses
nothing by it. The version is package.json's, which must be `src/version.ts`'s, and the tag's. The repository is
`--repo owner/name`, or origin's on GitHub; it's checked strictly, as it goes into addresses and the installer.

Run from source, or built by hand (`bun run build`), slipbox has no `RELEASE`: it has no channel, so `upgrade` and the
update check leave it alone. A release build says its own in `info` (`release`, and the first line).

CI (`.github/workflows/release.yml`) does it on a tag `v<version>`: each platform built on a runner of its own, after
the whole check passes there — that platform's OpenTUI package is installed only there, and a Mac's binary is signed
by Bun on a Mac, its signature checked (`codesign --verify`). Then the packs are summed, attested (who built each, from
which commit: `gh attestation verify <pack> --repo <owner/name>`), and the release drafted. Nothing is published until
a person publishes the draft. The workflow can't have run yet: the repository has no remote.

Building another platform here works when its OpenTUI package is installed (`bun install --os <os> --cpu <cpu>`):
Bun fixes the platform at build time, so only that platform's package is bundled.

## Installing

`finish` also writes `install.sh` (`14.7`): `scripts/install.template.sh` with the release's version, repository and
each pack's SHA-256 written in — so a pack that isn't the one released is refused, wherever it came from. It's a
release asset, run as

```bash
curl -fsSL https://github.com/<owner>/<name>/releases/latest/download/install.sh | sh
```

POSIX `sh` (dash, bash, macOS's), the whole of it a function called on its last line, so a download cut short runs
nothing. In order:

1. **The platform**, from `uname`: Linux or macOS, x64 or arm64; a Mac terminal under Rosetta gets the arm64 build;
   musl (Alpine) is refused until `14.5`, as is any other system (Windows is `14.12`).
2. **A slipbox already there** — `~/.local/bin/slipbox`, or `$SLIPBOX_BIN_DIR`'s — that isn't this installer's link
   (a launcher from `scripts/install-local.sh`, another install) is left as it is: the installer stops and says so,
   before downloading anything.
3. **The pack** downloaded (curl, https only, or wget), its SHA-256 checked against the one written in, unpacked in a
   temporary folder (removed however it ends), and its binary run: it must say `slipbox <version>`. Any of these
   failing installs nothing.
4. **Installed** into slipbox's data folder (`$XDG_DATA_HOME/slipbox`, an absolute one, else `~/.local/share/slipbox`):
   `versions/<version>/` (the binary and its notices), `current` a relative link to it, and the link
   `~/.local/bin/slipbox` → `<data>/current/slipbox`. Where that link is goes in `<data>/bin-link`, for `uninstall`.
   Run again, the same version is put back in place.
5. **The PATH**: when the link's folder isn't on it, how to add it is said.

Nothing runs as root and nothing outside those two places is touched. `SLIPBOX_RELEASES_URL` fetches the packs from
elsewhere laid out as GitHub's releases are (`<base>/download/v<version>/<pack>`) — a mirror, or the tests' folder
through `file://` — and their sums are still the release's.

## Updates

`core/update.ts` (`14.4`). The latest release is found from its `SHA256SUMS`, at
`<releases>/latest/download/SHA256SUMS` — one small file: its packs' names carry the version, and its lines the sum
each download is checked against. A plain GET of a public file; nothing identifying is sent. `<releases>` is
`https://github.com/<repo>/releases`, or `SLIPBOX_RELEASES_URL`: another place laid out the same way (a mirror, the
tests' folder through `file://`), the installer's too.

**The daily check** is the TUI's, never the CLI's — agents call the CLI. It asks only when this is a release build,
`[update] check` is on in your own config (a folder's config can't turn it on: a network request is yours to allow),
`DO_NOT_TRACK` isn't set (anything but `0` or `false`), and a day has passed since the last time
(`$XDG_STATE_HOME/slipbox/update.json`, kept before asking, so a failure waits a day too). A newer release is said in
the message line: `slipbox 0.3.0 is out (this is 0.2.0): slipbox upgrade installs it`.

**`slipbox upgrade`** moves the installer's install to the latest release (`--check`: only says whether there is
one). From source, or a binary the installer didn't put in `versions/`, it says so and does nothing. Otherwise, as the
installer would: the pack downloaded, its SHA-256 checked against its `SHA256SUMS` line, unpacked beside the others,
its binary run — it must say its version — and only then `current` moved, in one step (a link made beside it and
renamed over it). The version replaced is kept, to go back to (`ln -sfn versions/<old> <data>/current`); any older
one is removed. Any check failing changes nothing.

## Uninstalling

`slipbox uninstall` (`14.8`, `core/install.ts`) lists every path first, and removes nothing without `--yes`:

- **The installer's files**: the link `bin-link` names — only while it's still the installer's link to
  `<data>/current/slipbox`; anything else there is left and said — then `versions/`, `current` and `bin-link`.
- **With `--purge`**, slipbox's four folders (`14.9`) as well: settings and themes; state — sessions, the scratch, the
  trash, undo, reading positions, named folders, said so, as they're yours; data — your own words, installed language
  servers; and the cache. Without it they're listed as kept.

Each path is checked before it goes: the installer's link, or inside a folder named `slipbox` among slipbox's four.
A link is removed as itself, never what it points at. Notes, and the `.slipbox/` folders in them, are never touched.
The running binary can remove its own install: on macOS and Linux a running program's file can be unlinked.

## Language servers' lockfiles

`scripts/lock-servers.ts` (`14.11`) makes a lockfile for each package slipbox pins — the npm servers in
`core/servers/languages.ts`, markdownlint-cli2 in `core/lint.ts` — resolved by Bun from npm with the week's wait the
repository's own dependencies have, and writes them into `src/core/servers/locks.ts`, which the binary carries: a
line of source per line of each lock, so a change reads as a diff. Run it again when a pin changes. A test holds
every pin to having its lock, made for its manifest, and every package in it to an integrity hash. How a server is
installed from it, and kept current, is `docs/design/lsp.md`, "Installing".

## Notices

`bun scripts/check-deps.ts --notices <file>` writes, from the same walk, the third-party notices a release ships beside
the binary (`14.2`): every package's own licence and notice files; where a package ships none, the standard text of
its licence (`notices/licenses/`, from SPDX's list) with its author put in; for a licence that asks for the source
(MPL, EPL, LGPL), where the source is. Then what's compiled into packages' WebAssembly and has no package of its own —
Hunspell (taken under MPL-1.1) in `hunspell-asm`, libwebp in `@jsquash/webp` — and Bun's own licence page, since the
runtime is in the binary: Bun is MIT, and links JavaScriptCore and WebKit (LGPL-2), tinycc (LGPL-2.1) and the
libraries it lists, the LGPL's text after it. slipbox's own licence is still to decide (`14.6`).
