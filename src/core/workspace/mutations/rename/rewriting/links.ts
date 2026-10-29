// Original own-link and backlink retargeting in each existing link form.

import { dirname, isAbsolute, join, posix, relative, sep } from "node:path";
import { classify } from "../../../../documents/model/filetypes.ts";
import type { Backlink, Graph } from "../../../graph/graph.ts";
import { extensionless, normKey, pathForm } from "../../../links/links.ts";
import { isPointer } from "../../../links/pointer.ts";
import { findVaultRoot, isInside } from "../../../vaults/vault.ts";
import type { Collector } from "../collecting/collector.ts";
import { NOTE_EXT, wikiTarget, rootOfPath, pathRetarget, mdTarget } from "../rename-links.ts";

/**
 * A code or data file's own paths, moved from `fromRel` to `toRel` (D63): a comment's (16.10) and a data
 * file's links (16.15) written relative to the file, rewritten to reach what they reached from where it
 * will be, each in its own form, as a note's own relative links are. A comment's path the root's
 * fallback still reaches (`docs/x.md`, read from the root when nothing is there beside the file) and a
 * `/…` from the root are left, but into a root nested here (`crosses`), where `/` is that root's; a URL
 * too. `moving`: a target that moves with it (a vault path, or an absolute one), its own backlink's.
 */
export function ownFileLinks(
  g: Graph,
  c: Collector,
  fromRel: string,
  toRel: string,
  crosses: boolean,
  moving: (path: string) => boolean,
): void {
  const data = classify(fromRel, g.config.walk.extensions).group === "data";
  const toAbs = join(g.root, toRel);
  for (const l of g.fileLinksOf(fromRel)) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(l.target) || l.target.startsWith("#")) continue;
    const r = g.resolveLink(l, fromRel);
    if (
      (r.resolvedKind !== "note" && r.resolvedKind !== "file" && r.resolvedKind !== "folder") ||
      !r.path ||
      moving(r.path)
    )
      continue;
    const targetAbs = isAbsolute(r.path) ? r.path : join(g.root, r.path);
    // As written: a data file's value is its target; a comment's, its text (`util.ts:12:3` its path, the
    // line and column kept), the index's target being its path from the root.
    const written = data ? l.target : l.target.includes("#L") ? l.text.slice(0, l.text.indexOf(":")) : l.text;
    if (!written || (written.startsWith("/") && !crosses)) continue;
    if (!data && !crosses && !written.startsWith("/")) {
      // Read beside the file first, else from the root: left where that still lands on it.
      const beside = posix.normalize(posix.join(posix.dirname(toRel), written));
      const lands = !beside.startsWith("..") && g.known(beside) ? beside : posix.normalize(written);
      if (lands === r.path) continue;
    }
    c.edit(
      { abs: join(g.root, fromRel), kind: l.kind, target: written, line: l.line, column: l.column },
      relativeAs(written, toAbs, targetAbs),
      null,
    );
  }
}

/**
 * A path written relative to its file (`../docs/x.md`, `./user.yaml#/defs`), from `fileAbs`, reaching
 * `targetAbs`: `./` kept, an extension left off where it was, a folder's `/` and the fragment kept;
 * never encoded, since a comment or a data file's value isn't a URL.
 */
function relativeAs(written: string, fileAbs: string, targetAbs: string): string {
  const hash = written.indexOf("#");
  const frag = hash >= 0 ? written.slice(hash) : "";
  const path = hash >= 0 ? written.slice(0, hash) : written;
  let next = relative(dirname(fileAbs), targetAbs).split(sep).join("/") || ".";
  if (path.startsWith("./") && !next.startsWith("../")) next = `./${next}`;
  if (extensionless(path) && NOTE_EXT.test(next)) next = next.replace(NOTE_EXT, "");
  if (path.endsWith("/") && !next.endsWith("/")) next += "/";
  return next + frag;
}

/** A link from another vault to a file of a moving vault, rewritten to where the file will be; null
 *  when it needs nothing (by the vault's name). */
export function retargetInto(b: Backlink, oldAbs: string, newAbs: string): string | null {
  // A pointer names the folder, wherever it is (21.7): nothing to rewrite.
  if (isPointer(b.target)) return null;
  const wiki = b.kind === "wiki" || b.kind === "embed";
  if (pathForm(b.target)) {
    const byPath = pathRetarget(b.target, b.from, b.from, oldAbs, newAbs, wiki);
    if (byPath !== null) return byPath;
    // `/x.md`: the linking vault's root, kept so.
    if (!b.target.startsWith("/")) return null;
  }
  const linkRoot = findVaultRoot(b.from) ?? dirname(b.from);
  if (wiki) {
    // A vault path into a vault nested in the linking one (17.17): the new vault path.
    const ext = /\.[A-Za-z0-9]+$/.test(b.target) ? "" : NOTE_EXT;
    const p = relative(linkRoot, newAbs).split("\\").join("/");
    return (b.target.startsWith("/") ? "/" : "") + (ext ? p.replace(ext, "") : p);
  }
  if (b.target.startsWith("/")) {
    const hash = b.target.indexOf("#");
    return `/${relative(linkRoot, newAbs).split("\\").join("/")}${hash >= 0 ? b.target.slice(hash) : ""}`;
  }
  return mdTarget(b.target, b.from, newAbs, null);
}

/** The new target text of a link to a moved file, written in `linking` (which will be at `linkingAfter`). */
export function retargetBacklink(
  g: Graph,
  b: Backlink,
  linking: string,
  linkingAfter: string,
  fromRel: string,
  toRel: string,
  aliases: Set<string>,
  oldName: string,
): string {
  const toAbs = join(g.root, toRel);
  const byPath = pathForm(b.target)
    ? pathRetarget(
        b.target,
        linking,
        linkingAfter,
        join(g.root, fromRel),
        toAbs,
        b.kind === "wiki" || b.kind === "embed",
      )
    : null;
  if (byPath) return byPath;
  if (b.kind === "wiki" || b.kind === "embed") {
    const name = posix.basename(b.target).replace(NOTE_EXT, "");
    // Written as an alias: still right after the rename.
    if (!b.target.includes("/") && aliases.has(normKey(name)) && normKey(name) !== normKey(oldName)) return b.target;
    const fromDir = isInside(g.root, linkingAfter) ? posix.dirname(relative(g.root, linkingAfter)) : null;
    // Moved into a root nested here: a name ends at its boundary, a path from the top reaches in (17.17).
    return wikiTarget(b.target, fromDir, toRel, g, fromRel, rootOfPath(linkingAfter) !== rootOfPath(toAbs));
  }
  return mdTarget(b.target, linkingAfter, toAbs, isInside(g.root, linkingAfter) ? g : null);
}
