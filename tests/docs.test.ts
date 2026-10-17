// The user documentation, docs/: whole, every link landing, every command and key in the manual, and free of the
// blueprint's IDs (DOC-D3). The configuration chapter's defaults are checked in core.test.ts.
import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { parseAnsi, toSvg } from "../scripts/screenshot.ts";
import { CLI_COMMANDS, FLAGS } from "../src/cli/cli.ts";
import { canonSeq } from "../src/core/commands.ts";
import { extractText } from "../src/core/graph.ts";
import { githubSlugs } from "../src/core/landing.ts";
import { type Grammar, grammar } from "../src/core/syntax.ts";
import {
  DEFAULT_EXPLORER_KEYS,
  DEFAULT_FOOTNOTE_KEYS,
  DEFAULT_GIT_KEYS,
  DEFAULT_INFO_KEYS,
  DEFAULT_KEYS,
  DEFAULT_OUTLINE_KEYS,
  DEFAULT_PEEK_KEYS,
  DEFAULT_RESIZE_KEYS,
  DEFAULT_SOURCE_KEYS,
  DEFAULT_VISUAL_KEYS,
} from "../src/tui/keys.ts";
import { MOUSE_HELP } from "../src/tui/mouse-help.ts";
import { placeholderRow } from "../src/tui/placeholders.ts";

const TOP = join(import.meta.dir, "..");
const DOCS = join(TOP, "docs");

