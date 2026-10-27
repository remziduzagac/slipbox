import { describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Config } from "../../../../src/core/application/config/config.ts";
import type { ListOverlay } from "../../../../src/tui/app/runtime/app.ts";
import { makeSandbox, makeVault, harness, type Harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
const sandbox = makeSandbox();

describe("what a code file's server changes (19.15)", () => {
  const served = (c: Config) => {
    const launcher = join(sandbox, "fake-ls-launcher-2");
    writeFileSync(
      launcher,
      `#!/usr/bin/env node\nawait import(${JSON.stringify(join(import.meta.dir, "../../../fixtures", "fake-lsp.ts"))});\n`,
    );
    c["language-server"] = { fake: { command: launcher, args: ["--stdio"] } };
    c.language = [{ name: "fake", "file-types": ["fk"], "language-servers": ["fake"] }];
  };
  const until = async (ok: () => boolean, ms = 25_000) => {
    for (const t = Date.now(); !ok() && Date.now() - t < ms; ) await Bun.sleep(20);
    return ok();
  };
  const ready = async (h: Harness) => {
    h.app.languages.startServers();
    h.frame();
    expect(await until(() => (h.frame(), h.app.languages.servers!.list()[0]?.state === "running"))).toBe(true);
  };

  test("inserts at one place are made in the edit's order, as the preview shows them", async () => {
    const { TextDocument } = await import("vscode-languageserver-textdocument");
    const root = makeVault();
    writeFileSync(join(root, "x.py"), "print(1)\n");
    const h = await harness({ root, open: "index.md" });
    const at = { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } };
    const edits = [
      { range: at, newText: "import a\n" },
      { range: at, newText: "import b\n" },
    ];
    const preview = TextDocument.applyEdits(TextDocument.create("", "", 0, "print(1)\n"), edits);
    expect(h.app.languages.applyWorkspaceEdit({ changes: { [`file://${join(root, "x.py")}`]: edits } })).toEqual({
      files: 1,
      edits: 2,
    });
    expect(preview).toBe("import a\nimport b\nprint(1)\n");
    expect(h.app.buffer("x.py")!.source).toBe(preview);
    expect(readFileSync(join(root, "x.py"), "utf8")).toBe(preview); // no window shows it: saved
  });

  test("a character past its line's end is the line's end, as the preview has it — the lines after kept", async () => {
    const root = makeVault();
    writeFileSync(join(root, "code.txt"), "short\nkeep this line\nand this\n");
    const h = await harness({ root, open: "index.md" });
    const edits = [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 100 } }, newText: "SHORT" }];
    expect(h.app.languages.applyWorkspaceEdit({ changes: { [`file://${join(root, "code.txt")}`]: edits } })).toEqual({
      files: 1,
      edits: 1,
    });
    expect(readFileSync(join(root, "code.txt"), "utf8")).toBe("SHORT\nkeep this line\nand this\n");
  });

  test("space c r: the symbol renamed everywhere the server says, after a preview; a file no window shows is saved", async () => {
    const root = makeVault();
    writeFileSync(join(root, "a.fk"), "REF one REF\n");
    writeFileSync(join(root, "other.fk"), "REF there\n");
    const h = await harness({ root, open: "a.fk", config: served });
    await ready(h);
    await h.keys("space", "c", "r");
    expect(await until(() => h.app.overlay?.kind === "prompt")).toBe(true);
    const p = h.app.overlay as import("../../../../src/tui/app/runtime/app.ts").PromptOverlay;
    expect(p.text).toBe("REF");
    p.text = "NAME";
    await h.keys("enter");
    expect(await until(() => h.app.overlay?.kind === "list")).toBe(true);
    const list = h.app.overlay as ListOverlay;
    expect(list.title).toStartWith("rename REF → NAME: 2 changes in 2 files");
    expect(list.items.map((i) => i.label)).toEqual(["a.fk:1", "other.fk:1"]);
    await h.keys("enter");
    expect(h.app.view!.buf.source).toBe("NAME one NAME\n");
    expect(h.app.view!.buf.dirty).toBe(true); // shown: left for its saving
    expect(readFileSync(join(root, "other.fk"), "utf8")).toBe("NAME there\n"); // not shown: saved
    expect(readFileSync(join(root, "a.fk"), "utf8")).toBe("REF one REF\n");
    await h.app.languages.servers!.stopAll();
  });

  test("space c a: the server's fixes for the line's problems — its edit made, its command run (asking for an edit), resolved late", async () => {
    const root = makeVault();
    writeFileSync(join(root, "a.fk"), "BAD here BAD\n");
    const h = await harness({ root, open: "a.fk", config: served });
    await ready(h);
    expect(await until(() => (h.frame(), h.app.problems.ofView(h.app.view!).length === 1))).toBe(true); // a problem a line
    const pick = async (title: string) => {
      await h.keys("space", "c", "a");
      expect(await until(() => h.app.overlay?.kind === "list")).toBe(true);
      const list = h.app.overlay as ListOverlay;
      const i = list.items.findIndex((x) => x.label === title);
      expect(i).toBeGreaterThanOrEqual(0);
      for (let k = 0; k < i; k++) await h.keys("down");
      await h.keys("enter");
    };
    await h.keys("space", "c", "a");
    expect(await until(() => h.app.overlay?.kind === "list")).toBe(true);
    expect((h.app.overlay as ListOverlay).items[0]!.label).toBe("Replace BAD with GOOD"); // the preferred first
    await h.keys("escape");
    await pick("Replace BAD with GOOD");
    expect(h.app.view!.buf.source).toBe("GOOD here BAD\n");
    await pick("Fix all (a command)");
    expect(await until(() => h.app.view!.buf.source === "GOOD here FIXED\n")).toBe(true);
    await pick("Lazy fix");
    expect(await until(() => h.app.view!.buf.source === "LAZY GOOD here FIXED\n")).toBe(true);
    await h.app.languages.servers!.stopAll();
  });

  test("space c f: formatted as the server formats it, one undo step", async () => {
    const root = makeVault();
    writeFileSync(join(root, "a.fk"), "a  b   c\nd    e\n");
    const h = await harness({ root, open: "a.fk", config: served });
    await ready(h);
    await h.keys("space", "c", "f");
    expect(await until(() => h.app.view!.buf.source === "a b c\nd e\n")).toBe(true);
    await h.keys("u");
    expect(h.app.view!.buf.source).toBe("a  b   c\nd    e\n");
    await h.app.languages.servers!.stopAll();
  });

  test("space c f: the server asked to format with the file's own indentation — its .editorconfig, else its lines", async () => {
    const root = makeVault();
    writeFileSync(join(root, "four.fk"), "f {\n    a  b\n    c\n}\n");
    writeFileSync(join(root, "tabs.fk"), "f {\n\ta  b\n\tc\n}\n");
    mkdirSync(join(root, "said"));
    writeFileSync(join(root, "said", ".editorconfig"), "[*.fk]\nindent_style = space\nindent_size = 3\n");
    writeFileSync(join(root, "said", "three.fk"), "f {\n    a  b\n    c\n}\n");
    const asked: unknown[] = [];
    const formatted = async (file: string) => {
      const h = await harness({ root, open: file, config: served });
      await ready(h);
      // What the client asks the server, at the request it builds.
      const s = h.app.languages.servers!;
      const request = s.request.bind(s);
      s.request = ((path, method, params, capability, feature) => {
        if (method === "textDocument/formatting") asked.push((params as { options: unknown }).options);
        return request(path, method, params, capability, feature);
      }) as typeof s.request;
      await h.keys("space", "c", "f");
      expect(await until(() => !h.app.view!.buf.source.includes("  b"))).toBe(true);
      await s.stopAll();
    };
    await formatted("four.fk");
    await formatted("tabs.fk");
    await formatted("said/three.fk");
    expect(asked).toEqual([
      { tabSize: 4, insertSpaces: true }, // its lines: four spaces, not a fixed 2
      { tabSize: 4, insertSpaces: false }, // tabs, as wide as a tab shows
      { tabSize: 3, insertSpaces: true }, // its .editorconfig, over its lines
    ]);
  });
});
