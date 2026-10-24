#!/usr/bin/env bun
// After the build, beside check-links.ts: what the site tells search engines, shared links and agents is all there
// (SEO-D6). Every page has its full title, a description, the share card's tags and the link to llms.txt; the card is
// served, its size what the tags say; llms.txt and llms-full.txt name every page of the docs map; and the root's page
// says what slipbox is; the agent guide, served as Markdown, links only by absolute addresses. There's no root in the
// build, so it's checked as root.ts writes it (release.ts site writes that, tests/release.test.ts). Not run by
// pages.yml: its site job checks out main, which has this file only once a release brings it.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { CARD, DESCRIPTION, DOCS_URL, fullTitle, GITHUB, headTags } from "./about.ts";
import { llmsUrl, pageAddress, readMap, rewriteLinks } from "./gather.ts";
import { AGENT_GUIDE } from "./llms.ts";
import { rootPage } from "./root.ts";

/** A tag's attributes, entities decoded. */
type Attrs = Record<string, string>;

const decode = (s: string) =>
  s
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&#x27;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");

/** An HTML page's `<title>`, and its `<meta>` and `<link>` tags. A `<` or `>` may stand as it is in a title or a quoted
 *  value: Astro escapes only `&` and `"` there. */
export function headOf(html: string): { title: string | null; tags: { tag: string; attrs: Attrs }[] } {
  const title = /<title>([\s\S]*?)<\/title>/.exec(html)?.[1];
  const tags = [...html.matchAll(/<(meta|link)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/g)].map(([, tag, rest]) => ({
    tag: tag!,
    attrs: Object.fromEntries([...rest!.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, k, v]) => [k!, decode(v!)])),
  }));
  return { title: title === undefined ? null : decode(title), tags };
}

/** A PNG's size from its header, or null when it isn't one. */
function pngSize(png: Uint8Array): { width: number; height: number } | null {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  if (png.byteLength < 24 || view.getUint32(0) !== 0x89504e47) return null;
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/** What a head lacks of the card's tags and the link to llms.txt, for docs at `docs`. */
function missingTags(tags: { tag: string; attrs: Attrs }[], docs: string): string[] {
  const missing: string[] = [];
  for (const want of headTags(docs)) {
    const key = want.attrs.property ? "property" : want.attrs.name ? "name" : "rel";
    const value = want.tag === "link" ? "href" : "content";
    const found = tags.find((t) => t.tag === want.tag && t.attrs[key] === want.attrs[key]);
    if (!found) missing.push(`no ${want.attrs[key]}`);
    else if (found.attrs[value] !== want.attrs[value])
      missing.push(`${want.attrs[key]} is "${found.attrs[value]}", not "${want.attrs[value]}"`);
  }
  return missing;
}

/** The root's problems: its title, description, canonical link, refresh to the docs, the card's tags. */
export function rootProblems(html: string): string[] {
  const { title, tags } = headOf(html);
  const content = (key: string, value: string) => tags.find((t) => t.attrs[key] === value)?.attrs.content;
  const problems: string[] = [];
  if (title !== fullTitle("", true)) problems.push(`its title is "${title}", not "${fullTitle("", true)}"`);
  if (content("name", "description") !== DESCRIPTION) problems.push("its description isn't the site's");
  if (tags.find((t) => t.attrs.rel === "canonical")?.attrs.href !== DOCS_URL)
    problems.push(`no canonical link to ${DOCS_URL}`);
  if (content("http-equiv", "refresh") !== "0; url=docs/") problems.push("no refresh to docs/");
  problems.push(...missingTags(tags, DOCS_URL));
  return problems.map((p) => `the root's page: ${p}`);
}

/** Everything missing or wrong in the built docs at `dist`, against the docs map `mapText`; and in the root's page. */
export function problems(dist: string, mapText: string, root: string): string[] {
  const found: string[] = [];
  const pages: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(dir, e.name));
      else if (e.name.endsWith(".html")) pages.push(join(dir, e.name));
    }
  };
  walk(dist);
  for (const file of pages) {
    const at = relative(dist, file);
    const { title, tags } = headOf(readFileSync(file, "utf8"));
    const own = tags.find((t) => t.attrs.property === "og:title")?.attrs.content ?? "";
    const home = at === "index.html";
    const description = tags.find((t) => t.attrs.name === "description")?.attrs.content;
    if (title !== fullTitle(own, home)) found.push(`${at}: its title is "${title}", not "${fullTitle(own, home)}"`);
    if (!description) found.push(`${at}: no description`);
    else if (home && description !== DESCRIPTION) found.push(`${at}: the home's description isn't the site's`);
    for (const p of missingTags(tags, DOCS_URL)) found.push(`${at}: ${p}`);
  }
  if (!pages.length) found.push(`no pages in ${dist}`);

  const card = join(dist, CARD.file);
  if (!existsSync(card)) found.push(`no ${CARD.file}: the share card every page names`);
  else {
    const size = pngSize(new Uint8Array(readFileSync(card)));
    if (size?.width !== CARD.width || size?.height !== CARD.height)
      found.push(
        `${CARD.file} is ${size ? `${size.width} by ${size.height}` : "no PNG"}, not ${CARD.width} by ${CARD.height}`,
      );
  }

  const map = readMap(mapText).flatMap((g) => g.pages);
  const llms = join(dist, "llms.txt");
  const full = join(dist, "llms-full.txt");
  if (!existsSync(llms)) found.push("no llms.txt");
  else {
    const text = readFileSync(llms, "utf8");
    if (!text.startsWith("# slipbox\n")) found.push("llms.txt doesn't start with its H1, # slipbox");
    for (const page of map) if (!text.includes(`](${llmsUrl(page)})`)) found.push(`llms.txt leaves out ${page}`);
  }
  if (!existsSync(full)) found.push("no llms-full.txt");
  else {
    const text = readFileSync(full, "utf8");
    for (const page of map)
      if (!text.includes(`\nSource: ${pageAddress(page)}\n`)) found.push(`llms-full.txt leaves out ${page}`);
  }
  // Fetched alone, a relative link resolves against the file, where no page is.
  const guide = join(dist, AGENT_GUIDE);
  if (existsSync(guide))
    rewriteLinks(readFileSync(guide, "utf8"), (t) => {
      if (!/^https?:\/\//.test(t)) found.push(`${AGENT_GUIDE} links ${t}, not an absolute address`);
      return t;
    });

  found.push(...rootProblems(root));
  return found;
}

if (import.meta.main) {
  const dist = resolve(import.meta.dir, "..", "dist");
  const mapText = readFileSync(resolve(import.meta.dir, "..", "..", "docs", "README.md"), "utf8");
  const found = problems(dist, mapText, rootPage(DOCS_URL.replace(/\/docs\/$/, ""), GITHUB));
  if (found.length) {
    console.error(`check-meta: ${found.length} missing or wrong\n${found.join("\n")}`);
    process.exit(1);
  }
  console.log("check-meta: every page's title, description and card, llms.txt, the full text and the root's page");
}
