import { expect } from "bun:test";
import { inflateRawSync, inflateSync } from "node:zlib";

/** A zip's files, by name: what a .docx is. */
export function unzip(bytes: Uint8Array): Map<string, Uint8Array> {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.length - 22;
  while (end >= 0 && v.getUint32(end, true) !== 0x06054b50) end--;
  expect(end).toBeGreaterThanOrEqual(0);
  const out = new Map<string, Uint8Array>();
  let p = v.getUint32(end + 16, true);
  for (let i = v.getUint16(end + 10, true); i > 0; i--) {
    expect(v.getUint32(p, true)).toBe(0x02014b50);
    const [method, size, nameLen, extra, comment, local] = [
      v.getUint16(p + 10, true),
      v.getUint32(p + 20, true),
      v.getUint16(p + 28, true),
      v.getUint16(p + 30, true),
      v.getUint16(p + 32, true),
      v.getUint32(p + 42, true),
    ];
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const data = bytes.subarray(start, start + size);
    out.set(
      new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen)),
      method === 8 ? new Uint8Array(inflateRawSync(data)) : data,
    );
    p += 46 + nameLen + extra + comment;
  }
  return out;
}
export const xml = (z: Map<string, Uint8Array>, name: string) => new TextDecoder().decode(z.get(name));
/** Why `doc` isn't well-formed XML — a tag never closed, a `<` or an `&` loose, an attribute with no value — or null. */
export function notWellFormed(doc: string): string | null {
  const body = doc
    .replace(/^<\?xml[^?]*\?>/, "")
    .replace(/<!DOCTYPE[^>]*>/i, "")
    .replace(/<!--[\s\S]*?-->/g, "");
  const stack: string[] = [];
  const token =
    /<(\/?)([A-Za-z][\w:.-]*)((?:\s+[\w:.-]+="[^"<]*")*)\s*(\/?)>|<|&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);)/g;
  for (const m of body.matchAll(token)) {
    if (m[0] === "<") return `a loose "<" at ${m.index}: ${body.slice(m.index, m.index + 60)}`;
    if (m[0] === "&") return `an entity XML doesn't know at ${m.index}: ${body.slice(m.index, m.index + 20)}`;
    if (m[1]) {
      if (stack.pop() !== m[2]) return `</${m[2]}> closes what isn't open`;
    } else if (!m[4]) stack.push(m[2]!);
  }
  return stack.length ? `<${stack.at(-1)}> never closed` : null;
}

/** A colour as a PDF writes it: `#rrggbb`'s three parts, 0 to 1. */
export const tint = (hex: string) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255).join(" ");

export interface PdfRead {
  /** Each page's text, a line a text position. */
  pages: string[];
  /** Each page's content as written: what it draws. */
  content: string[];
  /** The named destinations a link can go to. */
  dests: string[];
  links: { dest?: string; uri?: string }[];
  outline: string[];
  /** The pictures drawn on each page. */
  images: number[];
  fonts: string[];
}

