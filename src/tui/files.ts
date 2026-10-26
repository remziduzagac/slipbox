// File operations (18.x): a note or folder made, renamed, moved, copied, cut and pasted, deleted to the trash and
// restored from it — each one a preview of the links it changes first.

import { classify, extensionOf, isKnownExtension } from "../core/filetypes.ts";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { basename, dirname, join, posix, relative, sep } from "node:path";
import { climbsOut, writeNote } from "../core/foundation/platform/fsutil.ts";
import { notIndexedSaid } from "../core/graph.ts";
import { blockingLink, linkSaid, writesThrough } from "../core/symlinks.ts";
import { insertText, startInsert } from "./editing.ts";
import { normKey } from "../core/links.ts";
import { openVault } from "../core/reach.ts";
import { planFolderMove, planNoteRename, planVaultFolderMove, type RenamePlan } from "../core/rename.ts";
import { copyPath, emptyTrash, linksInto, listTrash, restorePath, type TrashItem, trashPath } from "../core/files.ts";
import { isInside, isListed } from "../core/vault.ts";
import type { NoteBuffer } from "./buffer.ts";
import { match } from "./match.ts";
import type { App, ListItem, PromptOverlay } from "./app.ts";
import { editable } from "./app.ts";
import type { ExplorerItem } from "./explorer.ts";

/** File operations: new, rename, move, copy, delete, the trash. */
export class Files {
  constructor(readonly app: App) {}

  /**
   * Where a new note or folder goes: the explorer's selected folder (or the folder of its selected
   * file) when the explorer has focus, else the current note's folder; the vault's root without
   * one. Vault-relative, "" for the root; null for a row outside the vault's own tree, which isn't this vault's — but
   * one `walk.exclude` leaves out, which is (D246).
   */
  newItemBase(): string | null {
    if (this.app.region === "sidebar" && this.app.leftView === "explorer") {
      const row = this.app.explorer.rows()[this.app.sidebar.selected];
      // Above the vault, beside it, in another (VV-D5), in a busy folder (VV-D8): none of this vault's folders (null,
      // refused). What `walk.exclude` leaves out is, by your own setting: its folder, as a typed path takes it (D246).
      if (row?.outside) return row.kind === "root" ? null : this.excludedBase(this.app.explorer.rowAbs(row), row.kind);
      if (row?.root?.here) return "";
      if (row) return row.kind === "dir" ? row.path : posix.dirname(row.path) === "." ? "" : posix.dirname(row.path);
    }
    const rel = this.app.view?.buf.rel;
    return rel && posix.dirname(rel) !== "." ? posix.dirname(rel) : "";
  }

  /**
   * The folder a `⊘` row at `abs` gives a new note, a new folder or a paste, when `walk.exclude` leaves the row out
   * (`Graph.notIndexed`, D246): a folder's own path, a file's folder; null for any other row outside the vault's tree.
   */
  private excludedBase(abs: string, kind: "dir" | "note"): string | null {
    const rel = relative(this.app.loc.root, abs);
    if (!rel || climbsOut(rel)) return null;
    const p = rel.split(sep).join("/");
    if (!this.app.graph.notIndexed(p, kind === "dir")) return null;
    return kind === "dir" ? p : posix.dirname(p) === "." ? "" : posix.dirname(p);
  }

  /** A new note, folder or paste with another root's row selected: refused, its files aren't this root's. */
  private refuseOtherRoot(): void {
    const row = this.app.explorer.rows()[this.app.sidebar.selected];
    // In a folder this vault's walk leaves out (VV-D8): listed, not indexed, not a place for its notes.
    if (row && isInside(this.app.loc.root, this.app.explorer.rowAbs(row)))
      return this.app.message("warn", "a folder this vault doesn't index: select one it does");
    this.app.message("warn", "another vault's folder: select a folder of this vault");
  }

