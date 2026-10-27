// Export to Word (plan 10.4): the assembled document (`assemble.ts`) as a .docx, by `docx` (MIT) — no Word, no tool.
// Headings (each a bookmark, so a link to it lands), paragraphs, lists (numbered ones counting from their own start),
// tasks' boxes, quotes, code (monospaced, its syntax coloured), tables, footnotes, links (inside the document to a
// bookmark, else to the web), pictures (PNG, JPEG, GIF, BMP as they are; an SVG, a diagram, a display's maths
// rasterised; a WebP its words — Word holds none), inline maths as Unicode text. A chapter a note, a page each.

import {
  AlignmentType,
  BorderStyle,
  Bookmark,
  Document,
  ExternalHyperlink,
  type FileChild,
  FootnoteReferenceRun,
  HeadingLevel,
  type ILevelsOptions,
  ImageRun,
  InternalHyperlink,
  LevelFormat,
  Packer,
  PageBreak,
  Paragraph,
  type ParagraphChild,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { PhrasingContent, RootContent, TableRow as MdRow } from "mdast";
import { highlight } from "../../layout/markdown/highlight.ts";
import { mathRows, mathText } from "../../media/math.ts";
import { loadRasterizer, type Rasterizer } from "../../media/images/svg.ts";
import type { ExportDoc, ExportPicture } from "../assemble.ts";
import { calloutColour } from "../assets/style.ts";
import { convertPictures } from "../assets/convert.ts";
import { type Raster, rasterOf } from "../assets/images.ts";

/** The pictures Word holds as they are. */
const KINDS: Raster["type"][] = ["png", "jpg", "gif", "bmp"];

/** The page's text width, in pixels at 96 to the inch: A4 less an inch each side. */
const PAGE_PX = 600;
const MONO = "Consolas";
/** Syntax's colours on paper (GitHub's light), by the role highlighting gives a token. */
const SYNTAX: Record<string, string> = {
  syn_keyword: "CF222E",
  syn_string: "0A3069",
  syn_regexp: "0A3069",
  syn_comment: "6E7781",
  syn_meta: "6E7781",
  syn_function: "8250DF",
  syn_type: "953800",
  syn_variable: "953800",
  syn_number: "0550AE",
  syn_constant: "0550AE",
  syn_builtin: "0550AE",
  syn_attr: "0550AE",
  syn_section: "0550AE",
  syn_tag: "116329",
  syn_addition: "116329",
  syn_deletion: "CF222E",
};

interface Style {
  underline?: boolean;
  bold?: boolean;
  italics?: boolean;
  strike?: boolean;
  code?: boolean;
  link?: boolean;
  /** Obsidian's `==highlight==`: Word's yellow marker. */
  mark?: boolean;
}

interface Writer {
  r: Rasterizer | null;
  /** Footnotes by their label: their number in the document and their paragraphs. */
  notes: Map<string, { n: number; children: Paragraph[] }>;
  /** Each numbered list its own numbering, counting from its own start. */
  numbering: { reference: string; levels: ILevelsOptions[] }[];
}

/** A bookmark's name, as Word takes one: a letter first, letters, digits and `_`, at most 40 — unique by a hash. */
export function bookmarkName(anchor: string): string {
  let h = 0;
  for (const ch of anchor) h = (Math.imul(h, 31) + ch.codePointAt(0)!) | 0;
  return `s_${anchor.replace(/[^A-Za-z0-9]/g, "_").slice(0, 28)}_${(h >>> 0).toString(36)}`;
}

/** The document as a .docx file's bytes. */
export async function toDocx(doc: ExportDoc): Promise<Uint8Array> {
  const r = await loadRasterizer();
  // What Word holds: PNG, JPEG, GIF, BMP; a WebP made a PNG first.
  await convertPictures(doc, KINDS, r);
  const w: Writer = { r, notes: new Map(), numbering: [] };
  // Footnotes first: their numbers, in the order they're defined.
  for (const ch of doc.chapters)
    for (const n of ch.nodes)
      if (n.type === "footnoteDefinition") w.notes.set(n.identifier, { n: w.notes.size + 1, children: [] });
  for (const ch of doc.chapters)
    for (const n of ch.nodes)
      if (n.type === "footnoteDefinition")
        w.notes.get(n.identifier)!.children = blocks(n.children, w, 0).filter(
          (c): c is Paragraph => c instanceof Paragraph,
        );
  const body: FileChild[] = [];
  doc.chapters.forEach((ch, k) => {
    const nodes = ch.nodes.filter((n) => n.type !== "footnoteDefinition");
    const first = nodes[0];
    // Its title a heading — the note's own first one when it opens with one — holding the chapter's bookmark.
    const titled = first?.type === "heading" && first.depth === 1;
    const head = titled
      ? (blocks([first], w, 0)[0] as Paragraph)
      : new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(ch.title)] });
    body.push(
      new Paragraph({
        children: [...(k > 0 ? [new PageBreak()] : []), new Bookmark({ id: bookmarkName(ch.anchor), children: [] })],
      }),
      head,
    );
    body.push(...blocks(titled ? nodes.slice(1) : nodes, w, 0));
  });
  const footnotes = Object.fromEntries(
    [...w.notes.values()].map((f) => [f.n, { children: f.children.length ? f.children : [new Paragraph("")] }]),
  );
  const file = new Document({
    title: doc.title,
    ...(doc.author ? { creator: doc.author } : {}),
    // The mark that tells a later export this file is one of slipbox's, to replace (`mark.ts`).
    customProperties: [{ name: "generator", value: "slipbox" }],
    styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
    numbering: { config: w.numbering },
    footnotes,
    sections: [{ children: body }],
  });
  return Packer.toBuffer(file);
}

