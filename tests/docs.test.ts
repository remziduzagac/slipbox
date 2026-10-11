// The user documentation, docs/: whole, every link landing, every command and key in the manual, and free of the
// blueprint's IDs (DOC-D3). The configuration chapter's defaults are checked in core.test.ts.
import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { CLI_COMMANDS, FLAGS } from "../src/cli/cli.ts";
import { canonSeq } from "../src/core/commands.ts";
import { extractText } from "../src/core/graph.ts";
import { githubSlugs } from "../src/core/landing.ts";
import { type Grammar, grammar } from "../src/core/syntax.ts";
import {
  DEFAULT_EXPLORER_KEYS,
  DEFAULT_FOOTNOTE_KEYS,
  DEFAULT_INFO_KEYS,
  DEFAULT_KEYS,
  DEFAULT_OUTLINE_KEYS,
  DEFAULT_RESIZE_KEYS,
  DEFAULT_SOURCE_KEYS,
  DEFAULT_VISUAL_KEYS,
} from "../src/tui/keys.ts";

const TOP = join(import.meta.dir, "..");
const DOCS = join(TOP, "docs");

/** The user docs: the map, the guides, the manual; not whatever else lies in docs/. */
function userDocs(): string[] {
  const chapters = (dir: string) => readdirSync(join(DOCS, dir)).filter((f) => f.endsWith(".md")).map((f) => join(DOCS, dir, f));
  return [join(DOCS, "README.md"), ...chapters("guides"), ...chapters("manual")];
}

const read = (file: string) => readFileSync(file, "utf8");
/** The text outside fenced code, where an example may show anything. */
const prose = (text: string) => text.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[ \t]*$/gm, "");

const slugCache = new Map<string, string[]>();
/** A doc's headings as GitHub's anchors name them. */
function slugsOf(file: string): string[] {
  let slugs = slugCache.get(file);
  if (!slugs) {
    const t = read(file);
    slugs = githubSlugs(extractText({ rel: relative(TOP, file), abs: file, size: t.length, mtimeMs: 0 }, t, [], null).headings);
    slugCache.set(file, slugs);
  }
  return slugs;
}

/** Every relative link in a doc that doesn't land: its file missing, or its `#fragment` no heading of the file. */
function brokenLinks(file: string, text = read(file)): string[] {
  const entry = extractText({ rel: relative(TOP, file), abs: file, size: text.length, mtimeMs: 0 }, text, [], null);
  const out: string[] = [];
  for (const link of entry.links) {
    if (link.kind !== "markdown" && link.kind !== "image") continue;
    if (/^[a-z][a-z0-9+.-]*:/i.test(link.target)) continue; // https:, mailto:, slipbox:
    const [path, hash] = link.target.split("#") as [string, string | undefined];
    const fragment = link.heading ?? hash ?? null;
    const target = path === "" ? file : resolve(dirname(file), decodeURIComponent(path));
    const where = `${relative(DOCS, file)}:${link.line} → ${link.target}`;
    if (!existsSync(target)) {
      out.push(`${where} (no such file)`);
      continue;
    }
    if (!fragment || statSync(target).isDirectory() || !target.endsWith(".md")) continue;
    if (!slugsOf(target).includes(fragment)) out.push(`${where} (no heading #${fragment})`);
  }
  return out;
}