  /** A path typed for a new note or folder, from `base` (or the root, with a leading `/`); null
   *  (and said) when it leaves the vault or names nothing. */
  private newPath(input: string, base: string): string | null {
    const typed = input.trim();
    if (!typed) return null;
    const rel = posix.normalize(typed.startsWith("/") ? typed.slice(1) : posix.join(base, typed)).replace(/\/+$/, "");
    if (!rel || rel === "." || rel.startsWith("../") || rel === ".." || posix.isAbsolute(rel)) {
      this.app.message("warn", `${typed}: not inside the vault`);
      return null;
    }
    // Where a note's text may be written (VV-D6), and so the command line's `write --create` and `mkdir`: in a vault,
    // never outside it, through a symlinked folder or not; in home, through a link it follows; never through one not
    // followed.
    const abs = join(this.app.loc.root, rel);
    if (!writesThrough(this.app.loc, abs)) {
      const b = this.app.loc.mode === "vault" ? null : blockingLink(this.app.loc, abs);
      this.app.message(
        "warn",
        b
          ? `${typed} is reached through a link that isn't followed (${linkSaid(b.link, b.target)}) — not creating it`
          : `${typed} resolves outside the vault — not creating it`,
      );
      return null;
    }
    return rel;
  }

  /**
   * What a write's message adds when the vault never indexes the file at `abs` — a folder, with `isDir` (D246): ` (not
   * indexed: walk.exclude)`, else nothing. Said by each write's own message — created, saved, autosaved, moved, copied,
   * exported — every time, never as a message of its own.
   */
  notIndexed(abs: string, isDir = false): string {
    return notIndexedSaid(this.leftOut(abs, isDir));
  }

  /** Why the vault never indexes the file at `abs`, written there (`Graph.notIndexed`): `walk.exclude`, or null. */
  leftOut(abs: string, isDir = false): string | null {
    const rel = relative(this.app.loc.root, abs);
    if (!rel || climbsOut(rel)) return null;
    return this.app.graph.notIndexed(rel.split(sep).join("/"), isDir);
  }

  /** A new file's write, as `writeNote` takes it: through the links home follows, Elsewhere's (VV-D6). */
  private through(abs: string): { through: boolean } {
    return { through: this.app.loc.mode !== "vault" && writesThrough(this.app.loc, abs) };
  }

  /** The folders a new path makes, known to the walk and the watcher (and the explorer shows); not
   *  one the walk leaves out (`walk.exclude`) or a root nested in this one, nor anything under it. */
  private addFolders(rel: string): void {
    const parts = rel.split("/");
    let added = false;
    for (let i = 1; i <= parts.length; i++) {
      const dir = parts.slice(0, i).join("/");
      if (!this.app.graph.admits(dir, true)) break;
      if (!this.app.graph.dirs.includes(dir)) {
        this.app.graph.dirs.push(dir);
        added = true;
      }
    }
    if (added)
      this.app.watcher?.sync(
        isListed(this.app.loc) ? [""] : this.app.graph.dirs,
        this.app.watch.knownFromGraph(),
        this.app.watch.sizesFromGraph(),
      );
  }

