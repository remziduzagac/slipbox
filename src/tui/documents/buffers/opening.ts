import { isAbsolute, join, relative } from "node:path";
import type { Config } from "../../../core/application/config/config.ts";
import { classify } from "../../../core/documents/model/filetypes.ts";
import { climbsOut } from "../../../core/foundation/platform/fsutil.ts";
import { slipboxOwn } from "../../../core/foundation/platform/paths.ts";
import type { Graph } from "../../../core/workspace/graph/graph.ts";
import { ELSEWHERE, rootLabel, tildePath } from "../../../core/workspace/vaults/names.ts";
import { vaultAt, type VaultLocation } from "../../../core/workspace/vaults/vault.ts";
import { linkSaid } from "../../../core/workspace/vaults/symlinks.ts";
import {
  answerOpen,
  fileUnwritable,
  linkPlace,
  type OpenAnswer,
  type OpenAsk,
} from "../../../core/workspace/walk/key-jobs.ts";
import { NoteBuffer } from "./buffer.ts";
import type { Following } from "../navigation/following.ts";
import type { Level } from "../../app/notifications/contracts.ts";
import type { View } from "../../app/runtime/contracts.ts";
import type { KeyReads } from "../../app/runtime/key-reads.ts";

export { fileUnwritable };

export interface BufferOpeningContext {
  readonly loc: VaultLocation;
  readonly config: Pick<Config, "walk">;
  readonly graph: Pick<Graph, "known">;
  readonly buffers: Map<string, NoteBuffer>;
  readonly following: Pick<Following, "blocked" | "looking" | "ask" | "gate">;
  readonly scratch: { location(): { path: string } };
  readonly host: { requestRender(): void };
  /** A key's own reads (SD-D4): on a disk thread, or here at once (a test's App). */
  readonly reads: Pick<KeyReads, "offThread" | "ask" | "hold" | "drop">;
  message(level: Level, text: string): void;
  claim(buf: NoteBuffer): boolean;
  allViews(): View[];
}

/** A file you may read but not write (VV-D5), said as its window's read-only reason; null when you may write it. `why`:
 *  why not, as read with it (`fileUnwritable`). */
export function lockedSaid(key: string, abs: string, why = fileUnwritable(abs)): string | null {
  return why ? `${tildePath(key)} is read-only: ${why}` : null;
}

/** Where a path opened is: its whole path, its path from the vault open, whether it's the vault open's, and the key its
 *  buffer is kept by. */
interface Place {
  abs: string;
  rel: string;
  inside: boolean;
  key: string;
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

  /** Where `pathOrRel` is, as `buffer` keeps it. Elsewhere (VV-D3) is one place, wherever its files are: each by its
   *  whole path. */
  private place(pathOrRel: string): Place {
    const abs = pathOrRel.startsWith("/") ? pathOrRel : join(this.context.loc.root, pathOrRel);
    const rel = relative(this.context.loc.root, abs);
    const inside = this.context.loc.mode !== "folder" && !climbsOut(rel);
    return { abs, rel, inside, key: inside ? rel : abs };
  }

  /** Buffer for a vault-relative or absolute path. Keyed by path, not graph membership. Read here, at once: a test's
   *  App, and what's opened but not by a key (the start, the scratch, a rename's file). */
  buffer(pathOrRel: string): NoteBuffer | null {
    const at = this.place(pathOrRel);
    const open = this.context.buffers.get(at.key);
    if (open) return open;
    if (this.refused(at)) return null;
    return this.took(pathOrRel, at, answerOpen(this.asked(at)));
  }

  /** Opening `path` (VV-D6), read here: a link not followed on its way asks first — true when it does; `then`, once
   *  answered. Read on a disk thread, its way is checked there instead, with its read (`prepare`). */
  gate(path: string, then: () => void | Promise<void>): boolean {
    return !this.context.reads.offThread && this.context.following.gate(this.place(path).abs, then);
  }

