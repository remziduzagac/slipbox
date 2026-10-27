// Links to a repository's own hosting (trailscout's review): a README's
// `https://github.com/me/repo/blob/main/docs/plan.md#goals` is the note `docs/plan.md` in this copy of
// `me/repo` — a link and a backlink like any, rewritten in its own form when the note moves. The
// forms: GitHub's `/blob/<ref>/`, `/tree/<ref>/` and `/raw/<ref>/`; GitLab's `/-/blob/<ref>/` and
// `/-/tree/<ref>/` (groups nested); Bitbucket's `/src/<ref>/`, its headings `#markdown-header-<slug>`;
// a repository's own page, or `#readme`, is its README. Which repository: this checkout's remotes, or
// a named folder's (21.6) by its remote. A `<ref>` other than the branch checked out is said.

import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { lookupFolder, type NamedFolder } from "../vaults/folders.ts";
import { readRegular, SMALL_FILE } from "../../foundation/platform/fsutil.ts";
import { type Checkout, checkoutOf, headOf } from "../../git.ts";
import { branchesOf } from "../../gitops.ts";
import { remotesIn } from "./remotes.ts";

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
    return {
      remote: `${host}/${[...repo.slice(0, -1), strip(repo[repo.length - 1]!)].join("/")}`,
      ref: decode(rest[0]!),
      path,
      fragment,
      folder: kind === "tree",
    };
  };
  // GitLab: `<group…>/<repo>/-/blob|tree|raw/<ref>/<path>`.
  const dash = segs.indexOf("-");
  if (dash >= 2 && ["blob", "tree", "raw"].includes(segs[dash + 1] ?? ""))
    return at(segs.slice(0, dash), segs[dash + 1]!, segs.slice(dash + 2));
  // GitHub (and its kind): `<owner>/<repo>/blob|tree|raw/<ref>/<path>`.
  if (segs.length >= 4 && ["blob", "tree", "raw"].includes(segs[2]!))
    return at(segs.slice(0, 2), segs[2]!, segs.slice(3));
  // Bitbucket: `<owner>/<repo>/src/<ref>/<path>`; its headings `#markdown-header-<slug>`.
  if (segs.length >= 4 && segs[2] === "src") {
    const hit = at(segs.slice(0, 2), "src", segs.slice(3));
    if (hit && fragment?.startsWith("markdown-header-"))
      hit.fragment = fragment.slice("markdown-header-".length) || null;
    if (hit && (!hit.path || u.pathname.endsWith("/"))) hit.folder = true;
    return hit;
  }
  // A repository's own page: its README.
  if (segs.length === 2)
    return { remote: `${host}/${segs[0]}/${strip(segs[1]!)}`, ref: null, path: "", fragment, folder: false };
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

/** A checkout's remotes, as `host/path` in lower case (`remotes.ts`): what a hosting URL to it names. */
export function checkoutRemotes(c: Pick<Checkout, "root" | "common" | "main">): string[] {
  let config = "";
  try {
    config = readRegular(join(c.common, "config"), SMALL_FILE).toString("utf8");
  } catch {}
  return remotesIn(config, c.main ?? c.root).map((r) => r.toLowerCase());
}

/**
 * A branch with a `/` (`feature/x`) told from the path after it by the branches the repository has:
 * the longest that is one; else the ref and path as first split.
 */
export function splitRef(ref: string, path: string, branches: () => string[]): { ref: string; path: string } {
  const have = new Set(branches());
  const segs = path.split("/");
  for (let k = segs.length - 1; k >= 1; k--) {
    const longer = [ref, ...segs.slice(0, k)].join("/");
    if (have.has(longer)) return { ref: longer, path: segs.slice(k).join("/") };
  }
  return { ref, path };
}

export interface HostedHere {
  hosted: HostedPath;
  /** The repository's copy here: its top folder. */
  top: string;
  /** The path from its top: a branch with `/` told apart; the repository's own page, its README. */
  path: string;
  /** A ref other than the branch checked out: both, to be said (`other-ref`). */
  other: { ref: string; branch: string | null } | null;
}

/**
 * Where a hosting URL leads on this machine, read from a file in `root` (D87): the repository's copy —
 * the checkout holding `root` when one of its remotes is the URL's, else a named folder's by its remote
 * (21.6) — and the path in it. Null when it isn't a hosting URL, or names no repository here. `remotes`
 * and `folders`, when given, stand in for reading them again (a caller asking for many links).
 */
export function hostedHere(
  url: string,
  root: string,
  given: { remotes?: string[]; folders?: NamedFolder[] } = {},
): HostedHere | null {
  const h = parseHosted(url);
  if (!h) return null;
  const remote = h.remote.toLowerCase();
  let top: string | null = null;
  // The checkout holding `root` is looked for only when its remotes, given, name the URL's.
  if (!given.remotes || given.remotes.includes(remote)) {
    const own = checkoutOf(root);
    if (own && (given.remotes ?? checkoutRemotes(own)).includes(remote)) top = own.root;
  }
  if (!top) {
    const l = lookupFolder(h.remote, given.folders);
    if (l.status === "found") top = checkoutOf(l.path)?.root ?? l.path;
  }
  if (!top) return null;
  const c = checkoutOf(top);
  let ref = h.ref;
  let path = h.path;
  // A branch with a `/` (`feature/x`), when the path as first split isn't there.
  if (ref && c && path && !existsSync(join(top, path)))
    ({ ref, path } = splitRef(ref, path, () => branchesOf(c) ?? []));
  if (!path && !h.folder) path = readmeAt(top) ?? "";
  const head = c ? headOf(c) : null;
  const branch = head?.branch ?? null;
  const other =
    ref && ref !== "HEAD" && ref !== branch && !(branch === null && head?.commit?.startsWith(ref))
      ? { ref, branch }
      : null;
  return { hosted: h, top, path, other };
}

/** A hosting URL with its path (the part after the ref) for another, encoded as a URL's path is; the rest kept. */
export function withHostedPath(url: string, was: string, now: string): string {
  const enc = (p: string) => p.split("/").map(encodeURIComponent).join("/");
  const u = new URL(url);
  const old = enc(was);
  if (!u.pathname.endsWith(`/${old}`)) return url;
  const extless = !/\.[A-Za-z0-9]+$/.test(was);
  u.pathname =
    u.pathname.slice(0, u.pathname.length - old.length) + enc(extless ? now.replace(/\.(md|markdown)$/i, "") : now);
  return u.toString();
}