  /**
   * Create a note (ctrl+n, `:new`): `input` from `base`, `.md` added unless it names a known
   * extension (`.toml`, `.py`…); missing folders made. A note starts with its title as a heading
   * (`# Name`). An existing file is just opened. Its vault path, whether it was made, and the path
   * to open it by, or null. One the walk leaves out (`walk.exclude`) or in a root nested in this one
   * isn't this root's note: it's made, but not indexed here, and opened by its absolute path (into
   * the nested root). One in a busy folder (`build/`…), which nothing indexes, is refused.
   */
  createNote(input: string, base: string | null): { rel: string; created: boolean; open: string } | null {
    if (base === null) return this.refuseOtherRoot(), null;
    let rel = this.newPath(input, base);
    if (!rel) return null;
    const ext = extensionOf(rel);
    if (!ext || !isKnownExtension(ext)) rel = `${rel}.md`;
    const abs = join(this.app.loc.root, rel);
    let ours = this.app.graph.admits(rel);
    if (existsSync(abs)) {
      const open = ours ? rel : abs;
      if (statSync(abs).isDirectory()) {
        this.app.message("warn", `${rel} is a folder`);
        return null;
      }
      this.app.message("info", `${rel} exists — opened`);
      return { rel, created: false, open };
    }
    // In a busy folder (VV-D8), as the explorer's `⊘` row is refused: the vault would never find it.
    const never = this.app.graph.neverIndexed(rel);
    if (never) {
      this.app.message("warn", `not creating ${rel}: ${never}`);
      return null;
    }
    const kind = classify(rel, this.app.config.walk.extensions);
    const name = posix.basename(rel).replace(/\.[^.]+$/, "");
    const content = kind.group === "note" ? `# ${name}\n\n` : "";
    let stamp: { mtimeMs: number; size: number };
    try {
      mkdirSync(dirname(abs), { recursive: true });
      stamp = writeNote(this.app.loc.root, abs, content, this.through(abs));
    } catch (err) {
      this.app.message("error", `can't create ${rel}: ${(err as Error).message}`);
      return null;
    }
    this.app.watcher?.noteOwnWrite(rel, stamp);
    // Asked again once it's there: a note at a busy-named folder's top makes it a folder like any (D237).
    ours = this.app.graph.admits(rel);
    const open = ours ? rel : abs;
    if (ours) {
      const dir = posix.dirname(rel);
      if (dir !== ".") this.addFolders(dir);
      if (kind.group === "note") this.app.graph.updateFile(rel, { rel, abs, size: stamp.size, mtimeMs: stamp.mtimeMs });
      else this.app.graph.addAsset(rel);
      this.app.explorer.invalidateTree();
      this.app.relayoutAll(); // links to it resolve now
    }
    this.app.message("info", `created ${rel}${this.notIndexed(abs)}`);
    return { rel, created: true, open };
  }

  /**
   * Ask for a new note's name and make it: opened, and typed into below its title. `prefill`: the
   * name already typed (a link to a note that doesn't exist yet).
   */
  promptNewNote(base = this.newItemBase(), prefill = "", allowed = ""): void {
    if (base === null) return this.refuseOtherRoot();
    const make = (text: string) => {
      // A name another note already has makes [[name]] ambiguous (17.5): a distinct one is
      // suggested, from the folder; typed again, the name is made anyway (a suggestion, not a rule).
      const clash = text.trim() !== allowed ? this.nameClash(text, base) : null;
      if (clash) {
        this.app.message(
          "info",
          `a note named ${clash.name} is at ${clash.at}: [[${clash.name}]] would reach either — suggested ${clash.suggested} (type ${clash.name} again to keep it)`,
        );
        return this.promptNewNote(base, clash.suggested, text.trim());
      }
      const r = this.createNote(text, base);
      if (!r) return;
      this.app.region = "content";
      const abs = join(this.app.loc.root, r.rel); // before the open, which may switch roots
      this.app.open(r.open);
      const v = this.app.view;
      // Typing on the line after the title's blank one (as `o` there would): a source view has no
      // row past the file's last line break, so the insert begins with one.
      if (r.created && v?.buf.abs === abs) {
        // Typed into at once, in the lens or source mode (`edit_in`): making the note was the editing key's first press.
        if (!editable(v)) this.app.lens.setViewMode(v, this.app.lens.editMode(v));
        startInsert(this.app, v, (w) => w.buf.source.length);
        if (v.insert) insertText(this.app, v, v.buf.eol);
      }
    };
    this.app.overlays.prompt(`new note in ${base ? `${base}/` : "the vault's top folder"}`, make);
    if (prefill && this.app.overlay?.kind === "prompt") this.app.overlay.text = prefill;
  }

