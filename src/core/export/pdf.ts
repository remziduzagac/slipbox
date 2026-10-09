// Export as PDF (plan 10.5): laid out by pdfkit (MIT) on A4, in fonts found on the machine (`fonts.ts`) and embedded,
// a character a font hasn't got taken from another that has. A chapter a note, each from a new page, with its own
// notes at its end; headings as the PDF's outline, and each a destination the document's links go to; pictures at
// their size up to the text's width (PNG and JPEG as they are; an SVG, a GIF, a diagram, a display's maths rasterised);
// code on a tint, coloured; tables drawn, their header again on a new page; quotes behind a bar, a callout's in its
// colour; the page's number at its foot.

import type { Font } from "fontkit";
import type { Blockquote, Heading, List, PhrasingContent, RootContent, Table } from "mdast";
import type { Math as MathNode } from "mdast-util-math";
import PDFDocument from "pdfkit";
import { highlight } from "../layout/highlight.ts";
import { mathRows, mathText } from "../math.ts";
import { loadRasterizer, type Rasterizer } from "../svg.ts";
import type { ExportChapter, ExportDoc, ExportPicture } from "./assemble.ts";
import { type Face, findFonts, type Fonts, openFace } from "./fonts.ts";
import { rasterOf } from "./images.ts";
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

interface Style {
  bold?: boolean;
  italic?: boolean;
  mono?: boolean;
  strike?: boolean;
  color?: string;
  size?: number;
  link?: string;
  goTo?: string;
}
interface Run extends Style {
  text: string;
}
/** A paragraph's content laid out: runs of text, and pictures (a block each). */
type Piece = { runs: Run[] } | { picture: ExportPicture; alt: string };
/** Where blocks go: from `x`, `width` wide; their text's colour, the space after a paragraph, how deep in lists. */
interface Box {
  x: number;
  width: number;
  color?: string;
  gap?: number;
  depth?: number;
}

/** The document as a PDF's bytes. */
export async function toPdf(doc: ExportDoc, fonts: Fonts = findFonts()): Promise<Uint8Array> {
  return new PdfWriter(doc, fonts, await loadRasterizer()).write();
}

/**
 * `text` set in the font `key`, split where that font has no glyph and a fallback has: each piece and its font. A
 * character no font has stays in `key`'s (its box); a combining mark or a joiner stays with what it joins. `known`:
 * each character's fallback found so far.
 */
