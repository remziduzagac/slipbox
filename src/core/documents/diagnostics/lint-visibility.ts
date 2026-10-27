// Presentation of completed markdownlint findings; the linter's rules and original output stay intact.
import type { Nodes, Root } from "mdast";
import type { Config } from "../../application/config/config.ts";
import type { LintIssue } from "./lint.ts";

export type HiddenReason = "lines the view wraps" | "table rows the view fits" | "rules in lint.ignore";
type Block = { first: number; last: number; kind: "prose" | "table" | "fence" };
const blocks = new WeakMap<Root, Block[]>();

/** Classify source lines from the same parse that supplies the rendered blocks. Unknown blocks stay visible. */
function ranges(tree: Root, source: string): Block[] {
  const hit = blocks.get(tree);
  if (hit) return hit;
  const out: Block[] = [];
  const lines = source.split("\n");
  const visit = (node: Nodes) => {
    const pos = node.position;
    if (pos) {
      if (node.type === "paragraph" || node.type === "table")
        out.push({ first: pos.start.line, last: pos.end.line, kind: node.type === "table" ? "table" : "prose" });
      if (
        node.type === "code" &&
        /^(?:`{3,}|~{3,})/.test((lines[pos.start.line - 1] ?? "").slice(pos.start.column - 1))
      ) {
        // Fences themselves aren't code lines; indented code isn't a fence either.
        const count = node.value ? node.value.split("\n").length : 0;
        out.push({ first: pos.start.line + 1, last: pos.start.line + count, kind: "fence" });
      }
    }
    if ("children" in node) for (const child of node.children) visit(child as Nodes);
  };
  visit(tree);
  blocks.set(tree, out);
  return out;
}

export interface LintVisibility {
  shown: LintIssue[];
  hidden: Map<HiddenReason, number>;
}

/** Missing parses are conservative: only an explicit ignored rule can hide a finding. */
export function visibleLint(
  issues: readonly LintIssue[],
  parsed: { tree: Root; source: string } | null,
  lint: Pick<Config["lint"], "follow_view" | "ignore">,
  view: { wrap: boolean; codeWrap: boolean },
  showAll = false,
): LintVisibility {
  const shown: LintIssue[] = [];
  const hidden = new Map<HiddenReason, number>();
  const classified = parsed && lint.follow_view ? ranges(parsed.tree, parsed.source) : [];
  for (const issue of issues) {
    let reason: HiddenReason | undefined;
    if (lint.ignore.includes(issue.rule)) reason = "rules in lint.ignore";
    else if (lint.follow_view && issue.rule === "MD013") {
      const block = classified.find((b) => issue.line >= b.first && issue.line <= b.last);
      if (block?.kind === "table") reason = "table rows the view fits";
      else if ((block?.kind === "prose" && view.wrap) || (block?.kind === "fence" && view.codeWrap))
        reason = "lines the view wraps";
    }
    if (reason) hidden.set(reason, (hidden.get(reason) ?? 0) + 1);
    if (showAll || !reason) shown.push(issue);
  }
  return { shown, hidden };
}
