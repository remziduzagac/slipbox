// What each sample exercises, measured: `bun scripts/sample-metrics.ts <dir or files…>`. Used to
// check that the demo vault's notes cover at least what the files they replaced did.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export interface Metrics {
  lines: number;
  bytes: number;
  longest: number;
  over120: number;
  tables: number;
  tableRows: number;
  longestTableRow: number;
  tableColumns: number;
  fences: number;
  languages: string[];
  longestCodeLine: number;
  headings: number;
  headingDepth: number;
  frontmatter: boolean;
  listItems: number;
  listDepth: number;
  tasks: number;
  quotes: number;
  wikilinks: number;
  embeds: number;
  mdLinks: number;
  urls: number;
  wide: number;
  emoji: number;
  rtl: number;
  combining: number;
  headingThenTable: number;
}

export function measure(text: string): Metrics {
  const lines = text.split("\n");
  if (lines.at(-1) === "") lines.pop();
  const m: Metrics = {
    lines: lines.length,
    bytes: Buffer.byteLength(text),
    longest: 0,
    over120: 0,
    tables: 0,
    tableRows: 0,
    longestTableRow: 0,
    tableColumns: 0,
    fences: 0,
    languages: [],
    longestCodeLine: 0,
    headings: 0,
    headingDepth: 0,
    frontmatter: lines[0] === "---",
    listItems: 0,
    listDepth: 0,
    tasks: 0,
    quotes: 0,
    wikilinks: 0,
    embeds: 0,
    mdLinks: 0,
    urls: 0,
    wide: 0,
    emoji: 0,
    rtl: 0,
    combining: 0,
    headingThenTable: 0,
  };
  const langs = new Set<string>();
  let fence: string | null = null;
  let inTable = false;
  let front = m.frontmatter;
  for (const [i, line] of lines.entries()) {
    const len = [...line].length;
    m.longest = Math.max(m.longest, len);
    if (len > 120) m.over120++;
    if (front) {
      if (i > 0 && line === "---") front = false;
      continue;
    }
    const f = /^\s*(```+|~~~+)\s*([\w+-]*)/.exec(line);
    if (fence !== null) {
      if (f && f[1]!.startsWith(fence)) fence = null;
      else m.longestCodeLine = Math.max(m.longestCodeLine, len);
      continue;
    }
    if (f) {
      fence = f[1]!;
      m.fences++;
      if (f[2]) langs.add(f[2]);
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line)) {
      if (!inTable) {
        m.tables++;
        if (/^#{1,6}\s/.test(lines[i - 1] ?? "")) m.headingThenTable++;
      }
      inTable = true;
      if (!/^\s*\|[\s:|-]+\|\s*$/.test(line)) m.tableRows++;
      m.longestTableRow = Math.max(m.longestTableRow, len);
      m.tableColumns = Math.max(m.tableColumns, line.split("|").length - 2);
    } else inTable = false;
    const h = /^(#{1,6})\s/.exec(line);
    if (h) {
      m.headings++;
      m.headingDepth = Math.max(m.headingDepth, h[1]!.length);
    }
    const li = /^(\s*)([-*+]|\d+[.)])\s/.exec(line);
    if (li) {
      m.listItems++;
      m.listDepth = Math.max(m.listDepth, Math.floor(li[1]!.length / 2) + 1);
      if (/^\s*([-*+]|\d+[.)])\s\[[ xX]\]/.test(line)) m.tasks++;
    }
    if (/^\s*>/.test(line)) m.quotes++;
    m.embeds += (line.match(/!\[\[[^\]]+\]\]/g) ?? []).length;
    m.wikilinks += (line.match(/(?<!!)\[\[[^\]]+\]\]/g) ?? []).length;
    m.mdLinks += (line.match(/(?<!!)\[[^\]]*\]\([^)]+\)/g) ?? []).length;
    m.urls += (line.match(/https?:\/\/\S+/g) ?? []).length;
    m.wide += (line.match(/[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/g) ?? []).length;
    m.emoji += (line.match(/\p{Extended_Pictographic}/gu) ?? []).length;
    m.rtl += (line.match(/[֐-ࣿ]/g) ?? []).length;
    m.combining += (line.match(/\p{M}/gu) ?? []).length;
  }
  m.languages = [...langs].sort();
  return m;
}

function files(args: string[]): string[] {
  const out: string[] = [];
  const walk = (p: string) => {
    if (statSync(p).isDirectory()) {
      for (const e of readdirSync(p).sort()) if (!e.startsWith(".")) walk(join(p, e));
    } else if (p.endsWith(".md")) out.push(p);
  };
  for (const a of args) walk(a);
  return out;
}

if (import.meta.main) {
  for (const f of files(process.argv.slice(2))) console.log(f, JSON.stringify(measure(readFileSync(f, "utf8"))));
}
