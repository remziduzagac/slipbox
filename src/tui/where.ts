// Where you are (WSP-D4, WSP-D5): the vault, by its name or its path (home `~`, Elsewhere), the workspace when it isn't
// the vault's own (a folder of home opened by name), and the branch with how far it's ahead and behind and a merge or a
// rebase under way. The top bar draws it in its middle, the vault and the branch each a click target; the status line,
// without the glyph, only while the bar doesn't. Short of room it's cut a step at a time (`fitWhere`), the same for
// both.

import type { App } from "./app.ts";
import { operationStatus } from "./rebase.ts";
import { ELSEWHERE, tildePath } from "../core/names.ts";
import { trackText } from "../core/gitremote.ts";
import { sanitize } from "../core/sanitize.ts";
import { stringWidth, truncate, truncateStart } from "../core/width.ts";

/** Where you are, in parts, each sanitized. */
export interface Where {
  /** The vault's glyph and a space before its name; empty for Elsewhere (no vault), and on the status line. */
  glyph: string;
  /** The vault: its name, else its path (`~/src/experiment`); home `~`; Elsewhere `Elsewhere`. */
  vault: string;
  /** Whether `vault` is a path, cut from the front (its last folders kept); a name is cut from its end. */
  vaultPath: boolean;
  /** The workspace when it isn't the vault's own: a folder of home opened by name, by home's path for it. */
  folder: string | null;
  /** Between the vault and the folder (`›`). */
  sep: string;
  /** The branch checked out (a detached head: its commit; a rebase: the branch rebased), null outside git. */
  branch: string | null;
  /** A named worktree: its branch after its name, `kestrel@feat`, rather than `kestrel · feat`. */
  at: boolean;
  /** How far ahead of its upstream and behind (`↑2 ↓1`), or empty. */
  track: string;
  /** A merge or a rebase under way (`merging`, `rebasing 2/5`), or empty. */
  op: string;
}

/** Where you are as drawn: the vault's part (with the workspace) and the branch's, each a click target on the bar. */
export interface WhereText {
  vault: string;
  branch: string;
}

/** Where the app is now. */
export function whereOf(app: App): Where {
  const loc = app.loc;
  const elsewhere = loc.mode === "folder";
  // A merge or a rebase under way, said after the branch (GIT-D6): a rebase's HEAD is detached, its branch named.
  const op = elsewhere ? null : operationStatus(app);
  const branch = elsewhere ? null : (op?.branch ?? app.git.branch());
  const named = loc.mode === "vault" ? loc.name : null;
  const t = app.git.track;
  const g = app.glyphs;
  return {
    glyph: elsewhere ? "" : `${g.vault} `,
    // Elsewhere (VV-D3) by its name: it's one place, wherever its folder.
    vault: sanitize(named ?? (elsewhere ? ELSEWHERE : tildePath(loc.root))),
    vaultPath: !named && !elsewhere,
    folder: loc.mode === "home" && app.homeFolder ? sanitize(app.homeFolder) : null,
    sep: g.sep,
    branch: branch ? sanitize(branch) : null,
    at: !!(named && loc.worktree),
    track: branch && t?.branch === branch ? trackText(t, g.gitAhead, g.gitBehind) : "",
    op: op?.text ?? "",
  };
}

/** The parts joined: `◈ kestrel · main ↑2`, `◈ ~ › notes`, `◈ kestrel@feat rebasing 2/5`, `Elsewhere`. */
export function whereText(w: Where): WhereText {
  // No branch, or an empty one (a rebase's `head-name` of `refs/heads/` alone): nothing after the vault but what's
  // under way.
  const branch = !w.branch ? "" : w.at ? `@${w.branch}` : ` · ${w.branch}`;
  return {
    vault: `${w.glyph}${w.vault}${w.folder ? ` ${w.sep} ${w.folder}` : ""}`,
    branch: `${branch}${w.track ? ` ${w.track}` : ""}${w.op ? ` ${w.op}` : ""}`,
  };
}

/**
 * Where you are, cut to `width` columns (WSP-D4), giving up a part at a time, each only once what's left can't fit: the
 * branch's ahead and behind and its operation, then the branch, then the workspace. At each stage the parts left are cut
 * from their whole text, only as far as they must: a path from the front, the vault's then the workspace's, to 12
 * columns each; then, once ahead and behind are gone, the branch from its end, to 8. Last, with the vault alone, it's
 * cut to 6, a name from its end and a path from the front. Narrower still: null, nothing drawn.
 */
export function fitWhere(w: Where, width: number): WhereText | null {
  const stages: Partial<Where>[] = [
    {},
    { track: "", op: "" },
    { track: "", op: "", branch: null },
    { track: "", op: "", branch: null, folder: null },
  ];
  for (const [i, stage] of stages.entries()) {
    const s: Where = { ...w, ...stage };
    const over = () => {
      const t = whereText(s);
      return stringWidth(t.vault) + stringWidth(t.branch) - width;
    };
    if (s.vaultPath) s.vault = cut(s.vault, true, 12, over());
    if (s.folder) s.folder = cut(s.folder, true, 12, over());
    if (i === 1 && s.branch) s.branch = cut(s.branch, false, 8, over());
    if (over() <= 0) return whereText(s);
    if (i === stages.length - 1) {
      // From the whole name: what's over were it whole.
      s.vault = cut(w.vault, s.vaultPath, 6, over() - stringWidth(s.vault) + stringWidth(w.vault));
      if (over() <= 0) return whereText(s);
    }
  }
  return null;
}

/** `text` made `over` columns narrower, never below `min`: a path from the front (its last folders kept), else its end. */
function cut(text: string, fromFront: boolean, min: number, over: number): string {
  const target = Math.max(min, stringWidth(text) - over);
  if (target >= stringWidth(text)) return text;
  return fromFront ? truncateStart(text, target) : truncate(text, target);
}
