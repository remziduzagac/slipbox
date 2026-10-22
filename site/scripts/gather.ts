#!/usr/bin/env bun
// The site's pages, gathered from ../docs before each build: docs/ stays the one source, read on GitHub as it is and
// kept whole by tests/docs.test.ts; the site shows the same pages.
//
//   - The docs map (docs/README.md) gives the sidebar: each `##` section a group, its list's links the pages, in order.
//     The map itself is the site's home's job (src/content/docs/index.mdx), so it isn't gathered.
//   - A page's H1 is its title, its first paragraph its description; the H1 leaves the text (Starlight draws it).
//   - Links between the docs become the site's addresses (`../manual/keys.md#leader` → `/slipbox/docs/manual/keys/#leader`);
//     one to a file outside docs/ goes to it on GitHub. Code, fenced or inline, is left as it is.
//   - The screenshots are copied to public/images; the agent guide is served as it is, for an agent to read.
//   - The logo is the README's (assets/logo.svg), copied to public/logo.svg: the site's logo and its favicon.

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, posix, relative, resolve } from "node:path";

const SITE = resolve(import.meta.dir, "..");
const REPO = resolve(SITE, "..");
const DOCS = join(REPO, "docs");
const OUT = join(SITE, "src", "content", "docs");
const BASE = "/slipbox/docs/";
const GITHUB = "https://github.com/remziduzagac/slipbox";

/** The map's groups: each `##` section of docs/README.md, with the pages its list links, in order. */
export function readMap(text: string): { label: string; pages: string[] }[] {
  const groups: { label: string; pages: string[] }[] = [];
  for (const line of text.split("\n")) {
    const h = /^## (.+)$/.exec(line);
    if (h) groups.push({ label: h[1]!.trim(), pages: [] });
    const item = /^\s*[-*\d.]+\s+\[[^\]]*\]\(([^)#\s]+\.md)(?:#[^)]*)?\)/.exec(line);
    if (item && groups.length && !/^[a-z][a-z0-9+.-]*:/i.test(item[1]!)) groups.at(-1)!.pages.push(item[1]!);
  }
  return groups.filter((g) => g.pages.length);
}

/** Earlier addresses stay published without becoming extra sidebar destinations. The map owns both lists. */
export function readLegacyPages(text: string): string[] {
  return [...text.matchAll(/^<!-- legacy-page: ((?:guides|manual)\/[\w-]+\.md) -->$/gm)].map((m) => m[1]!);
}

/** A page's address on the site, from its path in docs/ (`guides/install.md`), with an anchor kept. */
export function pageUrl(docPath: string, anchor = ""): string {
  const slug = `${docPath.replace(/\.md$/, "").replace(/(^|\/)README$/, "")}/`; // a folder's README is the folder's
  return `${BASE}${slug.replace(/^\/+/, "")}${anchor}`;
}

/**
 * A link's target as the site has it, from the page at `from` (its path in docs/): another page's address, a picture's
 * in the site, a repository file on GitHub; an address, or an anchor in the same page, as it is.
 */
export function rewriteTarget(target: string, from: string, isDir: (repoPath: string) => boolean): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("#") || target.startsWith("/")) return target;
  const hash = target.indexOf("#");
  const path = hash < 0 ? target : target.slice(0, hash);
  const anchor = hash < 0 ? "" : target.slice(hash);
  const inDocs = posix.normalize(posix.join(posix.dirname(from), path));
  if (!inDocs.startsWith("../")) {
    if (inDocs.startsWith("images/")) return `${BASE}${inDocs}`;
    if (inDocs.endsWith(".md")) return pageUrl(inDocs, anchor);
  }
  const repoPath = posix.normalize(posix.join("docs", posix.dirname(from), path)).replace(/\/$/, "");
  return `${GITHUB}/${isDir(repoPath) ? "tree" : "blob"}/main/${repoPath}${anchor}`;
}

