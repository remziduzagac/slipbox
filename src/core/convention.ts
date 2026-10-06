// Which convention a root's links are written in (plan 21.4). Three parts — style (markdown or wiki),
// path (relative, from the root, or by name) and extension (kept or dropped) — each found the same
// way, the first that says: your setting (`[links]`, in your config or the root's `.slipbox/`); the
// root's tool (`.obsidian/app.json`, `.zk/config.toml`); what the root's notes already do, when one
// form has two-thirds or more of their links within the root; else ours — markdown, relative, the
// extension kept. The style is found first: the path and extension a tool writes depend on it, and
// the notes are counted within it. A folder with no root has your setting, else ours.
//
// It decides only the links slipbox makes (21.5); a rename keeps each link's own form.

import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, relative } from "node:path";
import { parse as parseToml } from "smol-toml";
import type { Config } from "./config.ts";
import { stripJsonComments } from "./data.ts";
import { readRegular, SMALL_FILE } from "./fsutil.ts";

export type LinkStyle = "markdown" | "wiki";
export type LinkPath = "relative" | "root" | "name";
export type LinkExtension = "kept" | "dropped";

/** One part, and what said it: your setting, the root's tool, its notes, or ours. */
export interface ConventionPart<T> {
  value: T;
  /** "typed": a style the link being written already has (`](` typed), whatever the convention's. */
  source: "setting" | "tool" | "notes" | "default" | "typed";
  /** Where, for people: the config file, the tool's file, "91% of 45 links", "ours". */
  why: string;
  /** The notes': the share of their links in this form, in percent. */
  share?: number;
}

export interface Convention {
  style: ConventionPart<LinkStyle>;
  path: ConventionPart<LinkPath>;
  extension: ConventionPart<LinkExtension>;
  /** The tool that owns the root, whatever it said. */
  tool: "obsidian" | "zk" | null;
}

/** What a root's tool says, read from its settings; a part it leaves to a template says nothing. */
export interface ToolSays {
  tool: "obsidian" | "zk";
  /** The file read, from the root (`.obsidian/app.json`); the folder alone when there's no file. */
  file: string;
  style?: LinkStyle;
  path: (style: LinkStyle) => LinkPath | undefined;
  extension: (style: LinkStyle) => LinkExtension | undefined;
}

/** How the root's notes write their links to its notes: the style, then path and extension within each style. */
export interface FormCounts {
  style: Record<LinkStyle, number>;
  path: Record<LinkStyle, Record<LinkPath, number>>;
  extension: Record<LinkStyle, Record<LinkExtension, number>>;
}

export const OURS = { style: "markdown", path: "relative", extension: "kept" } as const;

/** Two-thirds or more of the links counted: a form that clearly dominates. */
const DOMINANT = 2 / 3;

const NOTE_EXT = /\.(md|markdown)$/i;

export function emptyCounts(): FormCounts {
  const paths = () => ({ relative: 0, root: 0, name: 0 });
  const exts = () => ({ kept: 0, dropped: 0 });
  return { style: { markdown: 0, wiki: 0 }, path: { markdown: paths(), wiki: paths() }, extension: { markdown: exts(), wiki: exts() } };
}

/**
 * Count the links that reach a note inside the root (a link out of it, to a file, or broken says
 * nothing of how the root writes): each by its style, its path's form and whether it has the extension.
 */
