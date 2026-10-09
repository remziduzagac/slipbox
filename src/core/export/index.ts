// Export (plan 10.x): the formats a note — or notes, as one document (10.9) — is exported to, each a writer over the
// assembled document (`assemble.ts`), every one TypeScript or JavaScript under a permissive licence: no tool is run,
// nothing is installed. Where one would need one (a headless browser, pandoc: 10.7, 10.8), it isn't a format.

import { statSync } from "node:fs";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";
import { climbsOut } from "../fsutil.ts";
import type { Graph } from "../graph.ts";
import { assemble, type ExportDoc } from "./assemble.ts";

export interface ExportFormat {
  /** Its name, as `--to` takes it. */
  name: string;
  /** What it's called, for a list. */
  title: string;
  /** Its files' extension. */
  ext: string;
  write(doc: ExportDoc): Promise<Uint8Array>;
}

// Each writer loaded when it's used: nothing of theirs is paid for at start.
export const FORMATS: ExportFormat[] = [{ name: "docx", title: "Word (.docx)", ext: "docx", write: async (doc) => (await import("./docx.ts")).toDocx(doc) }];

/** Other names a format answers to. */
const ALIASES: Record<string, string> = { word: "docx", doc: "docx" };

/** A format by its name, an alias, or an extension; null where there's none. */
export function formatFor(name: string): ExportFormat | null {
  const n = name.toLowerCase().replace(/^\./, "");
  return FORMATS.find((f) => f.name === (ALIASES[n] ?? n) || f.ext === n) ?? null;
}

/** Where an export of the note at `abs` goes unless it's said: beside it, its name, the format's extension. */
export function defaultTarget(abs: string, format: ExportFormat): string {
  return join(dirname(abs), `${basename(abs, extname(abs))}.${format.ext}`);
}

/**
 * Where an export of notes, `first` the first, goes: `typed` (from `base`) — a folder the default's name in it — else
 * beside the first note. Never over a note of the root: an error says so.
 */
export function exportTarget(graph: Graph, first: string, format: ExportFormat, typed: string | null, base: string): string {
  const suggested = defaultTarget(graph.abs(first), format);
  let target = typed ? resolve(base, typed) : suggested;
  try {
    if (statSync(target).isDirectory()) target = join(target, basename(suggested));
  } catch {}
  const rel = relative(graph.root, target).split(sep).join("/");
  if (!climbsOut(rel) && graph.notes.has(rel)) throw new Error(`${rel} is a note — an export doesn't write over it`);
  return target;
}

/** The notes at `rels` (in this root, in this order) as one document in `format`: its bytes. */
export async function exportNotes(graph: Graph, rels: string[], format: ExportFormat): Promise<Uint8Array> {
  return format.write(await assemble(graph, rels));
}
