import { expect } from "bun:test";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sha256sums } from "../../scripts/release.ts";

/** Release packs share mechanisms while retaining each calling test owner's sandbox. */
export function makeDistributionPacks(sandbox: string) {
  /** A release's pack made by hand: a folder `slipbox-<version>-<target>/` holding `slipbox`, a script saying `says`. */
  function fakePack(
    dir: string,
    version: string,
    target: string,
    says = `slipbox ${version}`,
  ): { file: string; sha: string; asset: string } {
    const name = `slipbox-${version}-${target}`;
    mkdirSync(join(dir, name), { recursive: true });
    writeFileSync(join(dir, name, "slipbox"), `#!/bin/sh\necho '${says}'\n`);
    chmodSync(join(dir, name, "slipbox"), 0o755);
    const file = join(dir, `${name}.tar.gz`);
    expect(Bun.spawnSync(["tar", "-czf", file, "-C", dir, name]).exitCode).toBe(0);
    rmSync(join(dir, name), { recursive: true });
    return { file, sha: sha256sums([file]).split(" ")[0]!, asset: `${name}.tar.gz` };
  }

  /** A folder laid out as GitHub's releases are: `latest/download/SHA256SUMS`, `download/v<version>/<pack>`. */
  function fakeReleases(
    pack: { file: string; sha: string; asset: string },
    version: string,
    sums = `${pack.sha}  ${pack.asset}\n`,
  ): string {
    const base = mkdtempSync(join(sandbox, "releases-"));
    mkdirSync(join(base, "latest", "download"), { recursive: true });
    writeFileSync(join(base, "latest", "download", "SHA256SUMS"), sums);
    mkdirSync(join(base, "download", `v${version}`), { recursive: true });
    copyFileSync(pack.file, join(base, "download", `v${version}`, pack.asset));
    return base;
  }

  return { fakePack, fakeReleases };
}