export function countForms(links: Iterable<{ kind: string; target: string; resolvedKind: string; path: string | null }>): FormCounts {
  const counts = emptyCounts();
  for (const l of links) {
    if (l.resolvedKind !== "note" || !l.path || isAbsolute(l.path) || !l.target) continue;
    const style: LinkStyle = l.kind === "wiki" || l.kind === "embed" ? "wiki" : "markdown";
    let target = l.target;
    if (style === "markdown") {
      // A URL's scheme, `~/`: not how a root writes to itself.
      if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("~")) continue;
      target = target.replace(/[#?].*$/, "");
    }
    const path: LinkPath = /^\.\.?\//.test(target) ? "relative" : target.startsWith("/") ? "root" : style === "markdown" ? "relative" : target.includes("/") ? "root" : "name";
    counts.style[style]++;
    counts.path[style][path]++;
    counts.extension[style][NOTE_EXT.test(target) ? "kept" : "dropped"]++;
  }
  return counts;
}

/** What the tool owning `root` says — Obsidian's or zk's settings, their defaults where a key is unset. */
export function toolSays(root: string): ToolSays | null {
  if (isDir(join(root, ".obsidian"))) {
    const file = join(".obsidian", "app.json");
    const app = readJson(join(root, file));
    // `useMarkdownLinks` (false: wikilinks); `newLinkFormat`: "shortest" (the default) a note's name
    // when it's unique, "relative" from the note, "absolute" from the vault's top. A wikilink drops
    // `.md`, a markdown link keeps it.
    const format = typeof app?.newLinkFormat === "string" ? app.newLinkFormat : "shortest";
    return {
      tool: "obsidian",
      file: app ? file : ".obsidian/",
      style: app?.useMarkdownLinks === true ? "markdown" : "wiki",
      // A markdown link by name is a path to slipbox (21.2): there "shortest" says nothing.
      path: (style) => (format === "relative" ? "relative" : format === "absolute" ? "root" : style === "wiki" ? "name" : undefined),
      extension: (style) => (style === "wiki" ? "dropped" : "kept"),
    };
  }
  if (isDir(join(root, ".zk"))) {
    const file = join(".zk", "config.toml");
    const config = readToml(join(root, file));
    const md = (config?.format as Record<string, Record<string, unknown>> | undefined)?.markdown;
    // `link-format`: "markdown" (the default) writes a path from the note, "wiki" one from the
    // notebook's top; any other is a template of the user's, which says nothing here.
    const format = typeof md?.["link-format"] === "string" ? md["link-format"] : "markdown";
    const known = format === "markdown" || format === "wiki";
    const drop = md?.["link-drop-extension"] !== false;
    return {
      tool: "zk",
      file: config ? file : ".zk/",
      style: known ? (format as LinkStyle) : undefined,
      path: (style) => (known ? (style === "wiki" ? "root" : "relative") : undefined),
      extension: () => (drop ? "dropped" : "kept"),
    };
  }
  return null;
}

/**
 * A graph's root's convention: its tool's settings, its notes counted. `style`: the one a link being
 * written already has (`](` typed in a wikilink root) — the path and extension then as that style's.
 */
export function conventionOf(g: { root: string; loc: { mode: string }; linkForms(): FormCounts }, config: Config, origins: Record<string, string>, style?: LinkStyle): Convention {
  const hasRoot = g.loc.mode !== "folder";
  // A config file as people read it: from the root inside it (`.slipbox/config.toml`), else from home.
  const shown = Object.fromEntries(
    Object.entries(origins).map(([k, f]) => {
      const rel = relative(g.root, f);
      return [k, rel && !rel.startsWith("..") && !isAbsolute(rel) ? rel : f.startsWith(`${homedir()}/`) ? `~/${relative(homedir(), f)}` : f];
    }),
  );
  return findConvention({ links: config.links, origins: shown, hasRoot, tool: hasRoot ? toolSays(g.root) : null, counts: hasRoot ? g.linkForms() : null, style });
}

export interface ConventionInput {
  links: Config["links"];
  /** Which file set each `links.*` key (LoadedConfig.origins). */
  origins: Record<string, string>;
  /** No root: your setting, else ours. */
  hasRoot: boolean;
  tool: ToolSays | null;
  counts: FormCounts | null;
  /** The style already chosen (typed): only the path and extension are found. */
  style?: LinkStyle;
}

export function findConvention(input: ConventionInput): Convention {
  const { links, origins, hasRoot } = input;
  const tool = hasRoot ? input.tool : null;
  const counts = hasRoot ? input.counts : null;
  const setting = (key: string) => `[links] in ${origins[`links.${key}`] ?? "your config"}`;
  const toolWhy = tool ? `${tool.tool === "obsidian" ? "Obsidian's" : "zk's"} ${tool.file}` : "";

  // Style: the first that says.
  const style: ConventionPart<LinkStyle> = input.style
    ? { value: input.style, source: "typed", why: "as typed" }
    : links.style !== "auto"
      ? { value: links.style, source: "setting", why: setting("style") }
      : tool?.style
        ? { value: tool.style, source: "tool", why: toolWhy }
        : (dominant(counts?.style) ?? { value: OURS.style, source: "default", why: "ours" });
  const s = style.value;

  // Path, within the style: a markdown link is a path, never a name.
  const fits = (p: LinkPath | undefined) => p !== undefined && (s === "wiki" || p !== "name");
  const toolPath = tool?.path(s);
  const setPath = links.path === "auto" ? undefined : links.path;
  const path: ConventionPart<LinkPath> = fits(setPath)
    ? { value: setPath!, source: "setting", why: setting("path") }
    : fits(toolPath)
      ? { value: toolPath!, source: "tool", why: toolWhy }
      : (dominant(counts?.path[s]) ?? { value: OURS.path, source: "default", why: "ours" });

  const toolExt = tool?.extension(s);
  const extension: ConventionPart<LinkExtension> =
    links.extension !== "auto"
      ? { value: links.extension === "keep" ? "kept" : "dropped", source: "setting", why: setting("extension") }
      : toolExt
        ? { value: toolExt, source: "tool", why: toolWhy }
        : (dominant(counts?.extension[s]) ?? { value: OURS.extension, source: "default", why: "ours" });

  return { style, path, extension, tool: tool?.tool ?? null };
}

/** The form with two-thirds or more of those counted, if one has; none counted, none. (A markdown link is never counted by name.) */
function dominant<T extends string>(counts: Record<T, number> | undefined): ConventionPart<T> | null {
  if (!counts) return null;
  const total = (Object.values(counts) as number[]).reduce((a, b) => a + b, 0);
  if (!total) return null;
  for (const [form, n] of Object.entries(counts) as [T, number][]) {
    const share = Math.round((100 * n) / total);
    if (n / total >= DOMINANT) return { value: form, source: "notes", why: `the notes, ${share}% of ${total} link${total === 1 ? "" : "s"}`, share };
  }
  return null;
}

/**
 * The convention for people, then what said each part: "wikilinks, by name, without .md — Obsidian's
 * .obsidian/app.json"; "markdown links, relative, with .md — style: [links] in .slipbox/config.toml;
 * path and extension: the notes, 98% of 120 links".
 */
export function describeConvention(c: Convention): string {
  const { what, said } = conventionSaid(c);
  return `${what} — ${said.length === 1 ? said[0]!.why : said.map((x) => `${x.parts}: ${x.why}`).join("; ")}`;
}

/** What the convention is, and what said which of its parts (those one source said, together). */
function conventionSaid(c: Convention): { what: string; said: { parts: string; why: string }[] } {
  const style = c.style.value === "wiki" ? "wikilinks" : "markdown links";
  const path = { relative: "relative", root: "from the root", name: "by name" }[c.path.value];
  const ext = c.extension.value === "kept" ? "with .md" : "without .md";
  const parts: [string, string][] = [["style", c.style.why], ["path", c.path.why], ["extension", c.extension.why]];
  const said = [...new Set(parts.map(([, w]) => w))].map((why) => {
    const names = parts.filter(([, x]) => x === why).map(([n]) => n);
    return { parts: names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0]!, why };
  });
  return { what: `${style}, ${path}, ${ext}`, said };
}

function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function readJson(p: string): Record<string, unknown> | null {
  if (!existsSync(p)) return null;
  try {
    const v = JSON.parse(stripJsonComments(readRegular(p, SMALL_FILE).toString("utf8")));
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function readToml(p: string): Record<string, unknown> | null {
  if (!existsSync(p)) return null;
  try {
    return parseToml(readRegular(p, SMALL_FILE).toString("utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}
