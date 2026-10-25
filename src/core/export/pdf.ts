// Export as PDF (plan 10.5): set on A4 with pdfkit (MIT), in fonts found on the machine (`fonts.ts`) and embedded, a
// character a font hasn't got taken from another that has. Lines are laid out here (10.11), not by pdfkit: words and
// pictures in a line together — a picture in a sentence, maths typeset on the baseline, an emoji in a font that has
// it — broken where Unicode lets a line break (linebreak, MIT), each run set on a common baseline. A chapter a note,
// each from a new page, its notes at its end; headings as the PDF's outline, each a destination the document's links
// go to; pictures at their size up to the text's width; code on a tint, coloured; tables drawn, their header again on a
// new page; quotes behind a bar, a callout's in its colour; the page's number at its foot.

import type { ExportSink } from "./spool.ts";
import type { Font } from "fontkit";
import LineBreaker from "linebreak";
import type { Blockquote, Heading, List, PhrasingContent, RootContent, Table } from "mdast";
import type { Math as MathNode } from "mdast-util-math";
import PDFDocument from "pdfkit";
import { highlight } from "../layout/highlight.ts";
import { mathRows, mathText } from "../math.ts";
import { loadRasterizer, type Rasterizer } from "../svg.ts";
import type { ExportChapter, ExportDoc, ExportPicture } from "./assemble.ts";
import { convertPictures } from "./convert.ts";
import { type Face, findFonts, type Fonts, openFace } from "./fonts.ts";
import { mathSize, rasterOf } from "./images.ts";
import { calloutColour, PRINT, SYNTAX, TINT } from "./style.ts";

const MARGIN = { top: 64, bottom: 72, left: 64, right: 64 };
const BODY = 10.5;
const CODE = 9;
const HEADING = [20, 16, 13.5, 12, 10.5, 10.5];
/** A CSS pixel, in points. */
const PX = 0.75;
/** The space after a paragraph: loose, and in a tight list. */
const GAP = 6;
const TIGHT = 2;
/** MathJax's `ex`, as a share of the text's size. */
const EX = 0.44;

interface Style {
  underline?: boolean;
  bold?: boolean;
  italic?: boolean;
  mono?: boolean;
  strike?: boolean;
  /** Inline code: on a tint. */
  tint?: boolean;
  /** Obsidian's `==highlight==`: on a marker's yellow. */
  mark?: boolean;
  color?: string;
  size?: number;
  link?: string;
  goTo?: string;
}
interface Run extends Style {
  text: string;
}
/** A picture in a line: maths sits on the baseline as MathJax set it, anything else stands on it. */
interface InlinePicture extends Style {
  picture: ExportPicture;
  alt: string;
  math?: boolean;
}
type Inline = Run | InlinePicture;

/** Where blocks go: from `x`, `width` wide; their text's colour, the space after a paragraph, how deep in lists. */
interface Box {
  x: number;
  width: number;
  color?: string;
  gap?: number;
  depth?: number;
}

/** What a line is made of: text in one font and style, or a picture; each as wide as it's drawn. */
type Atom =
  | (Style & {
      kind: "text";
      text: string;
      font: string;
      width: number;
      ascent: number;
      descent: number;
      space: boolean;
    })
  | (Style & { kind: "picture"; data: Buffer; width: number; height: number; drop: number; alt: string });

interface Line {
  atoms: Atom[];
  /** Its width without the spaces it ends with. */
  width: number;
  ascent: number;
  descent: number;
}

/** The document as a PDF's bytes. */
export async function toPdf(doc: ExportDoc, fonts: Fonts = findFonts(), sink?: ExportSink): Promise<Uint8Array> {
  const r = await loadRasterizer();
  // A PDF holds PNG and JPEG: a GIF, a BMP, a WebP made a PNG first.
  await convertPictures(doc, ["png", "jpg"], r);
  return new PdfWriter(doc, fonts, r, !!sink).write(sink);
}

/** The PDF a document is written into: A4, its pages kept until the end (for their numbers), its title and author. */
export function pdfDocument(doc: ExportDoc, bufferPages = true): PDFKit.PDFDocument {
  return new PDFDocument({
    size: "A4",
    margins: MARGIN,
    // No default font loaded (Helvetica, which a compiled slipbox hasn't got): every run names its own.
    font: null as unknown as string,
    bufferPages,
    displayTitle: true,
    info: { Title: doc.title, ...(doc.author ? { Author: doc.author } : {}), Creator: "slipbox" },
    ...(doc.lang ? { lang: doc.lang } : {}),
  });
}

/**
 * `text` set in the font `key`, split where that font has no glyph and a fallback has: each piece and its font. A
 * character no font has stays in `key`'s (its box); a combining mark or a joiner stays with what it joins. `known`:
 * each character's fallback found so far.
 */
