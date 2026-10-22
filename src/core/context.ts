// The context bundle (9.7): "give me this note, plus what it links to, plus what links to it, as
// one document" — for pasting into an agent or piping to one. The scratch's other half: the
// scratch is hand-picked, the bundle is gathered from the link graph, and both are written the
// same way — each file its reference (`path:1-N`) and its text, fenced (D32).
// Deterministic: breadth first, in the order the links are written.

import { statSync } from "node:fs";
import { isAbsolute, relative } from "node:path";
import { fence, fenceLanguage, formatRef } from "./capture.ts";
import { classify } from "./filetypes.ts";
import { readText } from "./fsutil.ts";
import type { Graph } from "./graph.ts";
import { sanitize } from "./sanitize.ts";

export interface ContextOptions {
  /** How many links out to follow from the notes asked for: 1, what they link to; 0, none. */
  depth: number;
  /** The notes that link to the ones asked for, too. */
  backlinks: boolean;
  /** At most this many files; the rest are named, not included. */
  limit: number;
}

/** Why a file is in the bundle: asked for, linked from one in it, or linking to one asked for. */
export type ContextWhy = "start" | "link" | "backlink";

export interface ContextItem {
  /** Vault-relative, or absolute in another root. */
  path: string;
  why: ContextWhy;
  /** Links from a note asked for (a backlink: 1). */
  depth: number;
  /** The file that brought it in; null for one asked for. */
  from: string | null;
  lines: number;
  text: string;
}

export interface ContextLeft {
  path: string;
  why: ContextWhy;
  from: string;
  reason: "limit" | "binary" | "size" | "unreadable";
}

export interface ContextBundle {
  items: ContextItem[];
  /** Reached but not included, and why. */
  left: ContextLeft[];
  /** The bundle as markdown. */
  text: string;
}

/** How many of the files left out the bundle names. */
const LEFT_LISTED = 20;

/** A file larger than this is named, not included: a log or a dump would drown the notes. */
export const CONTEXT_MAX_FILE = 256 * 1024;

/** Gather the bundle for `start` (vault-relative paths of notes or files). */
export function buildContext(g: Graph, start: string[], opts: ContextOptions): ContextBundle {
  const items: ContextItem[] = [];
  const left: ContextLeft[] = [];
  const seen = new Set<string>();
  const abs = (p: string) => (isAbsolute(p) ? p : g.abs(p));
  /** Take a file in, or say why not. */
  const take = (path: string, why: ContextWhy, depth: number, from: string | null): ContextItem | null => {
    if (seen.has(path)) return null;
    seen.add(path);
    const out = (reason: ContextLeft["reason"]) => {
      left.push({ path, why, from: from ?? path, reason });
      return null;
    };
    // What it is first, so a picture past the limit is named as a picture.
    if (classify(path, g.config.walk.extensions).group === "binary") return out("binary");
    let size: number;
    try {
      size = statSync(abs(path)).size;
    } catch {
      return out("unreadable");
    }
    if (size > CONTEXT_MAX_FILE) return out("size");
    if (items.length >= opts.limit) return out("limit");
    let text: string;
    try {
      text = readText(abs(path)).text;
    } catch {
      return out("unreadable");
    }
    const lines = text === "" ? 0 : text.replace(/\r?\n$/, "").split(/\r?\n/).length;
    const item: ContextItem = { path, why, depth, from, lines, text };
    items.push(item);
    return item;
  };
  /** What a file links to that's a note or a file (in this vault or another), in the order written. */
  const linksOut = (path: string): string[] => {
    if (isAbsolute(path)) return []; // another vault's: included, not followed
    const out: string[] = [];
    for (const l of g.linksOf(path))
      if ((l.resolvedKind === "note" || l.resolvedKind === "file") && l.path && l.path !== path) out.push(l.path);
    return out;
  };

  let level: ContextItem[] = [];
  for (const p of start) {
    const it = take(p, "start", 0, null);
    if (it) level.push(it);
  }
  const starts = [...level];
  for (let d = 1; d <= opts.depth || (d === 1 && opts.backlinks); d++) {
    const next: ContextItem[] = [];
    if (d <= opts.depth) {
      for (const it of level) {
        for (const p of linksOut(it.path)) {
          const got = take(p, "link", d, it.path);
          if (got) next.push(got);
        }
      }
    }
    // The notes linking to the ones asked for: one step, after what they link to.
    if (d === 1 && opts.backlinks) {
      for (const it of starts) {
        const from = [...new Set(g.backlinks(it.path).map((b) => b.from))].sort();
        for (const p of from) take(p, "backlink", 1, it.path);
      }
    }
    level = next;
    if (!level.length) break;
  }
  return { items, left, text: writeContext(g, items, left, opts) };
}

/** A path as the bundle shows it: vault-relative, or absolute for another vault's. */
function shown(g: Graph, path: string): string {
  if (!isAbsolute(path)) return sanitize(path);
  const rel = relative(g.root, path);
  return sanitize(rel && !rel.startsWith("..") && !isAbsolute(rel) ? rel : path);
}

/** The bundle as markdown: a heading, then each file — its reference, why it's here, its text fenced. */
function writeContext(g: Graph, items: ContextItem[], left: ContextLeft[], opts: ContextOptions): string {
  const starts = items.filter((i) => i.why === "start");
  const links = items.filter((i) => i.why === "link").length;
  const backs = items.filter((i) => i.why === "backlink").length;
  const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  const parts: string[] = [];
  parts.push(`# Context: ${starts.map((s) => shown(g, s.path)).join(", ") || "nothing"}`);
  const one = starts.length === 1;
  const it = one ? "it" : "them";
  const reach = [
    opts.depth > 0
      ? `${count(links, "file")} ${opts.depth === 1 ? `${one ? "it links" : "they link"} to` : `within ${opts.depth} links of ${it}`}`
      : null,
    opts.backlinks ? `${count(backs, "file")} linking to ${it}` : null,
  ].filter(Boolean);
  parts.push(
    `${starts.length === 1 ? "The note" : "The notes"}${reach.length ? `, ${reach.join(" and ")}` : ""}: each with its path and lines, fenced as it is on disk.`,
  );
  const why = (i: ContextItem) =>
    i.why === "start"
      ? "asked for"
      : i.why === "link"
        ? `linked from ${shown(g, i.from!)}`
        : `links to ${shown(g, i.from!)}`;
  for (const i of items) {
    const path = shown(g, i.path);
    const ref = i.lines ? formatRef({ path, startLine: 1, endLine: i.lines }) : `\`${path}\``;
    const lang = classify(i.path, g.config.walk.extensions).group === "note" ? "markdown" : fenceLanguage(i.path);
    parts.push(`## ${path}`, `${ref} — ${why(i)}`, fence(sanitize(i.text), lang));
  }
  if (left.length) {
    const reason = {
      limit: `past the limit of ${opts.limit}`,
      binary: "not text",
      size: "too large",
      unreadable: "can't be read",
    };
    const verb = { start: "asked for", link: "linked from", backlink: "links to" };
    const listed = left
      .slice(0, LEFT_LISTED)
      .map(
        (l) =>
          `- \`${shown(g, l.path)}\` — ${l.why === "start" ? verb.start : `${verb[l.why]} ${shown(g, l.from)}`}: ${reason[l.reason]}`,
      );
    if (left.length > LEFT_LISTED) listed.push(`- and ${left.length - LEFT_LISTED} more`);
    parts.push("## Left out", listed.join("\n"));
  }
  return `${parts.join("\n\n")}\n`;
}
