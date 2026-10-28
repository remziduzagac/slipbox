// File admission and linked-file discovery. Graph alone owns reached/index mutations.
import { statSync } from "node:fs";
import { isAbsolute, join, posix, relative } from "node:path";
import { climbsOut } from "../../../foundation/platform/fsutil.ts";
import { blockingLink } from "../../vaults/symlinks.ts";
import { isListed, isVaultRoot, type VaultLocation } from "../../vaults/vault.ts";
import { onDisk } from "../../links/links.ts";
import type { NoteFile, WalkFilter } from "../../walk/walk.ts";
import type { NoteEntry } from "../graph-types.ts";

interface AdmissionContext {
  readonly root: string;
  readonly loc: VaultLocation;
  readonly filter: Pick<WalkFilter, "reachable" | "exclusion" | "isNoteName" | "busy" | "maxFileSize">;
}
interface LinkedContext extends Pick<AdmissionContext, "root" | "loc"> {
  known(rel: string): boolean;
  reachFile(rel: string): boolean;
}

export function neverIndexed(context: AdmissionContext, rel: string, isDir = false, notes?: boolean): string | null {
  if (isListed(context.loc)) return null;
  // By the names on disk, where the filesystem folds case: `Build/` typed is the `build/` the walk lists.
  const parts = onDisk(context.root, rel).split("/");
  const last = isDir ? parts.length : parts.length - 1;
  const holds = notes ?? (!isDir && context.filter.isNoteName(parts.at(-1)!));
  for (let i = 1; i <= last; i++) {
    const dir = parts.slice(0, i).join("/");
    const why = context.filter.exclusion(dir, true);
    // A root of its own, named as a busy folder too (`build/` holding a `.slipbox/`): its walk starts there.
    if (why === "nested vault" || (why === "busy folder" && isVaultRoot(join(context.root, dir)))) return null;
    if (why === "busy folder") {
      // Busy with a note in it too: ignored. Without, only for want of one, which this write gives it.
      const ignored = context.filter.busy(dir, true);
      if (i === last && holds && !ignored) continue;
      return `${dir}/ is a busy folder (${ignored ? "git ignores it" : "no note at its top"}), which the vault doesn't index`;
    }
    if (why === "always skipped") return `${dir}/ is a folder the vault never indexes`;
  }
  return null;
}

export function reachable(context: AdmissionContext, rel: string): NoteFile | null {
  if (isListed(context.loc) || !context.filter.reachable(rel)) return null;
  const abs = join(context.root, rel);
  // Through a link only when you follow it and its target answered (VV-D6): what a link not followed leads to is
  // never the vault's, and a disk that hasn't answered isn't read here.
  if (blockingLink(context.loc, abs, { answering: true })) return null;
  try {
    const st = statSync(abs);
    if (!st.isFile() || st.size > context.filter.maxFileSize) return null;
    return { rel, abs, size: st.size, mtimeMs: st.mtimeMs };
  } catch {
    return null;
  }
}

export function reachLinked(context: LinkedContext, e: NoteEntry, reachable: (rel: string) => NoteFile | null): void {
  if (isListed(context.loc)) return;
  for (const l of e.links) {
    if (l.kind !== "markdown" && l.kind !== "image") continue;
    const path = l.target.split("#")[0]!;
    if (!path || /^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith("~/")) continue;
    let decoded = path;
    try {
      decoded = decodeURIComponent(path);
    } catch {}
    // `/…` is the root's, then the filesystem's (21.2); in a plain folder, which has none, the
    // filesystem's alone.
    let rel = !decoded.startsWith("/")
      ? posix.normalize(posix.join(posix.dirname(e.rel), decoded))
      : context.loc.mode === "folder"
        ? relative(context.root, decoded)
        : posix.normalize(decoded.slice(1));
    if (
      decoded.startsWith("/") &&
      context.loc.mode !== "folder" &&
      !(rel && !climbsOut(rel) && (context.known(rel) || reachable(rel)))
    )
      rel = relative(context.root, decoded);
    if (rel === "" || rel === "." || climbsOut(rel) || isAbsolute(rel) || context.known(rel)) continue;
    context.reachFile(rel);
  }
}
