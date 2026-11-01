import { accessSync, constants as fsConstants } from "node:fs";
import { dirname, isAbsolute, join, relative } from "node:path";
import type { Config } from "../../../core/application/config/config.ts";
import { classify } from "../../../core/documents/model/filetypes.ts";
import { climbsOut } from "../../../core/foundation/platform/fsutil.ts";
import { slipboxOwn } from "../../../core/foundation/platform/paths.ts";
import type { Graph } from "../../../core/workspace/graph/graph.ts";
import { ELSEWHERE, rootLabel, tildePath } from "../../../core/workspace/vaults/names.ts";
import { vaultAt, vaultOf, type VaultLocation } from "../../../core/workspace/vaults/vault.ts";
import { linkSaid } from "../../../core/workspace/vaults/symlinks.ts";
import { NoteBuffer } from "./buffer.ts";
import type { Following } from "../navigation/following.ts";
import type { Level } from "../../app/notifications/contracts.ts";

export interface BufferOpeningContext {
  readonly loc: VaultLocation;
  readonly config: Pick<Config, "walk">;
  readonly graph: Pick<Graph, "known">;
  readonly buffers: Map<string, NoteBuffer>;
  readonly following: Pick<Following, "blocked" | "lookedAt">;
  readonly scratch: { location(): { path: string } };
  readonly host: { requestRender(): void };
  message(level: Level, text: string): void;
  claim(buf: NoteBuffer): boolean;
}

/** A file you may read but not write (VV-D5), said as its window's read-only reason; null when you may write it. */
export function lockedSaid(key: string, abs: string): string | null {
  const locked = fileUnwritable(abs);
  return locked ? `${tildePath(key)} is read-only: ${locked}` : null;
}

/** Why a file can't be written, when it can be read (VV-D5): not by you, or not in its folder; null when it can. */
export function fileUnwritable(path: string): string | null {
  try {
    accessSync(path, fsConstants.W_OK);
    // A save writes beside it and renames it over the file: its folder must take that.
    accessSync(dirname(path), fsConstants.W_OK);
    return null;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    return code === "EACCES" || code === "EPERM" || code === "EROFS"
      ? code === "EROFS"
        ? "its disk is read-only"
        : "you may not write it (no permission)"
      : null;
  }
}

export class BufferOpening {
  constructor(
    private readonly context: BufferOpeningContext,
    private readonly callbacks: { vaultGraph(root: string): Graph | null },
  ) {}

  /**
   * Buffers opened before the graph knew their file — a note a branch brings, its tab back before the watcher says so;
   * one in a folder of home not walked yet, one reached — given their vault path now it does: their links and
   * backlinks. Each build calls it (`Watch.followGraph`); a change to one file claims that file's buffer, and one read
   * again is claimed then (`Watch.reloadBuffer`, `Watch.poll`).
   */
  claimKnown(): void {
    for (const b of this.context.buffers.values()) this.context.claim(b);
  }

  /**
   * One buffer given its vault path, when the graph knows its file; true when it was. Not one changed on disk since it
   * was read: the poll reads it again first, then claims it, so it never shows what the file no longer says
   * (`Watch.poll`). One read-only as read through a link not followed (VV-D6) is the vault's only once that link is
   * followed (`claimThroughLink`).
   */
  claim(b: NoteBuffer): boolean {
    if (b.virtual || b.elsewhere) return false;
    if (b.throughLink) return this.claimThroughLink(b);
    if (b.rel !== null || isAbsolute(b.key) || !this.context.graph.known(b.key) || b.changedOnDisk()) return false;
    b.rel = b.key;
    this.claimed(b);
    return true;
  }

  /**
   * A window read-only as read through a link not followed (VV-D6), looked at or forgotten, whose link is followed now
   * (`Following.follow`): writable, unless the file itself isn't, and the vault's once the graph knows it. In a vault,
   * only once it's the vault's note: a write there never lands outside it through a link, so one the graph doesn't take
   * (past `walk.max_file_size`) stays read-only. In home and Elsewhere, a write through a followed link is allowed.
   */
  private claimThroughLink(b: NoteBuffer): boolean {
    // Its link followed, and its target answered: never while it's looked at, nor asked, nor once it gave up.
    if (this.context.following.blocked(b.abs, true)) return false;
    const known = !isAbsolute(b.key) && this.context.graph.known(b.key) && !b.changedOnDisk();
    if (this.context.loc.mode === "vault" && !known) return false;
    b.throughLink = false;
    b.readOnly = lockedSaid(b.key, b.abs);
    if (known) b.rel = b.key;
    this.claimed(b);
    return true;
  }

