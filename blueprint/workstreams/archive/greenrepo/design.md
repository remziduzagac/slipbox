# Design changes

Each change names the root's design section it lands in at consolidation. A task writes the new text here as it does
the work; the root's files change only when GR is consolidated.

## ADDED design/repository.md

The repository itself, as greenrepo has it kept: its documents and who each is for; the one check command and its
parts, with the tools `mise.toml` pins; CI (its jobs, the aggregator, permissions, triggers, concurrency); the
dependencies' upkeep (Dependabot, the scanner); the settings and rulesets, and the committed expected settings; the
weekly health check, the renewals and the accepted deviations; how a change lands (GR-D6). Written by the tasks that
build each part (GR-T3 to GR-T11), put together by GR-T13.

## MODIFIED design/distribution.md § The supply chain

zizmor and actionlint beside the gates; CI starting from no permission (`permissions: {}`), each job's grants
explained; the toolchain from `mise.toml`; Dependabot and the scanner (GR-T9, GR-T10).

## MODIFIED design/distribution.md § Releases

The packs carry slipbox's `LICENSE` (GR-T1); the release holds an SBOM, attested, and its notes come from the
changelog (GR-T9); "The workflow can't have run yet: the repository has no remote" goes (GR-T14).

GR-T1: in the first paragraph, "Each is packed, with its notices, as `slipbox-<version>-<target>.tar.gz`" becomes
"Each is packed, with slipbox's `LICENSE` and the third-party notices, as `slipbox-<version>-<target>.tar.gz`".

## MODIFIED design/distribution.md § Homebrew

The formula names its licence (GR-T1); the tap's token lives in the `release` environment (GR-T9).

GR-T1: "Its licence is left out until there is one (`14.6`, D193)." becomes "Its licence is Apache-2.0 (GR-D3);
Homebrew installs the pack's `LICENSE` with it."

## MODIFIED design/distribution.md § Notices

slipbox's own licence, Apache-2.0, beside the third parties' (GR-T1).

GR-T1: "slipbox's own licence is still to decide (`14.6`, D193)." becomes "slipbox's own licence, Apache-2.0
(GR-D3), is `LICENSE`, in the repository and in each pack beside `NOTICES.txt`; `tests/distribution.test.ts` keeps it
and `package.json`'s `license` one."

## MODIFIED design/testing.md § Strategy

The suite on Linux and macOS in CI; the flaky-test policy; Biome, the Markdown lint, spelling and links in the check
(GR-T4, GR-T6, GR-T8).

## MODIFIED the CLI's design, for `slipbox skill`

The section that lists the CLI's commands gains `skill` (GR-D10); GR-T12 names it.

## MODIFIED design/distribution.md § Signing (`14.13`)

A Mac's binary is signed ad hoc again after it's compiled, on the Mac that built it (`codesign --force --sign -`,
`signArgs` in `scripts/release.ts`): the first previews found the x64 build's own signature broken ("code or signature
have been modified"), the arm64 one's whole. `codesign --verify` then checks both, as before.

Previously: "keeps the ad hoc signature Bun gives it".
