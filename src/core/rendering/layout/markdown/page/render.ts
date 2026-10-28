// One note render owns its context and block-cache placement; mechanisms stay below this composer.
import { adaptHtml } from "../../../../documents/markdown/html-adapter.ts";
import type { Root, RootContent } from "mdast";
import { ORIGIN, parseMarkdown, type Frontmatter } from "../../../../documents/markdown/parse.ts";
import type { Layout, Line } from "../../ir.ts";
import { type Ctx, TEXT, srcOf } from "../render-context.ts";
import type { RenderOptions, RenderCache } from "../contracts.ts";
import { blocks, block } from "../blocks/dispatch.ts";
import { placed, finish } from "../rows/finish.ts";
import { joined, gapAfter } from "../rows/spacing.ts";
import { collectDefinitions } from "../nodes/structure.ts";

export function renderMarkdown(source: string, opts: RenderOptions): Layout {
  const parsed = parseMarkdown(source);
  return renderTree(parsed.tree, opts, parsed.frontmatter);
}

export function newRenderCache(): RenderCache {
  return { key: "", blocks: new WeakMap() };
}

export function renderTree(
  tree: Root,
  opts: RenderOptions,
  frontmatter?: Frontmatter | null,
  cache?: RenderCache,
): Layout {
  tree = adaptHtml(tree, opts.htmlTheme);
  const ctx: Ctx = {
    opts,
    links: [],
    headings: [],
    definitions: new Map(),
    nesting: 0,
    embedChain: opts.embedFrom ? [opts.embedFrom] : [],
    embedded: new Set(),
    pending: new Set(),
    asks: { picture: false },
  };
  collectDefinitions(tree, ctx);
  const width = Math.max(8, opts.width);
  if (!cache) return finish(blocks(tree.children, ctx, width, TEXT, frontmatter), ctx, width);
  const key =
    (opts.htmlTheme ?? "") +
    "|" +
    JSON.stringify([...(opts.htmlDetails ?? [])]) +
    "|" +
    `${width}|${opts.glyphs.mode}|${opts.showUrls ? 1 : 0}|${opts.codeScroll ? 1 : 0}|${opts.caption ?? "bottom"}|${[...ctx.definitions].join("\u0001")}`;
  if (cache.key !== key) {
    cache.key = key;
    cache.blocks = new WeakMap();
  }
  const out: Line[] = [];
  let prev: RootContent | undefined;
  for (const node of tree.children) {
    const origin = (node as unknown as Record<symbol, object | undefined>)[ORIGIN];
    let hit = origin ? cache.blocks.get(origin) : undefined;
    // One whose pictures were sized for another window, or other pictures at their own size (PIC): laid out again.
    if (hit?.pictures !== undefined && hit.pictures !== (opts.pictureKey ?? "")) hit = undefined;
    if (hit?.pictures !== undefined) ctx.asks.picture = true;
    if (!hit) {
      // Rendered on its own: its links and headings numbered from 0, renumbered when placed.
      const own: Ctx = {
        ...ctx,
        links: [],
        headings: [],
        embedded: new Set(),
        pending: new Set(),
        asks: { picture: false },
      };
      const rows = block(node, own, width, TEXT, frontmatter);
      if (rows === null) continue;
      hit = { lines: rows, links: own.links, headings: own.headings, src: srcOf(node) };
      if (own.asks.picture) {
        hit.pictures = opts.pictureKey ?? "";
        ctx.asks.picture = true;
      }
      // A block with an embed draws another note, which changes on its own: never kept (1.11).
      for (const p of own.embedded) ctx.embedded.add(p);
      // One drawn while what it needs loads (a diagram as its code): never kept either.
      for (const p of own.pending) ctx.pending.add(p);
      if (origin && !own.embedded.size && !own.pending.size) cache.blocks.set(origin, hit);
    }
    const delta = srcOf(node) - hit.src;
    const linkBase = ctx.links.length;
    const headBase = ctx.headings.length;
    for (const l of hit.links) ctx.links.push({ ...l, src: l.src + delta });
    for (const h of hit.headings) ctx.headings.push({ ...h, src: h.src + delta });
    if (out.length && !joined(prev, node)) out.push(gapAfter(out, srcOf(node)));
    prev = node;
    // Copies: `finish` edits spans in place, and the cached rows serve the next render too.
    for (const line of hit.lines) out.push(placed(line, delta, linkBase, headBase));
  }
  return finish(out, ctx, width);
}
