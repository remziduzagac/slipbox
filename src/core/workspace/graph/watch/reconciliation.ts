// Pending file changes and move reconciliation over the original watcher state. Each is a look (reads.ts): what it
// reads is asked as a batch — on the disk threads, or here at once — and judged where it's read (judging.ts); what it
// means is decided here, against what the watcher knows when the answer comes (SD-D5, SD-D8).
import { basename, join } from "node:path";
import { under } from "../../vaults/home/paths.ts";
import { type PathStat, parentOf } from "../../walk/io/stamps.ts";
import type { Settling, ReconciliationOptions, ReconciliationState, ReconciliationDirectories } from "./contracts.ts";
import type { PathVerdict } from "./judging.ts";
import { type Look, runHere, SLICE } from "./reads.ts";
import type { Went } from "./state.ts";
import { noteStamp } from "./io.ts";

export class WatchReconciliation {
  constructor(
    private readonly opts: ReconciliationOptions,
    private readonly state: ReconciliationState,
    private readonly directories: ReconciliationDirectories,
  ) {}

  /** Whether our own write of `rel` was told since a look asked at `asked` (`writes`): its answer is older. */
  private writtenSince(rel: string, asked: number): boolean {
    return (this.state.writtenAt.get(rel) ?? -1) >= asked;
  }

  /**
   * Where known notes that went (`went`) are now, in folders left to the walk (`into`): each folder listed, and its
   * notes' candidates statted, where it's read (judging.ts's `movedInto`), the folders found in this batch (`fresh`)
   * said so; in the order asked.
   */
  *movedTo(
    into: readonly string[],
    fresh: ReadonlySet<string>,
    went: readonly Went[],
    gone: readonly { dir: string; files: string[] }[],
  ): Look<string[]> {
    const { root } = this.opts;
    const dirs = [...new Set(into)];
    const pollMs = this.opts.pollMs ?? 2000;
    const list = dirs.map((d) => {
      const attachments: string[] = [];
      for (const [dir, inDir] of this.state.attachments) if (under(dir, d)) attachments.push(...inDir);
      const moved = { fresh: fresh.has(d), went: [...went], gone: gone.map((g) => ({ ...g })), attachments, pollMs };
      return { dir: join(root, d), judge: this.directories.judged({ moved }) };
    });
    const { listings } = yield { list };
    const there = new Set<string>();
    for (const l of listings) if (l.how === "moved") for (const rel of l.there) there.add(rel);
    return [...there];
  }

