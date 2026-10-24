// The switch list includes known vaults independently of pointer names (VB-T3–T5).
import { readFolders } from "../core/folders.ts";
import { checkoutOf, headOf } from "../core/git.ts";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { readRoots } from "../core/registry.ts";
import { vaultAt } from "../core/vault.ts";
import { homeFolder } from "../core/vault.ts";
import { loadSession } from "../core/position.ts";
import { rootLabel, tildePath } from "../core/names.ts";
import { sanitize } from "../core/sanitize.ts";
import type { ListItem } from "./app.ts";

export function vaultChoices(): ListItem[] {
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
  const blocks: { at: string; rows: ListItem[] }[] = [];
  const recent = (group: typeof roots) => group.reduce((last, root) => (root.seen > last ? root.seen : last), "");
  for (const [main, group] of [...groups].sort((a, b) => recent(b[1]).localeCompare(recent(a[1])))) {
    const rows: ListItem[] = [];
    const trees = group.some((root) => root.worktree);
    if (trees)
      rows.push({ label: sanitize(rootLabel(vaultAt(main))), detail: tildePath(main), header: true, data: null });
    for (const root of group.sort((a, b) => b.seen.localeCompare(a.seen))) {
      const loc = vaultAt(root.path);
      rows.push({
        label: sanitize(
          root.worktree
            ? ((checkoutOf(root.path) ? headOf(checkoutOf(root.path)!).branch : null) ?? root.worktree.name)
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
