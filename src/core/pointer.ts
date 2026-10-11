// `slipbox://` pointers (plan 21.7; blueprint/design/links.md § Pointers): a link into a named folder
// (21.6), by its name and the path from its root — `slipbox://research/algorithms/dijkstra.md#Proof`.
// The name is the folder's short one (`research`) or a repository's qualified one
// (`slipbox://github.com/me/research/x.md`: the longest leading part this machine knows as a
// remote). `@branch` names the repository at that branch (`slipbox://research@refactor/x.md`): the
// copy with it checked out, else the file as it is on that branch, read-only, from git. A branch with
// a `/` in it (`@agent/sync-retry/docs/x.md`) is told from the path by the branches the repository
// has: the longest one that's there (`%2F` reads as a `/` too).

import { join, relative, sep } from "node:path";
import { climbsOut } from "./fsutil.ts";
import { lookupFolder, type NamedFolder, readFolders } from "./folders.ts";
import { checkoutOf, headOf } from "./git.ts";
import { branchesOf, worktreeList } from "./gitops.ts";
import { tildePath } from "./names.ts";

const SCHEME = /^slipbox:\/\//i;

export function isPointer(url: string): boolean {
  return SCHEME.test(url);
}

export interface Pointer {
  name: string;
  branch: string | null;
  /** The path from the folder's root, decoded; "" for the folder itself. */
  path: string;
  /** After `#`, decoded: a heading, `^block`, `L42`. */
  fragment: string | null;
}

const decode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

/** `research@refactor` (`@` on the name's last part only) → its name and branch. */
function nameAndBranch(s: string): [string, string | null] {
  const slash = s.lastIndexOf("/");
  const at = s.lastIndexOf("@");
  return at > slash + 1 ? [s.slice(0, at), decode(s.slice(at + 1)) || null] : [s, null];
}

/** A pointer's parts; null when it isn't one. */
export function parsePointer(url: string, folders: NamedFolder[] = readFolders()): Pointer | null {
  if (!SCHEME.test(url)) return null;
  let rest = url.replace(SCHEME, "");
  const hash = rest.indexOf("#");
  const fragment = hash >= 0 ? decode(rest.slice(hash + 1)) || null : null;
  if (hash >= 0) rest = rest.slice(0, hash);
  const segs = rest.split("/");
  const at = (i: number): Pointer => {
    const [name, branch] = nameAndBranch(segs.slice(0, i).join("/"));
    return { name, branch, path: decode(segs.slice(i).join("/")), fragment };
  };
  // A qualified name: the longest leading part a known folder's remote is.
  for (let i = segs.length; i >= 2; i--) {
    const [name] = nameAndBranch(segs.slice(0, i).join("/"));
    if (folders.some((f) => f.remote?.toLowerCase() === name.toLowerCase())) return at(i);
  }
  if (!segs[0]) return null;
  // A short name a known folder answers to, dots and all (`me.github.io`): the first part.
  const [first] = nameAndBranch(segs[0]);
  const want = first.toLowerCase();
  if (folders.some((f) => [f.name, ...(f.aliases ?? []), ...(f.old ?? [])].some((o) => o.toLowerCase() === want))) return at(1);
  // One this machine doesn't know: host, owner, repository (`github.com/me/x`), by its look.
  if (segs[0].includes(".") && segs.length > 3) return at(3);
  return at(1);
}

/** A pointer written: the name (with `@branch`), the path from the folder's root, encoded; the fragment. */
export function formatPointer(p: Pointer, encode: (path: string) => string = (x) => x): string {
  const branch = p.branch ? `@${p.branch}` : "";
  return `slipbox://${p.name}${branch}${p.path ? `/${encode(p.path)}` : ""}${p.fragment ? `#${p.fragment}` : ""}`;
}

export type PointerTarget =
  /** Where the folder (at that branch) is on this machine: its root, and the file's absolute path. */
  | { status: "found"; folder: NamedFolder; root: string; abs: string; via?: "old-name" | "another-copy" }
  /** The branch isn't checked out here: the file as it is there, from git — `rel` from the checkout's top, `root`. */
  | { status: "branch"; folder: NamedFolder; root: string; rel: string; branch: string }
  | { status: "ambiguous"; candidates: string[]; reason: string; folders: NamedFolder[] }
  | { status: "unresolved"; reason: string };

/** Where a pointer leads on this machine: the folder's default copy (21.6), at its branch. */
export function resolvePointer(p: Pointer, folders: NamedFolder[] = readFolders()): PointerTarget {
  const l = lookupFolder(p.name, folders);
  if (l.status === "unknown") return { status: "unresolved", reason: l.reason };
  if (l.status === "ambiguous") return { status: "ambiguous", candidates: l.candidates, reason: l.reason, folders: l.folders };
  if (l.status === "unavailable") return { status: "unresolved", reason: `${p.name} is at ${tildePath(l.path)}, which isn't here now (a drive unplugged?)` };
  let root = l.path;
  const via = l.via;
  // The path stays in the folder: as written, and again once a branch has taken its leading parts.
  const outside = (path: string) => climbsOut(relative(root, join(root, path)));
  const climbs = { status: "unresolved", reason: `${p.path}: a pointer's path stays in its folder` } as const;
  if (outside(p.path)) return climbs;
  let path = p.path;
  if (p.branch) {
    const c = checkoutOf(root);
    if (!c) return { status: "unresolved", reason: `${p.name} isn't a repository: it has no branch ${p.branch}` };
    // The folder's place in its repository: a `.slipbox/` folder may be a part of one.
    const within = relative(c.root, root);
    const head = headOf(c).branch;
    const worktrees = worktreeList(c) ?? [];
    const branches = new Set([...(branchesOf(c) ?? []), ...worktrees.map((w) => w.branch).filter((b): b is string => !!b), ...(head ? [head] : [])]);
    // The branch, and where the path starts: the longest branch the repository has.
    let branch = p.branch;
    const segs = p.path.split("/");
    for (let k = segs.length - 1; k >= 1; k--) {
      const longer = [p.branch, ...segs.slice(0, k)].join("/");
      if (branches.has(longer)) {
        branch = longer;
        path = segs.slice(k).join("/");
        break;
      }
    }
    if (!branches.has(branch)) return { status: "unresolved", reason: `${p.name} has no branch ${p.branch}` };
    if (outside(path)) return climbs;
    if (head !== branch) {
      const wt = worktrees.find((w) => w.branch === branch);
      if (!wt) return { status: "branch", folder: l.folder, root: c.root, rel: join(within, path).split(sep).join("/"), branch };
      root = join(wt.path, within);
    }
  }
  return { status: "found", folder: l.folder, root, abs: join(root, path), ...(via ? { via } : {}) };
}