  /**
   * A new note's name another note of the vault already has (17.5): where that one is, and a
   * distinct name from the new one's folder (`ideas-plan`, `ideas-plan-2`…).
   */
  nameClash(input: string, base: string): { name: string; at: string; suggested: string } | null {
    const rel = this.newPath(input, base);
    if (!rel) return null;
    const ext = extensionOf(rel);
    const full = !ext || !isKnownExtension(ext) ? `${rel}.md` : rel;
    if (classify(full, this.app.config.walk.extensions).group !== "note" || this.app.graph.notes.has(full)) return null;
    const name = posix.basename(full).replace(/\.(md|markdown)$/i, "");
    const same = (n: string) =>
      [...this.app.graph.notes.keys()].find(
        (p) => normKey(posix.basename(p).replace(/\.(md|markdown)$/i, "")) === normKey(n),
      );
    const at = same(name);
    if (!at) return null;
    const dir = posix.dirname(full);
    const folder = dir === "." ? (this.app.loc.name ?? basename(this.app.loc.root)) : posix.basename(dir);
    const stem = `${folder}-${name}`;
    let suggested = stem;
    for (let i = 2; same(suggested); i++) suggested = `${stem}-${i}`;
    const prefix = input.includes("/") ? input.slice(0, input.lastIndexOf("/") + 1) : "";
    return { name, at, suggested: prefix + suggested };
  }

  // -------------------------------------------------------------------------------------------
  // File operations in the explorer (18.x)

  /** Copied or cut in the explorer, for `p`. */
  clip: ({ mode: "copy" | "cut" } & ExplorerItem) | null = null;
  /** What was deleted last this session: `u` in the explorer puts it back. */
  lastTrashed: string | null = null;

  /** The plan moving an item to `to`: a note's, a folder's, or a nested vault's (18.3, 18.7). */
  private movePlan(item: ExplorerItem, to: string): () => RenamePlan {
    return () =>
      item.vault
        ? planVaultFolderMove(this.app.graph, item.rel, to)
        : item.dir
          ? planFolderMove(this.app.graph, item.rel, to)
          : planNoteRename(this.app.graph, item.rel, to);
  }

  /** Unsaved notes among `rel` and what's in it: a file operation would leave them behind. */
  private unsavedIn(rel: string): NoteBuffer[] {
    return this.app.dirtyBuffers().filter((b) => b.rel !== null && (b.rel === rel || b.rel.startsWith(`${rel}/`)));
  }

  /** Rename in place: a new name, in the same folder; every link fixed after a preview. */
  renameItem(item: ExplorerItem): void {
    const name = posix.basename(item.rel);
    const dir = posix.dirname(item.rel) === "." ? "" : posix.dirname(item.rel);
    this.app.overlays.prompt(`rename ${item.rel}${item.dir ? "/" : ""} to: `, (text) => {
      const typed = text.trim().replace(/\/+$/, "");
      if (!typed || typed === name) return;
      if (typed.includes("/")) return this.app.message("warn", `a name, not a path: m moves ${name} to another folder`);
      this.app.renaming.preview(this.movePlan(item, dir ? `${dir}/${typed}` : typed));
    });
    (this.app.overlay as PromptOverlay).text = item.dir ? name : name.replace(/\.(md|markdown)$/i, "");
  }

  /** Move to another folder, picked from the vault's folders as a tree; links fixed after a preview. */
  moveItem(item: ExplorerItem): void {
    const here = posix.dirname(item.rel) === "." ? "" : posix.dirname(item.rel);
    const name = posix.basename(item.rel);
    this.pickFolder({
      title: `Move ${item.rel}${item.dir ? "/" : ""} to… — type to filter, ← → fold`,
      current: here,
      // A folder can't move into itself.
      exclude: (d) => item.dir && (d === item.rel || d.startsWith(`${item.rel}/`)),
      pick: (d) => this.app.renaming.preview(this.movePlan(item, d ? `${d}/${name}` : name)),
    });
  }

