// The fonts a PDF export (plan 10.5) is set in, found on the machine — its font folders read, no tool asked: a sans
// family, all four faces where one has them (DejaVu Sans, Liberation, Noto, Arial, Helvetica…), a monospaced one for
// code, and fonts for what those have no glyph for (symbols, CJK), a character at a time. None found, PDF's own
// Helvetica and Courier, which hold Latin-1 only.

import { readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { type Font, type FontCollection, openSync } from "fontkit";

/** A face: its file, and its PostScript name inside a collection (`.ttc`). */
export interface Face {
  path: string;
  ps?: string;
}

export interface Fonts {
  regular: Face;
  bold: Face;
  italic: Face;
  boldItalic: Face;
  mono: Face;
  monoBold: Face;
  /** For a character the face in use has no glyph for, in order. */
  fallbacks: Face[];
  /** Whether these are PDF's built-in fonts: no file found. */
  builtin: boolean;
}

/** A family's faces by file name (any case): regular, bold, italic, bold italic. */
type Family = [string, string, string, string];

const SANS: Family[] = [
  ["DejaVuSans.ttf", "DejaVuSans-Bold.ttf", "DejaVuSans-Oblique.ttf", "DejaVuSans-BoldOblique.ttf"],
  ["LiberationSans-Regular.ttf", "LiberationSans-Bold.ttf", "LiberationSans-Italic.ttf", "LiberationSans-BoldItalic.ttf"],
  ["NotoSans-Regular.ttf", "NotoSans-Bold.ttf", "NotoSans-Italic.ttf", "NotoSans-BoldItalic.ttf"],
  ["Arial.ttf", "Arial Bold.ttf", "Arial Italic.ttf", "Arial Bold Italic.ttf"],
  ["arial.ttf", "arialbd.ttf", "ariali.ttf", "arialbi.ttf"],
  ["Helvetica.ttc#Helvetica", "Helvetica.ttc#Helvetica-Bold", "Helvetica.ttc#Helvetica-Oblique", "Helvetica.ttc#Helvetica-BoldOblique"],
  ["segoeui.ttf", "segoeuib.ttf", "segoeuii.ttf", "segoeuiz.ttf"],
  ["OpenSans-Regular.ttf", "OpenSans-Bold.ttf", "OpenSans-Italic.ttf", "OpenSans-BoldItalic.ttf"],
  ["Roboto-Regular.ttf", "Roboto-Bold.ttf", "Roboto-Italic.ttf", "Roboto-BoldItalic.ttf"],
  ["Ubuntu-R.ttf", "Ubuntu-B.ttf", "Ubuntu-RI.ttf", "Ubuntu-BI.ttf"],
  ["Lato-Regular.ttf", "Lato-Bold.ttf", "Lato-Italic.ttf", "Lato-BoldItalic.ttf"],
  ["SourceSans3-Regular.ttf", "SourceSans3-Bold.ttf", "SourceSans3-It.ttf", "SourceSans3-BoldIt.ttf"],
];

/** Monospaced families: regular and bold. */
const MONO: [string, string][] = [
  ["DejaVuSansMono.ttf", "DejaVuSansMono-Bold.ttf"],
  ["LiberationMono-Regular.ttf", "LiberationMono-Bold.ttf"],
  ["NotoSansMono-Regular.ttf", "NotoSansMono-Bold.ttf"],
  ["Menlo.ttc#Menlo-Regular", "Menlo.ttc#Menlo-Bold"],
  ["consola.ttf", "consolab.ttf"],
  ["UbuntuMono-R.ttf", "UbuntuMono-B.ttf"],
  ["Courier New.ttf", "Courier New Bold.ttf"],
  ["cour.ttf", "courbd.ttf"],
];

/** Fonts for what the chosen ones lack: symbols and arrows, maths, then CJK — the first holding a glyph is used. */
const FALLBACKS = [
  "DejaVuSans.ttf",
  "NotoSans-Regular.ttf",
  "NotoSansSymbols2-Regular.ttf",
  "NotoSansMath-Regular.ttf",
  "Arial Unicode.ttf",
  "Apple Symbols.ttf",
  "seguisym.ttf",
  "NotoSansCJK-Regular.ttc",
  "NotoSansCJKsc-Regular.otf",
  "NotoSansCJKjp-Regular.otf",
  "DroidSansFallbackFull.ttf",
  "wqy-zenhei.ttc",
  "wqy-microhei.ttc",
  "PingFang.ttc",
  "Hiragino Sans GB.ttc",
  "msyh.ttc",
  "meiryo.ttc",
  "malgun.ttf",
];

/** Where fonts are kept: Linux's, macOS's, Windows'. */
function fontDirs(): string[] {
  const home = homedir();
  return [
    "/usr/share/fonts",
    "/usr/local/share/fonts",
    join(home, ".local/share/fonts"),
    join(home, ".fonts"),
    "/System/Library/Fonts",
    "/Library/Fonts",
    join(home, "Library/Fonts"),
    "C:\\Windows\\Fonts",
  ];
}

/** The font files under `dirs`, by their name in lower case (the first of a name wins), a few levels deep. */
export function fontFiles(dirs = fontDirs()): Map<string, string> {
  const files = new Map<string, string>();
  const walk = (dir: string, depth: number) => {
    let names: string[];
    try {
      names = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of names) {
      const path = join(dir, name);
      if (/\.(ttf|otf|ttc)$/i.test(name)) {
        if (!files.has(name.toLowerCase())) files.set(name.toLowerCase(), path);
      } else if (depth < 4) {
        try {
          if (statSync(path).isDirectory()) walk(path, depth + 1);
        } catch {}
      }
    }
  };
  for (const d of dirs) walk(d, 0);
  return files;
}

/** A face named `file` or `file#PostScriptName`, if it's there. */
function face(files: Map<string, string>, spec: string): Face | null {
  const [file, ps] = spec.split("#");
  const path = files.get(file!.toLowerCase());
  return path ? { path, ...(ps ? { ps } : {}) } : null;
}

/** A face as fontkit reads it (the first of a collection), or null where it can't be read. */
export function openFace(f: Face): Font | null {
  try {
    const font = openSync(f.path, f.ps) as Font | FontCollection;
    return "fonts" in font ? (font.fonts[0] ?? null) : font;
  } catch {
    return null;
  }
}

const BUILTIN: Fonts = {
  regular: { path: "Helvetica" },
  bold: { path: "Helvetica-Bold" },
  italic: { path: "Helvetica-Oblique" },
  boldItalic: { path: "Helvetica-BoldOblique" },
  mono: { path: "Courier" },
  monoBold: { path: "Courier-Bold" },
  fallbacks: [],
  builtin: true,
};

/**
 * The fonts a PDF is set in: the first sans family with all four faces, else the first with a regular one (a missing
 * face its nearest); a monospaced one (else the sans); the fallbacks there are. `files`: the machine's font files.
 */
export function findFonts(files = fontFiles()): Fonts {
  const families = SANS.map((fam) => fam.map((spec) => face(files, spec)));
  const full = families.find((fs) => fs.every(Boolean));
  const some = full ?? families.find((fs) => fs[0]);
  if (!some) return BUILTIN;
  const [regular, bold, italic, boldItalic] = some as (Face | null)[];
  const mono = MONO.map(([r, b]) => [face(files, r), face(files, b)] as const).find(([r]) => r);
  const fallbacks = FALLBACKS.map((spec) => face(files, spec)).filter((f): f is Face => !!f && f.path !== regular!.path);
  return {
    regular: regular!,
    bold: bold ?? regular!,
    italic: italic ?? regular!,
    boldItalic: boldItalic ?? bold ?? italic ?? regular!,
    mono: mono?.[0] ?? regular!,
    monoBold: mono?.[1] ?? mono?.[0] ?? bold ?? regular!,
    fallbacks,
    builtin: false,
  };
}

/** A face's name for a reader: its file's. */
export const faceName = (f: Face) => f.ps ?? basename(f.path);