/** A PDF read back: its pages' text (through each font's map of codes to Unicode), its destinations, links and outline. */
export function readPdf(bytes: Uint8Array): PdfRead {
  const raw = Buffer.from(bytes).toString("latin1");
  const objs = new Map<number, string>();
  for (const m of raw.matchAll(/(\d+) 0 obj([\s\S]*?)endobj/g)) objs.set(Number(m[1]), m[2]!);
  const stream = (n: number): string => {
    const body = objs.get(n) ?? "";
    const len = Number(/\/Length (\d+)/.exec(body)?.[1] ?? 0);
    const at = body.search(/stream\r?\n/);
    if (at < 0) return "";
    const data = Buffer.from(body.slice(body.indexOf("\n", at) + 1).slice(0, len), "latin1");
    return (body.includes("/FlateDecode") ? inflateSync(data) : data).toString("latin1");
  };
  const ref = (body: string, key: string) => Number(new RegExp(`/${key} (\\d+) 0 R`).exec(body)?.[1] ?? 0);
  const utf16 = (hex: string) => String.fromCharCode(...(hex.match(/.{4}/g) ?? []).map((h) => Number.parseInt(h, 16)));
  const unicode = new Map<number, Map<number, string> | null>();
  const cmapOf = (font: number) => {
    if (!unicode.has(font)) {
      const to = ref(objs.get(font) ?? "", "ToUnicode");
      const map = to ? new Map<number, string>() : null;
      if (to && map) {
        const s = stream(to);
        for (const m of s.matchAll(/<([\da-f]+)>\s*<([\da-f]+)>\s*\[([^\]]*)\]/gi)) {
          let code = Number.parseInt(m[1]!, 16);
          // A ligature's characters may be written apart: `<0066 0074>`, "ft".
          for (const u of m[3]!.matchAll(/<([\da-f\s]+)>/gi)) map.set(code++, utf16(u[1]!.replace(/\s/g, "")));
        }
        for (const block of s.matchAll(/beginbfchar([\s\S]*?)endbfchar/g))
          for (const m of block[1]!.matchAll(/<([\da-f]+)>\s*<([\da-f]+)>/gi))
            map.set(Number.parseInt(m[1]!, 16), utf16(m[2]!));
      }
      unicode.set(font, map);
    }
    return unicode.get(font)!;
  };
  const pagesObj = [...objs.values()].find((b) => /\/Type \/Pages\b/.test(b))!;
  const order = [.../\/Kids \[([^\]]*)\]/.exec(pagesObj)![1]!.matchAll(/(\d+) 0 R/g)].map((m) => Number(m[1]));
  const pages: string[] = [];
  const contents: string[] = [];
  const images: number[] = [];
  for (const p of order) {
    const page = objs.get(p)!;
    const res = objs.get(ref(page, "Resources")) ?? "";
    const fonts = new Map([...res.matchAll(/\/(F\d+) (\d+) 0 R/g)].map((m) => [m[1]!, Number(m[2])]));
    const content = stream(ref(page, "Contents"));
    let font = 0;
    let text = "";
    let line = Number.NaN;
    for (const m of content.matchAll(/\/(F\d+) [\d.]+ Tf|\[([^\]]*)\] TJ|1 0 0 1 [\d.-]+ ([\d.-]+) Tm\n/g)) {
      if (m[1]) font = fonts.get(m[1]) ?? 0;
      // A run set further on the same line goes on with it; one lower starts a new line.
      else if (m[3] !== undefined) {
        if (Math.abs(Number(m[3]) - line) > 0.5 && text && !text.endsWith("\n")) text += "\n";
        line = Number(m[3]);
      } else if (m[2] !== undefined) {
        const map = cmapOf(font);
        for (const h of m[2].matchAll(/<([\da-f]*)>/gi)) {
          const codes = map
            ? (h[1]!.match(/.{4}/g) ?? []).map((c) => Number.parseInt(c, 16))
            : (h[1]!.match(/.{2}/g) ?? []).map((c) => Number.parseInt(c, 16));
          text += codes.map((c) => (map ? (map.get(c) ?? "?") : String.fromCharCode(c))).join("");
        }
      }
    }
    pages.push(text.trim());
    contents.push(content);
    images.push((content.match(/\/I\d+ Do/g) ?? []).length);
  }
  const str = (s: string) => s.replace(/\\([()\\])/g, "$1");
  // A named destination: `(name) [page /XYZ x y zoom]`; a link to one, `/S /GoTo /D (name)`.
  const dests = [...raw.matchAll(/\(((?:[^()\\]|\\.)*)\) \[\d+ 0 R \/XYZ/g)].map((m) => str(m[1]!));
  const links = [...objs.values()]
    .filter((b) => /\/Subtype \/Link/.test(b))
    .map((annot) => {
      // Its action an object of its own.
      const b = objs.get(ref(annot, "A")) ?? annot;
      const dest = /\/D \(((?:[^()\\]|\\.)*)\)/.exec(b)?.[1];
      const uri = /\/URI \(((?:[^()\\]|\\.)*)\)/.exec(b)?.[1];
      return { ...(dest !== undefined ? { dest: str(dest) } : {}), ...(uri !== undefined ? { uri: str(uri) } : {}) };
    });
  const outline = [...raw.matchAll(/\/Title \(((?:[^()\\]|\\.)*)\)/g)].map((m) => str(m[1]!));
  const fontNames = [
    ...new Set([...raw.matchAll(/\/BaseFont \/([\w+-]+)/g)].map((m) => m[1]!.replace(/^[A-Z]{6}\+/, ""))),
  ];
  return { pages, content: contents, dests, links, outline, images, fonts: fontNames };
}
