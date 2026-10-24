# Decisions: distribution

## D191: The index's SQLite is better-sqlite3 (6.11, 2026-10-01)

> **Superseded by D196 (2026-10-10):** SQLite is the runtime's own, through `node:sqlite`; better-sqlite3 dropped.

**Decision:** The SQLite of the search index (D114) is better-sqlite3, in place of Bun's `bun:sqlite`; chosen with
scout.

**Why:** A SQLite of its own, the same everywhere.

## D192: Dependencies' licences: permissive; weak copyleft accepted for use (2026-10-09)

> **Detailed by D194 (2026-10-10):** Hunspell is taken under MPL-1.1, weak copyleft as here.
>
> **Detailed by D201 (2026-10-10):** a licence gate holds every package the binary can bundle to this.

**Decision:** Dependencies are permissive (MIT, ISC, BSD, Apache-2.0, BlueOak, Zlib). Weak copyleft is accepted for
use, by name: `elkjs` (EPL-2.0, under beautiful-mermaid) and `@resvg/resvg-wasm` (MPL-2.0). `jszip`, "MIT OR
GPL-3.0-or-later", is taken under MIT. A new dependency's licence, and its own dependencies', is checked before it's
added. What the binary owes each library: design/distribution.md § Notices.

**Why:** Weak copyleft asks something of a binary that ships the library: its licence text and where its source is,
and a change to the library's own files would have to be shared. Neither reaches slipbox's own code.

## D193: slipbox to be open source; its licence parked (14.6, 2026-10-09)

> **Amended by GR-D3 (2026-10-12):** the licence is decided: Apache-2.0. A `LICENSE` file with its text,
> `package.json`'s `license`, and the packs and the Homebrew formula carry it; `14.6` is done.

**Decision:** The user means to open-source slipbox and hopes for contributors. Its licence was weighed (MIT,
Apache-2.0, or dual "MIT OR Apache-2.0", ideas.md § Licence) and the choice parked; it was left for later again when
distribution was decided, 2026-10-10. Once chosen: a `LICENSE` file, and the notices it ships. Until then
`package.json` says MIT, and there is no `LICENSE` file.

**Why:** Parked by the user, to be discussed later. Whatever is picked, the libraries the binary bundles ask the same
of it when it's distributed (D192).

**Cost:** No `LICENSE` file yet; the Homebrew formula leaves its licence out until there is one (D204).

## D194: Hunspell taken under MPL-1.1 (25.6, 2026-10-10)

**Decision:** Hunspell, which `hunspell-asm` (MIT) compiles and the binary embeds for spelling (D157), is offered
as "MPL-1.1 OR GPL-2.0 OR LGPL-2.1", and taken under MPL-1.1. The dictionaries shipped, `dictionary-en` (MIT and BSD,
from SCOWL) and `dictionary-tr` (MIT), go with their licence texts.

**Why:** MPL-1.1 is weak copyleft, which D192 accepts for use.

## D195: The compiled binary loads nothing of the folder it starts in (14.1, 2026-10-10)

**Decision:** The compiled binary is built with Bun's autoloading off: it reads no `bunfig.toml`, `.env`,
`tsconfig.json` or `package.json` of the folder it starts in. `package.json`'s `build` carries the flags, releases are
built with it, and a test checks.

**Why:** A Bun-compiled executable loads them from the folder it starts in by default, which is whatever repository or
notes folder slipbox runs in: that folder's preload would run, as its code, whenever slipbox did. The launcher has run
without them since 2026-10-07 (`23.9`, D176), under D172: run nothing of a folder's own.

## D196: SQLite is the runtime's own, through node:sqlite (6.11, 2026-10-10)

> **Verified (2026-10-12):** CI runs the suite on macOS (`macos-15`) on every change since the repository went
> public (GR-D9), and the release's build on both Macs: Apple's SQLite runs FTS5 with `unicode61`, and `bm25`, the
> search tests passing there (`14.13`).

**Decision:** better-sqlite3 is dropped (D191): SQLite is the runtime's own, through `node:sqlite`. Bun implements it
as Node does: its own SQLite on Linux and Windows (3.53.2 in Bun 1.4.2), macOS's system one on macOS.
`core/sqlite.ts` keeps the calls slipbox made.

