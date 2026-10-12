---
status: done
assignee: claude-cli
blocked_by: []
created: "2026-10-12"
---

# GR-T16: Channels: the bootstrap installer, `slipbox channel`, upgrades

An install follows stable releases or previews (GR-D14, GR-D15).

## Description

- `scripts/bootstrap.template.sh` and `bun scripts/bootstrap.ts <owner/name> <out>`: the Pages `install.sh`. POSIX
  `sh`, its body a function called on the last line; `--preview` (or `SLIPBOX_CHANNEL=preview`) picks the channel; it
  reads `<pages>/<channel>`, downloads that release's `install.sh`, checks its SHA-256 and runs it with the arguments
  left and the channel; a channel with no release says so.
- The release's installer (`install.template.sh`) keeps the channel it was given in `<data>/channel`.
- `slipbox channel` says the channel; `slipbox channel set stable|preview` sets it, for an install the installer made;
  for Homebrew's or a source run it says how that one updates (exit 5). `--json` as other commands.
- `upgrade` and the daily check (`core/update.ts`): on `preview`, the newest of the stable release and the newest
  preview (`<pages>/preview`, then that release's `SHA256SUMS`); `SLIPBOX_CHANNELS_URL` stands in for Pages, as
  `SLIPBOX_RELEASES_URL` does for the releases. Nothing identifying sent (D199).
- The docs: the install guide (the one line, previews, channels; the stale "no public repository"), the CLI chapter,
  the versions chapter, the README; the skill if it mentions installing.

## Acceptance criteria

- The bootstrap tested as the installer is (fakes, a `file://` Pages and releases): stable, preview, a channel with no
  release, a wrong sum refused; the channel command and the upgrade's choice tested; tried live (D209);
  `tests/docs.test.ts` passes.

## Design text

### MODIFIED design/distribution.md § Installing

The section's opening, "`finish` also writes `install.sh` … It's a release asset, run as" and the code block after
it, becomes:

> `finish` also writes `install.sh` (`14.7`, D197): `scripts/install.template.sh` with the release's version, tag,
> repository and each pack's SHA-256 written in — so a pack that isn't the one released is refused, wherever it came
> from. It's a release asset, and what installs; people run it through the bootstrap on the Pages site (GR-D14):
>
> ```bash
> curl -fsSL https://<owner>.github.io/<name>/install.sh | sh                    # the latest release
> curl -fsSL https://<owner>.github.io/<name>/install.sh | sh -s -- --preview    # the newest preview
> ```
>
> **The bootstrap**, `scripts/bootstrap.template.sh` with the repository and its Pages site written in by `bun
> scripts/bootstrap.ts <owner/name> <out-file>` (the repository checked as `release.ts`' `repoOf` checks it; Node's
> modules only, so `pages.yml` runs it with `bun --no-install`), installs nothing itself. POSIX `sh`, its body a
> function called on its last line, curl or wget, https only (and `file:`, for a mirror or the tests), nothing as
> root. `--preview`, or `SLIPBOX_CHANNEL=preview`, picks the channel, `stable` by default; any other value is refused.
> It reads the channel's file, `<pages>/stable` or `<pages>/preview` (§ Channels): not there (curl's HTTP error or
> missing file, GNU wget's error response), the channel has no release, and it says so — for `stable` before the first
> release, that `--preview` installs the newest preview; not reached, it says why. The line must be a tag of the
> channel's own kind (`v<x.y.z>`, or `preview-<12 digits>-<7 hex>`: it goes into an address) and a SHA-256, nothing
> more. Then `<releases>/download/<tag>/install.sh` is downloaded to a temporary folder (removed however it ends), its
> SHA-256 checked against the line's — another is refused and never run — and it runs with the arguments left, in
> order, and `SLIPBOX_CHANNEL` set to the channel; its exit is the bootstrap's. `SLIPBOX_CHANNELS_URL` reads the
> channels' files from elsewhere, as `SLIPBOX_RELEASES_URL` the releases.
>
> The release's installer runs on its own too (`…/releases/latest/download/install.sh | sh`). POSIX `sh` (dash, bash,
> macOS's), the whole of it a function called on its last line, so a download cut short runs nothing. In order:

Step 4, **Installed**, gains after "Where that link is goes in `<data>/bin-link`, for `uninstall`.":

> And the channel it was given (`SLIPBOX_CHANNEL`: `stable`, the default, or `preview`; any other refused before
> anything is downloaded) goes in `<data>/channel`, written beside it and renamed over it (§ Channels).

The paragraph on `SLIPBOX_RELEASES_URL` is GR-T15's ("`<base>/download/<tag>/<pack>`, the tag written into the
installer with the version").

### ADDED design/distribution.md § Channels

After § Homebrew:

> An install follows a channel (GR-D15): `stable`, the releases, or `preview`, the previews as well (§ Previews). It's
> kept with the install, in `<data>/channel` beside `current` (`core/install.ts`: `readChannel`, `writeChannel`), one
> word; none, or any other word, is `stable`. The installer writes it (§ Installing); `slipbox channel` says it, and
> `slipbox channel set stable|preview` writes it in one step (`atomicWrite`). `--json`: `{channel}`, with `set`
> `{channel, previous}`.
>
> Only the installer's install has one (`installedBy`): Homebrew's follows Homebrew, which never gets a preview, and
> slipbox run from source, or a binary put somewhere by hand, follows nothing. For those, `slipbox channel` refuses,
> exit 5, saying how that one updates (`noChannel`): `brew upgrade slipbox`, the checkout, the releases' page. The
> daily check of a Homebrew install follows stable releases.
>
> **The Pages site's channel files** (`pages.yml`, § Previews) are what a channel offers: `stable` and `preview`, each
> one line, `<tag> <SHA-256 of that release's install.sh>`, absent when the channel has no release. The bootstrap reads
> the channel's to install; `upgrade` and the daily check read `preview`'s (§ Updates). The site is
> `https://<owner>.github.io/<name>` for the release's repository (`core/release.ts`' `pagesBase`, the owner in lower
> case as Pages names it; `release.ts`' `pagesUrl` checks the repository first), or `SLIPBOX_CHANNELS_URL`.
>
> **How a preview is named** — its tag, `preview-<time>-<hash>`, and its version, `<x.y.z>-preview.<time>.g<hash>`
> (`PREVIEW_TAG`, `PREVIEW_VERSION`, `tagOf`) — is `core/release.ts`'s, the binary's own, which `release.ts`
> re-exports: what upgrades follow and what releases are made as can't drift apart.
>
> Back on `stable` from a preview, nothing is taken back: `upgrade` never installs an older version, so the preview
> stays until a release newer than it — its own version's release, which sorts after it — is out.

### MODIFIED design/distribution.md § Updates

The first paragraph, after "the sum each download is checked against.", gains:

> On `preview` (§ Channels), the newest preview is asked for as well, at the same time: the site's `preview` file
> names its tag, and `<releases>/download/<tag>/SHA256SUMS` its packs (`fetchPreview`; refused unless the line is a
> preview's tag and a SHA-256, and the version its packs carry is that tag's). The newer by `Bun.semver` of the two is
> taken (`fetchNewest`), either alone when the other has none — no preview, or no stable release yet. Each is
> downloaded from its own tag, `<releases>/download/<tag>/<pack>`, never `v<version>` for a preview. `<pages>` is the
> repository's Pages site, or `SLIPBOX_CHANNELS_URL`, laid out the same way.

"A plain GET of a public file; nothing identifying is sent." becomes "Plain GETs of public files, one on `stable`,
three on `preview`; nothing identifying is sent."

**The daily check**: "A newer release is said in the message line: `slipbox 0.3.0 is out (this is 0.2.0): slipbox
upgrade installs it`" gains "— on `preview`, `slipbox 0.3.0-preview.202610121530.g1a2b3c4 is out on the preview
channel (this is 0.2.0): …`. It follows the installer's install's channel; any other install's, stable releases."

**`slipbox upgrade`**: "moves the installer's install to the latest release" becomes "moves the installer's install to
the newest its channel offers"; after "Any check failing changes nothing." add "Nothing found on `preview` says where
it looked, the releases and the site's `preview`. When the version installed is newer than what's offered — a preview,
back on `stable` — it's current, and said so: `slipbox <version> is newer than the latest release, <latest>: it stays
until a newer one`."

### MODIFIED design/distribution.md § Uninstalling

"then `versions/`, `current` and `bin-link`" becomes "then `versions/`, `current`, `bin-link` and `channel`".

### MODIFIED design/how-it-works.md § Module map

```text
| `core/release.ts` | 14.2 | what a release build was told when built; how a preview is named; the Pages site |
| `core/install.ts` | 14.8 | the installer's layout read; how slipbox was installed; its channel; `uninstall`'s plan |
| `core/update.ts` | 14.4 | the newest the channel offers, from its sums; the daily check; `upgrade` |
```

Previously: `core/release.ts`, "what a release build was told when built: its repository and platform";
`core/install.ts`, "the installer's layout read; how this slipbox was installed; `uninstall`'s plan"; `core/update.ts`,
"the latest release from its sums; the daily check; `upgrade`".

### MODIFIED design/testing.md § Strategy (`0.4`)

The `tests/distribution.test.ts` row: "a release built, installed, upgraded, removed" becomes "a release built,
installed (through the Pages bootstrap too), upgraded on either channel, removed; the bootstrap and the channels".

### The CLI's commands (D18)

No design section lists the CLI's commands one by one (GR-T12's note): the list is D18's, and the user's reference is
`docs/manual/cli.md`, which gains `channel` beside `upgrade`. At consolidation, D18's list of commands as they are now
gains `channel` with `upgrade`, `uninstall` and `skill`.

## Log

- 2026-10-12: `scripts/bootstrap.template.sh` and `scripts/bootstrap.ts` (`bootstrapScript`); `install.template.sh`
  records `<data>/channel` and refuses a channel not one of the two; `src/core/release.ts` (`pagesBase`, and
  `PREVIEW_TAG`, `PREVIEW_VERSION`, `tagOf`, moved from GR-T15's `release.ts`, which re-exports them and takes
  `pagesBase` in `pagesUrl`); `src/core/install.ts` (`Channel`, `readChannel`, `writeChannel`, `noChannel`; the plan
  removes `channel`); `src/core/update.ts` (`channelsBase`, `previewIn`, `fetchPreview`, `fetchNewest`, `sayOut`; the
  daily check and `upgrade` follow the channel, downloading from the candidate's tag); `src/tui/run.ts` (the daily
  check gets the installer's install's channel); `src/cli/cli.ts` (`channel`: help, `CLI_COMMANDS`, `MAX_ARGS`, the
  handler; `upgrade` names the preview channel, and says when the install is newer than what's offered). No command
  spec: like `upgrade`, it's no TUI action.
- Rebased on GR-T15 (`gr/previews` at `e116d3e`): its `TAG="@TAG@"` in the installer replaces the tag this task had
  the installer derive from its version; the fixtures lay releases out by tag; the end-to-end test writes the site's
  channel files with GR-T15's `channelFiles` and `writeSite`, so the two halves are tested against each other.
- Choices beyond the text: the installer run on its own takes `stable` unless told (the bootstrap always tells it);
  `uninstall` takes `channel` with the installer's files, not only with `--purge`; `slipbox channel` (reading, too)
  refuses for an install without a channel, as the decision has it say how that one updates; the bootstrap tells a
  missing channel file (curl 22 or 37, GNU wget 8) from a site not reached, which busybox's wget can't (exit 1 for
  both: said as not reached).
- Tests: `tests/distribution.test.ts`, § channels (the bootstrap run as the installer is, with fake `uname`/`ldd`, on
  any machine: stable, `--preview` and `SLIPBOX_CHANNEL=preview`, arguments and channel passed on, the installer's
  failure passed on, no release on either channel, the site not reached, a wrong sum refused and never run, nine
  channel lines of another shape, `SLIPBOX_CHANNEL=beta`; the release's installer alone; the channel file; `noChannel`;
  the newest a channel offers, its four cases and the odd ones; the daily check's message; `upgrade` to a preview and
  back), and in the build for this machine, the bootstrap installing the release built, `slipbox channel` and `set`,
  `upgrade --check` on each channel and when what's offered is older than what's installed, the upgrade to a
  preview, a loose copy refused; the uninstall test's lists gain
  `channel`. `tests/cli.test.ts`: `channel` from source (exit 5) and its usage errors. `tests/docs.test.ts` reads the
  bootstrap's strings. 26 mutants (each choice in `fetchNewest`, the tag in the download, the tag/version check, the
  channel in `upgrade` and the daily check, the message, `previewIn`, `readChannel`, the uninstall plan, `noChannel`,
  the installer's tag, its channel file and refusal, the bootstrap's sum check, argument handling, channel passed,
  both tag forms, not-there codes, the hint, `bootstrapScript`'s check, `tagOf`, the CLI's two usage errors) each
  fail a test. A test walks the bootstrap script's imports: Node's modules and slipbox's own only, for `bun
  --no-install`. shellcheck clean on a generated bootstrap and preview installer.
- Ran: `tests/distribution.test.ts` whole (68 pass, the release built for this machine), `tests/release.test.ts`,
  `tests/docs.test.ts`, `tests/cli.test.ts` (106 pass; one fails here and not for this work: `stat`'s human output
  names the demo vault `halden@<branch>` in a linked worktree), the typecheck, the boundary, Biome on the touched
  files, `check:docs`.
- Tried live (D209): a release built for this machine into a scratch folder, a `file://` releases folder with it and
  a preview (`9.9.9-preview.202610121530.g1a2b3c4`), the site's files and bootstrap. In a home of its own: the
  bootstrap installed 0.2.0 and recorded `stable`; `channel`, `upgrade --check` (the latest), `channel set preview`,
  `channel --json`, `upgrade --check` (the preview, on the preview channel), `set stable`, `set beta` (exit 2), `set
  preview`, `upgrade` to the preview. Without `stable` on the site: the hint; `--preview` installed the preview and
  recorded `preview`. An installer changed after the site named it: refused, the home left empty. `curl … | sh -s --
  --preview` under dash and bash: installed. The TUI, in a tab of my own at 120×34, on a home set to previews: the
  message line said `slipbox 9.9.9-preview.202610121530.g1a2b3c4 is out on the preview channel (this is 0.2.0):
  slipbox upgrade installs it`.
