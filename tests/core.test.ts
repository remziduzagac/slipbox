import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatEntry, formatRef, parseRef, scratchLocation } from "../src/core/capture.ts";
import { copyText } from "../src/core/clipboard.ts";
import { readDoc } from "../src/core/docformats.ts";
import { canonKey, Keymap, unknownModifiers } from "../src/core/commands.ts";
import { loadConfig } from "../src/core/config.ts";
import { LinkIndex } from "../src/core/links.ts";
import { headingsOf, newParseCache, noteChunks, parseLegacy, parseMarkdown, slugify, visit } from "../src/core/parse.ts";
import { mathRows, mathText } from "../src/core/math.ts";
import { flattenVars, loadRasterizer, looksLikeSvg } from "../src/core/svg.ts";
import { loadMermaid, mermaidSvg } from "../src/core/diagrams.ts";
import { loadTypesetter } from "../src/core/typeset.ts";
import { extractFromSource } from "../src/core/graph.ts";
import { lintCommand, lintLoadsCode, parseLint, runLint } from "../src/core/lint.ts";
import { isTrusted, setTrust, setTrustedRoots, trustFile, trustOf } from "../src/core/trust.ts";
import { addFootnote, applyEdits, deleteFootnote, editFootnote, footnotesOf, renameFootnote, type TextEdit } from "../src/core/footnotes.ts";
import { layoutToAnsi } from "../src/core/layout/ansi.ts";
import { renderMarkdown } from "../src/core/layout/render.ts";
import { layoutSource } from "../src/core/layout/source.ts";
import { expandTabs, sanitize, sanitizeMap } from "../src/core/sanitize.ts";
import { base16ToPalette, parseBase16 } from "../src/core/theme/base16.ts";
import { applyColorOverrides, listThemes, loadTheme, ROLES } from "../src/core/theme/index.ts";
import { blend, colorHex, luminance } from "../src/core/theme/theme.ts";
import { glyphsFor } from "../src/core/glyphs.ts";
import { WriteRefused, writeNote } from "../src/core/fsutil.ts";
import { listTasks, toggleTask } from "../src/core/tasks.ts";
import { diffLines, merge3, unifiedDiff } from "../src/core/merge.ts";
import { compilePattern, expandReplacement, findAll, firstPerLine, parseSubstitute, replaceMatches } from "../src/core/replace.ts";
import { editorArgv, splitCommand } from "../src/core/editor.ts";
import { discoverNvims, nvimSockets } from "../src/core/nvim.ts";
import { graphemes, stringWidth, truncate } from "../src/core/width.ts";
import { ensureCacheHome, type StoreKind, storeDir } from "../src/core/paths.ts";
import type { WikiLink } from "../src/core/wikilink.ts";

// Isolation (testing.md): never read or write the real config, cache or state directories.
const sandbox = mkdtempSync(join(tmpdir(), "slipbox-core-"));
process.env.XDG_STATE_HOME = join(sandbox, "state");
process.env.XDG_CACHE_HOME = join(sandbox, "cache");
process.env.XDG_CONFIG_HOME = join(sandbox, "config");
process.env.XDG_DATA_HOME = join(sandbox, "data"); // the home vault (17.2)
delete process.env.SLIPBOX_CONFIG; // it would win over XDG_CONFIG_HOME: never the developer's own config
process.env.SLIPBOX_CLIPBOARD = "file"; // copies never reach the developer's clipboard
afterAll(() => rmSync(sandbox, { recursive: true, force: true }));
// A root is trusted only where a test says so (23.x): none by default, as in use.
afterEach(() => setTrustedRoots([]));


describe("width (0.7)", () => {
  test("ASCII, CJK, emoji, ZWJ, combining marks", () => {
    expect(stringWidth("abcdefgh")).toBe(8);
    expect(stringWidth("日本語のテキスト")).toBe(16);
    expect(stringWidth("🌍🚀")).toBe(4);
    expect(stringWidth("👨‍👩‍👧‍👦")).toBe(2);
    expect(graphemes("👨‍👩‍👧‍👦")).toHaveLength(1);
    expect(stringWidth("e\u0301")).toBe(1);
    expect(stringWidth("é")).toBe(1);
    expect(stringWidth("a\u200Bb")).toBe(2);
  });
  test("truncate never splits a wide grapheme", () => {
    expect(truncate("日本語", 5)).toBe("日本…");
    expect(stringWidth(truncate("日本語テキスト", 6))).toBeLessThanOrEqual(6);
  });
});

describe("sanitize (2.9)", () => {
  test("strips CSI, OSC and bare controls, keeps text", () => {
    expect(sanitize("a\x1b[2Jb\x1b[31mred\x1b[0m")).toBe("abred");
    expect(sanitize("x\x1b]52;c;aGk=\x07y")).toBe("xy");
    expect(sanitize("tab\tnewline\nok")).toBe("tab\tnewline\nok");
    expect(sanitize("bell\x07 del\x7f c1\x9b")).toBe("bell del c1");
    expect(sanitize("rtl\u202Eoverride")).toBe("rtloverride");
  });
  test("an unterminated OSC or DCS string takes the rest of its line, never the lines after it", () => {
    expect(sanitize("line one \x1b]0;title\nline two\nline three")).toBe("line one \nline two\nline three");
    expect(sanitize("a\x1bPq#0\nb\nc")).toBe("a\nb\nc");
    expect(sanitizeMap("x\x1b]0;t\ny").text).toBe("x\ny");
  });
  test("sanitizeMap: the same text, and where each raw index went (-1 for one taken out)", () => {
    for (const raw of ["plain", "bell\x07ring.md", "a\x1b[31mred\x1b[0m b", "x\x1b]0;t\x07y\u2028z", "c1\x9b31mq\u202Er", "e\x1b"]) {
      const m = sanitizeMap(raw);
      expect(m.text).toBe(sanitize(raw));
      expect(m.at.length).toBe(raw.length);
      // Every kept index lands on its own character, in order.
      const kept = m.at.map((to, i) => [to, i] as const).filter(([to]) => to >= 0);
      expect(kept.map(([to]) => to)).toEqual([...m.text].map((_, k) => k));
      for (const [to, i] of kept) expect(m.text[to]).toBe(raw[i] === "\u2028" ? " " : raw[i]);
    }
    expect(sanitizeMap("bell\x07ring").at.slice(4)).toEqual([-1, 4, 5, 6, 7]);
    expect(sanitizeMap("a\x1b[31mb").at).toEqual([0, -1, -1, -1, -1, -1, 1]);
  });
});

// The converter (20.1) reads wikilinks by parseLegacy, the same parse as a note's since 21.3.
describe("wikilink syntax, as the converter reads it", () => {
  const links = (src: string) => {
    const out: WikiLink[] = [];
    visit(parseLegacy(src), (n) => {
      if ((n.type as string) === "wikiLink") out.push(n as unknown as WikiLink);
    });
    return out;
  };
  test("a note's parse reads them again (21.3): wikilinks and embeds", () => {
    const types: string[] = [];
    visit(parseMarkdown("[[Foo Bar|x]] ![[img.png]]").tree, (n) => void types.push(n.type));
    expect(types.filter((t) => t === "wikiLink")).toHaveLength(2);
  });
  test("targets, headings, blocks, aliases and embeds", () => {
    const [a, b, c, d] = links("[[Foo Bar|x]] ![[img.png]] [[n#Head]] [[n#^blk]]");
    expect(a).toMatchObject({ target: "Foo Bar", alias: "x", embed: false });
    expect(b).toMatchObject({ target: "img.png", embed: true });
    expect(c).toMatchObject({ target: "n", heading: "Head" });
    expect(d).toMatchObject({ target: "n", block: "blk" });
  });
  test("a block is `#^id`, or a bare `^id` with no heading before it; a caret in a heading is the heading's", async () => {
    const { parseWikiTarget } = await import("../src/core/wikilink.ts");
    expect(parseWikiTarget("Complexity#O(n^2)")).toMatchObject({ target: "Complexity", heading: "O(n^2)", block: null });
    expect(parseWikiTarget("f^(n)|deriv")).toMatchObject({ target: "f^(n)", heading: null, block: null, alias: "deriv" });
    expect(parseWikiTarget("note^abc")).toMatchObject({ target: "note", block: "abc" });
    expect(parseWikiTarget("note#^abc")).toMatchObject({ target: "note", heading: null, block: "abc" });
    // The documented bare form: `x^2` is note x's block 2 (an id may be digits).
    expect(parseWikiTarget("x^2")).toMatchObject({ target: "x", block: "2" });
  });
  test("never inside code, never when escaped", () => {
    expect(links("`[[code]]` \\[[esc]]\n\n```\n[[fenced]]\n```\n")).toHaveLength(0);
  });
  test("escaped pipe in a table cell is an alias divider", () => {
    const [l] = links("| a |\n| - |\n| [[t\\|al]] |\n");
    expect(l).toMatchObject({ target: "t", alias: "al" });
  });
  test("source positions", () => {
    const [l] = links("ab [[x]]");
    expect(l!.position!.start.column).toBe(4);
  });
});

describe("link resolution (1.4)", () => {
  const idx = new LinkIndex(["index.md", "projects/index.md", "a/deep/index.md", "notes/Readme.md", "notes/alpha.md", "x/dup.md", "y/dup.md"]);
  test("case-insensitive everywhere", () => {
    expect(idx.resolveWiki("README", null)).toMatchObject({ status: "resolved", path: "notes/Readme.md" });
    expect(idx.resolveWiki("ALPHA", null).path).toBe("notes/alpha.md");
  });
  test("collisions: same directory, then deepest shared, then shortest", () => {
    expect(idx.resolveWiki("index", "projects/other.md").path).toBe("projects/index.md");
    expect(idx.resolveWiki("index", "a/deep/sub/note.md").path).toBe("a/deep/index.md");
    expect(idx.resolveWiki("index", "notes/alpha.md").path).toBe("index.md");
  });
  test("a genuine tie is ambiguous with every candidate", () => {
    const r = idx.resolveWiki("dup", "z/n.md");
    expect(r.status).toBe("ambiguous");
    expect(r.candidates).toEqual(["x/dup.md", "y/dup.md"]);
  });
  test("path suffixes, extensions and relative forms", () => {
    expect(idx.resolveWiki("projects/index", null).path).toBe("projects/index.md");
    expect(idx.resolveWiki("deep/index", null).path).toBe("a/deep/index.md");
    expect(idx.resolveWiki("alpha.md", null).path).toBe("notes/alpha.md");
    expect(idx.resolveWiki("../index", "notes/alpha.md").path).toBe("index.md");
    expect(idx.resolveWiki("nope", null).status).toBe("unresolved");
  });
});

describe("capture format (8.3, 8.4)", () => {
  test("refs round-trip in prompt-buffer.lua's four shapes", () => {
    for (const s of ["a.ts:42", "a.ts:42-50", "a.ts:42:10-30", "a.ts:42:10-50:30"]) {
      expect(formatRef(parseRef(s)!)).toBe(`\`${s}\``);
    }
    expect(parseRef("nope")).toBeNull();
  });
  test("snippet is fenced with the file's language and read from disk", () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-cap-"));
    writeFileSync(join(dir, "f.ts"), "one\ntwo\nthree\n");
    const entry = formatEntry({ ref: parseRef("f.ts:2-3")!, snippet: true, cwd: dir }, dir);
    expect(entry).toBe("`f.ts:2-3`\n\n```typescript\ntwo\nthree\n```");
  });
  test("a name that merely starts with dots (`..notes/`) is in the project: its path from there, not its absolute one", () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-cap-"));
    mkdirSync(join(dir, "..notes"));
    writeFileSync(join(dir, "..notes", "a.md"), "one\n");
    expect(formatEntry({ ref: parseRef("..notes/a.md:1")!, cwd: dir }, dir)).toBe("`..notes/a.md:1`");
  });
});

describe("folders that travel together (21.7)", () => {
  test("two folders outside git, one in the other's `..archive/`: they travel together (21.7)", async () => {
    const { travelTogether } = await import("../src/core/folders.ts");
    const x = mkdtempSync(join(tmpdir(), "slipbox-travel-"));
    mkdirSync(join(x, "..archive"));
    expect([travelTogether(x, join(x, "..archive")), travelTogether(join(x, "..archive"), x)]).toEqual([true, true]);
  });
});

describe("config (0.9)", () => {
  test("[colors]: per-role overrides, for every theme or one; problems are warnings", () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-cfg-"));
    const file = join(dir, "c.toml");
    writeFileSync(
      file,
      [
        "[colors]",
        'tree_guide = "#445566"',
        'pane_title = { fg = "#ffffff", bold = false }',
        "h1 = 33",
        'nope = "#000000"',
        'breadcrumb = "red"',
        '[colors."tokyo-night"]',
        'border = { bg = "#101010", sparkle = true }',
        "[colors.nord]",
        'border = "#222222"',
      ].join("\n"),
    );
    const r = loadConfig({ configFile: file });
    expect(r.warnings.filter((w) => w.includes("colors"))).toEqual([]); // the config itself passes it through
    const tokyo = loadTheme("tokyo-night").theme;
    const { theme, warnings } = applyColorOverrides(tokyo, r.config.colors);
    expect(theme.roles.tree_guide.fg).toBe("#445566");
    expect(theme.roles.pane_title).toMatchObject({ fg: "#ffffff", bold: false });
    expect(theme.roles.border.bg).toBe("#101010"); // this theme's table applies…
    expect(theme.roles.border.fg).toBe(tokyo.roles.border.fg); // …only the fields given
    expect(theme.roles.h1.fg).toBe("ansi:33"); // a terminal palette number
    const w = warnings.join("\n");
    expect(w).toContain('unknown role "nope"');
    expect(w).toContain("breadcrumb: not a colour");
    expect(w).toContain('unknown field "sparkle"');
    // Another theme's table doesn't apply here, but applies there.
    expect(applyColorOverrides(loadTheme("nord").theme, r.config.colors).theme.roles.border.fg).toBe("#222222");
    // NO_COLOR (mono): attributes apply, colours never do.
    const mono = applyColorOverrides(loadTheme("mono").theme, { pane_title: { fg: "#ffffff", bold: false } }).theme;
    expect(mono.roles.pane_title.fg).toBeUndefined();
    expect(mono.roles.pane_title.bold).toBe(false);
  });
  test("[colors.<theme>]: a role's fields from two files merge, as a top-level role's do", () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-cfg-"));
    const user = join(dir, "user.toml");
    writeFileSync(user, '[colors]\nrail = { bg = "#000000" }\n[colors."tokyo-night"]\nrail = { bg = "#000000" }\n');
    const folder = join(dir, "folder.toml");
    writeFileSync(folder, '[colors]\nrail = { fg = "#ffffff" }\n[colors."tokyo-night"]\nrail = { fg = "#ffffff" }\n');
    const { colors } = loadConfig({ configFile: user, vaultFile: folder }).config;
    expect(colors.rail).toEqual({ bg: "#000000", fg: "#ffffff" });
    expect(colors["tokyo-night"]).toEqual({ rail: { bg: "#000000", fg: "#ffffff" } });
  });
  test("no config at all is fine; bad keys are warnings, not crashes", () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-cfg-"));
    const file = join(dir, "c.toml");
    writeFileSync(file, 'theme = "dracula"\nbogus = 1\n[render]\ninset = "wide"\n[keys]\n"g g" = "scroll.top"\n');
    const r = loadConfig({ configFile: file });
    expect(r.config.theme).toBe("dracula");
    expect(r.config.render.inset).toBe(4);
    expect(r.config.keys["g g"]).toBe("scroll.top");
    expect(r.warnings.join("\n")).toContain("bogus");
    expect(r.warnings.join("\n")).toContain("render.inset");
  });
  test("a retired section says why, not \"unknown key\" (21.12)", () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-cfg-"));
    const file = join(dir, "c.toml");
    writeFileSync(file, '[rename]\nprevious_names = true\n');
    const w = loadConfig({ configFile: file }).warnings.join("\n");
    expect(w).toContain('"rename" is retired — renames no longer write a note\'s old name into it');
    expect(w).not.toContain("unknown key");
  });
  test("vault config wins over user config", () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-cfg-"));
    const user = join(dir, "user.toml");
    writeFileSync(user, 'theme = "nord"\n');
    const vault = join(dir, "v");
    require("node:fs").mkdirSync(join(vault, ".slipbox"), { recursive: true });
    writeFileSync(join(vault, ".slipbox", "config.toml"), 'theme = "monokai"\n');
    expect(loadConfig({ configFile: user, vaultRoot: vault }).config.theme).toBe("monokai");
  });
});

describe("themes (2.6)", () => {
  test("every built-in defines every role", () => {
    for (const t of listThemes()) {
      const { theme, warning } = loadTheme(t.name);
      expect(warning).toBeNull();
      for (const r of ROLES) expect(theme.roles[r]).toBeDefined();
    }
  });
  test("the gutter's shade is between the page's and the breadcrumb row's in every colour theme, a quieter frame", () => {
    for (const t of listThemes()) {
      const { theme } = loadTheme(t.name);
      if (theme.name === "terminal" || theme.name === "mono") continue; // sixteen colours, or none
      const [page, gutter, band] = [theme.bg, theme.roles.gutter.bg!, theme.roles.breadcrumb_band.bg!].map(luminance);
      expect([t.name, Math.min(page!, band!) < gutter! && gutter! < Math.max(page!, band!)]).toEqual([t.name, true]);
    }
  });
  test("a code cell's lines a step brighter than the frame's and the rules', dimmer than the text, in every colour theme", () => {
    for (const t of listThemes()) {
      const { theme } = loadTheme(t.name);
      if (theme.name === "terminal" || theme.name === "mono") continue;
      const [frame, cell, text] = [theme.roles.rule.fg!, theme.roles.cell_line.fg!, theme.fg].map(luminance);
      const [lo, hi] = theme.kind === "dark" ? [frame!, text!] : [text!, frame!];
      expect([t.name, lo < cell! && cell! < hi]).toEqual([t.name, true]);
    }
  });
  test("the lens while it's typed into is green: its rules and label, a green tint on its rows", () => {
    const { theme } = loadTheme("tokyo-night");
    expect(theme.roles.lens_edit.fg).toBe("#9ece6a"); // the palette's green
    expect(theme.roles.lens_band_edit.bg).toBe(blend("#9ece6a", "#16161e", 0.07)); // over the page's background
  });
  test("unknown theme falls back to tokyo-night with a warning", () => {
    const r = loadTheme("no-such-theme");
    expect(r.theme.name).toBe("tokyo-night");
    expect(r.warning).toContain("unknown theme");
  });
  test("base16 loader accepts both scheme formats", () => {
    const slots = Array.from({ length: 16 }, (_, i) => `base0${i.toString(16).toUpperCase()}: "${(i * 1111).toString(16).padStart(6, "0")}"`);
    const legacy = parseBase16(`scheme: "Legacy"\n${slots.join("\n")}\n`, "x");
    const modern = parseBase16(`name: "Modern"\npalette:\n  ${slots.join("\n  ")}\n`, "x");
    expect(legacy.name).toBe("Legacy");
    expect(modern.name).toBe("Modern");
    expect(base16ToPalette(modern).blue).toBe(modern.slots.base0D!);
    expect(() => parseBase16("scheme: x\nbase00: '000000'\n", "x")).toThrow();
  });
});

describe("themes (2.6): a user's own files", () => {
  test("a user theme loads, shadowing a built-in of its name; a broken one falls back, saying which file and why", () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-themes-"));
    const slots = Array.from({ length: 16 }, (_, i) => `base0${i.toString(16).toUpperCase()}: "${(i * 1111).toString(16).padStart(6, "0")}"`);
    writeFileSync(join(dir, "terminal.yaml"), `scheme: "Mine"\n${slots.join("\n")}\n`);
    writeFileSync(join(dir, "broken.yml"), "scheme: x\nbase00: '000000'\n");
    const mine = loadTheme("terminal", dir);
    expect(mine.warning).toBeNull();
    expect(mine.theme).toMatchObject({ name: "terminal", source: "user", bg: "#000000" });
    const broken = loadTheme("broken", dir);
    expect(broken.theme.name).toBe("tokyo-night");
    expect(broken.warning).toStartWith(`theme broken: ${join(dir, "broken.yml")}: `);
    expect(listThemes(dir).filter((t) => t.name === "terminal")).toEqual([{ name: "terminal", source: "user", path: join(dir, "terminal.yaml") }]);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("keymap (0.8)", () => {
  test("sequences, prefixes and overrides", () => {
    const k = new Keymap({ "g g": "scroll.top", j: "scroll.down" }, { j: "", "g  t": "tab.next" });
    expect(k.lookup("g g")).toBe("scroll.top");
    expect(k.lookup("j")).toBeUndefined();
    expect(k.isPrefix("g")).toBe(true);
    expect(k.lookup("g t")).toBe("tab.next");
  });
});

describe("glyph sets", () => {
  // Private-use icons get lost when files are edited; an empty glyph draws nothing and shifts
  // whatever follows it. Every glyph must take up room, except the ones that are spacing by design.
  const blankByDesign = new Set(["file", "scrollTrack"]);
  const flatten = (v: unknown, path: string): [string, string][] =>
    typeof v === "string"
      ? [[path, v]]
      : Array.isArray(v)
        ? v.flatMap((x, i) => flatten(x, `${path}[${i}]`))
        : v && typeof v === "object"
          ? Object.entries(v).flatMap(([k, x]) => flatten(x, path ? `${path}.${k}` : k))
          : [];
  for (const mode of ["nerd", "unicode", "ascii"] as const) {
    test(`${mode}: no empty or zero-width glyphs`, () => {
      for (const [path, g] of flatten(glyphsFor(mode), "")) {
        if (path === "mode" || blankByDesign.has(path)) continue;
        expect({ path, width: stringWidth(g) > 0 }).toEqual({ path, width: true });
      }
    });
  }
  test("auto (rendering.md, Glyphs): ASCII for a locale that isn't UTF-8 or the Linux console, Nerd for the terminals that bundle it, else Unicode", () => {
    const auto = (env: NodeJS.ProcessEnv) => glyphsFor("auto", env).mode;
    expect(auto({ LANG: "C", TERM: "xterm-ghostty" })).toBe("ascii"); // a locale set, not UTF-8: whatever the terminal
    expect(auto({ LC_ALL: "en_US.ISO-8859-1", LANG: "en_US.UTF-8" })).toBe("ascii"); // LC_ALL wins over LANG
    expect(auto({ LC_CTYPE: "en_US.UTF-8", LANG: "C" })).toBe("unicode"); // LC_CTYPE before LANG
    expect(auto({ TERM: "linux", LANG: "en_US.UTF-8" })).toBe("ascii");
    for (const term of [{ TERM: "xterm-ghostty" }, { TERM: "xterm-kitty" }, { TERM_PROGRAM: "WezTerm" }]) expect(auto({ LANG: "en_US.utf8", ...term })).toBe("nerd");
    expect(auto({ TERM: "xterm-256color", LANG: "en_US.UTF-8" })).toBe("unicode");
    expect(auto({ TERM: "xterm-256color" })).toBe("unicode"); // no locale at all isn't a non-UTF-8 one
    expect(glyphsFor("unicode", { TERM: "linux" }).mode).toBe("unicode"); // a set named in config is never guessed
  });
});

describe("review round 2 (core)", () => {
  const g = glyphsFor("unicode");
  const text = (l: { lines: { spans: { text: string }[] }[] }) => l.lines.map((x) => x.spans.map((s) => s.text).join("")).join("\n");
  test("footnote labels and frontmatter keys can't smuggle escapes into the layout", () => {
    const fn = renderMarkdown("x[^a\u001bcb]\n\n[^a\u001bcb]: foot\n", { width: 60, glyphs: g, showUrls: false });
    const fm = renderMarkdown('---\na: {"\u001b[31mRED": 1}\n---\n# T\n', { width: 60, glyphs: g, showUrls: false });
    expect(text(fn)).not.toContain("\u001b");
    expect(text(fm)).not.toContain("\u001b");
  });
  test("a header-only table survives a narrow width", () => {
    const l = renderMarkdown("| a | b | c | d |\n|---|---|---|---|\n", { width: 12, glyphs: g, showUrls: false });
    expect(text(l)).toContain("d");
  });
  test("tab stops count display columns", () => {
    expect(expandTabs("日本\tx")).toBe("日本    x");
  });
  test("capture.file must stay inside the project; ranged numbers must be whole", () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-cfg-"));
    for (const [value, needle] of [['""', "capture.file"], ['"../../escape.md"', "capture.file"]] as const) {
      const file = join(dir, "c.toml");
      writeFileSync(file, `[capture]\nfile = ${value}\n`);
      const r = loadConfig({ configFile: file });
      expect(r.config.capture.file).toBe("scratch.md");
      expect(r.warnings.join("\n")).toContain(needle);
    }
    const file = join(dir, "i.toml");
    writeFileSync(file, "[render]\ninset = 2.5\n");
    const r = loadConfig({ configFile: file });
    expect(r.config.render.inset).toBe(4);
    expect(r.warnings.join("\n")).toContain("whole number");
  });
  test("a 256-colour palette entry is mapped to the 16 on a 16-colour terminal", () => {
    const theme = loadTheme("tokyo-night").theme;
    const t = { ...theme, roles: { ...theme.roles, text: { fg: "ansi:200" } } };
    const out = layoutToAnsi(renderMarkdown("hello\n", { width: 20, glyphs: g, showUrls: false }), t, { depth: "16" });
    expect(out).not.toContain("38;5;");
  });
});

describe("review round 3 (core)", () => {
  test("OSC 52 is capped whoever writes it; the fallback carries big copies", () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-clip-"));
    let sent = 0;
    const big = "x".repeat(200_000);
    const r = copyText(big, { osc52: () => ((sent += 1), true), fallbackDir: dir });
    expect(sent).toBe(0);
    expect(r.methods.length).toBeGreaterThan(0);
  });
  test("capture.file can't be hidden or non-Markdown (.git/config, .slipbox/config.toml)", () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-cfg-"));
    for (const bad of [".git/config", ".slipbox/config.toml", "notes.txt"]) {
      const file = join(dir, "c.toml");
      writeFileSync(file, `[capture]\nlocation = "vault"\nfile = "${bad}"\n`);
      expect(loadConfig({ configFile: file }).config.capture.file).toBe("scratch.md");
    }
  });
  test("an unknown modifier keeps the key from binding plain x, and is reported", () => {
    expect(canonKey("hyper+x")).toBe("hyper+x");
    expect(unknownModifiers("hyper+x g g")).toEqual(["hyper"]);
    expect(unknownModifiers("ctrl+w shift+h")).toEqual([]);
    expect(unknownModifiers("ctrl++")).toEqual([]);
  });
});