**Why:** Nothing native is packaged per platform for it. better-sqlite3 alone raised the glibc a Linux build needs
from Bun's and OpenTUI's 2.17 to 2.34 (measured 2026-10-10), with a 13.x line of early regressions and an install
script Bun runs regardless. trailscout since moved to `node:sqlite` (its research: `node:sqlite` as new as
better-sqlite3's on Node, FTS5 as fast). `node:sqlite` over `bun:sqlite`: one API under Node and Bun.

**Cost:** On macOS the SQLite is Apple's, older and of the OS's version. slipbox asks only FTS5 with `unicode61`
(3.27 and up), `bm25`, WAL and a busy timeout, loads no extension, and both its databases are caches, made again when
they don't open.

**Not chosen:** `bun:sqlite` (ideas.md § Distribution).

**Verify:** on a real Mac before the first release, Apple's SQLite runs FTS5 and `bm25` (`14.13`).

## D197: macOS and Linux first, Windows if it isn't difficult (14.2, 2026-10-10)

> **Detailed by GR-D13 (2026-10-12):** previews from the `test` branch, built by the release's own workflow
> (`build.yml`) and published as pre-releases. The first release is 0.2.1, published 2026-10-12 (GR-D18).

> **Partly superseded by D238 (2026-10-17):** macOS is Apple silicon's alone: no x64 build after 0.3.0, the last
> release built for Intel Macs, and none of CI's jobs runs on one. Linux stays x64 and arm64.

**Decision:** Decided with the user after reading trailscout's packaging design (its `design/09-application.md`, the
same machine), taken where it fits: slipbox has no daemon, no native npm packages and no models to fetch. Releases are
for macOS (arm64, x64) and Linux (x64, arm64) first, and Windows if it isn't difficult (D205). Each platform is built
on its own in CI, where its native is installed. Detail: design/distribution.md § Releases.

**Why:** OpenTUI ships natives for all of them, musl and Windows included, and a platform's OpenTUI package is
installed only on that platform.

## D198: No signing or notarization at first (14.13, 2026-10-10)

> **Amended (2026-10-12):** a Mac's binary no longer keeps the signature Bun gives it: the first previews found the
> x64 build's broken, so each is signed ad hoc again by `codesign` on the Mac that built it (`scripts/release.ts`'
> `signArgs`), then checked with `codesign --verify`. Still neither signed with an identity nor notarized.
>
> **Verified (2026-10-12):** on CI's Macs (`macos-15`, `macos-15-intel`), each Mac binary's signature holds once
> signed again; 0.2.1's were checked so before it was drafted (`14.13`).

**Decision:** Releases are neither signed nor notarized at first. A Mac's binary keeps the ad hoc signature Bun gives
it: it is built on a Mac, and its signature checked with `codesign --verify`.

**Why:** A binary a browser downloads is stopped by Gatekeeper, but the installer's `curl` doesn't mark it. Bun signs
a darwin binary ad hoc, and cross-compiling has broken that signature before.

**Cost:** A release downloaded by a browser on a Mac is stopped by Gatekeeper.

**Not chosen:** signing and notarizing from the first release (ideas.md § Distribution).

**Verify:** on a real Mac before the first release, the binaries' signatures hold (`14.13`).

## D199: A daily update check, on by default, sending nothing identifying (14.4, 2026-10-10)

> **Detailed by D221 (2026-10-11):** Bun's own crash reports are turned off at start.
>
> **Amended by GR-D15 (2026-10-12):** the check, and `slipbox upgrade`, follow the install's channel: on `preview`,
> the newest preview is asked for as well, from the Pages site's `preview` file and that preview's `SHA256SUMS`, and
> the newer of the two taken. Plain GETs of public files still; nothing identifying is sent.

**Decision:** The TUI asks once a day for the latest release, on by default, and says when there's a newer one;
`slipbox upgrade` installs it. Only the TUI checks: the CLI never does. `DO_NOT_TRACK=1` or the config turns it off.
Detail: design/distribution.md § Updates.

**Why:** The check asks for the latest release and sends nothing that identifies you. The CLI is what agents call.

**Verify:** Bun's own crash reports, sent on macOS and Windows unless `DO_NOT_TRACK` is set, are checked in the
compiled binary, and turned off or said.

## D200: Folders keep XDG's on macOS too; Windows' own (14.9, 2026-10-10)

**Decision:** Folders keep today's convention (D39): XDG's on Linux and macOS (`~/.config`, `~/.local/state`,
`~/.local/share`, `~/.cache`). On Windows, `%APPDATA%\slipbox` for the config, which may roam, and
`%LOCALAPPDATA%\slipbox` for data, state and cache. An `XDG_*` set is respected on every platform. A `CACHEDIR.TAG` in
the cache tells backup tools to skip it. Detail: design/distribution.md § Folders.

**Why:** The dotfiles people keep and sync are in XDG's folders, not in `~/Library`. A database never roams. The cache
is all rebuilt when it's missing.

**Not chosen:** `~/Library` on macOS (ideas.md § Distribution).

