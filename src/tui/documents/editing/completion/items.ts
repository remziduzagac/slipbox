// Link item production and stable completion ordering.

import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import type { CompletionItem } from "vscode-languageserver-protocol";
import { conventionOf, type LinkStyle } from "../../../../core/workspace/links/convention.ts";
import { linkDestination, linkEnds, type PointerMemo } from "../../../../core/workspace/links/write-link.ts";
import { readJson } from "../../../../core/foundation/platform/fsutil.ts";
import { cacheDir } from "../../../../core/foundation/platform/paths.ts";
import { readRoots } from "../../../../core/workspace/vaults/registry.ts";
import { homeFolder } from "../../../../core/workspace/vaults/vault.ts";
import type { App, View } from "../../../app/runtime/app.ts";

/**
 * The files a link from this note could reach (20.13): this vault's notes and files, each by its path
 * here, and (a markdown link's) other vaults' notes, each by its path as shown (21.9) — the full path beside each,
 * and either typed narrows. Picked, it's written as the root's convention writes it in `style` (21.5);
 * a wikilink reaches only its own root's (21.3).
 */
export function linkItems(app: App, view: View, style: LinkStyle): CompletionItem[] {
  const g = app.graph;
  const c = conventionOf(g, app.config, app.settings.origins, style);
  const home = homeFolder();
  const tilde = (abs: string) => (abs.startsWith(`${home}/`) ? `~/${relative(home, abs)}` : abs);
  // Each other vault's pointer name worked out once, not once per note: per note it read every named folder.
  const memo: PointerMemo = { root: g.root, naming: new Map() };
  const item = (abs: string, form: string, here: boolean): CompletionItem => {
    const ends = linkEnds(g, view.buf.abs, abs, memo);
    const dest = linkDestination(c, style, ends);
    return {
      // A wikilink's shows what it writes (a name, a path); a markdown link's, the file by its path as shown (21.9).
      label: style === "wiki" ? dest : form,
      detail: style === "wiki" ? form : tilde(abs),
      filterText: `${form} ${dest} ${abs}`,
      sortText: `${here ? 0 : 1}${form}`,
      insertText: dest,
      // A pointer's name is settled when it's picked: asked on a clash, said when private (D74, D83).
      ...(ends.pointer && ends.naming && (ends.naming.clash.length || ends.naming.private)
        ? { data: { pointerTo: abs, style } }
        : {}),
    };
  };
  const out: CompletionItem[] = [];
  for (const rel of [...g.notes.keys(), ...g.filePaths()]) {
    const abs = g.abs(rel);
    if (abs !== view.buf.abs) out.push(item(abs, rel, true));
  }
  if (style === "wiki") return out;
  // Other vaults' notes, as of their last index: what the machine knows, read once per completion.
  for (const v of readRoots()) {
    if (v.kind !== "vault" || v.worktree || v.path === g.root || !existsSync(v.path)) continue;
    const entries = readJson<{ entries?: Record<string, unknown> } | null>(
      join(cacheDir(v), "index.json"),
      null,
    )?.entries;
    for (const rel of Object.keys(entries ?? {})) {
      const abs = join(v.path, rel);
      out.push(item(abs, g.shownPath(abs), false));
    }
  }
  return out;
}

/** The items in the server's order: by `sortText`, else the label. */
export function inOrder(items: CompletionItem[]): CompletionItem[] {
  return [...items].sort((a, b) => (a.sortText ?? a.label).localeCompare(b.sortText ?? b.label));
}
