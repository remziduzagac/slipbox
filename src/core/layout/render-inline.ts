// Inlines (2.2): a paragraph's text, emphasis, code, maths, links, wikilinks, tags, footnote marks and pictures as
// spans, each link numbered in the layout; a soft break as the script written there reads one.

import type { Parents, PhrasingContent } from "mdast";
import { mathText } from "../math.ts";
import { expandTabs, sanitize } from "../sanitize.ts";
import type { Role } from "../theme/theme.ts";
import { graphemes, graphemeWidth } from "../width.ts";
import type { Hashtag } from "../tags.ts";
import type { WikiLink } from "../wikilink.ts";
import { A_BOLD, A_ITALIC, A_STRIKE, type Span } from "./ir.ts";
import { type Ctx, type Style, status, addLink, textOf } from "./render-context.ts";

/** A URL that names a note: an image-syntax link to it embeds it. */
export const NOTE_URL = /\.(md|markdown)$/i;

/** A picture's file, embedded by name (`![[dal.png]]`), and the size Obsidian lets it carry. */
export const IMAGE_FILE = /\.(png|jpe?g|gif|webp|avif|svg|bmp|ico|tiff?|heic)$/i;

export const SIZE = /^(\d+)(?:x(\d+))?$/;

/** A wide character of a script written without spaces between words (Han, kana; not Hangul or emoji). */
function joinsWithoutSpace(g: string): boolean {
  return !!g && graphemeWidth(g) === 2 && !/[\p{Script=Hangul}\p{Extended_Pictographic}]/u.test(g);
}

const DROP_TAGS =
  /^<\/?(?:kbd|sup|sub|b|i|u|em|strong|mark|span|small|abbr|ins|del|s|q|cite|code|samp|var|a)\b[^>]*>$/i;

/** What closes a sentence or a bracket: no space before it, where a comment was. */
const CLOSING = /^[.,;:!?)\]}…]/;