export function splitByFont(
  text: string,
  key: string,
  has: (font: string, cp: number) => boolean,
  fallbacks: string[],
  known = new Map<number, string>(),
): { text: string; key: string }[] {
  const out: { text: string; key: string }[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    let k = key;
    if (cp > 0x20 && !has(key, cp)) {
      let f = known.get(cp);
      if (f === undefined) known.set(cp, (f = fallbacks.find((fb) => has(fb, cp)) ?? ""));
      if (f) k = f;
    }
    const last = out.at(-1);
    if (last && (last.key === k || JOINS.test(ch))) last.text += ch;
    else out.push({ text: ch, key: k });
  }
  return out;
}

/** What stays with the character before it: a combining mark, a zero-width joiner, a variation selector. */
// biome-ignore lint/suspicious/noMisleadingCharacterClass: one character alone, a mark or a joiner: never a sequence
const JOINS = /^[\p{M}\u200d\ufe0e\ufe0f]$/u;

/** The object replacement character: a picture's place in a line's text, where a line may break either side. */
const OBJECT = "\ufffc";

/**
 * Where `text` may break (UAX #14 — either side of a picture's `\ufffc` too, its rule LB20), as the words between:
 * each word's end, and whether the line must end after it (a newline).
 */
export function words(text: string): { end: number; required: boolean }[] {
  const out: { end: number; required: boolean }[] = [];
  const breaker = new LineBreaker(text);
  for (let b = breaker.nextBreak(); b; b = breaker.nextBreak())
    if (b.position > 0) out.push({ end: b.position, required: b.required });
  return out;
}

class PdfWriter {
  private readonly pdf: PDFKit.PDFDocument;
  /** Each font's faces, as fontkit reads them: what says whether one has a character. */
  private readonly faces = new Map<string, Font | null>();
  private readonly fallbacks: string[] = [];
  private readonly fallbackOf = new Map<number, string>();
  /** This chapter's footnotes: each one's number, in the order they're referred to, and its blocks. */
  private notes = new Map<string, number>();
  private defs = new Map<string, RootContent[]>();
  private chapter = "";
  private outline: PDFKit.PDFOutline | null = null;
  private readonly superscripts: boolean;
  private readonly boxes: boolean;
  /** Pictures drawn for a line, by what they're of and how wide: each made once. */
  private readonly drawn = new Map<string, { data: Buffer; width: number; height: number } | null>();

  constructor(
    private readonly doc: ExportDoc,
    private readonly fonts: Fonts,
    private readonly r: Rasterizer | null,
    private readonly streaming = false,
  ) {
    this.pdf = pdfDocument(doc, !streaming);
    const faces: [string, Face][] = [
      ["regular", fonts.regular],
      ["bold", fonts.bold],
      ["italic", fonts.italic],
      ["boldItalic", fonts.boldItalic],
      ["mono", fonts.mono],
      ["monoBold", fonts.monoBold],
    ];
    for (const [key, f] of faces) {
      const face = fonts.builtin ? null : openFace(f);
      this.pdf.registerFont(
        key,
        f.path,
        f.ps ?? (face && f.path.toLowerCase().endsWith(".ttc") ? face.postscriptName : undefined),
      );
      this.faces.set(key, face);
    }
    if (fonts.builtin) {
      // PDF's own fonts: there when slipbox runs from its source, not in a compiled one.
      try {
        this.pdf.font("regular");
      } catch {
        throw new Error("no font found on this machine for a PDF (looked in its font folders)");
      }
    }
    fonts.fallbacks.forEach((f, i) => {
      const face = openFace(f);
      if (!face) return;
      const key = `fallback${i}`;
      this.pdf.registerFont(
        key,
        f.path,
        f.ps ?? (f.path.toLowerCase().endsWith(".ttc") ? face.postscriptName : undefined),
      );
      this.faces.set(key, face);
      this.fallbacks.push(key);
    });
    this.superscripts = this.covered("¹²³⁴⁵⁶⁷⁸⁹⁰");
    this.boxes = this.covered("☐☑");
  }

  async write(sink?: ExportSink): Promise<Uint8Array> {
    const pdf = this.pdf;
    const chunks: Buffer[] = [];
    pdf.on("data", (c: Buffer) => {
      if (sink) sink(c);
      else chunks.push(c);
    });
    const done = new Promise<void>((resolve, reject) => {
      pdf.on("end", resolve);
      pdf.on("error", reject);
    });
    // Let the readable enter flowing mode before generating pages, so its output isn't queued until rendering ends.
    await new Promise<void>((resolve) => setImmediate(resolve));
    this.doc.chapters.forEach((ch, k) => {
      if (k > 0) this.addPage();
      this.writeChapter(ch);
    });
    if (sink) this.pageNumber(this.page());
    else this.pageNumbers();
    pdf.end();
    await done;
    return new Uint8Array(Buffer.concat(chunks));
  }

  // ---------------------------------------------------------------------------------------------
  // Fonts: a run's face, and another's for what it hasn't got.

  /** Whether some font here has every character of `text`. */
  private covered(text: string): boolean {
    if (this.fonts.builtin) return false;
    return [...text].every((ch) => [...this.faces.values()].some((f) => f?.hasGlyphForCodePoint(ch.codePointAt(0)!)));
  }

  private faceKey(s: Style): string {
    if (s.mono) return s.bold ? "monoBold" : "mono";
    return s.bold && s.italic ? "boldItalic" : s.bold ? "bold" : s.italic ? "italic" : "regular";
  }

