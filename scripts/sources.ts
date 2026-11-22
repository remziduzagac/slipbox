// The sources a release carries beside its binaries (D277): each fetched from where its project publishes it, kept
// only as the archive `scripts/licences.ts` records, and the release refused without it. And what the release's
// scripts fetch with, and the SHA-256 they take.

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type SourceArchive, sourceArchives } from "./licences.ts";

/** Bytes' SHA-256, in hex. */
export const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

/** What's at `url`, fetched; failing unless it's there. */
export async function download(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`couldn't download ${url}: ${res.status} ${res.statusText}`);
  return new Uint8Array(await res.arrayBuffer());
}

/** The sources a release carries, written into `out`: each archive fetched (`get`), or kept when it's there
 *  already, as recorded. One that isn't the archive recorded (its SHA-256 another) is refused, and not written. */
export async function fetchSources(
  out: string,
  get: (url: string) => Promise<Uint8Array> = download,
  archives: SourceArchive[] = sourceArchives(),
): Promise<string[]> {
  const written: string[] = [];
  for (const a of archives) {
    const file = join(out, a.name);
    if (!existsSync(file) || sha256(readFileSync(file)) !== a.sha256) {
      const bytes = await get(a.url);
      const got = sha256(bytes);
      if (got !== a.sha256)
        throw new Error(`${a.url}: its SHA-256 is ${got}, not ${a.sha256}, ${a.of}'s source recorded: not kept`);
      writeFileSync(file, bytes);
    }
    written.push(file);
  }
  return written;
}

/** The release in `out` refused unless it carries each source as recorded (D277): the binaries link code whose
 *  licence asks for its source to go with them. The archives' paths. */
export function checkSources(out: string, archives: SourceArchive[] = sourceArchives()): string[] {
  return archives.map((a) => {
    const file = join(out, a.name);
    if (!existsSync(file))
      throw new Error(`${a.name}, ${a.of}'s source, isn't in ${out}: a release carries it beside its binaries`);
    const got = sha256(readFileSync(file));
    if (got !== a.sha256)
      throw new Error(`${a.name}'s SHA-256 is ${got}, not ${a.sha256}, ${a.of}'s source recorded: not released`);
    return file;
  });
}
