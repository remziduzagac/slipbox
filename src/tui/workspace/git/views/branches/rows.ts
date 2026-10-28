// Branch rows are derived from live query answers, open state and panel filtering.
import { GIT_MARK } from "../../marks.ts";
import { type Branch, orderBranches } from "../../../../../core/workspace/git/branches/gitbranches.ts";
import { tildePath } from "../../../../../core/workspace/vaults/names.ts";
import { sanitize } from "../../../../../core/foundation/text/sanitize.ts";
import { match } from "../../../../shell/overlays/match.ts";
import type { HeadingRow, PanelRow } from "../contracts.ts";
import type { BranchRowHost } from "../contracts.ts";

export class BranchRows {
  constructor(private readonly host: BranchRowHost) {}
  get app() {
    return this.host.app;
  }

  /** The section's rows: the heading, then the branches in order, the merged and older folded under one of their own. */
  rows(): PanelRow[] {
    const p = this.app.gitPanel;
    const got = this.host.branches();
    const q = p.filter();
    const heading: HeadingRow = { kind: "heading", section: "branches", label: "Branches" };
    if (!got) return [heading, { kind: "note", text: "asking git…" }];
    const { branches, merged } = got;
    const order = orderBranches(branches, (b) => merged.has(b.name), this.app.now());
    const keep = (b: Branch) => !q || match(q, b.name);
    const shown = order.shown.filter(keep);
    const folded = order.folded.filter(keep);
    if (q && !shown.length && !folded.length) return [];
    heading.label = `Branches (${shown.length + folded.length})`;
    const rows: PanelRow[] = [heading];
    if (p.folded.has("branches")) return rows;
    for (const b of shown) rows.push(...this.branchRows(b));
    if (folded.length) {
      rows.push({ kind: "heading", section: "older", label: `Merged or older (${folded.length})` });
      if (!p.folded.has("older") || q) for (const b of folded) rows.push(...this.branchRows(b));
    }
    return rows;
  }

  /** A branch's row, and opened up, what it holds and offers. */
  private branchRows(b: Branch): PanelRow[] {
    const open = this.host.opened.has(b.name);
    const rows: PanelRow[] = [{ kind: "branch", branch: b, open }];
    if (!open) return rows;
    const st = this.host.statsOf(b);
    const w = b.worktree;
    if (w?.gone)
      return [
        ...rows,
        { kind: "bline", branch: b, text: `its folder is gone: ${tildePath(w.path)}`, gone: true },
        { kind: "bbuttons", branch: b, buttons: [{ action: "prune", label: "Prune" }] },
      ];
    if (w && !b.here) rows.push({ kind: "bline", branch: b, text: tildePath(w.path), gone: false });
    const buttons: { action: string; label: string }[] = b.here
      ? []
      : w
        ? [{ action: "go", label: "Open" }]
        : [
            { action: "checkout", label: "Check out here" },
            { action: "worktree", label: "Open in a worktree" },
          ];
    // The review (v) comes here, beside Open. Merge… whatever git says yet: the buttons never move under the pointer.
    buttons.push({ action: "merge", label: "Merge…" });
    if (w && !w.main && !b.here) buttons.push({ action: "remove", label: "Remove…" });
    if (buttons.length) rows.push({ kind: "bbuttons", branch: b, buttons });
    const files = this.host.filesOf(b, st?.base ?? null);
    if (w && !b.here) {
      const un = files?.uncommitted;
      rows.push({
        kind: "bsub",
        branch: b,
        against: "uncommitted",
        label: un ? `Uncommitted (${un.length})` : "Uncommitted: asking git…",
      });
      for (const e of un ?? [])
        rows.push({
          kind: "bfile",
          branch: b,
          against: "uncommitted",
          path: e.path,
          letter: e.x === "?" ? "?" : e.x !== " " ? e.x : e.y,
          base: null,
        });
    }
    if (st?.base) {
      const of = files?.base;
      rows.push({
        kind: "bsub",
        branch: b,
        against: "base",
        label: of ? `Against ${sanitize(st.base)} (${of.length})` : `Against ${sanitize(st.base)}: asking git…`,
      });
      for (const f of of ?? [])
        rows.push({
          kind: "bfile",
          branch: b,
          against: "base",
          path: f.path,
          ...(f.from ? { from: f.from } : {}),
          letter: GIT_MARK[f.state],
          base: st.base,
        });
    }
    return rows;
  }
}
