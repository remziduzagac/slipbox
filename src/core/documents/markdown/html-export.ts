// Reduce the HTML adapter's containers to the semantic nodes understood by document writers.
import type { Nodes, PhrasingContent, Root } from "mdast";
import { adaptHtml, type HtmlPresentation } from "./html-adapter.ts";

/** A container's scoped font styles apply to its paragraphs, headings and table cells. */
function inherit(node: Nodes, p?: HtmlPresentation): Nodes {
  if (!p || ![p.bold, p.italic, p.underline, p.strike, p.code, p.mark].some((v) => v !== undefined)) return node;
  if (node.type === "paragraph" || node.type === "heading" || node.type === "tableCell")
    return { ...node, children: [{ type: "htmlInline", data: { html: p }, children: node.children }] };
  return "children" in node ? ({ ...node, children: node.children.map((n) => inherit(n, p)) } as Nodes) : node;
}

export function exportHtml(tree: Root): Root {
  const walk = (node: Nodes): Nodes[] => {
    if (node.type === "htmlDetails") {
      return [
        {
          type: "paragraph",
          children: node.summary.flatMap((n) => walk(n)) as PhrasingContent[],
          position: node.position,
        },
        ...node.children.flatMap((n) => walk(n)),
      ];
    }
    if (node.type === "htmlContainer") return node.children.flatMap((n) => walk(inherit(n, node.data?.html)));
    if (node.type === "htmlInline") {
      let children = node.children.flatMap((n) => walk(n)) as PhrasingContent[];
      const p = node.data?.html;
      for (const [enabled, type] of [
        [p?.strike, "delete"],
        [p?.italic, "emphasis"],
        [p?.bold, "strong"],
        [p?.mark, "highlight"],
      ] as const)
        if (enabled) children = [{ type, children, position: node.position } as PhrasingContent];
      if (p?.code) {
        const text = (ns: PhrasingContent[]): string =>
          ns
            .map((n) => ("value" in n ? String(n.value) : "children" in n ? text(n.children as PhrasingContent[]) : ""))
            .join("");
        return [{ type: "inlineCode", value: text(children), position: node.position }];
      }
      if (
        p?.underline !== undefined ||
        p?.bold === false ||
        p?.italic === false ||
        p?.strike === false ||
        node.data?.id
      )
        return [{ ...node, children }];
      return children;
    }
    return "children" in node ? [{ ...node, children: node.children.flatMap((n) => walk(n)) } as Nodes] : [node];
  };
  return walk(adaptHtml(tree))[0] as Root;
}