/** The blueprint's IDs a doc carries: roadmap steps (`21.4`, `13.x`), decisions (D17, DOC-D2), plan items. */
function blueprintIds(text: string): string[] {
  const p = prose(text);
  return [
    ...p.matchAll(/`\d{1,2}\.(?:\d{1,2}|x)`/g),
    ...p.matchAll(/\((?:plans? )?\d{1,2}\.\d{1,2}(?:[–-]\d{1,2}\.\d{1,2})?\)/g),
    ...p.matchAll(/\b(?:[A-Z]{2,4}-)?D\d{1,3}\b/g),
    ...p.matchAll(/\bplans? `?\d/g),
  ].map((m) => m[0]);
}

/**
 * What slipbox can print: every string in its source, a template's substitutions left out, and the strings of the
 * scripts a user runs (the installer, the Homebrew formula, the source launcher). Comments may cite the blueprint.
 */
async function messages(): Promise<{ where: string; text: string }[]> {
  const sources: [string, Grammar][] = [
    ...readdirSync(join(TOP, "src"), { recursive: true })
      .map(String)
      .filter((f) => f.endsWith(".ts"))
      .map((f): [string, Grammar] => [join(TOP, "src", f), "typescript"]),
    [join(TOP, "scripts", "install.template.sh"), "bash"],
    [join(TOP, "scripts", "install-local.sh"), "bash"],
    [join(TOP, "scripts", "homebrew.template.rb"), "ruby"],
  ];
  const out: { where: string; text: string }[] = [];
  for (const [file, name] of sources) {
    const g = (await grammar(name))!;
    const tree = g.parser.parse(read(file))!;
    for (const { node } of g.strings.captures(tree.rootNode)) {
      const text = node.type === "template_string" ? node.children.map((c) => (c?.type === "template_substitution" ? "${…}" : (c?.text ?? ""))).join("") : node.text;
      out.push({ where: `${relative(TOP, file)}:${node.startPosition.row + 1}`, text });
    }
  }
  return out;
}

/** The blueprint's IDs a message carries: a roadmap step cited (`(21.12)`, `(20.16, 21.10)`, `plan 14.12`), a decision, a task. */
function idsInMessage(text: string): string[] {
  const step = String.raw`\d{1,2}\.(?:\d{1,2}|x)`;
  return [
    ...text.matchAll(new RegExp(String.raw`\((?:(?:plans?|steps?) )?${step}(?:(?:, |[–-]| and )${step})*\)`, "g")),
    ...text.matchAll(new RegExp(String.raw`\b(?:plans?|steps?) ${step}\b`, "g")),
    ...text.matchAll(/\b(?:[A-Z]{2,4}-)?D\d{1,3}\b|\b[A-Z]{2,4}-T\d{1,3}\b/g),
  ].map((m) => m[0]);
}

/** A key as the docs write it: canonical (the leader as `space`, `ctrl` before `shift`), `escape` as `esc`. */
const asWritten = (key: string) => canonSeq(key).split(" ").map((k) => k.replace(/(^|\+)escape$/, "$1esc")).join(" ");

/** The default keys, every mode's, that the keys chapter doesn't show in backticks. */
function keysLeftOut(chapter: string): string[] {
  const shown = new Set([...chapter.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]!));
  const tables = { DEFAULT_KEYS, DEFAULT_SOURCE_KEYS, DEFAULT_VISUAL_KEYS, DEFAULT_EXPLORER_KEYS, DEFAULT_OUTLINE_KEYS, DEFAULT_FOOTNOTE_KEYS, DEFAULT_INFO_KEYS, DEFAULT_RESIZE_KEYS };
  const out: string[] = [];
  for (const [name, table] of Object.entries(tables)) for (const key of Object.keys(table)) if (!shown.has(asWritten(key))) out.push(`${name}: ${asWritten(key)}`);
  return out;
}

/** The CLI's commands, and their flags, that the CLI chapter doesn't name. */
function commandsLeftOut(chapter: string): string[] {
  const out: string[] = [];
  for (const command of CLI_COMMANDS) {
    if (!new RegExp("`(?:slipbox )?" + command.replace(/[-]/g, "\\-") + "[ `]").test(chapter)) out.push(command);
    for (const flag of FLAGS[command] ?? []) if (!chapter.includes(`--${flag}`)) out.push(`${command} --${flag}`);
  }
  return out;
}

describe("the user documentation (DOC)", () => {
  test("every document is there, and the map links each", () => {
    const map = read(join(DOCS, "README.md"));
    const docs = userDocs();
    expect(docs.length).toBeGreaterThanOrEqual(22);
    for (const file of docs.slice(1)) expect(map).toContain(`(${relative(DOCS, file)}`);
  });

  test("every relative link and anchor lands", () => {
    expect(userDocs().flatMap((f) => brokenLinks(f))).toEqual([]);
  });

  test("no roadmap step or decision ID", () => {
    expect(userDocs().flatMap((f) => blueprintIds(read(f)).map((id) => `${relative(DOCS, f)}: ${id}`))).toEqual([]);
  });

  test("no roadmap step or decision ID in a message slipbox prints, nor in its installers'", async () => {
    const all = await messages();
    const found = all.flatMap((m) => idsInMessage(m.text).map((id) => `${m.where}: ${id}`));
    expect(found).toEqual([]);
    expect(all.length).toBeGreaterThan(5000); // every source file read, not none
    // The check catches what it looks for, and leaves versions and the like alone.
    expect(idsInMessage("retired (21.12); a scope (20.16, 21.10), trust (23.x); Windows is to come, plan 14.12; D166, DF-D1, DF-T3")).toEqual([
      "(21.12)",
      "(20.16, 21.10)",
      "(23.x)",
      "plan 14.12",
      "D166",
      "DF-D1",
      "DF-T3",
    ]);
    expect(idsInMessage("start nvim (0.9 or later); git 2.42; pyright@1.1.414; version 1.0; MPL-2.0; a 3D chart; ${…}")).toEqual([]);
  }, 60_000); // every source file parsed: seconds, more on a busy machine

  test("no link into the blueprint", () => {
    expect(userDocs().filter((f) => /\]\([^)]*blueprint\//.test(read(f))).map((f) => relative(DOCS, f))).toEqual([]);
  });

  test("every CLI command, with its flags, is in the CLI chapter", () => {
    expect(commandsLeftOut(read(join(DOCS, "manual", "cli.md")))).toEqual([]);
  });

  test("every default key is in the keys chapter", () => {
    expect(keysLeftOut(read(join(DOCS, "manual", "keys.md")))).toEqual([]);
  });

  test("the checks catch what they look for", () => {
    const at = join(DOCS, "manual", "keys.md");
    expect(brokenLinks(at, "[a](nowhere.md) [b](cli.md#no-such-heading) [c](https://example.com) [d](cli.md)\n")).toEqual([
      "manual/keys.md:1 → nowhere.md (no such file)",
      "manual/keys.md:1 → cli.md#no-such-heading (no heading #no-such-heading)",
    ]);
    expect(blueprintIds("Links (`21.4`) and D17, DOC-D2, plans `0.9`, (19.7).\n\n```text\nv1.2 D9\n```\n")).toEqual(["`21.4`", "`0.9`", "(19.7)", "D17", "DOC-D2", "plans `0"]);
    expect(blueprintIds("Bun 1.4.2, git 2.42, `ctrl+d`, a 3D chart.\n")).toEqual([]);
    expect(keysLeftOut("")).toContain("DEFAULT_KEYS: space l n");
    expect(commandsLeftOut("`render`")).toContain("render --width");
  });
});
