// The switch list includes known vaults independently of pointer names (VB-T3–T5).
import { readFolders } from "./folders.ts";
import { checkoutOf, headOf } from "../../git.ts";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { readRoots } from "./registry.ts";
import { vaultAt } from "./vault.ts";
import { homeFolder } from "./vault.ts";
import { loadSession } from "../session/position.ts";
import { rootLabel, tildePath } from "./names.ts";
import { sanitize } from "../../foundation/text/sanitize.ts";
export interface VaultEntry {
  label: string;
  detail: string;
  hint?: string;
  indent?: number;
  header?: boolean;
  data: { root: string; folder?: string } | null;
}

export function knownVaults(): VaultEntry[] {
  const roots = readRoots().filter((root) => root.kind !== "folder" && existsSync(root.path));
  for (const folder of readFolders()) {
    for (const copy of folder.copies) {
      if (existsSync(copy.path) && !roots.some((root) => root.path === copy.path))
        roots.push({ key: folder.key, path: copy.path, kind: "vault", seen: copy.seen });
    }
  }
  const groups = new Map<string, typeof roots>();
  for (const root of roots) {
    const key = root.worktree?.main ?? root.path;
    const group = groups.get(key) ?? [];
    group.push(root);
    groups.set(key, group);
  }
  const blocks: { at: string; rows: VaultEntry[] }[] = [];
  const recent = (group: typeof roots) => group.reduce((last, root) => (root.seen > last ? root.seen : last), "");
  for (const [main, group] of [...groups].sort((a, b) => recent(b[1]).localeCompare(recent(a[1])))) {
    const rows: VaultEntry[] = [];
    const trees = group.some((root) => root.worktree);
    if (trees)
      rows.push({ label: sanitize(rootLabel(vaultAt(main))), detail: tildePath(main), header: true, data: null });
    for (const root of group.sort((a, b) => b.seen.localeCompare(a.seen))) {
      const loc = vaultAt(root.path);
      rows.push({
        label: sanitize(
          trees
            ? ((checkoutOf(root.path) ? headOf(checkoutOf(root.path)!).branch : null) ??
                root.worktree?.name ??
                rootLabel(loc))
            : rootLabel(loc),
        ),
        detail: sanitize(tildePath(root.path)),
        indent: trees ? 1 : 0,
        data: { root: root.path },
      });
    }
    blocks.push({ at: recent(group), rows });
  }
  const home = homeFolder();
  const state = loadSession(vaultAt(home));
  for (const [folder, workspace] of Object.entries(state?.folders ?? {}).sort((a, b) =>
    (b[1].at ?? "").localeCompare(a[1].at ?? ""),
  )) {
    if (!folder || !existsSync(join(home, folder))) continue;
    blocks.push({
      at: workspace.at,
      rows: [
        {
          label: sanitize(folder),
          detail: "home's workspace",
          hint: "home",
          data: { root: home, folder: join(home, folder) },
        },
      ],
    });
  }
  return blocks.sort((a, b) => b.at.localeCompare(a.at)).flatMap((block) => block.rows);
}