  /**
   * Pick a folder of the vault (18.8): a tree like the explorer's — its folds to begin with — the
   * root first; ← folds, → unfolds; typing filters to the matching folders under their parents.
   */
  pickFolder(opts: {
    title: string;
    current: string;
    exclude: (dir: string) => boolean;
    pick: (dir: string) => void;
  }): void {
    const g = this.app.glyphs;
    const open = new Set(this.app.explorer.expanded);
    for (let d = opts.current; d; d = posix.dirname(d) === "." ? "" : posix.dirname(d)) open.add(d); // where it is, unfolded
    const dirs = [...new Set(this.app.graph.dirs)]
      .filter((d) => d && !opts.exclude(d))
      .sort((a, b) => {
        const pa = a.split("/");
        const pb = b.split("/");
        for (let i = 0; i < Math.min(pa.length, pb.length); i++)
          if (pa[i] !== pb[i]) return pa[i]!.localeCompare(pb[i]!, undefined, { sensitivity: "base" });
        return pa.length - pb.length;
      });
    const row = (d: string, unfolded: boolean, context = false): ListItem => ({
      label: `${"  ".repeat(d.split("/").length)}${unfolded ? g.dirOpen : g.dirClosed} ${posix.basename(d)}`,
      hint: d === opts.current ? "here" : "",
      data: d,
      ...(context ? { context } : {}),
    });
    const source = (input: string): ListItem[] => {
      const out: ListItem[] = [
        { label: `${g.dirOpen} / (the vault's top)`, hint: opts.current === "" ? "here" : "", data: "" },
      ];
      const q = input.trim();
      if (q) {
        // The matches, with their parents for where they are; enter takes the first match.
        const shown = new Set<string>();
        const hits = new Set<string>();
        for (const d of dirs) {
          if (!match(q, d)) continue;
          hits.add(d);
          const parts = d.split("/");
          for (let i = 1; i <= parts.length; i++) shown.add(parts.slice(0, i).join("/"));
        }
        out[0]!.context = true;
        return [...out, ...dirs.filter((d) => shown.has(d)).map((d) => row(d, true, !hits.has(d)))];
      }
      for (const d of dirs) {
        const parts = d.split("/");
        if (parts.slice(0, -1).every((_, i) => open.has(parts.slice(0, i + 1).join("/"))))
          out.push(row(d, open.has(d)));
      }
      return out;
    };
    const first = source("");
    this.app.overlays.openList({
      title: opts.title,
      items: [],
      source,
      selected: Math.max(
        0,
        first.findIndex((it) => it.data === opts.current),
      ),
      accept: (it) => opts.pick(it.data as string),
      fold: (it, unfold) => {
        // As in the explorer, a folder folds whatever it holds; what unfolds under it here is its folders.
        const d = it.data as string;
        if (!d || unfold === open.has(d)) return false;
        if (unfold) open.add(d);
        else open.delete(d);
        return true;
      },
    });
  }

  /** Delete to the vault's trash, after asking — saying how many links it breaks; `then`, once it's gone. */
  deleteItem(item: ExplorerItem, then?: () => void): void {
    const unsaved = this.unsavedIn(item.rel);
    if (unsaved.length)
      return this.app.message(
        "warn",
        `unsaved: ${unsaved.map((b) => this.app.displayName(b)).join(", ")} — save or revert it first`,
      );
    const breaking = linksInto(this.app.graph, item.rel);
    let what = item.dir ? `${item.rel}/ and everything in it` : item.rel;
    if (item.vault) {
      // A whole vault: said so, with how much it holds.
      const g = openVault(join(this.app.loc.root, item.rel));
      what = `the vault ${g.loc.name ?? item.rel} (${item.rel}/, ${g.notes.size} note${g.notes.size === 1 ? "" : "s"})`;
    }
    const warn = breaking ? ` ${breaking} link${breaking === 1 ? "" : "s"} to it will break.` : "";
    this.app.overlays.confirm(`Delete ${what}?${warn} It goes to the trash: u restores it.`, () => {
      let t: ReturnType<typeof trashPath>;
      try {
        t = trashPath(this.app.graph, this.app.loc, item.rel);
      } catch (err) {
        return this.app.message("warn", (err as Error).message);
      }
      this.lastTrashed = t.id;
      // Open notes that went with it show their last text, marked deleted (as when deleted on disk).
      for (const b of this.app.buffers.values())
        if (b.rel !== null && (b.rel === item.rel || b.rel.startsWith(`${item.rel}/`))) b.deleted = true;
      this.afterFileOp();
      this.app.message("info", `deleted ${item.rel} to the trash — u in the explorer (or :trash) restores it`);
      then?.();
    });
  }

