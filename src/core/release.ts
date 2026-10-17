// What a release build was told when it was built (plan 14.2): the repository its releases come from, and the
// platform it's for — defined by `scripts/release.ts` (`--define SLIPBOX_RELEASE=…`). Run from source, or built by
// hand (`bun run build`), it's null: such a slipbox follows no releases, so `upgrade` and the update check leave it
// alone, and it has no channel (GR-D15).

declare const SLIPBOX_RELEASE: { repo: string; target: string } | undefined;

export interface ReleaseBuild {
  /** `owner/name` on GitHub: where its releases are published. */
  repo: string;
  /** The platform it was built for, as release assets name it: `linux-arm64`, `darwin-arm64`… */
  target: string;
}

export const RELEASE: ReleaseBuild | null =
  typeof SLIPBOX_RELEASE === "object" && SLIPBOX_RELEASE ? SLIPBOX_RELEASE : null;

/** Platforms released once and no longer, by their assets' names: whose machines they were, and the last release
 *  built for them (D238). The installer says the same (`scripts/install.template.sh`'s `target`). */
export const RETIRED: Record<string, { machines: string; last: string }> = {
  "darwin-x64": { machines: "Intel Macs", last: "0.3.0" },
};

/** What's said on a platform no longer released for — by the installer, and by `slipbox upgrade` before it asks for
 *  anything; null on any other. */
export function retired(target: string): string | null {
  const r = Object.hasOwn(RETIRED, target) ? RETIRED[target] : undefined;
  return r ? `${r.machines} aren't supported any more: ${r.last} was the last release built for them` : null;
}

/** The repository's GitHub Pages site, `https://<owner>.github.io/<name>`: it serves the installer, and a file per
 *  channel naming its newest release (GR-D14). Pages names an owner's site in lower case. */
export function pagesBase(repo: string): string {
  const [owner = "", name = ""] = repo.split("/");
  return `https://${owner.toLowerCase()}.github.io/${name}`;
}

// How previews are named (GR-D13), here for the binary's upgrades and for the release's scripts alike.

/** A preview's tag: `preview-<its commit's UTC committer time, YYYYMMDDHHMM>-<the commit's 7 first hex>`. */
export const PREVIEW_TAG = /^preview-(\d{12})-([0-9a-f]{7})$/;

/** A preview's version: `<the release to come's x.y.z>-preview.<time>.g<hash>`, a pre-release of that version, so it
 *  sorts after the previews before it and before the release. */
export const PREVIEW_VERSION = /^(\d+\.\d+\.\d+)-preview\.(\d{12})\.g([0-9a-f]{7})$/;

/** The tag a version is published under: a preview's `preview-<time>-<hash>`, else `v<version>`. */
export function tagOf(version: string): string {
  const p = PREVIEW_VERSION.exec(version);
  return p ? `preview-${p[2]}-${p[3]}` : `v${version}`;
}
