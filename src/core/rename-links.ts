// One link rewritten (17.15, 7.6): its new target, in the form it was written — a name, a path from the root or
// relative, a pointer, a hosting URL, its extension left off — and its text replaced where the index recorded it.

import { realpathSync } from "node:fs";
import { dirname, posix, relative } from "node:path";
import type { Graph, LinkKind } from "./graph.ts";
import { extensionless, formatPathLink, normKey, pathLink } from "./links.ts";
import { folderIdentity, pointerName } from "./workspace/vaults/folders.ts";
import { formatPointer, isPointer, parsePointer, resolvePointer } from "./pointer.ts";
import { parseHosted, withHostedPath } from "./hosting.ts";
import { checkoutOf } from "./git.ts";
import { findVaultRoot, isInside } from "./workspace/vaults/vault.ts";

/** A link as found in a file: where, how it's written, and where it should point now. */
export interface Site {
  /** The linking file, absolute. */
  abs: string;
  kind: LinkKind;
  /** The target as written (a wikilink's, without `#heading` or `|text`). */
  target: string;
  line: number;
  column: number;
}

export const NOTE_EXT = /\.(md|markdown)$/i;

/**
 * The new target text of a wikilink whose note is now at `toRel` in the vault `g` — keeping the
 * way it was written: a name stays a name (a path when the name is taken, or `apart`: the note now in
 * another root than the link, where a name doesn't reach — 17.17, 21.3), a path a path, a relative
 * path relative, an extension written stays written.
 */
export function wikiTarget(
  written: string,
  fromRelDir: string | null,
  toRel: string,
  g: Graph,
  movedFrom: string,
  apart = false,
): string {
  const t = written;
  // A note's `.md` only where it was written; any other file's extension is in its path, once.
  const isNote = NOTE_EXT.test(toRel);
  const ext = isNote && NOTE_EXT.test(t) ? posix.extname(toRel) : "";
  const stem = (p: string) => (isNote ? p.replace(NOTE_EXT, "") : p);
  if ((t.startsWith("./") || t.startsWith("../")) && fromRelDir !== null) {
    let r = posix.relative(fromRelDir, stem(toRel)) + ext;
    if (!r.startsWith("../")) r = `./${r}`;
    return r;
  }
  if (t.includes("/")) return (t.startsWith("/") ? "/" : "") + stem(toRel) + ext;
  const name = stem(posix.basename(toRel));
  // Another note with that name: the path, so it can't reach the wrong one.
  const taken = [...g.notes.keys()].some(
    (p) => p !== movedFrom && p !== toRel && normKey(posix.basename(p).replace(NOTE_EXT, "")) === normKey(name),
  );
  return (taken || apart ? stem(toRel) : name) + ext;
}

/** The root a file is in (or will be, not there yet), by its real path: the nearest marker's. */
export function rootOfPath(abs: string): string {
  return real(findVaultRoot(abs) ?? "");
}

export function real(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
}

/**
 * A link written as a filesystem path (17.16) — relative, `~/`, absolute, `file://` — in a file at
 * `linkingAbs` (to be at `linkingAfter`), that reaches `fromAbs`: the same form, reaching `toAbs`
 * from where the file will be. Null when it isn't one, or reaches something else.
 */
export function pathRetarget(
  written: string,
  linkingAbs: string,
  linkingAfter: string,
  fromAbs: string,
  toAbs: string,
  wiki: boolean,
): string | null {
  const hash = wiki ? -1 : written.indexOf("#");
  const frag = hash >= 0 ? written.slice(hash) : "";
  const path = hash >= 0 ? written.slice(0, hash) : written;
  const hit = pathLink(path, linkingAbs, wiki, undefined, true);
  if (!hit || real(hit.abs) !== real(fromAbs)) return null;
  // Written without its extension, it stays without it (21.2): a wikilink's, a markdown link's.
  const ext = !extensionless(path) || !NOTE_EXT.test(toAbs);
  let next = formatPathLink(hit.form, toAbs, linkingAfter, ext);
  if (hit.folder && path.endsWith("/")) next += "/";
  if (!wiki && hit.form !== "file-url" && (/%[0-9A-Fa-f]{2}/.test(path) || /\s/.test(next))) next = encodeURI(next);
  return next + frag;
}

/**
 * A markdown link's new URL reaching `toAbs`, in the form it was written (21.2): from the root when it
 * started with `/` and the root holds the target, else relative from the linking file (`./` kept);
 * without its extension when written without one; a folder's trailing `/` kept.
 */
