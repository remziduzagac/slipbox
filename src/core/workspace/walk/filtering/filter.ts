// Walk filter caches, ignore rules, mounts and note admission.

import { realpathSync, statSync } from "node:fs";
import { readRegular, SMALL_FILE } from "../../../foundation/platform/fsutil.ts";
import { join, relative, sep } from "node:path";
import ignore, { type Ignore } from "ignore";
import type { Config } from "../../../application/config/config.ts";
import { classify } from "../../../documents/model/filetypes.ts";
import { mountsIn } from "../../vaults/mounts.ts";
import { userFolders } from "../../../foundation/platform/paths.ts";
import { isVaultRoot, rootMarkers } from "../../vaults/vault.ts";
import { readFolder } from "../io/folders.ts";
import type { BusyWhy, FilterSettings } from "../contracts.ts";
import { ALWAYS_SKIPPED, ANOTHER_DISK, GIT_IGNORECASE, busyWhy, homeSkip, isBusyFolder } from "./policy.ts";

/** Whether the folder `abs` holds a note directly in it: a file named as a note, not hidden. One listing; none there, no. */
export function holdsNotes(abs: string, isNoteName: (name: string) => boolean): boolean {
  try {
    return readFolder(abs).some((e) => !e.isDirectory() && !e.name.startsWith(".") && isNoteName(e.name));
  } catch {
    return false;
  }
}

/** Home's Downloads, as home's path for it: where the desktop says (`user-dirs.dirs`), else `Downloads`. */
export function downloadsIn(home: string): string {
  const at = userFolders(home).find((f) => f.name === "Downloads")?.path;
  const rel = at ? relative(home, at).split(sep).join("/") : "";
  return rel && !rel.startsWith("..") ? rel : "Downloads";
}

/** The filter `settings` make. */
export function filterFrom(settings: FilterSettings): WalkFilter {
  return new WalkFilter(settings.root, settings.walk, settings.opts);
}

export class WalkFilter {
  private readonly extensions: Set<string>;
  /** `walk.exclude`, as it was when the filter was made: what it applies. */
  private readonly exclude: string[];
  private readonly gitignores = new Map<string, Ignore | null>();
  private readonly configIgnore: Ignore;
  /** Home's Downloads (VV-D2), as home's path for it; null in a vault's filter. */
  private readonly downloads: string | null;
  /** Home's folders where another filesystem is mounted (VV-D2), as home's paths for them: read from the mount table
   *  at each walk (`readMounts`), the first time one's needed else. */
  private mounts: Set<string> | null = null;

  /** `home`: home's filter (VV-D2) — its skip list, never a `.gitignore`. */
  constructor(
    readonly root: string,
    private readonly walk: Config["walk"],
    readonly opts: { home?: boolean; platform?: string } = {},
  ) {
    this.extensions = new Set(walk.extensions.map((e) => e.replace(/^\./, "").toLowerCase()));
    this.exclude = [...walk.exclude];
    this.configIgnore = ignore({ ignorecase: GIT_IGNORECASE }).add(this.exclude);
    this.downloads = opts.home ? downloadsIn(root) : null;
  }

  /** Home's filter (VV-D2), not a vault's. */
  get home(): boolean {
    return !!this.opts.home;
  }

  /** What makes this filter, for one made the same on another thread (T12): its folder, its settings, its opts. */
  get settings(): FilterSettings {
    return { root: this.root, walk: this.walk, opts: this.opts };
  }

  isNoteName(name: string): boolean {
    const dot = name.lastIndexOf(".");
    return dot > 0 && this.extensions.has(name.slice(dot + 1).toLowerCase());
  }

  get maxFileSize(): number {
    return this.walk.max_file_size;
  }

  /** The mount table read again (VV-D2: home's), once per walk: a disk mounted or taken away since is seen. */
  readMounts(): void {
    if (!this.home) return;
    let real = this.root;
    try {
      real = realpathSync(this.root);
    } catch {}
    this.mounts = mountsIn(this.root, real);
  }

  /** Whether `rel` is, or is in, a folder of home where another filesystem is mounted (VV-D2); never in a vault. */
  onMount(rel: string): boolean {
    if (!this.home) return false;
    if (!this.mounts) this.readMounts();
    if (!this.mounts!.size) return false;
    for (let i = rel.indexOf("/"); i > 0; i = rel.indexOf("/", i + 1))
      if (this.mounts!.has(rel.slice(0, i))) return true;
    return this.mounts!.has(rel);
  }

