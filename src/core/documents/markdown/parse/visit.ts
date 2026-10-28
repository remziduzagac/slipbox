// Depth-first node traversal shared below parser composition.

import type { Nodes } from "mdast";

/** Depth-first visit of every node; return false from `fn` to skip a node's children. */
export function visit(
  node: Nodes,
  // biome-ignore lint/suspicious/noConfusingVoidType: a visitor that returns nothing goes on; `false` stops it
  fn: (node: Nodes, parent: Nodes | null) => boolean | void,
  parent: Nodes | null = null,
): void {
  if (fn(node, parent) === false) return;
  const children = (node as { children?: Nodes[] }).children;
  if (children) for (const child of children) visit(child, fn, node);
}