export function mdTarget(written: string, linkingAbs: string, toAbs: string, g: Graph | null): string {
  const hash = written.indexOf("#");
  const frag = hash >= 0 ? written.slice(hash) : "";
  const path = hash >= 0 ? written.slice(0, hash) : written;
  // A link to the repository's hosting stays one: the URL, its path to where the file is now.
  const hosted = /^https?:\/\//i.test(written) ? parseHosted(written) : null;
  if (hosted?.path) {
    const top = checkoutOf(toAbs)?.root;
    if (top && isInside(top, toAbs))
      return withHostedPath(written, hosted.path, relative(top, toAbs).split("\\").join("/"));
  }
  // A pointer (21.7) stays one: its name and branch, the path from its folder's root to the file now —
  // without an extension, a folder's `/`, encoded, each as written. Out of that folder, into another
  // named one: a pointer to that one.
  const p = isPointer(path) ? parsePointer(path) : null;
  if (p) {
    const t = resolvePointer({ ...p, path: "", fragment: null });
    let into =
      t.status === "found" && isInside(t.root, toAbs) ? { name: p.name, branch: p.branch, root: t.root } : null;
    if (!into) {
      const there = findVaultRoot(toAbs);
      const ident = there ? folderIdentity(there) : null;
      if (there && ident)
        into = {
          name: pointerName({ key: ident.key, name: ident.name, remote: ident.remote }),
          branch: null,
          root: there,
        };
    }
    if (into) {
      let rel = relative(into.root, toAbs).split("\\").join("/");
      if (extensionless(p.path) && NOTE_EXT.test(rel)) rel = rel.replace(NOTE_EXT, "");
      if (p.path.endsWith("/") && rel && !rel.endsWith("/")) rel += "/";
      const encode = /%[0-9A-Fa-f]{2}/.test(path) || /\s/.test(rel);
      return (
        formatPointer(
          { name: into.name, branch: into.branch, path: rel, fragment: null },
          encode ? encodeURI : undefined,
        ) + frag
      );
    }
  }
  let next: string;
  if (path.startsWith("/") && g && g.loc.mode !== "folder" && isInside(g.root, toAbs))
    next = `/${relative(g.root, toAbs).split("\\").join("/")}`;
  else {
    next = relative(dirname(linkingAbs), toAbs).split("\\").join("/");
    if (path.startsWith("./") && !next.startsWith("../")) next = `./${next}`;
  }
  if (extensionless(path) && NOTE_EXT.test(next)) next = next.replace(NOTE_EXT, "");
  if (path.endsWith("/") && !next.endsWith("/")) next += "/";
  // Written percent-encoded (`my%20note.md`): encoded again.
  const encoded = /%[0-9A-Fa-f]{2}/.test(path) || /\s/.test(next);
  return (encoded ? encodeURI(next) : next) + frag;
}

/**
 * Replace a link's target in `text` at the site the index recorded: the wikilink or markdown link
 * starting at that line and column (a reference link's definition, wherever it is), or in a data
 * or code file the path on that line. Null when the link isn't there any more.
 */
export function replaceAt(
  text: string,
  site: Site,
  next: string,
  group: string,
): { text: string; line: number } | null {
  const lines = text.split("\n");
  const at = site.line - 1;
  const line = lines[at];
  if (line === undefined) return null;
  const col = Math.max(0, site.column - 1);
  const put = (i: number, from: number, to: number, what: string) => {
    lines[i] = lines[i]!.slice(0, from) + what + lines[i]!.slice(to);
    return { text: lines.join("\n"), line: i + 1 };
  };
  // The index's column counts characters its own way (a wide one, a tab): of the links on the
  // line with this target, the one nearest to it.
  const nearest = <T extends { at: number }>(hits: T[]) =>
    hits.sort((a, b) => Math.abs(a.at - col) - Math.abs(b.at - col))[0];
  if (group === "note" && (site.kind === "wiki" || site.kind === "embed")) {
    const hits: { at: number; from: number; to: number }[] = [];
    for (let open = line.indexOf("[["); open >= 0; open = line.indexOf("[[", open + 2)) {
      const close = line.indexOf("]]", open + 2);
      if (close < 0) break;
      const inner = line.slice(open + 2, close);
      const end = inner.search(/\\?\||#|\^/);
      const head = end < 0 ? inner : inner.slice(0, end);
      const lead = head.length - head.trimStart().length;
      if (head.trim() === site.target)
        hits.push({
          at: open > 0 && line[open - 1] === "!" ? open - 1 : open,
          from: open + 2 + lead,
          to: open + 2 + lead + head.trim().length,
        });
    }
    const hit = nearest(hits);
    return hit ? put(at, hit.from, hit.to, next) : null;
  }
  if (group === "note" && (site.kind === "markdown" || site.kind === "image")) {
    const hits: { at: number; start: number; raw: string }[] = [];
    for (const m of line.matchAll(/\]\(\s*(<[^>\n]*>|[^)\s]*)/g)) {
      const raw = m[1]!;
      const url = raw.startsWith("<") ? raw.slice(1, -1) : raw;
      if (url !== site.target && safeDecode(url) !== site.target) continue;
      // The link starts at its `[` (or `![`): the nearest one before its `](`.
      const open = line.lastIndexOf("[", m.index);
      hits.push({
        at: open > 0 && line[open - 1] === "!" ? open - 1 : open,
        start: m.index + m[0].length - raw.length,
        raw,
      });
    }
    const hit = nearest(hits);
    if (hit)
      return put(at, hit.start, hit.start + hit.raw.length, hit.raw.startsWith("<") ? `<${safeDecode(next)}>` : next);
    // A reference link: its definition, wherever it is.
    for (let i = 0; i < lines.length; i++) {
      const d = /^( {0,3}\[[^\]]+\]:[ \t]*)(<[^>\n]*>|\S+)/.exec(lines[i]!);
      if (!d) continue;
      const raw = d[2]!;
      const url = raw.startsWith("<") ? raw.slice(1, -1) : raw;
      if (url !== site.target && safeDecode(url) !== site.target) continue;
      return put(i, d[1]!.length, d[1]!.length + raw.length, raw.startsWith("<") ? `<${safeDecode(next)}>` : next);
    }
    return null;
  }
  // A data file's value or a code comment's path: the old path, as written on that line.
  const old = site.target.split("#")[0]!.replace(/^\//, "");
  const i = line.indexOf(old, col) >= 0 ? line.indexOf(old, col) : line.indexOf(old);
  if (i < 0 || !old) return null;
  return put(at, i, i + old.length, next.split("#")[0]!.replace(/^\//, ""));
}

export function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
