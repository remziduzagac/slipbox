// Link resolution (plan 1.4; policy in docs/design/decisions.md).
//
// One policy everywhere, never the filesystem's: case-insensitive after NFC, collisions are a
// candidate list, and disambiguation is exact-case → same directory → deepest shared directory →
// shortest path. Still tied means ambiguous, and the caller shows a picker.

import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, posix, relative, resolve } from "node:path";

export type Resolution =
  | { status: "resolved"; path: string; candidates: string[] }
  | { status: "ambiguous"; path: null; candidates: string[] }
  | { status: "unresolved"; path: null; candidates: [] };

const NOTE_EXT = /\.(md|markdown)$/i;

export function normKey(s: string): string {
  return s.normalize("NFC").toLowerCase();
}

function stripExt(rel: string): string {
  return rel.replace(NOTE_EXT, "");
}

export class LinkIndex {
  /** lower(basename without extension) → vault-relative paths */
  private readonly byName = new Map<string, string[]>();
  /** lower(path without extension) → paths. A list: `Note.md` and `note.md` can coexist on Linux. */
  private readonly byPath = new Map<string, string[]>();

  constructor(paths: Iterable<string>) {
    for (const p of paths) this.add(p);
  }

  add(rel: string): void {
    const key = normKey(posix.basename(stripExt(rel)));
    const list = this.byName.get(key);
    if (list) {
      if (!list.includes(rel)) list.push(rel);
    } else this.byName.set(key, [rel]);
    const pk = normKey(stripExt(rel));
    const paths = this.byPath.get(pk);
    if (paths) {
      if (!paths.includes(rel)) paths.push(rel);
    } else this.byPath.set(pk, [rel]);
  }

  remove(rel: string): void {
    const key = normKey(posix.basename(stripExt(rel)));
    const list = this.byName.get(key);
    if (list) {
      const next = list.filter((p) => p !== rel);
      if (next.length) this.byName.set(key, next);
      else this.byName.delete(key);
    }
    const pk = normKey(stripExt(rel));
    const paths = this.byPath.get(pk)?.filter((p) => p !== rel);
    if (paths?.length) this.byPath.set(pk, paths);
    else this.byPath.delete(pk);
  }

  has(rel: string): boolean {
    return this.byPath.has(normKey(stripExt(rel)));
  }

  /** The note's own path for a path matched case-insensitively (`Note.md` → `note.md`), or null. */
  canonical(rel: string): string | null {
    return this.atPath(rel)[0] ?? null;
  }

  /** The note at a path (case-insensitive), preferring an exact match. */
  private atPath(rel: string): string[] {
    const list = this.byPath.get(normKey(stripExt(rel))) ?? [];
    const exact = list.filter((p) => p === rel || stripExt(p) === rel);
    return exact.length ? exact : list;
  }

  names(): string[] {
    return [...this.byName.keys()];
  }

