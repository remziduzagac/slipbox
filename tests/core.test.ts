import { afterAll, describe, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatEntry, formatRef, parseRef, scratchLocation } from "../src/core/capture.ts";
import { copyText } from "../src/core/clipboard.ts";
import { canonKey, Keymap, unknownModifiers } from "../src/core/commands.ts";
import { loadConfig } from "../src/core/config.ts";
import { LinkIndex } from "../src/core/links.ts";
import { parseMarkdown, visit } from "../src/core/parse.ts";
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
