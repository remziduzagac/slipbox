// HTML's shared semantic adapter (HTML-D1–HTML-D5), retaining original source ranges.
import type { Nodes, Root, RootContent, PhrasingContent, Parent, Data, Image } from "mdast";
import {
  htmlFragment,
  htmlTokens,
  htmlText,
  OMIT_HTML,
  HTML_DEPTH,
  HTML_TOKENS,
  type HtmlChild,
  type HtmlElement,
} from "./html.ts";

export type HtmlAlign = "left" | "center" | "right";
export interface HtmlLength {
  value: number;
  unit: "px" | "%";
}
export interface HtmlPresentation {
  align?: HtmlAlign;
  width?: HtmlLength;
  height?: HtmlLength;
  maxWidth?: HtmlLength;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  pre?: boolean;
  code?: boolean;
  mark?: boolean;
}
export interface HtmlInline extends Parent {
  type: "htmlInline";
  children: PhrasingContent[];
}
export interface HtmlContainer extends Parent {
  type: "htmlContainer";
  children: RootContent[];
}
export interface HtmlDetails extends Parent {
  type: "htmlDetails";
  children: RootContent[];
  summary: PhrasingContent[];
  open: boolean;
}
declare module "mdast" {
  interface PhrasingContentMap {
    htmlInline: HtmlInline;
  }
  interface RootContentMap {
    htmlInline: HtmlInline;
    htmlContainer: HtmlContainer;
    htmlDetails: HtmlDetails;
  }
  interface Data {
    html?: HtmlPresentation;
    id?: string;
  }
}

export function htmlLength(value: string | undefined, percent = true): HtmlLength | undefined {
  const match = /^([1-9][0-9]{0,8})(px|%)?$/.exec(value?.trim() ?? "");
  if (!match) return;
  const n = Number(match[1]);
  if (match[2] === "%" && (!percent || n > 100)) return;
  return { value: n, unit: match[2] === "%" ? "%" : "px" };
}
export function htmlPresentation(node: HtmlElement): HtmlPresentation {
  const a = node.attrs;
  const s: HtmlPresentation = {};
  const align = (v: string | undefined) => (/^(left|center|right)$/.test(v ?? "") ? (v as HtmlAlign) : undefined);
  s.align = align(a.align?.toLowerCase());
  s.width = htmlLength(a.width);
  s.height = htmlLength(a.height, false);
  s.bold = /^(strong|b)$/.test(node.tag) ? true : undefined;
  s.italic = /^(em|i)$/.test(node.tag) ? true : undefined;
  s.underline = /^(u|ins)$/.test(node.tag) ? true : undefined;
  s.strike = /^(s|del)$/.test(node.tag) ? true : undefined;
  s.code = /^(code|kbd|samp)$/.test(node.tag) ? true : undefined;
  s.mark = node.tag === "mark" ? true : undefined;
  s.pre = node.tag === "pre" ? true : undefined;
  for (const part of (a.style ?? "").split(";")) {
    const colon = part.indexOf(":");
    if (colon < 0) continue;
    const key = part.slice(0, colon).trim().toLowerCase();
    const value = part
      .slice(colon + 1)
      .trim()
      .toLowerCase();
    if (key === "text-align") s.align = align(value) ?? s.align;
    if (key === "width") s.width = htmlLength(value) ?? s.width;
    if (key === "height") s.height = htmlLength(value, false) ?? s.height;
    if (key === "max-width") s.maxWidth = htmlLength(value) ?? s.maxWidth;
    if (key === "font-weight" && /^(normal|bold)$/.test(value)) s.bold = value === "bold";
    if (key === "font-style" && /^(normal|italic)$/.test(value)) s.italic = value === "italic";
    if (
      key === "text-decoration" &&
      /^(none|underline|line-through|underline line-through|line-through underline)$/.test(value)
    ) {
      s.underline = value.includes("underline");
      s.strike = value.includes("line-through");
    }
    if (key === "white-space" && value === "pre") s.pre = true;
  }
  return s;
}

/** HTML links cannot turn document attributes into executable actions or data fetches. */
export function htmlUrl(value: string): string | null {
  const v = value.trim();
  if (/[\u0000-\u001f\u007f]/.test(v)) return null;
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(v)?.[1]?.toLowerCase();
  return !scheme || /^(https?|mailto|file)$/.test(scheme) ? v : null;
}

