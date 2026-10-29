// Document HTML's bounded tokenizer (HTML-D1): no I/O, browser engine or Markdown reinterpretation.
import { decodeNamedCharacterReference } from "decode-named-character-reference";
import type { Position } from "unist";
import type { Nodes } from "mdast";

export interface HtmlElement {
  tag: string;
  attrs: Record<string, string>;
  children: HtmlChild[];
  position: Position;
  start: number;
  end: number;
}
export type HtmlChild = HtmlElement | { text: string; position: Position } | { node: Nodes };
export const HTML_DEPTH = 64;
export const HTML_TOKENS = 50_000;
export const VOID_HTML = new Set("area base br col embed hr img input link meta param source track wbr".split(" "));
export const OMIT_HTML = new Set(
  "script style iframe frame frameset object embed applet template noscript head link meta base".split(" "),
);

function htmlEntities(text: string): string {
  return text.replace(/&(#(?:[0-9]{1,7}|[xX][0-9a-fA-F]{1,6})|[a-zA-Z][a-zA-Z0-9]{0,31});/g, (raw, name: string) => {
    if (name[0] !== "#") return decodeNamedCharacterReference(name) || raw;
    const hex = /^#x/i.test(name);
    const n = Number.parseInt(name.slice(hex ? 2 : 1), hex ? 16 : 10);
    return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : "\ufffd";
  });
}

/** Split physical source lines before decoding entities, so &#10; never shifts source positions. */
export function htmlText(raw: string, position: Position): HtmlChild[] {
  const lines = raw.split("\n");
  return lines.map((part, i) => {
    const start = { line: position.start.line + i, column: i ? 1 : position.start.column };
    const text = htmlEntities(part) + (i < lines.length - 1 ? "\n" : "");
    return { text, position: { start, end: { line: start.line, column: start.column + part.length } } };
  });
}

export interface HtmlToken {
  kind: "text" | "open" | "close" | "comment";
  start: number;
  end: number;
  tag: string;
  attrs: Record<string, string>;
  selfClosing: boolean;
  position: Position;
}

/** A single forward scan: quotes protect >, malformed < is text, EOF closes a quoted tag. */
export function* htmlTokens(value: string, start = { line: 1, column: 1 }): Generator<HtmlToken> {
  let at = 0;
  let line = start.line;
  let column = start.column;
  let rawTag = "";
  const emit = (
    kind: HtmlToken["kind"],
    end: number,
    tag = "",
    attrs: Record<string, string> = {},
    selfClosing = false,
  ) => {
    const begin = { line, column };
    for (let k = at; k < end; k++) {
      if (value[k] === "\n") {
        line++;
        column = 1;
      } else column++;
    }
    const token = { kind, start: at, end, tag, attrs, selfClosing, position: { start: begin, end: { line, column } } };
    at = end;
    return token;
  };
  while (at < value.length) {
    if (rawTag) {
      const closing = new RegExp("</" + rawTag + "\\s*>", "ig");
      closing.lastIndex = at;
      const match = closing.exec(value);
      if (!match) {
        yield emit("text", value.length);
        break;
      }
      if (match.index > at) yield emit("text", match.index);
      rawTag = "";
      continue;
    }
    if (value.startsWith("<!--", at)) {
      const end = value.indexOf("-->", at + 4);
      yield emit("comment", end < 0 ? value.length : end + 3);
      continue;
    }
    const open = /^<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9:-]*)\b/.exec(value.slice(at, at + 256));
    if (!open) {
      const next = value.indexOf("<", at + 1);
      yield emit("text", next < 0 ? value.length : next);
      continue;
    }
    let end = at + open[0].length;
    let quote = "";
    for (; end < value.length; end++) {
      const ch = value[end]!;
      if (quote) {
        if (ch === quote) quote = "";
      } else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === ">") {
        end++;
        break;
      }
    }
    const attrs: Record<string, string> = Object.create(null);
    const body = value.slice(at + open[0].length, end).replace(/\/?\s*>$/, "");
    const attr = /([^\s=<>/'"]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
    for (const m of body.matchAll(attr)) {
      const key = m[1]!.toLowerCase();
      if (!(key in attrs)) attrs[key] = htmlEntities(m[2] ?? m[3] ?? m[4] ?? "");
    }
    const tag = open[2]!.toLowerCase();
    const selfClosing = /\/\s*>$/.test(value.slice(at, end));
    if (!open[1] && !selfClosing && /^(script|style)$/.test(tag)) rawTag = tag;
    yield emit(open[1] ? "close" : "open", end, tag, attrs, selfClosing);
  }
}

export function htmlFragment(value: string, start = { line: 1, column: 1 }): HtmlElement {
  const root: HtmlElement = {
    tag: "",
    attrs: {},
    children: [],
    position: { start, end: start },
    start: 0,
    end: value.length,
  };
  const stack = [root];
  let count = 0;
  for (const t of htmlTokens(value, start)) {
    const parent = stack[stack.length - 1]!;
    if (++count > HTML_TOKENS) {
      parent.children.push({ text: "[HTML content limit reached]", position: t.position });
      break;
    }
    if (t.kind === "comment") continue;
    if (t.kind === "text") {
      parent.children.push(...htmlText(value.slice(t.start, t.end), t.position));
      continue;
    }
    if (t.kind === "close") {
      let i = stack.length - 1;
      while (i > 0 && stack[i]!.tag !== t.tag) i--;
      if (i) {
        for (let k = i; k < stack.length; k++) {
          stack[k]!.end = t.end;
          stack[k]!.position.end = t.position.end;
        }
        stack.length = i;
      }
      continue;
    }
    const node: HtmlElement = {
      tag: t.tag,
      attrs: t.attrs,
      children: [],
      position: t.position,
      start: t.start,
      end: t.end,
    };
    parent.children.push(node);
    if (!VOID_HTML.has(t.tag) && !t.selfClosing && stack.length < HTML_DEPTH) stack.push(node);
  }
  const tokensEnd = value.split("\n");
  root.position.end = {
    line: start.line + tokensEnd.length - 1,
    column: tokensEnd.length > 1 ? tokensEnd.at(-1)!.length + 1 : start.column + value.length,
  };
  for (const node of stack) {
    node.end = value.length;
    node.position.end = root.position.end;
  }
  return root;
}

/** Preserve every original character except the ranges belonging to omitted non-document content. */
export interface HtmlOmission {
  tag?: string;
  depth?: number;
}
export function htmlForMarkdown(value: string, state: HtmlOmission = {}): string {
  let kept = "";
  let at = 0;
  for (const t of htmlTokens(value)) {
    if (state.tag) {
      if (t.kind === "open" && t.tag === state.tag && !t.selfClosing && !VOID_HTML.has(t.tag))
        state.depth = (state.depth ?? 1) + 1;
      if (t.kind === "close" && t.tag === state.tag) {
        state.depth = (state.depth ?? 1) - 1;
        if (state.depth === 0) {
          at = t.end;
          state.tag = undefined;
        }
      }
      continue;
    }
    if (t.kind === "open" && OMIT_HTML.has(t.tag)) {
      kept += value.slice(at, t.start);
      at = t.end;
      if (!VOID_HTML.has(t.tag) && !t.selfClosing) {
        state.tag = t.tag;
        state.depth = 1;
      }
    }
  }
  return kept + (state.tag ? "" : value.slice(at));
}