  /** A buffer claimed in the middle of anything (a render reaching a file): drawn again, its links and backlinks. */
  private claimed(b: NoteBuffer): void {
    b.invalidateLayouts();
    this.context.host.requestRender();
  }

  /** Buffer for a vault-relative or absolute path. Keyed by path, not graph membership. */
  buffer(pathOrRel: string): NoteBuffer | null {
    const abs = pathOrRel.startsWith("/") ? pathOrRel : join(this.context.loc.root, pathOrRel);
    const relRaw = relative(this.context.loc.root, abs);
    // Elsewhere (VV-D3) is one place, wherever its files are: each by its whole path.
    const inside = this.context.loc.mode !== "folder" && !climbsOut(relRaw);
    const key = inside ? relRaw : abs;
    let buf = this.context.buffers.get(key);
    if (!buf) {
      // Inside the vault, a note or any file the walk saw has its vault path (the watcher, saves).
      const known = inside && this.context.graph.known(relRaw);
      const rel = known ? relRaw : null;
      const kind = classify(abs, this.context.config.walk.extensions);
      if (kind.group === "binary") {
        this.context.message("warn", `${relRaw || abs} is a binary file; slipbox opens text`);
        return null;
      }
      // A path a link not followed leads to (VV-D6): nothing is read through it — the walk leaves it out, the CLI
      // refuses it — until you say so, opening it.
      const blocked = this.context.following.blocked(abs);
      if (blocked) {
        this.context.message("warn", `${linkSaid(blocked.link, blocked.target)} isn't followed — open it to choose`);
        return null;
      }
      buf = new NoteBuffer(rel, abs, key);
      buf.kind = kind;
      if (!inside) this.markElsewhere(buf);
      if (!buf.load()) {
        this.context.message("error", `cannot read ${pathOrRel}`);
        return null;
      }
      // Named like text, holding binary bytes (a NUL early on, as git decides): not opened.
      if (kind.group !== "note" && buf.source.slice(0, 8192).includes("\u0000")) {
        this.context.message("warn", `${buf.key} holds binary bytes; slipbox opens text`);
        return null;
      }
      if (buf.invalidUtf8) this.context.message("warn", `${buf.key}: not valid UTF-8; invalid bytes shown as �`);
      // A file you may read but not write opens all the same, read-only, and says so (VV-D5); another vault's is
      // read-only here already, for its own reason.
      const locked = buf.elsewhere ? null : lockedSaid(buf.key, abs);
      if (locked) {
        buf.readOnly = locked;
        this.context.message("info", buf.readOnly);
      }
      // Read through a link you're only looking at (VV-D6): read-only, and never indexed — it isn't the vault's.
      const look = buf.elsewhere ? null : this.context.following.lookedAt(abs);
      if (look) {
        buf.readOnly = `just looking: ${tildePath(look)} isn't followed — read-only`;
        buf.throughLink = true;
      }
      this.context.buffers.set(key, buf);
    }
    return buf;
  }

  /**
   * Another vault's file opened here — a tab kept from a peek (VV-D7), back with the session: read-only, editing it
   * being going there, marked with its vault's name, its links read in its vault. The scratch is slipbox's own.
   */
  private markElsewhere(buf: NoteBuffer): void {
    if (buf.abs === this.context.scratch.location().path || slipboxOwn(buf.abs)) return;
    // Its vault: a marker's, or home (VV-D2); else Elsewhere's (VV-D3), read-only here as another vault's file is.
    const root = vaultOf(buf.abs);
    if (!root) {
      if (this.context.loc.mode === "folder") return;
      buf.elsewhere = { vault: ELSEWHERE, graph: null, rel: null };
      buf.readOnly = `read-only here: ${ELSEWHERE}'s — o goes there, to edit it`;
      return;
    }
    if (root === this.context.loc.root) return;
    const label = rootLabel(vaultAt(root));
    const graph = this.callbacks.vaultGraph(root);
    buf.elsewhere = { vault: label, graph, rel: graph ? relative(root, buf.abs) : null };
    buf.readOnly = `read-only here: ${label}'s — go into ${label} to edit it`;
  }

  displayName(buf: NoteBuffer): string {
    // Another vault's file read here (VV-D7): by that vault's name and its path there; outside every vault, its path.
    const e = buf.elsewhere;
    if (e) return e.rel !== null ? `${e.vault}: ${e.rel}` : buf.abs;
    return buf.abs === this.context.scratch.location().path ? "scratch" : buf.key;
  }
}
