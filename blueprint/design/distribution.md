# Distribution

How slipbox gets from this repository to someone's machine, and what keeps that path honest (`14.x`). macOS on Apple
silicon and Linux first, Windows through WSL (D197, D203, D205, D238); no signing (D198); a daily update check, on
(D199); XDG's folders kept (D200); previews between releases, and channels an install follows (GR-D13–GR-D15). The
repository that does it, its workflows and its upkeep: [repository.md](repository.md).

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
  version, too, is a week old before it's taken: checked when it's pinned, and kept so by Dependabot's cooldown.
- **A workflow's shape** (GR-D9): one that doesn't start from no permission — `permissions: {}` at the top, so each
  job has only what it grants itself, with a comment saying why — or has a job without `timeout-minutes` (a job that
  calls a reusable workflow aside: the jobs it calls have their own).

Beside the gates, `bun run check:actions` (in `bun run check`) runs zizmor and actionlint over `.github/`: the
workflows and Dependabot's config. zizmor's online audits — a commit that isn't the action's, a version comment its
hash doesn't match, an action with a known vulnerability — run where a token is set (`GH_TOKEN`: in CI the job's own),
and are left out without one. A finding is fixed, or ignored inline with its reason where it's understood and
accepted: the tap's checkout keeps its token to push (§ Homebrew), and a reusable workflow is called by its `./` path
([repository.md](repository.md) § CI). Every other checkout drops its credentials, and values reach the shell through
`env`, never inline.

The workflows take the toolchain from `mise.toml` (GR-D11) through `jdx/mise-action`, so each version is written
once, and each download is checked against `mise.lock`'s sum; mise itself is its newest release a week old, checked
against mise's signed sums. Nothing is cached in any workflow, so no run restores what a pull request's run saved.
Dependabot and the scanner keep the dependencies current and watched: [repository.md](repository.md) § Dependencies.

## Releases