  /** `text` in the face `key`, split where it has no glyph and a fallback has: each piece and its font. */
  private segments(text: string, key: string): { text: string; key: string }[] {
    // PDF's own fonts hold Latin-1 and a few more: anything else a question mark.
    if (this.fonts.builtin) return [{ text: text.replace(/[^\n\x20-\xff‘’“”–—•…]/g, "?"), key }];
    const face = this.faces.get(key);
    if (!face) return [{ text, key }];
    return splitByFont(
      text,
      key,
      (k, cp) => (k === key ? face : this.faces.get(k))?.hasGlyphForCodePoint(cp) ?? false,
      this.fallbacks,
      this.fallbackOf,
    );
  }

  /** A font's metrics at a size: how far it reaches above and below the baseline. */
  private metrics(font: string, size: number): { ascent: number; descent: number } {
    const f = (this.pdf.font(font).fontSize(size) as unknown as { _font: { ascender: number; descender: number } })
      ._font;
    return { ascent: (f.ascender / 1000) * size, descent: (-f.descender / 1000) * size };
  }

  // ---------------------------------------------------------------------------------------------
  // Lines: laid out here, words and pictures together.

  /** A picture in a line as drawn: its PNG or JPEG, its size in points (at most `most` wide), how far below the baseline. */
  private linePicture(
    p: InlinePicture,
    size: number,
    most: number,
  ): { data: Buffer; width: number; height: number; drop: number } | null {
    if (p.math && p.picture.svg) {
      const m = mathSize(p.picture.svg);
      if (!m) return null;
      const ex = size * EX;
      let [width, height] = [m.width * ex, m.height * ex];
      if (width > most) [width, height] = [most, (height * most) / width];
      const key = `${p.picture.svg}\n${width.toFixed(2)}`;
      if (!this.drawn.has(key)) {
        // Small: drawn at four times its size, to stay sharp printed.
        const png = this.r?.png(p.picture.svg, Math.ceil((width / PX) * 4));
        this.drawn.set(key, png ? { data: Buffer.from(png), width, height } : null);
      }
      const d = this.drawn.get(key);
      return d ? { ...d, drop: -m.valign * ex * (height / (m.height * ex)) } : null;
    }
    const r = rasterOf(p.picture, this.r, most / PX, ["png", "jpg"]);
    if (!r) return null;
    return { data: Buffer.from(r.data), width: r.shown.width * PX, height: r.shown.height * PX, drop: 0 };
  }

  /** Inline content laid out in lines `width` wide: broken where Unicode lets a line break, a word too long cut. */
  private lines(content: Inline[], width: number, base: { size?: number; color?: string } = {}): Line[] {
    return this.layout(content, width, base).lines;
  }

  /** `lines`, and how wide its widest word is (what a table's column can't be narrower than). */
  private layout(
    content: Inline[],
    width: number,
    base: { size?: number; color?: string } = {},
  ): { lines: Line[]; longest: number } {
    const size0 = base.size ?? BODY;
    // The text as one string — a picture its object character — and where each inline starts in it.
    let text = "";
    const starts: number[] = [];
    for (const c of content) {
      starts.push(text.length);
      text += "picture" in c ? OBJECT : c.text;
    }
    /** The atoms of `text` from `a` to `b`: each inline's part, split by the font each character is in. */
    const atomsOf = (a: number, b: number): Atom[] => {
      const out: Atom[] = [];
      content.forEach((c, i) => {
        const from = Math.max(a, starts[i]!);
        const to = Math.min(b, i + 1 < content.length ? starts[i + 1]! : text.length);
        if (from >= to) return;
        const size = c.size ?? size0;
        if ("picture" in c) {
          const p = this.linePicture(c, size, width);
          if (p) out.push({ ...c, kind: "picture", ...p });
          else out.push(...this.textAtoms(c.alt || "picture", { ...c, italic: true }, size));
          return;
        }
        out.push(...this.textAtoms(c.text.slice(from - starts[i]!, to - starts[i]!), c, size));
      });
      return out;
    };
    const lines: Line[] = [];
    let line: Line = { atoms: [], width: 0, ascent: 0, descent: 0 };
    let full = 0;
    const end = () => {
      if (!line.atoms.length) {
        const m = this.metrics("regular", size0);
        line.ascent = m.ascent;
        line.descent = m.descent;
      }
      lines.push(line);
      line = { atoms: [], width: 0, ascent: 0, descent: 0 };
      full = 0;
    };
    const add = (atoms: Atom[]) => {
      for (const a of atoms) {
        line.atoms.push(a);
        full += a.width;
        if (!(a.kind === "text" && a.space)) line.width = full;
        const [up, down] = a.kind === "text" ? [a.ascent, a.descent] : [a.height - a.drop, a.drop];
        line.ascent = Math.max(line.ascent, up);
        line.descent = Math.max(line.descent, down);
      }
    };
    let at = 0;
    let longest = 0;
    for (const w of words(text)) {
      const atoms = atomsOf(at, w.end).filter((a) => !(a.kind === "text" && a.text === "\n"));
      at = w.end;
      // Its width but for the spaces it ends with.
      const solid = atoms.reduce(
        (n, a, i) =>
          a.kind === "text" && a.space && atoms.slice(i).every((x) => x.kind === "text" && x.space) ? n : n + a.width,
        0,
      );
      longest = Math.max(longest, solid);
      if (line.atoms.length && full + solid > width) end();
      if (solid > width) {
        // Longer than a line: cut where it fits, a character at a time.
        for (const piece of this.cut(atoms, width)) {
          if (line.atoms.length) end();
          add(piece);
        }
      } else add(atoms);
      if (w.required) end();
    }
    if (line.atoms.length || !lines.length) end();
    return { lines, longest };
  }