export function splitByFont(text: string, key: string, has: (font: string, cp: number) => boolean, fallbacks: string[], known = new Map<number, string>()): { text: string; key: string }[] {
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
const JOINS = /^[\p{M}\u200d\ufe0e\ufe0f]$/u;

/** The PDF a document is written into: A4, its pages kept until the end (for their numbers), its title and author. */
export function pdfDocument(doc: ExportDoc): PDFKit.PDFDocument {
  return new PDFDocument({
    size: "A4",
    margins: MARGIN,
    // No default font loaded (Helvetica, which a compiled slipbox hasn't got): every run names its own.
    font: null as unknown as string,
    bufferPages: true,
    displayTitle: true,
    info: { Title: doc.title, ...(doc.author ? { Author: doc.author } : {}), Creator: "slipbox" },
    ...(doc.lang ? { lang: doc.lang } : {}),
  });
}

/** pdfkit's options for a run of text: every one given, so none carries over from the run before. */
type TextOptions = PDFKit.Mixins.TextOptions;

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

  constructor(
    private readonly doc: ExportDoc,
    private readonly fonts: Fonts,
    private readonly r: Rasterizer | null,
  ) {
    this.pdf = pdfDocument(doc);
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
      this.pdf.registerFont(key, f.path, f.ps ?? (face && f.path.toLowerCase().endsWith(".ttc") ? face.postscriptName : undefined));
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
      this.pdf.registerFont(key, f.path, f.ps ?? (f.path.toLowerCase().endsWith(".ttc") ? face.postscriptName : undefined));
      this.faces.set(key, face);
      this.fallbacks.push(key);
    });
    this.superscripts = this.covered("¹²³⁴⁵⁶⁷⁸⁹⁰");
    this.boxes = this.covered("☐☑");
  }

  async write(): Promise<Uint8Array> {
    const pdf = this.pdf;
    const chunks: Buffer[] = [];
    pdf.on("data", (c: Buffer) => chunks.push(c));
    const done = new Promise<void>((resolve) => pdf.on("end", () => resolve()));
    this.doc.chapters.forEach((ch, k) => {
      if (k > 0) pdf.addPage();
      this.writeChapter(ch);
    });
    this.pageNumbers();
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
    return splitByFont(text, key, (k, cp) => (k === key ? face : this.faces.get(k))?.hasGlyphForCodePoint(cp) ?? false, this.fallbacks, this.fallbackOf);
  }

  // ---------------------------------------------------------------------------------------------
  // Text.

  /** Runs set as one paragraph in `box`, wrapping, from the current line. */
  private flow(runs: Run[], box: Box, o: { align?: "left" | "center" | "right"; size?: number; gap?: number } = {}): void {
    const pdf = this.pdf;
    const parts = runs.flatMap((r) => this.segments(r.text, this.faceKey(r)).map((s) => ({ ...r, text: s.text, key: s.key }))).filter((p) => p.text);
    parts.forEach((p, i) => {
      pdf
        .font(p.key)
        .fontSize(p.size ?? o.size ?? BODY)
        .fillColor(p.color ?? box.color ?? PRINT.fg);
      const options = { width: box.width, align: o.align ?? "left", lineGap: o.gap ?? 2.5, continued: i < parts.length - 1, link: p.link ?? null, goTo: p.goTo ?? null, underline: false, strike: !!p.strike } as unknown as TextOptions;
      if (i === 0) pdf.text(p.text, box.x, pdf.y, options);
      else pdf.text(p.text, options);
    });
    pdf.x = MARGIN.left;
  }

  /** Room for `h` points down the page, or a new page. */
  private ensure(h: number): void {
    if (this.pdf.y + h > this.pdf.page.height - MARGIN.bottom) this.pdf.addPage();
  }

  /** The page being written: the last there is. */
  private page(): number {
    const r = this.pdf.bufferedPageRange();
    return r.start + r.count - 1;
  }

  /** Inline content as runs, and its pictures apart. */
  private pieces(nodes: PhrasingContent[], base: Style = {}): Piece[] {
    const out: Piece[] = [];
    const add = (r: Run) => {
      const last = out.at(-1);
      if (last && "runs" in last) last.runs.push(r);
      else out.push({ runs: [r] });
    };
    const walk = (ns: PhrasingContent[], s: Style) => {
      for (const n of ns) {
        switch (n.type) {
          case "text":
            add({ ...s, text: n.value.replace(/\n/g, " ") });
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
          case "inlineCode":
            add({ ...s, text: n.value, mono: true, size: (s.size ?? BODY) * 0.92 });
            break;
          case "break":
            add({ ...s, text: "\n" });
            break;
          case "link":
            walk(n.children, { ...s, color: TINT.link, ...(n.url.startsWith("#") ? { goTo: n.url.slice(1) } : { link: n.url }) });
            break;
          case "image": {
            const picture = (n.data as { picture?: ExportPicture } | undefined)?.picture;
            if (picture) out.push({ picture, alt: n.alt ?? "" });
            else add({ ...s, text: n.alt || "picture", italic: true });
            break;
          }
          case "inlineMath":
            add({ ...s, text: mathText(n.value) ?? `$${n.value}$`, italic: true });
            break;
          case "footnoteReference": {
            if (!this.defs.has(n.identifier)) break;
            if (!this.notes.has(n.identifier)) this.notes.set(n.identifier, this.notes.size + 1);
            const k = this.notes.get(n.identifier)!;
            const mark = this.superscripts ? [...String(k)].map((d) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[Number(d)]).join("") : `[${k}]`;
            add({ ...s, text: mark, color: TINT.link, goTo: this.noteId(k), ...(this.superscripts ? {} : { size: (s.size ?? BODY) * 0.8 }) });
            break;
          }
          default:
            if ("children" in n) walk(n.children as PhrasingContent[], s);
            else if ("value" in n) add({ ...s, text: String(n.value) });
        }
      }
    };
    walk(nodes, base);
    return out;
  }

  private runs(nodes: PhrasingContent[], base: Style = {}): Run[] {
    return this.pieces(nodes, base).flatMap((p) => ("runs" in p ? p.runs : [{ ...base, text: p.alt || "picture", italic: true }]));
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
    this.defs = new Map(ch.nodes.flatMap((n) => (n.type === "footnoteDefinition" ? [[n.identifier, n.children] as const] : [])));
    pdf.addNamedDestination(ch.anchor, "XYZ", MARGIN.left, pdf.y, null);
    this.outline = pdf.outline.addItem(ch.title);
    const box: Box = { x: MARGIN.left, width: pdf.page.width - MARGIN.left - MARGIN.right };
    const nodes = ch.nodes.filter((n) => n.type !== "footnoteDefinition");
    const first = nodes[0];
    if (!(first?.type === "heading" && first.depth === 1)) this.heading({ type: "heading", depth: 1, children: [{ type: "text", value: ch.title }] }, box);
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
    const runs = this.runs(n.children, { bold: true, size, color: n.depth === 6 ? PRINT.muted : PRINT.fg });
    this.flow(runs, box, { size });
    if (n.depth === 2) this.outline?.addItem(runs.map((r) => r.text).join(""));
    if (n.depth <= 2) {
      pdf.y += 3;
      pdf.save().moveTo(box.x, pdf.y).lineTo(box.x + box.width, pdf.y).lineWidth(0.5).strokeColor(TINT.border).stroke().restore();
    }
    pdf.y += size * 0.4;
  }

  private paragraph(children: PhrasingContent[], box: Box): void {
    for (const piece of this.pieces(children)) {
      if ("picture" in piece) this.picture(piece.picture, piece.alt, box);
      else if (piece.runs.some((r) => r.text.trim())) {
        this.ensure(BODY * 1.5);
        this.flow(piece.runs, box);
        this.pdf.y += box.gap ?? GAP;
      }
    }
  }

  private quote(n: Blockquote, box: Box): void {
    const kind = (n.data as { callout?: string } | undefined)?.callout;
    const inner: Box = { ...box, x: box.x + 14, width: box.width - 14, color: kind ? box.color : PRINT.muted };
    this.barred(kind ? calloutColour(kind) : TINT.border, box.x + 3, () => this.blocks(n.children, inner));
  }

  /** What `body` writes, with a bar down its left at `x`, page by page. */
  private barred(colour: string, x: number, body: () => void): void {
    const pdf = this.pdf;
    const [startPage, startY] = [this.page(), pdf.y];
    body();
    const [endPage, endY] = [this.page(), pdf.y - 4];
    for (let p = startPage; p <= endPage; p++) {
      pdf.switchToPage(p);
      const top = p === startPage ? startY : MARGIN.top;
      const bottom = p === endPage ? endY : pdf.page.height - MARGIN.bottom;
      if (bottom > top) pdf.save().moveTo(x, top).lineTo(x, bottom).lineWidth(2.5).strokeColor(colour).stroke().restore();
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
        typeof item.checked === "boolean" ? (this.boxes ? (item.checked ? "☑" : "☐") : item.checked ? "[x]" : "[ ]") : ordered ? `${k++}.` : depth % 2 ? "◦" : "•";
      const w = typeof item.checked === "boolean" && !this.boxes ? pdf.widthOfString("[x] ") : markerW;
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
      const text = line.replace(/\t/g, "    ");
      pdf.font("mono").fontSize(CODE);
      const h = Math.max(pdf.heightOfString(text || " ", { width: inner.width, lineGap: 1 }), pdf.currentLineHeight(true));
      const top = i === 0 ? pad : 0;
      const bottom = i === lines.length - 1 ? pad : 0;
      this.ensure(h + top + bottom);
      pdf.save().rect(box.x, pdf.y, box.width, h + top + bottom).fill(TINT.code).restore();
      pdf.y += top;
      const runs: Run[] = (tokens?.[i]?.length ? tokens[i]! : [{ text: line, role: undefined }]).map((t) => ({ text: t.text.replace(/\t/g, "    "), mono: true, size: CODE, color: (t.role && SYNTAX[t.role]) || PRINT.fg }));
      const y = pdf.y;
      if (text.trim()) this.flow(runs, inner, { size: CODE, gap: 1 });
      pdf.y = y + h + bottom;
    });
    pdf.y += GAP + 2;
  }

  /** A picture, centred, at its size up to the box's width and the page's height; its words where it can't be drawn. */
  private picture(pic: ExportPicture, alt: string, box: Box, scale = 2): void {
    const pdf = this.pdf;
    const r = rasterOf(pic, this.r, box.width / PX, ["png", "jpg"], scale);
    if (!r) {
      this.flow([{ text: alt || "picture", italic: true, color: PRINT.muted }], box);
      pdf.y += box.gap ?? GAP;
      return;
    }
    let [w, h] = [r.shown.width * PX, r.shown.height * PX];
    const most = pdf.page.height - MARGIN.top - MARGIN.bottom;
    if (h > most) [w, h] = [(w * most) / h, most];
    this.ensure(h);
    pdf.image(Buffer.from(r.data), box.x + (box.width - w) / 2, pdf.y, { width: w, height: h });
    pdf.y += h + GAP + 2;
  }

  private displayMath(n: MathNode, box: Box): void {
    const pic = (n.data as { picture?: ExportPicture } | undefined)?.picture;
    // Typeset, drawn sharper than a picture: maths is small.
    if (pic) return this.picture(pic, n.value, box, 3);
    for (const row of mathRows(n.value) ?? n.value.split("\n")) this.flow([{ text: row, mono: true }], box, { align: "center" });
    this.pdf.y += GAP;
  }

  private rule(box: Box): void {
    const pdf = this.pdf;
    this.ensure(12);
    pdf.y += 4;
    pdf.save().moveTo(box.x, pdf.y).lineTo(box.x + box.width, pdf.y).lineWidth(0.75).strokeColor(TINT.border).stroke().restore();
    pdf.y += 8;
  }

  /** A table: its columns as wide as their words need, shared out where they don't fit; a row never split. */
  private table(n: Table, box: Box): void {
    const pdf = this.pdf;
    const size = BODY * 0.92;
    const pad = 4;
    const rows = n.children.map((row, i) => row.children.map((cell) => this.runs(cell.children, i === 0 ? { bold: true, size } : { size })));
    const cols = Math.max(...rows.map((r) => r.length));
    const plain = (runs: Run[] | undefined) => (runs ?? []).map((r) => r.text).join("");
    const widthOf = (text: string, bold: boolean) => pdf.font(bold ? "bold" : "regular").fontSize(size).widthOfString(text);
    const natural = Array.from({ length: cols }, (_, c) => Math.max(...rows.map((r, i) => widthOf(plain(r[c]), i === 0))) + 2 * pad + 1);
    const least = Array.from({ length: cols }, (_, c) => Math.min(natural[c]!, Math.max(...rows.flatMap((r, i) => plain(r[c]).split(/\s+/).map((word) => widthOf(word, i === 0)))) + 2 * pad + 1));
    let widths = natural;
    const total = natural.reduce((a, b) => a + b, 0);
    if (total > box.width) {
      // What's left after each column's longest word, shared by how much more each would take.
      const spare = Math.max(0, box.width - least.reduce((a, b) => a + b, 0));
      const want = natural.map((w, c) => w - least[c]!);
      const wanted = want.reduce((a, b) => a + b, 0) || 1;
      widths = least.map((w, c) => w + (spare * want[c]!) / wanted);
      const sum = widths.reduce((a, b) => a + b, 0);
      if (sum > box.width) widths = widths.map((w) => (w * box.width) / sum);
    }
    const ALIGN = { left: "left", center: "center", right: "right" } as const;
    const heightOf = (row: Run[][], header: boolean) =>
      Math.max(...widths.map((w, c) => pdf.font(header ? "bold" : "regular").fontSize(size).heightOfString(plain(row[c]) || " ", { width: w - 2 * pad, lineGap: 1.5 }))) + 2 * pad;
    const drawRow = (row: Run[][], header: boolean) => {
      const h = heightOf(row, header);
      const y = pdf.y;
      let x = box.x;
      widths.forEach((w, c) => {
        if (header) pdf.save().rect(x, y, w, h).fill(TINT.code).restore();
        pdf.save().rect(x, y, w, h).lineWidth(0.5).strokeColor(TINT.border).stroke().restore();
        pdf.y = y + pad;
        if (row[c]?.length) this.flow(row[c]!, { x: x + pad, width: w - 2 * pad }, { size, gap: 1.5, align: ALIGN[n.align?.[c] as keyof typeof ALIGN] ?? "left" });
        x += w;
      });
      pdf.y = y + h;
    };
    pdf.y += 2;
    rows.forEach((row, i) => {
      const h = heightOf(row, i === 0);
      if (pdf.y + h > pdf.page.height - MARGIN.bottom) {
        pdf.addPage();
        // The header again, on the new page.
        if (i > 0 && rows[0]) drawRow(rows[0], true);
      }
      drawRow(row, i === 0);
    });
    pdf.y += GAP + 4;
  }

  /** This chapter's footnotes, at its end: numbered as they're referred to, each a destination its mark links to. */
  private endnotes(box: Box): void {
    if (!this.notes.size) return;
    const pdf = this.pdf;
    this.ensure(BODY * 5);
    pdf.y += GAP;
    pdf.save().moveTo(box.x, pdf.y).lineTo(box.x + 120, pdf.y).lineWidth(0.5).strokeColor(TINT.border).stroke().restore();
    pdf.y += 6;
    this.flow([{ text: "Notes", bold: true, size: BODY * 0.92 }], box);
    pdf.y += 4;
    for (const [id, k] of [...this.notes].sort((a, b) => a[1] - b[1])) {
      this.ensure(BODY * 2);
      pdf.addNamedDestination(this.noteId(k), "XYZ", box.x, pdf.y, null);
      const y = pdf.y;
      this.flow([{ text: `${k}.`, color: PRINT.muted }], { x: box.x, width: 24 });
      pdf.y = y;
      this.blocks(this.defs.get(id) ?? [], { ...box, x: box.x + 22, width: box.width - 22, color: PRINT.muted, gap: TIGHT });
    }
  }

  /** Each page's number at its foot, centred. */
  private pageNumbers(): void {
    const pdf = this.pdf;
    const range = pdf.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      pdf.switchToPage(i);
      const bottom = pdf.page.margins.bottom;
      // Written below the margin: no new page for it.
      pdf.page.margins.bottom = 0;
      pdf
        .font("regular")
        .fontSize(8.5)
        .fillColor(PRINT.muted)
        .text(String(i + 1), MARGIN.left, pdf.page.height - 44, { width: pdf.page.width - MARGIN.left - MARGIN.right, align: "center", lineBreak: false });
      pdf.page.margins.bottom = bottom;
    }
  }
}