`scripts/release.ts` (`14.2`, D197), in two steps. `build` runs the supply chain's gates, then compiles each target —
this machine's when none is named — with package.json's own `build`, so Bun's autoloading is always off: the binary
reads no `bunfig.toml`, `.env`, `tsconfig.json` or `package.json` of the folder it starts in (`14.1`, D195;
[trust.md](trust.md) § Bun's own reading). Its entry points are `src/main.ts` and each worker's script
(`core/diagram-worker.ts`, `core/export-worker.ts`, `core/paint-worker.ts`, `core/parse-worker.ts`,
`core/regex-worker.ts`, `core/spell-worker.ts`, `core/syntax-worker.ts`, and `tui/opentui.ts`, the pictures' decoder),
laid out from `src/` (`--root=src`; left to itself, Bun keeps `src/` in their paths past eight entries): Bun puts a
worker in the binary only when it is named, and `core/workers.ts` finds it there by its path under `src/`; a test holds
the list to the workers started, and the compiled binary's test runs its spelling, on its thread (D232). It defines the
release in it (`core/release.ts`, `RELEASE`: the repository releases come from and the platform it's for). A Mac's
binary built on a Mac is signed ad hoc again (§ Signing). A target built for this machine is run once (`--version`)
first. Each is packed, with slipbox's `LICENSE` and the third-party notices, as `slipbox-<version>-<target>.tar.gz`, a
folder of that name inside. Beside each pack, `build` writes its SBOM, `slipbox-<version>-<target>.cdx.json` (CycloneDX
1.6, JSON), from the same walk as its notices (`check-deps.ts`' `sbom`): slipbox; each package bundled, with its
licence, its source and the packages it depends on; the code compiled into packages (Hunspell, libwebp); and Bun, the
runtime. There's one per pack because the walk differs by platform: a platform's OpenTUI package is installed only
there. `finish` writes `SHA256SUMS` over the packs, refusing another version's packs or SBOMs beside them, and the
installer.

| Asset | Bun's target |
| --- | --- |
| `darwin-arm64` | `bun-darwin-arm64` |
| `linux-x64` | `bun-linux-x64-baseline` |
| `linux-arm64` | `bun-linux-arm64` |
| `linux-x64-musl` | `bun-linux-x64-baseline-musl` |
| `linux-arm64-musl` | `bun-linux-arm64-musl` |

A Mac is Apple silicon: 0.3.0 was the last release built for Intel Macs (`darwin-x64`, D238). The platforms released
once and no longer, and the last release built for each, are `core/release.ts`'s `RETIRED`; `build` refuses one,
saying so, and the installer and `slipbox upgrade` tell such a machine the same (§ Installing, § Updates). x64 takes
Bun's baseline build: it runs on any x64 processor, with no AVX2 asked for, and a terminal program loses nothing by
it. `-musl` is Linux whose C library is musl — Alpine's (`14.5`, D203). SQLite is the runtime's own (below),
so nothing else differs, but for OpenTUI: it picks its musl library only when `OPENTUI_LIBC=musl` at run time, so a musl
build is built with that defined (`--define process.env.OPENTUI_LIBC="musl"`) — fixed, whatever the environment says.
Its glibc library is bundled too (Bun doesn't drop the branch not taken); only the musl one is loaded. Bun's musl
build links the C++ runtime, `libstdc++` and `libgcc`, which a bare Alpine hasn't: the installer says so (§ Installing).

The version is package.json's, which must be `src/version.ts`'s, and the tag's: `v<version>`, or a preview's
`preview-<time>-<hash>` for the version stamped into its checkout (§ Previews). slipbox's Package URL in the SBOM
names that tag. The repository is `--repo owner/name`, or origin's on GitHub; it's checked strictly, as it goes into
addresses and the installer.

**The notes** are the version's section of `CHANGELOG.md` (Keep a Changelog: `## [<version>] - <date>`), without
its heading, up to the next version's heading or the link definitions at the end: `release.ts notes` prints them. A
version with no section, or an empty one, fails. A preview's are its own (§ Previews).

Run from source, or built by hand (`bun run build`), slipbox has no `RELEASE`: it has no channel, so `upgrade` and the
update check leave it alone. A release build says its own in `info` (`release`, and the first line).

The skill for agents, `skills/slipbox/SKILL.md`, is built into the binary by Bun's text import (`core/skill.ts`), so
each release carries the skill that matches its commands (GR-D10). `slipbox skill` prints it; `slipbox skill
--install <dir>` writes `<dir>/slipbox/SKILL.md` atomically, and run again with the same skill there, writes
nothing. It writes over an earlier slipbox's skill (its front matter names it `slipbox`), never over another file,
and never through a link unless `--force`, which removes the link, never what it leads to, and writes in its place
(exit 5 otherwise). `skill --auto` detects existing Claude Code and Codex user homes and performs the same safe
installation in each skill folder (ASI-D1, ASI-D2). It honors `CLAUDE_CONFIG_DIR` and `CODEX_HOME`, and with the default
Codex home installs into `~/.agents/skills` as well. It preserves linked destination ancestors too.

The installer, source installer and Homebrew post-install invoke automatic installation. Installer and source
installer accept `--no-skill`; `SLIPBOX_NO_SKILL=1` skips automatic writes everywhere. Upgrades invoke the new binary's
`skill --auto` after committing `current`, so its skill matches its commands; `upgrade --no-skill` skips this.
Failures are reported without undoing the binary installation. TUI background completion and foreground restart
messages retain skill reports, including destinations, refusals and skips. `tests/skill-lifecycle.test.ts` exercises
the lifecycle;
`tests/distribution.test.ts` checks the packed binary prints the source's file.

CI does it on a tag `v<version>`. `.github/workflows/release.yml` checks first that the tag is the version's and that
the changelog has its section, then calls `.github/workflows/build.yml`, the build it shares with previews (§ Previews),
and drafts the release from what that made. Each starts from no permission, each job granting its own; the job calling
`build.yml` grants the most its jobs may take, and none of them can write to the repository. Nothing restores a cache,
and a release run is never cancelled. In `build.yml`, each platform is built on a runner of its own, with the toolchain
`mise.toml` pins (the tests run typos and lychee too). Neither a release nor a preview runs the whole suite there (its
`suite` input, D251): a release's commit passed `full`, the whole suite run by hand on `test`, which `main`'s ruleset
requires and `release.yml`'s first job checks before anything is built; a preview's passed CI's check on Linux and macOS
(GR-D13). `build` runs the supply chain's gates itself. Then the version is stamped (a release's is package.json's
already: nothing changes) and the platform built. That platform's OpenTUI package is installed only there, and a Mac's
binary is built on a Mac (§ Signing), its signature checked (`codesign --verify`). A musl build is run in Alpine (a
container pinned by digest): first shown not to start without the C++ runtime, as the installer says, then, with it
added, its version, an index and a search, and the TUI started in a terminal and still running five seconds later. Then
each pack's SBOM is attested to it, in a job per pack that runs no dependency's code — the build's tests run every
dependency's, so the signing token stays out of the build (`gh attestation verify <pack> --repo <owner/name>
--predicate-type https://cyclonedx.org/bom`). Last, `finish` sums the packs and writes the installer and the formula;
every asset — the packs, their SBOMs, `SHA256SUMS`, `install.sh`, `slipbox.rb` — is attested (who built it, from which
commit, by which workflow: `gh attestation verify <file> --repo <owner/name>`), and the set is handed back as the run's
`release` artifact. `release.yml`'s last job, the only one that may write (`contents: write`), runs nothing built: it
drafts the release with that set and its notes. Nothing is published until a person publishes the draft; publishing runs
`homebrew.yml` (§ Homebrew) and `pages.yml` (§ Previews).

The maintainer's steps around it are `MAINTAINING.md` § Releasing: the version chosen by the versioning policy, the
changelog's entry written (CI takes the notes from it), `package.json` and `src/version.ts` bumped, merged through a
pull request, the merged commit tagged `v<version>`, the draft checked (each pack, `SHA256SUMS`, the installer, the
formula, the SBOM, the attestations verified), then published. A tag is never moved; a draft found wrong is deleted,
and the fix released as the next patch.

Building another platform here works when its OpenTUI package is installed (`bun install --os <os> --cpu <cpu>`):
Bun fixes the platform at build time, so only that platform's package is bundled.

## Signing

Releases are neither signed nor notarized (D198). Bun signs a darwin binary ad hoc as it compiles it, but the Intel
Mac's build's signature came out broken ("code or signature have been modified") where the arm64 one's held, while there
was one (until 0.3.0, D238). So a Mac's binary is built on a Mac and signed ad hoc again there once it's compiled
(`codesign --force --sign -`, `signArgs` in `scripts/release.ts`); one built on another system can't be signed, and
isn't released. CI then checks each Mac pack's binary with `codesign --verify` (`14.13`). Gatekeeper stops a binary a
browser downloaded; the installer's `curl` doesn't mark what it downloads, so the installer's slipbox isn't stopped.

## SQLite

SQLite is the runtime's own, through `node:sqlite` (D196). Bun implements it as Node does: its own SQLite on Linux
and Windows (3.53.2 in Bun 1.4.2), macOS's system one on macOS, so nothing native is packaged per platform for it,
and a Linux build needs only the glibc Bun and OpenTUI need, 2.17. On macOS the SQLite is Apple's, older and of the
OS's version: slipbox asks only FTS5 with `unicode61` (3.27 and up), `bm25`, WAL and a busy timeout, and loads no
extension; CI runs the suite on macOS on every change, so Apple's runs them there (`14.13`;
[repository.md](repository.md)
§ CI). Both its databases, the search index and the parse cache, are caches, made again when they don't open.
`core/sqlite.ts` keeps the calls slipbox makes (`get`, `all`, `run`, `pragma`, `transaction` with savepoints
inside, `exec`, `close`); integers the schema needs are bound `CAST(? AS INTEGER)`, harmless whatever a binding
does with a number.

## Installing

`finish` also writes `install.sh` (`14.7`, D197): `scripts/install.template.sh` with the release's version, tag,
repository and each pack's SHA-256 written in — so a pack that isn't the one released is refused, wherever it came
from. It's a release asset, and what installs; people run it through the bootstrap on the Pages site (GR-D14):

```bash
curl -fsSL https://<owner>.github.io/<name>/install.sh | sh                    # the latest release
curl -fsSL https://<owner>.github.io/<name>/install.sh | sh -s -- --preview    # the newest preview
```

**The bootstrap**, `scripts/bootstrap.template.sh` with the repository and its Pages site written in by `bun
scripts/bootstrap.ts <owner/name> <out-file>` (the repository checked as `release.ts`' `repoOf` checks it; Node's
modules only, so `pages.yml` runs it with `bun --no-install`), installs nothing itself. POSIX `sh`, its body a
function called on its last line, curl or wget, https only (and `file:`, for a mirror or the tests), nothing as
root. `--preview`, or `SLIPBOX_CHANNEL=preview`, picks the channel, `stable` by default; any other value is refused.
It reads the channel's file, `<pages>/stable` or `<pages>/preview` (§ Channels): not there (curl's HTTP error or
missing file, GNU wget's error response), the channel has no release, and it says so — for `stable` before the first
release, that `--preview` installs the newest preview; not reached, it says why. The line must be a tag of the
channel's own kind (`v<x.y.z>`, or `preview-<12 digits>-<7 hex>`: it goes into an address) and a SHA-256, nothing
more. Then `<releases>/download/<tag>/install.sh` is downloaded to a temporary folder (removed however it ends), its
SHA-256 checked against the line's — another is refused and never run — and it runs with the arguments left, in
order, and `SLIPBOX_CHANNEL` set to the channel; its exit is the bootstrap's. `SLIPBOX_CHANNELS_URL` reads the
channels' files from elsewhere, as `SLIPBOX_RELEASES_URL` the releases.

The release's installer runs on its own too (`…/releases/latest/download/install.sh | sh`). POSIX `sh` (dash, bash,
macOS's), the whole of it a function called on its last line, so a download cut short runs nothing. In order:

1. **The platform**, from `uname`: Linux, x64 or arm64, or macOS on Apple silicon; a Mac terminal under Rosetta gets
   the arm64 build; Linux with musl's loader (or an `ldd` that says musl) gets the `-musl` build. An Intel Mac — x64,
   not translated — is told `Intel Macs aren't supported any more: 0.3.0 was the last release built for them` and the
   installer stops (D238; a test holds the message to `RETIRED`'s). Any other system is refused (Windows is
   `14.12`). On Alpine, without curl, busybox's `wget -qO- …/install.sh | sh` runs it, and it downloads by wget.
2. **A slipbox already there** — `~/.local/bin/slipbox`, or `$SLIPBOX_BIN_DIR`'s — that isn't this installer's link
   (a launcher from `scripts/install-local.sh`, another install) is left as it is: the installer stops and says so,
   before downloading anything.
3. **The pack** downloaded (curl, https only, or wget), its SHA-256 checked against the one written in, unpacked in a
   temporary folder (removed however it ends), and its binary run: it must say `slipbox <version>`. A `-musl` binary
   that doesn't start is said to need `libstdc++` and `libgcc` (`apk add libstdc++ libgcc`), the loader's first line
   after. Any of these failing installs nothing.
4. **Installed** into slipbox's data folder (`$XDG_DATA_HOME/slipbox`, an absolute one, else `~/.local/share/slipbox`):
   `versions/<version>/` (the binary, `LICENSE` and the notices), `current` a relative link to it, and the link
   `~/.local/bin/slipbox` → `<data>/current/slipbox`. Where that link is goes in `<data>/bin-link`, for `uninstall`.
   And the channel it was given (`SLIPBOX_CHANNEL`: `stable`, the default, or `preview`; any other refused before
   anything is downloaded) goes in `<data>/channel`, written beside it and renamed over it (§ Channels). Run again,
   the same version is put back in place.
5. **The PATH**: when the link's folder isn't on it, how to add it is said.

Nothing runs as root. Besides those two places, installation touches only detected user agent skill folders.
`SLIPBOX_RELEASES_URL` fetches the packs from
elsewhere laid out as GitHub's releases are (`<base>/download/<tag>/<pack>`, the tag written into the installer with
the version: `v<version>`, or a preview's) — a mirror, or the tests' folder through `file://` — and their sums are
still the release's.

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
platform the release has a pack for that Homebrew installs on — macOS on Apple silicon, and Linux's glibc builds, arm64
and Intel (Homebrew on Linux needs glibc; musl's packs aren't in it) — each its pack's address and SHA-256. macOS's
block asks for arm64 (`depends_on arch: :arm64`) and holds its one pack's address straight in it, so on an Intel Mac
Homebrew loads the formula and refuses it, saying the arm64 architecture is required (D238), where a formula with no
address there would fail to load. It installs the binary and puts its notices in Homebrew's `doc`; its test runs
`slipbox --version`. Its `post_install_steps` run invokes `skill --auto`, prints its report and tolerates failure.
Homebrew-prefixed aliases preserve the skip and agent-home overrides through its environment filter; caveats give
`slipbox skill --auto` for a sandbox refusal. Its licence is Apache-2.0 (GR-D3), named in the formula.

It reaches people through a tap: `remziduzagac/homebrew-tap`, shared with herdsman (`brew install
remziduzagac/tap/slipbox`, D228). `.github/workflows/homebrew.yml` copies the release's formula into the tap's
`Formula/` once the release is published — never a draft, whose downloads aren't public yet, nor a pre-release, so
never a preview: `finish` writes a preview no formula (§ Previews). It runs only when the repository's `HOMEBREW_TAP`
variable names the tap — a repository variable, since a job's `if:` is decided before it enters an environment — with
a deploy key that may write only there, slipbox's own beside herdsman's: its private half `HOMEBREW_TAP_DEPLOY_KEY`, a
secret of the `release` environment, which only a `v*` tag's run enters (GR-D9). The job reads the release's formula
with its own token (`contents: read`); the tap's checkout keeps its key to push, zizmor's one finding accepted
(`artipacked`, ignored inline with its reason). The key has no expiry; its rotation date is in the renewals
([repository.md](repository.md) § The upkeep files). The tap's first formula is 0.3.0's: 0.2.1's and 0.2.2's runs were
skipped, no tap named then.

A slipbox Homebrew installed — its file in a `Cellar/slipbox/<version>/bin/`, through a link or not
(`core/install.ts`, `installedBy`) — is Homebrew's to change: `slipbox upgrade` says `brew upgrade slipbox`, the
daily check says so too, and `slipbox uninstall` says `brew uninstall slipbox` removes it (`--purge` still takes
slipbox's own folders).

## Previews

A preview is `test` built and published before it's released, for trying it as users get it (GR-D13, D251). Moving
`test` to `dev` makes one (`git push origin origin/dev:test`): `.github/workflows/preview.yml`, on a push to `test` and
nothing else, never a fork's. `test`'s ruleset takes only a commit whose `ci` check passed, and only moves forward.

**Its version** is the release to come's, package.json's `x.y.z`, with its commit's UTC committer time to the minute
and its hash after it: `0.3.0-preview.202610121530.g1a2b3c4`, a pre-release of 0.3.0, so it sorts after the previews
before it and before 0.3.0. Its tag is `preview-202610121530-1a2b3c4` (§ Channels: how a preview is named). A preview
of a version already released would sort before it: `release.ts preview` refuses one when `v<x.y.z>` is a tag on the
remote (`git ls-remote`), and when the preview's own tag is there already, before anything is built. The version is
stamped into each of CI's checkouts (`release.ts stamp`: package.json's `version` and `src/version.ts`'s `VERSION`
rewritten, refused unless it's a preview of package.json's version and of the commit checked out), never committed, so
the binary, its pack, its notices and its SBOM all say it.

**Built as a release is,** by `build.yml` (§ Releases): every platform, each binary run before it's packed, each pack's
SBOM, `SHA256SUMS` and `install.sh` — the installer with the preview's version, tag and sums written in — all attested.
It doesn't run the whole suite on each platform first (GR-D13's note); `full`, run by hand on `test`, does. `finish`
writes it no Homebrew formula.

**Published** as the GitHub pre-release `preview-<time>-<hash>`, titled with its version, at the commit pushed: drafted
with every asset, then published, since an immutable release takes no asset once published; a step failing deletes the
draft it left. Its notes (`release.ts notes` for a preview's tag) say what it is, how to install it
(`curl -fsSL <pages>/install.sh | sh -s -- --preview`), and what the changelog's Unreleased section has so far. A
release published by CI's own token starts no workflow, so `homebrew.yml` never runs for one, and `pages.yml` is called
by `preview.yml` itself. Previews run one at a time, never cancelled half-made.

**The newest ten are kept.** An immutable release can be deleted, and then its tag, which can never be used again; a
preview's tag is its commit's, never wanted twice. `release.ts stale` lists the published previews beyond the newest
ten — by the time in their tags, then by when published — and `preview.yml` deletes each with its tag.

**The Pages site** (GR-D14), `https://<owner>.github.io/<name>/`, is what the one-line install reads:
`.github/workflows/pages.yml` writes `install.sh`, the bootstrap (§ Installing, `scripts/bootstrap.ts`), and the
channels it reads, `stable` and `preview`, each one line, `<tag> <SHA-256 of that release's install.sh>`: `stable` the
published release tagged `v<x.y.z>` of the highest version (the newest, unless an older line's fix is published after
it), `preview` the newest published preview; a draft is neither, and a channel with no release has no file
(`release.ts site`: the releases from `gh api`, each installer downloaded and hashed, refused when GitHub's own digest
of the asset differs). The site also holds the docs, at `docs/` (§ The documentation site), and its `index.html`
sends a visitor there, with a link to the repository. It's deployed once a preview is published, when a release is
published (a person publishes it), and by hand; not when `main` moves, which it does only for a release (D251), so a
release's docs reach the site when it's published, unless a preview or a run by hand comes first (D265). The site is
always made from `main`'s scripts, whichever ref started the run, and from the releases as they are then, one
deployment at a time: one running is never cancelled, so an older run never deploys over a newer one, and one waiting
gives way to a newer, which builds from the same `main` and releases as they are then. Its build job only reads; the
Pages grants (`pages: write`, `id-token: write`) are its deploy job's alone, in the `github-pages` environment, which
takes deployments from `main`, `test` and `v*` tags only.

**Where it's deployed:** in a preview's own run (`preview.yml`'s call), and in a run of `pages.yml` by hand on `main`.
Every other run — a release published, a run by hand on another ref — does nothing but start a run by hand on `main`
(`redeploy`, `actions: write`), its log saying so, with a link to the runs on `main`. A deployment is named by its
commit, and one of a commit deployed before is reported a success and never served when it's made under a `release` or a
`push` (issue #7, actions/deploy-pages#383); a run by hand's is served (D258, D265). A release's commit always was
deployed, by its preview (D251); a preview's is its commit's first. **Every deployment is read back:** the site holds a
marker of the run's own, `deployment` (its ID and attempt), and once deployed, it, `stable` and `preview` are fetched
from the site until they're what the build wrote (an empty line for a channel with none, which the site answers with a
404), for eleven minutes and a last round, past the ten the site's cache keeps a file, and the run fails if they never
are. The marker is in no other deployment, so channels the site served already don't pass for this one. The site's
artifact is named by the attempt that built it, since deploy-pages takes the one artifact of its name in the whole run:
a re-run that builds the site again deploys its own. A re-run of the deploy job alone is refused (the marker built by an
earlier attempt than the run's): it would deploy the run's site again, perhaps older than one deployed since; a run by
hand on `main` builds it afresh. A deployment empties the cache; a query string doesn't get past it, not being part of
its key.

## The documentation site

**The site** (`site/`, DS-D1) is an Astro Starlight project of its own: its packages in `site/package.json`, exact,
under the repository's own install gates, repeated in `site/bunfig.toml` (no install script, a week's age), checked by
`bun run check:deps` (`siteProblems`), updated by Dependabot with the rest. It's served at
`https://<owner>.github.io/<name>/docs/` (`base: /slipbox/docs`), with Starlight's search (Pagefind, built with the
site), its sidebar, light and dark themes, and an edit link on each page. Pictures pass through as they are (no image
processing). sharp, Astro's optional package for it, is overridden by a placeholder (`site/stubs/sharp`), so neither it
nor its libvips (LGPL-3.0) is installed.

**Its pages are gathered from `docs/`** (`site/scripts/gather.ts`, before each build; DS-D2): the docs map's
(`docs/README.md`) `##` sections are the sidebar's groups and their lists its pages, in order; a page's H1 is its
title and its first paragraph its description; the links between the docs become the site's addresses
(`../manual/keys.md#leader` → `/slipbox/docs/manual/keys/#leader`), a link to a repository file outside `docs/` goes to
it on GitHub, code is left as it is; each page's edit link opens its file in `docs/`. The screenshots are copied in, and
the agent guide is also served as its Markdown (`/slipbox/docs/agent-guide.md`), for an agent to read. What's
gathered isn't committed. The home (`site/src/content/docs/index.mdx`) is the site's own: the paths, the buttons, the
agent prompt, the cards (DS-D3).

**Built** by `bun run site` (the site's install, then `gather`, `astro build` under Bun, and
`site/scripts/check-links.ts`, which fails on a link within the site to a page or heading that isn't there, or to a
path on the domain outside it but the installer's files). CI's `site` job runs it on every change, inside the
required `ci` check; `pages.yml` runs it and puts the site at `_site/docs/`.

## Channels

An install follows a channel (GR-D15): `stable`, the releases, or `preview`, the previews as well (§ Previews). It's
kept with the install, in `<data>/channel` beside `current` (`core/install.ts`: `readChannel`, `writeChannel`), one
word; none, or any other word, is `stable`. The installer writes it (§ Installing); `slipbox channel` says it, and
`slipbox channel set stable|preview` writes it in one step (`atomicWrite`). `--json`: `{channel}`, with `set`
`{channel, previous}`.

Only the installer's install has one (`installedBy`): Homebrew's follows Homebrew, which never gets a preview, and
slipbox run from source, or a binary put somewhere by hand, follows nothing. For those, `slipbox channel` refuses,
exit 5, saying how that one updates (`noChannel`): `brew upgrade slipbox`, the checkout, the releases' page. The
daily check of a Homebrew install follows stable releases.

**The Pages site's channel files** (`pages.yml`, § Previews) are what a channel offers: `stable` and `preview`, each
one line, `<tag> <SHA-256 of that release's install.sh>`, absent when the channel has no release. The bootstrap reads
the channel's to install; `upgrade` and the daily check read `preview`'s (§ Updates). The site is
`https://<owner>.github.io/<name>` for the release's repository (`core/release.ts`' `pagesBase`, the owner in lower
case as Pages names it; `release.ts`' `pagesUrl` checks the repository first), or `SLIPBOX_CHANNELS_URL`.

**How a preview is named** — its tag, `preview-<time>-<hash>`, and its version, `<x.y.z>-preview.<time>.g<hash>`
(`PREVIEW_TAG`, `PREVIEW_VERSION`, `tagOf`) — is `core/release.ts`'s, the binary's own, which `release.ts`
re-exports: what upgrades follow and what releases are made as can't drift apart.

Back on `stable` from a preview, nothing is taken back: `upgrade` never installs an older version, so the preview
stays until a release newer than it — its own version's release, which sorts after it — is out.

## Updates

`core/update.ts` (`14.4`, D199). The latest release is found from its `SHA256SUMS`, at
`<releases>/latest/download/SHA256SUMS` — one small file: its packs' names carry the version, and its lines the sum
each download is checked against. On `preview` (§ Channels), the newest preview is asked for as well, at the same
time: the site's `preview` file names its tag, and `<releases>/download/<tag>/SHA256SUMS` its packs (`fetchPreview`;
refused unless the line is a preview's tag and a SHA-256, and the version its packs carry is that tag's). The newer
by `Bun.semver` of the two is taken (`fetchNewest`), either alone when the other has none — no preview, or no stable
release yet. Each is downloaded from its own tag, `<releases>/download/<tag>/<pack>`, never `v<version>` for a
preview. `<pages>` is the repository's Pages site, or `SLIPBOX_CHANNELS_URL`, laid out the same way. Plain GETs of
public files, one on `stable`, three on `preview`; nothing identifying is sent. `<releases>` is
`https://github.com/<repo>/releases`, or `SLIPBOX_RELEASES_URL`: another place laid out the same way (a mirror, the
tests' folder through `file://`), the installer's too.

**The daily check** is the TUI's, never the CLI's — agents call the CLI. It asks only when this is a release build,
`[update] check` is on in your own config (it is by default; a folder's config can't turn it on, or off, and is warned
of when it tries: a network request is yours to allow; DF-D23), `DO_NOT_TRACK` isn't set (anything but `0` or `false`),
and a day has passed since the last time (`$XDG_STATE_HOME/slipbox/update.json`, kept before asking, so a failure waits
a day too). A newer release is said in the message line: `slipbox 0.3.0 is out (this is 0.2.0): slipbox upgrade installs
it` — on `preview`, `slipbox 0.3.0-preview.202610121530.g1a2b3c4 is out on the preview channel (this is 0.2.0): …`;
`brew upgrade slipbox` for Homebrew's, and the releases' address for a binary put somewhere by hand. It follows the
installer's install's channel; any other install's, stable releases.

**`slipbox upgrade`** moves the installer's install to the newest its channel offers (`--check`: only says whether there
is one). On a platform no longer released for (`RETIRED`: an Intel Mac, D238) it says so first, and the last release
built for it, asking for nothing (exit 1). From source, or a binary the installer didn't put in `versions/`, it says so
and does nothing. Otherwise, as the installer would: the pack downloaded, its SHA-256 checked against its `SHA256SUMS`
line, unpacked beside the others, its binary run — it must say its version — and only then `current` moved, in one
step (a link made beside it and renamed over it). Before that commit, the new version's `previous.json` records `{
version: <the version current replaced> }` for About's informational predecessor (VB-D7). The version replaced is
kept, to go back to (`ln -sfn versions/<old> <data>/current`); any older one is removed. Any check failing changes
nothing. Nothing found on `preview` says where it looked, the releases and the site's `preview`. When the version
installed is newer than what's offered — a preview, back on `stable` — it's current, and said so: `slipbox <version>
is newer than the latest release, <latest>: it stays until a newer one`.

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
  `<data>/current/slipbox`; anything else there is left and said — then `versions/`, `current`, `bin-link` and
  `channel`.
- **With `--purge`**, slipbox's four folders (`14.9`) as well: settings and themes; state — workspaces, the scratch, the
  trash, undo, reading positions, named folders, said so, as they're yours; data — your own words, installed language
  servers; and the cache. Without it they're listed as kept.

Each path is checked before it goes: the installer's link, or inside a folder named `slipbox` among slipbox's four.
A link is removed as itself, never what it points at. Notes, and the `.slipbox/` folders in them, are never touched.
The running binary can remove its own install: on macOS and Linux a running program's file can be unlinked.
Uninstall also lists recognized skill files in detected agent folders and removes them with `--yes` (ASI-D3),
rechecking frontmatter ownership and destination links immediately before deletion. Foreign and linked skills are
reported as left; only SKILL.md and an empty containing directory go. Manually chosen locations are not searched.

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
it lists, the LGPL's text after it. slipbox's own licence, Apache-2.0 (GR-D3), is `LICENSE`, in the repository and in
each pack beside `NOTICES.txt`; `tests/distribution.test.ts` keeps it Apache-2.0's text, and `package.json`'s
`license` saying so.

What the binary bundles, by licence (D192, D194). Weak copyleft, accepted for use: `elkjs` (EPL-2.0, under
beautiful-mermaid), `@resvg/resvg-wasm` (MPL-2.0), and Hunspell, which `hunspell-asm` (MIT) compiles, taken under
MPL-1.1; each ships with its licence text and where its source is, and none reaches slipbox's own code.
`unicodeit`'s symbol table is under the LaTeX Project Public License, beside its MIT code. Apache-2.0, whose licence
and NOTICE go along: `mathjax-full`, `typeahead`, `@swc/helpers` (under fontkit), `@jsquash/webp` and its
`wasm-feature-detect`; the libwebp `@jsquash/webp` compiles, and the binary embeds, is BSD-3-Clause, its notice
too. `jszip`, "MIT OR GPL-3.0-or-later", is taken under MIT. The dictionaries, `dictionary-en` (MIT and BSD, from
SCOWL) and `dictionary-tr` (MIT), ship with their licence texts. The grammars built into `grammars/` are MIT, their
licences in `grammars/licenses/`. The rest are permissive: MIT, ISC, BSD, BlueOak, Zlib.