/** Blocks as Word's paragraphs and tables; `quote`: how deep in quotes they are, `bar` the colour of the quote's bar. */
function blocks(nodes: RootContent[], w: Writer, quote: number, list?: { level: number }, bar = "D0D7DE"): FileChild[] {
  const out: FileChild[] = [];
  // In a quote: in from a bar; in a list item, at the item's indentation.
  const indent = 567 * quote + (list ? 720 * (list.level + 1) : 0);
  const quoted = {
    ...(indent ? { indent: { left: indent } } : {}),
    ...(quote ? { border: { left: { style: BorderStyle.SINGLE, size: 12, color: bar, space: 8 } } } : {}),
  };
  for (const n of nodes) {
    switch (n.type) {
      case "heading": {
        const anchor = (n.data as { anchor?: string } | undefined)?.anchor;
        const children = runs(n.children, {}, w);
        out.push(
          new Paragraph({
            heading: HEADINGS[n.depth - 1],
            children: anchor ? [new Bookmark({ id: bookmarkName(anchor), children })] : children,
          }),
        );
        break;
      }
      case "paragraph":
        out.push(new Paragraph({ ...quoted, children: runs(n.children, {}, w) }));
        break;
      case "blockquote": {
        // A callout: its bar in its kind's colour.
        const kind = (n.data as { callout?: string } | undefined)?.callout;
        out.push(
          ...blocks(n.children, w, quote + 1, undefined, kind ? calloutColour(kind).slice(1).toUpperCase() : "D0D7DE"),
        );
        break;
      }
      case "list": {
        const level = list ? list.level + 1 : 0;
        const reference = n.ordered ? `ordered${w.numbering.length + 1}` : null;
        if (reference) w.numbering.push({ reference, levels: [numberLevel(level, n.start ?? 1)] });
        for (const item of n.children) {
          const [lead, ...rest] = item.children;
          const box = item.checked === true ? "☑ " : item.checked === false ? "☐ " : "";
          const mark = reference ? { numbering: { reference, level } } : { bullet: { level } };
          const leadRuns = lead?.type === "paragraph" ? runs(lead.children, {}, w) : [];
          out.push(
            new Paragraph({
              ...mark,
              ...(quote ? quoted : {}),
              children: [...(box ? [new TextRun(box)] : []), ...leadRuns],
            }),
          );
          // What else it holds: at its own indentation, a list inside it a level in.
          out.push(...blocks(lead && lead.type !== "paragraph" ? [lead, ...rest] : rest, w, quote, { level }, bar));
        }
        break;
      }
      case "code":
        out.push(...code(n.value, n.lang ?? null, quoted));
        break;
      case "math":
        out.push(...displayMath(n.value, (n.data as { picture?: ExportPicture } | undefined)?.picture, w, quoted));
        break;
      case "table":
        out.push(table(n.children, n.align ?? [], w));
        break;
      case "thematicBreak":
        out.push(
          new Paragraph({
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "D0D7DE", space: 1 } },
            children: [],
          }),
        );
        break;
      default:
        break;
    }
  }
  return out;
}

/** A numbered list's level: `1.`, from `start`, indented as deep as it's nested. */
function numberLevel(level: number, start: number): ILevelsOptions {
  return {
    level,
    start,
    format: LevelFormat.DECIMAL,
    text: `%${level + 1}.`,
    alignment: AlignmentType.START,
    style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
  };
}

const HEADINGS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
];

