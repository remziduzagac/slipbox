// Export (plan 10.x): the formats a note — or notes, as one document (10.9) — is exported to, each a writer over the
// assembled document (`assemble.ts`), every one TypeScript or JavaScript under a permissive licence: no tool is run,
// nothing is installed. Where one would need one (a headless browser, pandoc: 10.7, 10.8), it isn't a format.

import { lstatSync, statSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";
import { atomicWrite, climbsOut, landsInside, realTarget } from "../../foundation/platform/fsutil.ts";
import type { Graph } from "../../workspace/graph/graph.ts";
import { findVaultRoot } from "../../workspace/vaults/vault.ts";
import type { ExportDoc } from "./assemble.ts";
import { backgroundExport, type ExportJobOptions } from "./jobs.ts";
import { isExport, isMarkdownExport } from "./mark.ts";

export { EXPORT_MARK, isExport, isMarkdownExport } from "./mark.ts";

/**
 * An export refused because a file is there that isn't an earlier export (D243): written over only when you say —
 * `--force`, or `y` in the TUI. `target` is where it would have gone.
 */
export class NotAnExport extends Error {
  constructor(
    readonly target: string,
    shown: string,
  ) {
    super(`${shown} isn't an export — an export doesn't write over it without --force`);
  }
}

/** What a writer makes: the document's bytes, and the files beside it (a Markdown export's pictures). */
export interface ExportOutput {
  data: Uint8Array;
  /** Each a path from the document's folder. */
  files: { path: string; data: Uint8Array }[];
}

export interface ExportFormat {
  /** Its name, as `--to` takes it. */
  name: string;
  /** What it's called, for a list. */
  title: string;
  /** Its files' extension. */
  ext: string;
  /** What's added to the note's name for its default file: `.docx`; Markdown's `.export.md`, apart from the note. */
  suffix: string;
  /** The document as this format, to be written to `target`. */
  write(doc: ExportDoc, target: string): Promise<ExportOutput>;
}

const only = (data: Uint8Array): ExportOutput => ({ data, files: [] });

// Each writer loaded when it's used: nothing of theirs is paid for at start.
export const FORMATS: ExportFormat[] = [
  {
    name: "docx",
    title: "Word (.docx)",
    ext: "docx",
    suffix: ".docx",
    write: async (doc) => only(await (await import("./formats/docx.ts")).toDocx(doc)),
  },
  {
    name: "pdf",
    title: "PDF (.pdf)",
    ext: "pdf",
    suffix: ".pdf",
    write: async (doc) => only(await (await import("./formats/pdf.ts")).toPdf(doc)),
  },
  {
    name: "html",
    title: "Web page (.html)",
    ext: "html",
    suffix: ".html",
    write: async (doc) => only(await (await import("./formats/html.ts")).toHtml(doc)),
  },
  {
    name: "epub",
    title: "E-book (.epub)",
    ext: "epub",
    suffix: ".epub",
    write: async (doc) => only(await (await import("./formats/epub.ts")).toEpub(doc)),
  },
  {
    name: "md",
    title: "Markdown (.md)",
    ext: "md",
    suffix: ".export.md",
    write: async (doc, target) => (await import("./formats/markdown.ts")).toMarkdown(doc, target),
  },
];

/** Other names a format answers to. */
const ALIASES: Record<string, string> = {
  word: "docx",
  doc: "docx",
  htm: "html",
  web: "html",
  markdown: "md",
  ebook: "epub",
};

/** A format by its name, an alias, or an extension; null where there's none. */
export function formatFor(name: string): ExportFormat | null {
  const n = name.toLowerCase().replace(/^\./, "");
  return FORMATS.find((f) => f.name === (ALIASES[n] ?? n) || f.ext === n) ?? null;
}

/** Where an export of the note at `abs` goes unless it's said: beside it, its name, the format's suffix. */
export function defaultTarget(abs: string, format: ExportFormat): string {
  return join(dirname(abs), `${basename(abs, extname(abs))}${format.suffix}`);
}

/** Whether a path as typed names a folder: it ends in `/` (or the system's own separator). */
export function namesFolder(typed: string): boolean {
  return typed.endsWith("/") || typed.endsWith(sep);
}

/**
 * Whether the file at `abs` is a note of a root: this one's, as its index has them; or any other's, a file of a note's
 * name in a folder that is a root (where it really is, or as it's reached).
 */
function noteOfARoot(graph: Graph, abs: string): boolean {
  const rel = relative(graph.root, abs).split(sep).join("/");
  if (!climbsOut(rel) && graph.notes.has(rel)) return true;
  if (!graph.filter.isNoteName(basename(abs))) return false;
  try {
    if (!statSync(abs).isFile()) return false;
  } catch {
    return false;
  }
  return findVaultRoot(abs) !== null || findVaultRoot(realTarget(abs)) !== null;
}

/**
 * Where an export of notes, `first` the first, goes: `typed` (from `base`) — a folder, one there or a path ending in
 * `/` (made when it's written), the default's name in it — else beside the first note, in a vault only when that's in
 * it. Never over a note of any root, but an earlier Markdown export: an error says so. Over any other file only when
 * it's an earlier export, in any format, or with `force`: else `NotAnExport` (D243).
 */
export function exportTarget(
  graph: Graph,
  first: string,
  format: ExportFormat,
  typed: string | null,
  base: string,
  force = false,
): string {
  const suggested = defaultTarget(graph.abs(first), format);
  let target = typed ? resolve(base, typed) : suggested;
  if (typed && namesFolder(typed)) target = join(target, basename(suggested));
  else {
    try {
      if (statSync(target).isDirectory()) target = join(target, basename(suggested));
    } catch {}
  }
  if (noteOfARoot(graph, target) && !isMarkdownExport(target))
    throw new Error(`${graph.shownPath(target)} is a note — an export doesn't write over it`);
  // Beside a note a link leads out of the vault to: a place nobody named, outside the vault (VV-D6).
  if (!typed && graph.loc.mode === "vault" && !landsInside(graph.root, target))
    throw new Error(
      `${first} is reached through a link out of the vault: its export isn't written beside it — name a place with --out`,
    );
  // Something there (a link that leads nowhere too) that isn't an earlier export: only when you say (D243).
  if (!force && lstatSync(target, { throwIfNoEntry: false }) && !isExport(target))
    throw new NotAnExport(target, graph.shownPath(target));
  return target;
}

/** The notes at `rels` (in this root, in this order) as one document in `format`, for `target`. */
export async function exportNotes(
  graph: Graph,
  rels: string[],
  format: ExportFormat,
  target: string,
  options?: ExportJobOptions,
): Promise<ExportOutput> {
  return backgroundExport(graph, rels, format.name, target, options);
}

/** An export written: each file beside the document, then the document (atomically, folders made); their paths. */
export function writeExport(target: string, out: ExportOutput): string[] {
  const dir = dirname(target);
  const files = out.files.map((f) => join(dir, f.path));
  // The document last: what it refers to is there when it is.
  out.files.forEach((f, i) => atomicWrite(files[i]!, f.data));
  atomicWrite(target, out.data);
  return files;
}
