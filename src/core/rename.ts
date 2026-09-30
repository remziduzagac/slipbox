// Renames and moves (17.15, with 7.1–7.3; docs/idea.md, "Moves, renames and backlinks"): a note
// renamed or moved, or a vault renamed, with its links rewritten in every vault this machine
// reaches — as byte-range edits at the positions the index recorded, never a re-serialised file
// (7.6). A plan is made first, to preview (7.2); it names the git trees that already have changes
// (7.3); applying it checks that no file it touches changed since.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, renameSync, statSync, unlinkSync } from "node:fs";
import { basename, dirname, isAbsolute, join, posix, relative } from "node:path";
import { classify } from "./filetypes.ts";
import { atomicWrite, landsInside, readText } from "./fsutil.ts";
import type { Backlink, Graph, LinkKind, NoteEntry } from "./graph.ts";
import { VAULT_LINK } from "./graph.ts";
import { normKey } from "./links.ts";
import { contentHash } from "./redirects.ts";
import { HOME_NAME, readRegistry, VAULT_NAME, vaultConfigFile, vaultNamed } from "./registry.ts";
import { findRoot, isInside, type VaultLocation } from "./vault.ts";

export class RenameError extends Error {}

export interface Edit {
  line: number;
  /** The line before and after, for the preview. */
  before: string;
  after: string;
}

export interface FileChange {
  /** Absolute. */
  abs: string;
  /** How to show it: vault-relative, with its vault's name when it's another vault's. */
  shown: string;
  vault: string | null;
  edits: Edit[];
  /** The text as planned from, and as it will be. */
  text: string;
  next: string;
}

export interface RenamePlan {
  kind: "note" | "vault" | "relink";
  from: string;
  to: string;
  /** The note's move: absolute paths; null for a vault's rename or a relink. */
  move: { from: string; to: string } | null;
  files: FileChange[];
  warnings: string[];
  /** Links the index knew of that the file no longer has where it said: left alone. */
  skipped: { shown: string; line: number; reason: string }[];
}

/** A link as found in a file: where, how it's written, and where it should point now. */
interface Site {
  /** The linking file, absolute. */
  abs: string;
  kind: LinkKind;
  /** The target as written (a wikilink's, without `#heading` or `|text`). */
  target: string;
  line: number;
  column: number;
}

const NOTE_EXT = /\.(md|markdown)$/i;

// -------------------------------------------------------------------------------------------
// Rewriting one link

/**
 * The new target text of a wikilink whose note is now at `toRel` in the vault `g` — keeping the
 * way it was written: a name stays a name (a path when the name is taken), a path a path, a
 * relative path relative, an extension written stays written, a `vault:` prefix stays.
 */
function wikiTarget(written: string, fromRelDir: string | null, toRel: string, g: Graph, movedFrom: string): string {
  const inter = VAULT_LINK.exec(written);
  const prefix = inter && !g.notes.has(`${written}.md`) ? `${inter[1]}:` : "";
  const t = prefix ? inter![2]! : written;
  const ext = NOTE_EXT.test(t) || !NOTE_EXT.test(toRel) ? posix.extname(toRel) : "";
  const stem = (p: string) => (NOTE_EXT.test(toRel) ? p.replace(NOTE_EXT, "") : p);
  if ((t.startsWith("./") || t.startsWith("../")) && fromRelDir !== null) {
    let r = posix.relative(fromRelDir, stem(toRel)) + ext;
    if (!r.startsWith("../")) r = `./${r}`;
    return prefix + r;
  }
  if (t.includes("/")) return prefix + stem(toRel) + ext;
  const name = stem(posix.basename(toRel));
  // Another note with that name: the path, so it can't reach the wrong one.
  const taken = [...g.notes.keys()].some((p) => p !== movedFrom && p !== toRel && normKey(posix.basename(p).replace(NOTE_EXT, "")) === normKey(name));
  return prefix + (taken ? stem(toRel) : name) + ext;
}