  /** `text` in a style, as atoms a font each: spaces apart, so a line's last ones aren't counted. */
  private textAtoms(text: string, s: Style, size: number): Atom[] {
    const out: Atom[] = [];
    for (const seg of this.segments(text, this.faceKey(s))) {
      for (const part of seg.text.split(/(\n|[^\S\n]+)/)) {
        if (!part) continue;
        const space = /^\s+$/.test(part);
        const m = this.metrics(seg.key, size);
        const shown = part === "\n" ? part : part.replace(/\t/g, "    ");
        out.push({
          ...s,
          kind: "text",
          text: shown,
          font: seg.key,
          size,
          width: shown === "\n" ? 0 : this.pdf.widthOfString(shown),
          ascent: m.ascent,
          descent: m.descent,
          space,
        });
      }
    }
    return out;
  }

  /** Atoms too wide for a line cut into lines' worth, a character (a grapheme) at a time. */
  private cut(atoms: Atom[], width: number): Atom[][] {
    const out: Atom[][] = [[]];
    let used = 0;
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    for (const a of atoms) {
      if (a.kind !== "text") {
        if (used && used + a.width > width) out.push([]), (used = 0);
        out.at(-1)!.push(a);
        used += a.width;
        continue;
      }
      this.pdf.font(a.font).fontSize(a.size ?? BODY);
      let piece = "";
      for (const { segment } of segmenter.segment(a.text)) {
        const w = this.pdf.widthOfString(piece + segment);
        if (used + w > width && (piece || used)) {
          if (piece) out.at(-1)!.push({ ...a, text: piece, width: this.pdf.widthOfString(piece) });
          out.push([]);
          used = 0;
          piece = segment;
        } else piece += segment;
      }
      if (piece) {
        const w = this.pdf.widthOfString(piece);
        out.at(-1)!.push({ ...a, text: piece, width: w });
        used += w;
      }
    }
    return out.filter((p) => p.length);
  }

  /** How tall `lines` are, the gap between lines given. */
  private height(lines: Line[], gap = 2.5): number {
    return lines.reduce((h, l) => h + l.ascent + l.descent + gap, 0);
  }

  /** Lines set in `box` from the current position, a new page where the next won't fit (unless `keep`). */
  private draw(
    lines: Line[],
    box: Box,
    o: { align?: "left" | "center" | "right"; gap?: number; keep?: boolean } = {},
  ): void {
    const pdf = this.pdf;
    const gap = o.gap ?? 2.5;
    for (const l of lines) {
      if (!o.keep) this.ensure(l.ascent + l.descent);
      const top = pdf.y;
      const baseline = top + l.ascent;
      let x =
        box.x + (o.align === "center" ? (box.width - l.width) / 2 : o.align === "right" ? box.width - l.width : 0);
      // Its spaces at its end, unseen.
      let last = l.atoms.length;
      while (last > 0 && l.atoms[last - 1]!.kind === "text" && (l.atoms[last - 1] as { space: boolean }).space) last--;
      // A link's area: one a line, across its words and the spaces between them.
      const areas: { link?: string; goTo?: string; x: number; width: number }[] = [];
      for (const a of l.atoms.slice(0, last)) {
        const [up, down] = a.kind === "text" ? [a.ascent, a.descent] : [a.height - a.drop, a.drop];
        const prev = areas.at(-1);
        if (
          (a.link || a.goTo) &&
          prev &&
          prev.link === a.link &&
          prev.goTo === a.goTo &&
          Math.abs(prev.x + prev.width - x) < 0.01
        )
          prev.width += a.width;
        else if (a.link || a.goTo) areas.push({ link: a.link, goTo: a.goTo, x, width: a.width });
        if (a.kind === "text") {
          if (a.mark)
            pdf
              .save()
              .rect(x, baseline - up, a.width, up + down)
              .fill(TINT.mark)
              .restore();
          if (a.tint)
            pdf
              .save()
              .roundedRect(x - 1, baseline - up, a.width + 2, up + down, 2)
              .fill(TINT.inline)
              .restore();
          // Spaces drawn too: what a reader copies, or searches, has its words apart.
          pdf
            .font(a.font)
            .fontSize(a.size ?? BODY)
            .fillColor(a.color ?? box.color ?? PRINT.fg);
          pdf.text(a.text, x, baseline, {
            lineBreak: false,
            underline: a.underline,
            baseline: "alphabetic",
          } as PDFKit.Mixins.TextOptions);
          if (a.strike)
            pdf
              .save()
              .moveTo(x, baseline - (a.size ?? BODY) * 0.3)
              .lineTo(x + a.width, baseline - (a.size ?? BODY) * 0.3)
              .lineWidth(0.6)
              .strokeColor(a.color ?? box.color ?? PRINT.fg)
              .stroke()
              .restore();
        } else pdf.image(a.data, x, baseline - up, { width: a.width, height: a.height });
        x += a.width;
      }
      for (const area of areas) {
        if (area.link) pdf.link(area.x, top, area.width, l.ascent + l.descent, area.link);
        if (area.goTo) pdf.goTo(area.x, top, area.width, l.ascent + l.descent, area.goTo);
      }
      pdf.y = top + l.ascent + l.descent + gap;
    }
    pdf.x = MARGIN.left;
  }