  /**
   * A key's open of `pathOrRel`, read on a disk thread first (SD-D4): `reading <note>…` said in `shownIn` meanwhile;
   * once read, its buffer kept and `then` run — the open again, finding it. Dropped when what it was for went meanwhile
   * (SD-D5): the vault left, or the window it opens in (`into`) closed. Null when there's nothing to read there: its
   * buffer open already, its way clear, one `buffer` refuses (and says why), or a test's App, which reads here. A buffer
   * open already has its way checked again there first, as `gate` checked it: a link followed may lead elsewhere now.
   */
  prepare(
    pathOrRel: string,
    shownIn: View | null,
    into: View | null,
    then: () => void | Promise<void>,
  ): Promise<void> | null {
    const reads = this.context.reads;
    if (!reads.offThread) return null;
    const at = this.place(pathOrRel);
    // A link not followed on its way: asked, as `gate` asks, and opened once answered.
    const ask = (b: { link: string; target: string | null }) => this.context.following.ask(b.link, b.target, then);
    const open = this.context.buffers.get(at.key);
    if (open) {
      const asked = { ...this.asked(at), wayOnly: true };
      if (this.wayPassed.delete(at.key) || !asked.ways.length) return null;
      // Said only for one read through a link (`throughLink`): another's, shown at once, would flash `reading…`.
      return reads.hold(this.wayAgain(at, asked, open.throughLink ? shownIn : null, ask, then));
    }
    if (this.refused(at, false)) return null;
    const opened = async (): Promise<void> => {
      if (!(await this.readOff(pathOrRel, at, shownIn, into, false, ask))) return reads.drop();
      // Its way checked with its read: the open made again takes it, one request in all.
      await this.passed(at, then);
    };
    return reads.hold(opened());
  }

  /** The buffers whose way a key's open has just checked: the open made again takes them. */
  private readonly wayPassed = new Set<string>();

  /** `then` — the open made again — with `at`'s way just checked, not asked again. */
  private async passed(at: Place, then: () => void | Promise<void>): Promise<void> {
    this.wayPassed.add(at.key);
    try {
      await then();
    } finally {
      this.wayPassed.delete(at.key);
    }
  }

  /** `at`'s buffer, open already, its way checked again on a disk thread (VV-D6, `asked`), said in `shownIn` meanwhile:
   *  kept, the question `ask`ed; clear, `then` — the open again, finding it. */
  private async wayAgain(
    at: Place,
    asked: OpenAsk,
    shownIn: View | null,
    ask: (b: { link: string; target: string | null }) => void,
    then: () => void | Promise<void>,
  ): Promise<void> {
    const reads = this.context.reads;
    const loc = this.context.loc;
    const answer = await reads.ask(at.inside ? at.rel : tildePath(at.abs), shownIn, (t, stop) => t.open(asked, stop));
    if (!answer || this.context.loc !== loc) return reads.drop();
    if (answer.blocked) {
      ask(answer.blocked);
      return reads.drop();
    }
    await this.passed(at, then);
  }

  /** `pathOrRel`'s buffer, read on a disk thread when it isn't open: a key's read (`reading <note>…` in `shownIn`), or,
   *  `background`, one no key waits on (the session's tabs after the one shown). Null when it isn't opened, said why. A
   *  test's App reads here, at once. */
  async load(pathOrRel: string, shownIn: View | null, background = false): Promise<NoteBuffer | null> {
    const at = this.place(pathOrRel);
    const open = this.context.buffers.get(at.key);
    if (open || !this.context.reads.offThread || this.refused(at, false)) return open ?? this.buffer(pathOrRel);
    return this.readOff(pathOrRel, at, shownIn, null, background);
  }

  /** `at` read on a disk thread, and its buffer kept: null when it isn't, said why — or dropped, what it was read for
   *  gone meanwhile (SD-D5): the vault left, or the window it opens in (`into`) closed. */
  private async readOff(
    pathOrRel: string,
    at: Place,
    shownIn: View | null,
    into: View | null,
    background = false,
    blocked?: (b: { link: string; target: string | null }) => void,
  ): Promise<NoteBuffer | null> {
    const loc = this.context.loc;
    const name = at.inside ? at.rel : tildePath(at.abs);
    const ask = this.asked(at);
    const answer = await this.context.reads.ask(
      name,
      shownIn,
      (t, stop, bg) => t.open(ask, stop, bg),
      "not opened",
      background,
    );
    if (!answer || this.context.loc !== loc || (into && !this.context.allViews().includes(into))) return null;
    if (answer.blocked && blocked) {
      blocked(answer.blocked);
      return null;
    }
    return this.context.buffers.get(at.key) ?? this.took(pathOrRel, at, answer);
  }