  /** Put back what was deleted last; with nothing deleted this session, the trash. */
  restoreLast(): void {
    if (!this.lastTrashed) return this.openTrash();
    this.restoreItem(this.lastTrashed);
  }

  private restoreItem(id: string): void {
    let item: TrashItem;
    try {
      item = restorePath(this.app.graph, this.app.loc, id);
    } catch (err) {
      return this.app.message("warn", (err as Error).message);
    }
    if (this.lastTrashed === id) this.lastTrashed = null;
    for (const b of this.app.buffers.values())
      if (b.deleted && (b.abs === item.abs || b.abs.startsWith(`${item.abs}/`))) this.app.watch.reloadBuffer(b);
    this.afterFileOp();
    this.app.explorer.select(item.shown);
    this.app.message("info", `restored ${item.shown}`);
  }

  /**
   * The vault's trash (`:trash`): enter restores an item; its last row empties it (DF-D14), after asking —
   * the list being what goes. `empty` (`trash.empty`): opened on that row.
   */
  openTrash(empty = false): void {
    const items = listTrash(this.app.loc);
    if (!items.length) return this.app.message("info", "the trash is empty");
    const EMPTY = Symbol("empty");
    this.app.overlays.openList({
      title: `Trash (${items.length}) — enter restores`,
      items: [
        ...items.map(
          (i): ListItem => ({
            label: `${i.shown}${i.dir ? "/" : ""}`,
            hint: i.at.slice(0, 16).replace("T", " "),
            data: i.id,
          }),
        ),
        { label: "", header: true, data: null },
        { label: "Empty the trash…", hint: "for good, after asking", data: EMPTY },
      ],
      selected: empty ? items.length + 1 : 0,
      accept: (it) => (it.data === EMPTY ? this.emptyTrashAsk(items) : this.restoreItem(it.data as string)),
    });
  }

  /** Empty the trash of `items`, what the list showed, after a yes-or-no question: gone for good. */
  private emptyTrashAsk(items: TrashItem[]): void {
    const one = items.length === 1 ? items[0]! : null;
    const what = one
      ? `${one.shown}${one.dir ? "/" : ""} goes for good: it can't be restored`
      : `Its ${items.length} items go for good: none can be restored`;
    this.app.overlays.confirm(`Empty the trash? ${what}.`, () => {
      const gone = emptyTrash(
        this.app.loc,
        items.map((i) => i.id),
      );
      if (gone.some((i) => i.id === this.lastTrashed)) this.lastTrashed = null;
      this.app.message("info", `emptied the trash: ${gone.length} item${gone.length === 1 ? "" : "s"} gone for good`);
    });
  }

  /** Copy or cut the selected item, for `p`. */
  clipItem(mode: "copy" | "cut", item: ExplorerItem): void {
    this.clip = { mode, ...item };
    this.app.message(
      "info",
      `${mode === "copy" ? "copied" : "cut"} ${item.rel}${item.dir ? "/" : ""} — p in the explorer (space d p) pastes it in a folder`,
    );
  }