  /** Inline content set as one paragraph in `box`, wrapping, from the current position. */
  private flow(
    content: Inline[],
    box: Box,
    o: { align?: "left" | "center" | "right"; size?: number; gap?: number; keep?: boolean } = {},
  ): void {
    this.draw(this.lines(content, box.width, { size: o.size, color: box.color }), box, o);
  }

  private readonly bars: { colour: string; x: number; top: number }[] = [];

  /** Finish decorations before the next page releases this one. Nested quotes each keep their own start. */
  private addPage(): void {
    for (const bar of this.bars) {
      this.drawBar(bar, this.pdf.page.height - MARGIN.bottom);
      bar.top = MARGIN.top;
    }
    if (this.streaming) this.pageNumber(this.page());
    this.pdf.addPage();
  }

  private drawBar(bar: { colour: string; x: number; top: number }, bottom: number): void {
    if (bottom > bar.top)
      this.pdf
        .save()
        .moveTo(bar.x, bar.top)
        .lineTo(bar.x, bottom)
        .lineWidth(2.5)
        .strokeColor(bar.colour)
        .stroke()
        .restore();
  }

  /** Room for `h` points down the page, or a new page. */
  private ensure(h: number): void {
    if (this.pdf.y + h > this.pdf.page.height - MARGIN.bottom) this.addPage();
  }

  /** The page being written: the last there is. */
  private page(): number {
    const r = this.pdf.bufferedPageRange();
    return r.start + r.count - 1;
  }

  /** Inline content as runs of text and pictures in a line. */
  private inlines(nodes: PhrasingContent[], base: Style = {}): Inline[] {
    const out: Inline[] = [];
    const walk = (ns: PhrasingContent[], s: Style) => {
      for (const n of ns) {
        switch (n.type) {
          case "htmlInline": {
            const p = n.data?.html;
            walk(n.children, {
              ...s,
              ...(p?.bold !== undefined ? { bold: p.bold } : {}),
              ...(p?.italic !== undefined ? { italic: p.italic } : {}),
              ...(p?.strike !== undefined ? { strike: p.strike } : {}),
              ...(p?.underline !== undefined ? { underline: p.underline } : {}),
            });
            break;
          }
          case "text":
            out.push({ ...s, text: n.value.replace(/\n/g, " ") });
            break;
          case "strong":
            walk(n.children, { ...s, bold: true });
            break;
          case "emphasis":
            walk(n.children, { ...s, italic: true });
            break;
          case "delete":
            walk(n.children, { ...s, strike: true });
            break;
          case "highlight":
            walk(n.children, { ...s, mark: true });
            break;
          case "inlineCode":
            out.push({ ...s, text: n.value, mono: true, tint: true, size: (s.size ?? BODY) * 0.9 });
            break;
          case "break":
            out.push({ ...s, text: "\n" });
            break;
          case "link":
            walk(n.children, {
              ...s,
              color: TINT.link,
              ...(n.url.startsWith("#") ? { goTo: n.url.slice(1) } : { link: n.url }),
            });
            break;
          case "image": {
            const picture = (n.data as { picture?: ExportPicture } | undefined)?.picture;
            if (picture) out.push({ ...s, picture, alt: n.alt ?? "" });
            else out.push({ ...s, text: n.alt || "picture", italic: true });
            break;
          }
          case "inlineMath": {
            // Typeset, on the baseline; its Unicode text where it isn't.
            const picture = (n.data as { picture?: ExportPicture } | undefined)?.picture;
            if (picture?.svg && this.r) out.push({ ...s, picture, alt: `$${n.value}$`, math: true });
            else out.push({ ...s, text: mathText(n.value) ?? `$${n.value}$`, italic: true });
            break;
          }
          case "footnoteReference": {
            if (!this.defs.has(n.identifier)) break;
            if (!this.notes.has(n.identifier)) this.notes.set(n.identifier, this.notes.size + 1);
            const k = this.notes.get(n.identifier)!;
            const mark = this.superscripts ? [...String(k)].map((d) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[Number(d)]).join("") : `[${k}]`;
            out.push({
              ...s,
              text: mark,
              color: TINT.link,
              goTo: this.noteId(k),
              ...(this.superscripts ? {} : { size: (s.size ?? BODY) * 0.8 }),
            });
            break;
          }
          default:
            if ("children" in n) walk(n.children as PhrasingContent[], s);
            else if ("value" in n) out.push({ ...s, text: String(n.value) });
        }
      }
    };
    walk(nodes, base);
    return out;
  }