  /** Whether a file at `at` isn't opened, nothing read of it: binary by its name — said, unless `say` is false
   *  (`buffer` says it, asked again). */
  private refused(at: Place, say = true): boolean {
    const binary = classify(at.abs, this.context.config.walk.extensions).group === "binary";
    if (binary && say) this.context.message("warn", `${at.rel || at.abs} is a binary file; slipbox opens text`);
    return binary;
  }

  /** What opening `at` asks of the disk: its read, its vault when it's outside, its way when it's this place's (VV-D6:
   *  in a vault, its own files'; in home and Elsewhere, any), with the links looked at this once. */
  private asked(at: Place): OpenAsk {
    const loc = this.context.loc;
    return {
      path: at.abs,
      outside: this.outside(at),
      ways: loc.mode === "folder" || at.inside ? [linkPlace(loc)] : [],
      looking: [...this.context.following.looking],
    };
  }

  /** Whether an open asks for `at`'s vault: outside the vault open, and not slipbox's own (the scratch). */
  private outside(at: Place): boolean {
    return !at.inside && at.abs !== this.context.scratch.location().path && !slipboxOwn(at.abs);
  }

  /** The buffer for what was read of `at` (`answer`, read here or on a disk thread), kept; null when it isn't opened,
   *  said why. */
  private took(pathOrRel: string, at: Place, answer: OpenAnswer): NoteBuffer | null {
    // Inside the vault, a note or any file the walk saw has its vault path (the watcher, saves).
    const known = at.inside && this.context.graph.known(at.rel);
    const kind = classify(at.abs, this.context.config.walk.extensions);
    // A path a link not followed leads to (VV-D6): nothing is read through it — the walk leaves it out, the CLI
    // refuses it — until you say so, opening it.
    if (answer.blocked) {
      const { link, target } = answer.blocked;
      this.context.message("warn", `${linkSaid(link, target)} isn't followed — open it to choose`);
      return null;
    }
    if (!answer.read || "error" in answer.read) {
      this.context.message("error", `cannot read ${pathOrRel}`);
      return null;
    }
    const buf = new NoteBuffer(known ? at.rel : null, at.abs, at.key);
    buf.kind = kind;
    if (!at.inside) this.markElsewhere(buf, answer.vault);
    buf.took(answer.read);
    // Named like text, holding binary bytes (a NUL early on, as git decides): not opened.
    if (kind.group !== "note" && buf.source.slice(0, 8192).includes("\u0000")) {
      this.context.message("warn", `${buf.key} holds binary bytes; slipbox opens text`);
      return null;
    }
    if (buf.invalidUtf8) this.context.message("warn", `${buf.key}: not valid UTF-8; invalid bytes shown as �`);
    // A file you may read but not write opens all the same, read-only, and says so (VV-D5); another vault's is
    // read-only here already, for its own reason.
    const locked = buf.elsewhere ? null : lockedSaid(buf.key, at.abs, answer.unwritable);
    if (locked) {
      buf.readOnly = locked;
      this.context.message("info", buf.readOnly);
    }
    // Read through a link you're only looking at (VV-D6): read-only, and never indexed — it isn't the vault's.
    const look = buf.elsewhere ? null : answer.looked;
    if (look) {
      buf.readOnly = `just looking: ${tildePath(look)} isn't followed — read-only`;
      buf.throughLink = true;
    }
    this.context.buffers.set(at.key, buf);
    return buf;
  }

  /**
   * Another vault's file opened here — a tab kept from a peek (VV-D7), back with the session: read-only, editing it
   * being going there, marked with its vault's name, its links read in its vault. The scratch is slipbox's own. `root`:
   * its vault, as read with it — a marker's, or home (VV-D2); none, Elsewhere's (VV-D3).
   */
  private markElsewhere(buf: NoteBuffer, root: string | null): void {
    if (buf.abs === this.context.scratch.location().path || slipboxOwn(buf.abs)) return;
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