## D201: The supply chain's gates (14.10, 2026-10-10)

> **Amended by GR-D9, GR-D11 (2026-10-12):** every workflow starts from no permission (`permissions: {}`), each job
> granting its own with a comment, and every job has a timeout: `check-deps.ts` checks both beside the pins. zizmor
> and actionlint audit the workflows in `bun run check`; the toolchain comes from `mise.toml`, each download checked
> against `mise.lock`; Dependabot proposes updates monthly with the week's cooldown, and `bun audit` scans `bun.lock`
> weekly. design/repository.md § Dependencies.

**Decision:** `scripts/check-deps.ts`, run by `bun run check` and in CI, fails on a version not exact; an install gate
off (no install scripts, a version taken only once it's a week old, `bun add` pinning); a licence slipbox doesn't take
(D192); and an action not pinned by its commit's full hash. CI installs with `--frozen-lockfile` and runs with
`contents: read`. Detail: design/distribution.md § The supply chain.

**Why:** A package taken over and republished is mostly found and pulled within a week. No install script needs to
run: the tree-sitter grammars' would build native bindings slipbox doesn't use. A tag can be moved. And D192 holds for
every package the binary can bundle.

## D202: Language servers installed from lockfiles slipbox ships (14.11, 2026-10-10)

**Decision:** Each package slipbox pins (the npm language servers, markdownlint-cli2) has a full lockfile, resolved
with the week's wait slipbox's own dependencies have, and carried in the binary; a server slipbox installs is
installed from it, amending D162. One installed under an older lock is behind: with installing on, it's installed
again before it starts. Detail: design/distribution.md § Language servers' lockfiles; design/lsp.md, "Installing".

**Why:** What slipbox installs for you gets the gates its own dependencies have (D201): the whole tree pinned, a week
old, every package held to an integrity hash.

## D203: Alpine's musl, built and run by CI (14.5, 2026-10-10)

> **Clarified (2026-10-12):** Bun's musl build links the C++ runtime, `libstdc++` and `libgcc`, which a bare Alpine
> hasn't: the installer says to add them, and CI's check shows the binary doesn't start without them before it adds
> them.

**Decision:** Linux whose C library is musl, Alpine's, gets packs of its own (`-musl`, x64 and arm64), OpenTUI's musl
library fixed in at build time; the installer picks them where musl is, and CI runs each in Alpine. Detail:
design/distribution.md § Releases.

**Why:** Asked for by the user. OpenTUI ships a musl native (D197), and picks it only by `OPENTUI_LIBC=musl` at run
time, so a musl build fixes that in.

## D204: Homebrew: a formula each release, into a tap (14.3, 2026-10-10)

> **Amended by GR-D3, GR-D9, GR-D15, GR-D18 (2026-10-12):** the formula names its licence, Apache-2.0; the tap's
> token is a secret of the `release` environment, which only a `v*` tag's run enters; a preview never reaches the
> tap. There's no tap yet: it and its token follow the first release, and until then `homebrew.yml` is skipped.

> **Amended by D228 (2026-10-13):** the tap is `remziduzagac/homebrew-tap`, shared with herdsman, pushed to with a
> deploy key, not a token.

> **Amended by D238 (2026-10-17):** the formula's macOS block asks for arm64 (`depends_on arch: :arm64`) and holds
> Apple silicon's pack alone, so an Intel Mac is refused with Homebrew's own word, not a formula with no address.

**Decision:** Each release writes a Homebrew formula, copied into a tap once the release is published. A slipbox
Homebrew installed is left to brew: `slipbox upgrade`, the daily check and `slipbox uninstall` say brew's commands.
Detail: design/distribution.md § Homebrew.

**Why:** Asked for by the user. A slipbox Homebrew installed is Homebrew's to change.

## D205: Windows through WSL now; native Windows staged (14.12, 14.14–14.17, 2026-10-10)

**Decision:** Windows is reached through WSL for now (`14.12`): the Linux release and `install.sh` run there as they
are, and what differs from other Linux (Windows' clipboard, its drives, its fonts for a PDF) is handled. Native
Windows is staged: packaging (`14.14`), note paths (`14.15`), commands, processes and signals (`14.16`), then the test
suite on a Windows runner (`14.17`). Detail: design/distribution.md § Windows.

**Why:** Windows only if it isn't difficult (D197), and WSL is Linux, so the Linux release runs there as it is. Each
native step waits for a Windows CI runner to check it: nothing here can run a Windows binary, and there is no Windows
CI yet.

## D221: Bun's own crash reports are off (14.4, 2026-10-11)

**Decision:** slipbox turns off the crash reports Bun sends by itself: at start, unless you set
`BUN_ENABLE_CRASH_REPORTING` or `BUN_CRASH_REPORT_URL` yourself, it sets `BUN_ENABLE_CRASH_REPORTING=0` in the
process's own environment, through libc, where Bun's crash handler reads it. A crash still prints Bun's link, to file
a report yourself. Said in design/distribution.md § Updates and in the configuration reference's environment.

**Why:** D199's check found it: on macOS and Windows a Bun crash sends a report to `bun.report` unless `DO_NOT_TRACK`
is set, and a compiled binary is no different. slipbox's one network call is the update check, which sends nothing
identifying. Bun reads the switch when it crashes, from the C environment (`process.env` doesn't reach it): with it
set at start, a crash with reporting on sent nothing (*ran*, 2026-10-11, curl's connection watched through a local
proxy).

**Not chosen:** only saying so, which D199 allowed; re-running the binary with the variable set, which costs a second
start.

## D228: Homebrew through the shared tap, pushed with a deploy key (14.3, 2026-10-13)

**Decision:** slipbox's formula goes into `remziduzagac/homebrew-tap`, the tap herdsman already publishes to (`brew
install remziduzagac/tap/slipbox`), not a tap of its own. `homebrew.yml` checks the tap out with an SSH deploy key,
`HOMEBREW_TAP_DEPLOY_KEY`, a secret of the `release` environment, as herdsman's release workflow does. The key is
slipbox's own, titled "slipbox release workflow" on the tap, beside herdsman's. It has no expiry: `renewals.toml`
gives it a rotation date, a year on. The key, the secret and the `HOMEBREW_TAP` variable were set by the maintainer
the same day. Decided by an issue (#38) and one pull request (D223).

**Why:** The user's call: herdsman already works this way, and one tap holds both tools. A deploy key writes to that
repository only and never expires unnoticed, where a fine-grained token expires and has to be remade. A key of
slipbox's own, since GitHub never shows a secret again, so herdsman's couldn't be copied, and either can be revoked
without the other.

**Cost:** The key can write to herdsman's formula too: it's scoped to the tap, not to a file. The tap's first formula
is 0.3.0's; 0.2.1 and 0.2.2 have none.

**Not chosen:** a tap of slipbox's own, `remziduzagac/homebrew-slipbox`, as planned; the fine-grained token
`HOMEBREW_TAP_TOKEN`, as planned (GR-D9); herdsman's key, shared.

## D238: No build for Intel Macs; 0.3.0 was the last (14.2, 14.18, 2026-10-17)

**Decision:** The maintainer's call: slipbox stops supporting Intel Macs, completely. From 0.4.0 no `darwin-x64` pack is
built, attested, summed or put in the Homebrew formula, and no CI job runs on an Intel Mac (`macos-15-intel` leaves the
terminal tests and the release's build). 0.3.0 was the last release built for them; its packs stayed published until the
history started afresh (2026-10-22), and aren't any more. On an Intel Mac the installer says so, naming 0.3.0, and stops
before downloading anything; `slipbox upgrade` on that platform says the same before it asks for anything; the formula
asks for arm64 on macOS. The platforms retired and the last release for each are one table, `core/release.ts`'s
`RETIRED`, which the installer's message is held to by a test. A Mac terminal under Rosetta on Apple silicon still gets
the arm64 build. Detail: design/distribution.md § Releases, § Installing, § Homebrew, § Updates.

**Why:** Apple has stopped making macOS for Intel Macs: macOS 26 Tahoe is the last they get. And CI's Intel Mac was
the slowest and flakiest of its four terminal-test runners: the release of 0.2.0 failed on it (GR-D18), and waits and
timeouts were set by it (design/testing.md § Strategy).

**Cost:** An Intel Mac stays on 0.3.0, which its own installer still installs. 0.3.0's `slipbox upgrade` runs 0.3.0's
code, which says only that it couldn't find the latest release's `darwin-x64` build; the plain message is in the
installer and in builds from 0.4.0 on. Running from source on an Intel Mac may still work, untested.

**Not chosen:** keeping the Intel build until Apple's last security update for macOS 26; building it without testing
it (ideas.md § Distribution).

## D258: A release's site deployed by a run on `main`, and every deployment read back (2026-10-23)

> **Amended by D?1 (2026-10-24):** a `push` repeat isn't served either (#7), so every run but a preview's and one
> by hand on `main` hands off to a run by hand on `main`, and `main` moving deploys nothing; the read-back reads a
> marker of the run's own too.

**Decision:** When a release is published, `pages.yml` deploys nothing under the `release` event: that run's one job,
`redeploy` (`actions: write`), starts a run of the workflow by hand on `main`, which builds and deploys the site as any
run does. Every deployment then reads `stable` and `preview` back from the site until they're the lines it built, for
eleven minutes at most, past the ten the site's cache keeps a file, and fails if they never are. Amends GR-D14.
Detail: design/distribution.md § Previews, `MAINTAINING.md` § Releasing.

**Why:** A Pages deployment made under a `release` event is reported a success and never served when its commit was
deployed before (actions/deploy-pages#383, open since 2024), and under D251 a release's commit always was, by its
preview. After 0.5.0 was published, the site went on without a `stable` channel, so the installer and `slipbox
upgrade` on the stable channel found no release, until another commit was deployed an hour later. That issue's reports,
from several repositories, find a run by hand of a commit deployed before served. Reading the channels back turns a
deployment that isn't served into a failed run, whatever the cause.

**Cost:** A release's site comes from a second run, a minute or two later. `preview.yml`'s call to `pages.yml` grants
`actions: write` too, since GitHub checks every called job's grants, whichever runs; only `redeploy`, which never runs
for a preview, takes it. A deployment the site doesn't serve takes its run eleven minutes to fail.

**Not chosen:** naming a deployment other than by its commit (deploy-pages takes no other name, and the Pages API
answered 404 to one in that issue's reports); deploying by hand as a step of the release (the step 0.5.0 lacked); a
query string to get past the site's cache (it isn't part of the cache's key: a new one is a hit).

## D?1: Only a preview's run and a run by hand on `main` deploy the site, each read back by its own marker (2026-10-24)

**Decision:** `pages.yml` deploys in two kinds of run only: a preview's (`preview.yml`'s call, under its push to
`test`), its commit's first deployment, and a run by hand on `main`. Every other run deploys nothing and starts a run
by hand on `main` instead (`redeploy`): a release published, as D258 has it, and now a run by hand on `test` or a tag.
`main` moving no longer starts `pages.yml`: it moves only for a release (D251), which deploys once it's published, so
a release's docs go live with it. Every deployment also puts a marker of its own on the site, `deployment` (the run's
ID and attempt), and reads it back with the channels, for eleven minutes by the clock; it fails when the site doesn't
serve it. A re-run of the deploy job alone is refused, the marker an attempt older than the run's: it would deploy the
run's site again, older than any since. Amends D258 and GR-D14. Detail: design/distribution.md § Previews.

**Why:** A deployment is named by its commit, and one of a commit deployed before is reported a success and not served
under a `push` as well as a `release`: #7's preview, of the commit `main`'s push had deployed, wasn't, and nor was a
tag's push in actions/deploy-pages#383; no report has a `push` repeat served. Under D251, `main` takes only `test`'s
commits, each deployed by its preview, so `main`'s push was such a repeat, and its read-back passed on the channels the
preview had served whether it was served or not (0.5.0's isn't recorded). A run by hand was served in every report, and
here four times, on 2026-10-24: on `main`, of 0.5.0's commit, deployed before from `test`, `main` and `v0.5.0`; on
`test`, of 71313f3, deployed before from `test`; and on `main` twice in a row, the second deploying the commit the site
was serving, as a release's run by hand does ([research/github-behaviour.md](../research/github-behaviour.md) § Pages,
T24). A preview's own deployment is its commit's first, served whatever the event, so it stays in the preview's run,
which fails when its site isn't served. The marker is in no other deployment, so the read-back can no longer pass on
channels the site served already. Dropping `main`'s push: handed off, it would put a release's docs on the site when
`main` moves, before the release is built and published; and it doubled the runs in the `pages` group, where a newer
pending run replaces an older one (the maintainer's call, 2026-10-24). A preview or a run by hand before the release is
published still builds the docs from `main`, as every deployment does.

**Cost:** A run by hand elsewhere becomes two runs, a minute apart, like a release's. A change to the bootstrap, the
docs or the site reaches the site with the next preview or release, or a run by hand. A deployment that fails its
read-back is fixed by a run by hand on `main`, never by re-running its deploy job. One more file on the site.

**Not chosen:** every deployment a run by hand on `main`, previews too (one rule, but a preview's run would pass with
its site not served: the maintainer's call, 2026-10-24); `main`'s push kept, handed off (the docs live before the
release); asking Pages first whether the commit was deployed (`pages/deployments/<sha>` answers an empty status for one
never deployed; an answer nothing documents, a check that can race the deployment, and a second path); a hand-off that
waits for the run it starts (it deadlocks in the `pages` concurrency group, and a newer pending run replaces one waited
for).