  private text(content: Inline[]): string {
    return content.map((c) => ("picture" in c ? c.alt : c.text)).join("");
  }

  private noteId(k: number): string {
    return `${this.chapter}--note-${k}`;
  }

  // ---------------------------------------------------------------------------------------------
  // Blocks.

  private writeChapter(ch: ExportChapter): void {
    const pdf = this.pdf;
    this.chapter = ch.anchor;
    this.notes = new Map();
    this.defs = new Map(
      ch.nodes.flatMap((n) => (n.type === "footnoteDefinition" ? [[n.identifier, n.children] as const] : [])),
    );
    pdf.addNamedDestination(ch.anchor, "XYZ", MARGIN.left, pdf.y, null);
    this.outline = pdf.outline.addItem(ch.title);
    const box: Box = { x: MARGIN.left, width: pdf.page.width - MARGIN.left - MARGIN.right };
    const nodes = ch.nodes.filter((n) => n.type !== "footnoteDefinition");
    const first = nodes[0];
    if (!(first?.type === "heading" && first.depth === 1))
      this.heading({ type: "heading", depth: 1, children: [{ type: "text", value: ch.title }] }, box);
    this.blocks(nodes, box);
    this.endnotes(box);
  }

  private blocks(nodes: RootContent[], box: Box): void {
    for (const n of nodes) {
      switch (n.type) {
        case "heading":
          this.heading(n, box);
          break;
        case "paragraph":
          this.paragraph(n.children, box);
          break;
        case "blockquote":
          this.quote(n, box);
          break;
        case "list":
          this.list(n, box);
          break;
        case "code":
          this.code(n.value, n.lang ?? null, box);
          break;
        case "math":
          this.displayMath(n, box);
          break;
        case "table":
          this.table(n, box);
          break;
        case "thematicBreak":
          this.rule(box);
          break;
        default:
          break;
      }
    }
  }

  private heading(n: Heading, box: Box): void {
    const pdf = this.pdf;
    const size = HEADING[n.depth - 1]!;
    if (pdf.y > MARGIN.top + 1) pdf.y += size * (n.depth <= 2 ? 0.9 : 0.6);
    // Never alone at a page's foot.
    this.ensure(size * 1.4 + BODY * 3);
    const anchor = (n.data as { anchor?: string } | undefined)?.anchor;
    if (anchor) pdf.addNamedDestination(anchor, "XYZ", box.x, pdf.y, null);
    const content = this.inlines(n.children, { bold: true, size, color: n.depth === 6 ? PRINT.muted : PRINT.fg });
    this.flow(content, box, { size });
    if (n.depth === 2) this.outline?.addItem(this.text(content));
    if (n.depth <= 2) {
      pdf.y += 3;
      pdf
        .save()
        .moveTo(box.x, pdf.y)
        .lineTo(box.x + box.width, pdf.y)
        .lineWidth(0.5)
        .strokeColor(TINT.border)
        .stroke()
        .restore();
    }
    pdf.y += size * 0.4;
  }

  /** A paragraph: its text and pictures in lines — a picture alone in it a block of its own, centred. */
  private paragraph(children: PhrasingContent[], box: Box): void {
    const content = this.inlines(children);
    const pictures = content.filter((c): c is InlinePicture => "picture" in c && !c.math);
    const alone = pictures.length > 0 && content.every((c) => ("picture" in c ? !c.math : !c.text.trim()));
    if (alone) {
      for (const p of pictures) this.picture(p.picture, p.alt, box, 2, p);
      return;
    }
    if (!content.some((c) => "picture" in c || c.text.trim())) return;
    this.flow(content, box);
    this.pdf.y += (box.gap ?? GAP) - 2.5;
  }

  private quote(n: Blockquote, box: Box): void {
    const kind = (n.data as { callout?: string } | undefined)?.callout;
    const inner: Box = { ...box, x: box.x + 14, width: box.width - 14, color: kind ? box.color : PRINT.muted };
    this.barred(kind ? calloutColour(kind) : TINT.border, box.x + 3, () => this.blocks(n.children, inner));
  }

  /** What `body` writes, with a bar down its left at `x`, page by page. */
  private barred(colour: string, x: number, body: () => void): void {
    const pdf = this.pdf;
    if (this.streaming) {
      const bar = { colour, x, top: pdf.y };
      this.bars.push(bar);
      try {
        body();
        this.drawBar(bar, pdf.y - 4);
      } finally {
        this.bars.pop();
      }
      return;
    }
    const [startPage, startY] = [this.page(), pdf.y];
    body();
    const [endPage, endY] = [this.page(), pdf.y - 4];
    for (let p = startPage; p <= endPage; p++) {
      pdf.switchToPage(p);
      const top = p === startPage ? startY : MARGIN.top;
      const bottom = p === endPage ? endY : pdf.page.height - MARGIN.bottom;
      if (bottom > top)
        pdf.save().moveTo(x, top).lineTo(x, bottom).lineWidth(2.5).strokeColor(colour).stroke().restore();
    }
    pdf.switchToPage(endPage);
    pdf.y = endY + 4;
  }

