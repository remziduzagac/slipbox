// Location data for the permanent grouped bar (VB-D3, VB-D6).

import type { App } from "./app.ts";
import { operationStatus } from "./rebase.ts";
import { ELSEWHERE, tildePath } from "../core/workspace/vaults/names.ts";
import { trackText } from "../core/gitremote.ts";
import { sanitize } from "../core/foundation/text/sanitize.ts";

/** Sanitized vault and git state; explorer zoom and workspace are composed by draw-topbar. */
export interface Where {
  vault: string;
  branch: string | null;
  track: string;
  op: string;
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
    // Elsewhere (VV-D3) by its name: it's one place, wherever its folder.
    vault: sanitize(named ?? (elsewhere ? ELSEWHERE : tildePath(loc.root))),
    branch: branch ? sanitize(branch) : null,
    track: branch && t?.branch === branch ? sanitize(trackText(t, g.gitAhead, g.gitBehind)) : "",
    op: sanitize(op?.text ?? ""),
  };
}
