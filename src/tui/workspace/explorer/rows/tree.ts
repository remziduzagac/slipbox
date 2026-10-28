// Build the vault tree and one-level outside rows; listing lifecycle and cached ownership stay in Explorer.
import { classify } from "../../../../core/documents/model/filetypes.ts";
import { type Dirent, readdirSync } from "node:fs";
import { join } from "node:path";
import { unreadableWords } from "../../../../core/foundation/platform/fsutil.ts";
import { isListed, isVaultRoot } from "../../../../core/workspace/vaults/vault.ts";
import { isLink, linkStateAt, linkTarget } from "../../../../core/workspace/vaults/symlinks.ts";
import type { FolderListing, ListedEntry } from "../../../../core/workspace/walk/listing.ts";
import { ANOTHER_DISK, busyFolderAt, LINK_REASON } from "../../../../core/workspace/walk/walk.ts";
import { type DiskEntry, fromDisk, listsName } from "../explorer-disk.ts";
import type { ExplorerReadContext, ExplorerRowState, TreeRow, LeftOut } from "../contracts.ts";
import { type ExplorerPaths, hiddenOut } from "./paths.ts";
import type { ExplorerFileRows } from "./files.ts";

export class ExplorerTree {
  constructor(
    private readonly app: ExplorerReadContext,
    private readonly state: ExplorerRowState,
    private readonly paths: ExplorerPaths,
    private readonly files: ExplorerFileRows,
  ) {}

  build(top: string): TreeRow[] {
    const T = top;
    const rows: TreeRow[] = [];
    const own = this.paths.ownView(T);
    if (own === null) this.outsideRows(T, 0, rows, this.paths.leftOutAt(T));
    else rows.push(...this.rootTree(own));
    return rows;
  }