  private list(n: List, box: Box): void {
    const pdf = this.pdf;
    const depth = box.depth ?? 0;
    const ordered = !!n.ordered;
    let k = n.start ?? 1;
    pdf.font("regular").fontSize(BODY);
    const markerW = ordered ? pdf.widthOfString(`${k + n.children.length - 1}.`) + 8 : 14;
    const gap = n.spread ? GAP : TIGHT;
    for (const item of n.children) {
      const marker =
        typeof item.checked === "boolean"
          ? this.boxes
            ? item.checked
              ? "☑"
              : "☐"
            : item.checked
              ? "[x]"
              : "[ ]"
          : ordered
            ? `${k++}.`
            : depth % 2
              ? "◦"
              : "•";
      const w =
        typeof item.checked === "boolean" && !this.boxes
          ? pdf.font("regular").fontSize(BODY).widthOfString("[x] ")
          : markerW;
      this.ensure(BODY * 2);
      const y = pdf.y;
      this.flow([{ text: marker, color: box.color }], { x: box.x, width: w + 20 });
      pdf.y = y;
      this.blocks(item.children, { ...box, x: box.x + w, width: box.width - w, gap, depth: depth + 1 });
    }
    if (!n.spread) pdf.y += GAP - TIGHT;
  }

  private code(value: string, lang: string | null, box: Box): void {
    const pdf = this.pdf;
    const tokens = highlight(value, lang);
    const lines = value.split("\n");
    const pad = 6;
    const inner: Box = { x: box.x + pad, width: box.width - 2 * pad };
    pdf.y += 2;
    lines.forEach((line, i) => {
      const runs: Inline[] = (tokens?.[i]?.length ? tokens[i]! : [{ text: line, role: undefined }]).map((t) => ({
        text: t.text,
        mono: true,
        size: CODE,
        color: (t.role && SYNTAX[t.role]) || PRINT.fg,
      }));
      const laid = this.lines(line ? runs : [{ text: " ", mono: true, size: CODE }], inner.width, { size: CODE });
      const h = this.height(laid, 1);
      const top = i === 0 ? pad : 0;
      const bottom = i === lines.length - 1 ? pad : 0;
      this.ensure(h + top + bottom);
      pdf
        .save()
        .rect(box.x, pdf.y, box.width, h + top + bottom)
        .fill(TINT.code)
        .restore();
      pdf.y += top;
      this.draw(laid, inner, { gap: 1, keep: true });
      pdf.y += bottom;
    });
    pdf.y += GAP + 2;
  }

  /** A picture, centred, at its size up to the box's width and the page's height; its words where it can't be drawn. */
  private picture(pic: ExportPicture, alt: string, box: Box, scale = 2, style: Style = {}): void {
    const pdf = this.pdf;
    const r = rasterOf(pic, this.r, box.width / PX, ["png", "jpg"], scale);
    if (!r) {
      this.flow([{ ...style, text: alt || "picture", italic: true, color: PRINT.muted }], box);
      pdf.y += (box.gap ?? GAP) - 2.5;
      return;
    }
    let [w, h] = [r.shown.width * PX, r.shown.height * PX];
    const most = pdf.page.height - MARGIN.top - MARGIN.bottom;
    if (h > most) [w, h] = [(w * most) / h, most];
    this.ensure(h);
    const x = box.x + (box.width - w) / 2;
    pdf.image(Buffer.from(r.data), x, pdf.y, { width: w, height: h });
    if (style.link) pdf.link(x, pdf.y, w, h, style.link);
    if (style.goTo) pdf.goTo(x, pdf.y, w, h, style.goTo);
    pdf.y += h + GAP + 2;
  }

  private displayMath(n: MathNode, box: Box): void {
    const pic = (n.data as { picture?: ExportPicture } | undefined)?.picture;
    // Typeset, drawn sharper than a picture: maths is small.
    if (pic) return this.picture(pic, n.value, box, 3);
    for (const row of mathRows(n.value) ?? n.value.split("\n"))
      this.flow([{ text: row, mono: true }], box, { align: "center" });
    this.pdf.y += GAP;
  }

  private rule(box: Box): void {
    const pdf = this.pdf;
    this.ensure(12);
    pdf.y += 4;
    pdf
      .save()
      .moveTo(box.x, pdf.y)
      .lineTo(box.x + box.width, pdf.y)
      .lineWidth(0.75)
      .strokeColor(TINT.border)
      .stroke()
      .restore();
    pdf.y += 8;
  }

