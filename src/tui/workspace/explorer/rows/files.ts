// Explorer file visibility and ordering use the current client configuration and graph.
import ignore from "ignore";
import { classify, type FileGroup } from "../../../../core/documents/model/filetypes.ts";
import { hasMarker } from "../../../../core/workspace/vaults/vault.ts";
import type { ExplorerReadContext } from "../contracts.ts";

export class ExplorerFileRows {
  constructor(private readonly app: ExplorerReadContext) {}

  /**
   * The files beyond notes the explorer and the switcher list (16.5): by `files.show` — or all
   * text files while the explorer's toggle is on — then `files.include` patterns always, and
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
    const mode = this.app.sidebar.allFiles ? "all" : this.filesShown();
    const incl = f.include.length ? ignore().add(f.include) : null;
    const excl = f.exclude.length ? ignore().add(f.exclude) : null;
    return (path, group) => {
      if (group === "note") return true;
      if (group === "binary" || excl?.ignores(path)) return false;
      return !!incl?.ignores(path) || mode === "all" || (mode === "renderable" && group === "data");
    };
  }

  /**
   * What `files.show` lists here: `auto` — notes and data files in a notes root (one with `.slipbox/`),
   * every text file anywhere else (a repository, where code lives; a plain folder).
   */
  filesShown(): "notes" | "renderable" | "all" {
    const show = this.app.config.files.show;
    if (show !== "auto") return show;
    return this.app.loc.mode === "vault" && hasMarker(this.app.loc.root) ? "renderable" : "all";
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