const BLOCK = /^(p|div|section|article|header|footer|main|aside|nav|h[1-6]|pre|hr|details|ul|ol|li|blockquote|table)$/;
function metadata(n: HtmlElement): Data {
  return {
    html: htmlPresentation(n),
    ...((n.attrs.id ?? (n.tag === "a" ? n.attrs.name : undefined)) ? { id: n.attrs.id ?? n.attrs.name } : {}),
  };
}
function literal(children: HtmlChild[]): string {
  return children
    .map((c) =>
      "text" in c
        ? c.text
        : "node" in c
          ? "value" in c.node
            ? String(c.node.value)
            : ""
          : OMIT_HTML.has(c.tag)
            ? ""
            : literal(c.children),
    )
    .join("");
}
function phrasing(children: HtmlChild[], theme?: "light" | "dark", pre = false): PhrasingContent[] {
  const out: PhrasingContent[] = [];
  for (const c of children) {
    if ("node" in c) {
      out.push(c.node as PhrasingContent);
      continue;
    }
    if ("text" in c) {
      out.push({ type: "text", value: pre ? c.text : c.text.replace(/[\t\n\r ]+/g, " "), position: c.position });
      continue;
    }
    if (OMIT_HTML.has(c.tag) || c.tag === "source") continue;
    const data = metadata(c);
    const position = c.position;
    if (c.tag === "br") out.push({ type: "break", position });
    else if (c.tag === "img") {
      const url = htmlUrl(c.attrs.src ?? "");
      out.push({ type: "image", url: url ?? "", alt: c.attrs.alt ?? "image", data, position });
    } else if (c.tag === "picture") {
      const img = c.children.find((n): n is HtmlElement => "tag" in n && n.tag === "img");
      if (!img) {
        out.push(
          ...phrasing(
            c.children.filter((n) => !("tag" in n && n.tag === "source")),
            theme,
          ),
        );
        continue;
      }
      const sources = c.children.filter((n): n is HtmlElement => "tag" in n && n.tag === "source");
      const chosen = theme
        ? sources.find((n) => {
            const s = n.attrs;
            return (
              new RegExp("^\\(\\s*prefers-color-scheme\\s*:\\s*" + theme + "\\s*\\)$", "i").test(
                (s.media ?? "").trim(),
              ) &&
              (!s.type || /^image\/(png|jpeg|gif|webp|avif|svg\+xml|bmp|x-icon|tiff|heic)$/i.test(s.type)) &&
              !!s.srcset &&
              !/[\s,]/.test(s.srcset.trim()) &&
              htmlUrl(s.srcset) !== null
            );
          })
        : undefined;
      out.push(
        ...phrasing(
          [{ ...img, attrs: { ...img.attrs, ...(chosen ? { src: chosen.attrs.srcset!.trim() } : {}) } }],
          theme,
        ),
      );
    } else if (c.tag === "a" && c.attrs.href !== undefined && htmlUrl(c.attrs.href) !== null) {
      out.push({
        type: "link",
        url: htmlUrl(c.attrs.href)!,
        children: [
          {
            type: "htmlInline",
            children: phrasing(c.children, theme, pre || data.html?.pre),
            data: { html: data.html },
          },
        ],
        position,
        data,
      });
    } else
      out.push({ type: "htmlInline", children: phrasing(c.children, theme, pre || data.html?.pre), data, position });
  }
  return out;
}
function content(children: HtmlChild[], theme?: "light" | "dark"): RootContent[] {
  const out: RootContent[] = [];
  let run: HtmlChild[] = [];
  const flush = () => {
    const first = run[0];
    const children = phrasing(run, theme);
    if (first && children.some((c) => c.type !== "text" || c.value.trim())) {
      const only = children.filter((c) => !(c.type === "text" && !c.value.trim()));
      const align = only.length === 1 ? only[0]!.data?.html?.align : undefined;
      out.push({
        type: "paragraph",
        children,
        position: "node" in first ? first.node.position : first.position,
        ...(align ? { data: { html: { align } } } : {}),
      });
    }
    run = [];
  };
  for (const c of children) {
    if (
      "node" in c &&
      !/^(text|break|strong|emphasis|delete|link|image|inlineCode|inlineMath|htmlInline|highlight|comment|wikiLink|hashtag|footnoteReference)$/.test(
        c.node.type,
      )
    ) {
      flush();
      out.push(c.node as RootContent);
      continue;
    }
    if (!("tag" in c) || !BLOCK.test(c.tag)) {
      run.push(c);
      continue;
    }
    flush();
    if (OMIT_HTML.has(c.tag)) continue;
    const position = c.position;
    const data = metadata(c);
    if (/^h[1-6]$/.test(c.tag))
      out.push({
        type: "heading",
        depth: Number(c.tag[1]) as 1,
        children: [
          { type: "htmlInline", children: phrasing(c.children, theme, data.html?.pre), data: { html: data.html } },
        ],
        position,
        data,
      });
    else if (c.tag === "hr") out.push({ type: "thematicBreak", position });
    else if (c.tag === "pre" || data.html?.pre) out.push({ type: "code", value: literal(c.children), position, data });
    else if (c.tag === "details") {
      const summary = c.children.find((n): n is HtmlElement => "tag" in n && n.tag === "summary");
      out.push({
        type: "htmlDetails",
        summary:
          summary && literal(summary.children).trim()
            ? [{ type: "htmlInline", children: phrasing(summary.children, theme), data: metadata(summary) }]
            : [{ type: "text", value: "Details" }],
        children: content(
          c.children.filter((n) => n !== summary),
          theme,
        ),
        open: "open" in c.attrs,
        position,
        data,
      });
    } else out.push({ type: "htmlContainer", children: content(c.children, theme), position, data });
  }
  flush();
  return out;
}