  /** A table: its columns as wide as their words need, shared out where they don't fit; a row never split. */
  private table(n: Table, box: Box): void {
    const pdf = this.pdf;
    const size = BODY * 0.92;
    const pad = 4;
    const rows = n.children.map((row, i) =>
      row.children.map((cell) => this.inlines(cell.children, i === 0 ? { bold: true, size } : { size })),
    );
    const cols = Math.max(...rows.map((r) => r.length));
    // A column's widest: its longest cell on one line; its least: its longest word.
    const one = rows.map((r) =>
      Array.from({ length: cols }, (_, c) => this.layout(r[c] ?? [], Number.POSITIVE_INFINITY, { size })),
    );
    const natural = Array.from(
      { length: cols },
      (_, c) => Math.max(...one.map((r) => Math.max(...r[c]!.lines.map((l) => l.width)))) + 2 * pad + 1,
    );
    const least = Array.from({ length: cols }, (_, c) =>
      Math.min(natural[c]!, Math.max(...one.map((r) => r[c]!.longest)) + 2 * pad + 1),
    );
    let widths = natural;
    if (natural.reduce((a, b) => a + b, 0) > box.width) {
      // What's left after each column's longest word, shared by how much more each would take.
      const spare = Math.max(0, box.width - least.reduce((a, b) => a + b, 0));
      const want = natural.map((w, c) => w - least[c]!);
      const wanted = want.reduce((a, b) => a + b, 0) || 1;
      widths = least.map((w, c) => w + (spare * want[c]!) / wanted);
      const sum = widths.reduce((a, b) => a + b, 0);
      if (sum > box.width) widths = widths.map((w) => (w * box.width) / sum);
    }
    const ALIGN = { left: "left", center: "center", right: "right" } as const;
    const laid = (row: Inline[][]) => widths.map((w, c) => this.lines(row[c] ?? [], w - 2 * pad, { size }));
    const heightOf = (cells: Line[][]) => Math.max(...cells.map((l) => this.height(l, 1.5))) + 2 * pad;
    const drawRow = (cells: Line[][], header: boolean) => {
      const h = heightOf(cells);
      const y = pdf.y;
      let x = box.x;
      widths.forEach((w, c) => {
        if (header) pdf.save().rect(x, y, w, h).fill(TINT.code).restore();
        pdf.save().rect(x, y, w, h).lineWidth(0.5).strokeColor(TINT.border).stroke().restore();
        pdf.y = y + pad;
        this.draw(
          cells[c]!,
          { x: x + pad, width: w - 2 * pad },
          { gap: 1.5, keep: true, align: ALIGN[n.align?.[c] as keyof typeof ALIGN] ?? "left" },
        );
        x += w;
      });
      pdf.y = y + h;
    };
    pdf.y += 2;
    const header = rows[0] ? laid(rows[0]) : null;
    rows.forEach((row, i) => {
      const cells = i === 0 ? header! : laid(row);
      if (pdf.y + heightOf(cells) > pdf.page.height - MARGIN.bottom) {
        this.addPage();
        // The header again, on the new page.
        if (i > 0 && header) drawRow(header, true);
      }
      drawRow(cells, i === 0);
    });
    pdf.y += GAP + 4;
  }

  /** This chapter's footnotes, at its end: numbered as they're referred to, each a destination its mark links to. */
  private endnotes(box: Box): void {
    if (!this.notes.size) return;
    const pdf = this.pdf;
    this.ensure(BODY * 5);
    pdf.y += GAP;
    pdf
      .save()
      .moveTo(box.x, pdf.y)
      .lineTo(box.x + 120, pdf.y)
      .lineWidth(0.5)
      .strokeColor(TINT.border)
      .stroke()
      .restore();
    pdf.y += 6;
    this.flow([{ text: "Notes", bold: true, size: BODY * 0.92 }], box);
    pdf.y += 2;
    for (const [id, k] of [...this.notes].sort((a, b) => a[1] - b[1])) {
      this.ensure(BODY * 2);
      pdf.addNamedDestination(this.noteId(k), "XYZ", box.x, pdf.y, null);
      const y = pdf.y;
      this.flow([{ text: `${k}.`, color: PRINT.muted }], { x: box.x, width: 24 });
      pdf.y = y;
      this.blocks(this.defs.get(id) ?? [], {
        ...box,
        x: box.x + 22,
        width: box.width - 22,
        color: PRINT.muted,
        gap: TIGHT,
      });
    }
  }

  /** Each page's number at its foot, centred. */
  private pageNumbers(): void {
    const pdf = this.pdf;
    const range = pdf.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      pdf.switchToPage(i);
      this.pageNumber(i);
    }
  }

  /** A page's footer before it's flushed, preserving the body cursor and margins. */
  private pageNumber(i: number): void {
    const pdf = this.pdf;
    const x = pdf.x,
      y = pdf.y,
      bottom = pdf.page.margins.bottom;
    pdf.save();
    try {
      pdf.page.margins.bottom = 0;
      pdf.y = pdf.page.height - 44 - 8;
      this.flow(
        [{ text: String(i + 1), size: 8.5, color: PRINT.muted }],
        { x: MARGIN.left, width: pdf.page.width - MARGIN.left - MARGIN.right },
        { align: "center", size: 8.5, keep: true },
      );
    } finally {
      pdf.restore();
      pdf.page.margins.bottom = bottom;
      pdf.x = x;
      pdf.y = y;
    }
  }
}
