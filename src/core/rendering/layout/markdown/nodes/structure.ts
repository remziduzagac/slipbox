// Node traversal policies shared by top-level and embedded note rendering.
import type { Nodes, Parents, PhrasingContent, Root } from "mdast";
import type { Ctx } from "../render-context.ts";

export function collectDefinitions(tree: Root, ctx: Ctx) {
  const walk = (n: Nodes) => {
    // The first definition of a label wins (CommonMark), not the last.
    if (n.type === "definition" && !ctx.definitions.has(n.identifier.toLowerCase()))
      ctx.definitions.set(n.identifier.toLowerCase(), n.url);
    const ch = (n as Parents).children;
    if (ch) for (const c of ch) walk(c);
  };
  walk(tree);
}

/** Line breaks, comments and whitespace-only text may separate standalone embeds or pictures. */
export function isParagraphSpacing(c: PhrasingContent): boolean {
  return c.type === "break" || c.type === "comment" || (c.type === "text" && !c.value.trim());
}
