# Distribution

How slipbox gets from this repository to someone's machine, and what keeps that path honest (`14.x`). macOS and Linux
first, Windows through WSL (D197, D203, D205); no signing at first (D198); a daily update check, on (D199); XDG's
folders kept (D200).

## Folders

`core/paths.ts`, `storeDir` (`14.9`, D200). Every file slipbox keeps is one of four kinds — config, cache, state,
data — and each kind has one folder (D39; what's in each: [how-it-works.md](how-it-works.md) § Storage):

| Platform | Config | Cache, state, data |
| --- | --- | --- |
| Linux, macOS | `~/.config/slipbox` | `~/.cache/slipbox`, `~/.local/state/slipbox`, `~/.local/share/slipbox` |
| Windows | `%APPDATA%\slipbox` | `%LOCALAPPDATA%\slipbox\cache`, `\state`, `\data` |

An `XDG_*` variable set to an absolute path is taken on every platform. macOS keeps XDG's folders, not `~/Library`:
the dotfiles people keep and sync are there. On Windows the config may roam with a profile; a database never does.

The cache carries a `CACHEDIR.TAG` (`ensureCacheHome`), written when the cache is first made — by the link index, the
search index, the parse cache or a picture — so backup tools that know the tag skip it: it's all rebuilt when missing.

## The supply chain

`scripts/check-deps.ts` (`14.10`, D201) runs in `bun run check` and in CI, and fails on:

- **A version not exact** in `package.json`, dependencies and dev dependencies alike. `bun.lock` pins the rest, and
  CI installs with `--frozen-lockfile`.
- **An install gate off** in `bunfig.toml`'s `[install]`: `ignoreScripts = true` (no package's install script runs —
  the tree-sitter grammars' would build native bindings slipbox doesn't use), `minimumReleaseAge = 604800` (a version
  is taken only once it's been published a week: a package taken over and republished is mostly found and pulled by
  then), and `exact = true` (so `bun add` pins).
