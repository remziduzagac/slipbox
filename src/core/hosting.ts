// Links to a repository's own hosting (trailscout's review): a README's
// `https://github.com/me/repo/blob/main/docs/plan.md#goals` is the note `docs/plan.md` in this copy of
// `me/repo` — a link and a backlink like any, rewritten in its own form when the note moves. The
// forms: GitHub's `/blob/<ref>/`, `/tree/<ref>/` and `/raw/<ref>/`; GitLab's `/-/blob/<ref>/` and
// `/-/tree/<ref>/` (groups nested); Bitbucket's `/src/<ref>/`, its headings `#markdown-header-<slug>`;
// a repository's own page, or `#readme`, is its README. Which repository: this checkout's remotes, or
// a named folder's (21.6) by its remote. A `<ref>` other than the branch checked out is said.

import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export interface HostedPath {
  /** The repository, as a remote is normalized (`host/owner/repo`, the host lower case). */
  remote: string;
  /** The branch, tag or commit in the URL; null for the repository's own page. */
  ref: string | null;
  /** The path from the repository's top, decoded; "" for its top. */
  path: string;
  fragment: string | null;
  /** `/tree/`: a folder. */
  folder: boolean;
}

const decode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

/** A hosting URL's repository, ref and path; null when it isn't one of the forms above. */
export function parseHosted(url: string): HostedPath | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.toLowerCase();
  const segs = u.pathname.split("/").filter(Boolean);
  let fragment = u.hash ? decode(u.hash.slice(1)) || null : null;
  if (fragment === "readme") fragment = null;
  const strip = (s: string) => s.replace(/\.git$/i, "");
  const at = (repo: string[], kind: string, rest: string[]): HostedPath | null => {
    if (repo.length < 2 || !rest.length) return null;
    // `%2F` outlives the URL's own dot segments: decoded, `..%2F..%2Fx.md` would climb out of the copy.
    const path = decode(rest.slice(1).join("/"));
    if (path.split("/").some((s) => s === ".." || s === ".")) return null;
    return { remote: `${host}/${[...repo.slice(0, -1), strip(repo[repo.length - 1]!)].join("/")}`, ref: decode(rest[0]!), path, fragment, folder: kind === "tree" };
  };
  // GitLab: `<group…>/<repo>/-/blob|tree|raw/<ref>/<path>`.
  const dash = segs.indexOf("-");
  if (dash >= 2 && ["blob", "tree", "raw"].includes(segs[dash + 1] ?? "")) return at(segs.slice(0, dash), segs[dash + 1]!, segs.slice(dash + 2));
  // GitHub (and its kind): `<owner>/<repo>/blob|tree|raw/<ref>/<path>`.
  if (segs.length >= 4 && ["blob", "tree", "raw"].includes(segs[2]!)) return at(segs.slice(0, 2), segs[2]!, segs.slice(3));
  // Bitbucket: `<owner>/<repo>/src/<ref>/<path>`; its headings `#markdown-header-<slug>`.
  if (segs.length >= 4 && segs[2] === "src") {
    const hit = at(segs.slice(0, 2), "src", segs.slice(3));
    if (hit && fragment?.startsWith("markdown-header-")) hit.fragment = fragment.slice("markdown-header-".length) || null;
    if (hit && (!hit.path || u.pathname.endsWith("/"))) hit.folder = true;
    return hit;
  }
  // A repository's own page: its README.
  if (segs.length === 2) return { remote: `${host}/${segs[0]}/${strip(segs[1]!)}`, ref: null, path: "", fragment, folder: false };
  return null;
}

/** The README at a folder's top (any case, `.md`/`.markdown`), the repository's own page; null if none. */
export function readmeAt(top: string): string | null {
  try {
    const f = readdirSync(top).find((n) => /^readme\.(md|markdown)$/i.test(n) && statSync(join(top, n)).isFile());
    return f ?? null;
  } catch {
    return null;
  }
}

/** Whether a path exists (a file or folder) under the repository's top. */
export function inRepo(top: string, path: string): boolean {
  return existsSync(join(top, path));
}
