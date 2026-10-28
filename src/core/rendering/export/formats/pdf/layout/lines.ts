// Per-writer line layout and inline-picture cache; words, graphemes and baseline placement stay unchanged.
import type { Rasterizer } from "../../../../media/images/svg.ts";
import { mathSize, rasterOf } from "../../../assets/images.ts";
import type { Style, InlinePicture, Inline, Atom, Line } from "../contracts.ts";
import { BODY, PX, EX } from "../settings.ts";
import type { PdfFonts } from "../fonts/adapter.ts";
import { OBJECT, words } from "./breaks.ts";

export class PdfLines {
  /** Pictures drawn for a line, by what they're of and how wide: each made once. */
  private readonly drawn = new Map<string, { data: Buffer; width: number; height: number } | null>();

  constructor(
    private readonly pdf: PDFKit.PDFDocument,
    private readonly fonts: Pick<PdfFonts, "segments" | "faceKey" | "metrics">,
    private readonly r: Rasterizer | null,
  ) {}

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
  lines(content: Inline[], width: number, base: { size?: number; color?: string } = {}): Line[] {
    return this.layout(content, width, base).lines;
  }

  /** `lines`, and how wide its widest word is (what a table's column can't be narrower than). */
  layout(
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
        const m = this.fonts.metrics("regular", size0);
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
    for (const seg of this.fonts.segments(text, this.fonts.faceKey(s))) {
      for (const part of seg.text.split(/(\n|[^\S\n]+)/)) {
        if (!part) continue;
        const space = /^\s+$/.test(part);
        const m = this.fonts.metrics(seg.key, size);
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
  height(lines: Line[], gap = 2.5): number {
    return lines.reduce((h, l) => h + l.ascent + l.descent + gap, 0);
  }
}
