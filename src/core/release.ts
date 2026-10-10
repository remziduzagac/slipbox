// What a release build was told when it was built (plan 14.2): the repository its releases come from, and the
// platform it's for — defined by `scripts/release.ts` (`--define SLIPBOX_RELEASE=…`). Run from source, or built by
// hand (`bun run build`), it's null: such a slipbox has no release channel, so `upgrade` and the update check leave
// it alone.

declare const SLIPBOX_RELEASE: { repo: string; target: string } | undefined;

export interface ReleaseBuild {
  /** `owner/name` on GitHub: where its releases are published. */
  repo: string;
  /** The platform it was built for, as release assets name it: `linux-arm64`, `darwin-x64`… */
  target: string;
}

export const RELEASE: ReleaseBuild | null = typeof SLIPBOX_RELEASE === "object" && SLIPBOX_RELEASE ? SLIPBOX_RELEASE : null;