  /** Paste into the selected folder (or beside the selected file): a copy, or what was cut, moved. */
  pasteItem(): void {
    const clip = this.clip;
    if (!clip) return this.app.message("info", "nothing copied or cut: y copies, x cuts");
    if (!existsSync(join(this.app.loc.root, clip.rel))) {
      this.clip = null;
      return this.app.message("warn", `${clip.rel} isn't there any more`);
    }
    const into = this.newItemBase();
    if (into === null) return this.refuseOtherRoot();
    const from = posix.dirname(clip.rel) === "." ? "" : posix.dirname(clip.rel);
    const name = posix.basename(clip.rel);
    const to = into ? `${into}/${name}` : name;
    if (clip.mode === "cut") {
      if (into === from)
        return this.app.message("info", `${clip.rel} is already in ${into || "the vault's top folder"}`);
      if (clip.dir && (into === clip.rel || into.startsWith(`${clip.rel}/`)))
        return this.app.message("warn", `${clip.rel} can't move into itself`);
      return this.app.renaming.preview(this.movePlan(clip, to));
    }
    let r: ReturnType<typeof copyPath>;
    try {
      // Into its own folder: beside it, as name-copy.
      r = copyPath(this.app.graph, clip.rel, into === from ? undefined : to);
    } catch (err) {
      return this.app.message("warn", (err as Error).message);
    }
    this.afterFileOp();
    this.app.explorer.select(r.to);
    this.app.message("info", `copied ${r.from} → ${r.to}${this.notIndexed(join(this.app.loc.root, r.to), r.dir)}`);
  }

  /** After files moved, came or went: the tree, the watcher and the layouts follow. */
  afterFileOp(): void {
    this.app.git.refresh();
    // The vault's folders listed a level at a time (what its walk leaves out, the vaults in it) listed again (T12).
    this.app.explorer.listings.stale(this.app.loc.root);
    this.app.explorer.invalidateTree();
    this.app.watcher?.sync(
      isListed(this.app.loc) ? [""] : this.app.graph.dirs,
      this.app.watch.knownFromGraph(),
      this.app.watch.sizesFromGraph(),
    );
    for (const b of this.app.buffers.values()) b.invalidateLayouts();
    this.app.relayoutAll();
  }

  /** Ask for a new folder's name and make it. */
  promptNewFolder(base = this.newItemBase()): void {
    if (base === null) return this.refuseOtherRoot();
    this.app.overlays.prompt(
      `new folder in ${base ? `${base}/` : "the vault's top folder"}`,
      (text) => void this.createFolder(text, base),
    );
  }

  /** Create a folder (`shift+n` in the explorer, `space d n`, `:mkdir`): selected in the explorer. */
  createFolder(input: string, base: string | null): string | null {
    if (base === null) return this.refuseOtherRoot(), null;
    const rel = this.newPath(input, base);
    if (!rel) return null;
    const abs = join(this.app.loc.root, rel);
    if (existsSync(abs)) {
      this.app.message("warn", `${rel} exists`);
      return null;
    }
    try {
      mkdirSync(abs, { recursive: true });
    } catch (err) {
      this.app.message("error", `can't create ${rel}: ${(err as Error).message}`);
      return null;
    }
    this.addFolders(rel);
    // Unfolded to it, and selected, in a shown explorer.
    const parts = rel.split("/");
    for (let i = 1; i < parts.length; i++) this.app.explorer.expanded.add(parts.slice(0, i).join("/"));
    this.app.explorer.invalidateTree();
    this.app.panels.switchLeftView("explorer");
    this.app.panels.showSidebar(true);
    const at = this.app.explorer.rows().findIndex((r) => r.kind === "dir" && r.path === rel);
    if (at >= 0) this.app.sidebar.selected = at;
    this.app.region = "sidebar";
    this.app.message("info", `created ${rel}/${this.notIndexed(abs, true)}`);
    return rel;
  }
}