describe("task toggle (4.11) and note writes (4.6, 7.5)", () => {
  const enc = (t: string) => new TextEncoder().encode(t);
  const dec = (b: Uint8Array) => new TextDecoder("utf-8", { ignoreBOM: true }).decode(b);
  test("flips one byte: [ ] to [x] and back, on the line asked for", () => {
    const src = "# T\n\n- [ ] one\n- [x] two\n";
    const a = toggleTask(enc(src), 3)!;
    expect(a.checked).toBe(true);
    expect(dec(a.bytes)).toBe("# T\n\n- [x] one\n- [x] two\n");
    const b = toggleTask(enc(src), 4)!;
    expect(b.checked).toBe(false);
    expect(dec(b.bytes)).toBe("# T\n\n- [ ] one\n- [ ] two\n");
    expect(toggleTask(enc(src), 1)).toBeNull(); // a heading
    expect(toggleTask(enc(src), 99)).toBeNull();
  });
  test("any bullet, numbers, quotes, indentation, [X]; CRLF, a BOM and bad bytes are kept", () => {
    for (const line of ["* [ ] a", "+ [ ] a", "1. [ ] a", "12) [ ] a", "> - [ ] a", ">  > * [ ] a", "    - [ ] a", "\t- [ ] a"]) {
      expect(toggleTask(enc(line), 1)?.checked).toBe(true);
    }
    expect(toggleTask(enc("- [X] a"), 1)?.checked).toBe(false);
    expect(toggleTask(enc("-[ ] a"), 1)).toBeNull();
    const bom = new Uint8Array([0xef, 0xbb, 0xbf, ...enc("- [ ] a\r\n- [ ] b\r\n"), 0xff]);
    const r = toggleTask(bom, 2)!;
    expect([...r.bytes]).toEqual([0xef, 0xbb, 0xbf, ...enc("- [ ] a\r\n- [x] b\r\n"), 0xff]);
    expect(toggleTask(bom, 1)?.checked).toBe(true); // the BOM isn't part of line 1
  });
  test("a write whose rename fails leaves no temp file behind, and what was there as it was (4.6)", async () => {
    const { atomicWrite } = await import("../src/core/fsutil.ts");
    const { readdirSync } = await import("node:fs");
    const dir = mkdtempSync(join(sandbox, "atomic-"));
    mkdirSync(join(dir, "taken"));
    writeFileSync(join(dir, "taken", "inside.md"), "# Inside\n");
    expect(() => atomicWrite(join(dir, "taken"), "# Note\n")).toThrow();
    expect(readdirSync(dir)).toEqual(["taken"]);
    expect(readFileSync(join(dir, "taken", "inside.md"), "utf8")).toBe("# Inside\n");
    // The same write where it can land: done, no temp file either.
    atomicWrite(join(dir, "note.md"), "# Note\n");
    expect(readdirSync(dir).sort()).toEqual(["note.md", "taken"]);
  });

  test("writeNote keeps the mode, writes through a symlink, and refuses one out of the vault", () => {
    const root = mkdtempSync(join(tmpdir(), "slipbox-write-"));
    const outside = mkdtempSync(join(tmpdir(), "slipbox-out-"));
    try {
      writeFileSync(join(root, "a.md"), "old");
      chmodSync(join(root, "a.md"), 0o600);
      writeNote(root, join(root, "a.md"), "new");
      expect(readFileSync(join(root, "a.md"), "utf8")).toBe("new");
      expect(statSync(join(root, "a.md")).mode & 0o777).toBe(0o600);
      // A link inside the vault: the target changes, the link stays a link.
      mkdirSync(join(root, "real"));
      writeFileSync(join(root, "real", "b.md"), "b");
      symlinkSync(join(root, "real", "b.md"), join(root, "link.md"));
      writeNote(root, join(root, "link.md"), "b2");
      expect(readFileSync(join(root, "real", "b.md"), "utf8")).toBe("b2");
      // A link out of the vault: refused, nothing written.
      writeFileSync(join(outside, "c.md"), "c");
      symlinkSync(join(outside, "c.md"), join(root, "out.md"));
      expect(() => writeNote(root, join(root, "out.md"), "x")).toThrow(WriteRefused);
      expect(readFileSync(join(outside, "c.md"), "utf8")).toBe("c");
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });
});

describe("editor hand-off argv (4.1, 4.2, 4.12)", () => {
  test("[editor] remote: a list of commands, or one string as one command", () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-cfg-"));
    try {
      const one = join(dir, "one.toml");
      writeFileSync(one, '[editor]\nremote = "code -g {file}:{line}"\n');
      expect(loadConfig({ vaultRoot: null, configFile: one }).config.editor.remote).toEqual(["code -g {file}:{line}"]);
      const two = join(dir, "two.toml");
      writeFileSync(two, '[editor]\nremote = ["nvim --server S --remote {file}", "nvim --server S --remote-send <C-\\\\><C-N>:{line}<CR>"]\n');
      const r = loadConfig({ vaultRoot: null, configFile: two });
      expect(r.warnings).toEqual([]);
      expect(r.config.editor.remote).toEqual(["nvim --server S --remote {file}", "nvim --server S --remote-send <C-\\><C-N>:{line}<CR>"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  test("a template is split without a shell; {file} and {line} fill in inside arguments", () => {
    expect(splitCommand(`nvim --server '/tmp/my sock' --remote "+{line}" {file}`)).toEqual(["nvim", "--server", "/tmp/my sock", "--remote", "+{line}", "{file}"]);
    expect(editorArgv("nvim --server /tmp/s --remote +{line} {file}", "/v/a b.md", 12)).toEqual(["nvim", "--server", "/tmp/s", "--remote", "+12", "/v/a b.md"]);
    expect(editorArgv("code -g {file}:{line}", "/v/a.md", 3)).toEqual(["code", "-g", "/v/a.md:3"]);
    // A file name is data, never a command: no shell sees it.
    expect(editorArgv("vi {file}", "/v/$(rm -rf ~).md", 1)).toEqual(["vi", "/v/$(rm -rf ~).md"]);
    expect(editorArgv("myeditor --wait", "/v/a.md", 1)).toEqual(["myeditor", "--wait", "/v/a.md"]); // no {file}: last
  });
  test("no template: $VISUAL, $EDITOR, vi — the line passed the way the editor takes it", () => {
    expect(editorArgv("", "/v/a.md", 7, { VISUAL: "nvim", EDITOR: "nano" })).toEqual(["nvim", "+7", "/v/a.md"]);
    expect(editorArgv("", "/v/a.md", 7, { EDITOR: "/usr/bin/hx" })).toEqual(["/usr/bin/hx", "/v/a.md:7"]);
    expect(editorArgv("", "/v/a.md", 7, { EDITOR: "code --wait" })).toEqual(["code", "--wait", "/v/a.md"]);
    expect(editorArgv("", "/v/a.md", 7, {})).toEqual(["vi", "+7", "/v/a.md"]);
  });
});

describe("finding running nvims (4.12)", () => {
  test("sockets named nvim.* only, then only the ones that answer", async () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-nv-"));
    const net = await import("node:net");
    const listen = (p: string) => new Promise<import("node:net").Server>((res) => {
      const srv = net.createServer();
      srv.listen(p, () => res(srv));
    });
    const a = await listen(join(dir, "nvim.123.0"));
    const b = await listen(join(dir, "nvim.wt-abc.sock"));
    const c = await listen(join(dir, "other.sock"));
    writeFileSync(join(dir, "nvim.notasocket"), "");
    try {
      expect(nvimSockets([dir, join(dir, "missing")])).toEqual([join(dir, "nvim.123.0"), join(dir, "nvim.wt-abc.sock")]);
      const found = discoverNvims({ dirs: [dir], probe: (s) => (s.endsWith(".sock") ? { socket: s, cwd: "/w", file: "" } : null) });
      expect(found.map((f) => f.socket)).toEqual([join(dir, "nvim.wt-abc.sock")]);
    } finally {
      for (const srv of [a, b, c]) srv.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("clipboard (8.5): OSC 52, the system's tools, then the file", () => {
  /**
   * Fake clipboard tools on a PATH of their own — never the real ones — with the display variables
   * that pick them and SLIPBOX_CLIPBOARD as given (unset when not). A tool copying writes `board`
   * beside it, a tool pasting prints it; each says in `ran` that it ran, with its arguments.
   */
  const withTools = async (tools: Record<string, "copy" | "paste" | "fail" | "both">, env: { WAYLAND_DISPLAY?: string; DISPLAY?: string; SLIPBOX_CLIPBOARD?: string }, fn: (dir: string) => void | Promise<void>) => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-cliptools-"));
    const body = { copy: '/bin/cat > "${0%/*}/board"', paste: '/bin/cat "${0%/*}/board"', fail: "exit 1", both: 'case "$*" in *-o*) /bin/cat "${0%/*}/board" ;; *) /bin/cat > "${0%/*}/board" ;; esac' };
    for (const [name, kind] of Object.entries(tools)) {
      writeFileSync(join(dir, name), `#!/bin/sh\necho "\${0##*/} $*" >> "\${0%/*}/ran"\n${body[kind]}\n`);
      chmodSync(join(dir, name), 0o755);
    }
    const keys = ["PATH", "WAYLAND_DISPLAY", "DISPLAY", "SLIPBOX_CLIPBOARD"] as const;
    const was = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
    const set = (k: string, v: string | undefined) => (v === undefined ? delete process.env[k] : (process.env[k] = v));
    process.env.PATH = dir;
    for (const k of keys.slice(1)) set(k, env[k as keyof typeof env]);
    try {
      await fn(dir);
    } finally {
      for (const k of keys) set(k, was[k]);
      rmSync(dir, { recursive: true, force: true });
    }
  };
  const ran = (dir: string) => (existsSync(join(dir, "ran")) ? readFileSync(join(dir, "ran"), "utf8").trim().split("\n") : []);

  test("a copy goes by OSC 52 and the first tool that takes it, confirmed; a paste reads it back the same way", async () => {
    const { copyText, readClipboard } = await import("../src/core/clipboard.ts");
    const out = mkdtempSync(join(tmpdir(), "slipbox-clip-"));
    // X11: xclip fails, xsel takes it.
    await withTools({ xclip: "fail", xsel: "both" }, { DISPLAY: ":0" }, (dir) => {
      const r = copyText("héllo\n", { osc52: () => true, fallbackDir: out });
      expect(r).toEqual({ methods: ["osc52", "xsel"], file: null, confirmed: true });
      expect(readFileSync(join(dir, "board"), "utf8")).toBe("héllo\n");
      expect(existsSync(join(out, "clipboard.txt"))).toBe(false); // no file when something took it
      expect(readClipboard(out)).toBe("héllo\n");
      expect(ran(dir)).toEqual(["xclip -selection clipboard", "xsel --clipboard --input", "xclip -selection clipboard -o", "xsel --clipboard --output"]);
    });
    // Wayland first, when both are there: wl-copy takes it and xsel never runs.
    await withTools({ "wl-copy": "copy", "wl-paste": "paste", xsel: "both" }, { WAYLAND_DISPLAY: "wayland-0", DISPLAY: ":0" }, (dir) => {
      expect(copyText("w", { osc52: () => false, fallbackDir: out })).toEqual({ methods: ["wl-copy"], file: null, confirmed: true });
      expect(readClipboard(out)).toBe("w");
      expect(ran(dir)).toEqual(["wl-copy ", "wl-paste --no-newline"]);
    });
    rmSync(out, { recursive: true, force: true });
  });

  test("no tool answers (over SSH): OSC 52 alone, unconfirmed; without it the file; a paste finds nothing", async () => {
    const { copyText, readClipboard } = await import("../src/core/clipboard.ts");
    const out = mkdtempSync(join(tmpdir(), "slipbox-clip-"));
    // A display, but none of its tools installed; then no display at all, a tool there unasked.
    for (const [tools, env] of [[{}, { DISPLAY: ":0", WAYLAND_DISPLAY: "w" }], [{ xclip: "both" as const }, {}]] as const) {
      await withTools(tools, env, (dir) => {
        expect(copyText("over ssh", { osc52: () => true, fallbackDir: out })).toEqual({ methods: ["osc52"], file: null, confirmed: false });
        expect(existsSync(join(out, "clipboard.txt"))).toBe(false);
        expect(copyText("no terminal", { osc52: () => false, fallbackDir: out })).toEqual({ methods: ["file"], file: join(out, "clipboard.txt"), confirmed: false });
        expect(readFileSync(join(out, "clipboard.txt"), "utf8")).toBe("no terminal");
        expect(readClipboard(out)).toBeNull(); // the fallback file isn't the clipboard
        expect(ran(dir)).toEqual([]);
      });
      rmSync(join(out, "clipboard.txt"), { force: true });
    }
    rmSync(out, { recursive: true, force: true });
  });

  test("SLIPBOX_CLIPBOARD=file: never the terminal's or the system's clipboard, only the file, read back", async () => {
    const { copyText, readClipboard } = await import("../src/core/clipboard.ts");
    const out = mkdtempSync(join(tmpdir(), "slipbox-clip-"));
    await withTools({ xclip: "both", "wl-copy": "copy", "wl-paste": "paste" }, { DISPLAY: ":0", WAYLAND_DISPLAY: "w", SLIPBOX_CLIPBOARD: "file" }, (dir) => {
      expect(readClipboard(out)).toBeNull(); // nothing copied yet
      expect(copyText("only here", { fallbackDir: out })).toEqual({ methods: ["file"], file: join(out, "clipboard.txt"), confirmed: false });
      expect(readClipboard(out)).toBe("only here");
      expect(ran(dir)).toEqual([]);
    });
    rmSync(out, { recursive: true, force: true });
  });

  test("the OSC 52 sequence: the text in base64, capped where terminals choke — the cap's own size still sent", async () => {
    const { copyText, osc52Sequence, osc52ToTty, OSC52_MAX_BASE64 } = await import("../src/core/clipboard.ts");
    expect(osc52Sequence("hé")).toBe(`\x1b]52;c;${Buffer.from("hé").toString("base64")}\x07`);
    const atCap = "x".repeat((OSC52_MAX_BASE64 / 4) * 3); // exactly the cap in base64
    expect(osc52Sequence(atCap)).not.toBeNull();
    expect(osc52Sequence(`${atCap}x`)).toBeNull();
    expect(osc52ToTty(`${atCap}x`)).toBe(false); // too big: the terminal is never written
    const out = mkdtempSync(join(tmpdir(), "slipbox-clip-"));
    const sent: number[] = [];
    copyText(atCap, { osc52: (t) => (sent.push(t.length), true), fallbackDir: out });
    expect(sent).toEqual([atCap.length]);
    rmSync(out, { recursive: true, force: true });
  });
});

describe("finding running nvims (4.12): where, and what each says", () => {
  test("the sockets' folders: $XDG_RUNTIME_DIR, then each of nvim's own under $TMPDIR/nvim.$USER", async () => {
    const { nvimSocketDirs } = await import("../src/core/nvim.ts");
    const { userInfo } = await import("node:os");
    const tmp = mkdtempSync(join(tmpdir(), "slipbox-nvdirs-"));
    const base = join(tmp, `nvim.${userInfo().username}`);
    mkdirSync(join(base, "a1"), { recursive: true });
    mkdirSync(join(base, "b2"));
    const dirs = nvimSocketDirs({ XDG_RUNTIME_DIR: "/run/user/7", TMPDIR: tmp });
    expect(dirs[0]).toBe("/run/user/7");
    expect(dirs.slice(1).sort()).toEqual([join(base, "a1"), join(base, "b2")]);
    expect(nvimSocketDirs({ TMPDIR: join(tmp, "none") })).toEqual([]); // no runtime dir, no nvim folder
    rmSync(tmp, { recursive: true, force: true });
  });

  test("each socket asked its cwd and file; one that fails, says nothing, or hangs is left out", async () => {
    const { probeNvim } = await import("../src/core/nvim.ts");
    // A fake nvim on a PATH of its own: the user's nvims are never asked.
    const bin = mkdtempSync(join(tmpdir(), "slipbox-fakenvim-"));
    writeFileSync(
      join(bin, "nvim"),
      `#!/bin/sh\nprintf '%s\\n' "$@" > "\${0%/*}/args"\ncase "$2" in\n  *live*) printf '/work dir\\n/work dir/a.md\\n' ;;\n  *empty*) printf '\\n' ;;\n  *nofile*) printf '/w\\n\\n' ;;\n  *slow*) exec /bin/sleep 5 ;;\n  *) echo 'E247: Failed to connect'; exit 1 ;;\nesac\n`,
    );
    chmodSync(join(bin, "nvim"), 0o755);
    const was = process.env.PATH;
    process.env.PATH = bin;
    try {
      expect(probeNvim("/s/live")).toEqual({ socket: "/s/live", cwd: "/work dir", file: "/work dir/a.md" });
      expect(readFileSync(join(bin, "args"), "utf8").split("\n").slice(0, 3)).toEqual(["--server", "/s/live", "--remote-expr"]);
      expect(probeNvim("/s/nofile")).toEqual({ socket: "/s/nofile", cwd: "/w", file: "" });
      expect(probeNvim("/s/stale")).toBeNull(); // nothing listening: nvim fails, whatever it printed
      expect(probeNvim("/s/empty")).toBeNull();
      const t = Date.now();
      expect(probeNvim("/s/slow", 300)).toBeNull();
      expect(Date.now() - t).toBeLessThan(3000);
    } finally {
      process.env.PATH = was;
      rmSync(bin, { recursive: true, force: true });
    }
  });
});

describe("source layout (4.13)", () => {
  const text = (l: { spans: { text: string }[] }) => l.spans.map((s) => s.text).join("");
  test("a row per source line; tabs, wide characters and controls map back to exact offsets", () => {
    const L = layoutSource("a\tb\n漢x\n\x1b[31mred\r\nend\n", { width: 80, wrap: true, headings: [] });
    expect(L.lines.map((l) => l.src)).toEqual([1, 2, 3, 4]);
    expect(text(L.lines[0]!)).toBe("a   b"); // the tab to the next stop
    expect(L.lines[0]!.srcMap!.cells).toEqual([0, 1, 1, 1, 2]); // every tab cell maps to the tab
    expect(L.lines[1]!.srcMap).toEqual({ cells: [0, 1], end: 2 }); // one cell, two columns wide
    expect(text(L.lines[2]!)).toBe("�[31mred"); // never a raw escape; no CR shown
    expect(L.lines[2]!.srcMap!.end).toBe(8);
  });
  test("wrapping at the last space; each row knows where the next begins", () => {
    const L = layoutSource("one two three four\n", { width: 9, wrap: true, headings: [] });
    expect(L.lines.map(text)).toEqual(["one two ", "three ", "four"]);
    expect(L.lines.map((l) => l.srcMap!.end)).toEqual([8, 14, 18]);
    expect(L.lines.every((l) => l.src === 1)).toBe(true);
    const nowrap = layoutSource("one two three four\n", { width: 9, wrap: false, headings: [] });
    expect(nowrap.lines.length).toBe(1);
    expect(nowrap.width).toBe(19);
  });
  test("light highlighting, and headings placed on their rows", () => {
    const src = "---\ntitle: x\n---\n# Head\n\n- [ ] task `code` [link](l.md)\n```ts\nconst a = 1;\n```\n";
    const L = layoutSource(src, { width: 80, wrap: true, headings: [{ level: 1, text: "Head", slug: "head", src: 4 }] });
    const roleAt = (row: number, col: number) => {
      let x = 0;
      for (const s of L.lines[row]!.spans) {
        if (col < x + s.text.length) return s.role;
        x += s.text.length;
      }
      return null;
    };
    expect(roleAt(1, 0)).toBe("fm_key");
    expect(roleAt(3, 0)).toBe("h1");
    expect(roleAt(5, 0)).toBe("list_marker");
    expect(roleAt(5, 2)).toBe("check_todo");
    expect(roleAt(5, 13)).toBe("code_inline");
    expect(roleAt(5, 20)).toBe("link");
    expect(roleAt(6, 0)).toBe("code_label");
    expect(roleAt(7, 0)).toBe("code_block");
    expect(L.headings).toEqual([{ level: 1, text: "Head", slug: "head", src: 4, line: 3 }]);
    expect(L.lines[3]!.heading).toBe(0);
  });
});

describe("diff and three-way merge (5.5)", () => {
  const base = "one\ntwo\nthree\nfour\nfive\n";
  test("diffLines: the smallest set of replaced runs", () => {
    expect(diffLines(["a", "b", "c"], ["a", "x", "c", "d"])).toEqual([
      { aStart: 1, aLen: 1, bStart: 1, bLen: 1 },
      { aStart: 3, aLen: 0, bStart: 3, bLen: 1 },
    ]);
    const big = Array.from({ length: 20000 }, (_, i) => `line ${i}`);
    const changed = [...big];
    changed[100] = "x";
    changed.splice(19000, 1);
    const t = performance.now();
    expect(diffLines(big, changed).length).toBe(2);
    expect(performance.now() - t).toBeLessThan(200);
  });
  test("merge3: one side's changes taken, the same change once, overlapping ones marked", () => {
    expect(merge3(base, "ONE\ntwo\nthree\nfour\nfive\n", "one\ntwo\nthree\nfour\nFIVE\n")).toEqual({ text: "ONE\ntwo\nthree\nfour\nFIVE\n", conflicts: 0 });
    expect(merge3(base, "one\ntwo\nadded\nthree\nfour\nfive\n", "one\ntwo\nthree\nfour\nfive\nend\n").text).toBe("one\ntwo\nadded\nthree\nfour\nfive\nend\n");
    expect(merge3(base, "one\nsame\nthree\nfour\nfive\n", "one\nsame\nthree\nfour\nfive\n").conflicts).toBe(0);
    expect(merge3(base, "one\nTWO\nthree\nfour\nfive\n", "one\ntwo-t\nthree\nfour\nfive\n")).toEqual({
      text: "one\n<<<<<<< yours\nTWO\n=======\ntwo-t\n>>>>>>> theirs\nthree\nfour\nfive\n",
      conflicts: 1,
    });
    // Both inserting at the same place differently: a conflict too.
    expect(merge3(base, "one\ntwo\nA\nthree\nfour\nfive\n", "one\ntwo\nB\nthree\nfour\nfive\n").conflicts).toBe(1);
  });
  test("unifiedDiff: - and + lines with context and @@ markers", () => {
    expect(unifiedDiff(base, "one\nTWO\nthree\nfour\nfive\n")).toEqual(["@@ line 2", "  one", "- two", "+ TWO", "  three", "  four"]);
  });
});

describe("find and replace (core/replace.ts)", () => {
  const re = (q: string, o: Partial<{ regex: boolean; whole: boolean; ignoreCase: boolean }> = {}) => {
    const r = compilePattern(q, { regex: false, whole: false, ...o });
    if (typeof r === "string") throw new Error(r);
    return r;
  };
  test("plain by default, smart case, whole words, regex, and a bad regex says why", () => {
    const text = "a.b axb A.B foo_a.b";
    expect(findAll(text, re("a.b")).map((m) => m.from)).toEqual([0, 8, 16]);
    expect(findAll(text, re("A.B")).map((m) => m.from)).toEqual([8]);
    expect(findAll(text, re("A.B", { ignoreCase: true })).length).toBe(3);
    expect(findAll(text, re("a.b", { regex: true })).length).toBe(4);
    expect(findAll(text, re("a.b", { whole: true })).map((m) => m.from)).toEqual([0, 8]);
    expect(typeof compilePattern("(", { regex: true, whole: false })).toBe("string");
  });
  test("findAll keeps within its range and skips empty matches", () => {
    expect(findAll("aaa", re("x*", { regex: true }))).toEqual([]);
    expect(findAll("cat cat cat", re("cat"), 1, 11).map((m) => m.from)).toEqual([4, 8]);
    expect(findAll("cat cat cat", re("cat"), 0, 6).map((m) => m.from)).toEqual([0]);
  });
  test("replacements: literal unless regex; $& $1 $$ with it", () => {
    const [m] = findAll("key=value", re("(\\w+)=(\\w+)", { regex: true }));
    expect(expandReplacement("$2=$1 ($&) $$", m!, true)).toBe("value=key (key=value) $");
    expect(expandReplacement("$2", m!, false)).toBe("$2");
    const ms = findAll("a b a", re("a"));
    expect(replaceMatches("a b a", ms, "xy", false)).toEqual({ text: "xy b xy", count: 2 });
  });
  test("vim's substitute: ranges, delimiters, flags, \\1 and & in the replacement", () => {
    expect(parseSubstitute("s/old/new/")).toEqual({ range: "line", pattern: "old", replacement: "new", global: false, ignoreCase: false, confirm: false });
    expect(parseSubstitute("%s/a/b/gic")).toMatchObject({ range: "all", global: true, ignoreCase: true, confirm: true });
    expect(parseSubstitute("'<,'>s/a/b")).toMatchObject({ range: "selection", replacement: "b" });
    expect(parseSubstitute("s#a/b#c#")).toMatchObject({ pattern: "a/b", replacement: "c" });
    expect(parseSubstitute("s/a\\/b/c/")).toMatchObject({ pattern: "a/b" });
    expect(parseSubstitute("s/(\\w+) (\\w+)/\\2 \\1 & \\& $5/")!.replacement).toBe("$2 $1 $& & $$5");
    expect(parseSubstitute("s/a/b/x")).toBeNull(); // not a flag
    expect(parseSubstitute("sort")).toBeNull();
    expect(parseSubstitute("s//b/")).toBeNull();
  });
});

describe("find and replace: character classes in a regex", () => {
  const re = (q: string) => {
    const r = compilePattern(q, { regex: true, whole: false });
    if (typeof r === "string") throw new Error(r);
    return r;
  };
  test("^ and $ inside a class are characters, not line anchors; outside one, a line's start and end", () => {
    const text = "a$b^c\r\nx$y\n";
    expect(findAll(text, re("[$^]")).map((m) => m.groups[0])).toEqual(["$", "^", "$"]);
    expect(findAll(text, re("[^$^\\r\\n]+")).map((m) => m.groups[0])).toEqual(["a", "b", "c", "x", "y"]);
    expect(findAll(text, re("[\\]$]")).map((m) => m.from)).toEqual([1, 8]); // an escaped ] doesn't end the class
    expect(findAll(text, re("c$")).map((m) => m.from)).toEqual([4]); // before the CRLF
    expect(findAll(text, re("[cy]$")).map((m) => m.from)).toEqual([4, 9]);
    // After a class, $ is the note's line end again: never before a lone \r, as a bare multiline $ would be.
    expect(findAll("p\rq\n", re("[p]$"))).toEqual([]);
    expect(findAll("p\rq\n", re("[q]$")).map((m) => m.from)).toEqual([2]);
    expect(findAll(text, re("^x")).map((m) => m.from)).toEqual([7]);
    expect(findAll(text, re("\\$")).map((m) => m.from)).toEqual([1, 8]);
  });
});

describe("lazy loading (16.6)", () => {
  test("asked before it's ready: null, loaded once; then the value, and whoever listens hears it", async () => {
    const { lazy, load, loadError, onLoaded } = await import("../src/core/lazy.ts");
    const name = "test:lazy-ready";
    const heard: string[] = [];
    const off = onLoaded((n) => n.startsWith("test:") && heard.push(n));
    let calls = 0;
    const loader = async () => {
      calls++;
      await Bun.sleep(10);
      return { answer: 42 };
    };
    expect(lazy(name, loader)).toBeNull();
    expect(lazy(name, loader)).toBeNull(); // still loading: not started again
    const waited = await load(name, loader); // the CLI waits for the same load
    expect(waited).toEqual({ answer: 42 });
    expect(lazy(name, loader)).toBe(waited!);
    expect(await load(name, loader)).toBe(waited!);
    expect(calls).toBe(1);
    expect(heard).toEqual([name]);
    expect(loadError(name)).toBeNull();
    off();
  });

  test("a load that fails: null, and why; never tried again; a listener removed hears no more", async () => {
    const { lazy, load, loadError, onLoaded } = await import("../src/core/lazy.ts");
    const heard: string[] = [];
    const off = onLoaded((n) => n.startsWith("test:") && heard.push(n));
    let calls = 0;
    const loader = async (): Promise<number> => {
      calls++;
      throw new Error("no such grammar");
    };
    expect(await load("test:lazy-fails", loader)).toBeNull();
    expect(loadError("test:lazy-fails")).toBe("no such grammar");
    expect(lazy("test:lazy-fails", loader)).toBeNull();
    expect(await load("test:lazy-fails", loader)).toBeNull();
    expect(calls).toBe(1);
    expect(heard).toEqual(["test:lazy-fails"]);
    off();
    await load("test:lazy-after", async () => 1);
    expect(heard).toEqual(["test:lazy-fails"]);
    expect(loadError("test:never-asked")).toBeNull();
  });
});

describe("advisory staleness (9.9)", () => {
  test("an empty list removes this process's file; another user's process (EPERM) counts as alive", async () => {
    const { readStale, writeDirty } = await import("../src/core/stale.ts");
    const v = { key: `stale-${process.pid}` };
    writeDirty(v, ["a.md", "b.md"]);
    expect(readStale(v)).toEqual([
      { path: "a.md", pid: process.pid },
      { path: "b.md", pid: process.pid },
    ]);
    writeDirty(v, []);
    expect(readStale(v)).toEqual([]);
    const { stateDir } = await import("../src/core/paths.ts");
    expect(existsSync(join(stateDir(v), "dirty", `${process.pid}.json`))).toBe(false);
    writeDirty(v, []); // nothing to remove: no error
    if (process.getuid?.() !== 0) {
      writeDirty(v, ["root.md"], 1); // pid 1 isn't this user's to signal: alive, as far as anyone can tell
      expect(readStale(v)).toEqual([{ path: "root.md", pid: 1 }]);
      writeDirty(v, [], 1);
    }
  });
});

describe("links to a repository's own hosting: the edges", () => {
  test("a path that isn't valid percent-encoding is kept as written; a README any case, a file only", async () => {
    const { inRepo, parseHosted, readmeAt } = await import("../src/core/hosting.ts");
    expect(parseHosted("https://github.com/me/repo/blob/main/100%-done.md")).toMatchObject({ path: "100%-done.md", ref: "main" });
    expect(parseHosted("https://github.com/me/repo/blob/main/a.md#50%")).toMatchObject({ path: "a.md", fragment: "50%" });
    const top = mkdtempSync(join(tmpdir(), "slipbox-hosting-"));
    expect(readmeAt(top)).toBeNull();
    mkdirSync(join(top, "README.md")); // a folder of that name isn't it
    expect(readmeAt(top)).toBeNull();
    writeFileSync(join(top, "ReadMe.markdown"), "# hi\n");
    expect(readmeAt(top)).toBe("ReadMe.markdown");
    expect(readmeAt(join(top, "missing"))).toBeNull();
    expect(inRepo(top, "ReadMe.markdown")).toBe(true);
    expect(inRepo(top, "docs/x.md")).toBe(false);
    rmSync(top, { recursive: true, force: true });
  });
});

describe("review cycle 1 (core)", () => {
  const tmp = (name: string) => mkdtempSync(join(tmpdir(), `slipbox-${name}-`));
  test("a vault's committed config never chooses a program to run: editor.command, editor.remote", () => {
    const dir = tmp("trust");
    const user = join(dir, "user.toml");
    writeFileSync(user, '[editor]\ncommand = "nvim {file}"\n');
    mkdirSync(join(dir, "v", ".slipbox"), { recursive: true });
    writeFileSync(join(dir, "v", ".slipbox", "config.toml"), '[editor]\ncommand = "evil {file}"\nremote = ["evil {file}"]\nautosave_ms = 5000\n');
    const r = loadConfig({ configFile: user, vaultRoot: join(dir, "v") });
    expect(r.config.editor.command).toBe("nvim {file}");
    expect(r.config.editor.remote).toEqual(["nvim"]);
    expect(r.config.editor.autosave_ms).toBe(5000); // the rest of [editor] still applies
    expect(r.warnings.filter((w) => w.includes("only your own config")).length).toBe(2);
  });
  test("writeNote: a new file through a symlinked folder is refused; a vault reached by a symlink is fine", () => {
    const root = tmp("wroot");
    const outside = tmp("wout");
    symlinkSync(outside, join(root, "out"));
    expect(() => writeNote(root, join(root, "out", "new.md"), "x")).toThrow(WriteRefused);
    expect(existsSync(join(outside, "new.md"))).toBe(false);
    const via = join(tmp("wvia"), "link");
    symlinkSync(root, via);
    writeNote(via, join(via, "brand-new.md"), "ok");
    expect(readFileSync(join(root, "brand-new.md"), "utf8")).toBe("ok");
    writeNote(root, join(root, "..notes.md"), "dots"); // a name starting with dots is inside
    expect(existsSync(join(root, "..notes.md"))).toBe(true);
  });
  test("the scratch in the vault refuses a symlink: it lives in the state dir then", () => {
    const root = tmp("scr");
    writeFileSync(join(root, "secret.txt"), "SECRET");
    symlinkSync(join(root, "secret.txt"), join(root, "scratch.md"));
    const cfg = structuredClone(loadConfig({ vaultRoot: null }).config);
    cfg.capture.location = "vault";
    const owner = { root, key: "scr", mode: "vault" };
    expect(scratchLocation(owner, cfg).path).not.toBe(join(root, "scratch.md"));
    rmSync(join(root, "scratch.md"));
    expect(scratchLocation(owner, cfg).path).toBe(join(root, "scratch.md"));
    // A plain folder's is always in its state: nothing is written into one (20.22).
    expect(scratchLocation({ ...owner, mode: "folder" }, cfg).path).not.toBe(join(root, "scratch.md"));
  });
  test("regex ^ and $ are a line's; $ in CRLF ends before the \\r; empty matches only when asked", () => {
    const re = (q: string) => compilePattern(q, { regex: true, whole: false }) as RegExp;
    expect(findAll("# a\n# b\n", re("^# ")).length).toBe(2);
    expect(findAll("ab\r\ncb\r\n", re("b$")).map((m) => m.from)).toEqual([1, 5]);
    expect(findAll("a\nb\n", re("^"))).toEqual([]); // a search skips empty matches
    expect(findAll("a\nb\n", re("^"), 0, 4, true).map((m) => m.from)).toEqual([0, 2]); // not the line after the last
    expect(findAll("a\nb", re("$"), 0, 3, true).map((m) => m.from)).toEqual([1, 3]); // an unterminated last line
    expect(findAll("a\nb\n", re("^"), 0, 2, true).map((m) => m.from)).toEqual([0]); // the next line's start isn't in range
    const ms = findAll("a a\nb a a\n", re("a"));
    expect(firstPerLine("a a\nb a a\n", ms).map((m) => m.from)).toEqual([0, 6]);
  });
  test("merge conflict markers in a CRLF note are CRLF", () => {
    const r = merge3("a\r\nb\r\n", "A\r\nb\r\n", "Z\r\nb\r\n");
    expect(r.conflicts).toBe(1);
    expect(r.text.replace(/\r\n/g, "")).not.toContain("\n");
  });
  test("listTasks: from the parsed note, so a code block's - [ ] isn't a task", () => {
    const tasks = listTasks(parseMarkdown("- [ ] one\n- [x] two\n\n```\n- [ ] not a task\n```\n").tree);
    expect(tasks).toEqual([
      { line: 1, checked: false, text: "one" },
      { line: 2, checked: true, text: "two" },
    ]);
  });
  test("CJK wrapping: no row starts with closing punctuation; no space from a soft break between CJK", () => {
    const text = (md: string, width: number) => renderMarkdown(md, { width, glyphs: glyphsFor("unicode"), showUrls: false }).lines.map((l) => l.spans.map((x) => x.text).join(""));
    for (let w = 8; w <= 30; w++) {
      for (const row of text("今夜は晴れ、シーイングは良好でした。（観測）は続く。", w)) expect(row.trimStart()).not.toMatch(/^[、。）]/);
    }
    expect(text("今夜は\n晴れ", 40)[0]).toBe("今夜は晴れ");
    expect(text("tonight\nclear", 40)[0]).toBe("tonight clear");
  });
  test("frontmatter: a parse error wraps whole; a long key is cut with an ellipsis; no row is clipped", () => {
    const render = (md: string, width: number) => renderMarkdown(md, { width, glyphs: glyphsFor("unicode"), showUrls: false });
    const broken = render("---\ntitle: [unclosed\ntags: [a, b\n---\n\nbody\n", 30);
    const all = broken.lines.map((l) => l.spans.map((x) => x.text).join("").trim()).join(" ");
    expect(all.replace(/\s+/g, " ")).toMatch(/sufficiently indented/);
    expect(broken.clipped).toBe(0);
    const keyed = render("---\nobserving_programme_coordinator_contact: Ada\n---\n", 40);
    expect(keyed.lines.some((l) => l.spans.map((x) => x.text).join("").includes("…"))).toBe(true);
  });
});

describe("review cycle 2 (core)", () => {
  test("hostile notes stay fast and never throw: deep nesting, long runs, huge frontmatter", () => {
    const g = glyphsFor("unicode");
    const cases = [
      "> - ".repeat(5000) + "x\n",
      "*".repeat(8000) + "x" + "*".repeat(8000),
      "[".repeat(20000) + "x",
      `---\n${Array.from({ length: 20000 }, (_, i) => `k${i}: v`).join("\n")}\n---\nbody\n`,
    ];
    for (const md of cases) {
      const t = performance.now();
      const l = renderMarkdown(md, { width: 80, glyphs: g, showUrls: false });
      expect(l.lines.length).toBeGreaterThan(0);
      expect(performance.now() - t).toBeLessThan(2000);
    }
    // Taming moves no offset: a heading after a long run keeps its source line.
    const tamed = parseMarkdown(`${"*".repeat(100)}\n\n# After\n`);
    expect(tamed.tree.children.find((n) => n.type === "heading")?.position?.start.line).toBe(3);
  });
  test("editor templates fill {file} {line} {server} in one pass: a path with braces stays itself", () => {
    expect(editorArgv("nvim --server {server} --remote {file}", "/v/{line}-{server}.md", 7, {}, false, "/run/n.sock")).toEqual(["nvim", "--server", "/run/n.sock", "--remote", "/v/{line}-{server}.md"]);
  });
});

describe("review cycle 3 (config)", () => {
  const write = (text: string) => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-c3-"));
    const f = join(dir, "c.toml");
    writeFileSync(f, text);
    return { dir, f };
  };
  test("a file that fails to parse keeps its last good contents (a typo saved mid-edit)", () => {
    const { f } = write('theme = "nord"\n');
    const lastGood = new Map<string, Record<string, unknown>>();
    expect(loadConfig({ configFile: f, lastGood }).config.theme).toBe("nord");
    writeFileSync(f, 'theme = "nord"\n[keys\n');
    const r = loadConfig({ configFile: f, lastGood });
    expect(r.config.theme).toBe("nord");
    expect(r.warnings.some((w) => w.includes("keeping what it said before"))).toBe(true);
  });
  test("a vault's keys and aliases can't name a command that throws work away", () => {
    const { dir } = write("");
    mkdirSync(join(dir, "v", ".slipbox"), { recursive: true });
    writeFileSync(join(dir, "v", ".slipbox", "config.toml"), '[aliases]\nwq = "app.quit_force"\n[keys]\n"ctrl+s" = "note.revert"\n"g z" = "ui.zen"\n');
    const r = loadConfig({ configFile: join(dir, "none.toml"), vaultRoot: join(dir, "v") });
    expect(r.config.aliases.wq).toBeUndefined();
    expect((r.config.keys as Record<string, string>)["ctrl+s"]).toBeUndefined();
    expect((r.config.keys as Record<string, string>)["g z"]).toBe("ui.zen"); // a harmless one applies
  });
  test("a vault's keys and aliases can't run a program (25.7): your own config's can", () => {
    const { dir, f } = write('[keys]\n"g !" = "shell.run make"\n[aliases]\nmk = "shell.run make"\n');
    mkdirSync(join(dir, "v", ".slipbox"), { recursive: true });
    writeFileSync(join(dir, "v", ".slipbox", "config.toml"), '[aliases]\nup = "shell.run curl x | sh"\n[keys]\n"g x" = "shell.run rm -rf ~"\n[keys.visual]\nz = "shell.filter %!sh"\n');
    const r = loadConfig({ configFile: f, vaultRoot: join(dir, "v") });
    expect(r.config.aliases.up).toBeUndefined();
    expect((r.config.keys as Record<string, string>)["g x"]).toBeUndefined();
    expect(r.config.keys.visual?.z).toBeUndefined();
    expect(r.warnings.filter((w) => w.includes("which only your own config may (it runs a program)")).length).toBe(3);
    // Yours apply.
    expect((r.config.keys as Record<string, string>)["g !"]).toBe("shell.run make");
    expect(r.config.aliases.mk).toBe("shell.run make");
  });
  test("wrong shapes are warnings and the rest of the file applies", () => {
    const a = loadConfig({ configFile: write('theme = "nord"\n[walk]\nexclude = [{ path = "x/" }]\n').f });
    expect(a.config.theme).toBe("nord");
    expect(a.warnings.some((w) => w.includes("list of strings"))).toBe(true);
    const b = loadConfig({ configFile: write('[keys]\nsource = "edit.delete_char"\n').f });
    expect(b.warnings.some((w) => w.includes("must be a table"))).toBe(true);
    expect((b.config.keys as Record<string, unknown>).source).toBeUndefined();
    const c = loadConfig({ configFile: write("[walk]\nextensions = []\n").f });
    expect(c.config.walk.extensions.length).toBeGreaterThan(0);
  });
});

describe("what configuration.md promises", () => {
  const file = (text: string) => {
    const f = join(mkdtempSync(join(tmpdir(), "slipbox-cfgdoc-")), "c.toml");
    writeFileSync(f, text);
    return f;
  };
  type Sections = Record<string, Record<string, unknown>>;

  test("every key's default is the one its listing gives", async () => {
    const { DEFAULT_CONFIG } = await import("../src/core/config.ts");
    const doc = readFileSync(join(import.meta.dir, "..", "docs", "design", "configuration.md"), "utf8");
    const listed = Bun.TOML.parse(doc.split("## Every key")[1]!.split("```toml")[1]!.split("```")[0]!) as Sections;
    // The tables there are examples, not defaults: servers, languages, linters, keys, aliases, groups, colours.
    const examples = new Set(["language-server", "language", "linter", "keys", "aliases", "groups", "colors"]);
    const defaults = DEFAULT_CONFIG as unknown as Sections;
    const differ: string[] = [];
    for (const [section, table] of Object.entries(listed)) {
      if (examples.has(section)) continue;
      if (typeof table !== "object") {
        if (JSON.stringify(table) !== JSON.stringify(defaults[section])) differ.push(section);
        continue;
      }
      for (const [key, value] of Object.entries(table)) if (JSON.stringify(defaults[section]?.[key]) !== JSON.stringify(value)) differ.push(`${section}.${key}`);
      // …and no setting left out of the listing.
      for (const key of Object.keys(defaults[section] ?? {})) if (!(key in table)) differ.push(`${section}.${key} (not listed)`);
    }
    for (const section of Object.keys(defaults)) if (!(section in listed)) differ.push(`[${section}] (not listed)`);
    expect(differ).toEqual([]);
    expect(Object.keys(listed).length).toBeGreaterThan(15);
  });

  test("the user file: --config, else $SLIPBOX_CONFIG, else $XDG_CONFIG_HOME/slipbox/config.toml; a --config that isn't there is said", () => {
    const xdg = mkdtempSync(join(tmpdir(), "slipbox-xdg-"));
    mkdirSync(join(xdg, "slipbox"));
    const fromXdg = join(xdg, "slipbox", "config.toml");
    writeFileSync(fromXdg, 'theme = "nord"\n');
    const fromEnv = file('theme = "dracula"\n');
    const fromFlag = file('theme = "monokai"\n');
    const saved = { xdg: process.env.XDG_CONFIG_HOME };
    try {
      process.env.XDG_CONFIG_HOME = xdg;
      expect(loadConfig()).toMatchObject({ config: { theme: "nord" }, sources: [fromXdg] });
      process.env.SLIPBOX_CONFIG = fromEnv;
      expect(loadConfig()).toMatchObject({ config: { theme: "dracula" }, sources: [fromEnv] });
      expect(loadConfig({ configFile: fromFlag })).toMatchObject({ config: { theme: "monokai" }, sources: [fromFlag] });
      // A --config that isn't there: said, and neither of the others stands in for it.
      const gone = join(xdg, "nope.toml");
      const r = loadConfig({ configFile: gone });
      expect(r).toMatchObject({ config: { theme: "tokyo-night" }, sources: [] });
      expect(r.warnings).toContain(`config: ${gone} does not exist`);
    } finally {
      process.env.XDG_CONFIG_HOME = saved.xdg;
      delete process.env.SLIPBOX_CONFIG;
    }
  });

  test("a value outside its set keeps the default, with a warning — each key the list names; one inside it is taken", async () => {
    const { DEFAULT_CONFIG } = await import("../src/core/config.ts");
    const keys: [string, string, string][] = [
      ["render", "glyphs", "ascii"],
      ["render", "show_urls", "never"],
      ["capture", "location", "vault"],
      ["ui", "lines", "heavy"],
      ["editor", "edit_in", "live"],
      ["files", "show", "all"],
    ];
    for (const [section, key, good] of keys) {
      const bad = loadConfig({ configFile: file(`[${section}]\n${key} = "bogus"\n`) });
      expect([key, (bad.config as unknown as Sections)[section]![key]]).toEqual([key, (DEFAULT_CONFIG as unknown as Sections)[section]![key]]);
      expect(bad.warnings.join("\n")).toContain(`"${section}.${key}" must be one of`);
      const ok = loadConfig({ configFile: file(`[${section}]\n${key} = "${good}"\n`) });
      expect([key, (ok.config as unknown as Sections)[section]![key], ok.warnings]).toEqual([key, good, []]);
    }
  });

  test("numbers: a range's ends are taken, past them the default; a fraction only for split_ratio and lens_max", async () => {
    const { DEFAULT_CONFIG } = await import("../src/core/config.ts");
    const value = (section: string, key: string, v: number) => {
      const r = loadConfig({ configFile: file(`[${section}]\n${key} = ${v}\n`) });
      return { v: (r.config as unknown as Sections)[section]![key], warned: r.warnings.length > 0 };
    };
    const ends: [string, string, number][] = [
      ["render", "inset", 0], ["render", "inset", 40],
      ["ui", "sidebar_width", 8], ["ui", "sidebar_width", 200],
      ["watch", "poll_ms", 50],
      ["ui", "split_ratio", 0.2], ["ui", "split_ratio", 0.8], ["ui", "split_ratio", 0.35],
      ["editor", "lens_max", 0.3],
      ["ui", "history_limit", 0], ["ui", "history_limit", 2000],
      ["context", "depth", 5], ["context", "limit", 500],
    ];
    for (const [s, k, v] of ends) expect([`${s}.${k}`, value(s, k, v)]).toEqual([`${s}.${k}`, { v, warned: false }]);
    const past: [string, string, number][] = [
      ["render", "inset", 41],
      ["ui", "sidebar_width", 7], ["ui", "sidebar_width", 201],
      ["watch", "poll_ms", 49],
      ["ui", "split_ratio", 0.9],
      ["ui", "history_limit", 2001],
      ["context", "depth", 6], ["context", "limit", 0],
      // A fraction where a whole number is meant.
      ["ui", "sidebar_width", 30.5], ["watch", "poll_ms", 100.5], ["context", "limit", 2.5],
    ];
    for (const [s, k, v] of past) expect([`${s}.${k}`, v, value(s, k, v)]).toEqual([`${s}.${k}`, v, { v: (DEFAULT_CONFIG as unknown as Sections)[s]![k], warned: true }]);
  });

  test("capture.file: a relative .md path in the project; a hidden part, another extension, absolute or climbing out keeps the default", () => {
    for (const good of ["notes/inbox.md", "inbox.markdown"]) {
      const r = loadConfig({ configFile: file(`[capture]\nfile = "${good}"\n`) });
      expect([good, r.config.capture.file, r.warnings]).toEqual([good, good, []]);
    }
    for (const bad of [".notes/inbox.md", "notes/.inbox.md", "scratch.txt", "/tmp/inbox.md", "notes/../../inbox.md"]) {
      const r = loadConfig({ configFile: file(`[capture]\nfile = "${bad}"\n`) });
      expect([bad, r.config.capture.file]).toEqual([bad, "scratch.md"]);
      expect(r.warnings.join("\n")).toContain("capture.file must be a relative .md path inside the project, not hidden");
    }
  });

  test("[colors]: a terminal palette number as a string or ansi:N, and default; anything else a warning", () => {
    const tokyo = loadTheme("tokyo-night").theme;
    const { theme, warnings } = applyColorOverrides(tokyo, { text: "12", h1: "ansi:12", h2: "default", h3: { bg: "255" }, h4: "256", h5: "#abc", h6: "ansi:300" });
    expect([theme.roles.text.fg, theme.roles.h1.fg, theme.roles.h2.fg, theme.roles.h3.bg]).toEqual(["ansi:12", "ansi:12", "default", "ansi:255"]);
    expect([theme.roles.h4.fg, theme.roles.h5.fg, theme.roles.h6.fg]).toEqual([tokyo.roles.h4.fg, tokyo.roles.h5.fg, tokyo.roles.h6.fg]);
    expect(warnings.filter((w) => w.includes("not a colour")).map((w) => w.split(":")[1]!.trim())).toEqual(["colors.h4", "colors.h5", "colors.h6"]);
  });

  test("SLIPBOX_GLYPHS acts only where render.glyphs is auto: never over a set the config names; a value that isn't a set is ignored", () => {
    const env = { TERM: "xterm-kitty", LANG: "en_US.UTF-8" };
    for (const named of ["unicode", "nerd"] as const) expect(glyphsFor(named, { ...env, SLIPBOX_GLYPHS: "ascii" }).mode).toBe(named);
    expect(glyphsFor("auto", { ...env, SLIPBOX_GLYPHS: "ascii" }).mode).toBe("ascii");
    expect(glyphsFor("auto", { ...env, SLIPBOX_GLYPHS: "fancy" }).mode).toBe("nerd"); // not a set: detected
  });
});

describe("review cycle 4 (core)", () => {
  const re = (q: string) => compilePattern(q, { regex: true, whole: false }) as RegExp;
  test("empty matches never split an emoji; $ in CRLF is one per line", () => {
    for (const m of findAll("x😀y😀", re("x*"), 0, 6, true)) expect([2, 5]).not.toContain(m.from); // inside a pair
    expect(findAll("a\r\nb\r\n", re("$"), 0, 6, true).map((m) => m.from)).toEqual([1, 4]);
  });
  test("taming never changes an ordinary note: rules, setext, long numbers, code, frontmatter", () => {
    const g = glyphsFor("unicode");
    const text = (md: string) => renderMarkdown(md, { width: 200, glyphs: g, showUrls: false }).lines.map((l) => l.spans.map((x) => x.text).join("")).join("\n");
    expect(parseMarkdown(`Section\n${"-".repeat(90)}\n`).tree.children[0]!.type).toBe("heading");
    const pi = "3".repeat(100);
    expect(text(`${pi}\n`)).toContain(pi);
    expect(text(`\`\`\`\n#${"*".repeat(80)}\n\`\`\`\n`)).toContain(`#${"*".repeat(80)}`);
    expect(parseMarkdown(`---\nsep: "${"*".repeat(80)}"\n---\n`).frontmatter?.data?.sep).toBe("*".repeat(80));
    expect(text(`${"_".repeat(80)}\n`)).not.toContain("‗");
  });
});

describe("review cycle 4 (core, CRLF empty matches)", () => {
  test("an empty match never falls between \\r and \\n", () => {
    const { findAll } = require("../src/core/replace.ts");
    expect(findAll("aaa\r\nb\r\n", /a*/g, 0, 5, true)).toEqual([{ from: 0, to: 3, groups: ["aaa"] }]);
    expect(findAll("xy\r\n", /a*/g, 0, 4, true).map((m: { from: number }) => m.from)).toEqual([0, 1, 2]);
  });
});

describe("review cycle 5 (core, from mutation testing)", () => {
  test("tabs reach the next stop, counting display columns", () => {
    expect(expandTabs("ab\tc")).toBe("ab  c");
    expect(expandTabs("日\tx")).toBe("日  x");
    expect(expandTabs("abcd\tx")).toBe("abcd    x");
  });
  test("no row ends with opening punctuation (kinsoku)", () => {
    const text = (md: string, width: number) => renderMarkdown(md, { width, glyphs: glyphsFor("unicode"), showUrls: false }).lines.map((l) => l.spans.map((x) => x.text).join(""));
    for (let w = 4; w <= 12; w++) for (const row of text("あいう「漢字」です（注）と【記録】", w)) expect(row.trimEnd()).not.toMatch(/[（「『【]$/);
  });
  test("smart case knows capitals beyond ASCII", () => {
    const re = compilePattern("Ärzte", { regex: false, whole: false, ignoreCase: false }) as RegExp;
    expect(re.flags).not.toContain("i");
    expect(findAll("ärzte Ärzte", re).map((m) => m.from)).toEqual([6]);
  });
  test("smart case skips a regex's escapes: `\\S` is no capital, `\\WFoo` still has one", () => {
    const re = compilePattern("todo\\s*\\S", { regex: true, whole: false, ignoreCase: false }) as RegExp;
    expect(re.flags).toContain("i");
    expect(findAll("TODO: x", re).map((m) => m.from)).toEqual([0]);
    const cased = compilePattern("\\WFoo", { regex: true, whole: false, ignoreCase: false }) as RegExp;
    expect(cased.flags).not.toContain("i");
    expect(findAll(" foo Foo", cased).map((m) => m.from)).toEqual([4]);
    // Plain text has no escapes: its backslash is a character, its capital a capital.
    expect((compilePattern("a\\S", { regex: false, whole: false }) as RegExp).flags).not.toContain("i");
  });
  test("the switcher's match is smart-case too", async () => {
    const { match } = await import("../src/tui/match.ts");
    expect(match("Tel", "telescope.md")).toBeNull();
    expect(match("tel", "Telescope.md")).not.toBeNull();
  });
  test("truncateStart keeps as much of the end as fits", async () => {
    const { truncateStart } = await import("../src/core/width.ts");
    expect(truncateStart("abcdef", 4)).toBe("…def");
    expect(truncateStart("abcdef", 6)).toBe("abcdef");
    expect(stringWidth(truncateStart("日本語の文", 6))).toBeLessThanOrEqual(6);
    expect(truncateStart("日本語の文", 6)).toBe("…の文");
  });
  test("VS16 makes a text-default symbol wide", async () => {
    const { graphemeWidth } = await import("../src/core/width.ts");
    expect(graphemeWidth("\u{1F02C}️")).toBe(2);
    expect(graphemeWidth("❤️")).toBe(2);
  });
});

describe("review cycle 5 (core, colour depth)", () => {
  test("NO_COLOR and a pipe mean none; COLORTERM and known terminals truecolor; TERM for the rest", async () => {
    const { detectColorDepth } = await import("../src/core/layout/ansi.ts");
    expect(detectColorDepth({ NO_COLOR: "1", COLORTERM: "truecolor" }, true)).toBe("none");
    expect(detectColorDepth({ NO_COLOR: "", COLORTERM: "truecolor" }, true)).toBe("truecolor"); // empty NO_COLOR is unset
    expect(detectColorDepth({ COLORTERM: "truecolor" }, false)).toBe("none");
    expect(detectColorDepth({ COLORTERM: "24bit" }, true)).toBe("truecolor");
    expect(detectColorDepth({ TERM: "xterm-kitty" }, true)).toBe("truecolor");
    expect(detectColorDepth({ TERM: "xterm", TERM_PROGRAM: "WezTerm" }, true)).toBe("truecolor");
    expect(detectColorDepth({ TERM: "screen-256color" }, true)).toBe("256");
    expect(detectColorDepth({ TERM: "dumb" }, true)).toBe("none");
    expect(detectColorDepth({ TERM: "xterm" }, true)).toBe("16");
  });
});

describe("the incremental source layout (15.1)", () => {
  test("after any edit, reusing the last layout's lines gives exactly a fresh layout", async () => {
    const { layoutSource, newSourceCache, scanHeadings } = await import("../src/core/layout/source.ts");
    let seed = 5;
    const rand = (n: number) => {
      seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
      return (seed >>> 8) % n;
    };
    const pieces = ["", "text", "# Heading", "- [ ] task", "```", "~~~", "---", "> quote `code`", "[[link]] and [md](x.md)", "\t tab\there", "漢字の行", "a long line that will wrap at the narrow width we use for this test"];
    for (const width of [12, 40]) {
      for (const wrap of [true, false]) {
        const cache = newSourceCache();
        let lines = Array.from({ length: 30 }, () => pieces[rand(pieces.length)]!);
        for (let step = 0; step < 300; step++) {
          const at = rand(lines.length + 1);
          const r = rand(4);
          if (r === 0) lines.splice(at, 0, pieces[rand(pieces.length)]!); // a line added
          else if (r === 1 && lines.length > 1) lines.splice(Math.min(at, lines.length - 1), 1); // taken away
          else if (at < lines.length) lines[at] = `${lines[at]}${pieces[rand(pieces.length)]!.slice(0, 3)}`; // typed into
          else lines = [pieces[rand(pieces.length)]!, ...lines];
          const text = `${lines.join("\n")}\n`;
          const opts = { width, wrap, headings: scanHeadings(text) };
          const inc = layoutSource(text, { ...opts, headings: "scan" as const }, cache);
          const fresh = layoutSource(text, opts);
          // Headings found line by line as the layout goes are the scan's of the whole text.
          expect(JSON.stringify(inc)).toBe(JSON.stringify(fresh));
        }
      }
    }
  });
});

describe("maths as Unicode text (12.11)", () => {
  test("symbols, sub- and superscripts — whole where Unicode has each character, else bracketed", () => {
    expect(mathText("\\alpha + \\beta^2 = \\gamma_i")).toBe("α + β² = γᵢ");
    expect(mathText("\\sum_{i=1}^{n} x_i")).toBe("∑ᵢ₌₁ⁿ xᵢ");
    expect(mathText("e^{i\\pi}")).toBe("e^(iπ)");
    expect(mathText("\\int_0^\\infty")).toBe("∫₀^∞");
    expect(mathText("x \\in \\mathbb{R}^n")).toBe("x ∈ ℝⁿ");
    expect(mathText("f^\\prime")).toBe("f′");
    expect(mathText("a \\not\\in B")).toBe("a ∉ B");
  });
  test("fractions, roots, accents over more than a letter, words, spacing, sizing, escapes", () => {
    expect(mathText("\\frac{1}{2} + \\frac{a+b}{c} + \\frac{n(n+1)}{2}")).toBe("½ + (a+b)/c + n(n+1)/2");
    expect(mathText("\\sqrt{x^2+y^2} + \\sqrt[3]{x} + \\sqrt[n]{y}")).toBe("√(x²+y²) + ∛x + ⁿ√y");
    expect(mathText("\\overline{AB} + \\hat{x}")).toBe("A̅B̅ + x̂");
    expect(mathText("x_{\\text{max}} \\text{ if } y")).toBe("x_max  if  y");
    expect(mathText("a\\,b\\!c\\quad d")).toBe("a bc  d");
    expect(mathText("\\left( x \\right.")).toBe("( x");
    expect(mathText("\\{1\\} \\& \\_ \\^ \\%")).toBe("{1} & _ ^ %");
    expect(mathText("E = mc^2 \\tag{1} \\label{eq}")).toBe("E = mc²     (1)");
  });
  test("functions as their names; a command it doesn't know, a row break, a malformed group: null — its source is shown", () => {
    expect(mathText("\\log_{10}(x) + \\sin\\theta + \\max_i a_i")).toBe("log₁₀(x) + sinθ + maxᵢ aᵢ");
    // One the table would take for another by its start (`\\lfoo`: its `\\l`, ł): not drawn, never half.
    for (const f of ["\\lfoo", "\\unknown x", "a \\\\ b", "\\frac{a}", "x^{y", "\\begin{pmatrix} 1 \\end{pmatrix}"]) expect(mathText(f)).toBeNull();
  });
  test("a display's rows: aligned at `&`, cases braced, matrices bracketed; what's around one on its middle row", () => {
    expect(mathRows("\\begin{aligned} a &= b + c \\\\ d + e &= f \\end{aligned}")).toEqual(["    a = b + c", "d + e = f"]);
    expect(mathRows("f(x) = \\begin{cases} x & x \\ge 0 \\\\ -x & x < 0 \\end{cases}")).toEqual(["f(x) = ⎧ x   x ≥ 0", "       ⎩ −x  x < 0"]);
    expect(mathRows("\\begin{cases} 1 & a \\\\ 2 & b \\\\ 3 & c \\end{cases}")).toEqual(["⎧ 1  a", "⎨ 2  b", "⎩ 3  c"]);
    expect(mathRows("\\begin{cases} 1 \\\\ 2 \\\\ 3 \\\\ 4 \\end{cases}")).toEqual(["⎧ 1", "⎨ 2", "⎪ 3", "⎩ 4"]);
    expect(mathRows("\\begin{pmatrix} 1 \\\\ 2 \\\\ 3 \\end{pmatrix}")).toEqual(["⎛ 1 ⎞", "⎜ 2 ⎟", "⎝ 3 ⎠"]);
    expect(mathRows("\\begin{alignat}{2} a &= b \\end{alignat}")).toEqual(["a = b"]);
    expect(mathRows("A = \\begin{pmatrix} 1 & 0 \\\\ 0 & 10 \\end{pmatrix} .")).toEqual(["A = ⎛ 1  0  ⎞ .", "    ⎝ 0  10 ⎠"]);
    expect(mathRows("\\begin{bmatrix} a & b \\end{bmatrix}")).toEqual(["[ a  b ]"]);
    expect(mathRows("E = mc^2")).toEqual(["E = mc²"]);
    expect(mathRows("\\begin{aligned} x \\\\ y \\\\ \\end{aligned}")).toEqual(["x", "y"]); // a last `\\\\` ends a row
  });
  test("a display it can't draw: an environment it doesn't know, one inside another, a cell it can't", () => {
    for (const d of ["\\begin{tikzpicture} x \\end{tikzpicture}", "\\begin{aligned} \\begin{matrix} 1 \\end{matrix} \\end{aligned}", "\\begin{cases} \\nope & 1 \\end{cases}", "a \\begin{cases} 1 \\end{cases} \\nope"]) expect(mathRows(d)).toBeNull();
  });
  test("text read from a note keeps its maths as written: a heading's (and so its slug), a task's, a footnote's, a link's", () => {
    const md = "# The $O(n)$ algorithm\n\n- [ ] compute $x^2$\n\nSee [the $n$th](x.md) and[^f].\n\n[^f]: On $\\alpha$.\n";
    const parsed = parseMarkdown(md);
    expect(headingsOf(parsed.tree)[0]).toMatchObject({ text: "The $O(n)$ algorithm", slug: slugify("The $O(n)$ algorithm") });
    expect(listTasks(parsed.tree)[0]!.text).toBe("compute $x^2$");
    expect(footnotesOf(parsed)[0]!.text).toBe("On $\\alpha$.");
    const entry = extractFromSource({ rel: "n.md", abs: "/n.md", size: md.length, mtimeMs: 0 }, md);
    expect(entry.links.find((l) => l.target === "x.md")!.text).toBe("the $n$th");
  });
  test("`$…$` read as Obsidian reads it: money isn't maths, `$$…$$` in text is", () => {
    const kinds = (md: string) => parseMarkdown(md).tree.children.flatMap((n) => ("children" in n ? n.children.map((c) => c.type) : [n.type]));
    expect(kinds("$x$ and $y$")).toEqual(["inlineMath", "text", "inlineMath"]);
    expect(kinds("costs $5 and $10")).not.toContain("inlineMath");
    expect(kinds("$ x$ or $x $")).not.toContain("inlineMath");
    expect(kinds("$5-$6 or $a$1")).not.toContain("inlineMath");
    expect(kinds("then $$x + y$$ here")).toContain("inlineMath");
    expect(kinds("then $$x$$2")).toContain("inlineMath"); // the digit rule is single dollars
    expect(kinds("$$\nx + y\n$$")).toEqual(["math"]);
    // Money's text is as written.
    const p = parseMarkdown("costs $5 and $10").tree.children[0]!;
    expect("children" in p && p.children.map((c) => ("value" in c ? c.value : "")).join("")).toBe("costs $5 and $10");
  });
});

describe("SVG drawn (12.15), and what slipbox draws as pictures (12.16, 12.17)", () => {
  const pngWidth = (png: Uint8Array) => new DataView(png.buffer, png.byteOffset).getUint32(16);
  test("CSS custom properties put in place: the root's and the style's, fallbacks, color-mix — an @import gone", () => {
    const svg = `<svg style="--bg:#000000;--fg:#ffffff;background:var(--bg)"><style>@import url('https://x.invalid/f.css');
      svg { /* derived */ --_mid: color-mix(in srgb, var(--fg) 25%, var(--bg)); --_line: var(--line, var(--_mid)); }</style>
      <rect fill="var(--_line)" stroke="var(--accent, #123456)"/><text fill="var(--nope)">t</text></svg>`;
    const flat = flattenVars(svg);
    expect(flat).not.toMatch(/var\(|color-mix|@import/);
    expect(flat).toContain('<rect fill="#404040" stroke="#123456"/>');
    expect(flat).toContain('<text fill="none">'); // nothing to give it: not drawn, never black
    expect(flattenVars('<svg><rect fill="color-mix(in srgb, #ff0000, #0000ff)"/></svg>')).toContain('fill="#800080"');
  });
  test("a colour as #rrggbb for a picture: ansi:N as xterm has it, default the fallback", () => {
    expect(colorHex("#abcdef", "#000000")).toBe("#abcdef");
    expect([colorHex("ansi:1", "x"), colorHex("ansi:21", "x"), colorHex("ansi:16", "x"), colorHex("ansi:244", "x")]).toEqual(["#cd0000", "#0000ff", "#000000", "#808080"]);
    expect([colorHex("default", "#111111"), colorHex("ansi:300", "#222222")]).toEqual(["#111111", "#222222"]);
  });
  test("an SVG told by how its text starts: a declaration, comments, a doctype before it", () => {
    for (const head of ['<svg xmlns="x">', '<?xml version="1.0"?>\n<!-- made -->\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "x">\n<svg>', "  <SVG>"]) expect(looksLikeSvg(head)).toBe(true);
    for (const head of ["<html><svg>", "\x89PNG\r\n", "<svgx>"]) expect(looksLikeSvg(head)).toBe(false);
  });
  test("rasterised: its own size, drawn as a PNG the width asked; what isn't an SVG, null", async () => {
    const r = (await loadRasterizer())!;
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20" fill="#ff0000"/></svg>';
    expect(r.size(svg)).toEqual({ width: 40, height: 20 });
    expect(pngWidth(r.png(svg, 80)!)).toBe(80);
    expect(r.size("not an svg")).toBeNull();
    expect(r.png("<svg", 10)).toBeNull();
  });
  test("a Mermaid diagram as an SVG in the theme's colours, nothing left for resvg to resolve; maths typeset in its colour", async () => {
    await loadMermaid();
    const colors = { bg: "#101010", fg: "#e0e0e0", line: "#707070", accent: "#3080f0", muted: "#909090" };
    const svg = mermaidSvg("graph TD\n  A --> B", colors, "DejaVu Sans")!;
    expect(svg).not.toMatch(/var\(|color-mix/);
    expect(svg).toContain("#e0e0e0");
    expect(svg).toContain("DejaVu Sans");
    expect(svg).not.toMatch(/<svg[^>]*background/); // the terminal's own background shows through
    expect(mermaidSvg("pie title X", colors, "DejaVu Sans")).toBeNull();
    expect(mermaidSvg("graph TD\n  A --> B", colors, null)).toBeNull(); // no font for its words: not a picture
    const t = (await loadTypesetter())!;
    const m = t("\\frac{a}{b}", "#ff0000")!;
    expect(m).toMatch(/<svg[^>]*width="[\d.]+ex"/);
    expect(m).toContain('fill="#ff0000"');
    expect(m).not.toContain("currentColor");
    expect(t("\\nope x", "#ff0000")).toBeNull(); // not red ink: text, or as written
  });
});

describe("the chunked parse (15.1)", () => {
  const strip = (t: unknown) => JSON.stringify(t, (k, v) => (k === "offset" ? undefined : v));
  // Chunks as small as they can be (a split at every place one is allowed), and the usual size.
  const same = (text: string) => {
    const whole = parseMarkdown(text, undefined, { whole: true });
    for (const chunkLines of [1, 3, undefined]) {
      const chunked = parseMarkdown(text, undefined, { chunkLines });
      expect(strip(chunked.tree.children)).toBe(strip(whole.tree.children));
      expect(strip(chunked.frontmatter)).toBe(strip(whole.frontmatter));
    }
  };
  test("every demo and fixture note parses in chunks exactly as whole", async () => {
    const { readdirSync, statSync } = await import("node:fs");
    const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : f.endsWith(".md") ? [join(d, f)] : []));
    const files = [...walk(join(import.meta.dir, "..", "examples", "vault")), ...walk(join(import.meta.dir, "fixtures", "vault"))];
    expect(files.length).toBeGreaterThan(20);
    for (const f of files) same(readFileSync(f, "utf8"));
  });
  test("what crosses a chunk: references, footnotes, HTML comments, fences, frontmatter, lists", () => {
    const filler = (n: number) => Array.from({ length: n }, (_, i) => `line ${i}`).join("\n\n");
    same(`---\ntitle: T\n---\n\n# A\n\nSee [the ref][r] and [Other] and a note[^n] and [^Two].\n\n${filler(30)}\n\n# B\n\n[r]: https://example.invalid\n[other]: /x\n\n[^n]: The footnote.\n[^two]: Two.\n`);
    same(`# A\n\n${filler(30)}\n\n<!-- a comment\n\n# not a heading\n\n-->\n\n# C\n\n${filler(30)}\n\n\`\`\`\n${filler(30)}\n\n# in code\n\`\`\`\n\n# D\n\nend\n`);
    same(`# A\n\n- one\n\n- two\n${filler(30)}\n\n# B\n\n1. x\n\n2. y\n\n> quote\n\n# C\n\n| a |\n| - |\n| 1 |\n`);
    same(`+++\ntitle = "T"\n+++\n\n# A\n\n${filler(40)}\n\n# B\n\ntext\n`);
    same(`# A\n\n${filler(40)}\n# B right after text\n\n${filler(40)}\n\n    # indented: code\n\n# C\n`);
    // Lists cut anywhere: tight, loose, nested, lazy lines, other markers, ordered, tasks.
    same("- a\n- b\n  - nested\n- c\nlazy line\n- d\n\n- loose e\n\n\n- f\n* star list\n* g\n+ plus\n\n1. one\n2. two\n3) paren\n\n- [ ] task\n- [x] done\n\ntext after\n- list interrupting text\n");
    same("1. a\n\n   para in item\n2. b\n\n10. c\n- x\n\n> - quoted list\n> - more\n\n- item\n\n      indented code in item\n- after\n");
    // Maths (12.11): a `$$` block across blank lines and what looks like a heading; `$$x$$` on a line is text.
    same(`# A\n\n${filler(30)}\n\n$$\na = b\n\n# not a heading\n\nc = d\n$$\n\n# B\n\n$$x$$ then\n\n${filler(30)}\n\n# C\n\n$$$ meta\n\n$$\n\n# still maths\n$$$\n\nend\n`);
    // `$$x$$` on its line opens nothing: the note still parses in pieces after it.
    expect(noteChunks(`$$x$$\n\n${filler(60)}\n\n# B\n\n${filler(60)}\n`).length).toBeGreaterThan(1);
  });
  test("random documents parse in chunks exactly as whole", () => {
    let seed = 99;
    const rand = (n: number) => {
      seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
      return (seed >>> 8) % n;
    };
    const pieces = ["", "", "", "text", "more text", "# Head", "## Sub", "- item", "- [ ] task", "* star", "+ plus", "1. one", "2) two", "  - nested", "  continued", "    indented", "> quote", "> - quoted item", "```", "~~~", "<!-- c", "-->", "<div>", "</div>", "| a | b |", "| - | - |", "---", "===", "[ref]: /x", "[^n]: note", "see [ref] and [^n]", "\ttab", "- ", "<script>", "</script>", "lazy", "1.", "10. ten", "Title", "-----", "=====", "> > deep", ">", "<p>para</p>", "<span>", "<?php", "?>", "<![CDATA[", "]]>", "    [^n]: indented", "[^m]: m", "  more of note", "***", "- a\r", "text\r", "  | x |", "1) a", "3. c", "- - double", "#", "#notheading", "<!-- one line -->", "<style>", "</style>", "~~~~", "````", "[x]: <y> \"t\"", "[X]", "[^M]", "$$", "$$x$$", "$$$", "$a$ and $5", "  $$"];
    // (40,000 of these, four seeds, ran clean when this was written; a thousand stay in the suite.)
    for (let doc = 0; doc < 1000; doc++) {
      const text = `${Array.from({ length: 5 + rand(60) }, () => pieces[rand(pieces.length)]!).join("\n")}\n`;
      const whole = strip(parseMarkdown(text, undefined, { whole: true }).tree.children);
      for (const chunkLines of [1, 4]) {
        const got = strip(parseMarkdown(text, undefined, { chunkLines }).tree.children);
        if (got !== whole) throw new Error(`differs at chunkLines ${chunkLines}:\n${text}`);
      }
    }
  });
  test("a cache gives the same tree as a fresh parse, edit after edit", () => {
    const cache = newParseCache();
    let text = Array.from({ length: 12 }, (_, i) => `# Section ${i}\n\n${Array.from({ length: 45 }, (_, k) => `para ${i}.${k} with [[link]] and [ref]`).join("\n\n")}\n`).join("\n") + "\n[ref]: x\n";
    for (let step = 0; step < 40; step++) {
      const at = (step * 7919) % text.length;
      text = step % 3 === 0 ? `${text.slice(0, at)}\n\nnew para ${step}\n\n${text.slice(at)}` : step % 3 === 1 ? `${text.slice(0, at)}x${text.slice(at)}` : text.slice(0, at) + text.slice(at + 5);
      expect(strip(parseMarkdown(text, cache).tree.children)).toBe(strip(parseMarkdown(text, undefined, { whole: true }).tree.children));
    }
  });
});

describe("big notes: parsed on other threads, rendered faster (15.1)", () => {
  const strip = (t: unknown) => JSON.stringify(t, (k, v) => (k === "offset" ? undefined : v));
  /** Every demo note, one after another (the first's frontmatter kept): references, footnotes,
   *  tables, fences, lists across the chunks. */
  const demo = async () => {
    const { readdirSync, statSync } = await import("node:fs");
    const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : f.endsWith(".md") ? [join(d, f)] : []));
    return walk(join(import.meta.dir, "..", "examples", "vault"))
      .sort()
      .map((f, i) => {
        const t = readFileSync(f, "utf8");
        return i ? t.replace(/^---\n[\s\S]*?\n---\n/, "") : t;
      })
      .join("\n\n");
  };

  test("chunks parsed apart (through JSON, as from a thread) and taken in: the tree a parse here gives", async () => {
    const { adoptChunks, noteChunks, parseChunk } = await import("../src/core/parse.ts");
    const text = await demo();
    const chunks = noteChunks(text);
    expect(chunks.length).toBeGreaterThan(50);
    expect(chunks[0]!.first).toBe(true);
    const cache = newParseCache();
    adoptChunks(
      cache,
      chunks.map((c) => ({ text: c.text, children: JSON.parse(JSON.stringify(parseChunk(c.text, c.first))) })),
    );
    const adopted = parseMarkdown(text, cache);
    expect(strip(adopted.tree.children)).toBe(strip(parseMarkdown(text).tree.children));
    expect(strip(adopted.frontmatter)).toBe(strip(parseMarkdown(text).frontmatter));
    // Each block carries its token for the render's cache, as a block parsed here does (a list
    // joined across a seam is a new node: none, either way).
    const { ORIGIN } = await import("../src/core/parse.ts");
    const tokens = (t: typeof adopted) => t.tree.children.map((n) => (n as unknown as Record<symbol, unknown>)[ORIGIN] !== undefined);
    expect(tokens(adopted)).toEqual(tokens(parseMarkdown(text, newParseCache())));
    expect(tokens(adopted).filter(Boolean).length).toBeGreaterThan(100);
    // A chunk the cache has already stays as it is (its blocks' rows stay cached).
    const before = new Map(cache.chunks);
    adoptChunks(
      cache,
      chunks.map((c) => ({ text: c.text, children: parseChunk(c.text, c.first) })),
    );
    for (const [k, v] of before) expect(cache.chunks.get(k)).toBe(v);
  });

  test("chunks parsed apart keep heading ids and literal quotes (15.1): a {#id} anchor, an escaped [!note]", async () => {
    const { adoptChunks, headingsOf, noteChunks, parseChunk } = await import("../src/core/parse.ts");
    const text = "## Setup {#setup}\n\n> \\[!note] literal\n";
    const quote = (t: ReturnType<typeof parseMarkdown>) => t.tree.children.find((n) => n.type === "blockquote")?.data;
    const cache = newParseCache();
    adoptChunks(
      cache,
      noteChunks(text).map((c) => ({ text: c.text, children: JSON.parse(JSON.stringify(parseChunk(c.text, c.first))) })),
    );
    const adopted = parseMarkdown(text, cache);
    const plain = parseMarkdown(text);
    expect(headingsOf(plain.tree)).toMatchObject([{ text: "Setup", slug: "setup", id: "setup" }]);
    expect(headingsOf(adopted.tree)).toEqual(headingsOf(plain.tree));
    expect(quote(plain)).toEqual({ literal: true });
    expect(quote(adopted)).toEqual(quote(plain));
  });

  test("on the workers: every chunk in the cache, the same tree; nothing left the second time", async () => {
    const { noteChunks } = await import("../src/core/parse.ts");
    const { parseInBackground, stopParsePool } = await import("../src/core/parse-pool.ts");
    const text = await demo();
    const cache = newParseCache();
    expect(await parseInBackground(text, cache)).toBe(true);
    for (const c of noteChunks(text)) expect(cache.chunks.has(c.text)).toBe(true);
    expect(strip(parseMarkdown(text, cache).tree.children)).toBe(strip(parseMarkdown(text).tree.children));
    const had = new Map(cache.chunks);
    expect(await parseInBackground(text, cache)).toBe(true);
    for (const [k, v] of had) expect(cache.chunks.get(k)).toBe(v); // none parsed again
    stopParsePool();
  });

  test("threads that can't start, or a worker that fails: false (the main thread parses), and the pool starts afresh", async () => {
    const { parseInBackground, stopParsePool } = await import("../src/core/parse-pool.ts");
    const text = await demo();
    const real = globalThis.Worker;
    let made = 0;
    class NoThreads {
      constructor() {
        throw new Error("no threads here");
      }
    }
    // A worker that fails on its first message, as one that crashed would.
    class Failing {
      onmessage: unknown = null;
      onerror: ((e: unknown) => void) | null = null;
      constructor() {
        made++;
      }
      ended = false;
      postMessage() {
        setTimeout(() => this.ended || this.onerror?.(new Error("worker crashed")), 1);
      }
      terminate() {
        this.ended = true; // as a real one: terminated, it says nothing more
      }
    }
    stopParsePool();
    try {
      (globalThis as { Worker: unknown }).Worker = NoThreads;
      const cache = newParseCache();
      expect(await parseInBackground(text, cache)).toBe(false);
      expect(cache.chunks.size).toBe(0);
      (globalThis as { Worker: unknown }).Worker = Failing;
      expect(await parseInBackground(text, cache)).toBe(false); // what was waiting ended, with nothing
      expect(cache.chunks.size).toBe(0);
      const first = made;
      expect(first).toBeGreaterThan(0);
      expect(await parseInBackground(text, cache)).toBe(false);
      expect(made).toBe(first * 2); // the failed pool was dropped: started again
    } finally {
      (globalThis as { Worker: unknown }).Worker = real;
      stopParsePool();
    }
    const cache = newParseCache();
    expect(await parseInBackground(text, cache)).toBe(true); // real threads again
    expect(cache.chunks.size).toBeGreaterThan(0);
    stopParsePool();
  });

  test("graphemes by islands: what the segmenter gives, for text mostly ASCII", () => {
    const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    let seed = 5;
    const rand = (n: number) => {
      seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
      return (seed >>> 8) % n;
    };
    const pieces = ["a", "b", " ", "e\u0301", "\u0301", "\u0600", "1", "•", "│", "漢", "👨‍👩‍👧", "🇯🇵", "\r\n", "\n", "\t", "x", "é", "\u200d", "️", "-"];
    for (let k = 0; k < 5000; k++) {
      const text = Array.from({ length: rand(12) }, () => pieces[rand(pieces.length)]!).join("");
      expect(graphemes(text)).toEqual([...seg.segment(text)].map((x) => x.segment));
    }
  });

  test("a code block is highlighted once: a re-wrap reuses its colours", async () => {
    const { highlight } = await import("../src/core/layout/highlight.ts");
    const a = highlight("const x = 1;\nfunction f() { return x; }", "ts");
    expect(a).not.toBeNull();
    expect(highlight("const x = 1;\nfunction f() { return x; }", "TS")).toBe(a); // the same lists
    expect(highlight("const x = 2;", "ts")).not.toBe(a);
    expect(highlight("text", "no-such-language")).toBeNull();
  });
});

describe("parseAround (15.1)", () => {
  test("the tasks of one line's chunk are the whole parse's there", async () => {
    const { parseAround } = await import("../src/core/parse.ts");
    const text = [
      "# Tasks",
      "",
      ...Array.from({ length: 300 }, (_, i) => (i % 50 === 7 ? "```\n- [ ] not a task, in code\n```" : `- [${i % 3 ? " " : "x"}] task ${i}`)),
      "",
      "<!--",
      "- [ ] in a comment",
      "-->",
      "",
      ...Array.from({ length: 100 }, (_, i) => `${i + 1}. [ ] numbered ${i}`),
    ].join("\n");
    const whole = listTasks(parseMarkdown(text, undefined, { whole: true }).tree);
    const byLine = new Map(whole.map((t) => [t.line, t]));
    const lines = text.split("\n").length;
    for (let line = 1; line <= lines; line++) {
      const near = listTasks(parseAround(text, line)).find((t) => t.line === line);
      expect(near).toEqual(byLine.get(line));
    }
  });
});

describe("file groups (16.1)", () => {
  test("notes by the vault's extensions, data by format, binary by extension, text otherwise", async () => {
    const { classify, isKnownExtension } = await import("../src/core/filetypes.ts");
    const notes = ["md", "markdown"];
    expect(classify("a/b.md", notes)).toEqual({ group: "note", format: "markdown" });
    expect(classify("x.org", notes).group).toBe("text"); // not a note unless the vault lists it
    expect(classify("x.org", [...notes, "org"])).toEqual({ group: "note", format: "markdown" }); // a listed extension: read as markdown
    expect(classify("cfg/app.toml", notes)).toEqual({ group: "data", format: "toml" });
    expect(classify("a.YML", notes)).toEqual({ group: "data", format: "yaml" });
    expect(classify("t.tsv", notes)).toEqual({ group: "data", format: "tsv" });
    expect(classify("src/app.ts", notes)).toEqual({ group: "text", format: "typescript" });
    expect(classify("Makefile", notes)).toEqual({ group: "text", format: "makefile" });
    expect(classify("notes.txt", notes)).toEqual({ group: "text", format: "text" });
    expect(classify("img/photo.PNG", notes).group).toBe("binary");
    expect(isKnownExtension("toml") && isKnownExtension("py") && !isKnownExtension("2")).toBe(true);
  });
});

describe("data files read as documents (16.11–16.13)", () => {
  const fields = (tree: { children: unknown[] }) => tree.children.filter((n) => (n as { type: string }).type === "dataField") as { key: string; value: string; kind: string; comment: string | null; keyLine: number; position: { start: { line: number }; end: { line: number } } }[];
  const headings = (tree: { children: unknown[] }) => tree.children.filter((n) => (n as { type: string }).type === "heading").map((n) => (n as { children: { value: string }[] }).children[0]!.value);
  test("TOML: sections, keys with their lines and comments, multi-line values, record arrays", async () => {
    const { parseData } = await import("../src/core/data.ts");
    const d = parseData("toml", '# top\ntitle = "x"\n\n[a.b]\n# above\nlist = [\n  1,\n  2,\n]\ns = """\nlong\n"""\nn = 3 # three\n\n[[s]]\nname = "p"\n[[s]]\nname = "q"\n');
    expect(d.error).toBeNull();
    expect(headings(d.tree)).toEqual(["a.b", "s"]);
    const f = fields(d.tree);
    expect(f.map((x) => x.key)).toEqual(["title", "list", "s", "n"]);
    // The file's opening comment is a block of its own, not the first key's (a key's is one line
    // right above it, as `# above` is list's).
    expect(f[0]).toMatchObject({ value: "x", kind: "string", comment: null, position: { start: { line: 2 }, end: { line: 2 } } });
    expect(d.tree.children[0]).toMatchObject({ type: "dataComment", text: "top" });
    expect(f[1]).toMatchObject({ kind: "list", comment: "above", position: { start: { line: 5 }, end: { line: 9 } } });
    expect(f[2]!.value).toBe("long");
    expect(f[3]).toMatchObject({ value: "3", kind: "number", comment: "three" });
    expect(d.tree.children.some((n) => n.type === "table")).toBe(true); // [[s]] ×2 → a table
    expect(parseData("toml", "[bad\n").error).toBeTruthy();
  });
  test("YAML and JSON as a tree: a row per key with its place, branches, records as tables, positions", async () => {
    const { parseData, dataOutline } = await import("../src/core/data.ts");
    const y = parseData("yaml", "a: 1\nb:\n  c: true\n  d: [x, y]\n  e:\n    f: 1\n    g: {h: 1, $ref: x.json}\nrows:\n  - k: 1\n  - k: 2\nv:\n  - {n: 1, deep: {z: 1}}\n  - {n: 2}\n");
    expect(y.error).toBeNull();
    const rows = (y.tree.children as unknown as { type: string; key?: string; value?: string; keyLine?: number; tree?: { lasts: boolean[]; branch?: boolean } }[]).map((n) =>
      n.type === "dataField" ? [n.key, n.value, n.tree!.lasts.map((l) => (l ? "L" : "|")).join(""), n.tree!.branch ? "branch" : "", n.keyLine] : [n.type],
    );
    expect(rows).toEqual([
      ["a", "1", "", "", 1],
      ["b", "", "", "branch", 2],
      ["c", "true", "|", "", 3],
      ["d", "[x, y]", "|", "", 4], // a list of scalars reads inline
      ["e", "", "L", "branch", 5],
      ["f", "1", "L|", "", 6],
      ["g", "", "LL", "branch", 7], // small, but it holds a $ref: its rows show the link
      ["h", "1", "LL|", "", 7],
      ["$ref", "x.json", "LLL", "", 7],
      ["rows", "", "", "branch", 8],
      ["table"], // records: a table in the tree
      ["v", "", "", "branch", 11],
      ["1", "", "|", "branch", 12], // one item has depth, so every object item opens
      ["n", "1", "||", "", 12],
      ["deep", "{z: 1}", "|L", "", 12],
      ["2", "", "L", "branch", 13],
      ["n", "2", "LL", "", 13],
    ]);
    expect(dataOutline(y.tree).map((h) => [h.depth, h.text])).toEqual([[1, "b"], [2, "e"], [3, "g"], [1, "rows"], [1, "v"], [2, "1"], [2, "2"]]);
    // A document's opening comment block, on its own lines (the lens edits it, not the first key).
    const c = parseData("yaml", "# one\n# two\n\nk: 1\n---\n\n# three\n\nm: 2\n");
    expect(c.tree.children.filter((n) => n.type === ("dataComment" as never)).map((n) => [n.position!.start.line, n.position!.end.line])).toEqual([[1, 2], [7, 7]]);
    const j = parseData("json", '{\n  "name": "s",\n  // a comment\n  "deps": {"a": "1"}\n}\n');
    expect(j.error).toBeNull(); // jsonc comments are allowed
    expect((j.tree.children[1] as unknown as { key: string; value: string }).value).toBe("{a: 1}"); // small and plain: inline
    expect(parseData("json", '{"a": }').error).toBeTruthy();
    // A tsconfig.json as editors read it: trailing commas too, after a comment as well; a comma in a
    // string stays, and every row keeps its line.
    const tsconfig = parseData("json", '{\n  "a": [1, 2,],\n  "b": "x,}", // c\n  /* d */\n}\n');
    expect(tsconfig.error).toBeNull();
    expect(fields(tsconfig.tree).map((x) => [x.key, x.value, x.keyLine])).toEqual([
      ["a", "[1, 2]", 2],
      ["b", "x,}", 3],
    ]);
    expect(parseData("json", '{"a": 1,, }').error).toBeTruthy(); // one comma too many is still an error
    expect(parseData("yaml", "a: [1, 2\n").error).toBeTruthy();
  });
  test("INI and .env; CSV with quotes, doubled quotes and a newline in a field", async () => {
    const { parseData } = await import("../src/core/data.ts");
    const ini = parseData("ini", '; c\n[core]\nk = v ; tail\nexport X=1\nURL="https://x.invalid/#top"   # where sync goes\nB=\'one ; two\' ; c\nQ="plain"\n');
    expect(headings(ini.tree)).toEqual(["core"]);
    // Quoted, a value ends at its closing quote: a # or ; inside it is its own, one after a comment.
    expect(fields(ini.tree).map((x) => [x.key, x.value, x.comment])).toEqual([
      ["k", "v", "tail"],
      ["X", "1", null],
      ["URL", "https://x.invalid/#top", "where sync goes"],
      ["B", "one ; two", "c"],
      ["Q", "plain", null],
    ]);
    // Java's .properties: `!` comments, and a value that goes on, indented, after a backslash; an
    // INI's Windows path ending in one is a value of its own line.
    const props = parseData("ini", "a = 0\n! where\nsources = /a, \\\n    /b, \\\n    /c\nnext = 1\ndir = C:\\\nlast = 2\n");
    expect(props.error).toBeNull();
    expect(fields(props.tree).map((x) => [x.key, x.value, x.comment, x.keyLine])).toEqual([
      ["a", "0", null, 1],
      ["sources", "/a, /b, /c", "where", 3],
      ["next", "1", null, 6],
      ["dir", "C:\\", null, 7],
      ["last", "2", null, 8],
    ]);
    const csv = parseData("csv", 'a,b\n"1, one","say ""hi"""\n"multi\nline",2\n');
    expect(csv.error).toBeNull();
    const t = csv.tree.children[0] as { children: { position: { start: { line: number } }; children: { children: { value: string }[] }[] }[] };
    const cells = t.children.map((r) => r.children.map((c) => c.children[0]?.value ?? ""));
    expect(cells).toEqual([["a", "b"], ["1, one", 'say "hi"'], ["multi line", "2"]]);
    expect(t.children.map((r) => r.position.start.line)).toEqual([1, 2, 3]);
    expect(parseData("csv", 'a\n"open\n').error).toBeTruthy();
  });
});

describe("links out of data files (16.15)", () => {
  test("URLs and reference keys always; path-like values only when they resolve (the graph's call)", async () => {
    const { fieldLink } = await import("../src/core/data.ts");
    expect(fieldLink({ key: "home", value: "https://example.invalid/x" })).toEqual({ target: "https://example.invalid/x", explicit: true });
    expect(fieldLink({ key: "$ref", value: "./user.json#/defs/id" })).toEqual({ target: "./user.json#/defs/id", explicit: true });
    expect(fieldLink({ key: "include", value: "base.toml" })!.explicit).toBe(true);
    expect(fieldLink({ key: "schema_file", value: "schemas/user.json" })).toEqual({ target: "schemas/user.json", explicit: false });
    expect(fieldLink({ key: "docs", value: "docs/design/sync" })).toEqual({ target: "docs/design/sync", explicit: false });
    expect(fieldLink({ key: "out", value: "dist/" })).toBeNull(); // a folder: never a link target
    expect(fieldLink({ key: "name", value: "slipbox" })).toBeNull();
    expect(fieldLink({ key: "version", value: "1.2.3" })).toBeNull();
    expect(fieldLink({ key: "title", value: "a sentence with spaces.md" })).toBeNull();
  });
  test("a reference key's list, number, boolean or null is no link (never a broken `[base.json]`)", async () => {
    const { dataLinks, parseData } = await import("../src/core/data.ts");
    const { renderTree } = await import("../src/core/layout/render.ts");
    const targets = (format: string, src: string) => dataLinks(parseData(format, src).tree).map((l) => l.target);
    expect(targets("json", '{"includes": ["base.json"], "file": null, "path": 3, "schema": 2, "imports": true, "$ref": "user.json"}')).toEqual(["user.json"]);
    expect(targets("toml", 'imports = ["base.toml"]\nschema = 2\ninclude = "base.toml"\n')).toEqual(["base.toml"]);
    expect(targets("yaml", "include:\n  - base.yml\nschema: 2\nincludes: base.yml\n")).toEqual(["base.yml"]);
    expect(targets("ini", "path = 3\nfile = base.ini\n")).toEqual(["base.ini"]);
    const l = renderTree(parseData("json", '{"schema": 2, "includes": ["base.json"]}').tree, { width: 60, glyphs: glyphsFor("unicode"), showUrls: false });
    expect(l.lines.flatMap((x) => x.spans).filter((s) => s.role === "link_unresolved" || s.role === "link")).toEqual([]);
  });
});

describe("link-like tokens in code (16.10)", () => {
  test("URLs without the sentence's punctuation; paths with an extension, `:line` apart", async () => {
    const { linkTokens } = await import("../src/core/syntax.ts");
    const t = (s: string) => linkTokens(s).map((k) => [k.target, k.at, s.slice(k.index, k.index + k.length)]);
    expect(t("see docs/a.md and src/x.ts:42.")).toEqual([["docs/a.md", null, "docs/a.md"], ["src/x.ts", 42, "src/x.ts:42"]]);
    expect(t("(https://example.invalid/a_(b)), https://x.invalid/y.")).toEqual([
      ["https://example.invalid/a_(b)", null, "https://example.invalid/a_(b)"],
      ["https://x.invalid/y", null, "https://x.invalid/y"],
    ]);
    expect(t("version 1.5, ../up.py:3:7 and ./r.toml")).toEqual([["../up.py", 3, "../up.py:3:7"], ["./r.toml", null, "./r.toml"]]);
  });
});

describe("a reader per note format (16.2)", () => {
  test("markdown's reader parses, scans headings and finds links in a line; it's every note's", async () => {
    const { readerFor, parseNoteFile } = await import("../src/core/readers.ts");
    const { noteFormat } = await import("../src/core/filetypes.ts");
    // Org and AsciiDoc were readers once (16.16, 16.17, dropped): every note is markdown.
    expect([noteFormat("a.md"), noteFormat("b.markdown"), noteFormat("c.org"), noteFormat("d.txt")]).toEqual(["markdown", "markdown", "markdown", "markdown"]);
    const md = readerFor("markdown");
    expect(md.scanHeadings("# One\n\n```\n# not\n```\n## Two\n").map((h) => h.text)).toEqual(["One", "Two"]);
    // The scan (an unsaved note's outline) reads a heading as the render does: `{#id}` the id, not
    // text; footnote marks and HTML tags left out.
    const hs = "# Setup {#install}\n\n## Notes[^1]\n\n## Use `x` <kbd>K</kbd>\n\n[^1]: n\n";
    const drawn = renderMarkdown(hs, { width: 60, glyphs: glyphsFor("unicode"), showUrls: false }).headings.map(({ text, slug, id }) => ({ text, slug, id }));
    expect(drawn).toEqual([{ text: "Setup", slug: "setup", id: "install" }, { text: "Notes", slug: "notes", id: undefined }, { text: "Use x K", slug: "use-x-k", id: undefined }]);
    expect(md.scanHeadings(hs).map(({ text, slug, id }) => ({ text, slug, id }))).toEqual(drawn);
    expect(layoutSource(hs, { width: 60, wrap: true, headings: "scan" }).headings[0]).toMatchObject({ text: "Setup", id: "install" });
    // `_` inside a word, a code span's markup and an image (left out, its alt too) as the render reads them.
    const marked = "# The config_file option\n\n## Use `a_b * c` here\n\n## Logo ![logo](logo.png) Title\n\n## *Bold* ~~gone~~ [[a|b]] &amp; \\*\n";
    const rendered = renderMarkdown(marked, { width: 60, glyphs: glyphsFor("unicode"), showUrls: false }).headings.map(({ text, slug }) => ({ text, slug }));
    expect(rendered.map((h) => h.text)).toEqual(["The config_file option", "Use a_b * c here", "Logo  Title", "Bold gone b & *"]);
    expect(md.scanHeadings(marked).map(({ text, slug }) => ({ text, slug }))).toEqual(rendered);
    expect(layoutSource(marked, { width: 60, wrap: true, headings: "scan" }).headings.map(({ text, slug }) => ({ text, slug }))).toEqual(rendered);
    // Reference links and images, their definitions elsewhere in the note: a README's badge heading.
    const refs = "# Foo [![Build][ci-badge]][ci-url]\n\n## See [the docs][d]\n\n## Logo ![alt][img] here\n\n## Also [d][] and [d]\n\n" +
      "[ci-badge]: https://ci/b.svg\n[ci-url]: https://ci\n[d]: docs.md\n[img]: logo.png\n";
    const refsDrawn = headingsOf(parseMarkdown(refs).tree).map(({ text, slug }) => ({ text, slug }));
    expect(refsDrawn.map((h) => h.slug)).toEqual(["foo", "see-the-docs", "logo--here", "also-d-and-d"]);
    expect(md.scanHeadings(refs).map(({ text, slug }) => ({ text, slug }))).toEqual(refsDrawn);
    expect(md.linkAt("see [the intro](alpha.md#intro) and [x](b.md)", 6)).toEqual({ kind: "markdown", target: "alpha.md#intro", heading: null, text: "the intro" });
    expect(md.linkAt("see [[alpha#Top|the alpha]] and [x](b.md)", 6)).toMatchObject({ kind: "wiki", target: "alpha", heading: "Top", text: "the alpha" }); // read again (21.3)
    expect(md.linkAt("see [[alpha#Top|the alpha]] and [x](b.md)", 34)).toMatchObject({ kind: "markdown", target: "b.md" });
    // Split as the tokenizer splits it: `\|` is a table cell's alias divider, `#^b1` a block.
    expect(md.linkAt("| [[alpha\\|the alpha]] | x |", 5)).toEqual({ kind: "wiki", target: "alpha", heading: null, text: "the alpha" });
    expect(md.linkAt("see ![[alpha#^b1]]", 6)).toEqual({ kind: "embed", target: "alpha", heading: "^b1", text: "alpha" });
    expect(parseNoteFile("x.md", "# T\n").tree.children[0]!.type).toBe("heading");
    expect(readerFor("no-such-format")).toBe(md);
  });
});

describe("every grammar runs with this runtime (16.7)", () => {
  // What a grammar's external scanner handles — heredocs, docstrings, template and raw strings — is
  // where a grammar built for another ABI fails (bash's heredoc tripped an assertion once).
  const SAMPLES = {
    bash: ["f() {\n  cat <<NOTE > x\nhello $(date)\n# not a comment\nNOTE\n}\n", "f"],
    python: ['class A:\n    """doc\n    string"""\n    def m(self):\n        return f"{1}"\n', "A"],
    typescript: ["export class B {\n  m(): string { return `a\n${1}`; }\n}\n", "B"],
    tsx: ["function C() {\n  return <div>{`x`}</div>;\n}\n", "C"],
    javascript: ["function f() {\n  return /re/g;\n}\n", "f"],
    go: ["package m\n\nfunc F() string {\n\treturn `a\nb`\n}\n", "F"],
    rust: ['fn f() -> &\'static str {\n    r#"a\n"b"#\n}\n', "f"],
    lua: ["local function g()\n  return [[a\nb]]\nend\n", "g"],
    swift: ['struct S {\n  let t = """\n  a\n  """\n  func f() {}\n}\n', "S"],
    html: ["<h1 id=\"t\">Title</h1>\n<script>\nfunction f() {}\n</script>\n", "Title"],
    css: ["/* a\n b */\n.a { color: red; }\n", ".a"],
    scss: ["// c\n@mixin m($x) { color: $x; }\n.a { &:hover { color: red; } }\n", "m"],
    php: ["<?php\nclass P {}\n$s = <<<EOT\nheredoc\nEOT;\n", "P"],
    dockerfile: ["FROM node:22 AS build\nRUN echo a \\\n  && echo b\n", "build (node:22)"],
    vue: ["<template><h1>{{ t }}</h1></template>\n<script setup lang=\"ts\">\nconst t = `a\nb`\n</script>\n", "template"],
    svelte: ["<script>\n  let n = 0;\n</script>\n<h1 id=\"x\">{n}</h1>\n", "script"],
    astro: ["---\nconst t = 1;\n---\n<h1 id=\"top\">{t}</h1>\n", "frontmatter"],
    ruby: ["class R\n  X = <<~T\n    a\n  T\nend\n", "R"],
    c: ["int f(void) {\n  return 0;\n}\n", "f"],
    cpp: ["class K {\n  void m();\n};\nauto s = R\"(a\nb)\";\n", "K"],
  } as const;
  for (const [g, [src, first]] of Object.entries(SAMPLES)) {
    test(g, async () => {
      const { grammar, parseSyntax } = await import("../src/core/syntax.ts");
      const loaded = await grammar(g as Parameters<typeof grammar>[0]);
      expect(loaded).not.toBeNull();
      const tree = parseSyntax(loaded!, src)!;
      expect(tree.errors()).toEqual([]);
      expect(tree.outline()[0]?.name).toBe(first);
    });
  }
});

describe("more languages: Swift, the web's, PHP, Dockerfile, Ruby, C and C++ (16.18–16.23)", () => {
  const parsed = async (name: string, src: string) => {
    const { grammar, grammarFor, parseSyntax } = await import("../src/core/syntax.ts");
    const { classify, extensionOf } = await import("../src/core/filetypes.ts");
    const g = grammarFor(classify(name, ["md"]).format, extensionOf(name))!;
    return parseSyntax((await grammar(g))!, src)!;
  };
  const outline = (t: { outline(): { name: string; kind: string; line: number; depth: number }[] }) => t.outline().map((o) => `${"  ".repeat(o.depth)}${o.kind} ${o.name} @${o.line}`);

  test("each language by its extension or its file's name; HTML parsed as HTML, XML and SVG not", async () => {
    const { grammarFor } = await import("../src/core/syntax.ts");
    const { classify, extensionOf } = await import("../src/core/filetypes.ts");
    const of = (name: string) => grammarFor(classify(name, ["md"]).format, extensionOf(name));
    expect(["a.swift", "a.php", "a.scss", "a.css", "a.vue", "a.svelte", "a.astro", "a.rb", "Gemfile", "a.c", "a.h", "a.cpp", "a.hpp", "a.cc"].map(of)).toEqual(["swift", "php", "scss", "css", "vue", "svelte", "astro", "ruby", "ruby", "c", "c", "cpp", "cpp", "cpp"]);
    expect(["Dockerfile", "dockerfile", "Dockerfile.dev"].map(of)).toEqual(["dockerfile", "dockerfile", "dockerfile"]);
    expect(["a.html", "a.htm", "a.xml", "a.svg"].map(of)).toEqual(["html", "html", null, null]);
    expect(classify("a.html", ["md"]).format).toBe("xml"); // highlighted as highlight.js has it
  });

  test("outlines: Swift's kinds by their keyword, C's prototypes, C++'s methods, Ruby's self., PHP's traits, a Dockerfile's stages, CSS's rules", async () => {
    expect(outline(await parsed("a.swift", "struct P {}\nclass A: B {\n  init() {}\n  func go(n: Int) -> Int { n }\n}\nextension A { func more() {} }\nprotocol Q { func q() }\nenum E { case a }\nactor C {}\n"))).toEqual([
      "struct P @1", "class A @2", "  init init @3", "  function go @4", "extension A @6", "  function more @6", "protocol Q @7", "  function q @7", "enum E @8", "actor C @9",
    ]);
    expect(outline(await parsed("k.h", "struct route { int n; };\nint route_len(const struct route *r);\ndouble *coords(void);\ntypedef struct route R;\n"))).toEqual(["struct route @1", "function route_len @2", "function coords @3", "type R @4"]);
    expect(outline(await parsed("a.cpp", "namespace ns {\nclass A : public B {\n public:\n  void go();\n  ~A();\n};\nvoid A::go() {}\n}\n"))).toEqual(["namespace ns @1", "  class A @2", "    method go @4", "    method ~A @5", "  function A::go @7"]);
    expect(outline(await parsed("a.rb", "module M\n  class A < B\n    def go; end\n    def self.make; end\n  end\nend\n"))).toEqual(["module M @1", "  class A @2", "    method go @3", "    method self.make @4"]);
    expect(outline(await parsed("a.php", "<?php\ninterface I {}\ntrait T { function t() {} }\nenum E { case A; }\nfunction f() {}\n"))).toEqual(["interface I @2", "trait T @3", "  method t @3", "enum E @4", "function f @5"]);
    expect(outline(await parsed("Dockerfile", "FROM node:22 AS build\nRUN x\nFROM nginx:1.27\nCOPY --from=build /a /b\n"))).toEqual(["stage build (node:22) @1", "stage nginx:1.27 @3"]);
    expect(outline(await parsed("a.scss", "@mixin m($x) { color: $x; }\n.card {\n  .title, .sub { margin: 0; }\n}\n@media (max-width: 600px) { .card { padding: 0; } }\n"))).toEqual([
      "mixin m @1", "rule .card @2", "  rule .title, .sub @3", "media @media (max-width: 600px) @5", "  rule .card @5",
    ]);
  });

  test("a page (16.19, 16.22): its headings and ids; its script and style parsed as theirs — their definitions under them, their lines highlighted so", async () => {
    const src = "<html>\n<style>\n  h1 { color: red }\n</style>\n<h1 id=\"top\">Title</h1>\n<section id=\"about\"><h2>About</h2></section>\n<script type=\"module\">\n  // see notes.md\n  function go() {}\n</script>\n<script type=\"application/json\">\n  {\"a\": 1}\n</script>\n</html>\n";
    const t = await parsed("a.html", src);
    expect(outline(t)).toEqual(["section style @2", "  rule h1 @3", "h1 Title @5", "id #about @6", "  h2 About @6", "section script type=\"module\" @7", "  function go @9", "section script type=\"application/json\" @11"]);
    // Each part's lines in its language; JSON's highlighted, not parsed; the tags' own lines the page's.
    expect([...t.languages()]).toEqual([[3, "css"], [8, "javascript"], [9, "javascript"], [12, "json"]]);
    // A part's comment, where it is in the file.
    expect(t.comments().map((c) => [c.line, c.column, c.text])).toEqual([[8, 2, "// see notes.md"]]);
    // A part on its tag's own line: its columns from where it starts there.
    const one = await parsed("b.html", "<p>x</p>\n<script>/* see a.md */ function h() {}</script>\n");
    expect(one.comments().map((c) => [c.line, c.column])).toEqual([[2, 8]]);
    expect(outline(one)).toEqual(["section script @2", "  function h @2"]);
    const bad = await parsed("c.html", "<p>x</p>\n<script>let x = ;</script>\n");
    expect(bad.errors().map((e) => [e.line, e.from])).toEqual([[2, 14]]); // the assignment with nothing after it, past the tag
  });

  test("a component's grammar is ready only with its parts' (a fresh process: nothing loaded before)", () => {
    // TypeScript's grammar made slow to load: the component's own is ready long before it.
    const script = `
      const wts = await import("web-tree-sitter");
      const load = wts.Language.load.bind(wts.Language);
      wts.Language.load = async (p) => (String(p).includes("typescript") ? await new Promise((r) => setTimeout(r, 300)) : null, load(p));
      const { grammarNow } = await import(${JSON.stringify(join(import.meta.dir, "..", "src", "core", "syntax.ts"))});
      for (let i = 0; i < 2000 && !grammarNow("vue"); i++) await new Promise((r) => setTimeout(r, 1));
      console.log(JSON.stringify([!!grammarNow("vue"), !!grammarNow("typescript"), !!grammarNow("scss")]));`;
    const r = Bun.spawnSync([process.execPath, "-e", script], { cwd: join(import.meta.dir, "..") });
    expect(JSON.parse(r.stdout.toString().trim())).toEqual([true, true, true]);
  });

  test("components (16.22): Vue's template, script and style; Svelte's; Astro's frontmatter — each part in its language, placed in the file", async () => {
    const vue = await parsed("C.vue", "<template>\n  <h2 id=\"card\">{{ title }}</h2>\n</template>\n<script setup lang=\"ts\">\nconst s = `a\nb`;\nfunction go(): void {}\n</script>\n<style lang=\"scss\">\n.a { .b { color: red; } }\n</style>\n");
    expect(outline(vue)).toEqual(["section template @1", "  h2 {{ title }} @2", "section script setup lang=\"ts\" @4", "  function go @7", "section style lang=\"scss\" @9", "  rule .a @10", "    rule .b @10"]);
    expect([...vue.languages()]).toEqual([[5, "typescript"], [6, "typescript"], [7, "typescript"], [10, "scss"]]);
    // A template string spanning lines, inside the script: a string, at its place in the file.
    expect(vue.spans()).toEqual([{ line: 5, from: 10, to: Number.POSITIVE_INFINITY, kind: "string" }, { line: 6, from: 0, to: 2, kind: "string" }]);
    const svelte = await parsed("C.svelte", "<script>\n  export let n = 0;\n  function inc() { n++ }\n</script>\n<h1 id=\"x\">{n}</h1>\n<style>\n  h1 { color: red }\n</style>\n");
    expect(outline(svelte)).toEqual(["section script @1", "  function inc @3", "h1 {n} @5", "section style @6", "  rule h1 @7"]);
    expect([...svelte.languages()]).toEqual([[2, "javascript"], [3, "javascript"], [7, "css"]]);
    const astro = await parsed("P.astro", "---\ninterface Props { title: string }\nconst { title } = Astro.props;\n---\n<h1 id=\"top\">{title}</h1>\n<script>\n  const n: number = 1;\n</script>\n");
    expect(outline(astro)).toEqual(["section frontmatter @1", "  interface Props @2", "h1 {title} @5", "section script @6"]);
    expect([...astro.languages()]).toEqual([[2, "typescript"], [3, "typescript"], [7, "typescript"]]); // Astro's scripts are TypeScript
  });

  test("a part's syntax error is said where it is in the file; PHP's HTML highlighted as HTML", async () => {
    const vue = await parsed("C.vue", "<template><p>x</p></template>\n<script>\nconst a = ;\n</script>\n");
    expect(vue.errors().map((e) => [e.line, e.message])).toEqual([[3, "syntax error"]]);
    const php = await parsed("a.php", "<!doctype html>\n<title>T</title>\n<?php echo 1; ?>\n<ul>\n<?php foreach ($a as $x): ?>\n  <li><?= $x ?></li>\n<?php endforeach; ?>\n</ul>\n");
    expect([...php.languages()]).toEqual([[1, "xml"], [2, "xml"], [4, "xml"], [8, "xml"]]);
  });

  test("the source view colours a part's lines in its language: a component's script as TypeScript, its template as markup", async () => {
    const { layoutSource } = await import("../src/core/layout/source.ts");
    const src = "<template>\n  <p>const</p>\n</template>\n<script setup lang=\"ts\">\nconst a = 1;\n</script>\n";
    const roles = (languageAt?: (line: number) => string | undefined) => {
      const l = layoutSource(src, { width: 80, wrap: false, headings: [], language: "vue", ...(languageAt ? { languageAt } : {}) });
      const word = (row: number) => l.lines[row]!.spans.find((sp) => sp.text.includes("const"))?.role ?? null;
      return [word(1), word(4)];
    };
    expect(roles((line) => (line === 5 ? "typescript" : undefined))).toEqual(["text", "syn_keyword"]); // a word in the template is text
    expect(roles()[1]).toBe("text"); // without the parts known: markup throughout
    // The same text laid out again once the parts are known (a buffer keeps its layout): the line is coloured anew.
    const { newSourceCache } = await import("../src/core/layout/source.ts");
    const cache = newSourceCache();
    const opts = { width: 80, wrap: false, headings: [], language: "vue" };
    layoutSource(src, opts, cache);
    const again = layoutSource(src, { ...opts, languageAt: (line: number) => (line === 5 ? "typescript" : undefined) }, cache);
    expect(again.lines[4]!.spans.find((sp) => sp.text.includes("const"))?.role).toBe("syn_keyword");
  });
});

describe("tags (1.6)", () => {
  const tagsOf = (source: string) => {
    const out: string[] = [];
    visit(parseMarkdown(source).tree, (n) => {
      if ((n.type as string) === "hashtag") out.push((n as unknown as { value: string }).value);
    });
    return out;
  };

  test("#tag as Obsidian writes it: after a space or a line's start; not in code, a URL, a wikilink or a heading marker", () => {
    expect(tagsOf("#start and #mid-dle, #under_score. #nested/deep/er #ünïcode #1a")).toEqual(["start", "mid-dle", "under_score", "nested/deep/er", "ünïcode", "1a"]);
    expect(tagsOf("a#glued https://x.com/page#frag [[note#heading]] #123 #/")).toEqual([]);
    expect(tagsOf("`#code` and\n\n```\n#fenced\n```\n")).toEqual([]);
    expect(tagsOf("# Heading\n\n## Heading #inheading\n")).toEqual(["inheading"]);
    expect(tagsOf("line one\n#second-line\n")).toEqual(["second-line"]);
    expect(tagsOf("#trailing/ slash")).toEqual(["trailing"]);
  });

  test("a tag renders as #name in its role, and follows (a link of its own kind)", () => {
    const layout = renderMarkdown("See #project/alpha here.\n", { width: 60, glyphs: glyphsFor("unicode"), showUrls: false });
    const span = layout.lines.flatMap((l) => l.spans).find((s) => s.text === "#project/alpha")!;
    expect(span.role).toBe("tag");
    expect(layout.links[span.link!]).toMatchObject({ kind: "tag", target: "project/alpha" });
  });
});

describe("footnotes (3.17)", () => {
  test("numbered as GFM numbers them: by first reference, then the ones nothing refers to; the definition's label", () => {
    // A definition before the text: the order is still the references'.
    const list = footnotesOf(parseMarkdown("[^a]: Alpha *one*\n    and [Two](two.md) #tag.\n\nB[^b] then A[^A] and B[^b] again.\n\n[^spare]: Unused.\n[^b]: Beta.\n"));
    expect(list.map((f) => [f.label, f.line, f.references.length])).toEqual([["b", 7, 2], ["a", 1, 1], ["spare", 6, 0]]);
    expect(list[1]!.text).toBe("Alpha one and Two #tag.");
    expect(list[0]!.references).toMatchObject([{ line: 4, column: 2 }, { line: 4, column: 23 }]);
  });

  test("a definition's text as one line: a wikilink by its alias, else its name; an embed by its name; a tag with its #", () => {
    const list = footnotesOf(parseMarkdown("A[^1]\n\n[^1]: See [[plan|the plan]], [[other]] and ![[pic.png]] #todo.\n"));
    expect(list.map((f) => f.text)).toEqual(["See the plan, other and pic.png #todo."]);
  });

  test("add, edit, delete, rename: each the edits it makes to the note's text (3.18)", () => {
    const run = (src: string, change: (s: string, list: ReturnType<typeof footnotesOf>) => TextEdit[]) => applyEdits(src, change(src, footnotesOf(parseMarkdown(src))));
    // Added: [^N] where asked, its definition after the note's last one (the note ends with them)…
    const src = "Claim one[^1] and two.\n\n[^1]: First.\n";
    const at = src.indexOf(" and two") + " and two".length;
    const added = addFootnote(src, footnotesOf(parseMarkdown(src)), at, "  Second\n claim ");
    expect(added.label).toBe("2");
    expect(applyEdits(src, added.edits)).toBe("Claim one[^1] and two[^2].\n\n[^1]: First.\n[^2]: Second claim\n");
    // …else after a blank line; a note without a final newline gets one.
    expect(run("Text here.\n", (s, l) => addFootnote(s, l, 9, "Body").edits)).toBe("Text here[^1].\n\n[^1]: Body\n");
    expect(run("Text", (s, l) => addFootnote(s, l, 4, "B").edits)).toBe("Text[^1]\n\n[^1]: B\n");
    expect(() => addFootnote("x", [], 1, "  ")).toThrow("needs some text");
    // Edited: its definition, continuation lines too, one line now.
    const two = "A[^n] b.\n\n[^n]: Old,\n    continued.\n[^z]: Zed.\n";
    expect(run(two, (s, l) => editFootnote(s, l[0]!, "New text"))).toBe("A[^n] b.\n\n[^n]: New text\n[^z]: Zed.\n");
    // Deleted: its references and its definition's lines.
    expect(run("A[^n] b[^n].\n\n[^n]: Old,\n    more.\n[^z]: Zed.\n", (s, l) => deleteFootnote(s, l[0]!))).toBe("A b.\n\n[^z]: Zed.\n");
    // A CRLF note's: its line's CRLF goes too, never leaving a blank line where it was.
    expect(run("A[^n] b.\r\n\r\n[^n]: Old.\r\n[^z]: Zed.\r\n", (s, l) => deleteFootnote(s, l[0]!))).toBe("A b.\r\n\r\n[^z]: Zed.\r\n");
    // Renamed: everywhere; a taken label, or one with a space, refused.
    expect(run("A[^n] b[^n].\n\n[^n]: Old.\n[^z]: Zed.\n", (s, l) => renameFootnote(s, l[0]!, l, "source"))).toBe("A[^source] b[^source].\n\n[^source]: Old.\n[^z]: Zed.\n");
    const l = footnotesOf(parseMarkdown(two));
    expect(() => renameFootnote(two, l[0]!, l, "Z")).toThrow("taken");
    expect(() => renameFootnote(two, l[0]!, l, "a b")).toThrow("can't be");
  });
});

describe("trust (23.x)", () => {
  test("a root is trusted when your list names it, a folder above it, or a glob matching either; nothing is by default", () => {
    const home = mkdtempSync(join(sandbox, "trust-"));
    const proj = join(home, "Projects", "app");
    mkdirSync(join(proj, "src"), { recursive: true });
    mkdirSync(join(home, "Other", "x"), { recursive: true });
    expect(isTrusted(proj, [])).toBe(false);
    expect(isTrusted(proj, [proj])).toBe(true);
    expect(isTrusted(join(proj, "src"), [proj])).toBe(true); // inside it
    expect(isTrusted(join(home, "Projects"), [proj])).toBe(false); // above it isn't
    expect(isTrusted(join(proj, "src"), [join(home, "Projects", "*")])).toBe(true);
    expect(isTrusted(join(home, "Other", "x"), [join(home, "Projects", "*")])).toBe(false);
    expect(isTrusted(`${proj}-evil`, [proj])).toBe(false); // a name that starts the same
    // Through a symlink: the folder it is.
    symlinkSync(proj, join(home, "link"));
    expect(isTrusted(join(home, "link", "src"), [proj])).toBe(true);
    // The list set once is the one asked.
    setTrustedRoots([proj]);
    expect(isTrusted(proj)).toBe(true);
  });

  test("only your config trusts: a folder's [trust] is ignored, said why; a list of other than paths is warned of", () => {
    const dir = mkdtempSync(join(sandbox, "trustcfg-"));
    const user = join(dir, "config.toml");
    writeFileSync(user, '[trust]\nroots = ["~/Projects/*", ""]\n');
    mkdirSync(join(dir, "v", ".slipbox"), { recursive: true });
    writeFileSync(join(dir, "v", ".slipbox", "config.toml"), '[trust]\nroots = ["/"]\n');
    const r = loadConfig({ configFile: user, vaultRoot: join(dir, "v") });
    expect(r.config.trust.roots).toEqual(["~/Projects/*"]);
    expect(r.warnings.some((w) => w.includes("sets [trust], which only your own config may set (a folder can't trust itself)"))).toBe(true);
    expect(r.warnings.some((w) => w.includes("trust.roots takes paths and globs"))).toBe(true);
  });

  test("your answers, as the TUI keeps them: trusted or kept safe, the nearest counting, read again when another slipbox wrote them; your config's list wins", () => {
    const dir = realpathSync(mkdtempSync(join(sandbox, "answers-")));
    const app = join(dir, "app");
    mkdirSync(join(app, "pkg"), { recursive: true });
    expect(trustOf(app, [])).toBeNull(); // not answered: the TUI may ask
    setTrust(app, "trusted");
    expect(trustOf(join(app, "pkg"), [])).toBe("trusted"); // inside it
    setTrust(join(app, "pkg"), "restricted");
    expect(trustOf(join(app, "pkg", "x.ts"), [])).toBe("restricted"); // the nearest answer
    expect(trustOf(app, [])).toBe("trusted");
    // Another slipbox answered: read again.
    writeFileSync(trustFile(), JSON.stringify({ trusted: [], restricted: [app] }));
    utimesSync(trustFile(), new Date(), new Date(Date.now() + 5000));
    expect(trustOf(app, [])).toBe("restricted");
    expect(trustOf(app, [app])).toBe("trusted"); // your config's list
    setTrust(app, null);
    expect(trustOf(app, [])).toBeNull();
  });

  test("markdownlint-cli2 in a root you don't trust (23.5): a file under a config that is code, or names code, isn't linted — said once", async () => {
    const root = mkdtempSync(join(sandbox, "mdl-trust-"));
    for (const [rel, text] of Object.entries({ "plain/a.md": "# A\n", "js/.markdownlint.cjs": "module.exports = {};\n", "js/deep/b.md": "# B\n", "rules/.markdownlint-cli2.jsonc": '{ "customRules": ["./rule.js"] }\n', "rules/c.md": "# C\n" })) {
      mkdirSync(join(root, rel, ".."), { recursive: true });
      writeFileSync(join(root, rel), text);
    }
    expect(lintLoadsCode(join(root, "plain/a.md"), root)).toBe(false);
    expect(lintLoadsCode(join(root, "js/deep/b.md"), root)).toBe(true);
    expect(lintLoadsCode(join(root, "rules/c.md"), root)).toBe(true);
    // A linter that names every file it's given: only the plain one reaches it.
    const fake = join(root, "fake-mdl");
    writeFileSync(fake, '#!/bin/sh\nfor f in "$@"; do echo "${f#:}:1 error MD041/first-line-heading First line"; done\nexit 1\n');
    chmodSync(fake, 0o755);
    const said: string[] = [];
    const files = ["plain/a.md", "js/deep/b.md", "rules/c.md"].map((f) => join(root, f));
    const got = await runLint({ argv: [fake], literal: true }, files, root, undefined, (t) => said.push(t));
    expect(got!.map((i) => i.file)).toEqual([join(root, "plain/a.md")]);
    expect(said).toEqual([`markdownlint-cli2 not run on 2 file(s): a markdownlint config there is code, or names code to load, and ${root} isn't a root you trust — [trust] roots in your config`]);
    await runLint({ argv: [fake], literal: true }, files, root, undefined, (t) => said.push(t));
    expect(said.length).toBe(1); // said once
    setTrustedRoots([root]);
    expect((await runLint({ argv: [fake], literal: true }, files, root))!.length).toBe(3);
  });
});

describe("the lint surface (3.21)", () => {
  test("markdownlint-cli2's lines read: path, line, column, rule and its name, what's wrong; the rest ignored", () => {
    const out = [
      "markdownlint-cli2 v0.23.3 (markdownlint v0.41.1)",
      "Summary: 3 issues in 2 files",
      'notes/a.md:14 error MD025/single-title/single-h1 Multiple top-level headings [Context: "T"]',
      "notes/a.md:3:121 error MD013/line-length Line length [Expected: 120; Actual: 138]",
      "/abs/b.md:7:1 warning MD029/ol-prefix Ordered list item prefix",
    ].join("\n");
    expect(parseLint(out, "/v")).toEqual([
      { file: "/abs/b.md", line: 7, column: 1, rule: "MD029", name: "ol-prefix", description: "Ordered list item prefix" },
      { file: "/v/notes/a.md", line: 3, column: 121, rule: "MD013", name: "line-length", description: "Line length [Expected: 120; Actual: 138]" },
      { file: "/v/notes/a.md", line: 14, column: null, rule: "MD025", name: "single-title", description: 'Multiple top-level headings [Context: "T"]' },
    ]);
  });

  test("which linter: off; auto only with a markdownlint config (yours, or the vault's); markdownlint-cli2 with yours unless the vault has its own — found as a server is, the vault's own first, else installed first (19.21); [lint] command as given", () => {
    setTrustedRoots([sandbox]); // a root you trust (23.x): the vault's own markdownlint-cli2 counts
    const home = mkdtempSync(join(sandbox, "home-"));
    const vault = mkdtempSync(join(sandbox, "vault-"));
    const cfg = (enabled: "auto" | "on" | "off", command: string[] = []) => ({ enabled, command });
    const install = "markdownlint-cli2@0.23.3";
    const was = process.env.PATH;
    process.env.PATH = "/usr/bin:/bin"; // never the machine's own
    try {
      expect(lintCommand(cfg("off"), vault, home)).toBeNull();
      expect(lintCommand(cfg("auto"), vault, home)).toBeNull(); // no config anywhere: markdownlint's defaults are no one's rules
      expect(lintCommand(cfg("on"), vault, home)).toEqual({ argv: [], literal: true, install });
      expect(lintCommand(cfg("on"), vault, home, false)).toEqual({ argv: ["markdownlint-cli2"], literal: true }); // installing off: it won't run, and says so
      const user = join(home, ".markdownlint-cli2.jsonc");
      writeFileSync(user, "{}");
      expect(lintCommand(cfg("auto"), vault, home)).toEqual({ argv: ["--config", user], literal: true, install });
      // The vault's own copy, a Node script: run on slipbox's Bun.
      const own = join(vault, "node_modules", ".bin", "markdownlint-cli2");
      mkdirSync(join(own, ".."), { recursive: true });
      writeFileSync(own, "#!/usr/bin/env node\n");
      chmodSync(own, 0o755);
      expect(lintCommand(cfg("auto"), vault, home)).toEqual({ argv: [process.execPath, "--config=/dev/null", "--no-env-file", own, "--config", user], literal: true, env: { BUN_BE_BUN: "1" } });
      writeFileSync(join(vault, ".markdownlint.json"), "{}");
      expect(lintCommand(cfg("auto"), vault, home)!.argv).toEqual([process.execPath, "--config=/dev/null", "--no-env-file", own]); // the vault's own config
      expect(lintCommand(cfg("auto", ["mdl", "--config", "~/mdl.json"]), vault, home)).toEqual({ argv: ["mdl", "--config", join(home, "mdl.json")], literal: false });
    } finally {
      process.env.PATH = was;
    }
  });

  test("markdownlint-cli2 installed into slipbox's own folder when first needed — once, however many runs ask — then run (19.21)", async () => {
    const pkg = mkdtempSync(join(sandbox, "fake-mdl-"));
    writeFileSync(join(pkg, "package.json"), JSON.stringify({ name: "fake-mdl", version: "1.0.0", bin: { "markdownlint-cli2": "bin.mjs" } }));
    writeFileSync(join(pkg, "bin.mjs"), "#!/usr/bin/env node\nfor (const f of process.argv.slice(2)) console.log(`${f.slice(1)}:1 error MD001/heading-increment Heard`);\nprocess.exit(1);\n");
    const v = mkdtempSync(join(sandbox, "lint-"));
    const said: string[] = [];
    const cmd = { argv: [], literal: true, install: `file:${pkg}` };
    const was = process.env.PATH;
    process.env.PATH = "/usr/bin:/bin";
    try {
      const [a, b] = await Promise.all([runLint(cmd, ["/v/a.md"], v, undefined, (t) => said.push(t)), runLint(cmd, ["/v/b.md"], v, undefined, (t) => said.push(t))]);
      expect(a).toMatchObject([{ file: "/v/a.md", line: 1, rule: "MD001", description: "Heard" }]);
      expect(b).toMatchObject([{ file: "/v/b.md" }]);
      expect(said).toEqual([`installing file:${pkg} into slipbox's own folder…`]);
      expect(existsSync(join(process.env.XDG_DATA_HOME!, "slipbox", "tools", "node_modules", ".bin", "markdownlint-cli2"))).toBe(true);
      // Installed: found there from then on, never installed again.
      expect(lintCommand({ enabled: "on", command: [] }, v)!.argv).toContain(realpathSync(join(process.env.XDG_DATA_HOME!, "slipbox", "tools", "node_modules", ".bin", "markdownlint-cli2")));
      // An install that fails: the linter doesn't run, and the next run tries again.
      const broken = { argv: [], literal: true, install: `file:${join(sandbox, "no-such-package")}` };
      expect(await runLint(broken, ["/v/a.md"], v, undefined, (t) => said.push(t))).toBeNull();
      expect(await runLint(broken, ["/v/a.md"], v, undefined, (t) => said.push(t))).toBeNull();
      expect(said.filter((t) => t.includes("no-such-package"))).toHaveLength(2);
    } finally {
      process.env.PATH = was;
    }
  });

  test("run: the files given (literal paths for markdownlint-cli2), the findings read; a linter that isn't there, or fails saying nothing, is null", async () => {
    const v = mkdtempSync(join(sandbox, "lint-"));
    const echo = { argv: ["sh", "-c", 'for f; do printf "%s:2 error MD001/heading-increment Heading levels\\n" "$f"; done; exit 1', "lint"], literal: false };
    expect(await runLint(echo, ["/v/a.md", "/v/b [x].md"], v)).toMatchObject([
      { file: "/v/a.md", line: 2, rule: "MD001" },
      { file: "/v/b [x].md", line: 2, rule: "MD001" },
    ]);
    const said = { argv: ["sh", "-c", 'printf "x.md:1 error MD001/said %s\\n" "$1"', "lint"], literal: true };
    expect((await runLint(said, ["/v/a[1].md"], v))![0]!.description).toBe(":/v/a[1].md"); // a literal path, never a glob
    expect(await runLint({ argv: ["no-such-linter-slipbox-test"], literal: false }, ["/v/a.md"], v)).toBeNull();
    expect(await runLint({ argv: ["sh", "-c", "exit 2"], literal: false }, ["/v/a.md"], v)).toBeNull();
  });
});

describe("the boundary check (0.3, scripts/check-boundary.ts)", () => {
  /** A tree of its own: the script copied into it (it checks the tree it sits in), and these files. */
  const check = (files: Record<string, string>) => {
    const top = mkdtempSync(join(sandbox, "boundary-"));
    mkdirSync(join(top, "scripts"));
    writeFileSync(join(top, "scripts", "check-boundary.ts"), readFileSync(join(import.meta.dir, "..", "scripts", "check-boundary.ts"), "utf8"));
    for (const [rel, text] of Object.entries(files)) {
      mkdirSync(join(top, rel, ".."), { recursive: true });
      writeFileSync(join(top, rel), text);
    }
    const r = Bun.spawnSync([process.execPath, join(top, "scripts", "check-boundary.ts")]);
    return { code: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString() };
  };

  test("a core file importing the TUI, a CLI file importing OpenTUI: each reported, the check fails", () => {
    const r = check({
      "src/core/deep/a.ts": 'import { App } from "../../tui/app.ts";\nexport const a = App;\n',
      "src/core/b.ts": 'export const b = () => import("../cli/cli.ts");\n',
      "src/cli/c.ts": 'import "@opentui/core";\nimport { a } from "../core/deep/a.ts";\n',
      "src/tui/app.ts": 'import "@opentui/core";\nexport const App = 1;\n',
    });
    expect(r.code).toBe(1);
    expect(r.err.split("\n").filter((l) => l.startsWith("  ")).map((l) => l.trim()).sort()).toEqual([
      "src/cli/c.ts: imports @opentui/core (src/cli must not import @opentui)",
      "src/core/b.ts: imports ../cli/cli.ts (src/core must not import src/cli)",
      "src/core/deep/a.ts: imports ../../tui/app.ts (src/core must not import src/tui)",
    ]);
    expect(r.out).not.toContain("boundary check ok");
  });

  test("a tree that keeps the rules passes: the core imported by the CLI, the TUI importing OpenTUI", () => {
    const r = check({
      "src/core/a.ts": 'import { join } from "node:path";\nexport const a = join;\n',
      "src/cli/c.ts": 'import { a } from "../core/a.ts";\nexport const c = a;\n',
      "src/tui/app.ts": 'import "@opentui/core";\nimport { a } from "../core/a.ts";\n',
      "src/tuition/t.ts": "export const t = 1;\n", // a folder whose name starts as the TUI's does: not the TUI
      "src/core/d.ts": 'import { t } from "../tuition/t.ts";\n',
    });
    expect(r.err).toBe("");
    expect(r.code).toBe(0);
    expect(r.out).toContain("boundary check ok");
  });
});

describe("documentation formats into one shape (24.4)", () => {
  const terms = (lines: string[], style: "jsdoc" | "docstring" | "block" = "docstring") => {
    const d = readDoc(lines, style);
    return { body: d.body.map((b) => b.text).join("\n"), tags: d.tags.map((t) => `${t.term}|${t.type}|${t.desc}|${t.line}`) };
  };
  const SAME = ["from||the note it's written in", "target|str|the link as written", "returns||the link, or None"];
  const same = (got: string[]) => expect(got.map((t) => t.split("|").slice(0, 3).join("|"))).toEqual(SAME);

  test("Google: Args, Returns; an entry's lines go on, indented", () => {
    const t = terms(["Resolves a link.", "", "Args:", "    from: the note it's written in", "    target (str): the link", "        as written", "", "Returns:", "    the link, or None"]);
    expect(t.body).toBe("Resolves a link.");
    same(t.tags);
    expect(t.tags[0]!.endsWith("|3")).toBe(true); // its line, for where it's drawn
  });

  test("NumPy: sections over dashes, an entry's name and type, what it is under it", () => {
    const t = terms(["Resolves a link.", "", "Parameters", "----------", "from", "    the note it's written in", "target : str", "    the link as written", "", "Returns", "-------", "Link", "    the link, or None"]);
    expect(t.body).toBe("Resolves a link.");
    expect(t.tags.map((x) => x.split("|").slice(0, 3).join("|"))).toEqual(["from||the note it's written in", "target|str|the link as written", "returns|Link|the link, or None"]);
  });

  test("reST: :param:, :type:, :returns:, :rtype:, :raises:; ``code`` and :role:`x` as markdown", () => {
    const t = terms(["Resolves a ``link`` (see :func:`reach`).", "", ":param from: the note it's written in", ":type from: Note", ":param str target: the link", "    as written", ":returns: the link, or None", ":rtype: Link", ":raises ValueError: when empty"]);
    expect(t.body).toBe("Resolves a `link` (see `reach`).");
    expect(t.tags.map((x) => x.split("|").slice(0, 3).join("|"))).toEqual(["from|Note|the note it's written in", "target|str|the link as written", "returns|Link|the link, or None", "raises|ValueError|when empty"]);
  });

  test("JSDoc: @param {T} name - what, @returns; a block comment is prose alone", () => {
    const t = terms(["Resolves a link.", "@param from - the note it's written in", "@param {str} target the link as written", "@returns the link, or None"], "jsdoc");
    expect(t.body).toBe("Resolves a link.");
    same(t.tags);
    expect(terms(["Some words", "@param x not a tag here"], "block").tags).toEqual([]);
  });
});

describe("indentation (25.1)", () => {
  test("found in a file's lines: tabs where more lines start with one, else the step spaces go in by; too few, nothing", async () => {
    const { detectIndent } = await import("../src/core/indent.ts");
    expect(detectIndent("func f() {\n\tx := 1\n\tif x {\n\t\ty()\n\t}\n}\n")).toEqual({ tabs: true, size: 4 });
    expect(detectIndent("def f():\n    x = 1\n    if x:\n        y()\n")).toEqual({ tabs: false, size: 4 });
    expect(detectIndent("a:\n  b:\n    c: 1\n  d: 2\n")).toEqual({ tabs: false, size: 2 });
    // A block comment's ` * ` is no step.
    expect(detectIndent("/**\n * Doc.\n * More.\n */\nfunction f() {\n  return 1;\n}\nif (x) {\n  y();\n}\n")).toEqual({ tabs: false, size: 2 });
    // Three doc comments' one-space steps outnumber the code's two: still no indentation.
    expect(detectIndent("/**\n * a\n */\nf() {\n  x;\n}\n/**\n * b\n */\n/**\n * c\n */\ng() {\n  y;\n}\n")).toEqual({ tabs: false, size: 2 });
    expect(detectIndent("one\ntwo\n")).toBeNull();
    expect(detectIndent("x\n  y\n")).toBeNull();
  });

  test("a language's own, by extension or name: Go and Makefiles tabs, Python and Rust four, the rest two", async () => {
    const { languageIndent } = await import("../src/core/indent.ts");
    expect(["/a/main.go", "/a/Makefile", "/a/rules.mk", "/a/app.py", "/a/lib.rs", "/a/index.ts", "/a/note.md"].map((p) => languageIndent(p))).toEqual([
      { tabs: true, size: 4 },
      { tabs: true, size: 4 },
      { tabs: true, size: 4 },
      { tabs: false, size: 4 },
      { tabs: false, size: 4 },
      { tabs: false, size: 2 },
      { tabs: false, size: 2 },
    ]);
  });

  test(".editorconfig's globs as the spec has them: a name alone anywhere, a path from its folder, *, **, ?, [], {a,b}, {1..3}", async () => {
    const { globRegex } = await import("../src/core/indent.ts");
    const m = (glob: string, path: string) => globRegex(glob).test(path);
    expect([m("*.md", "a.md"), m("*.md", "x/y/a.md"), m("*.md", "a.mdx"), m("*", "x/y")]).toEqual([true, true, false, true]);
    expect([m("*.{js,py}", "src/a.py"), m("*.{js,py}", "a.ts"), m("v{1..3}.txt", "v2.txt"), m("v{1..3}.txt", "v4.txt")]).toEqual([true, false, true, false]);
    expect([m("[ab].c", "a.c"), m("[!ab].c", "a.c"), m("[!ab].c", "z.c"), m("?.c", "ab.c"), m("a?b.c", "a/b.c"), m("a?b.c", "axb.c")]).toEqual([true, false, true, false, false, true]);
    // With a `/`: from the file's folder.
    expect([m("lib/**.js", "lib/x/y.js"), m("lib/**.js", "src/lib/y.js"), m("/top.txt", "top.txt"), m("/top.txt", "x/top.txt"), m("docs/*.md", "docs/a/b.md")]).toEqual([true, false, true, false, false]);
    expect([m("**/test/*.ts", "test/a.ts"), m("**/test/*.ts", "x/test/a.ts")]).toEqual([true, true]);
    expect(m("a\\*b", "a*b")).toBe(true);
  });

  test(".editorconfig read from the file's folder up, until root = true: nearer over farther, later sections over earlier", async () => {
    const { editorConfigFor, parseEditorConfig } = await import("../src/core/indent.ts");
    expect(parseEditorConfig("root = true\n# a comment\n[*]\nIndent_Style = Space ; why\n\n[*.go]\nindent_style=tab\n")).toEqual({
      root: true,
      sections: [
        { glob: "*", props: new Map([["indent_style", "space"]]) },
        { glob: "*.go", props: new Map([["indent_style", "tab"]]) },
      ],
    });
    const files: Record<string, string> = {
      "/home/.editorconfig": "[*]\nindent_size = 8\ninsert_final_newline = true\n",
      "/home/proj/.editorconfig": "root = true\n[*]\nindent_style = space\nindent_size = 4\n[*.md]\nindent_size = 2\n",
      "/home/proj/web/.editorconfig": "[*.ts]\nindent_size = 3\n",
    };
    const read = (p: string) => files[p] ?? null;
    expect(Object.fromEntries(editorConfigFor("/home/proj/web/a.ts", read))).toEqual({ indent_style: "space", indent_size: "3" });
    expect(Object.fromEntries(editorConfigFor("/home/proj/notes/a.md", read))).toEqual({ indent_style: "space", indent_size: "2" });
    // Outside the root one: home's.
    expect(Object.fromEntries(editorConfigFor("/home/other/a.ts", read))).toEqual({ indent_size: "8", insert_final_newline: "true" });
  });

  test("a file's indent: .editorconfig's, else its own lines', else its language's; a tab's width; what a save does", async () => {
    const { indentFor, indentUnit, saveRules } = await import("../src/core/indent.ts");
    const none = () => null;
    expect(indentFor("/p/a.go", "x\n", none)).toMatchObject({ tabs: true, size: 4, tabWidth: 4, from: "language" });
    expect(indentFor("/p/a.ts", "if (x) {\n    y();\n}\nif (z) {\n    w();\n}\n", none)).toMatchObject({ tabs: false, size: 4, from: "file" });
    const ec = (text: string) => (p: string) => (p === "/p/.editorconfig" ? text : null);
    expect(indentFor("/p/a.ts", "if (x) {\n    y();\n}\nz\n    w\n", ec("[*]\nindent_style = space\nindent_size = 2\n"))).toMatchObject({ tabs: false, size: 2, from: "editorconfig" });
    expect(indentFor("/p/a.ts", "x\n", ec("[*]\nindent_style = tab\ntab_width = 8\n"))).toMatchObject({ tabs: true, size: 8, tabWidth: 8 });
    expect(indentFor("/p/a.c", "x\n", ec("[*]\nindent_style = tab\nindent_size = tab\n"))).toMatchObject({ tabs: true, tabWidth: 4 });
    // A style said, its size not: the file's, else the language's.
    expect(indentFor("/p/a.py", "x\n", ec("[*]\nindent_style = space\n"))).toMatchObject({ tabs: false, size: 4, from: "editorconfig" });
    const saving = indentFor("/p/a.md", "x\n", ec("[*]\ntrim_trailing_whitespace = true\ninsert_final_newline = true\n"));
    expect([saving.trimTrailing, saving.finalNewline]).toEqual([true, true]);
    expect(saveRules("a  \nb\t\nc ", saving)).toBe("a\nb\nc\n");
    expect(saveRules("a \r\nb", saving)).toBe("a\r\nb\r\n");
    expect(saveRules("", saving)).toBe("");
    const asIs = indentFor("/p/a.md", "x\n", none);
    expect([asIs.trimTrailing, asIs.finalNewline, saveRules("a  \nb", asIs)]).toEqual([false, null, "a  \nb"]);
    expect([indentUnit({ ...asIs, tabs: true }), indentUnit({ ...asIs, tabs: false, size: 3 })]).toEqual(["\t", "   "]);
  });
});

describe("comments toggled (25.2)", () => {
  test("a language's markers: a line's in front, a block's around; none for JSON, CSV, a diff", async () => {
    const { commentStyle } = await import("../src/core/comments.ts");
    expect(["typescript", "python", "lua", "vim", "toml", "makefile"].map((l) => commentStyle(l))).toEqual([{ line: "//" }, { line: "#" }, { line: "--" }, { line: '"' }, { line: "#" }, { line: "#" }]);
    expect([commentStyle("css"), commentStyle("markdown"), commentStyle("xml")]).toEqual([
      { open: "/*", close: "*/" },
      { open: "<!--", close: "-->" },
      { open: "<!--", close: "-->" },
    ]);
    expect(["json", "csv", "diff", "text"].map((l) => commentStyle(l))).toEqual([null, null, null, null]);
  });

  test("commented at the least indentation, blank lines left; all commented, uncommented — the space after the marker too", async () => {
    const { toggleComments } = await import("../src/core/comments.ts");
    const s = { line: "//" };
    expect(toggleComments(["if (x) {", "  y();", "", "}"], s)).toEqual(["// if (x) {", "//   y();", "", "// }"]);
    expect(toggleComments(["  a();", "    b();"], s)).toEqual(["  // a();", "  //   b();"]);
    expect(toggleComments(["  // a();", "  //   b();", ""], s)).toEqual(["  a();", "    b();", ""]);
    expect(toggleComments(["//a", "// b"], s)).toEqual(["a", "b"]);
    // Some commented, some not: each commented, as vim-commentary does.
    expect(toggleComments(["// a", "b"], s)).toEqual(["// // a", "// b"]);
    expect(toggleComments(["\tx := 1"], s)).toEqual(["\t// x := 1"]);
    expect(toggleComments(["", "  "], s)).toBeNull();
  });

  test("a block's pair around each line, and taken off again", async () => {
    const { toggleComments } = await import("../src/core/comments.ts");
    const s = { open: "<!--", close: "-->" };
    expect(toggleComments(["# Title", "", "  text"], s)).toEqual(["<!-- # Title -->", "", "<!--   text -->"]);
    expect(toggleComments(["<!-- # Title -->", "", "<!--   text -->"], s)).toEqual(["# Title", "", "  text"]);
    expect(toggleComments(["<!--x-->"], s)).toEqual(["x"]);
  });
});

describe("brackets (25.3)", () => {
  test("the matching one: forward from an opening bracket, back from a closing one, past the nested pairs of its kind", async () => {
    const { matchBracket, bracketFrom } = await import("../src/core/brackets.ts");
    const t = "f(a, [b(c)], {d})";
    expect([matchBracket(t, 1), matchBracket(t, 16), matchBracket(t, 5), matchBracket(t, 7), matchBracket(t, 13)]).toEqual([16, 1, 10, 9, 15]);
    // Another kind between counts for nothing; unmatched, none; not a bracket, none.
    expect([matchBracket("( ] )", 0), matchBracket("((x)", 0), matchBracket("abc", 1)]).toEqual([4, -1, -1]);
    expect(matchBracket("{\n  x\n}", 0)).toBe(6);
    // Where % starts: at the cursor's bracket, else the line's next; none further than the line.
    expect([bracketFrom("ab(c)", 0), bracketFrom("ab(c)", 3), bracketFrom("ab\n(c)", 0)]).toEqual([2, 4, -1]);
  });

  test("pairs closed as typed: an opening bracket before a space, the end or a closing one; quotes not in a word; skips, backspace", async () => {
    const { autoPair, emptyPair } = await import("../src/core/brackets.ts");
    expect([autoPair("", 0, "("), autoPair("x y", 1, "["), autoPair("f)", 1, "{")]).toEqual(["()", "[]", "{}"]);
    // Before a word: as typed.
    expect(autoPair("word", 0, "(")).toBeNull();
    // A closing one already there: stepped over, nothing inserted; a quote too.
    expect([autoPair("()", 1, ")"), autoPair('""', 1, '"')]).toEqual(["", ""]);
    // An apostrophe in a word, a quote before one: as typed.
    expect([autoPair("don", 3, "'"), autoPair("x", 0, '"'), autoPair("say ", 4, "`")]).toEqual([null, null, "``"]);
    expect([emptyPair("()", 1), emptyPair("''", 1), emptyPair("(x)", 1), emptyPair("(]", 1)]).toEqual([true, true, false, false]);
  });
});

describe("replace across files: the lines it changes (25.4)", () => {
  test("a line's matches one edit; a match across a break, its lines one; numbered on from the last; a CRLF's \\r left out", async () => {
    const { lineEdits } = await import("../src/core/replace-files.ts");
    const { compilePattern, findAll } = await import("../src/core/replace.ts");
    const edits = (text: string, query: string, replacement: string, regex = false) =>
      lineEdits(text, findAll(text, compilePattern(query, { regex, whole: false }) as RegExp, 0, text.length, regex), replacement, regex);
    expect(edits("a x a\nno\nx a\n", "a", "b")).toEqual([
      { line: 1, before: "a x a", after: "b x b" },
      { line: 3, before: "x a", after: "x b" },
    ]);
    // Across a break: both lines, joined; the line after it numbered on.
    expect(edits("one\ntwo end\nthree\nlast end\n", "o end\\nth|t end", "X", true)).toEqual([
      { line: 2, before: "two end\nthree", after: "twXree" },
      { line: 4, before: "last end", after: "lasX" },
    ]);
    expect(edits("w\r\nk w\r\n", "w", "v")).toEqual([
      { line: 1, before: "w", after: "v" },
      { line: 2, before: "k w", after: "k v" },
    ]);
    // A replacement with a break in it, groups, an empty match inserting at each line's start.
    expect(edits("k=1\nj=2\n", "(\\w)=(\\d)", "$1:\n$2", true)).toEqual([
      { line: 1, before: "k=1", after: "k:\n1" },
      { line: 2, before: "j=2", after: "j:\n2" },
    ]);
    expect(edits("a\nb\n", "^", "> ", true)).toEqual([
      { line: 1, before: "a", after: "> a" },
      { line: 2, before: "b", after: "> b" },
    ]);
    // A match at the line's end (`$`, before its break) is the line's, with the others on it.
    expect(edits("a x \nb\n", "x|$", "y", true)).toEqual([
      { line: 1, before: "a x ", after: "a y y" },
      { line: 2, before: "b", after: "by" },
    ]);
    // On an empty line: its own number, the next line's after it.
    expect(edits("a\n\nb\n", "^", "> ", true)).toEqual([
      { line: 1, before: "a", after: "> a" },
      { line: 2, before: "", after: "> " },
      { line: 3, before: "b", after: "> b" },
    ]);
    // A later match on the line crossing a break takes the next line in too.
    expect(edits("a x\nb c\n", "a|x\\nb", "_", true)).toEqual([{ line: 1, before: "a x\nb c", after: "_ _ c" }]);
    // A match replaced by itself changes nothing: no edit.
    expect(edits("same\n", "same", "same")).toEqual([]);
  });
});

describe("spelling (25.6)", () => {
  const dir = () => mkdtempSync(join(tmpdir(), "slipbox-spell-"));

  test("a note's prose, word by word: not its front matter, code, addresses, wikilinks, tags, abbreviations or identifiers", async () => {
    const { proseWords } = await import("../src/core/spell.ts");
    const src = [
      "---",
      "title: Frontmatter wrods",
      "---",
      "# A headng",
      "",
      "Tehre is `inlnie` code, [a lnik](https://exmaple.com/pth) and <https://autolnik.com>, mail <a@bcdx.co>.",
      "A [[Wikilnik]] and #tagg; API, x86, snake_cse, camelCse, file.tss, src/coer and don't, Ankara'da.",
      "Mail kenjii@exmaple.org, see slipbox://reserch/notte.md and file:///hme/x, ![a pictre](p.png) $mathh$ <b>htmll</b>",
      "",
      "```js",
      "const misspeld = 1;",
      "```",
      "",
      "| Tabel | cell |",
      "| --- | --- |",
      "| celll | $mathh$ |",
      "",
    ].join("\n");
    const words = proseWords(parseMarkdown(src).tree, src);
    expect(words.map((w) => `${w.word}@${w.line}:${w.column}`)).toEqual([
      "headng@4:5",
      "Tehre@6:1",
      "is@6:7",
      "code@6:19",
      "lnik@6:28",
      "and@6:59",
      "mail@6:87",
      "and@7:16",
      "and@7:77",
      "don't@7:81",
      "Ankara'da@7:88",
      "Mail@8:1",
      "see@8:26",
      "and@8:57",
      "htmll@8:106",
      "Tabel@14:3",
      "cell@14:11",
      "celll@16:3",
    ]);
    // Each by its offset too.
    expect(words.every((w) => src.slice(w.from, w.to) === w.word)).toBe(true);
  });

  test("a language's dictionary: yours, else the system's for that very language, else slipbox's, else the system's for its base", async () => {
    const { dictionaryFiles } = await import("../src/core/spell.ts");
    const home = dir();
    const sys = dir();
    for (const n of ["tr_TR", "en_GB", "de_DE", "de_AT"]) {
      writeFileSync(join(sys, `${n}.aff`), "");
      writeFileSync(join(sys, `${n}.dic`), "");
    }
    // An .aff without its .dic is no dictionary.
    writeFileSync(join(sys, "pt_BR.aff"), "");
    mkdirSync(join(home, "d"));
    writeFileSync(join(home, "d", "mine.aff"), "");
    writeFileSync(join(home, "d", "mine.dic"), "");
    const yours = { fr: "~/d/mine.dic", it: join(home, "d", "mine"), es: "~/d/none.dic" };
    const at = (lang: string) => {
      const f = dictionaryFiles(lang, yours, [sys], home);
      return f && `${f.from}:${f.aff.startsWith(sys) ? f.aff.slice(sys.length + 1) : f.from === "slipbox" ? "bundled" : f.aff.slice(home.length + 1)}`;
    };
    expect([at("fr"), at("it"), at("fr-FR")]).toEqual(["yours:d/mine.aff", "yours:d/mine.aff", "yours:d/mine.aff"]);
    // tr-TR: the system's own; tr and en: slipbox's; en-GB: the system's; de: the system's first de_*.
    expect([at("tr-TR"), at("tr"), at("en"), at("en-GB"), at("en_US"), at("de")]).toEqual(["system:tr_TR.aff", "slipbox:bundled", "slipbox:bundled", "system:en_GB.aff", "slipbox:bundled", "system:de_AT.aff"]);
    // Yours not there: the rest as before; a language nobody has, none.
    expect([at("es"), at("xx"), at("pt-BR"), at("pt")]).toEqual([null, null, null, null]);
  });

  test("a dictionary in another encoding is read as UTF-8; one in UTF-8 as it is", async () => {
    const { asUtf8, openSpeller } = await import("../src/core/spell.ts");
    const latin = (s: string) => Uint8Array.from([...s].map((c) => (c === "ı" ? 0xfd : c === "ş" ? 0xfe : c.charCodeAt(0))));
    const aff = latin("SET ISO8859-9\nTRY abcı\n");
    const dic = latin("2\nkış\nkız\n");
    const out = asUtf8(aff, dic);
    expect(new TextDecoder().decode(out.aff)).toBe("SET UTF-8\nTRY abcı\n");
    expect(new TextDecoder().decode(out.dic)).toBe("2\nkış\nkız\n");
    const utf = new TextEncoder().encode("SET UTF-8\n");
    expect(asUtf8(utf, dic).aff).toBe(utf);
    // Opened, it knows its words as written.
    const d = dir();
    writeFileSync(join(d, "x.aff"), aff);
    writeFileSync(join(d, "x.dic"), dic);
    const s = await openSpeller({ aff: join(d, "x.aff"), dic: join(d, "x.dic"), from: "yours" });
    expect([s.correct("kış"), s.correct("kız"), s.correct("kiz")]).toEqual([true, true, false]);
  });

  test("slipbox's English and Turkish; your words put in as each opens; the languages a note names", async () => {
    const { addOwnWord, dictionaryFiles, noteLanguages, openSpeller, ownWords, ownWordsFile } = await import("../src/core/spell.ts");
    addOwnWord("Zorvexian");
    expect(ownWords()).toContain("Zorvexian");
    expect(ownWordsFile()).toBe(join(process.env.XDG_DATA_HOME!, "slipbox", "spell", "words.txt"));
    const en = await openSpeller(dictionaryFiles("en", {})!);
    expect([en.correct("receive"), en.correct("recieve"), en.correct("Zorvexian"), en.correct("don't")]).toEqual([true, false, true, true]);
    expect(en.suggest("recieve")[0]).toBe("receive");
    const tr = await openSpeller(dictionaryFiles("tr", {})!);
    expect([tr.correct("kitaplarımızdan"), tr.correct("evlerinzde"), tr.correct("Ankara'da")]).toEqual([true, false, true]);
    expect([noteLanguages({ lang: "tr" }, ["en"]), noteLanguages({ lang: "tr, en" }, ["en"]), noteLanguages({ lang: ["tr-TR", 3] }, ["en"]), noteLanguages({}, ["en"]), noteLanguages(null, ["de"])]).toEqual([
      ["tr"],
      ["tr", "en"],
      ["tr-TR"],
      ["en"],
      ["de"],
    ]);
  });

  test("your words: one a line, comments and blank lines left out; added at the end, a line of its own", async () => {
    const { addOwnWord, ownWords } = await import("../src/core/spell.ts");
    const f = join(dir(), "sub", "words.txt");
    expect(ownWords(f)).toEqual([]);
    addOwnWord("one", f);
    writeFileSync(f, `${readFileSync(f, "utf8")}# a comment\n\n  two  `);
    addOwnWord("three", f);
    expect(readFileSync(f, "utf8")).toBe("one\n# a comment\n\n  two  \nthree\n");
    expect(ownWords(f)).toEqual(["one", "two", "three"]);
  });

  test("a checker: any of its dictionaries knowing a word will do; each word asked once; suggestions in turn, ten at most", async () => {
    const { Checker } = await import("../src/core/spell.ts");
    const asked: string[] = [];
    const speller = (known: string[], sugg: string[]) => ({ correct: (w: string) => (asked.push(w), known.includes(w)), suggest: () => sugg, add: () => {} });
    const c = new Checker([speller(["bir", "don't"], ["a1", "a2", "x"]), speller(["one"], ["b1", "x", "b2", ...Array.from({ length: 9 }, (_, i) => `c${i}`)])]);
    expect([c.correct("bir"), c.correct("one"), c.correct("zzz"), c.correct("don’t")]).toEqual([true, true, false, true]);
    const before = asked.length;
    expect([c.correct("zzz"), c.correct("one")]).toEqual([false, true]);
    expect(asked.length).toBe(before); // known already
    expect(c.suggest("zzz")).toEqual(["a1", "b1", "a2", "x", "b2", "c0", "c1", "c2", "c3", "c4"]);
    const w = (word: string) => ({ word, line: 1, column: 1, from: 0, to: word.length });
    expect(c.misspelt([w("bir"), w("zzz"), w("one")]).map((x) => x.word)).toEqual(["zzz"]);
    // No dictionary: nothing is misspelt.
    expect(new Checker([]).correct("zzz")).toBe(true);
  });
});

describe("spelling, bundled (25.6)", () => {
  test("Hunspell from a bundle, as the compiled binary has it: its runtime called, a dictionary opened", () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-bundle-"));
    const entry = join(dir, "entry.ts");
    writeFileSync(
      entry,
      `import { dictionaryFiles, openSpeller } from ${JSON.stringify(join(import.meta.dir, "..", "src", "core", "spell.ts"))};\n` +
        `const s = await openSpeller(dictionaryFiles("en", {})!);\nconsole.log(s.correct("receive"), s.correct("recieve"));\n`,
    );
    const built = Bun.spawnSync([process.execPath, "build", entry, "--target", "bun", "--outdir", join(dir, "out")], { stderr: "pipe" });
    expect(built.exitCode).toBe(0);
    // Run where its files are: a bundle names them from there (a compiled binary has them inside it).
    const ran = Bun.spawnSync([process.execPath, join(dir, "out", "entry.js")], { cwd: join(dir, "out"), stderr: "pipe", env: { ...process.env } });
    expect(new TextDecoder().decode(ran.stderr)).toBe("");
    expect(new TextDecoder().decode(ran.stdout)).toBe("true false\n");
  }, 60000);
});

describe("commands run by your shell (25.7)", () => {
  test(":!cmd and its ranges parsed: '<,'>, %, ., a line, two; no command, none", async () => {
    const { parseBang } = await import("../src/core/shell.ts");
    expect(parseBang("!ls -la")).toEqual({ range: null, command: "ls -la" });
    expect(parseBang("  '<,'>!sort -u ")).toEqual({ range: "selection", command: "sort -u" });
    expect(parseBang("%!column -t")).toEqual({ range: "all", command: "column -t" });
    expect(parseBang(".!tr a-z A-Z")).toEqual({ range: "line", command: "tr a-z A-Z" });
    expect(parseBang("7!rev")).toEqual({ range: { from: 7, to: 7 }, command: "rev" });
    expect(parseBang("9, 3!sort")).toEqual({ range: { from: 3, to: 9 }, command: "sort" });
    expect([parseBang("!"), parseBang("%!  "), parseBang("w !sudo tee %"), parseBang("ls")]).toEqual([null, null, null, null]);
  });

  test("% is the file's path, quoted for the shell; \\% a percent; none without a file", async () => {
    const { expandPercent, shellQuote } = await import("../src/core/shell.ts");
    expect(shellQuote("it's here")).toBe(`'it'\\''s here'`);
    expect(expandPercent("wc -l % && echo 50\\%", "notes/a b.md")).toBe("wc -l 'notes/a b.md' && echo 50%");
    expect(expandPercent("echo 50\\%", null)).toBe("echo 50%");
    expect(expandPercent("cat %", null)).toBeNull();
  });

  test("run in a folder with your shell: its input, both streams as they came, its exit; stopped, what it started too", async () => {
    const { runShell } = await import("../src/core/shell.ts");
    const was = process.env.SHELL;
    process.env.SHELL = "/bin/sh";
    try {
      const dir = mkdtempSync(join(tmpdir(), "slipbox-shell-"));
      // Apart in time, so the order they came in is the one written.
      const r = await runShell("pwd; echo out; sleep 0.1; echo err >&2; sleep 0.1; echo $SLIPBOX_X; exit 3", { cwd: dir, env: { SLIPBOX_X: "x1" } }).done;
      expect(r).toMatchObject({ code: 3, signal: null, truncated: false });
      expect(r.output).toBe(`${realpathSync(dir)}\nout\nerr\nx1\n`);
      expect(r.stdout).toBe(`${realpathSync(dir)}\nout\nx1\n`);
      const sorted = await runShell("sort", { cwd: dir, input: "b\na\n" }).done;
      expect(sorted.stdout).toBe("a\nb\n");
      // A command that reads none of its input isn't an error.
      expect((await runShell("true", { cwd: dir, input: "x\n".repeat(100000) }).done).code).toBe(0);
      // Stopped: the shell and the sleep it started.
      const job = runShell("sleep 30 & sleep 30; echo never", { cwd: dir });
      await Bun.sleep(100);
      job.stop();
      const stopped = await job.done;
      expect(stopped.signal).toBe("SIGTERM");
      expect(stopped.output).toBe("");
      expect(stopped.ms).toBeLessThan(5000);
      // Your shell, as $SHELL names it: given -c and the command.
      const fake = join(dir, "fake-shell");
      writeFileSync(fake, '#!/bin/sh\necho "fake $1 $2"\n');
      chmodSync(fake, 0o755);
      process.env.SHELL = fake;
      expect((await runShell("echo hi", { cwd: dir }).done).output).toBe("fake -c echo hi\n");
      process.env.SHELL = "/bin/sh";
      // More than a window keeps: cut short, and said.
      const big = await runShell("head -c 3000000 /dev/zero | tr '\\0' x", { cwd: dir }).done;
      expect(big.truncated).toBe(true);
      expect(big.output.length).toBe(2 * 1024 * 1024);
    } finally {
      process.env.SHELL = was;
    }
  });
});

describe("a server's snippets (25.8)", () => {
  const ctx = { indent: "", unit: "  ", vars: { TM_FILENAME_BASE: "main", TM_SELECTED_TEXT: "" } };
  test("tab stops, placeholders (nested too), mirrors, $0 last; the end where there's none", async () => {
    const { expandSnippet } = await import("../src/core/snippet.ts");
    const s = expandSnippet("for (${1:i} = 0; $1 < ${2:n}; $1++) {$0}", ctx);
    // The mirrors given the placeholder's text.
    expect(s.text).toBe("for (i = 0; i < n; i++) {}");
    expect(s.stops).toEqual([
      { n: 1, ranges: [[5, 6], [12, 13], [19, 20]] },
      { n: 2, ranges: [[16, 17]] },
      { n: 0, ranges: [[25, 25]] },
    ]);
    // A mirror inside another stop's placeholder: filled, that placeholder grows around it.
    expect(expandSnippet("${1:f($2)} ${2:bb}", ctx)).toEqual({ text: "f(bb) bb", stops: [{ n: 1, ranges: [[0, 5]] }, { n: 2, ranges: [[6, 8], [2, 4]] }, { n: 0, ranges: [[8, 8]] }] });
    // A mirror before its placeholder: the placeholder still first, typed there.
    expect(expandSnippet("$1-${1:ab}", ctx)).toEqual({ text: "ab-ab", stops: [{ n: 1, ranges: [[3, 5], [0, 2]] }, { n: 0, ranges: [[5, 5]] }] });
    const nested = expandSnippet("f(${1:a, ${2:b}})", ctx);
    expect(nested).toEqual({ text: "f(a, b)", stops: [{ n: 1, ranges: [[2, 6]] }, { n: 2, ranges: [[5, 6]] }, { n: 0, ranges: [[7, 7]] }] });
    // Out of order in the text, in order of their numbers.
    expect(expandSnippet("${2:b}${1:a}", ctx).stops.map((x) => x.n)).toEqual([1, 2, 0]);
  });

  test("choices (the first put in), variables (a value, a default, else the name), escapes, transforms left out", async () => {
    const { expandSnippet } = await import("../src/core/snippet.ts");
    expect(expandSnippet("pick(${1|one,two,thr\\,ee|})", ctx)).toEqual({ text: "pick(one)", stops: [{ n: 1, ranges: [[5, 8]] }, { n: 0, ranges: [[9, 9]] }] });
    expect(expandSnippet("$TM_FILENAME_BASE ${TM_SELECTED_TEXT:x} ${NOPE:dflt} $NOPE2 ${UNSET}", ctx).text).toBe("main  dflt NOPE2 UNSET");
    expect(expandSnippet("a \\$1 \\} \\\\ $ ${", ctx).text).toBe("a $1 } \\ $ ${");
    expect(expandSnippet("${1/(.*)/${1:/upcase}/g} x", ctx)).toEqual({ text: " x", stops: [{ n: 1, ranges: [[0, 0]] }, { n: 0, ranges: [[2, 2]] }] });
  });

  test("each new line indented as the first's, a tab as the file indents", async () => {
    const { expandSnippet } = await import("../src/core/snippet.ts");
    const s = expandSnippet("if (${1:x}) {\n\t$0\n}", { ...ctx, indent: "    ", unit: "\t" });
    expect(s.text).toBe("if (x) {\n    \t\n    }");
    expect(s.stops).toEqual([{ n: 1, ranges: [[4, 5]] }, { n: 0, ranges: [[14, 14]] }]);
  });
});

describe("changes against what's staged (26.1)", () => {
  test("added, changed and deleted runs; signs by line, a deletion's on the line before it or the first", async () => {
    const { gitChanges, gitSigns, changeAt, changeDiff } = await import("../src/core/gitsigns.ts");
    const staged = "a\nb\nc\nd\ne\n";
    const changes = gitChanges(staged, "a\nB\nc\nnew\nd\n");
    expect(changes).toEqual([
      { kind: "change", from: 2, to: 2, wasAt: 1, was: ["b"], now: ["B"] },
      { kind: "add", from: 4, to: 4, wasAt: 3, was: [], now: ["new"] },
      { kind: "delete", from: 6, to: 5, wasAt: 4, was: ["e"], now: [] },
    ]);
    expect([...gitSigns(changes)]).toEqual([[2, "change"], [4, "add"], [5, "delete"]]);
    const top = gitChanges("x\na\n", "a\n");
    expect([...gitSigns(top)]).toEqual([[1, "topdelete"]]);
    expect([changeAt(changes, 5)?.kind, changeAt(changes, 4)?.kind, changeAt(changes, 3), changeAt(top, 1)?.kind]).toEqual(["delete", "add", null, "delete"]);
    expect(changeDiff(changes[0]!)).toBe("-b\n+B");
    // Line endings aren't changes; the line after a final newline is no line.
    expect(gitChanges("a\nb\n", "a\r\nb\r\n")).toEqual([]);
    expect(gitChanges("a\n", "a")).toEqual([]);
    // A file git doesn't have: every line added; an empty one, nothing.
    expect(gitChanges(null, "x\ny\n")).toEqual([{ kind: "add", from: 1, to: 2, wasAt: 0, was: [], now: ["x", "y"] }]);
    expect(gitChanges(null, "")).toEqual([]);
  });
});

describe("staging, from the source control view (26.2)", () => {
  const git = (cwd: string, ...args: string[]) => {
    const r = Bun.spawnSync(["git", "-c", "user.email=t@example.invalid", "-c", "user.name=t", "-C", cwd, ...args]);
    return new TextDecoder().decode(r.stdout);
  };
  const repo = (files: Record<string, string>) => {
    const root = mkdtempSync(join(tmpdir(), "slipbox-stage-"));
    for (const [rel, text] of Object.entries(files)) writeFileSync(join(root, rel), text);
    git(root, "init", "-q", "-b", "main");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "start");
    return root;
  };

  test("status entries with both letters; renames with where from; sections: conflicted, staged, unstaged, untracked", async () => {
    const { parseEntries, sections } = await import("../src/core/gitstage.ts");
    const entries = parseEntries("MM a.md\0A  b.md\0R  new.md\0old.md\0?? u.md\0UU c.md\0 D d.md\0");
    // Every pair a merge's conflict has; sorted by path within each section.
    const s2 = sections(parseEntries("AA x.md\0DU y.md\0UD w.md\0M  z.md\0M  m.md\0"));
    expect([s2.conflicted.map((e) => e.path), s2.staged.map((e) => e.path)]).toEqual([["w.md", "x.md", "y.md"], ["m.md", "z.md"]]);
    expect(entries).toEqual([
      { path: "a.md", x: "M", y: "M" },
      { path: "b.md", x: "A", y: " " },
      { path: "new.md", x: "R", y: " ", from: "old.md" },
      { path: "u.md", x: "?", y: "?" },
      { path: "c.md", x: "U", y: "U" },
      { path: "d.md", x: " ", y: "D" },
    ]);
    const s = sections(entries);
    expect([s.conflicted, s.staged, s.unstaged, s.untracked].map((l) => l.map((e) => e.path))).toEqual([["c.md"], ["a.md", "b.md", "new.md"], ["a.md", "d.md"], ["u.md"]]);
  });

  test("a commit message as git keeps it: # lines left out, blank lines around trimmed, runs of them one (26.3)", async () => {
    const { cleanMessage } = await import("../src/core/gitstage.ts");
    expect(cleanMessage("\nSubject\n\n\n\nbody\n# a guide\n#another\n\n")).toBe("Subject\n\nbody");
    expect(cleanMessage("# only guides\n\n")).toBe("");
    expect(cleanMessage("Fix #12 here\n")).toBe("Fix #12 here");
  });

  test("lines replaced in a text: its line breaks kept, its final one as it was, an empty text's lines ended", async () => {
    const { replaceLines } = await import("../src/core/gitstage.ts");
    expect(replaceLines("a\nb\nc\n", 1, 1, ["B", "B2"])).toBe("a\nB\nB2\nc\n");
    expect(replaceLines("a\r\nb\r\n", 2, 0, ["c"])).toBe("a\r\nb\r\nc\r\n");
    expect(replaceLines("a\nb", 0, 1, [])).toBe("b");
    expect(replaceLines("", 0, 0, ["x"])).toBe("x\n");
    expect(replaceLines("x\n", 0, 1, [])).toBe("");
  });

  test("a file staged, unstaged, discarded; all staged and unstaged; one change staged and unstaged, the others left", async () => {
    const { discardFile, stageAll, stageChange, stageFile, unstageAll, unstageChange, unstageFile } = await import("../src/core/gitstage.ts");
    const { gitChanges } = await import("../src/core/gitsigns.ts");
    const root = repo({ "a.md": "one\ntwo\nthree\nfour\n", "b.md": "b\n" });
    const c = { root };
    const staged = (p: string) => git(root, "show", `:${p}`);
    writeFileSync(join(root, "a.md"), "ONE\ntwo\nthree\nFOUR\n");
    // One change of two staged: the index has it, the other stays the working tree's alone.
    const changes = gitChanges(staged("a.md"), readFileSync(join(root, "a.md"), "utf8"));
    expect(changes.map((x) => x.from)).toEqual([1, 4]);
    expect(stageChange(c, "a.md", staged("a.md"), changes[1]!)).toBeNull();
    expect(staged("a.md")).toBe("one\ntwo\nthree\nFOUR\n");
    expect(git(root, "status", "--porcelain")).toBe("MM a.md\n");
    // Unstaged again: between the commit and the index, that change put back.
    const head = git(root, "show", "HEAD:a.md");
    expect(unstageChange(c, "a.md", staged("a.md"), gitChanges(head, staged("a.md"))[0]!)).toBeNull();
    expect(staged("a.md")).toBe("one\ntwo\nthree\nfour\n");
    // Whole files.
    expect(stageFile(c, "a.md")).toBeNull();
    expect(git(root, "status", "--porcelain")).toBe("M  a.md\n");
    expect(unstageFile(c, "a.md")).toBeNull();
    expect(git(root, "status", "--porcelain")).toBe(" M a.md\n");
    expect(discardFile(c, "a.md")).toBeNull();
    expect(readFileSync(join(root, "a.md"), "utf8")).toBe("one\ntwo\nthree\nfour\n");
    writeFileSync(join(root, "b.md"), "B\n");
    writeFileSync(join(root, "n.md"), "new\n");
    expect(stageAll(c)).toBeNull();
    expect(git(root, "status", "--porcelain")).toBe("M  b.md\nA  n.md\n");
    expect(unstageAll(c)).toBeNull();
    expect(git(root, "status", "--porcelain")).toBe(" M b.md\n?? n.md\n");
    // A failure says git's why.
    expect(discardFile(c, "nope.md")).toMatch(/nope\.md/);
    // A change staged in an executable file keeps its mode.
    writeFileSync(join(root, "run.sh"), "echo a\necho b\n");
    chmodSync(join(root, "run.sh"), 0o755);
    git(root, "add", "run.sh");
    git(root, "commit", "-q", "-m", "run");
    writeFileSync(join(root, "run.sh"), "echo A\necho b\n");
    expect(stageChange(c, "run.sh", staged("run.sh"), gitChanges(staged("run.sh"), "echo A\necho b\n")[0]!)).toBeNull();
    expect(git(root, "ls-files", "-s", "run.sh")).toStartWith("100755 ");
    // In a repository with no commit yet: unstaged by taking it out of the index.
    const fresh = mkdtempSync(join(tmpdir(), "slipbox-stage-"));
    git(fresh, "init", "-q", "-b", "main");
    writeFileSync(join(fresh, "f.md"), "f\n");
    git(fresh, "add", "f.md");
    expect(unstageFile({ root: fresh }, "f.md")).toBeNull();
    expect(git(fresh, "status", "--porcelain")).toBe("?? f.md\n");
  });
});

describe("blame and a file's history (26.4, 22.1)", () => {
  const git = (cwd: string, ...args: string[]) => new TextDecoder().decode(Bun.spawnSync(["git", "-c", "user.email=t@example.invalid", "-c", "user.name=Ann", "-C", cwd, ...args]).stdout);

  test("a line now, in the last commit: shifted by the changes before it; null where it's changed", async () => {
    const { lineInHead } = await import("../src/core/gitlog.ts");
    const head = "a\nb\nc\nd\n";
    const now = "new\na\nB\nc\nd\n";
    expect([1, 2, 3, 4, 5].map((n) => lineInHead(head, now, n))).toEqual([null, 1, null, 3, 4]);
    expect(lineInHead("a\nb\nc\n", "a\nc\n", 2)).toBe(3);
    // Line endings aren't changes.
    expect(lineInHead("a\r\nb\r\n", "a\nb\n", 2)).toBe(2);
  });

  test("blame of the last commit, the log followed through a rename, each commit's path then", async () => {
    const { blameLine, fileLog, messageOf } = await import("../src/core/gitlog.ts");
    const root = mkdtempSync(join(tmpdir(), "slipbox-log-"));
    git(root, "init", "-q", "-b", "main");
    writeFileSync(join(root, "old.md"), "one\ntwo\n");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "First", "-m", "The body.");
    git(root, "mv", "old.md", "new.md");
    git(root, "commit", "-q", "-m", "Renamed");
    writeFileSync(join(root, "new.md"), "one\nTWO\n");
    git(root, "commit", "-q", "-am", "Second line");
    const c = { root };
    const b1 = blameLine(c, "new.md", 1)!;
    expect([b1.author, b1.subject]).toEqual(["Ann", "First"]);
    expect(b1.time).toBeGreaterThan(1_700_000_000);
    expect(blameLine(c, "new.md", 2)!.subject).toBe("Second line");
    expect(messageOf(c, b1.hash)).toBe("First\n\nThe body.");
    const log = fileLog(c, "new.md")!;
    expect(log.map((x) => [x.subject, x.path])).toEqual([
      ["Second line", "new.md"],
      ["Renamed", "new.md"],
      ["First", "old.md"],
    ]);
    expect(blameLine(c, "nope.md", 1)).toBeNull();
    // Of the last commit, not the file on disk: a line put in at its top there moves nothing.
    writeFileSync(join(root, "new.md"), "uncommitted\none\nTWO\n");
    expect(blameLine(c, "new.md", 1)!.subject).toBe("First");
  });
});

describe("SQLite, the runtime's own (node:sqlite)", () => {
  test("statements; pragmas set and read; a transaction all or none; one inside another a savepoint", async () => {
    const { Database } = await import("../src/core/sqlite.ts");
    const db = new Database(":memory:");
    db.exec("create table t (id integer primary key, v text)");
    const ins = db.prepare("insert into t (v) values (?)");
    expect(Number(ins.run("a").lastInsertRowid)).toBe(1);
    expect(db.prepare("select v from t where id = ?").get(1)).toEqual({ v: "a" });
    expect(db.prepare("select v from t where id = ?").get(9)).toBeUndefined();
    db.pragma("user_version = 7");
    expect(db.pragma("user_version")).toBe(7);
    // Thrown out of: none of it.
    expect(() =>
      db.transaction(() => {
        ins.run("b");
        throw new Error("no");
      }),
    ).toThrow("no");
    expect(db.prepare("select count(*) as n from t").get()).toEqual({ n: 1 });
    // A failing inner one, caught: its own changes gone, the outer's kept.
    expect(
      db.transaction(() => {
        ins.run("c");
        try {
          db.transaction(() => {
            ins.run("d");
            throw new Error("inner");
          });
        } catch {}
        return "done";
      }),
    ).toBe("done");
    expect(db.prepare("select v from t order by id").all()).toEqual([{ v: "a" }, { v: "c" }]);
    // Both succeeding: both kept; the next transaction a transaction again.
    db.transaction(() => {
      ins.run("e");
      db.transaction(() => ins.run("f"));
    });
    db.transaction(() => ins.run("g"));
    expect(db.prepare("select v from t order by id").all()).toEqual([{ v: "a" }, { v: "c" }, { v: "e" }, { v: "f" }, { v: "g" }]);
    // FTS5 as the index has it, bm25 weighted.
    db.exec("create virtual table f using fts5(a, b, tokenize = 'unicode61 remove_diacritics 2')");
    db.prepare("insert into f values (?, ?)").run("Café crème", "x");
    expect((db.prepare("select bm25(f, 2.0, 1.0) as s from f where f match 'cafe'").all() as unknown[]).length).toBe(1);
    db.close();
  });
});

describe("where slipbox keeps things (14.9)", () => {
  test("Linux and macOS: XDG's folders under home, or the XDG_* set — a relative one ignored, as XDG says", () => {
    for (const platform of ["linux", "darwin"]) {
      const at = (kind: StoreKind, env: Record<string, string> = {}) => storeDir(kind, platform, env, "/home/u");
      expect([at("config"), at("cache"), at("state"), at("data")]).toEqual(["/home/u/.config/slipbox", "/home/u/.cache/slipbox", "/home/u/.local/state/slipbox", "/home/u/.local/share/slipbox"]);
      expect(at("cache", { XDG_CACHE_HOME: "/var/c" })).toBe("/var/c/slipbox");
      expect(at("data", { XDG_DATA_HOME: "rel/data" })).toBe("/home/u/.local/share/slipbox");
    }
  });
  test("Windows: the config in %APPDATA%, the rest in %LOCALAPPDATA% — a database never roams; an XDG_* set still taken", () => {
    const env = { APPDATA: "C:\\Users\\u\\AppData\\Roaming", LOCALAPPDATA: "C:\\Users\\u\\AppData\\Local" };
    const at = (kind: StoreKind, e: Record<string, string> = env) => storeDir(kind, "win32", e, "C:\\Users\\u");
    expect(at("config")).toBe("C:\\Users\\u\\AppData\\Roaming\\slipbox");
    expect([at("cache"), at("state"), at("data")]).toEqual(["cache", "state", "data"].map((k) => `C:\\Users\\u\\AppData\\Local\\slipbox\\${k}`));
    // Neither set: where Windows keeps them.
    expect([at("config", {}), at("state", {})]).toEqual(["C:\\Users\\u\\AppData\\Roaming\\slipbox", "C:\\Users\\u\\AppData\\Local\\slipbox\\state"]);
    expect(at("cache", { ...env, XDG_CACHE_HOME: "D:\\cache" })).toBe("D:\\cache\\slipbox");
    expect(at("cache", { ...env, XDG_CACHE_HOME: "cache" })).toBe("C:\\Users\\u\\AppData\\Local\\slipbox\\cache");
  });
  test("the cache is tagged for backup tools to skip (CACHEDIR.TAG); a tag already there is left as it is", () => {
    const dir = join(mkdtempSync(join(sandbox, "tag-")), "slipbox");
    expect(ensureCacheHome(dir)).toBe(dir);
    const tag = readFileSync(join(dir, "CACHEDIR.TAG"), "utf8");
    expect(tag.startsWith("Signature: 8a477f597d28d172789f06886806bc55")).toBe(true);
    const other = join(mkdtempSync(join(sandbox, "tag-")), "slipbox");
    mkdirSync(other);
    writeFileSync(join(other, "CACHEDIR.TAG"), "Signature: 8a477f597d28d172789f06886806bc55\n# someone else's\n");
    ensureCacheHome(other);
    expect(readFileSync(join(other, "CACHEDIR.TAG"), "utf8")).toEndWith("# someone else's\n");
  });
});
