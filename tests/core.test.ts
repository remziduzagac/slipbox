import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatEntry, formatRef, parseRef, scratchLocation } from "../src/core/capture.ts";
import { copyText } from "../src/core/clipboard.ts";
import { canonKey, Keymap, unknownModifiers } from "../src/core/commands.ts";
import { loadConfig } from "../src/core/config.ts";
import { LinkIndex } from "../src/core/links.ts";
import { newParseCache, parseMarkdown, visit } from "../src/core/parse.ts";
import { layoutToAnsi } from "../src/core/layout/ansi.ts";
import { renderMarkdown } from "../src/core/layout/render.ts";
import { layoutSource } from "../src/core/layout/source.ts";
import { expandTabs, sanitize } from "../src/core/sanitize.ts";
import { base16ToPalette, parseBase16 } from "../src/core/theme/base16.ts";
import { applyColorOverrides, listThemes, loadTheme, ROLES } from "../src/core/theme/index.ts";
import { glyphsFor } from "../src/core/glyphs.ts";
import { WriteRefused, writeNote } from "../src/core/fsutil.ts";
import { listTasks, toggleTask } from "../src/core/tasks.ts";
import { diffLines, merge3, unifiedDiff } from "../src/core/merge.ts";
import { compilePattern, expandReplacement, findAll, firstPerLine, parseSubstitute, replaceMatches } from "../src/core/replace.ts";
import { editorArgv, splitCommand } from "../src/core/editor.ts";
import { discoverNvims, nvimSockets } from "../src/core/nvim.ts";
import { graphemes, stringWidth, truncate } from "../src/core/width.ts";
import type { WikiLink } from "../src/core/wikilink.ts";

// Isolation (testing.md): never read or write the real config, cache or state directories.
const sandbox = mkdtempSync(join(tmpdir(), "slipbox-core-"));
process.env.XDG_STATE_HOME = join(sandbox, "state");
process.env.XDG_CACHE_HOME = join(sandbox, "cache");
process.env.XDG_CONFIG_HOME = join(sandbox, "config");
delete process.env.SLIPBOX_CONFIG; // it would win over XDG_CONFIG_HOME: never the developer's own config
process.env.SLIPBOX_CLIPBOARD = "file"; // copies never reach the developer's clipboard
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
    const src = "---\ntitle: x\n---\n# Head\n\n- [ ] task `code` [[link]]\n```ts\nconst a = 1;\n```\n";
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
    expect(roleAt(5, 20)).toBe("wikilink");
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
    expect(scratchLocation(root, cfg).path).not.toBe(join(root, "scratch.md"));
    rmSync(join(root, "scratch.md"));
    expect(scratchLocation(root, cfg).path).toBe(join(root, "scratch.md"));
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
  test("the switcher's fuzzy match is smart-case too", async () => {
    const { fuzzy } = await import("../src/tui/fuzzy.ts");
    expect(fuzzy("Tel", "telescope.md")).toBeNull();
    expect(fuzzy("tel", "Telescope.md")).not.toBeNull();
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
  });
  test("random documents parse in chunks exactly as whole", () => {
    let seed = 99;
    const rand = (n: number) => {
      seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
      return (seed >>> 8) % n;
    };
    const pieces = ["", "", "", "text", "more text", "# Head", "## Sub", "- item", "- [ ] task", "* star", "+ plus", "1. one", "2) two", "  - nested", "  continued", "    indented", "> quote", "> - quoted item", "```", "~~~", "<!-- c", "-->", "<div>", "</div>", "| a | b |", "| - | - |", "---", "===", "[ref]: /x", "[^n]: note", "see [ref] and [^n]", "\ttab", "- ", "<script>", "</script>", "lazy", "1.", "10. ten", "Title", "-----", "=====", "> > deep", ">", "<p>para</p>", "<span>", "<?php", "?>", "<![CDATA[", "]]>", "    [^n]: indented", "[^m]: m", "  more of note", "***", "- a\r", "text\r", "  | x |", "1) a", "3. c", "- - double", "#", "#notheading", "<!-- one line -->", "<style>", "</style>", "~~~~", "````", "[x]: <y> \"t\"", "[X]", "[^M]"];
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
  const fields = (tree: { children: unknown[] }) => tree.children.filter((n) => (n as { type: string }).type === "dataField") as { key: string; value: string; kind: string; comment: string | null; position: { start: { line: number }; end: { line: number } } }[];
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
    expect(parseData("yaml", "a: [1, 2\n").error).toBeTruthy();
  });
  test("INI and .env; CSV with quotes, doubled quotes and a newline in a field", async () => {
    const { parseData } = await import("../src/core/data.ts");
    const ini = parseData("ini", "; c\n[core]\nk = v ; tail\nexport X=1\n");
    expect(headings(ini.tree)).toEqual(["core"]);
    expect(fields(ini.tree).map((x) => [x.key, x.value, x.comment])).toEqual([
      ["k", "v", "tail"],
      ["X", "1", null],
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
    expect(md.linkAt("see [[alpha#Intro|the intro]] and [x](b.md)", 6)).toEqual({ kind: "wiki", target: "alpha", heading: "Intro", text: "the intro" });
    expect(md.linkAt("see [[alpha]] and [x](b.md)", 20)).toMatchObject({ kind: "markdown", target: "b.md" });
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