/** The user docs: the map, the guides, the manual, the agent guide; not whatever else lies in docs/. */
function userDocs(): string[] {
  const chapters = (dir: string) =>
    readdirSync(join(DOCS, dir))
      .filter((f) => f.endsWith(".md"))
      .map((f) => join(DOCS, dir, f));
  return [join(DOCS, "README.md"), ...chapters("guides"), ...chapters("manual"), join(DOCS, "agent-guide.md")];
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
    slugs = githubSlugs(
      extractText({ rel: relative(TOP, file), abs: file, size: t.length, mtimeMs: 0 }, t, [], null).headings,
    );
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

/** Text blanked, its line breaks kept: what's left keeps its line numbers. */
const blank = (text: string) => text.replace(/[^\n]/g, " ");

/** The words what users read no longer says (VV-D1): a vault is a vault, and nothing is a plain folder or loose file. */
const NOT_VAULT = /\broots?\b|\bplain folders?\b|\bloose (?:files?|folders?)\b/i;
/** Root's meanings other than a vault: the file system's `/`, the root user, the maths. */
const ROOT_ELSEWHERE =
  /\bfile ?system's root\b|\bas root\b|\broot (?:user|or administrator|cause)\b|\bsquare roots?\b/gi;
/** The names that keep the word (VV-D1): a flag, settings, a command, the export's CSS. The docs show them as code. */
const ROOT_NAMES = /--root\b|\[trust\] roots\b|\btrust\.roots\b|\broot_markers\b|\bpin-root\b|:root\b/g;

/**
 * Where a doc says "root" for a vault (or a plain folder, a loose file), as `line: text`: what users read says vault
 * (VV-D1). Code, fenced or a span, and a link's target are left out — the flag `--root`, the setting `[trust] roots`,
 * the JSON's `root` field keep the word — and so are root's other meanings.
 */
function rootsForVaults(text: string): string[] {
  const kept = text
    .replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[ \t]*$/gm, blank)
    .replace(/(`+)[\s\S]*?[^`]\1(?!`)/g, blank)
    .replace(/(\]\()([^)\s]*\))/g, (_, open: string, target: string) => open + blank(target))
    .replace(ROOT_ELSEWHERE, blank);
  const lines = text.split("\n");
  return kept.split("\n").flatMap((line, i) => (NOT_VAULT.test(line) ? [`${i + 1}: ${lines[i]!.trim()}`] : []));
}

/** Whether a message slipbox prints says "root" for a vault: one with a space in it, a sentence, not a key or a value. */
const saysRoot = (message: string) =>
  /\s/.test(message) && NOT_VAULT.test(message.replace(ROOT_NAMES, "").replace(ROOT_ELSEWHERE, ""));

let messagesRead: Promise<{ where: string; text: string }[]> | undefined;
/**
 * What slipbox can print: every string in its source, a template's substitutions left out, and the strings of the
 * scripts a user runs (the installer and the Pages site's that runs it, the Homebrew formula, the source launcher).
 * Comments may cite the blueprint. Read once, for every test that asks.
 */
function messages(): Promise<{ where: string; text: string }[]> {
  messagesRead ??= readMessages();
  return messagesRead;
}

async function readMessages(): Promise<{ where: string; text: string }[]> {
  const sources: [string, Grammar][] = [
    ...readdirSync(join(TOP, "src"), { recursive: true })
      .map(String)
      .filter((f) => f.endsWith(".ts"))
      .map((f): [string, Grammar] => [join(TOP, "src", f), "typescript"]),
    [join(TOP, "scripts", "install.template.sh"), "bash"],
    [join(TOP, "scripts", "bootstrap.template.sh"), "bash"],
    [join(TOP, "scripts", "install-local.sh"), "bash"],
    [join(TOP, "scripts", "homebrew.template.rb"), "ruby"],
  ];
  const out: { where: string; text: string }[] = [];
  for (const [file, name] of sources) {
    const g = (await grammar(name))!;
    const tree = g.parser.parse(read(file))!;
    for (const { node } of g.strings.captures(tree.rootNode)) {
      const text =
        node.type === "template_string"
          ? node.children.map((c) => (c?.type === "template_substitution" ? "${…}" : (c?.text ?? ""))).join("")
          : node.text;
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
const asWritten = (key: string) =>
  canonSeq(key)
    .split(" ")
    .map((k) => k.replace(/(^|\+)escape$/, "$1esc"))
    .join(" ");

/** Every mode's default keys, by the table's name. */
const KEY_TABLES = {
  DEFAULT_KEYS,
  DEFAULT_SOURCE_KEYS,
  DEFAULT_VISUAL_KEYS,
  DEFAULT_EXPLORER_KEYS,
  DEFAULT_GIT_KEYS,
  DEFAULT_OUTLINE_KEYS,
  DEFAULT_FOOTNOTE_KEYS,
  DEFAULT_INFO_KEYS,
  DEFAULT_RESIZE_KEYS,
  DEFAULT_PEEK_KEYS,
};

/** The default keys, every mode's, that the keys chapter doesn't show in backticks. */
function keysLeftOut(chapter: string): string[] {
  const shown = new Set([...chapter.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]!));
  const out: string[] = [];
  for (const [name, table] of Object.entries(KEY_TABLES))
    for (const key of Object.keys(table)) if (!shown.has(asWritten(key))) out.push(`${name}: ${asWritten(key)}`);
  return out;
}

/** Keys only typing has (editing.ts's insertKeyNow), in no keymap. */
const TYPING_KEYS = new Set(["backspace", "delete", "ctrl+w"]);
/** One key as the docs write it: modifiers, then a character or a named key. */
const KEY =
  /^(?:(?:ctrl|alt|shift|cmd)\+)*(?:[a-z0-9/\\?]|left|right|up|down|home|end|page(?:up|down)|tab|enter|esc|backspace|delete)$/;

/** The keys a doc shows in backticks that slipbox hasn't: bound in no mode, and not a key of typing. */
function keysUnbound(text: string): string[] {
  const bound = new Set(Object.values(KEY_TABLES).flatMap((table) => Object.keys(table).map(asWritten)));
  return [...prose(text).matchAll(/`([^`\n]+)`/g)]
    .map((m) => m[1]!)
    .filter((k) => k !== "space" && k.split(" ").every((t) => t === "space" || KEY.test(t)))
    .filter((k) => !bound.has(k) && !TYPING_KEYS.has(k));
}

/** The test files that read the docs, the blueprint or the site: the ones `bun run test:docs` runs, as package.json says. */
function docsTestFiles(): string[] {
  const scripts = (JSON.parse(read(join(TOP, "package.json"))) as { scripts: Record<string, string> }).scripts;
  return [...(scripts["test:docs"] ?? "").matchAll(/\.\/(tests\/\S+\.test\.ts)/g)].map((m) => m[1]!);
}

/** Whether a test's source reads the repository's docs, blueprint, site or top-level Markdown (D230). */
const readsDocs = (source: string) =>
  /"\.\.",\s*"(?:docs|blueprint|site|[A-Z_]+\.md)"|\b(?:TOP|ROOT),\s*"(?:docs|blueprint|site|[A-Z_]+\.md)"/.test(
    source,
  );

/** The CLI's commands, and their flags, that the CLI chapter doesn't name. */
function commandsLeftOut(chapter: string): string[] {
  const out: string[] = [];
  for (const command of CLI_COMMANDS) {
    if (!new RegExp("`(?:slipbox )?" + command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[ `]").test(chapter))
      out.push(command);
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
    expect(
      idsInMessage(
        "retired (21.12); a scope (20.16, 21.10), trust (23.x); Windows is to come, plan 14.12; D166, DF-D1, DF-T3",
      ),
    ).toEqual(["(21.12)", "(20.16, 21.10)", "(23.x)", "plan 14.12", "D166", "DF-D1", "DF-T3"]);
    expect(
      idsInMessage("start nvim (0.9 or later); git 2.42; pyright@1.1.414; version 1.0; MPL-2.0; a 3D chart; ${…}"),
    ).toEqual([]);
  }, 60_000); // every source file parsed: seconds, more on a busy machine

  test("vault, never root, for the folders slipbox works in: the docs, the README, the skill, the messages (VV-D1)", async () => {
    const files = [...userDocs(), join(TOP, "README.md"), join(TOP, "skills", "slipbox", "SKILL.md")];
    expect(files.flatMap((f) => rootsForVaults(read(f)).map((r) => `${relative(TOP, f)}:${r}`))).toEqual([]);
    expect((await messages()).filter((m) => saysRoot(m.text)).map((m) => `${m.where}: ${m.text}`)).toEqual([]);
    // The checks catch what they look for, and leave code, links' targets and root's other meanings alone.
    expect(
      rootsForVaults(
        "Open the root.\nIn `--root <dir>`, the `root` field\nand a span `over\ntwo lines, root`.\n" +
          "[Links](links-and-roots.md#roots), the filesystem's root, nothing runs as root.\n" +
          "```toml\n# the root\n```\nSquare roots and a root cause.\nRoots nested in roots.\n" +
          "A plain folder, `--plain`, a loose file.\n",
      ),
    ).toEqual(["1: Open the root.", "10: Roots nested in roots.", "11: A plain folder, `--plain`, a loose file."]);
    expect(saysRoot("x is outside the root")).toBe(true);
    expect(saysRoot("names need a Root")).toBe(true);
    expect(saysRoot("made x/ a plain folder of y")).toBe(true);
    expect(saysRoot("--root x isn't a vault; [trust] roots lists it; walk.root_markers; :root { }")).toBe(false);
    expect(saysRoot("root")).toBe(false); // a value: the JSON's `mode`, a change's kind
  }, 60_000); // every source file parsed, when the test above hasn't

  test("no link into the blueprint", () => {
    expect(
      userDocs()
        .filter((f) => /\]\([^)]*blueprint\//.test(read(f)))
        .map((f) => relative(DOCS, f)),
    ).toEqual([]);
  });

  test("every CLI command, with its flags, is in the CLI chapter", () => {
    expect(commandsLeftOut(read(join(DOCS, "manual", "cli.md")))).toEqual([]);
  });

  test("every default key is in the keys chapter", () => {
    expect(keysLeftOut(read(join(DOCS, "manual", "keys.md")))).toEqual([]);
  });

  test("the pages for newcomers name only keys slipbox has", () => {
    const pages = ["keys-you-know.md", "quick-start.md", "getting-started.md"];
    expect(pages.flatMap((f) => keysUnbound(read(join(DOCS, "guides", f))).map((k) => `${f}: ${k}`))).toEqual([]);
  });

  test("the checks catch what they look for", () => {
    const at = join(DOCS, "manual", "keys.md");
    expect(
      brokenLinks(at, "[a](nowhere.md) [b](cli.md#no-such-heading) [c](https://example.com) [d](cli.md)\n"),
    ).toEqual([
      "manual/keys.md:1 → nowhere.md (no such file)",
      "manual/keys.md:1 → cli.md#no-such-heading (no heading #no-such-heading)",
    ]);
    expect(blueprintIds("Links (`21.4`) and D17, DOC-D2, plans `0.9`, (19.7).\n\n```text\nv1.2 D9\n```\n")).toEqual([
      "`21.4`",
      "`0.9`",
      "(19.7)",
      "D17",
      "DOC-D2",
      "plans `0",
    ]);
    expect(blueprintIds("Bun 1.4.2, git 2.42, `ctrl+d`, a 3D chart.\n")).toEqual([]);
    expect(keysLeftOut("")).toContain("DEFAULT_KEYS: space l n");
    expect(keysUnbound('`ctrl+shift+k` `ctrl+f` `space f f` `backspace` `INSERT` `editor.edit_in = "x"`')).toEqual([
      "ctrl+shift+k",
    ]);
    expect(commandsLeftOut("`render`")).toContain("render --width");
  });
});

describe("what the manual promises of the code (DOC)", () => {
  type Sections = Record<string, Record<string, unknown>>;

  test("every key's default is the one its listing gives", async () => {
    const { DEFAULT_CONFIG } = await import("../src/core/config.ts");
    const doc = read(join(DOCS, "manual", "configuration.md"));
    const listed = Bun.TOML.parse(doc.split("## Every key")[1]!.split("```toml")[1]!.split("```")[0]!) as Sections;
    // The tables there are examples, not defaults: servers, languages, linters, keys, aliases, groups, colours.
    const examples = new Set(["language-server", "language", "linter", "keys", "aliases", "groups", "colors", "types"]);
    const defaults = DEFAULT_CONFIG as unknown as Sections;
    const differ: string[] = [];
    for (const [section, table] of Object.entries(listed)) {
      if (examples.has(section)) continue;
      if (typeof table !== "object") {
        if (JSON.stringify(table) !== JSON.stringify(defaults[section])) differ.push(section);
        continue;
      }
      for (const [key, value] of Object.entries(table))
        if (JSON.stringify(defaults[section]?.[key]) !== JSON.stringify(value)) differ.push(`${section}.${key}`);
      // …and no setting left out of the listing.
      for (const key of Object.keys(defaults[section] ?? {}))
        if (!(key in table)) differ.push(`${section}.${key} (not listed)`);
    }
    for (const section of Object.keys(defaults)) if (!(section in listed)) differ.push(`[${section}] (not listed)`);
    expect(differ).toEqual([]);
    expect(Object.keys(listed).length).toBeGreaterThan(15);
  });

  test("MOUSE_HELP, help's mouse list, has what the keys chapter's § Mouse has: the rail, the palette, the popups", () => {
    const help = MOUSE_HELP.map(([label, keys, detail]) => [label, ...keys, detail].join(" ")).join("\n");
    const md = read(join(DOCS, "manual", "keys.md"));
    const chapter = md.slice(md.indexOf("\n## Mouse"), md.indexOf("\n## ", md.indexOf("\n## Mouse") + 1));
    const things = [
      "≡",
      "◷",
      "±",
      "ℹ",
      "▤",
      "¹",
      "slipbox",
      "palette",
      "breadcrumb",
      "+N",
      "×",
      "middle-click",
      "tab strip",
      "border",
      "scrollbar",
      "☐",
      "‹",
      "›",
      "path",
      "problems bar",
      "Problems",
      "message",
      "which-key",
      "code cell",
      "explorer",
      "history",
      "source control",
      "outline",
      "footnotes",
      "Info",
      "double",
      "triple",
      "wheel",
      "question",
    ];
    for (const t of things) expect([t, help.includes(t), chapter.includes(t)]).toEqual([t, true, true]);
  });
});

describe("the docs' tests (D230)", () => {
  test("every test that reads the docs is one `bun run test:docs` runs, which CI runs on a change of the docs alone", () => {
    const files = readdirSync(join(TOP, "tests"), { recursive: true, encoding: "utf8" })
      .filter((f) => f.endsWith(".ts") && !f.includes("node_modules"))
      .map((f) => `tests/${f}`);
    const reading = files.filter((f) => readsDocs(read(join(TOP, f)))).sort();
    expect(reading).toEqual([...docsTestFiles()].sort());
    // The check catches what it looks for, and leaves a test's own folders alone.
    expect(readsDocs('join(import.meta.dir, "..", "docs", "manual", "keys.md")')).toBe(true);
    expect(readsDocs('join(TOP, "README.md")')).toBe(true);
    expect(readsDocs('join(ROOT, "blueprint")')).toBe(true);
    expect(readsDocs('mkdirSync(join(dir, "docs"))')).toBe(false);
    expect(readsDocs('join(ROOT, ".github", "workflows", "ci.yml")')).toBe(false);
  });
});

describe("the docs' screenshots (scripts/screenshot.ts)", () => {
  // A picture shows in a pane's text only as Kitty's placeholder cells, coloured with its id.
  const PICTURE = join(TOP, "examples", "home", "hobbies", "cooking", "attachments", "dal.png");
  const cells = (rows: number[], cols: number) =>
    ["a line of text", ...rows.map((r) => `  \x1b[38;2;0;0;42m${placeholderRow(r, cols)}\x1b[0m after`)].join("\n");
  // DejaVu Sans Mono's cell at 10px, as the script draws it.
  const W = (10 * 1233) / 2048;
  const H = 10 * 1.164;
  const at = (n: number) => n.toFixed(2);

  test("a picture is drawn over its cells, at its own size, clipped to the rows shown, its first rows scrolled off", () => {
    // Rows 2–4 of a picture 4 columns wide, on screen rows 1–3, two columns in.
    const svg = toSvg(parseAnsi(cells([2, 3, 4], 4)), { cols: 20, rows: 5, fontSize: 10, pictures: [PICTURE] });
    expect(svg).not.toContain("\u{10EEEE}");
    const png = readFileSync(PICTURE).toString("base64");
    expect(svg).toContain(
      `<clipPath id="picture-0"><rect x="${at(2 * W)}" y="${at(H)}" width="${at(4 * W)}" height="${at(3 * H)}"/></clipPath>`,
    );
    expect(svg).toContain(
      `<image x="${at(2 * W)}" y="${at(-H)}" width="${at(4 * W)}" height="${at(5 * H)}" href="data:image/png;base64,${png}"`,
    );
    // Kept to the rows shown: the rows above, scrolled off, aren't drawn over the line of text.
    expect(svg).toMatch(/<image [^>]*clip-path="url\(#picture-0\)"\/>/);
  });
  test("a picture's box, its bottom off the screen, is as tall as its proportions make it", () => {
    // 120×90 drawn 30 columns wide: 30 × 6.02 × 0.75 / 11.64, so 12 rows; 2 of them shown.
    const svg = toSvg(parseAnsi(cells([0, 1], 30)), { cols: 40, rows: 3, fontSize: 10, pictures: [PICTURE] });
    expect(svg).toContain(`<image x="${at(2 * W)}" y="${at(H)}" width="${at(30 * W)}" height="${at(12 * H)}"`);
  });
  test("placeholder cells with no picture named are left blank, never drawn as boxes", () => {
    const svg = toSvg(parseAnsi(cells([0, 1], 4)), { cols: 20, rows: 3, fontSize: 10 });
    expect(svg).not.toContain("\u{10EEEE}");
    expect(svg).not.toContain("<image");
    // The text after them stays where it was: 2 columns in, 4 of the picture, a space.
    expect(svg).toContain(`<text x="${at(7 * W)}" y="20.92" fill="#c0caf5">a</text>`);
  });
});