export function inline(nodes: PhrasingContent[], ctx: Ctx, style: Style, src: number): Span[] {
  const out: Span[] = [];
  let line = src;
  /** An Obsidian comment just left out (DF-D17): the white space after it goes where there's some before it. */
  let squeeze = false;
  const push = (text: string, st: Style, extra: Partial<Span> = {}) => {
    if (!text) return;
    squeeze = false;
    out.push({ text, role: st.role, attrs: st.attrs, src: line, ...extra });
  };
  const text = (value: string, st: Style, extra: Partial<Span> = {}) => {
    // Soft line breaks become spaces; each one advances the source line.
    // A tab in prose or a table cell is whitespace; the width function gives it no columns.
    let v = sanitize(value).replace(/\t/g, " ");
    const before = out[out.length - 1];
    if (squeeze && (!before || /\s$/.test(before.text))) {
      const lead = /^\s*/.exec(v)![0];
      line += lead.split("\n").length - 1;
      v = v.slice(lead.length);
      // `oil %%a note%%.`: the space before it goes too, where what follows closes the sentence.
      if (before && CLOSING.test(v)) {
        before.text = before.text.replace(/\s+$/, "");
        if (!before.text) out.pop();
      }
    }
    const parts = v.split("\n");
    parts.forEach((p, i) => {
      if (i > 0) {
        line++;
        // Between two Chinese or Japanese characters a soft break is no space at all, as those
        // scripts write; Korean spaces its words, and emoji are words of their own.
        const before = graphemes(parts[i - 1]!).at(-1) ?? "";
        const after = graphemes(p)[0] ?? "";
        if (!(joinsWithoutSpace(before) && joinsWithoutSpace(after))) push(" ", st, extra);
      }
      push(p, st, extra);
    });
  };
  const walk = (ns: PhrasingContent[], st: Style, extra: Partial<Span> = {}) => {
    for (const n of ns) {
      if (n.position) line = n.position.start.line;
      switch (n.type) {
        case "text":
          text(n.value, st, extra);
          break;
        case "strong":
          walk(
            n.children,
            { role: st.role === "text" || st.role === "quote" ? "strong" : st.role, attrs: st.attrs | A_BOLD },
            extra,
          );
          break;
        case "emphasis":
          walk(n.children, { role: st.role === "text" ? "emphasis" : st.role, attrs: st.attrs | A_ITALIC }, extra);
          break;
        case "delete":
          walk(n.children, { role: st.role === "text" ? "strike" : st.role, attrs: st.attrs | A_STRIKE }, extra);
          break;
        case "highlight":
          // Obsidian's `==highlight==` (DF-D17): on its own background, what's inside it (a link, code) too.
          walk(n.children, { role: "highlight", attrs: st.attrs }, { ...extra, bg: "highlight" });
          break;
        case "comment":
          // Obsidian's `%%comment%%`: hidden while reading (source mode and the lens show the text as typed).
          squeeze = true;
          break;
        case "inlineCode":
          push(expandTabs(sanitize(n.value).replace(/\n/g, " "), 2), { role: "code_inline", attrs: 0 }, extra);
          break;
        case "inlineMath":
          // Maths as Unicode text (12.11); one that can't be, as written.
          push(
            sanitize(mathText(n.value) ?? `$${n.value}$`).replace(/\n/g, " "),
            { role: "math", attrs: st.attrs },
            extra,
          );
          break;
        case "break":
          push("\n", st);
          break;
        case "link":
          linkNode(n.url, n.children, st, n.position?.start.line ?? line, extra);
          break;
        case "linkReference": {
          const url = ctx.definitions.get(n.identifier.toLowerCase());
          if (url !== undefined) linkNode(url, n.children, st, line, extra);
          else walk(n.children, st, extra);
          break;
        }
        case "image":
        case "imageReference": {
          const url = n.type === "image" ? n.url : (ctx.definitions.get(n.identifier.toLowerCase()) ?? "");
          const alt = n.alt || url.split("/").pop() || "image";
          // Inside a link (a badge: [![alt](img)](url)) the image is that link's text: it follows
          // the link, not the image.
          const id =
            extra.link ??
            addLink(ctx, {
              kind: "image",
              target: url,
              heading: null,
              text: alt,
              status: status(ctx, "image", url),
              src: line,
            });
          // A note's (`![x](note.md)`, 20.1) where it isn't drawn in place — beside other text, or not
          // there — is a reference to an embed, as `![[note]]`'s was; a picture's is a picture's.
          const note = NOTE_URL.test(url.split("#")[0]!);
          push(
            `${note ? ctx.opts.glyphs.embed : ctx.opts.glyphs.image} ${sanitize(alt)}`,
            { role: note ? "embed" : "image", attrs: 0 },
            { link: id },
          );
          if (ctx.opts.showUrls && url) push(` <${sanitize(url)}>`, { role: "url", attrs: 0 });
          break;
        }
        case "footnoteReference": {
          const id = addLink(ctx, {
            kind: "footnote",
            target: n.identifier,
            heading: null,
            text: n.identifier,
            status: "resolved",
            src: line,
          });
          push(`[${sanitize(n.label ?? n.identifier)}]`, { role: "footnote", attrs: 0 }, { link: id });
          break;
        }
        case "html": {
          const v = n.value.trim();
          if (/^<br\s*\/?>$/i.test(v)) push("\n", st);
          else if (/^<!--[\s\S]*-->$/.test(v) || DROP_TAGS.test(v)) break;
          else push(sanitize(n.value), { role: "html", attrs: 0 }, extra);
          break;
        }
        default:
          if ((n.type as string) === "wikiLink") wiki(n as unknown as WikiLink, st, extra);
          else if ((n.type as string) === "hashtag") {
            // A tag (1.6): followed, the notes that carry it.
            const name = (n as unknown as Hashtag).value;
            const id = addLink(ctx, {
              kind: "tag",
              target: name,
              heading: null,
              text: `#${name}`,
              status: "resolved",
              src: line,
            });
            push(`#${sanitize(name)}`, { role: "tag", attrs: st.attrs }, { link: id });
          } else if ("children" in n) walk((n as unknown as Parents).children as PhrasingContent[], st, extra);
          else if ("value" in n) text(String((n as { value: unknown }).value), st, extra);
      }
    }
  };
  const linkNode = (url: string, children: PhrasingContent[], st: Style, at: number, around: Partial<Span> = {}) => {
    const visible = textOf({ type: "paragraph", children });
    const s = status(ctx, "markdown", url);
    const id = addLink(ctx, { kind: "markdown", target: url, heading: null, text: visible || url, status: s, src: at });
    const role: Role = s === "unresolved" ? "link_unresolved" : "link";
    // What the file says (21.9): its text, or, a link without text of its own, its target as written —
    // no form made up for the screen.
    // On a highlight's background, inside one.
    const bg = around.bg ? { bg: around.bg } : {};
    if (children.length) walk(children, { role, attrs: st.attrs }, { ...bg, link: id });
    else push(sanitize(url), { role, attrs: st.attrs }, { ...bg, link: id });
    const external = /^[a-z][a-z0-9+.-]*:/i.test(url);
    // The URL after the text, unless the text already is it (www. autolinks, empty link text).
    const same = url === visible || ["mailto:", "http://", "https://"].some((scheme) => url === `${scheme}${visible}`);
    if (ctx.opts.showUrls && external && children.length && !same) {
      push(` <${sanitize(url)}>`, { role: "url", attrs: 0 });
    }
  };
  const wiki = (w: WikiLink, st: Style, around: Partial<Span> = {}) => {
    const kind = w.embed ? "embed" : "wiki";
    const s = status(ctx, kind, w.target);
    // A picture embedded by name, as Obsidian writes one: `|300` and `|240x180` its size, not words.
    const picture = w.embed && IMAGE_FILE.test(w.target);
    const alias = picture && w.alias && SIZE.test(w.alias.trim()) ? null : w.alias;
    const shown =
      alias ??
      (picture ? w.target.split("/").pop()! : null) ??
      (!w.target
        ? w.heading
          ? `#${w.heading}`
          : w.block
            ? `^${w.block}`
            : w.value
        : w.heading
          ? `${w.target} › ${w.heading}`
          : w.block
            ? `${w.target} ^${w.block}`
            : w.target);
    // A block's `^id` rides as the heading does (`#^id`): followed, it lands on its block.
    const id = addLink(ctx, {
      kind,
      target: w.target,
      heading: w.heading ?? (w.block ? `^${w.block}` : null),
      text: shown,
      status: s,
      src: line,
    });
    const role: Role = picture
      ? "image"
      : w.embed
        ? "embed"
        : s === "unresolved"
          ? "link_unresolved"
          : s === "ambiguous"
            ? "link_ambiguous"
            : "wikilink";
    const prefix = picture ? `${ctx.opts.glyphs.image} ` : w.embed ? `${ctx.opts.glyphs.embed} ` : "";
    push(prefix + sanitize(shown), { role, attrs: st.attrs }, { ...(around.bg ? { bg: around.bg } : {}), link: id });
  };
  walk(nodes, style);
  return out;
}