  /** Whether another filesystem is mounted at `rel` itself, a folder of home (VV-D2): not one in it. */
  mountAt(rel: string): boolean {
    if (!this.home) return false;
    if (!this.mounts) this.readMounts();
    return this.mounts!.has(rel);
  }

  /**
   * What decides which files home's walk takes, the disk aside (VV-D2): the note extensions, `walk.exclude`, the root
   * markers, where Downloads is, the platform. A walk kept under other settings is no walk of home's now (`homeWalk`).
   */
  signature(): string {
    return JSON.stringify({
      extensions: [...this.extensions].sort(),
      exclude: this.exclude,
      markers: [...rootMarkers()].sort(),
      downloads: this.downloads,
      platform: this.opts.platform ?? process.platform,
    });
  }

  /**
   * Whether `rel` may be indexed when it's reached though the walk leaves it out (20.8): nothing on
   * its way is always skipped, a busy folder (VV-D8), excluded by `walk.exclude` or a vault of its own —
   * only a hidden folder or `.gitignore` keeps it from the walk. In home, nothing its skip list leaves
   * out is read (VV-D2): named, such a file is opened, and nothing more.
   */
  reachable(rel: string): boolean {
    const parts = rel.split("/");
    if (parts.some((p) => !p || p === "." || p === "..")) return false;
    for (let i = 0; i < parts.length; i++) {
      const prefix = parts.slice(0, i + 1).join("/");
      const why = this.exclusion(prefix, i < parts.length - 1);
      if (why !== null && (this.home || (why !== "hidden" && why !== ".gitignore"))) return false;
      // A root of its own, hidden or git-ignored too (a vendored clone): `exclusion` says why the
      // walk skips it before it looks for markers.
      if (why !== null && i < parts.length - 1 && isVaultRoot(join(this.root, prefix))) return false;
    }
    return true;
  }

  /** Whether `walk.exclude` names `rel` itself — a folder, with `isDir` — whatever leaves it out before. */
  excludes(rel: string, isDir: boolean): boolean {
    return this.configIgnore.ignores(isDir ? `${rel}/` : rel);
  }

  /**
   * Why a file written at `rel` — a folder, with `isDir` — is never indexed though the write is allowed (D246): its
   * name, or a folder's on its way, is one `walk.exclude` names. Not refused, as a busy folder's new note is — the
   * setting is yours — but said after the write. Null where it's indexed, and under a root nested on its way (indexed
   * there, by its own settings). Elsewhere, which indexes nothing, is `Graph.notIndexed`'s to leave out.
   */
  notIndexed(rel: string, isDir = false): "walk.exclude" | null {
    const parts = rel.split("/");
    if (!parts.some((_, i) => this.excludes(parts.slice(0, i + 1).join("/"), isDir || i < parts.length - 1)))
      return null;
    for (let i = 1; i < parts.length + (isDir ? 1 : 0); i++)
      if (isVaultRoot(join(this.root, parts.slice(0, i).join("/")))) return null;
    return "walk.exclude";
  }

  /** Why `rel` is excluded, or null when it is part of the vault. Ancestors are assumed walked. */
  exclusion(rel: string, isDir: boolean): string | null {
    const name = rel.slice(rel.lastIndexOf("/") + 1);
    if (ALWAYS_SKIPPED.has(name)) return "always skipped";
    if (name.startsWith(".")) return "hidden";
    if (this.excludes(rel, isDir)) return "walk.exclude";
    // Home (VV-D2): its skip list, never a `.gitignore` — a dotfiles repository's `*` would leave home empty.
    if (this.home) {
      if (isDir) {
        const why = homeSkip(rel, { platform: this.opts.platform, downloads: this.downloads ?? undefined });
        if (why) return why;
        // Another disk: never looked into, nor for a marker — known from the mount table alone.
        if (this.onMount(rel)) return ANOTHER_DISK;
        // A busy folder (D237): looked into for a note at its top, so after another disk, which never is.
        if (this.busy(rel)) return "busy folder";
        return isVaultRoot(join(this.root, rel)) ? "nested vault" : null;
      }
      // What the explorer doesn't list as a note or a text file: a picture, an archive, a program.
      return this.isNoteName(name) || classify(name, this.walk.extensions).group !== "binary"
        ? null
        : "not a note or text file";
    }
    // A busy folder (VV-D8, D237): listed in the explorer, never indexed — ignored, it's busy rather than reached.
    if (isDir && this.busy(rel)) return "busy folder";
    if (this.ignoredByGit(rel, isDir)) return ".gitignore";
    // A folder holding a root marker (`walk.root_markers`, 21.1: `.git`, `.slipbox/`, `.obsidian/`, `.zk/`…)
    // inside: a root of its own (20.3).
    if (isDir && isVaultRoot(join(this.root, rel))) return "nested vault";
    return null;
  }

