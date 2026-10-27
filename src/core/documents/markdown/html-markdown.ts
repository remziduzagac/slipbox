// Preserve original HTML runs, including text parsed by Markdown between inline tags.
import type { Nodes, Root } from "mdast";
import type { Point } from "unist";
import { htmlForMarkdown, htmlTokens, VOID_HTML, type HtmlOmission } from "./html.ts";

export function markdownHtml(tree: Root, source?: string): Root {
  const state: HtmlOmission = {};
  const starts = [0];
  if (source) for (let i = 0; i < source.length; i++) if (source[i] === "\n") starts.push(i + 1);
  const offset = (point: Point) => (starts[point.line - 1] ?? 0) + point.column - 1;
  const tags = (node: Nodes, stack: string[]) => {
    if (node.type === "html") {
      for (const token of htmlTokens(node.value)) {
        if (token.kind === "open" && !token.selfClosing && !VOID_HTML.has(token.tag)) stack.push(token.tag);
        if (token.kind === "close") {
          const at = stack.lastIndexOf(token.tag);
          if (at >= 0) stack.length = at;
        }
      }
    } else if ("children" in node) for (const child of node.children) tags(child, stack);
  };
  const cleanChildren = (nodes: Nodes[]): Nodes[] => {
    const out: Nodes[] = [];
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i]!;
      if (source !== undefined && node.type === "html" && node.position) {
        const stack: string[] = [];
        tags(node, stack);
        let end = i;
        while (stack.length && end + 1 < nodes.length) tags(nodes[++end]!, stack);
        const last = nodes[end]!;
        if (last.position) {
          const value = htmlForMarkdown(source.slice(offset(node.position.start), offset(last.position.end)), state);
          if (value)
            out.push({ type: "html", value, position: { start: node.position.start, end: last.position.end } });
          i = end;
          continue;
        }
      }
      out.push(...clean(node));
    }
    return out;
  };
  const clean = (node: Nodes): Nodes[] => {
    if (node.type === "html") {
      const value = htmlForMarkdown(node.value, state);
      return value ? [{ ...node, value }] : [];
    }
    if (state.tag) return [];
    if (!("children" in node)) return [node];
    return [{ ...node, children: cleanChildren(node.children) } as Nodes];
  };
  return clean(tree)[0] as Root;
}
