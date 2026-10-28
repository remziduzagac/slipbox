// PDF font registration, fallback identity and live PDFKit metrics.
import type { Font } from "fontkit";
import { type Face, type Fonts, openFace } from "../../../assets/fonts.ts";
import type { Style } from "../contracts.ts";

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

export class PdfFonts {
  /** Each font's faces, as fontkit reads them: what says whether one has a character. */
  private readonly faces = new Map<string, Font | null>();

  private readonly fallbacks: string[] = [];

  private readonly fallbackOf = new Map<number, string>();

  constructor(
    private readonly pdf: PDFKit.PDFDocument,
    private readonly fonts: Fonts,
  ) {
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
  }

  // ---------------------------------------------------------------------------------------------
  // Fonts: a run's face, and another's for what it hasn't got.
  /** Whether some font here has every character of `text`. */
  covered(text: string): boolean {
    if (this.fonts.builtin) return false;
    return [...text].every((ch) => [...this.faces.values()].some((f) => f?.hasGlyphForCodePoint(ch.codePointAt(0)!)));
  }

  faceKey(s: Style): string {
    if (s.mono) return s.bold ? "monoBold" : "mono";
    return s.bold && s.italic ? "boldItalic" : s.bold ? "bold" : s.italic ? "italic" : "regular";
  }

  /** `text` in the face `key`, split where it has no glyph and a fallback has: each piece and its font. */
  segments(text: string, key: string): { text: string; key: string }[] {
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
  metrics(font: string, size: number): { ascent: number; descent: number } {
    const f = (this.pdf.font(font).fontSize(size) as unknown as { _font: { ascender: number; descender: number } })
      ._font;
    return { ascent: (f.ascender / 1000) * size, descent: (-f.descender / 1000) * size };
  }
}
