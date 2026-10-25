// The picture a shared link to the docs shows (SEO-D4): assets/share-card.png, 1,200 by 630, the logo, the name and
// slipbox's line beside the README's screenshot, drawn as an SVG and rasterised as the screenshots are
// (scripts/screenshot.ts). It records what it was made from — the line, and the logo's and the screenshot's SHA-256 —
// in its own text chunks (iTXt, UTF-8), so tests/site.test.ts can tell when it's stale. Run it again when one of them changes, and
// look at the card before committing it:
//
//   bun run share-card [--out <file.png|file.svg>]

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { CARD, SENTENCE } from "../site/scripts/about.ts";
import { escapeHtml } from "../site/scripts/root.ts";
import { pngSize, toPng } from "./screenshot.ts";

const ROOT = resolve(import.meta.dir, "..");
export const CARD_FILE = join(ROOT, "assets", "share-card.png");
export const LOGO_FILE = join(ROOT, "assets", "slipbox-logo-light.svg");
export const SCREENSHOT_FILE = join(ROOT, "docs", "images", "readme-hero.png");

const BACKGROUND = "#1b2130"; // the card's dark background
const TEXT = "#c3c8d4";

/** What a card is made from, as its text chunks record it. */
export interface Made {
  line: string;
  logo: string;
  screenshot: string;
}

const sha256 = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");

/** What the card would be made from now: the line, and the logo's and the screenshot's hashes. */
export function madeFromNow(): Made {
  return { line: SENTENCE, logo: sha256(readFileSync(LOGO_FILE)), screenshot: sha256(readFileSync(SCREENSHOT_FILE)) };
}

/** Words into lines of at most `width` characters. */
export function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  for (const word of text.split(" ")) {
    const last = lines.at(-1);
    if (last !== undefined && last.length + 1 + word.length <= width) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  return lines;
}

/** The card as an SVG: the logo and the name at the top left, the line beneath, the screenshot on the right, cut off
 *  by the card's right edge. */