/** A markdown link's new URL: the new path from the linking file (root-relative stays so). */
function mdTarget(written: string, linkingAbs: string, toAbs: string, g: Graph | null): string {
  const hash = written.indexOf("#");
  const frag = hash >= 0 ? written.slice(hash) : "";
  const path = hash >= 0 ? written.slice(0, hash) : written;
  let next: string;
  if (path.startsWith("/") && g && isInside(g.root, toAbs)) next = `/${relative(g.root, toAbs)}`;
  else {
    next = relative(dirname(linkingAbs), toAbs).split("\\").join("/");
    if (path.startsWith("./") && !next.startsWith("../")) next = `./${next}`;
  }
  // Written percent-encoded (`my%20note.md`): encoded again.
  const encoded = /%[0-9A-Fa-f]{2}/.test(path) || /\s/.test(next);
  return (encoded ? encodeURI(next) : next) + frag;
}

/**
 * Replace a link's target in `text` at the site the index recorded: the wikilink or markdown link
 * starting at that line and column (a reference link's definition, wherever it is), or in a data
 * or code file the path on that line. Null when the link isn't there any more.
 */
function replaceAt(text: string, site: Site, next: string, group: string): { text: string; line: number } | null {
  const lines = text.split("\n");
  const at = site.line - 1;
  const line = lines[at];
  if (line === undefined) return null;
  const col = Math.max(0, site.column - 1);
  const put = (i: number, from: number, to: number, what: string) => {
    lines[i] = lines[i]!.slice(0, from) + what + lines[i]!.slice(to);
    return { text: lines.join("\n"), line: i + 1 };
  };
  // The index's column counts characters its own way (a wide one, a tab): of the links on the
  // line with this target, the one nearest to it.
  const nearest = <T extends { at: number }>(hits: T[]) => hits.sort((a, b) => Math.abs(a.at - col) - Math.abs(b.at - col))[0];
  if (group === "note" && (site.kind === "wiki" || site.kind === "embed")) {
    const hits: { at: number; from: number; to: number }[] = [];
    for (let open = line.indexOf("[["); open >= 0; open = line.indexOf("[[", open + 2)) {
      const close = line.indexOf("]]", open + 2);
      if (close < 0) break;
      const inner = line.slice(open + 2, close);
      const end = inner.search(/\\?\||#|\^/);
      const head = end < 0 ? inner : inner.slice(0, end);
      const lead = head.length - head.trimStart().length;
      if (head.trim() === site.target) hits.push({ at: open > 0 && line[open - 1] === "!" ? open - 1 : open, from: open + 2 + lead, to: open + 2 + lead + head.trim().length });
    }
    const hit = nearest(hits);
    return hit ? put(at, hit.from, hit.to, next) : null;
  }
  if (group === "note" && (site.kind === "markdown" || site.kind === "image")) {
    const hits: { at: number; start: number; raw: string }[] = [];
    for (const m of line.matchAll(/\]\(\s*(<[^>\n]*>|[^)\s]*)/g)) {
      const raw = m[1]!;
      const url = raw.startsWith("<") ? raw.slice(1, -1) : raw;
      if (url !== site.target && safeDecode(url) !== site.target) continue;
      // The link starts at its `[` (or `![`): the nearest one before its `](`.
      const open = line.lastIndexOf("[", m.index);
      hits.push({ at: open > 0 && line[open - 1] === "!" ? open - 1 : open, start: m.index + m[0].length - raw.length, raw });
    }
    const hit = nearest(hits);
    if (hit) return put(at, hit.start, hit.start + hit.raw.length, hit.raw.startsWith("<") ? `<${safeDecode(next)}>` : next);
    // A reference link: its definition, wherever it is.
    for (let i = 0; i < lines.length; i++) {
      const d = /^( {0,3}\[[^\]]+\]:[ \t]*)(<[^>\n]*>|\S+)/.exec(lines[i]!);
      if (!d) continue;
      const raw = d[2]!;
      const url = raw.startsWith("<") ? raw.slice(1, -1) : raw;
      if (url !== site.target && safeDecode(url) !== site.target) continue;
      return put(i, d[1]!.length, d[1]!.length + raw.length, raw.startsWith("<") ? `<${safeDecode(next)}>` : next);
    }
    return null;
  }
  // A data file's value or a code comment's path: the old path, as written on that line.
  const old = site.target.split("#")[0]!.replace(/^\//, "");
  const i = line.indexOf(old, col) >= 0 ? line.indexOf(old, col) : line.indexOf(old);
  if (i < 0 || !old) return null;
  return put(at, i, i + old.length, next.split("#")[0]!.replace(/^\//, ""));
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

// -------------------------------------------------------------------------------------------
// Frontmatter: `previous_names` spliced in (7.6)

/** A YAML scalar for a name: bare when that's safe, else quoted. */
function yamlName(name: string): string {
  return /^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u.test(name) && !/ $/.test(name) ? name : JSON.stringify(name);
}

/** Add `name` to the note's frontmatter `previous_names`, splicing the text; the rest unchanged. */
export function addPreviousName(text: string, name: string): string {
  const bom = text.startsWith("\ufeff") ? "\ufeff" : "";
  const body = text.slice(bom.length);
  const nl = body.includes("\r\n") ? "\r\n" : "\n";
  const fm = /^---[ \t]*\r?\n([\s\S]*?)(\r?\n)(---|\.\.\.)[ \t]*(\r?\n|$)/.exec(body);
  if (!fm) return `${bom}---${nl}previous_names: [${yamlName(name)}]${nl}---${nl}${body}`;
  const inner = fm[1]!;
  const start = body.indexOf(inner);
  const key = /^previous_names:[ \t]*(.*)$/m.exec(inner);
  let next: string;
  if (!key) next = `${inner}${nl}previous_names: [${yamlName(name)}]`;
  else {
    const value = key[1]!.replace(/\r$/, "").trim();
    const keyEnd = key.index + key[0].replace(/\r$/, "").length;
    if (value.startsWith("[") && value.endsWith("]")) {
      const items = value.slice(1, -1).split(",").map((x) => x.trim().replace(/^["']|["']$/g, ""));
      if (items.includes(name)) return text;
      const close = key.index + key[0].lastIndexOf("]");
      next = `${inner.slice(0, close)}${items.filter(Boolean).length ? ", " : ""}${yamlName(name)}${inner.slice(close)}`;
    } else if (value === "") {
      // A block list: after its last item, indented like it.
      const rest = inner.slice(keyEnd);
      const items = /^((?:\r?\n[ \t]*-[ \t]*.*)*)/.exec(rest)![1]!;
      if (items.split(/\r?\n/).some((l) => l.replace(/^[ \t]*-[ \t]*/, "").trim().replace(/^["']|["']$/g, "") === name && l.trim())) return text;
      const indent = /\r?\n([ \t]*)-/.exec(items)?.[1] ?? "  ";
      next = `${inner.slice(0, keyEnd + items.length)}${nl}${indent}- ${yamlName(name)}${inner.slice(keyEnd + items.length)}`;
    } else {
      if (value.replace(/^["']|["']$/g, "") === name) return text;
      next = `${inner.slice(0, key.index)}previous_names: [${value}, ${yamlName(name)}]${inner.slice(keyEnd)}`;
    }
  }
  return `${bom}${body.slice(0, start)}${next}${body.slice(start + inner.length)}`;
}

// -------------------------------------------------------------------------------------------
// Plans

/** Where a link's file is, as shown: vault-relative, another vault's with its name. */
function shownFor(g: Graph, abs: string, vault: string | null | undefined): string {
  if (isInside(g.root, abs)) return relative(g.root, abs);
  const root = findRoot(abs)?.root;
  return `${vault ?? (root ? basename(root) : "")}: ${root ? relative(root, abs) : abs}`;
}

class Collector {
  readonly files = new Map<string, FileChange>();
  readonly skipped: RenamePlan["skipped"] = [];

  constructor(readonly g: Graph) {}

  /** The file's change so far (its text read once, then edited in turn). */
  file(abs: string, vault: string | null): FileChange | null {
    let f = this.files.get(abs);
    if (!f) {
      let text: string;
      try {
        text = readText(abs).text;
      } catch {
        return null;
      }
      f = { abs, shown: shownFor(this.g, abs, vault), vault, edits: [], text, next: text };
      this.files.set(abs, f);
    }
    return f;
  }

  /** Rewrite one link site to `next`; noted as skipped when the file no longer has it there. */
  edit(site: Site, next: string, vault: string | null): void {
    if (next === site.target) return;
    const f = this.file(site.abs, vault);
    if (!f) return void this.skipped.push({ shown: shownFor(this.g, site.abs, vault), line: site.line, reason: "can't be read" });
    const group = classify(site.abs, this.g.config.walk.extensions).group;
    const r = replaceAt(f.next, site, next, group);
    if (!r) return void this.skipped.push({ shown: f.shown, line: site.line, reason: `no link to ${site.target} there any more (its index is older than the file)` });
    const before = f.next.split("\n")[r.line - 1]!;
    f.next = r.text;
    const after = f.next.split("\n")[r.line - 1]!;
    const same = f.edits.find((e) => e.line === r.line);
    if (same) same.after = after;
    else f.edits.push({ line: r.line, before: before.replace(/\r$/, ""), after: after.replace(/\r$/, "") });
  }

  result(): FileChange[] {
    return [...this.files.values()].filter((f) => f.next !== f.text).map((f) => ({ ...f, edits: f.edits.sort((a, b) => a.line - b.line) }));
  }
}

/** Roots with uncommitted changes in git, among those the plan writes to (7.3). */
function dirtyTrees(paths: string[]): string[] {
  const roots = new Set<string>();
  for (const p of paths) {
    const r = findRoot(p);
    if (r) roots.add(r.root);
  }
  const out: string[] = [];
  for (const root of roots) {
    try {
      const status = execFileSync("git", ["-C", root, "status", "--porcelain"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 5000 });
      if (status.trim()) out.push(`${root} already has uncommitted changes (git): these edits will mix with them`);
    } catch {
      // not a git repository, or no git: nothing to warn about
    }
  }
  return out;
}

/**
 * Plan renaming or moving a note (or any file of the vault) to `toRel` (7.1, 17.15): every link to
 * it — in this vault, and in other vaults' indexes — rewritten; its own relative links fixed for
 * its new folder; its old name added to its `previous_names` when the name changes.
 */
export function planNoteRename(g: Graph, fromRel: string, toInput: string): RenamePlan {
  const isNote = g.notes.has(fromRel);
  if (!isNote && !g.filePaths().includes(fromRel)) throw new RenameError(`no note or file ${fromRel} in ${g.root}`);
  let toRel = posix.normalize(toInput.replace(/\\/g, "/").replace(/^\/+/, ""));
  if (posix.extname(toRel) === "" || (isNote && !NOTE_EXT.test(toRel))) toRel += posix.extname(fromRel);
  if (toRel === fromRel) throw new RenameError(`${fromRel} is already there`);
  if (toRel.startsWith("../") || toRel === ".." || isAbsolute(toRel)) throw new RenameError(`${toInput} isn't inside the vault`);
  if (toRel.split("/").some((s) => s.startsWith(".") || s === "node_modules")) throw new RenameError(`${toInput}: the walk leaves hidden folders and node_modules out`);
  const fromAbs = join(g.root, fromRel);
  const toAbs = join(g.root, toRel);
  if (existsSync(toAbs) && normKey(toRel) !== normKey(fromRel)) throw new RenameError(`${toRel} exists; not overwriting it`);
  if (!landsInside(g.root, toAbs)) throw new RenameError(`${toRel} would land outside the vault`);
  const c = new Collector(g);
  const oldName = posix.basename(fromRel).replace(NOTE_EXT, "");
  const entry: NoteEntry | undefined = isNote ? g.entry(fromRel) : undefined;
  const aliases = new Set((entry?.aliases ?? []).map(normKey));

  // Every link to it: this vault's and other vaults' (17.11).
  for (const b of g.backlinks(fromRel)) {
    const abs = isAbsolute(b.from) ? b.from : join(g.root, b.from);
    const site: Site = { abs, kind: b.kind, target: b.target, line: b.line, column: b.column };
    c.edit(site, retargetBacklink(g, b, abs, fromRel, toRel, toAbs, aliases, oldName), b.vault ?? null);
  }

  // Its own relative links, from its new folder.
  if (entry && posix.dirname(fromRel) !== posix.dirname(toRel)) {
    for (const l of entry.links) {
      if (l.kind !== "markdown" && l.kind !== "image" && !((l.kind === "wiki" || l.kind === "embed") && /^\.\.?\//.test(l.target))) continue;
      if (/^[a-z][a-z0-9+.-]*:/i.test(l.target) || l.target.startsWith("#") || l.target.startsWith("/")) continue;
      const r = g.resolveLink(l, fromRel);
      if ((r.resolvedKind !== "note" && r.resolvedKind !== "file") || !r.path) continue;
      const targetAbs = isAbsolute(r.path) ? r.path : join(g.root, r.path);
      const site: Site = { abs: fromAbs, kind: l.kind, target: l.target, line: l.line, column: l.column };
      const next = l.kind === "wiki" || l.kind === "embed" ? wikiTarget(l.target, posix.dirname(toRel), r.path, g, "") : mdTarget(l.target, toAbs, targetAbs, g);
      c.edit(site, next, null);
    }
  }

  const files = c.result();
  // Its old name, kept where links this machine can't reach will look (17.7).
  const moved = files.find((f) => f.abs === fromAbs);
  const ownText = moved?.next ?? (isNote ? readText(fromAbs).text : null);
  let ownNext = ownText;
  const newName = posix.basename(toRel).replace(NOTE_EXT, "");
  if (isNote && ownText !== null && g.config.rename.previous_names && normKey(newName) !== normKey(oldName)) ownNext = addPreviousName(ownText, oldName);
  if (isNote && ownText !== null && ownNext !== ownText) {
    if (moved) moved.next = ownNext!;
    else files.push({ abs: fromAbs, shown: fromRel, vault: null, edits: [], text: ownText, next: ownNext! });
    const f = files.find((x) => x.abs === fromAbs)!;
    f.edits.push({ line: 1, before: "(frontmatter)", after: `previous_names: + ${oldName}` });
  }
  const warnings = dirtyTrees([fromAbs, ...files.map((f) => f.abs)]);
  return { kind: "note", from: fromRel, to: toRel, move: { from: fromAbs, to: toAbs }, files, warnings, skipped: c.skipped };
}

/** The new target text of a link to the renamed note. */
function retargetBacklink(g: Graph, b: Backlink, linkingAbs: string, fromRel: string, toRel: string, toAbs: string, aliases: Set<string>, oldName: string): string {
  if (b.kind === "wiki" || b.kind === "embed") {
    const inter = VAULT_LINK.exec(b.target);
    const bare = inter && !g.notes.has(`${b.target}.md`) ? inter[2]! : b.target;
    const name = posix.basename(bare).replace(NOTE_EXT, "");
    // Written as an alias: still right after the rename.
    if (!bare.includes("/") && aliases.has(normKey(name)) && normKey(name) !== normKey(oldName)) return b.target;
    const fromDir = isInside(g.root, linkingAbs) ? posix.dirname(relative(g.root, linkingAbs)) : null;
    return wikiTarget(b.target, fromDir, toRel, g, fromRel);
  }
  return mdTarget(b.target, linkingAbs, toAbs, isInside(g.root, linkingAbs) ? g : null);
}

/**
 * Plan renaming a vault (17.15): its config's `name`, the old name kept in `previous_names`, and
 * every `[[old:…]]` rewritten — in this vault and in the vaults whose indexes link into it.
 */
export function planVaultRename(g: Graph, loc: VaultLocation, newName: string): RenamePlan {
  if (loc.mode !== "vault") throw new RenameError(loc.mode === "home" ? "the home vault's name is fixed" : `${loc.root} has no .slipbox/: make it a vault first (slipbox init)`);
  if (!VAULT_NAME.test(newName)) throw new RenameError(`"${newName}" can't be a vault name: letters, digits, ".", "_" and "-" only, no spaces or ":"`);
  if (newName.toLowerCase() === HOME_NAME) throw new RenameError(`"${HOME_NAME}" is the home vault's name`);
  const oldName = loc.name!;
  if (newName === oldName) throw new RenameError(`the vault is already named ${oldName}`);
  const other = vaultNamed(newName, readRegistry(), loc.root);
  if (other.length) throw new RenameError(`a vault named "${newName}" is already at ${other[0]!.path}`);
  const c = new Collector(g);
  const retarget = (target: string) => {
    const m = VAULT_LINK.exec(target);
    return m && m[1]!.toLowerCase() === oldName.toLowerCase() ? `${newName}:${m[2]}` : null;
  };
  // This vault's own [[old:…]] links.
  g.ensureAll();
  for (const [rel, e] of g.notes) {
    for (const l of e.links) {
      if (l.kind !== "wiki" && l.kind !== "embed") continue;
      const next = retarget(l.target);
      if (next) c.edit({ abs: join(g.root, rel), kind: l.kind, target: l.target, line: l.line, column: l.column }, next, null);
    }
  }
  // Other vaults' links into it.
  for (const list of g.reach?.inbound(g).values() ?? []) {
    for (const b of list) {
      const next = b.kind === "wiki" || b.kind === "embed" ? retarget(b.target) : null;
      if (next) c.edit({ abs: b.from, kind: b.kind, target: b.target, line: b.line, column: b.column }, next, b.vault ?? null);
    }
  }
  const files = c.result();
  // The config: the new name, the old one kept.
  const cfg = vaultConfigFile(loc.root);
  const text = readText(cfg).text;
  const next = renameInConfig(text, oldName, newName);
  files.push({ abs: cfg, shown: ".slipbox/config.toml", vault: null, edits: [{ line: 0, before: `name = "${oldName}"`, after: `name = "${newName}" (previous_names + ${oldName})` }], text, next });
  const warnings = dirtyTrees(files.map((f) => f.abs));
  return { kind: "vault", from: oldName, to: newName, move: null, files, warnings, skipped: c.skipped };
}

/** `[vault] name` replaced, and the old name added to `previous_names`, as text. */
function renameInConfig(text: string, oldName: string, newName: string): string {
  const header = /^\[vault\][ \t]*(#.*)?$/m.exec(text);
  let t = text;
  if (!header) {
    if (t && !t.endsWith("\n")) t += "\n";
    return `${t}\n[vault]\nname = ${JSON.stringify(newName)}\nprevious_names = [${JSON.stringify(oldName)}]\n`;
  }
  const start = header.index + header[0].length;
  const nextTable = /^\[[^\]]+\][ \t]*(#.*)?$/m.exec(t.slice(start));
  const end = nextTable ? start + nextTable.index : t.length;
  let table = t.slice(start, end);
  const nameLine = /^name[ \t]*=.*$/m;
  table = nameLine.test(table) ? table.replace(nameLine, `name = ${JSON.stringify(newName)}`) : `\nname = ${JSON.stringify(newName)}${table}`;
  const prev = /^previous_names[ \t]*=[ \t]*\[(.*)\][ \t]*$/m.exec(table);
  if (prev) {
    const items = prev[1]!.split(",").map((x) => x.trim()).filter(Boolean);
    if (!items.map((x) => x.replace(/^["']|["']$/g, "")).includes(oldName)) items.push(JSON.stringify(oldName));
    table = table.replace(prev[0], `previous_names = [${items.join(", ")}]`);
  } else {
    const nl = table.endsWith("\n") ? "" : "\n";
    const at = table.search(/\n\s*$/);
    table = at >= 0 ? `${table.slice(0, at)}\nprevious_names = [${JSON.stringify(oldName)}]${table.slice(at)}` : `${table}${nl}previous_names = [${JSON.stringify(oldName)}]\n`;
  }
  return t.slice(0, start) + table + t.slice(end);
}

/**
 * Plan rewriting the links that reach their note only by a previous name or a redirect (17.12):
 * each to the note's name or path now. In `rels`, or every note.
 */
export function planRelink(g: Graph, rels?: string[]): RenamePlan {
  g.ensureAll();
  const c = new Collector(g);
  for (const rel of rels ?? [...g.notes.keys()]) {
    for (const l of g.linksOf(rel)) {
      if ((l.via !== "previous-name" && l.via !== "redirect") || l.resolvedKind !== "note" || !l.path) continue;
      const abs = join(g.root, rel);
      const toAbs = isAbsolute(l.path) ? l.path : join(g.root, l.path);
      const site: Site = { abs, kind: l.kind, target: l.target, line: l.line, column: l.column };
      let next: string;
      if (l.kind === "wiki" || l.kind === "embed") {
        const inter = VAULT_LINK.exec(l.target);
        if (inter && isAbsolute(l.path)) {
          const root = findRoot(l.path)?.root ?? dirname(l.path);
          next = `${l.vault ?? inter[1]}:${relative(root, l.path).replace(NOTE_EXT, "")}`;
          const name = posix.basename(next.slice(next.indexOf(":") + 1));
          if (!inter[2]!.includes("/")) next = `${l.vault ?? inter[1]}:${name}`;
        } else next = wikiTarget(l.target, posix.dirname(rel), l.path, g, "");
      } else next = mdTarget(l.target, abs, toAbs, g);
      c.edit(site, next, null);
    }
  }
  const files = c.result();
  return { kind: "relink", from: rels?.join(", ") ?? "every note", to: "", move: null, files, warnings: dirtyTrees(files.map((f) => f.abs)), skipped: c.skipped };
}

// -------------------------------------------------------------------------------------------
// Applying

export interface Applied {
  written: string[];
  moved: { from: string; to: string } | null;
}

/**
 * Carry a plan out: every file it touches still as it was planned from (else nothing is written),
 * then the edits, then the move. The vault's index and redirects follow.
 */
export function applyPlan(g: Graph, plan: RenamePlan): Applied {
  for (const f of plan.files) {
    let now: string;
    try {
      now = readText(f.abs).text;
    } catch {
      throw new RenameError(`${f.shown} can't be read any more; nothing changed`);
    }
    if (contentHash(now) !== contentHash(f.text)) throw new RenameError(`${f.shown} changed since the preview; nothing changed — plan again`);
  }
  if (plan.move && existsSync(plan.move.to) && normKey(plan.move.to) !== normKey(plan.move.from)) throw new RenameError(`${plan.move.to} exists now; nothing changed`);
  const written: string[] = [];
  for (const f of plan.files) {
    if (plan.move && f.abs === plan.move.from) continue; // written at its new place, below
    atomicWrite(f.abs, f.next);
    written.push(f.abs);
  }
  if (plan.move) {
    const { from, to } = plan.move;
    mkdirSync(dirname(to), { recursive: true });
    const own = plan.files.find((f) => f.abs === from);
    if (own) {
      atomicWrite(to, own.next);
      if (normKey(to) !== normKey(from)) unlinkSync(from);
      written.push(to);
    } else {
      renameSync(from, to);
      written.push(to);
    }
    const fromRel = relative(g.root, from);
    const toRel = relative(g.root, to);
    g.redirects?.add([[fromRel, toRel]]);
    if (g.notes.has(fromRel)) g.removeFile(fromRel);
    else g.removeAsset(fromRel);
  }
  // The vault's index follows what was written (other vaults' follow when they're next opened).
  for (const abs of written) {
    if (!isInside(g.root, abs)) continue;
    const rel = relative(g.root, abs);
    try {
      const st = statSync(abs);
      if (classify(rel, g.config.walk.extensions).group === "note") g.updateFile(rel, { rel, abs, size: st.size, mtimeMs: st.mtimeMs });
      else g.addAsset(rel);
    } catch {}
  }
  return { written, moved: plan.move };
}