- **A licence slipbox doesn't take**, in any package the binary can bundle: `package.json`'s dependencies and theirs,
  found as Node finds them, optional ones where installed. Taken: permissive licences (MIT, ISC, BSD, Apache-2.0, 0BSD,
  BlueOak, Zlib, CC0, Unlicense), an SPDX expression's `OR` by either side and `AND` by both (D192). Weak copyleft is
  taken only by name, each one asked about first (`NAMED`: `elkjs`, EPL-2.0; `@resvg/resvg-wasm`, MPL-2.0; and
  `dictionary-en`'s SCOWL terms). A package naming no licence fails, unless its own `LICENSE` was read and recorded
  (`DECLARED`: `png-js`, `typeahead`).
- **An action not pinned** by its commit's full hash in `.github/workflows/`: a tag can be moved. A pinned action's
  version, too, is a week old before it's taken. CI runs with `contents: read` and checks out without keeping
  credentials.

## Releases

`scripts/release.ts` (`14.2`, D197), in two steps. `build` compiles each target — this machine's when none is named —
with package.json's own `build`, so Bun's autoloading is always off: the binary reads no `bunfig.toml`, `.env`,
`tsconfig.json` or `package.json` of the folder it starts in (`14.1`, D195; [trust.md](trust.md) § Bun's own reading).
It defines the release in it (`core/release.ts`, `RELEASE`: the repository releases come from and the platform it's
for). A target built for this machine is run once (`--version`) first. Each is packed, with its notices, as
`slipbox-<version>-<target>.tar.gz`, a folder of that name inside. `finish` writes `SHA256SUMS` over the packs, refusing
another version's beside them, and the installer.

| Asset | Bun's target |
| --- | --- |
| `darwin-arm64` | `bun-darwin-arm64` |
| `darwin-x64` | `bun-darwin-x64-baseline` |
| `linux-x64` | `bun-linux-x64-baseline` |
| `linux-arm64` | `bun-linux-arm64` |
| `linux-x64-musl` | `bun-linux-x64-baseline-musl` |
| `linux-arm64-musl` | `bun-linux-arm64-musl` |

x64 takes Bun's baseline build: it runs on any x64 processor, with no AVX2 asked for, and a terminal program loses
nothing by it. `-musl` is Linux whose C library is musl — Alpine's (`14.5`, D203). SQLite is the runtime's own (below),
so nothing else differs, but for OpenTUI: it picks its musl library only when `OPENTUI_LIBC=musl` at run time, so a musl
build is built with that defined (`--define process.env.OPENTUI_LIBC="musl"`) — fixed, whatever the environment says.
Its glibc library is bundled too (Bun doesn't drop the branch not taken); only the musl one is loaded.

The version is package.json's, which must be `src/version.ts`'s, and the tag's. The repository is `--repo
owner/name`, or origin's on GitHub; it's checked strictly, as it goes into addresses and the installer.

Run from source, or built by hand (`bun run build`), slipbox has no `RELEASE`: it has no channel, so `upgrade` and the
update check leave it alone. A release build says its own in `info` (`release`, and the first line).

CI (`.github/workflows/release.yml`) does it on a tag `v<version>`: each platform built on a runner of its own, after
the whole check passes there — that platform's OpenTUI package is installed only there, and a Mac's binary is built on a
Mac (§ Signing). A musl build is run in Alpine (a container pinned by digest): its version, an index and a search, and
the TUI started in a terminal and still running five seconds later. Then the packs are summed, attested (who built each,
from which commit: `gh attestation verify <pack> --repo <owner/name>`), and the release drafted. Nothing is published
until a person publishes the draft. The workflow can't have run yet: the repository has no remote.

Building another platform here works when its OpenTUI package is installed (`bun install --os <os> --cpu <cpu>`):
Bun fixes the platform at build time, so only that platform's package is bundled.

## Signing

Releases are neither signed nor notarized (D198). Bun signs a darwin binary ad hoc; a Mac's binary is built on a Mac
so that signature holds, and CI checks it with `codesign --verify`. Gatekeeper stops a binary a browser downloaded;
the installer's `curl` doesn't mark what it downloads, so the installer's slipbox isn't stopped.

## SQLite

SQLite is the runtime's own, through `node:sqlite` (D196). Bun implements it as Node does: its own SQLite on Linux
and Windows (3.53.2 in Bun 1.4.2), macOS's system one on macOS, so nothing native is packaged per platform for it,
and a Linux build needs only the glibc Bun and OpenTUI need, 2.17. On macOS the SQLite is Apple's, older and of the
OS's version: slipbox asks only FTS5 with `unicode61` (3.27 and up), `bm25`, WAL and a busy timeout, and loads no
extension. Both its databases, the search index and the parse cache, are caches, made again when they don't open.
`core/sqlite.ts` keeps the calls slipbox makes (`get`, `all`, `run`, `pragma`, `transaction` with savepoints
inside, `exec`, `close`); integers the schema needs are bound `CAST(? AS INTEGER)`, harmless whatever a binding
does with a number.

## Installing

`finish` also writes `install.sh` (`14.7`, D197): `scripts/install.template.sh` with the release's version, repository
and each pack's SHA-256 written in — so a pack that isn't the one released is refused, wherever it came from. It's a
release asset, run as

```bash
curl -fsSL https://github.com/<owner>/<name>/releases/latest/download/install.sh | sh
```

POSIX `sh` (dash, bash, macOS's), the whole of it a function called on its last line, so a download cut short runs
nothing. In order:

1. **The platform**, from `uname`: Linux or macOS, x64 or arm64; a Mac terminal under Rosetta gets the arm64 build;
   Linux with musl's loader (or an `ldd` that says musl) gets the `-musl` build. Any other system is refused (Windows
   is `14.12`). On Alpine, without curl, busybox's `wget -qO- …/install.sh | sh` runs it, and it downloads by wget.
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

**The source launcher**, `scripts/install-local.sh`, writes a small script at the same path (`~/.local/bin/slipbox`,
or `$SLIPBOX_BIN_DIR`'s) that runs the checkout with Bun, given slipbox's own `bunfig.toml` and no `.env`
([trust.md](trust.md) § Bun's own reading). A link found there, a release's to `<data>/current/slipbox` or any other, is
removed and the script written in its place, never through it: writing through a release's link would overwrite the
release's binary with the launcher. It says so: `replaced the link <path> -> <target> (a release's, which stays
installed) with this launcher`, or, for a link of another kind, that what it pointed to is left as it is (DF-D7). A
release's own files are never written: they stay installed until `slipbox uninstall --yes` removes them, the launcher
kept, as it is not the installer's link (§ Uninstalling).

## Homebrew

`finish` writes `slipbox.rb` too (`14.3`, D204): the formula, from `scripts/homebrew.template.rb`, with a block for each
platform the release has a pack for that Homebrew installs on — macOS, arm64 and Intel, and Linux's glibc builds
(Homebrew on Linux needs glibc; musl's packs aren't in it) — each its pack's address and SHA-256. It installs the
binary and puts its notices in Homebrew's `doc`; its test runs `slipbox --version`. Its licence is left out until
there is one (`14.6`, D193).

It reaches people through a tap, a repository `<owner>/homebrew-<name>` (`brew install <owner>/<name>/slipbox`):
`.github/workflows/homebrew.yml` copies the release's formula into the tap's `Formula/` once the release is published
— never a draft, whose downloads aren't public yet, nor a prerelease. It runs only when the repository's
`HOMEBREW_TAP` variable names the tap, with a token in the `HOMEBREW_TAP_TOKEN` secret that may write only there.
Neither is set yet; there's no tap yet.

A slipbox Homebrew installed — its file in a `Cellar/slipbox/<version>/bin/`, through a link or not
(`core/install.ts`, `installedBy`) — is Homebrew's to change: `slipbox upgrade` says `brew upgrade slipbox`, the
daily check says so too, and `slipbox uninstall` says `brew uninstall slipbox` removes it (`--purge` still takes
slipbox's own folders).

## Updates

`core/update.ts` (`14.4`, D199). The latest release is found from its `SHA256SUMS`, at
`<releases>/latest/download/SHA256SUMS` — one small file: its packs' names carry the version, and its lines the sum
each download is checked against. A plain GET of a public file; nothing identifying is sent. `<releases>` is
`https://github.com/<repo>/releases`, or `SLIPBOX_RELEASES_URL`: another place laid out the same way (a mirror, the
tests' folder through `file://`), the installer's too.

**The daily check** is the TUI's, never the CLI's — agents call the CLI. It asks only when this is a release build,
`[update] check` is on in your own config (it is by default; a folder's config can't turn it on, or off, and is warned
of when it tries: a network request is yours to allow; DF-D23), `DO_NOT_TRACK` isn't set (anything but `0` or `false`),
and a day has passed since the last time (`$XDG_STATE_HOME/slipbox/update.json`, kept before asking, so a failure waits
a day too). A newer release is said in the message line: `slipbox 0.3.0 is out (this is 0.2.0): slipbox upgrade installs
it` — `brew upgrade slipbox` for Homebrew's, and the releases' address for a binary put somewhere by hand.

**`slipbox upgrade`** moves the installer's install to the latest release (`--check`: only says whether there is
one). From source, or a binary the installer didn't put in `versions/`, it says so and does nothing. Otherwise, as the
installer would: the pack downloaded, its SHA-256 checked against its `SHA256SUMS` line, unpacked beside the others,
its binary run — it must say its version — and only then `current` moved, in one step (a link made beside it and
renamed over it). The version replaced is kept, to go back to (`ln -sfn versions/<old> <data>/current`); any older
one is removed. Any check failing changes nothing.

**Bun's own crash reports** are off (D221): on macOS and Windows a crashing Bun sends a report to `bun.report` unless
told not to, and a compiled binary is no different. Bun's crash handler reads its switch when it crashes, from the C
environment, which `process.env` doesn't write to; so the first thing `src/main.ts` does, for the TUI and the CLI
alike, is `core/crash-reports.ts`'s `crashReportsOff`: libc's `setenv`, through `bun:ffi`, puts
`BUN_ENABLE_CRASH_REPORTING=0` there — libc found as glibc's `libc.so.6`, musl's loader (`/lib/ld-musl-<arch>.so.1`)
or macOS's `libSystem.B.dylib`. It's left alone when you set `BUN_ENABLE_CRASH_REPORTING` or `BUN_CRASH_REPORT_URL`
yourself (an empty one counts as unset), and libc not reached changes nothing, silently. A crash still prints Bun's
link, to file a report yourself.

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

## Windows

Through WSL, for now (`14.12`, D205): WSL is Linux, so the Linux release and `install.sh` run there as
they are, in a terminal such as Windows Terminal. What differs from other Linux is handled (`core/wsl.ts`), WSL known
by `WSL_DISTRO_NAME` or its kernel:

- **The clipboard** is Windows': a copy goes to `clip.exe` first, as UTF-16 with a byte-order mark (else it's read in
  the console's code page); a paste is read from the Linux side's tools when one answers (WSLg's), else PowerShell's
  `Get-Clipboard`, its CRLF lines made LF.
- **Windows' drives** (`/mnt/c`…, found in `/proc/mounts`: drvfs, or 9p naming it): a change a Windows program makes
  there raises no event in WSL, so slipbox notices it only in files it has open (polled), and reading is slower.
  Opening notes there, the TUI says so once; notes in WSL's own folders are watched in full.
- **Fonts** for a PDF export: Windows' on its C: drive, first.

Native Windows is staged (`14.14`–`14.17`): packaging (`.zip`, a PowerShell installer, `upgrade` and `uninstall` with
a running `.exe` that can't be removed), then the port — note paths kept with `/` where `relative()` gives `\`, `:!`
commands through `cmd.exe`, processes and signals — then the test suite on a Windows runner. Each step waits for a
Windows CI runner to check it: nothing here can run a Windows binary.

## Language servers' lockfiles

`scripts/lock-servers.ts` (`14.11`, D202) makes a lockfile for each package slipbox pins — the npm servers in
`core/servers/languages.ts`, markdownlint-cli2 in `core/lint.ts` — resolved by Bun from npm with the week's wait the
repository's own dependencies have, and writes them into `src/core/servers/locks.ts`, which the binary carries: a
line of source per line of each lock, so a change reads as a diff. Run it again when a pin changes. A test holds
every pin to having its lock, made for its manifest, and every package in it to an integrity hash. How a server is
installed from it, and kept current, is [lsp.md](lsp.md) § The client for code, "Installing" and "Kept current".

## Notices

`bun scripts/check-deps.ts --notices <file>` (D192) writes, from the same walk, the third-party notices a release ships
beside the binary (`14.2`): every package's own licence and notice files; where a package ships none, the standard text
of its licence (`notices/licenses/`, from SPDX's list) with its author put in; for a licence that asks for the source
(MPL, EPL, LGPL), where the source is. Then what's compiled into packages' WebAssembly and has no package of its own —
Hunspell (taken under MPL-1.1) in `hunspell-asm`, libwebp in `@jsquash/webp` — and Bun's own licence page, since the
runtime is in the binary: Bun is MIT, and links JavaScriptCore and WebKit (LGPL-2), tinycc (LGPL-2.1) and the libraries
it lists, the LGPL's text after it. slipbox's own licence is still to decide (`14.6`, D193).

What the binary bundles, by licence (D192, D194). Weak copyleft, accepted for use: `elkjs` (EPL-2.0, under
beautiful-mermaid), `@resvg/resvg-wasm` (MPL-2.0), and Hunspell, which `hunspell-asm` (MIT) compiles, taken under
MPL-1.1; each ships with its licence text and where its source is, and none reaches slipbox's own code.
`unicodeit`'s symbol table is under the LaTeX Project Public License, beside its MIT code. Apache-2.0, whose licence
and NOTICE go along: `mathjax-full`, `typeahead`, `@swc/helpers` (under fontkit), `@jsquash/webp` and its
`wasm-feature-detect`; the libwebp `@jsquash/webp` compiles, and the binary embeds, is BSD-3-Clause, its notice
too. `jszip`, "MIT OR GPL-3.0-or-later", is taken under MIT. The dictionaries, `dictionary-en` (MIT and BSD, from
SCOWL) and `dictionary-tr` (MIT), ship with their licence texts. The grammars built into `grammars/` are MIT, their
licences in `grammars/licenses/`. The rest are permissive: MIT, ISC, BSD, BlueOak, Zlib.