export function cardSvg(logo: string, screenshot: Uint8Array, line = SENTENCE): string {
  const { width: W, height: H } = CARD;
  const shot = pngSize(screenshot);
  // The screenshot 520 high, from x 560: its note and the lens show, the scratch beside them cut off by the edge.
  const sh = 520;
  const sw = (shot.width * sh) / shot.height;
  const sx = 560;
  const sy = (H - sh) / 2;
  // Supplied SVGs include an XML declaration and decimal dimensions. Embed the complete outlined logo.
  const icon = logo
    .slice(logo.indexOf("<svg"))
    .replace(/^<svg\b/, '<svg x="64" y="64"')
    .replace(/\swidth="[^"]+"/, ' width="256"')
    .replace(/\sheight="[^"]+"/, ' height="256"');
  const text = wrap(line, 25)
    .map((l, i) => `<text x="64" y="${384 + i * 46}" font-size="34" fill="${TEXT}">${escapeHtml(l)}</text>`)
    .join("");
  const href = `data:image/png;base64,${Buffer.from(screenshot).toString("base64")}`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<rect width="100%" height="100%" fill="${BACKGROUND}"/>` +
    icon +
    text +
    `<clipPath id="shot"><rect x="${sx}" y="${sy}" width="${sw}" height="${sh}" rx="14"/></clipPath>` +
    `<image x="${sx}" y="${sy}" width="${sw.toFixed(2)}" height="${sh}" href="${href}" clip-path="url(#shot)"/>` +
    `<rect x="${sx}" y="${sy}" width="${sw.toFixed(2)}" height="${sh}" rx="14" fill="none" stroke="#3a4256" stroke-width="2"/>` +
    "</svg>"
  );
}

/** A PNG's chunks: their types and data. */
function chunks(png: Uint8Array): { type: string; data: Uint8Array; at: number; end: number }[] {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const found = [];
  for (let at = 8; at + 12 <= png.byteLength; ) {
    const length = view.getUint32(at);
    const type = new TextDecoder().decode(png.subarray(at + 4, at + 8));
    const end = at + 12 + length;
    found.push({ type, data: png.subarray(at + 8, at + 8 + length), at, end });
    at = end;
  }
  return found;
}

const TEXT_CHUNKS = ["tEXt", "iTXt"];

/** The PNG with an `iTXt` chunk for each entry, after its header: its key, then its text as UTF-8, uncompressed, with
 *  no language. A text chunk of the same key already there goes. */
export function withText(png: Uint8Array, entries: Record<string, string>): Uint8Array {
  const [header, ...rest] = chunks(png);
  const parts: Uint8Array[] = [png.subarray(0, header!.end)];
  for (const [key, value] of Object.entries(entries)) {
    // The key, its NUL; compression flag and method 0; an empty language and an empty translated key, each its NUL.
    const data = new TextEncoder().encode(`${key}\0\0\0\0\0${value}`);
    const chunk = new Uint8Array(12 + data.length);
    const view = new DataView(chunk.buffer);
    view.setUint32(0, data.length);
    chunk.set(new TextEncoder().encode("iTXt"), 4);
    chunk.set(data, 8);
    view.setUint32(8 + data.length, Bun.hash.crc32(chunk.subarray(4, 8 + data.length)));
    parts.push(chunk);
  }
  for (const c of rest)
    if (!TEXT_CHUNKS.includes(c.type) || !(keyOf(c.data) in entries)) parts.push(png.subarray(c.at, c.end));
  return Buffer.concat(parts);
}

const keyOf = (data: Uint8Array) => new TextDecoder("latin1").decode(data.subarray(0, data.indexOf(0)));

/** A text chunk's text: a `tEXt`'s Latin-1, an uncompressed `iTXt`'s UTF-8 after its language and translated key. */
function textIn(type: string, data: Uint8Array): string | null {
  const key = data.indexOf(0);
  if (type === "tEXt") return new TextDecoder("latin1").decode(data.subarray(key + 1));
  if (data[key + 1] !== 0) return null;
  const language = data.indexOf(0, key + 3);
  const translated = data.indexOf(0, language + 1);
  return new TextDecoder().decode(data.subarray(translated + 1));
}

/** A PNG's text chunks, by key. */
export function textOf(png: Uint8Array): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of chunks(png).filter((c) => TEXT_CHUNKS.includes(c.type))) {
    const text = textIn(c.type, c.data);
    if (text !== null) out[keyOf(c.data)] = text;
  }
  return out;
}

/** What a card says it was made from. */
export function madeFrom(png: Uint8Array): Partial<Made> {
  const t = textOf(png);
  return { line: t["slipbox:line"], logo: t["slipbox:logo"], screenshot: t["slipbox:screenshot"] };
}

/** The card, made now, with what it was made from in it. */
export async function makeCard(): Promise<Uint8Array> {
  const made = madeFromNow();
  const svg = cardSvg(readFileSync(LOGO_FILE, "utf8"), new Uint8Array(readFileSync(SCREENSHOT_FILE)));
  const png = await toPng(svg, 1, { faces: ["DejaVuSans.ttf", "DejaVuSans-Bold.ttf"], family: "DejaVu Sans" });
  return withText(png, {
    "slipbox:line": made.line,
    "slipbox:logo": made.logo,
    "slipbox:screenshot": made.screenshot,
  });
}

if (import.meta.main) {
  const i = process.argv.indexOf("--out");
  if (i >= 0 && !process.argv[i + 1]) {
    console.error("share-card: --out takes a file, .png or .svg");
    process.exit(2);
  }
  const out = i < 0 ? CARD_FILE : resolve(process.argv[i + 1]!);
  if (out.endsWith(".svg"))
    writeFileSync(out, cardSvg(readFileSync(LOGO_FILE, "utf8"), new Uint8Array(readFileSync(SCREENSHOT_FILE))));
  else writeFileSync(out, await makeCard());
  console.log(`share-card: ${out}`);
}
