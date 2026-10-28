// Chapter/block writing owns footnotes and outline state; line layout and pages remain collaborators.
import type { Blockquote, Heading, List, PhrasingContent, RootContent, Table } from "mdast";
import type { Math as MathNode } from "mdast-util-math";
import { highlight } from "../../../../layout/markdown/highlight.ts";
import { mathRows, mathText } from "../../../../media/math.ts";
import type { Rasterizer } from "../../../../media/images/svg.ts";
import type { ExportChapter, ExportPicture } from "../../../assemble.ts";
import { rasterOf } from "../../../assets/images.ts";
import { calloutColour, PRINT, SYNTAX, TINT } from "../../../assets/style.ts";
import type { Style, InlinePicture, Inline, Box, Line } from "../contracts.ts";
import { MARGIN, BODY, CODE, HEADING, PX, GAP, TIGHT } from "../settings.ts";
import type { PdfFonts } from "../fonts/adapter.ts";
import type { PdfLines } from "../layout/lines.ts";
import type { PdfPainter } from "../layout/paint.ts";
import type { PdfPagination } from "../pages/pagination.ts";

export class PdfBlocks {
  /** This chapter's footnotes: each one's number, in the order they're referred to, and its blocks. */
  private notes = new Map<string, number>();

  private defs = new Map<string, RootContent[]>();

  private chapter = "";

  private outline: PDFKit.PDFOutline | null = null;

  private readonly superscripts: boolean;

  private readonly boxes: boolean;

  constructor(
    private readonly pdf: PDFKit.PDFDocument,
    fonts: Pick<PdfFonts, "covered">,
    private readonly r: Rasterizer | null,
    private readonly layout: PdfLines,
    private readonly painter: PdfPainter,
    private readonly pages: PdfPagination,
  ) {
    this.superscripts = fonts.covered("¹²³⁴⁵⁶⁷⁸⁹⁰");
    this.boxes = fonts.covered("☐☑");
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
  writeChapter(ch: ExportChapter): void {
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
    this.pages.ensure(size * 1.4 + BODY * 3);
    const anchor = (n.data as { anchor?: string } | undefined)?.anchor;
    if (anchor) pdf.addNamedDestination(anchor, "XYZ", box.x, pdf.y, null);
    const content = this.inlines(n.children, { bold: true, size, color: n.depth === 6 ? PRINT.muted : PRINT.fg });
    this.painter.flow(content, box, { size });
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
    this.painter.flow(content, box);
    this.pdf.y += (box.gap ?? GAP) - 2.5;
  }

  private quote(n: Blockquote, box: Box): void {
    const kind = (n.data as { callout?: string } | undefined)?.callout;
    const inner: Box = { ...box, x: box.x + 14, width: box.width - 14, color: kind ? box.color : PRINT.muted };
    this.pages.barred(kind ? calloutColour(kind) : TINT.border, box.x + 3, () => this.blocks(n.children, inner));
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
      this.pages.ensure(BODY * 2);
      const y = pdf.y;
      this.painter.flow([{ text: marker, color: box.color }], { x: box.x, width: w + 20 });
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
      const laid = this.layout.lines(line ? runs : [{ text: " ", mono: true, size: CODE }], inner.width, {
        size: CODE,
      });
      const h = this.layout.height(laid, 1);
      const top = i === 0 ? pad : 0;
      const bottom = i === lines.length - 1 ? pad : 0;
      this.pages.ensure(h + top + bottom);
      pdf
        .save()
        .rect(box.x, pdf.y, box.width, h + top + bottom)
        .fill(TINT.code)
        .restore();
      pdf.y += top;
      this.painter.draw(laid, inner, { gap: 1, keep: true });
      pdf.y += bottom;
    });
    pdf.y += GAP + 2;
  }

  /** A picture, centred, at its size up to the box's width and the page's height; its words where it can't be drawn. */
  private picture(pic: ExportPicture, alt: string, box: Box, scale = 2, style: Style = {}): void {
    const pdf = this.pdf;
    const r = rasterOf(pic, this.r, box.width / PX, ["png", "jpg"], scale);
    if (!r) {
      this.painter.flow([{ ...style, text: alt || "picture", italic: true, color: PRINT.muted }], box);
      pdf.y += (box.gap ?? GAP) - 2.5;
      return;
    }
    let [w, h] = [r.shown.width * PX, r.shown.height * PX];
    const most = pdf.page.height - MARGIN.top - MARGIN.bottom;
    if (h > most) [w, h] = [(w * most) / h, most];
    this.pages.ensure(h);
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
      this.painter.flow([{ text: row, mono: true }], box, { align: "center" });
    this.pdf.y += GAP;
  }

  private rule(box: Box): void {
    const pdf = this.pdf;
    this.pages.ensure(12);
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
      Array.from({ length: cols }, (_, c) => this.layout.layout(r[c] ?? [], Number.POSITIVE_INFINITY, { size })),
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
    const laid = (row: Inline[][]) => widths.map((w, c) => this.layout.lines(row[c] ?? [], w - 2 * pad, { size }));
    const heightOf = (cells: Line[][]) => Math.max(...cells.map((l) => this.layout.height(l, 1.5))) + 2 * pad;
    const drawRow = (cells: Line[][], header: boolean) => {
      const h = heightOf(cells);
      const y = pdf.y;
      let x = box.x;
      widths.forEach((w, c) => {
        if (header) pdf.save().rect(x, y, w, h).fill(TINT.code).restore();
        pdf.save().rect(x, y, w, h).lineWidth(0.5).strokeColor(TINT.border).stroke().restore();
        pdf.y = y + pad;
        this.painter.draw(
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
        this.pages.addPage();
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
    this.pages.ensure(BODY * 5);
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
    this.painter.flow([{ text: "Notes", bold: true, size: BODY * 0.92 }], box);
    pdf.y += 2;
    for (const [id, k] of [...this.notes].sort((a, b) => a[1] - b[1])) {
      this.pages.ensure(BODY * 2);
      pdf.addNamedDestination(this.noteId(k), "XYZ", box.x, pdf.y, null);
      const y = pdf.y;
      this.painter.flow([{ text: `${k}.`, color: PRINT.muted }], { x: box.x, width: 24 });
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
}
