// Explorer file visibility and ordering use the current client configuration and graph.
import ignore from "ignore";
import { classify, type FileGroup } from "../../../../core/documents/model/filetypes.ts";
import { autoWhy } from "../../../../core/workspace/vaults/notes-vault.ts";
import type { ExplorerReadContext } from "../contracts.ts";

/** The setting that says what the explorer lists, as a config file names it. */
const SETTING = "[files] show";

export class ExplorerFileRows {
  constructor(private readonly app: ExplorerReadContext) {}

  /**
   * The files beyond notes the explorer and the switcher list (16.5): by `files.show` — or the
   * other way while the explorer's `a` is on — then `files.include` patterns always, and
   * `files.exclude` never. Binary files are never listed.
   */
  shownFiles(): { path: string; group: FileGroup }[] {
    const lists = this.listsFiles();
    const out: { path: string; group: FileGroup }[] = [];
    for (const path of this.app.graph.filePaths()) {
      const { group } = classify(path, this.app.config.walk.extensions);
      if (lists(path, group)) out.push({ path, group });
    }
    return out;
  }

  /** Whether the explorer lists a file of the vault, by its path in it and its kind: `shownFiles`' rule. */
  listsFiles(): (path: string, group: FileGroup) => boolean {
    const f = this.app.config.files;
    const mode = this.explorerShows();
    const incl = f.include.length ? ignore().add(f.include) : null;
    const excl = f.exclude.length ? ignore().add(f.exclude) : null;
    return (path, group) => {
      if (group === "note") return true;
      if (group === "binary" || excl?.ignores(path)) return false;
      return !!incl?.ignores(path) || mode === "all" || (mode === "renderable" && group === "data");
    };
  }

  /** What the explorer lists: what `files.show` does, or, `a` pressed, the other way — every text file, or notes and
   *  data files when every one is what it lists. */
  explorerShows(): "notes" | "renderable" | "all" {
    const shown = this.filesShown();
    return this.app.sidebar.otherFiles ? (shown === "all" ? "renderable" : "all") : shown;
  }

  /**
   * What `files.show` lists here: `auto` — every text file in a vault whose top holds `.git` (a repository, where code
   * lives), `.slipbox/` or not; notes and data files in a notes vault (`.slipbox/` without `.git` beside it); every text
   * file anywhere else (D272).
   */
  filesShown(): "notes" | "renderable" | "all" {
    const show = this.app.config.files.show;
    if (show !== "auto") return show;
    return this.autoWhy() === "notes" ? "renderable" : "all";
  }

  /** Why `auto` lists what it does in the vault open (`autoWhy`); null in home and Elsewhere, as in a plain vault. */
  private autoWhy(): "git" | "notes" | null {
    return this.app.loc.mode === "vault" ? autoWhy(this.app.loc.root) : null;
  }

  /**
   * The line under the explorer's tree saying why it lists what it does, naming the setting that changes it (D272):
   * every text file, as `auto` lists them where git is at the vault's top; else how many of the vault's text files it
   * leaves out — not counting those `files.include` lists anyway, nor those `files.exclude` leaves out — and why: `auto`
   * in a notes vault, `a` for now, or `files.show` itself. Null when there's nothing to say.
   */
  filesNotice(): string | null {
    const f = this.app.config.files;
    const mode = this.explorerShows();
    const toggled = !!this.app.sidebar.otherFiles;
    if (mode === "all")
      return f.show === "auto" && !toggled && this.autoWhy() === "git"
        ? `every text file: git repository · ${SETTING}`
        : null;
    const incl = f.include.length ? ignore().add(f.include) : null;
    const excl = f.exclude.length ? ignore().add(f.exclude) : null;
    let n = 0;
    for (const path of this.app.graph.filePaths()) {
      const { group } = classify(path, this.app.config.walk.extensions);
      if (group === "note" || group === "binary" || (mode === "renderable" && group === "data")) continue;
      if (!incl?.ignores(path) && !excl?.ignores(path)) n++;
    }
    if (!n) return null;
    const why = toggled ? " for now (a)" : f.show === "auto" ? ": notes vault" : "";
    return `${n.toLocaleString("en-US")} ${n === 1 ? "file" : "files"} not listed${why} · ${SETTING}`;
  }

  /** Every note's path, directories first at each level, as the tree orders them. */
  allNotesInTreeOrder(): string[] {
    return [...this.app.graph.notes.keys(), ...this.shownFiles().map((f) => f.path)].sort((a, b) => {
      const da = a.split("/");
      const db = b.split("/");
      for (let i = 0; i < Math.min(da.length, db.length); i++) {
        const lastA = i === da.length - 1;
        const lastB = i === db.length - 1;
        if (da[i] !== db[i]) {
          if (lastA !== lastB) return lastA ? 1 : -1;
          return da[i]!.localeCompare(db[i]!, undefined, { sensitivity: "base" });
        }
      }
      return da.length - db.length;
    });
  }
}
