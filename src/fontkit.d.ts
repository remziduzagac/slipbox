// fontkit (MIT; pdfkit's own font reader) ships no types: what export's font finder
// (`core/rendering/export/assets/fonts.ts`) uses.
declare module "fontkit" {
  export interface Font {
    postscriptName: string;
    familyName: string;
    hasGlyphForCodePoint(codePoint: number): boolean;
  }
  export interface FontCollection {
    fonts: Font[];
  }
  export function openSync(path: string, postscriptName?: string): Font | FontCollection;
}