  /**
   * Whether the folder `rel` is busy (VV-D8, D237): `isBusyFolder`, asked with what this walk knows — ignored by the
   * `.gitignore`s it reads (a vault's; home reads none), and its notes, listed once a walk. `notes`: it holds one,
   * whatever the disk says now (a write about to put one there).
   */
  busy(rel: string, notes?: boolean): boolean {
    return isBusyFolder(...this.busyAsked(rel, notes));
  }

  /** `busy`, saying why (`busyWhy`): which of the rule's two things hold. Null when `rel` isn't busy. */
  busyWhy(rel: string): BusyWhy | null {
    return busyWhy(...this.busyAsked(rel));
  }

  /** What the busy folders' rule is asked of `rel`: its name, whether it's ignored, whether it holds a note. */
  private busyAsked(rel: string, notes?: boolean): [string, () => boolean, () => boolean] {
    return [
      rel.slice(rel.lastIndexOf("/") + 1),
      () => !this.home && this.ignoredByGit(rel, true),
      () => notes ?? this.notesIn(rel),
    ];
  }

  /**
   * Whether `rel` holds a note at its top: listed once a walk (`newWalk`), and again when its folder changed since (its
   * mtime) — a note written there, by slipbox or not, is seen the next time it's asked.
   */
  private notesIn(rel: string): boolean {
    const abs = join(this.root, rel);
    let mtimeMs: number;
    try {
      mtimeMs = statSync(abs).mtimeMs;
    } catch {
      return false; // not there: no note in it
    }
    const known = this.notesAt.get(rel);
    if (known?.mtimeMs === mtimeMs) return known.has;
    const has = holdsNotes(abs, (n) => this.isNoteName(n));
    this.notesAt.set(rel, { mtimeMs, has });
    return has;
  }

  /** What the busy-named folders hold, by their path, and when they were listed: listed again in each walk. */
  private readonly notesAt = new Map<string, { mtimeMs: number; has: boolean }>();

  /** A walk begins: the busy-named folders are looked into again (D237). */
  newWalk(): void {
    this.notesAt.clear();
  }

  /**
   * git semantics: every .gitignore from the root down applies to the path relative to its own directory, and the last
   * one with an opinion wins — so a deeper `!keep.md` re-includes. (A directory already excluded is never descended
   * into, as with git.)
   */
  private ignoredByGit(rel: string, isDir: boolean): boolean {
    let ignored = false;
    let dir = "";
    const parts = rel.split("/");
    for (let i = 0; i < parts.length; i++) {
      const ig = this.gitignoreFor(dir);
      if (ig) {
        const sub = parts.slice(i).join("/");
        const t = ig.test(isDir ? `${sub}/` : sub);
        if (t.ignored) ignored = true;
        else if (t.unignored) ignored = false;
      }
      dir = dir ? `${dir}/${parts[i]}` : parts[i]!;
    }
    return ignored;
  }

  /** Drop a cached .gitignore, e.g. when the watcher sees it change. */
  invalidate(dirRel: string): void {
    this.gitignores.delete(dirRel);
  }

  private gitignoreFor(dirRel: string): Ignore | null {
    if (this.gitignores.has(dirRel)) return this.gitignores.get(dirRel)!;
    let ig: Ignore | null = null;
    try {
      const text = readRegular(join(this.root, dirRel, ".gitignore"), SMALL_FILE).toString("utf8");
      ig = ignore({ ignorecase: GIT_IGNORECASE }).add(text);
    } catch {}
    this.gitignores.set(dirRel, ig);
    return ig;
  }
}
