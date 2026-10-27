import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeSandbox, makeVault, harness, rowText, type Harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("data files render as documents (16.11–16.14)", () => {
  const TOML =
    '# app settings\ntheme = "nord"   # the default\n\n[editor]\ncommand = "nvim"\nautosave_ms = 30000\n\n[ui]\nwrap = true\n';
  const setup = async () => {
    const root = makeVault();
    mkdirSync(join(root, "cfg"), { recursive: true });
    writeFileSync(join(root, "cfg", "app.toml"), TOML);
    writeFileSync(join(root, "people.yaml"), "team:\n  - name: Ada\n    role: lead\n  - name: Rosa\n    role: ops\n");
    writeFileSync(join(root, "to-config.md"), "# T\n\nThe [ui](cfg/app.toml#ui) section.\n");
    return root;
  };
  test("TOML opens rendered: sections as headings (outline, breadcrumb), keys lined up, comments dimmed", async () => {
    const root = await setup();
    const h = await harness({ root, open: "cfg/app.toml", width: 100 });
    const v = h.app.view!;
    expect(v.source).toBeFalsy();
    const layout = h.app.currentLayout(v);
    expect(layout.headings.map((x) => x.text)).toEqual(["editor", "ui"]);
    const f = h.frame();
    expect(f).toMatch(/theme\s+nord\s+# the default/);
    expect(f).toMatch(/command\s+nvim/);
    expect(f).toMatch(/autosave_ms\s+30000/);
    const row = layout.lines.find((l) => l.spans.some((s) => s.text.includes("the default")))!;
    expect(row.spans.find((s) => s.text.includes("the default"))!.role).toBe("syn_comment");
    await h.keys("space", "n", "v");
    expect(v.source).toBe(true); // source mode is a key away
    expect(h.frame()).toContain('theme = "nord"');
  });
  test("YAML: a list of records is a table; a link to a section of a data file lands there", async () => {
    const root = await setup();
    const h = await harness({ root, open: "people.yaml", width: 100 });
    const f = h.frame();
    expect(f).toMatch(/│ name\s+│ role\s+│/);
    expect(f).toMatch(/│ Rosa\s+│ ops\s+│/);
    await h.app.run("note.open to-config.md");
    const v = h.app.view!;
    const l = h.app.currentLayout(v).links[0]!;
    h.app.moveCursor(v, { row: l.line, col: l.col });
    await h.keys("enter");
    expect(v.buf.rel).toBe("cfg/app.toml");
    expect(rowText(h)).toContain("ui");
  });
  test("the lens edits one key; a parse error when insert ends goes to source mode, and back when fixed", async () => {
    const root = await setup();
    const h = await harness({ root, open: "cfg/app.toml", width: 100, config: (c) => (c.editor.edit_in = "live") });
    const v = h.app.view!;
    const row = h.app.currentLayout(v).lines.findIndex((x) => x.spans.some((s) => s.text.includes("autosave_ms")));
    h.app.moveCursor(v, { row, col: 2 });
    await h.keys("shift+a", "shift+a", "0", "escape"); // the lens, then typing in it
    expect(v.live).toBe(true);
    expect(v.buf.source).toContain("autosave_ms = 300000\n");
    // Break it: an unclosed string. Mid-typing the lens stays; leaving insert, source mode.
    await h.keys("shift+a", "space", "x", "=", "space", '"');
    expect(v.source).toBeFalsy();
    await h.keys("escape");
    h.frame();
    expect(v.source).toBe(true);
    expect(h.app.messages.some((m) => m.text.includes("doesn't parse"))).toBe(true);
    await h.keys("space", "n", "v"); // still broken: refused, with the error
    expect(v.source).toBe(true);
    await h.keys("u", "space", "n", "v"); // undone: it renders again
    expect(v.source).toBeFalsy();
  });
});

describe("YAML and JSON as a tree (16.12)", () => {
  test("guides at every depth; branches in the outline and breadcrumb; a $ref's JSON pointer followed", async () => {
    const root = makeVault();
    writeFileSync(
      join(root, "deploy.yaml"),
      "service: nightjar\ncontainers:\n  - name: api\n    health:\n      path: /v2/health\n      probe: {interval_s: 10}\n  - name: backup\nports: [8080]\n",
    );
    writeFileSync(
      join(root, "api.json"),
      '{\n  "paths": {\n    "/f": { "$ref": "#/components/schemas/Frame" }\n  },\n  "components": {\n    "schemas": {\n      "Other": { "type": "string" },\n      "Frame": { "type": "object" }\n    }\n  }\n}\n',
    );
    const h = await harness({ root, open: "deploy.yaml", width: 100 });
    const v = h.app.view!;
    const f = h.frame();
    expect(f).toMatch(/ containers\n.*├─ 1\n.*│  ├─ name  api/);
    expect(f).toMatch(/│  └─ health\n.*│     ├─ path   \/v2\/health/);
    expect(f).toMatch(/ ports\s+\[8080\]/); // a top-level key after the nested ones: at the top again
    expect(h.app.currentLayout(v).headings.map((x) => [x.level, x.text])).toEqual([
      [1, "containers"],
      [2, "1"],
      [3, "health"],
      [2, "2"],
    ]);
    h.app.moveCursor(v, { row: h.app.currentLayout(v).lines.findIndex((l) => l.src === 5), col: 0 });
    expect(h.frame()).toMatch(/containers\s*›\s*1\s*›\s*health/);
    // The lens holds a card — a key and the plain values under it — and moves card to card.
    const lens = () => /source · lines? (\d+(?:–\d+)?)/.exec(h.frame())?.[1] ?? "none";
    h.app.moveCursor(v, { row: h.app.currentLayout(v).lines.findIndex((x) => x.src === 4), col: 0 });
    await h.keys("space", "n", "l");
    expect(lens()).toBe("4–6"); // health, with path and probe
    await h.keys("j", "j", "j");
    expect(lens()).toBe("7"); // the second container
    await h.keys("escape", "escape");
    await h.app.run("note.open api.json");
    const l = h.app.currentLayout(v).links.find((x) => x.target.startsWith("#/"))!;
    h.app.moveCursor(v, { row: l.line, col: l.col });
    await h.keys("enter");
    expect(rowText(h)).toContain("Frame"); // the pointer's row, not "Other"
  });
});

describe("a data file that doesn't parse, opened (16.14)", () => {
  test("opens in source mode with its error said, once each time: at the start, by :e, from a link", async () => {
    const root = makeVault();
    writeFileSync(join(root, "bad.json"), '{"a": }\n');
    writeFileSync(join(root, "to-bad.md"), "# T\n\n[bad](bad.json)\n");
    const said = (h: Harness) => h.app.messages.filter((m) => m.text.includes("bad.json doesn't parse")).length;
    const h = await harness({ root, open: "bad.json" });
    const v = h.app.view!;
    expect(v.source).toBe(true);
    expect(said(h)).toBe(1);
    await h.app.run("note.open to-bad.md");
    expect(v.source).toBe(false); // a note renders again
    await h.app.run("note.open bad.json"); // :e takes a file's path too
    expect([v.buf.rel, v.source, said(h)]).toEqual(["bad.json", true, 2]);
    await h.app.run("history.back");
    const l = h.app.currentLayout(v).links[0]!;
    h.app.moveCursor(v, { row: l.line, col: l.col });
    await h.keys("enter");
    expect([v.buf.rel, v.source, said(h)]).toEqual(["bad.json", true, 3]);
  });
});