  /** Resolve a wikilink target (already split from `#heading` and `|alias`). */
  resolveWiki(target: string, fromRel: string | null): Resolution {
    let t = target.trim().replace(/\\/g, "/").replace(/^\.\//, "");
    if (!t) return fromRel ? { status: "resolved", path: fromRel, candidates: [fromRel] } : unresolved();
    // Relative forms resolve against the linking note.
    if ((t.startsWith("../") || target.trim().startsWith("./")) && fromRel) {
      const joined = posix.normalize(posix.join(posix.dirname(fromRel), t));
      return pick(withExt(this.atPath(joined), t), stripExt(joined), fromRel);
    }
    t = t.replace(/^\/+/, "");
    const stem = stripExt(t);
    let candidates: string[];
    if (stem.includes("/")) {
      // Path suffix aligned on segments.
      const suffix = normKey(stem);
      const exact = this.byPath.get(suffix);
      candidates = exact ? [...exact] : [...this.byPath.entries()].filter(([k]) => k.endsWith(`/${suffix}`)).flatMap(([, v]) => v);
    } else {
      candidates = [...(this.byName.get(normKey(stem)) ?? [])];
    }
    return pick(withExt(candidates, t), stem, fromRel);
  }
}

/** An explicit extension (`[[x.markdown]]`) narrows the candidates to files with it. */
function withExt(candidates: string[], target: string): string[] {
  const m = NOTE_EXT.exec(target);
  if (!m) return candidates;
  const narrowed = candidates.filter((c) => c.toLowerCase().endsWith(m[0].toLowerCase()));
  return narrowed.length ? narrowed : candidates;
}

function resolved(path: string, candidates: string[] = [path]): Resolution {
  return { status: "resolved", path, candidates };
}

function unresolved(): Resolution {
  return { status: "unresolved", path: null, candidates: [] };
}

/** Pick among notes a name reaches, by the disambiguation rules (an alias's notes too: 17.7). */
export function pickCandidate(candidates: string[], stem: string, fromRel: string | null): Resolution {
  return pick(candidates, stem, fromRel);
}

function pick(candidates: string[], stem: string, fromRel: string | null): Resolution {
  if (candidates.length === 0) return unresolved();
  if (candidates.length === 1) return resolved(candidates[0]!);
  const sorted = [...candidates].sort();
  let pool = sorted;

  const exactCase = pool.filter((c) => stripExt(c).normalize("NFC").endsWith(stem.normalize("NFC")));
  if (exactCase.length === 1) return resolved(exactCase[0]!, sorted);
  if (exactCase.length > 1) pool = exactCase;

  if (fromRel !== null) {
    const fromDir = posix.dirname(fromRel);
    const sameDir = pool.filter((c) => posix.dirname(c) === fromDir);
    if (sameDir.length === 1) return resolved(sameDir[0]!, sorted);

    const shared = (c: string) => sharedDepth(posix.dirname(c), fromDir);
    const best = Math.max(...pool.map(shared));
    const deepest = pool.filter((c) => shared(c) === best);
    if (deepest.length === 1) return resolved(deepest[0]!, sorted);
    pool = deepest;
  }

  const depth = (c: string) => c.split("/").length;
  const min = Math.min(...pool.map(depth));
  const shortest = pool.filter((c) => depth(c) === min);
  if (shortest.length === 1) return resolved(shortest[0]!, sorted);
  return { status: "ambiguous", path: null, candidates: sorted };
}

function sharedDepth(a: string, b: string): number {
  if (a === ".") a = "";
  if (b === ".") b = "";
  const pa = a ? a.split("/") : [];
  const pb = b ? b.split("/") : [];
  let n = 0;
  while (n < pa.length && n < pb.length && pa[n] === pb[n]) n++;
  return n;
}

export type UrlKind = "external" | "note" | "file" | "folder" | "anchor" | "missing";

export interface MdLinkTarget {
  kind: UrlKind;
  /** Vault-relative path for note/file/folder/missing (`.` the root itself), the URL for external. */
  target: string;
  fragment: string | null;
}

const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/**
 * Classify and resolve a markdown link URL `[t](url)` found in `fromRel` (21.2): relative to the
 * file; a leading `/` from the root (`hasRoot`: the nearest root, the graph's — with none, the
 * filesystem's path alone, which the graph asks); then `landIn`'s order: a file as written, a note
 * without its extension, a folder.
 */
export function resolveMarkdownUrl(url: string, fromRel: string, root: string, index: LinkIndex, hasRoot = true): MdLinkTarget {
  if (SCHEME.test(url) || url.startsWith("//")) return { kind: "external", target: url, fragment: null };
  const hash = url.indexOf("#");
  const fragment = hash >= 0 ? decodeSafe(url.slice(hash + 1)) : null;
  const pathPart = decodeSafe(hash >= 0 ? url.slice(0, hash) : url);
  if (!pathPart) return { kind: "anchor", target: fromRel, fragment };
  if (pathPart.startsWith("/") && !hasRoot) return { kind: "missing", target: pathPart, fragment };
  const rel = pathPart.startsWith("/") ? posix.normalize(pathPart.slice(1) || ".") : posix.normalize(posix.join(posix.dirname(fromRel), pathPart));
  if (rel === ".." || rel.startsWith("../")) return { kind: "missing", target: rel, fragment };
  // Not in the root, a `/…` is the filesystem's path (21.2): the graph asks that of what's missing.
  return { ...landIn(rel, root, index), fragment };
}

/**
 * Where a path inside the root lands (21.2), in order: a folder when written with a trailing `/`;
 * a note by its own spelling (case aside, 1.4); a file as written; a note without its extension —
 * `plan` is `plan.md` when no file is called `plan` (zk's, mkdnflow's links); a folder.
 */
function landIn(rel: string, root: string, index: LinkIndex): Omit<MdLinkTarget, "fragment"> {
  const bare = rel.replace(/\/+$/, "") || ".";
  if (rel.endsWith("/") || bare === ".") return { kind: dirExists(root, bare) ? "folder" : "missing", target: bare };
  if (NOTE_EXT.test(rel)) {
    // The note's own spelling, not the link's: a path that exists, and the key backlinks use.
    const canon = index.canonical(rel);
    if (canon) return { kind: "note", target: canon };
    return { kind: fileExists(root, rel) ? "file" : "missing", target: rel };
  }
  if (fileExists(root, rel)) return { kind: "file", target: rel };
  const note = index.canonical(rel);
  if (note) return { kind: "note", target: note };
  return { kind: dirExists(root, rel) ? "folder" : "missing", target: rel };
}

/**
 * How a link can name a file by its filesystem path rather than through the vault (17.16), as other
 * editors and agents write them: a relative path (`../other/x.md`), one from the home folder
 * (`~/notes/x.md`), an absolute one (`/home/me/notes/x.md`), a `file://` URL.
 */
export type PathForm = "relative" | "home" | "absolute" | "file-url";

/** A path written without an extension (`plan`, `../notes/plan`): read as the note too (21.2). */
export function extensionless(path: string): boolean {
  return !/\.[A-Za-z0-9]+$/.test(posix.basename(path.replace(/\/+$/, "")));
}

export function homeDir(): string {
  return process.env.HOME || homedir();
}

/** The form of a target written as a filesystem path, or null (a name, a vault path, a URL). */
export function pathForm(target: string): PathForm | null {
  if (/^file:\/\//i.test(target)) return "file-url";
  if (target.startsWith("~/")) return "home";
  if (target.startsWith("/")) return "absolute";
  if (target.startsWith("../") || target.startsWith("./")) return "relative";
  return null;
}

/**
 * The file a path link names (17.16): `target` (without its `#fragment`) from the linking file.
 * A markdown link's path is percent-decoded; a wikilink's without an extension names a note
 * (`.md`, `.markdown`). Null when it isn't a path form, or names no file.
 */
/**
 * The file a path link names, there or not (20.17: where a moved vault's files were): its form and
 * absolute path, read as `pathLink` reads it but without asking the disk.
 */
export function pathNamed(target: string, linkingAbs: string): { form: PathForm; abs: string } | null {
  const form = pathForm(target);
  if (!form) return null;
  if (form === "file-url") {
    try {
      return { form, abs: decodeURIComponent(new URL(target).pathname) };
    } catch {
      return null;
    }
  }
  const raw = decodeSafe(target);
  return { form, abs: form === "home" ? join(homeDir(), raw.slice(2)) : form === "absolute" ? raw : resolve(dirname(linkingAbs), raw) };
}

export function pathLink(target: string, linkingAbs: string, wiki: boolean, rebase?: { from: string; to: string }, dirs = false): { form: PathForm; abs: string; folder?: boolean } | null {
  const form = pathForm(target);
  if (!form) return null;
  let p: string;
  if (form === "file-url") {
    try {
      p = decodeURIComponent(new URL(target).pathname);
    } catch {
      return null;
    }
  } else {
    const raw = wiki ? target : decodeSafe(target);
    p = form === "home" ? join(homeDir(), raw.slice(2)) : form === "absolute" ? raw : resolve(dirname(linkingAbs), raw);
    // A relative path out of `from` (a worktree's checkout), taken as from `to` (the main one's).
    if (form === "relative" && rebase) {
      const out = relative(rebase.from, p);
      if (out.startsWith("..") || isAbsolute(out)) p = resolve(rebase.to, out);
    }
  }
  // A wikilink without an extension names a note; a markdown link's path is the file as written,
  // else the note without its extension (21.2) — and, asked (`dirs`), a folder.
  const bare = !/\.[A-Za-z0-9]+$/.test(p);
  const candidates = wiki && bare ? [`${p}.md`, `${p}.markdown`] : bare && !p.endsWith("/") ? [p, `${p}.md`, `${p}.markdown`] : [p];
  const hit = candidates.find((c) => {
    try {
      return statSync(c).isFile();
    } catch {
      return false;
    }
  });
  if (hit) return { form, abs: hit };
  if (dirs && !wiki && dirExistsAt(p)) return { form, abs: p.replace(/\/+$/, "") || "/", folder: true };
  return null;
}

/**
 * A path link to `toAbs` written the way `form` was (a rename's rewrite): relative from the linking
 * file, `~/` when under the home folder, absolute, or a `file://` URL. `ext`: keep the extension
 * (a wikilink written without one drops it).
 */
export function formatPathLink(form: PathForm, toAbs: string, linkingAbs: string, ext: boolean): string {
  const target = ext ? toAbs : toAbs.replace(NOTE_EXT, "");
  switch (form) {
    case "file-url":
      return `file://${encodeURI(toAbs)}`;
    case "home": {
      const r = relative(homeDir(), target);
      return r.startsWith("..") ? target : `~/${r}`;
    }
    case "absolute":
      return target;
    default: {
      const r = relative(dirname(linkingAbs), target);
      return r.startsWith("../") ? r : `./${r}`;
    }
  }
}

/** Resolve a non-note wikilink target (`![[diagram.png]]`): relative to the note, then the root. */
export function resolveAttachment(target: string, fromRel: string, root: string): string | null {
  const rel1 = posix.normalize(posix.join(posix.dirname(fromRel), target));
  if (!rel1.startsWith("..") && fileExists(root, rel1)) return rel1;
  const rel2 = posix.normalize(target.replace(/^\/+/, ""));
  if (!rel2.startsWith("..") && fileExists(root, rel2)) return rel2;
  return null;
}

export function isNotePath(p: string): boolean {
  return NOTE_EXT.test(p);
}

function dirExistsAt(abs: string): boolean {
  try {
    return statSync(abs).isDirectory();
  } catch {
    return false;
  }
}

function dirExists(root: string, rel: string): boolean {
  return dirExistsAt(posix.join(root, rel));
}

function fileExists(root: string, rel: string): boolean {
  try {
    return statSync(posix.join(root, rel)).isFile();
  } catch {
    return existsSync(posix.join(root, rel));
  }
}

function decodeSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