/** Inline content as runs: text in its style, links, pictures, footnotes' marks, maths as Unicode text. */
function runs(nodes: PhrasingContent[], s: Style, w: Writer): ParagraphChild[] {
  const out: ParagraphChild[] = [];
  const text = (value: string, extra: Style = {}) => {
    const st = { ...s, ...extra };
    return new TextRun({
      text: value.replace(/\n/g, " "),
      bold: st.bold,
      italics: st.italics,
      strike: st.strike,
      ...(st.mark ? { highlight: "yellow" } : {}),
      ...(st.code ? { font: MONO, shading: { type: ShadingType.CLEAR, fill: "EFF1F3", color: "auto" } } : {}),
      ...(st.underline ? { underline: {} } : {}),
      ...(st.link ? { color: "0563C1", underline: {} } : {}),
    });
  };
  for (const n of nodes) {
    switch (n.type) {
      case "htmlInline": {
        const p = n.data?.html;
        out.push(
          ...runs(
            n.children,
            {
              ...s,
              ...(p?.bold !== undefined ? { bold: p.bold } : {}),
              ...(p?.italic !== undefined ? { italics: p.italic } : {}),
              ...(p?.strike !== undefined ? { strike: p.strike } : {}),
              ...(p?.underline !== undefined ? { underline: p.underline } : {}),
            },
            w,
          ),
        );
        break;
      }
      case "text":
        out.push(text(n.value));
        break;
      case "strong":
        out.push(...runs(n.children, { ...s, bold: true }, w));
        break;
      case "emphasis":
        out.push(...runs(n.children, { ...s, italics: true }, w));
        break;
      case "delete":
        out.push(...runs(n.children, { ...s, strike: true }, w));
        break;
      case "highlight":
        out.push(...runs(n.children, { ...s, mark: true }, w));
        break;
      case "inlineCode":
        out.push(text(n.value, { code: true }));
        break;
      case "break":
        out.push(new TextRun({ text: "", break: 1 }));
        break;
      case "link": {
        const children = runs(n.children, { ...s, link: true }, w);
        out.push(
          n.url.startsWith("#")
            ? new InternalHyperlink({ anchor: bookmarkName(n.url.slice(1)), children })
            : new ExternalHyperlink({ link: n.url, children }),
        );
        break;
      }
      case "image": {
        const pic = (n.data as { picture?: ExportPicture } | undefined)?.picture;
        const img = pic ? image(pic, w, n.alt ?? "") : null;
        out.push(img ?? text(n.alt || n.url, { italics: true }));
        break;
      }
      case "inlineMath":
        out.push(text(mathText(n.value) ?? `$${n.value}$`, { italics: true }));
        break;
      case "footnoteReference": {
        const f = w.notes.get(n.identifier);
        if (f) out.push(new FootnoteReferenceRun(f.n));
        break;
      }
      default:
        if ("children" in n) out.push(...runs((n as { children: PhrasingContent[] }).children, s, w));
        else if ("value" in n) out.push(text(String((n as { value: unknown }).value)));
    }
  }
  return out;
}

/** A picture as Word's image, shown at its size up to the page's width; null where Word can't hold it. */
function image(pic: ExportPicture, w: Writer, alt: string): ImageRun | null {
  const r = rasterOf(pic, w.r, PAGE_PX, KINDS);
  if (!r) return null;
  return new ImageRun({
    type: r.type as "png",
    data: r.data,
    transformation: { width: r.shown.width, height: r.shown.height },
    altText: { name: alt || "picture", description: alt, title: alt },
  });
}

/** Code: a paragraph a line, monospaced on a tint, its syntax coloured as on paper. */
function code(value: string, lang: string | null, quoted: object): Paragraph[] {
  const lines = value.split("\n");
  const tokens = highlight(value, lang);
  return lines.map(
    (line, i) =>
      new Paragraph({
        ...quoted,
        shading: { type: ShadingType.CLEAR, fill: "F6F8FA", color: "auto" },
        spacing: { before: 0, after: 0 },
        children: (tokens?.[i]?.length ? tokens[i]! : [{ text: line, role: undefined }]).map(
          (t) =>
            new TextRun({
              text: t.text.replace(/\t/g, "    "),
              font: MONO,
              size: 20,
              ...(t.role && SYNTAX[t.role] ? { color: SYNTAX[t.role] } : {}),
              ...(t.role === "syn_comment" ? { italics: true } : {}),
            }),
        ),
      }),
  );
}

/** A display's maths: typeset (its picture), else its Unicode rows, else as written — centred. */
function displayMath(tex: string, pic: ExportPicture | undefined, w: Writer, quoted: object): Paragraph[] {
  const img = pic ? image(pic, w, tex) : null;
  if (img) return [new Paragraph({ ...quoted, alignment: AlignmentType.CENTER, children: [img] })];
  const rows = mathRows(tex) ?? tex.split("\n");
  return rows.map(
    (row) =>
      new Paragraph({
        ...quoted,
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 0 },
        children: [new TextRun({ text: row, font: MONO })],
      }),
  );
}

/** A table: its first row its header, bold; its columns as the markdown aligns them. */
function table(rows: MdRow[], align: (string | null)[], w: Writer): Table {
  const ALIGN = { left: AlignmentType.LEFT, center: AlignmentType.CENTER, right: AlignmentType.RIGHT } as const;
  const border = { style: BorderStyle.SINGLE, size: 4, color: "D0D7DE" };
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: border,
      bottom: border,
      left: border,
      right: border,
      insideHorizontal: border,
      insideVertical: border,
    },
    rows: rows.map(
      (row, i) =>
        new TableRow({
          tableHeader: i === 0,
          children: row.children.map(
            (cell, c) =>
              new TableCell({
                ...(i === 0 ? { shading: { type: ShadingType.CLEAR, fill: "F6F8FA", color: "auto" } } : {}),
                children: [
                  new Paragraph({
                    alignment: ALIGN[align[c] as keyof typeof ALIGN] ?? AlignmentType.LEFT,
                    children: runs(cell.children, i === 0 ? { bold: true } : {}, w),
                  }),
                ],
              }),
          ),
        }),
    ),
  });
}
