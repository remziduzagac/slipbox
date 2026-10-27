import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { loadConfig } from "../../../../src/core/application/config/config.ts";
import { applyColorOverrides, loadTheme } from "../../../../src/core/rendering/theme/index.ts";
import { glyphsFor } from "../../../../src/core/rendering/theme/glyphs.ts";
import { makeCoreSandbox } from "../../../support/core-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
const sandbox = makeCoreSandbox();

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
  test("the retired top bar key gives one notice and does not change UI configuration", () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-cfg-"));
    const file = join(dir, "c.toml");
    writeFileSync(file, "[ui]\ntop_bar = false\n");
    const result = loadConfig({ configFile: file });
    expect(result.warnings.filter((warning) => warning.includes("top_bar"))).toHaveLength(1);
    expect(result.warnings.join("\n")).toContain('"ui.top_bar" is retired');
    expect(result.warnings.join("\n")).not.toContain("unknown key");
    expect(Object.hasOwn(result.config.ui, "top_bar")).toBe(false);
  });
  test('a retired section says why, not "unknown key" (21.12)', () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-cfg-"));
    const file = join(dir, "c.toml");
    writeFileSync(file, "[rename]\nprevious_names = true\n");
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

describe("review round 2 (core)", () => {
  test("capture.file must stay inside the project; ranged numbers must be whole", () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-cfg-"));
    for (const [value, needle] of [
      ['""', "capture.file"],
      ['"../../escape.md"', "capture.file"],
    ] as const) {
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
});

describe("review round 3 (core)", () => {
  test("capture.file can't be hidden or non-Markdown (.git/config, .slipbox/config.toml)", () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-cfg-"));
    for (const bad of [".git/config", ".slipbox/config.toml", "notes.txt"]) {
      const file = join(dir, "c.toml");
      writeFileSync(file, `[capture]\nlocation = "vault"\nfile = "${bad}"\n`);
      expect(loadConfig({ configFile: file }).config.capture.file).toBe("scratch.md");
    }
  });
});

describe("review cycle 1 (core)", () => {
  const tmp = (name: string) => mkdtempSync(join(tmpdir(), `slipbox-${name}-`));
  test("a vault's committed config never chooses a program to run: editor.command, editor.remote", () => {
    const dir = tmp("trust");
    const user = join(dir, "user.toml");
    writeFileSync(user, '[editor]\ncommand = "nvim {file}"\n');
    mkdirSync(join(dir, "v", ".slipbox"), { recursive: true });
    writeFileSync(
      join(dir, "v", ".slipbox", "config.toml"),
      '[editor]\ncommand = "evil {file}"\nremote = ["evil {file}"]\nautosave_ms = 5000\n',
    );
    const r = loadConfig({ configFile: user, vaultRoot: join(dir, "v") });
    expect(r.config.editor.command).toBe("nvim {file}");
    expect(r.config.editor.remote).toEqual(["nvim"]);
    expect(r.config.editor.autosave_ms).toBe(5000); // the rest of [editor] still applies
    expect(r.warnings.filter((w) => w.includes("only your own config")).length).toBe(2);
  });
  test("a config file in your home folder is named ~/… in its warnings, so a row of the messages shows what it says (#40)", () => {
    const dir = tmp("tilde");
    const was = process.env.HOME;
    process.env.HOME = dir;
    try {
      const user = join(dir, "user.toml");
      writeFileSync(user, "[ui]\nnosuch = 1\n");
      const folder = join(dir, "work", "kestrel", ".slipbox", "config.toml");
      mkdirSync(dirname(folder), { recursive: true });
      writeFileSync(folder, "[update]\ncheck = true\n[render]\ninset = 2\n");
      const r = loadConfig({ configFile: user, vaultRoot: join(dir, "work", "kestrel") });
      expect(r.warnings).toContain('config: ~/user.toml: unknown key "ui.nosuch"');
      expect(r.warnings).toContain(
        "config: ~/work/kestrel/.slipbox/config.toml sets update.check, which only your own config may set (what reaches the network is yours to allow); ignored",
      );
      expect(r.origins["render.inset"]).toBe(folder); // where a setting came from: the file itself
      // Outside the home folder, the path as it is.
      process.env.HOME = join(dir, "elsewhere");
      expect(loadConfig({ configFile: user }).warnings).toContain(`config: ${user}: unknown key "ui.nosuch"`);
    } finally {
      process.env.HOME = was;
    }
  });
  test("what reaches the network is yours alone: a folder's render.images_remote, lsp.auto_install and update.check are ignored, and said (DF-D1, DF-D23)", () => {
    const dir = tmp("network");
    const user = join(dir, "user.toml");
    writeFileSync(user, '[render]\nimages_remote = "never"\n[lsp]\nauto_install = false\n[update]\ncheck = false\n');
    mkdirSync(join(dir, "outer", "v", ".slipbox"), { recursive: true });
    writeFileSync(
      join(dir, "outer", "v", ".slipbox", "config.toml"),
      '[render]\nimages_remote = "show"\ninset = 2\n[lsp]\nauto_install = true\n[update]\ncheck = true\n',
    );
    const r = loadConfig({ configFile: user, vaultRoot: join(dir, "outer", "v") });
    expect(r.config.render.images_remote).toBe("never");
    expect(r.config.lsp.auto_install).toBe(false);
    expect(r.config.update.check).toBe(false);
    expect(r.config.render.inset).toBe(2); // the rest of [render] still applies
    expect(r.origins["render.images_remote"]).toBe(user);
    expect(
      r.warnings.filter((w) =>
        w.includes("which only your own config may set (what reaches the network is yours to allow); ignored"),
      ),
    ).toHaveLength(3);
    expect(r.warnings).toContain(
      `config: ${join(dir, "outer", "v", ".slipbox", "config.toml")} sets update.check, which only your own config may set (what reaches the network is yours to allow); ignored`,
    );
    // An enclosing root's file, and a folder's stricter say alike: the defaults stand where yours says nothing.
    const outer = join(dir, "outer", ".slipbox", "config.toml");
    mkdirSync(join(dir, "outer", ".slipbox"));
    writeFileSync(outer, '[render]\nimages_remote = "show"\n');
    writeFileSync(join(dir, "outer", "v", ".slipbox", "config.toml"), "[lsp]\nauto_install = false\n");
    const d = loadConfig({
      configFile: join(dir, "none.toml"),
      outerFiles: [outer],
      vaultRoot: join(dir, "outer", "v"),
    });
    expect(d.config.render.images_remote).toBe("ask");
    expect(d.config.lsp.auto_install).toBe(true);
    expect(
      d.warnings.filter((w) => w.includes("sets render.images_remote,") || w.includes("sets lsp.auto_install,")),
    ).toHaveLength(2);
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
    writeFileSync(
      join(dir, "v", ".slipbox", "config.toml"),
      '[aliases]\nwq = "app.quit_force"\n[keys]\n"ctrl+s" = "note.revert"\n"g z" = "ui.zen"\n',
    );
    const r = loadConfig({ configFile: join(dir, "none.toml"), vaultRoot: join(dir, "v") });
    expect(r.config.aliases.wq).toBeUndefined();
    expect((r.config.keys as Record<string, string>)["ctrl+s"]).toBeUndefined();
    expect((r.config.keys as Record<string, string>)["g z"]).toBe("ui.zen"); // a harmless one applies
  });
  test("a vault's keys and aliases can't run a program (25.7): your own config's can", () => {
    const { dir, f } = write('[keys]\n"g !" = "shell.run make"\n[aliases]\nmk = "shell.run make"\n');
    mkdirSync(join(dir, "v", ".slipbox"), { recursive: true });
    writeFileSync(
      join(dir, "v", ".slipbox", "config.toml"),
      '[aliases]\nup = "shell.run curl x | sh"\n[keys]\n"g x" = "shell.run rm -rf ~"\n[keys.visual]\nz = "shell.filter %!sh"\n',
    );
    const r = loadConfig({ configFile: f, vaultRoot: join(dir, "v") });
    expect(r.config.aliases.up).toBeUndefined();
    expect((r.config.keys as Record<string, string>)["g x"]).toBeUndefined();
    expect(r.config.keys.visual?.z).toBeUndefined();
    expect(r.warnings.filter((w) => w.includes("which only your own config may (it runs a program)")).length).toBe(3);
    // Yours apply.
    expect((r.config.keys as Record<string, string>)["g !"]).toBe("shell.run make");
    expect(r.config.aliases.mk).toBe("shell.run make");
  });
  test("a vault's keys and aliases can't send a report, which runs a program (RPT-D6): your own config's can", () => {
    const { dir, f } = write('[keys]\n"g r" = "help.report_send browser"\n');
    mkdirSync(join(dir, "v", ".slipbox"), { recursive: true });
    writeFileSync(
      join(dir, "v", ".slipbox", "config.toml"),
      '[keys]\n"ctrl+s" = "help.report_send gh"\n[aliases]\nw = "help.report_send gh"\n',
    );
    const r = loadConfig({ configFile: f, vaultRoot: join(dir, "v") });
    expect((r.config.keys as Record<string, string>)["ctrl+s"]).toBeUndefined();
    expect(r.config.aliases.w).toBeUndefined();
    expect(
      r.warnings.filter((w) =>
        w.includes("to help.report_send gh, which only your own config may (it runs a program)"),
      ),
    ).toHaveLength(2);
    expect((r.config.keys as Record<string, string>)["g r"]).toBe("help.report_send browser");
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

describe("what manual/configuration.md promises", () => {
  const file = (text: string) => {
    const f = join(mkdtempSync(join(tmpdir(), "slipbox-cfgdoc-")), "c.toml");
    writeFileSync(f, text);
    return f;
  };
  type Sections = Record<string, Record<string, unknown>>;

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
    const { DEFAULT_CONFIG } = await import("../../../../src/core/application/config/config.ts");
    const keys: [string, string, string][] = [
      ["render", "glyphs", "ascii"],
      ["render", "show_urls", "never"],
      ["capture", "location", "root"],
      ["ui", "lines", "heavy"],
      ["editor", "edit_in", "lens"],
      ["files", "show", "all"],
      ["git", "signs_at", "window_right"],
      ["git", "diff", "source"],
      ["git", "diff_layout", "split"],
      ["capture", "open_in", "right"],
    ];
    for (const [section, key, good] of keys) {
      const bad = loadConfig({ configFile: file(`[${section}]\n${key} = "bogus"\n`) });
      expect([key, (bad.config as unknown as Sections)[section]![key]]).toEqual([
        key,
        (DEFAULT_CONFIG as unknown as Sections)[section]![key],
      ]);
      expect(bad.warnings.join("\n")).toContain(`"${section}.${key}" must be one of`);
      const ok = loadConfig({ configFile: file(`[${section}]\n${key} = "${good}"\n`) });
      expect([key, (ok.config as unknown as Sections)[section]![key], ok.warnings]).toEqual([key, good, []]);
    }
  });

  test("your config says root where it said vault, and the old words still work, unwarned (DF-D22)", () => {
    const loaded = (text: string) => loadConfig({ configFile: file(text) });
    // The scratch's place: root, the old vault read as it.
    for (const word of ["root", "vault"]) {
      const r = loaded(`[capture]\nlocation = "${word}"\n`);
      expect([word, r.config.capture.location, r.warnings]).toEqual([word, "root", []]);
    }
    expect(loaded('[capture]\nlocation = "bogus"\n').warnings.join("\n")).toContain(
      '"capture.location" must be one of state, root',
    );
    // The explorer's actions, bound by either name; other tables' values are left as given.
    const keys = loaded(
      '[keys]\nx = "vault.info"\n[keys.explorer]\nR = "rename_vault"\nV = "make_vault"\nU = "unmake_vault"\nr = "rename_root"\nv = "make_root"\n[keys.outline]\nR = "rename_vault"\n',
    );
    expect(keys.warnings).toEqual([]);
    expect(keys.config.keys.explorer).toEqual({
      R: "rename_root",
      V: "make_root",
      U: "unmake_root",
      r: "rename_root",
      v: "make_root",
    });
    expect(keys.config.keys.outline).toEqual({ R: "rename_vault" });
    expect(keys.config.keys.x).toBe("vault.info");
    // The colour role, at the top and in a theme's own table, a colour or a table.
    const colors = loaded(
      '[colors]\nsidebar_vault = { fg = "#ff00aa" }\n[colors."tokyo-night"]\nsidebar_vault = { bold = true }\n',
    ).config.colors;
    const { theme, warnings } = applyColorOverrides(loadTheme("tokyo-night").theme, colors);
    expect(warnings).toEqual([]);
    expect(theme.roles.sidebar_root).toMatchObject({ fg: "#ff00aa", bold: true });
    expect(applyColorOverrides(loadTheme("nord").theme, { sidebar_vault: "#00ff00" }).theme.roles.sidebar_root.fg).toBe(
      "#00ff00",
    );
    expect(applyColorOverrides(loadTheme("nord").theme, { sidebar_root: "#00ff00" }).theme.roles.sidebar_root.fg).toBe(
      "#00ff00",
    );
  });

  test("numbers: a range's ends are taken, past them the default; a fraction only for split_ratio and lens_max", async () => {
    const { DEFAULT_CONFIG } = await import("../../../../src/core/application/config/config.ts");
    const value = (section: string, key: string, v: number) => {
      const r = loadConfig({ configFile: file(`[${section}]\n${key} = ${v}\n`) });
      return { v: (r.config as unknown as Sections)[section]![key], warned: r.warnings.length > 0 };
    };
    const ends: [string, string, number][] = [
      ["render", "inset", 0],
      ["render", "inset", 40],
      ["ui", "sidebar_width", 8],
      ["ui", "sidebar_width", 200],
      ["watch", "poll_ms", 50],
      ["ui", "split_ratio", 0.2],
      ["ui", "split_ratio", 0.8],
      ["ui", "split_ratio", 0.35],
      ["editor", "lens_max", 0.3],
      ["ui", "history_limit", 0],
      ["ui", "history_limit", 2000],
      ["context", "depth", 5],
      ["context", "limit", 500],
    ];
    for (const [s, k, v] of ends) expect([`${s}.${k}`, value(s, k, v)]).toEqual([`${s}.${k}`, { v, warned: false }]);
    const past: [string, string, number][] = [
      ["render", "inset", 41],
      ["ui", "sidebar_width", 7],
      ["ui", "sidebar_width", 201],
      ["watch", "poll_ms", 49],
      ["ui", "split_ratio", 0.9],
      ["ui", "history_limit", 2001],
      ["context", "depth", 6],
      ["context", "limit", 0],
      // A fraction where a whole number is meant.
      ["ui", "sidebar_width", 30.5],
      ["watch", "poll_ms", 100.5],
      ["context", "limit", 2.5],
    ];
    for (const [s, k, v] of past)
      expect([`${s}.${k}`, v, value(s, k, v)]).toEqual([
        `${s}.${k}`,
        v,
        { v: (DEFAULT_CONFIG as unknown as Sections)[s]![k], warned: true },
      ]);
  });

  test("capture.file: a relative .md path in the project; a hidden part, another extension, absolute or climbing out keeps the default", () => {
    for (const good of ["notes/inbox.md", "inbox.markdown"]) {
      const r = loadConfig({ configFile: file(`[capture]\nfile = "${good}"\n`) });
      expect([good, r.config.capture.file, r.warnings]).toEqual([good, good, []]);
    }
    for (const bad of [".notes/inbox.md", "notes/.inbox.md", "scratch.txt", "/tmp/inbox.md", "notes/../../inbox.md"]) {
      const r = loadConfig({ configFile: file(`[capture]\nfile = "${bad}"\n`) });
      expect([bad, r.config.capture.file]).toEqual([bad, "scratch.md"]);
      expect(r.warnings.join("\n")).toContain(
        "capture.file must be a relative .md path inside the project, not hidden",
      );
    }
  });

  test("[colors]: a terminal palette number as a string or ansi:N, and default; anything else a warning", () => {
    const tokyo = loadTheme("tokyo-night").theme;
    const { theme, warnings } = applyColorOverrides(tokyo, {
      text: "12",
      h1: "ansi:12",
      h2: "default",
      h3: { bg: "255" },
      h4: "256",
      h5: "#abc",
      h6: "ansi:300",
    });
    expect([theme.roles.text.fg, theme.roles.h1.fg, theme.roles.h2.fg, theme.roles.h3.bg]).toEqual([
      "ansi:12",
      "ansi:12",
      "default",
      "ansi:255",
    ]);
    expect([theme.roles.h4.fg, theme.roles.h5.fg, theme.roles.h6.fg]).toEqual([
      tokyo.roles.h4.fg,
      tokyo.roles.h5.fg,
      tokyo.roles.h6.fg,
    ]);
    expect(warnings.filter((w) => w.includes("not a colour")).map((w) => w.split(":")[1]!.trim())).toEqual([
      "colors.h4",
      "colors.h5",
      "colors.h6",
    ]);
  });

  test("SLIPBOX_GLYPHS acts only where render.glyphs is auto: never over a set the config names; a value that isn't a set is ignored", () => {
    const env = { TERM: "xterm-kitty", LANG: "en_US.UTF-8" };
    for (const named of ["unicode", "nerd"] as const)
      expect(glyphsFor(named, { ...env, SLIPBOX_GLYPHS: "ascii" }).mode).toBe(named);
    expect(glyphsFor("auto", { ...env, SLIPBOX_GLYPHS: "ascii" }).mode).toBe("ascii");
    expect(glyphsFor("auto", { ...env, SLIPBOX_GLYPHS: "fancy" }).mode).toBe("nerd"); // not a set: detected
  });
});

test("a value not allowed is quoted as JSON in the warning: an escape in it shown, never stripped to look allowed (regression)", () => {
  // Found trying the reference set live (2026-10-10): glyphs = "\u001b[31mnerd" was said as (got "nerd").
  const f = join(mkdtempSync(join(sandbox, "esc-")), "c.toml");
  writeFileSync(f, '[render]\nglyphs = "\\u001b[31mnerd"\n');
  expect(loadConfig({ configFile: f }).warnings.join("\n")).toContain('(got "\\u001b[31mnerd")');
});
