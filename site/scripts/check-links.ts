#!/usr/bin/env bun
// After the build: every link from one page of the site to another lands — the page there, and the heading its anchor
// names; a path on the domain outside the site fails too, but the installer's own files beside it. Addresses
// elsewhere aren't checked here (`bun run check:docs` checks the docs' links).

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const DIST = resolve(import.meta.dir, "..", "dist");
const BASE = "/slipbox/docs/";
/** What the Pages site serves beside the docs: its index, the installer and the release channels (scripts/release.ts
 *  site). */
const BESIDE = /^\/slipbox\/(install\.sh|stable|preview)?$/;

const pages = new Map<string, string>();
const walk = (dir: string) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, e.name);
    if (e.isDirectory()) walk(path);
    else if (e.name.endsWith(".html")) pages.set(path, readFileSync(path, "utf8"));
  }
};
walk(DIST);

const broken: string[] = [];
for (const [page, html] of pages) {
  for (const [, raw] of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
    const url = raw!.replaceAll("&amp;", "&");
    if (!url.startsWith("/") || url.startsWith("//")) continue;
    if (!url.startsWith(BASE)) {
      if (!BESIDE.test(url)) broken.push(`${page}: ${url} (outside the site)`);
      continue;
    }
    const [path, hash] = url.split("#") as [string, string | undefined];
    const rel = decodeURIComponent(path.slice(BASE.length));
    const file = rel === "" || rel.endsWith("/") ? join(DIST, rel, "index.html") : join(DIST, rel);
    if (!existsSync(file)) broken.push(`${page}: ${url} (no such page)`);
    else if (
      hash &&
      file.endsWith(".html") &&
      !(pages.get(file) ?? readFileSync(file, "utf8")).includes(`id="${hash}"`)
    )
      broken.push(`${page}: ${url} (no heading #${hash})`);
  }
}
if (broken.length) {
  console.error(`check-links: ${broken.length} broken\n${broken.join("\n")}`);
  process.exit(1);
}
console.log(`check-links: ${pages.size} pages, every link within the site lands`);
