// Pending file changes and move reconciliation over the original watcher state.
import { type Dirent, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { under, walksInto } from "../../vaults/home/paths.ts";
import { parentOf, SETTLE_MS } from "../../walk/io/stamps.ts";
import type { Settling, ReconciliationOptions, ReconciliationState, ReconciliationDirectories } from "./contracts.ts";
import type { Went } from "./state.ts";
import { isSymlink, changedAt, statOrNull } from "./io.ts";
export class WatchReconciliation {
  constructor(
    private readonly opts: ReconciliationOptions,
    private readonly state: ReconciliationState,
    private readonly directories: ReconciliationDirectories,
  ) {}
  /**
   * Where known notes that went (`went`) are now, in folders left to the walk (`into`): the same file by its time and
   * size (a move keeps them), under the same path below a folder that went (`gone`: renamed or moved there — the other
   * files known in it with them) or at the folder's top under any name (a note moved into it). Those alone: the rest of
   * such a folder is the walk's. A note only into a folder found in this batch (`fresh`), or one changed since a little
   * before it went — never a copy made long ago (`cp -a`), its times kept, though another note went just now — and
   * never one home's walk wouldn't go into, nor through one (`walksInto`): a vault made in it, or a link it doesn't
   * follow, since it was found.
   */
  movedTo(
    into: readonly string[],
    fresh: ReadonlySet<string>,
    went: readonly Went[],
    gone: readonly { dir: string; files: string[] }[],
  ): string[] {
    const { filter, root } = this.opts;
    const walked = new Map<string, boolean>();
    const walks = (dir: string) => walked.get(dir) ?? walked.set(dir, walksInto(root, filter, dir)).get(dir)!;
    const same = (rel: string, w: Went) => {
      const st = statOrNull(join(root, rel));
      return !!st && st.mtimeMs === w.mtimeMs && (w.size === undefined || st.size === w.size);
    };
    // A note seen gone a tick at most after it went, and a coarse clock (a rename changes the folder's ctime, not its
    // mtime).
    const late = Math.min(this.opts.pollMs ?? 2000, 10_000) + SETTLE_MS;
    const byTime = new Map<number, Went[]>();
    for (const w of went) {
      const bucket = byTime.get(w.mtimeMs);
      if (bucket) bucket.push(w);
      else byTime.set(w.mtimeMs, [w]);
    }
    const folders = gone.map((g) => ({ ...g, notes: went.filter((w) => w.rel.startsWith(`${g.dir}/`)) }));
    const there = new Set<string>();
    for (const d of new Set(into)) {
      const changed = fresh.has(d) ? Number.POSITIVE_INFINITY : (changedAt(join(root, d)) ?? Number.NEGATIVE_INFINITY);
      /** A note that went before `d` changed, give or take: one that can be in it (not a copy made long before). */
      const after = (w: Went) => changed >= w.at - late;
      if (!went.some(after) || !walks(d)) continue;
      // A folder that went, here now: its notes, once one of the first few is (another may have gone alone), and the
      // other files known in it.
      for (const g of folders) {
        const notes = g.notes.filter(after);
        const at = (rel: string) => `${d}${rel.slice(g.dir.length)}`;
        if (!notes.slice(0, 20).some((w) => same(at(w.rel), w))) continue;
        for (const w of notes) if (same(at(w.rel), w) && walks(parentOf(at(w.rel)))) there.add(at(w.rel));
        for (const f of g.files) {
          const rel = at(f);
          if (
            !this.state.attachments.get(parentOf(rel))?.has(rel) &&
            existsSync(join(root, rel)) &&
            walks(parentOf(rel))
          )
            there.add(rel); // not found there before (a later batch in the tick looks again)
        }
      }
      let entries: Dirent[] = [];
      try {
        entries = readdirSync(join(root, d), { withFileTypes: true });
      } catch {}
      for (const e of entries) {
        if (!e.isFile()) continue;
        const rel = `${d}/${e.name}`;
        const st = statOrNull(join(root, rel));
        if (st && byTime.get(st.mtimeMs)?.some((w) => after(w) && (w.size === undefined || st.size === w.size)))
          there.add(rel);
      }
    }
    return [...there];
  }

  /** Each path of `list` — which grows, as folders are taken in and gone ones say what they held — settled by stat. */
  settle(batch: Settling, list: string[]): void {
    const { filter, known, root } = this.opts;
    for (let i = 0; i < list.length; i++) {
      const rel = list[i]!;
      if (batch.seen.has(rel)) continue;
      batch.seen.add(rel);
      const name = rel.slice(rel.lastIndexOf("/") + 1);
      if (name === ".gitignore") {
        filter.invalidate(rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "");
        batch.rescan = true;
        continue;
      }
      let st: ReturnType<typeof statSync> | null = null;
      try {
        st = statSync(join(root, rel));
      } catch {}
      // A symlink as the walk takes it (0.11, VV-D6): a folder within the root never followed, nothing outside
      // adopted unless you follow it.
      if (st && isSymlink(join(root, rel)) && !this.directories.symlinkKept(rel)) {
        if (!known.has(rel)) continue;
        st = null; // a note that became such a link: gone
      }
      if (st?.isDirectory()) {
        if (filter.exclusion(rel, true) === null && !this.state.watchers.has(rel) && !this.state.polled.has(rel)) {
          if (this.directories.found(rel) === "adopt") list.push(...this.directories.adoptTree(rel));
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
      if (filter.exclusion(rel, false) !== null) continue;
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

  /**
   * A batch's last look (`flush`), before moves are followed: a rename reports only the new name, so notes that
   * vanished from the directories heard from, or moved away under the same name, are found here — gone, and kept as
   * gone lately (`went`), so where they went is followed — and a burst of writes in a folder reported as one event is
   * said for the rest of it.
   */
  vanished(batch: Settling): void {
    const { known, root } = this.opts;
    const dirs = new Set(batch.paths.map((p) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "")));
    const createdNames = new Set(
      batch.changes.filter((c) => c.kind === "created").map((c) => c.rel.slice(c.rel.lastIndexOf("/") + 1)),
    );
    for (const rel of [...known.keys()]) {
      const slash = rel.lastIndexOf("/");
      const dir = slash >= 0 ? rel.slice(0, slash) : "";
      if (!(dirs.has(dir) || createdNames.has(rel.slice(slash + 1))) || batch.seen.has(rel)) continue;
      const st = statOrNull(join(root, rel));
      if (!st) {
        this.went(batch, rel, known.get(rel)!);
        known.delete(rel);
        batch.changes.push({ rel, kind: "deleted", isNote: true });
      } else if (
        dirs.has(dir) &&
        (st.mtimeMs !== known.get(rel) || (this.state.sizes.has(rel) && this.state.sizes.get(rel) !== st.size)) &&
        this.state.ownWrites.get(rel) !== st.mtimeMs
      ) {
        known.set(rel, st.mtimeMs);
        this.state.sizes.set(rel, st.size);
        batch.changes.push({ rel, kind: "changed", isNote: true });
      }
    }
  }
}
