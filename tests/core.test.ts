import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatEntry, formatRef, parseRef } from "../src/core/capture.ts";
import { Keymap } from "../src/core/commands.ts";
import { loadConfig } from "../src/core/config.ts";
import { LinkIndex } from "../src/core/links.ts";
import { parseMarkdown, visit } from "../src/core/parse.ts";
import { sanitize } from "../src/core/sanitize.ts";
import { base16ToPalette, parseBase16 } from "../src/core/theme/base16.ts";
import { listThemes, loadTheme, ROLES } from "../src/core/theme/index.ts";
import { glyphsFor } from "../src/core/glyphs.ts";
import { graphemes, stringWidth, truncate } from "../src/core/width.ts";
import type { WikiLink } from "../src/core/wikilink.ts";

// Isolation (testing.md): never read or write the real config, cache or state directories.
const sandbox = mkdtempSync(join(tmpdir(), "slipbox-core-"));
process.env.XDG_STATE_HOME = join(sandbox, "state");
process.env.XDG_CACHE_HOME = join(sandbox, "cache");
process.env.XDG_CONFIG_HOME = join(sandbox, "config");
afterAll(() => rmSync(sandbox, { recursive: true, force: true }));


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
});

describe("wikilink syntax", () => {
  const links = (src: string) => {
    const out: WikiLink[] = [];
    visit(parseMarkdown(src).tree, (n) => {
      if ((n.type as string) === "wikiLink") out.push(n as unknown as WikiLink);
    });
    return out;
  };
  test("targets, headings, blocks, aliases and embeds", () => {
    const [a, b, c, d] = links("[[Foo Bar|x]] ![[img.png]] [[n#Head]] [[n#^blk]]");
    expect(a).toMatchObject({ target: "Foo Bar", alias: "x", embed: false });
    expect(b).toMatchObject({ target: "img.png", embed: true });
    expect(c).toMatchObject({ target: "n", heading: "Head" });
    expect(d).toMatchObject({ target: "n", block: "blk" });
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
});

describe("config (0.9)", () => {
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
});