/** Inline HTML can enclose existing Markdown nodes, but HTML block children are always literal text. */
function mixed(nodes: Nodes[]): HtmlElement {
  const root: HtmlElement = {
    tag: "",
    attrs: {},
    children: [],
    position: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
    start: 0,
    end: 0,
  };
  const stack = [root];
  let count = 0;
  const voids = /^(br|hr|img|source|wbr|input|meta|link|base|embed)$/;
  for (const node of nodes) {
    if (node.type !== "html") {
      stack.at(-1)!.children.push({ node });
      continue;
    }
    for (const t of htmlTokens(node.value, node.position?.start)) {
      if (++count > HTML_TOKENS) {
        stack.at(-1)!.children.push({ text: "[HTML content limit reached]", position: t.position });
        const end = nodes.at(-1)?.position?.end;
        if (end) for (const open of stack) open.position.end = end;
        return root;
      }
      if (t.kind === "comment") continue;
      if (t.kind === "text") {
        stack.at(-1)!.children.push(...htmlText(node.value.slice(t.start, t.end), t.position));
        continue;
      }
      if (t.kind === "close") {
        let at = stack.length - 1;
        while (at && stack[at]!.tag !== t.tag) at--;
        if (at) {
          for (let k = at; k < stack.length; k++) stack[k]!.position.end = t.position.end;
          stack.length = at;
        }
      } else {
        const c: HtmlElement = {
          tag: t.tag,
          attrs: t.attrs,
          children: [],
          position: t.position,
          start: t.start,
          end: t.end,
        };
        stack.at(-1)!.children.push(c);
        if (!voids.test(t.tag) && !t.selfClosing && stack.length < HTML_DEPTH) stack.push(c);
      }
    }
  }
  const end = nodes.at(-1)?.position?.end;
  if (end) for (const open of stack) open.position.end = end;
  return root;
}

const adaptedTrees = new WeakMap<Root, Map<string, Root>>();
export function adaptHtml(tree: Root, theme?: "light" | "dark"): Root {
  const key = theme ?? "";
  const saved = adaptedTrees.get(tree)?.get(key);
  if (saved) return saved;
  const pending: Nodes[] = [tree];
  let hasHtml = false;
  while (pending.length) {
    const n = pending.pop()!;
    if (n.type === "html") {
      hasHtml = true;
      break;
    }
    if ("children" in n) for (const child of n.children) pending.push(child);
  }
  if (!hasHtml) {
    let variants = adaptedTrees.get(tree);
    if (!variants) {
      variants = new Map();
      adaptedTrees.set(tree, variants);
    }
    variants.set(key, tree);
    return tree;
  }
  const visit = (node: Nodes, depth: number): Nodes[] => {
    if (depth > HTML_DEPTH) return [];
    if (node.type === "html") return content(htmlFragment(node.value, node.position?.start).children, theme);
    if (!("children" in node)) return [node];
    const inline = /^(paragraph|heading|tableCell|strong|emphasis|delete|link|highlight)$/.test(node.type);
    let children = node.children.flatMap((n) => (n.type === "html" ? [n] : visit(n, depth + 1)));
    if (children.some((n) => n.type === "html")) {
      const fragment = mixed(children);
      children = inline ? phrasing(fragment.children, theme) : content(fragment.children, theme);
    }
    return [{ ...node, children } as Nodes];
  };
  const result = visit(tree, 0)[0] as Root;
  let variants = adaptedTrees.get(tree);
  if (!variants) {
    variants = new Map();
    adaptedTrees.set(tree, variants);
  }
  variants.set(key, result);
  return result;
}

/** Images alone inside a link use the normal picture pipeline while keeping that link as their action. */
export function htmlLinkedImage(node: PhrasingContent): Image | null {
  if (node.type === "image") return node;
  if (node.type !== "link" && node.type !== "htmlInline") return null;
  const meaningful = node.children.filter((n) => !(n.type === "text" && !n.value.trim()));
  if (meaningful.length !== 1) return null;
  const img = htmlLinkedImage(meaningful[0]!);
  if (!img || (node.type === "link" && !node.data?.html && !img.data?.html)) return null;
  return img;
}
