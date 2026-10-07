// What a file is to slipbox (plan 16.1, docs/idea.md "Files beyond markdown"): three groups.
//
// - notes: markdown, the files with an extension in the root's `walk.extensions`. They are the
//   link graph.
// - data: JSON, YAML, TOML, INI, CSV/TSV — rendered as documents, not notes.
// - text: every other text file — source mode only, highlighted by language.
//
// Binary files (images, archives…) are none of these: link targets only, never opened.

export type FileGroup = "note" | "data" | "text" | "binary";

export interface FileKind {
  group: FileGroup;
  /** A note's or data file's format ("markdown", "toml"…); for text, its language
   *  (a highlight name: "typescript", "python"…) or "text". */
  format: string;
}

/** Note formats by extension: which ones are notes is the root's `walk.extensions`. */
const NOTE_FORMATS: Record<string, string> = { md: "markdown", markdown: "markdown" };

export const DATA_FORMATS: Record<string, string> = {
  json: "json",
  jsonc: "json",
  json5: "json",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  ini: "ini",
  cfg: "ini",
  conf: "ini",
  properties: "ini",
  env: "ini",
  csv: "csv",
  tsv: "tsv",
};

/** Source languages by extension, as highlight names. */
export const LANGUAGES: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  mts: "typescript",
  cts: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  py: "python",
  pyi: "python",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  fish: "bash",
  lua: "lua",
  go: "go",
  rs: "rust",
  swift: "swift",
  php: "php",
  rb: "ruby",
  java: "java",
  c: "c",
  h: "c",
  cc: "cpp",
  cpp: "cpp",
  hpp: "cpp",
  css: "css",
  scss: "scss",
  html: "xml",
  htm: "xml",
  // Components: template, script and style, each in its language (16.22).
  vue: "vue",
  svelte: "svelte",
  astro: "astro",
  xml: "xml",
  svg: "xml",
  sql: "sql",
  vim: "vim",
  diff: "diff",
  patch: "diff",
  mk: "makefile",
};

/** Whole names that say their language (no extension, or one that misleads). */
export const NAMED: Record<string, string> = {
  makefile: "makefile",
  dockerfile: "dockerfile",
  gemfile: "ruby",
  ".zshrc": "bash",
  ".bashrc": "bash",
  ".profile": "bash",
  ".env": "ini",
};

const BINARY = new Set(
  "png jpg jpeg gif webp bmp ico tiff tif avif heic psd pdf zip gz tgz bz2 xz 7z rar zst tar jar war dmg iso exe dll so dylib a o obj class wasm bin dat db sqlite sqlite3 mp3 mp4 m4a wav ogg flac mov avi mkv webm ttf otf woff woff2 eot pyc node lockb".split(
    " ",
  ),
);

/** An extension slipbox knows as a note, data or source format (not a dot in a name, `v1.2`). */
export function isKnownExtension(ext: string): boolean {
  const e = ext.replace(/^\./, "").toLowerCase();
  return e in NOTE_FORMATS || e in DATA_FORMATS || e in LANGUAGES;
}

/** A note's format from its name: a note is a note by `walk.extensions`; its format, by this. */
export function noteFormat(rel: string): string {
  return NOTE_FORMATS[extensionOf(rel)] ?? "markdown";
}

/** A file's extension, lowercased, without its dot ("" when there is none). */
export function extensionOf(name: string): string {
  const base = name.slice(name.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
}

/**
 * The group and format of a file, by its name: a note when its extension is one of the root's
 * note extensions (`walk.extensions`), data by a data extension, binary by a binary one, and
 * text otherwise — a file that turns out to hold binary bytes is refused when it's opened.
 */
export function classify(name: string, noteExtensions: readonly string[]): FileKind {
  const base = name.slice(name.lastIndexOf("/") + 1).toLowerCase();
  const ext = extensionOf(base);
  if (ext && noteExtensions.some((e) => e.replace(/^\./, "").toLowerCase() === ext)) return { group: "note", format: NOTE_FORMATS[ext] ?? "markdown" };
  if (NAMED[base]) return NAMED[base] === "ini" ? { group: "data", format: "ini" } : { group: "text", format: NAMED[base]! };
  // A Dockerfile for one purpose: `Dockerfile.dev`, `Dockerfile.test`.
  if (base.startsWith("dockerfile.")) return { group: "text", format: "dockerfile" };
  if (DATA_FORMATS[ext]) return { group: "data", format: DATA_FORMATS[ext]! };
  if (BINARY.has(ext)) return { group: "binary", format: ext };
  return { group: "text", format: LANGUAGES[ext] ?? "text" };
}
