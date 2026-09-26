// Link resolution (plan 1.4; policy in docs/design/decisions.md).
//
// One policy everywhere, never the filesystem's: case-insensitive after NFC, collisions are a
// candidate list, and disambiguation is exact-case → same directory → deepest shared directory →
// shortest path. Still tied means ambiguous, and the caller shows a picker.

import { existsSync, statSync } from "node:fs";
import { posix } from "node:path";

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

export type UrlKind = "external" | "note" | "file" | "anchor" | "missing";

export interface MdLinkTarget {
  kind: UrlKind;
  /** Vault-relative path for note/file/missing, the URL for external. */
  target: string;
  fragment: string | null;
}

const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/** Classify and resolve a markdown link URL `[t](url)` found in `fromRel`. */
export function resolveMarkdownUrl(url: string, fromRel: string, root: string, index: LinkIndex): MdLinkTarget {
  if (SCHEME.test(url) || url.startsWith("//")) return { kind: "external", target: url, fragment: null };
  const hash = url.indexOf("#");
  const fragment = hash >= 0 ? decodeSafe(url.slice(hash + 1)) : null;
  const pathPart = decodeSafe(hash >= 0 ? url.slice(0, hash) : url);
  if (!pathPart) return { kind: "anchor", target: fromRel, fragment };
  const rel = pathPart.startsWith("/")
    ? posix.normalize(pathPart.slice(1))
    : posix.normalize(posix.join(posix.dirname(fromRel), pathPart));
  if (rel.startsWith("..")) return { kind: "missing", target: rel, fragment };
  if (NOTE_EXT.test(rel)) {
    // The note's own spelling, not the link's: a path that exists, and the key backlinks use.
    const canon = index.canonical(rel);
    if (canon) return { kind: "note", target: canon, fragment };
    return { kind: fileExists(root, rel) ? "file" : "missing", target: rel, fragment };
  }
  return { kind: fileExists(root, rel) ? "file" : "missing", target: rel, fragment };
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