  /**
   * Each path of `list` — which grows, as folders are taken in and gone ones say what they held — settled by stat: the
   * paths not settled yet asked a slice at a time (`SLICE`), each slice judged where it's read and settled as it
   * answers, up to a `.gitignore` among them (which changes how the rest are judged); one our own write was told for
   * since it was asked, left pending for the next batch. The list is gone through once (`next`: where the next slice
   * starts), however long.
   */
  *settle(batch: Settling, list: string[]): Look {
    const { filter, known, root } = this.opts;
    const read = new Map<string, { st: PathStat; v: PathVerdict; asked: number }>();
    let next = 0;
    for (let i = 0; i < list.length; i++) {
      const rel = list[i]!;
      if (batch.seen.has(rel)) continue;
      const name = rel.slice(rel.lastIndexOf("/") + 1);
      if (name !== ".gitignore" && !read.has(rel)) {
        const asking = new Set([rel]);
        for (next = Math.max(next, i + 1); next < list.length && asking.size < SLICE; next++) {
          const r = list[next]!;
          if (basename(r) === ".gitignore") break;
          if (!batch.seen.has(r) && !read.has(r)) asking.add(r);
        }
        const asked = this.state.writes;
        const slice = [...asking];
        const paths = slice.map((r) => join(root, r));
        const { stats, judged = [] } = yield { stat: { paths, judge: this.directories.judgeBy() } };
        slice.forEach((r, k) => read.set(r, { st: stats[k]!, v: judged[k] ?? {}, asked }));
      }
      batch.seen.add(rel);
      if (name === ".gitignore") {
        filter.invalidate(rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "");
        batch.rescan = true;
        continue;
      }
      const { st: stat, v, asked } = read.get(rel)!;
      if (this.writtenSince(rel, asked)) {
        this.state.pending.add(rel); // read before our own write: settled with the next batch
        continue;
      }
      let st = "error" in stat ? null : stat;
      // A symlink as the walk takes it (0.11, VV-D6): a folder within the root never followed, nothing outside
      // adopted unless you follow it.
      if (st && v.link && !this.directories.symlinkKept(rel, v.link)) {
        if (!known.has(rel)) continue;
        st = null; // a note that became such a link: gone
      }
      if (st?.kind === "dir") {
        if (v.dir === null && !this.state.watchers.has(rel) && !this.state.polled.has(rel)) {
          if (this.directories.found(rel) === "adopt") list.push(...(yield* this.directories.adopting(rel)));
          else {
            batch.found.push(rel);
            batch.candidates.push(rel);
          }
        }
        continue;
      }
      if (!st && !known.has(rel)) {
        // Possibly a directory that went away (deleted, or moved out of the vault) — its own
        // watcher may already have errored and gone — so every known note under it went too, and the other files
        // known in it (an embed's picture).
        const prefix = `${rel}/`;
        let any = false;
        for (const k of known.keys()) {
          if (k.startsWith(prefix)) {
            list.push(k);
            any = true;
          }
        }
        const files: string[] = [];
        for (const [dir, inDir] of this.state.attachments) if (under(dir, rel)) files.push(...inDir);
        for (const f of files) list.push(f);
        const wasLeft = this.state.left.has(rel);
        // A folder gone: what was left in it, forgotten (a file gone has nothing to forget).
        if (wasLeft || any || files.length || this.state.watchers.has(rel)) this.directories.forget(rel);
        if (any && batch.following) this.state.recentlyGone.push({ dir: rel, files, tick: this.state.ticks });
        if (any || files.length || this.state.watchers.has(rel)) {
          this.directories.unwatchTree(rel);
          continue;
        }
        if (wasLeft) continue; // a folder left to the walk: never a file, nothing to say
      }
      if (v.file !== null) continue;
      if (!filter.isNoteName(name)) {
        // Editors' temporary files (vim's 4913, backups~, swap files) are never attachments.
        if (/^\d+$|~$|\.sw[a-p]$|^\.#|^#.*#$/.test(name)) continue;
        // An attachment: the graph keeps a name index of them for ![[embeds]].
        batch.changes.push({ rel, kind: st ? "created" : "deleted", isNote: false });
        this.directories.attachment(rel, !!st);
        continue;
      }
      const own = this.state.ownWrites.get(rel);
      if (st && own !== undefined && own === st.mtimeMs) {
        this.state.ownWrites.delete(rel); // our own write, seen once
        continue;
      }
      const before = known.get(rel);
      if (!st) {
        // Gone — or, never known, come and gone between two looks (written and removed at once): said all the
        // same, since what was drawn meanwhile may have read it from the disk (a link to it, resolved by its file).
        if (before !== undefined) this.went(batch, rel, before);
        known.delete(rel);
        batch.changes.push({ rel, kind: "deleted", isNote: true });
        continue;
      }
      if (before === undefined) batch.changes.push({ rel, kind: "created", isNote: true });
      else if (before !== st.mtimeMs || (this.state.sizes.has(rel) && this.state.sizes.get(rel) !== st.size))
        batch.changes.push({ rel, kind: "changed", isNote: true });
      else continue;
      known.set(rel, st.mtimeMs);
      this.state.sizes.set(rel, st.size);
    }
  }

  /** A known note gone (it was `mtimeMs`): kept as gone lately while moves are followed, to find where it went. */
  went(batch: Settling, rel: string, mtimeMs: number): void {
    if (!batch.following) return;
    const at = this.opts.now?.() ?? Date.now();
    this.state.recentlyWent.push({ rel, mtimeMs, size: this.state.sizes.get(rel), tick: this.state.ticks, at });
  }

  /** `vanishing`, read here at once. */
  vanished(batch: Settling): void {
    runHere(this.vanishing(batch), this.directories.judging());
  }

  /**
   * A batch's last look (`flush`), before moves are followed: a rename reports only the new name, so notes that
   * vanished from the directories heard from, or moved away under the same name, are found here — gone, and kept as
   * gone lately (`went`), so where they went is followed — and a burst of writes in a folder reported as one event is
   * said for the rest of it. Their stats asked a slice at a time, each compared when it answers with what's known then.
   */
  *vanishing(batch: Settling): Look {
    const { known } = this.opts;
    const dirs = new Set(batch.paths.map((p) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "")));
    const createdNames = new Set(
      batch.changes.filter((c) => c.kind === "created").map((c) => c.rel.slice(c.rel.lastIndexOf("/") + 1)),
    );
    const asking = [...known.keys()].filter((rel) => {
      const slash = rel.lastIndexOf("/");
      const dir = slash >= 0 ? rel.slice(0, slash) : "";
      return (dirs.has(dir) || createdNames.has(rel.slice(slash + 1))) && !batch.seen.has(rel);
    });
    for (let i = 0; i < asking.length; i += SLICE) yield* this.vanishedIn(batch, asking.slice(i, i + SLICE), dirs);
  }

  /** One slice of `vanishing`'s notes (`asking`), statted, and compared when it answers with what's known then. */
  private *vanishedIn(batch: Settling, asking: string[], dirs: ReadonlySet<string>): Look {
    const { known, root } = this.opts;
    const asked = this.state.writes;
    const { stats } = yield { stat: { paths: asking.map((rel) => join(root, rel)) } };
    asking.forEach((rel, k) => {
      const was = known.get(rel);
      if (was === undefined) return; // gone from what's known since it was asked
      if (this.writtenSince(rel, asked)) {
        this.state.pending.add(rel);
        return;
      }
      const st = noteStamp(stats[k]);
      if (!st) {
        this.went(batch, rel, was);
        known.delete(rel);
        batch.changes.push({ rel, kind: "deleted", isNote: true });
      } else if (
        dirs.has(parentOf(rel)) &&
        (st.mtimeMs !== was || (this.state.sizes.has(rel) && this.state.sizes.get(rel) !== st.size)) &&
        this.state.ownWrites.get(rel) !== st.mtimeMs
      ) {
        known.set(rel, st.mtimeMs);
        this.state.sizes.set(rel, st.size);
        batch.changes.push({ rel, kind: "changed", isNote: true });
      }
    });
  }
}