/** Every link's and picture's target in Markdown rewritten, code (fenced or inline) left as it is. */
export function rewriteLinks(text: string, rewrite: (target: string) => string): string {
  let fence: string | null = null;
  return text
    .split("\n")
    .map((line) => {
      const f = /^\s*(`{3,}|~{3,})/.exec(line);
      if (f) {
        if (fence === null) fence = f[1]!;
        else if (f[1]!.startsWith(fence[0]!) && f[1]!.length >= fence.length) fence = null;
        return line;
      }
      if (fence !== null) return line;
      // A reference's definition: `[c]: target`.
      const def = /^(\s*\[[^\]]+\]:\s*)(\S+)(.*)$/.exec(line);
      if (def) return `${def[1]}${rewrite(def[2]!)}${def[3]}`;
      // Outside inline code, `](target)` and `](target "title")`.
      return line
        .split(/(`+[^`]*`+)/)
        .map((part, i) =>
          i % 2
            ? part
            : part.replace(/\]\(([^)\s]+)(\s+"[^"]*")?\)/g, (_, t, title = "") => `](${rewrite(t)}${title})`),
        )
        .join("");
    })
    .join("\n");
}

/** A page's title (its H1), its description (its first paragraph, as plain text) and its body without the H1. */
export function splitPage(text: string): { title: string; description: string; body: string } {
  const lines = text.split("\n");
  const at = lines.findIndex((l) => /^# /.test(l));
  if (at < 0) throw new Error("a page without an H1");
  const title = lines[at]!.slice(2).trim();
  const rest = lines.slice(at + 1);
  while (rest.length && !rest[0]!.trim()) rest.shift();
  const para: string[] = [];
  // Compatibility anchors belong in the body, but are not a page's introductory description.
  const first = rest.findIndex((line) => line.trim() && !/^<a id="[^"]+"><\/a>$/.test(line));
  for (const l of rest.slice(first < 0 ? rest.length : first)) {
    if (!l.trim() || /^(#|```|\||[-*] |\d+\. |>)/.test(l)) break;
    para.push(l.trim());
  }
  const plain = para
    .join(" ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[`*_]/g, "")
    .trim();
  const description = plain.length > 220 ? `${plain.slice(0, 217).replace(/\s+\S*$/, "")}…` : plain;
  return { title, description, body: rest.join("\n") };
}

/** YAML's double-quoted string. */
function q(s: string): string {
  return JSON.stringify(s);
}

function gather(): void {
  const mapText = readFileSync(join(DOCS, "README.md"), "utf8");
  const map = readMap(mapText);
  const legacy = readLegacyPages(mapText);
  for (const entry of readdirSync(OUT)) if (entry !== "index.mdx") rmSync(join(OUT, entry), { recursive: true });
  const isDir = (p: string) => existsSync(join(REPO, p)) && statSync(join(REPO, p)).isDirectory();
  const sidebar: { label: string; items: { slug: string }[] }[] = [];
  let pages = 0;
  const groups = [...map, { label: "", pages: legacy }];
  for (const group of groups) {
    const items: { slug: string }[] = [];
    for (const page of group.pages) {
      const { title, description, body } = splitPage(readFileSync(join(DOCS, page), "utf8"));
      const front = [
        "---",
        `title: ${q(title)}`,
        ...(description ? [`description: ${q(description)}`] : []),
        `editUrl: ${q(`${GITHUB}/edit/main/docs/${page}`)}`,
        "---",
        "",
      ].join("\n");
      const out = join(OUT, page);
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, front + rewriteLinks(body, (t) => rewriteTarget(t, page, isDir)));
      items.push({ slug: page.replace(/\.md$/, "") });
      pages++;
    }
    if (group.label) sidebar.push({ label: group.label, items });
  }
  writeFileSync(join(SITE, "src", "sidebar.json"), `${JSON.stringify(sidebar, null, 2)}\n`);
  const images = join(SITE, "public", "images");
  rmSync(images, { recursive: true, force: true });
  mkdirSync(images, { recursive: true });
  for (const f of readdirSync(join(DOCS, "images"))) copyFileSync(join(DOCS, "images", f), join(images, f));
  copyLogo(join(SITE, "public"));
  if (existsSync(join(DOCS, "agent-guide.md")))
    copyFileSync(join(DOCS, "agent-guide.md"), join(SITE, "public", "agent-guide.md"));
  console.log(`gather: ${pages} pages in ${sidebar.length} groups, from ${relative(REPO, DOCS)}/`);
}

/** The README's logo (assets/logo.svg) into `publicDir`, as logo.svg: the site's logo and its favicon. */
export function copyLogo(publicDir: string): void {
  copyFileSync(join(REPO, "assets", "logo.svg"), join(publicDir, "logo.svg"));
}

if (import.meta.main) gather();
