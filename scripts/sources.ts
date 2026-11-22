// The sources a release carries beside its binaries (D277): each fetched from where its project publishes it, kept
// only as the archive `scripts/licences.ts` records, and the release refused without it. And what the release's
// scripts fetch with, and the SHA-256 they take.

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type SourceArchive, sourceArchives } from "./licences.ts";

/** Bytes' SHA-256, in hex. */
export const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

/** How long a download may take, whole: an FFmpeg archive's 12 MB over a slow link, with room to spare. */
export const DOWNLOAD_TIMEOUT_MS = 5 * 60_000;

/** What's at `url`, fetched within `timeoutMs`; failing, naming the address, unless it's there. */
export async function download(url: string, timeoutMs = DOWNLOAD_TIMEOUT_MS): Promise<Uint8Array> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return new Uint8Array(await res.arrayBuffer());
  } catch (err) {
    const why =
      (err as Error).name === "TimeoutError" ? `nothing whole in ${timeoutMs / 1000} s` : (err as Error).message;
    throw new Error(`couldn't download ${url}: ${why}`);
  }
}

/** The sources a release carries, written into `out`: each archive fetched (`get`), or kept when it's there
 *  already, as recorded. One that isn't the archive recorded (its SHA-256 another) is refused, and not written. */
export async function fetchSources(
  out: string,
  get: (url: string) => Promise<Uint8Array> = (url) => download(url),
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