  /**
   * The tree's folders that are roots of their own (17.13): vaults and repositories nested in this
   * one; in a loose folder, every folder in it — each a root, or a loose folder to go into.
   */
  private rootRows(): Map<string, NonNullable<TreeRow["root"]>> {
    const out = new Map<string, NonNullable<TreeRow["root"]>>();
    const named = (abs: string) => this.paths.rootName(abs);
    if (!isListed(this.app.loc)) {
      for (const s of this.app.graph.skipped) {
        if (s.reason !== "nested vault") continue;
        const abs = join(this.app.loc.root, s.rel);
        out.set(s.rel, { kind: "vault", abs, name: named(abs) });
      }
      return out;
    }
    let entries: Dirent[] = [];
    try {
      entries = readdirSync(this.app.loc.root, { withFileTypes: true });
    } catch {}
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith(".")) continue;
      const abs = join(this.app.loc.root, e.name);
      if (busyFolderAt(abs, this.app.config.walk)) continue;
      out.set(e.name, isVaultRoot(abs) ? { kind: "vault", abs, name: named(abs) } : { kind: "folder", abs });
    }
    return out;
  }

  /**
   * A folder outside the vault open's own tree — above it, beside it, in another vault, one its walk leaves out —
   * listed a level at a time (never walked): its folders — the vault open marked and highlighted, its tree under it
   * while unfolded; other vaults by their icon and name — then its files, as `files.show` would list them in their
   * vault. `leftOut`: in what the vault open's walk leaves out (VV-D8), why and where — its folders carry it, down to a
   * vault of their own. From its listing (`Listings`, T12): read off the main thread, a row saying so while it's read,
   * or why it couldn't be.
   */
  private outsideRows(dir: string, depth: number, out: TreeRow[], leftOut: LeftOut | null = null): void {
    const listing = this.state.listings.get(dir);
    if (!listing || listing.error !== null) {
      // Why it couldn't be: a code (`EACCES`) in `folderUnreadable`'s words; a thread's own already in words.
      const error = listing?.error;
      const said = error
        ? `can't read: ${error.includes(" ") ? error : unreadableWords(error)}`
        : this.state.listings.pending(dir)
          ? "listing…"
          : null;
      if (said)
        out.push({ kind: "note", path: `${dir}/\0${said}`, name: said, depth, outside: true, placeholder: true });
      return;
    }
    const R = this.app.loc.root;
    const byName = (a: ListedEntry, b: ListedEntry) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    // Hidden names only while `files.hidden` is on, `.git` never; the busy folders are (VV-D8). Neither is indexed.
    const shown = listing.entries.filter((e) => listsName(e.name, this.app.ui.hidden_files));
    for (const e of shown.filter((e) => e.dir).sort(byName)) {
      const abs = join(dir, e.name);
      const why = leftOut ?? hiddenOut(e.name, abs);
      if (abs === R && !isListed(this.app.loc)) {
        out.push({
          kind: "root",
          path: R,
          name: e.name,
          depth,
          root: {
            kind: this.app.loc.mode === "folder" ? "folder" : "vault",
            abs: R,
            name: this.paths.rootName(R),
            here: true,
          },
        });
        if (this.state.expanded.has(R)) for (const r of this.rootTree()) out.push({ ...r, depth: r.depth + depth + 1 });
        continue;
      }
      const vault = !!e.vault;
      if (e.vault)
        out.push({
          kind: "root",
          path: abs,
          name: e.name,
          depth,
          root: { kind: "vault", abs, ...(e.vault.name ? { name: e.vault.name } : {}) },
          outside: true,
          listed: e,
        });
      else
        out.push({
          kind: "dir",
          path: abs,
          name: e.name,
          depth,
          outside: true,
          ...(why ? { leftOut: why.why, leftOutAt: why.at } : {}),
          ...this.linkOf(e, listing, true),
          listed: e,
        });
      if (this.state.expanded.has(abs)) this.outsideRows(abs, depth + 1, out, vault ? null : why);
    }
    // Its files as their vault lists them: auto, every text file but in a notes vault.
    const show = this.app.sidebar.allFiles ? "all" : this.app.config.files.show;
    const mode = show === "auto" ? (listing.notes ? "renderable" : "all") : show;
    for (const e of shown.filter((e) => e.file).sort(byName)) {
      const abs = join(dir, e.name);
      const { group } = classify(abs, this.app.config.walk.extensions);
      if (group === "binary" || (group !== "note" && (mode === "notes" || (mode === "renderable" && group !== "data"))))
        continue;
      // A hidden file where nothing holding it is left out: its own `⊘`, as a hidden folder has.
      const hidden = leftOut ? null : hiddenOut(e.name, abs);
      out.push({
        kind: "note",
        path: abs,
        name: e.name,
        depth,
        outside: true,
        ...(group !== "note" ? { group } : {}),
        ...(hidden ? { leftOut: hidden.why, leftOutAt: hidden.at } : {}),
        ...this.linkOf(e, listing, false),
        listed: e,
      });
    }
  }

  /**
   * A row listed a level at a time that is a link (VV-D6): where it leads, and whether it's followed, by the rule of
   * the place it's in — in Elsewhere every link asks; a vault's or home's, one leading out of it. Unfolded, one not
   * followed asks first (`linkFirst`), wherever it is. As its listing read it: the answers kept are all that's read
   * here.
   */
  private linkOf(e: ListedEntry, listing: FolderListing, dir: boolean): Pick<TreeRow, "link"> {
    if (!e.link) return {};
    const { target, key } = e.link;
    const state = linkStateAt(key, isListed(this.app.loc) ? null : listing.scope, target);
    const asks = state !== "followed" && state !== "within";
    return { link: { target, dir, ...(asks ? { reason: LINK_REASON.out } : {}) } };
  }

  /** The vault's own tree, from `sub` ("" its top): its folders, notes and files, and the vaults in it (17.13) —
   *  one unfolded listed a level at a time under its row — and what the walk didn't give, from the disk (VV-D8). */
  private rootTree(sub = ""): TreeRow[] {
    const rows: TreeRow[] = [];
    const graph = this.app.graph;
    const groups = new Map(this.files.shownFiles().map((f) => [f.path, f.group]));
    // The walk's folders too, so one with nothing listed in it (just made, or holding only files
    // the explorer leaves out) is still there to open and to create in.
    const folders = new Set(graph.dirs.filter((d) => d));
    const roots = this.rootRows();
    // What the walk didn't give, in the folders shown (VV-D8): what it leaves out — a row by its path, listed a level
    // at a time — and what it hasn't reached — the vault's, as if walked (home's folders before its walk).
    const disk = isListed(this.app.loc)
      ? new Map<string, DiskEntry>()
      : fromDisk(
          this.app,
          sub,
          this.state.expanded,
          { dirs: folders, vaults: roots, file: (p) => graph.notes.has(p) || groups.has(p) },
          this.files.listsFiles(),
        );
    const leftOut = new Map<string, DiskEntry>();
    const unwalked = new Set<string>();
    for (const [p, d] of disk)
      if (d.leftOut !== null) leftOut.set(p, d);
      else {
        unwalked.add(p);
        if (d.dir) folders.add(p);
        else if (d.group !== "note") groups.set(p, d.group!);
      }
    // A note of a folder left out, reached by a link (20.8) or made in a hidden one: listed in that folder's rows, by
    // its path; and a hidden folder the walk knows of (a note made there), only by its row there.
    const inLeftOut = (p: string) => {
      for (let i = p.indexOf("/"); i > 0; i = p.indexOf("/", i + 1)) if (leftOut.has(p.slice(0, i))) return true;
      return false;
    };
    for (const f of [...folders]) if (leftOut.has(f) || inLeftOut(f)) folders.delete(f);
    const notes = [...graph.notes.keys(), ...[...unwalked].filter((p) => !folders.has(p) && !groups.has(p))];
    const isDir = (p: string) => folders.has(p) || roots.has(p) || !!leftOut.get(p)?.dir || !!links.get(p)?.dir;
    // The links the walk didn't go through (VV-D6): a second name for a folder of the vault, one not followed, one
    // whose target isn't answering — rows of their own, saying where they lead.
    const links = new Map(
      graph.skipped.flatMap((x) => (x.link ? [[x.rel, { ...x.link, reason: x.reason }] as const] : [])),
    );
    const under = (p: string) => !sub || p.startsWith(`${sub}/`);
    const d0 = sub ? sub.split("/").length : 0;
    const paths = [...notes, ...groups.keys()]
      .filter((p) => !inLeftOut(p))
      .concat([...folders, ...roots.keys(), ...leftOut.keys(), ...links.keys()])
      .filter(under)
      .sort((a, b) => {
        const da = a.split("/");
        const db = b.split("/");
        for (let i = 0; i < Math.min(da.length, db.length); i++) {
          const lastA = i === da.length - 1 && !isDir(a);
          const lastB = i === db.length - 1 && !isDir(b);
          if (da[i] !== db[i]) {
            if (lastA !== lastB) return lastA ? 1 : -1; // directories first
            return da[i]!.localeCompare(db[i]!, undefined, { sensitivity: "base" });
          }
        }
        return da.length - db.length;
      });
    const seen = new Set<string>();
    for (const p of paths) {
      const parts = p.split("/");
      let visible = true;
      // A folder: its own row (its parents first), when they're unfolded.
      const own = folders.has(p) ? parts.length : parts.length - 1;
      for (let i = d0; i < own; i++) {
        const dir = parts.slice(0, i + 1).join("/");
        if (!seen.has(dir) && visible) {
          seen.add(dir);
          const fresh = unwalked.has(dir) ? { unwalked: true } : {};
          // A folder you follow a link into (VV-D6): walked as the vault's, its row saying where it leads.
          const link = isLink(join(this.app.loc.root, dir))
            ? { link: { target: linkTarget(join(this.app.loc.root, dir)), dir: true } }
            : {};
          rows.push({ kind: "dir", path: dir, name: parts[i]!, depth: i - d0, ...fresh, ...link });
        }
        if (!this.state.expanded.has(dir)) {
          visible = false;
          break;
        }
      }
      if (!visible) continue;
      const name = parts[parts.length - 1]!;
      const depth = parts.length - 1 - d0;
      const out = leftOut.get(p);
      if (out) {
        rows.push(this.leftOutRow(out, name, depth));
        // Unfolded in place: listed a level at a time, as a folder outside the vault's own tree. Another disk (VV-D2)
        // carries its reason down, never looked into for a marker: never home's, whatever it holds.
        const abs = join(this.app.loc.root, p);
        if (out.dir && this.state.expanded.has(abs))
          this.outsideRows(
            abs,
            depth + 1,
            rows,
            out.leftOut === ANOTHER_DISK || !isVaultRoot(abs) ? { why: out.leftOut!, at: abs } : null,
          );
      } else if (roots.has(p)) {
        const root = roots.get(p)!;
        rows.push({ kind: "root", path: p, name, depth, root });
        // Unfolded in place (VV-D5): its folder listed a level at a time, its rows another vault's.
        if (this.state.expanded.has(p)) this.outsideRows(root.abs, parts.length - d0, rows);
      } else if (links.has(p)) {
        // A link the walk didn't go through (VV-D6); unfolded — looked at — listed a level at a time, never walked.
        const link = links.get(p)!;
        rows.push({ kind: link.dir ? "dir" : "note", path: p, name, depth, link });
        if (link.dir && this.state.expanded.has(p)) this.outsideRows(join(this.app.loc.root, p), depth + 1, rows);
      } else if (!folders.has(p))
        rows.push({
          kind: "note",
          path: p,
          name,
          depth,
          ...(groups.has(p) ? { group: groups.get(p) } : {}),
          ...(unwalked.has(p) ? { unwalked: true } : {}),
          // A file a link leads to — within the vault, or out and followed (VV-D6): saying where.
          ...(isLink(join(this.app.loc.root, p))
            ? { link: { target: linkTarget(join(this.app.loc.root, p)), dir: false } }
            : {}),
        });
    }
    return rows;
  }

  /** A folder or file the vault's walk leaves out (VV-D8): a row by its path, not this vault's to change; a vault in
   *  it (a busy folder holding `.git`), a vault's row. */
  private leftOutRow(d: DiskEntry, name: string, depth: number): TreeRow {
    const abs = join(this.app.loc.root, d.rel);
    const why = { outside: true, leftOut: d.leftOut!, leftOutAt: abs } as const;
    // Another disk (VV-D2): never looked into for a marker — what it is shows once you unfold it.
    if (d.dir && d.leftOut !== ANOTHER_DISK && isVaultRoot(abs))
      return {
        kind: "root",
        path: abs,
        name,
        depth,
        root: { kind: "vault", abs, name: this.paths.rootName(abs) },
        ...why,
      };
    if (d.dir) return { kind: "dir", path: abs, name, depth, ...why };
    return { kind: "note", path: abs, name, depth, ...(d.group !== "note" ? { group: d.group } : {}), ...why };
  }
}
