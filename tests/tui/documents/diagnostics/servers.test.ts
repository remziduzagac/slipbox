import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Config } from "../../../../src/core/application/config/config.ts";
import type { ListOverlay } from "../../../../src/tui/app/runtime/app.ts";
import { makeSandbox, makeVault, harness, statusRow, type Harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
const sandbox = makeSandbox();

describe("language servers in the TUI (19.1, 19.8)", () => {
  /** A made-up language served by the fake server, as the user's config would name one. */
  const served = (c: Config) => {
    const launcher = join(sandbox, "fake-ls-launcher");
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

  test("a file's server is told when it's shown, again after typing pauses; its problems join the file's", async () => {
    const root = makeVault();
    writeFileSync(join(root, "a.fk"), "fine\nBAD here\n");
    const h = await harness({ root, open: "a.fk", config: served });
    h.app.languages.startServers();
    h.frame(); // shown: opened in its server
    const buf = h.app.view!.buf;
    expect(await until(() => h.app.problems.ofView(h.app.view!).length === 1)).toBe(true);
    expect(h.app.problems.ofView(h.app.view!)[0]).toMatchObject({
      start: { line: 2, column: 1 },
      severity: "warning",
      source: "fake",
    });
    expect(statusRow(h.frame())).toContain("⚠ 1");
    // Typing: the old problems hidden (their text is gone), then the server's answer for the new text.
    buf.edit(0, 0, "BAD ");
    h.frame();
    expect(h.app.problems.ofView(h.app.view!)).toEqual([]);
    expect(await until(() => (h.frame(), h.app.problems.ofView(h.app.view!).length === 2))).toBe(true);
    expect(h.app.languages.servers!.list()).toMatchObject([{ name: "fake", state: "running", files: 1 }]);
    await h.app.languages.servers!.stopAll();
  });

  test("a file whose server isn't installed: said once, on the screen", async () => {
    const root = makeVault();
    writeFileSync(join(root, "a.fk"), "text\n");
    writeFileSync(join(root, "b.fk"), "more\n");
    const h = await harness({
      root,
      open: "a.fk",
      config: (c) => {
        c["language-server"] = { nope: { command: "slipbox-test-no-such-server" } };
        c.language = [{ name: "fake", "file-types": ["fk"], "language-servers": ["nope"] }];
      },
    });
    h.app.languages.startServers();
    h.frame();
    const said = (h2: Harness) => h2.app.messages.filter((m) => m.text.startsWith("fake: nope isn't installed"));
    expect(await until(() => said(h).length === 1)).toBe(true);
    expect(said(h)[0]!.level).toBe("warn");
    expect(h.frame()).toContain("nope isn't installed");
    await h.app.run("note.open b.fk");
    h.frame();
    await Bun.sleep(100);
    expect(said(h)).toHaveLength(1);
    await h.app.languages.servers!.stopAll();
  });

  test("shift+k: the server's hover, floating; g d its definition; g r its references, to pick from (19.12, 19.13)", async () => {
    const root = makeVault();
    writeFileSync(join(root, "a.fk"), "  DEF here\nuse it\nREF one\nREF two\n");
    const h = await harness({ root, open: "a.fk", config: served });
    h.app.languages.startServers();
    h.frame();
    expect(await until(() => (h.frame(), h.app.languages.servers!.list()[0]?.state === "running"))).toBe(true);
    await h.app.run("cursor.goto_line 2");
    await h.keys("shift+k");
    expect(await until(() => h.app.floating?.kind === "hover")).toBe(true);
    expect(h.app.floating!.view.buf.source).toBe("line 1: use it\n");
    expect(h.frame()).toContain("line 1: use it");
    h.app.floating!.view.buf.edit(0, 0, "typed "); // typed into: still nothing to write back, it closes
    await h.keys("escape");
    expect(h.app.floating).toBeNull();
    await h.keys("g", "d");
    expect(await until(() => h.app.cursorLine(h.app.view!) === 1)).toBe(true);
    expect(h.app.view!.cur.col).toBe(2); // at DEF, past the indent
    await h.keys("g", "r");
    expect(await until(() => h.app.overlay?.kind === "list")).toBe(true);
    expect((h.app.overlay as ListOverlay).items.map((i) => i.label)).toEqual(["a.fk:3", "a.fk:4"]);
    await h.keys("down", "enter");
    expect(h.app.cursorLine(h.app.view!)).toBe(4);
    await h.app.languages.servers!.stopAll();
  });

  test("g y: the type's definition; g I: the implementations, to pick from; none: said (19.13)", async () => {
    const root = makeVault();
    writeFileSync(join(root, "a.fk"), "use it\n  TYPE Shape\nIMPL circle\nIMPL square\n");
    writeFileSync(join(root, "b.fk"), "nothing here\n");
    const h = await harness({ root, open: "a.fk", config: served });
    h.app.languages.startServers();
    h.frame();
    expect(await until(() => (h.frame(), h.app.languages.servers!.list()[0]?.state === "running"))).toBe(true);
    await h.keys("g", "y");
    expect(await until(() => h.app.cursorLine(h.app.view!) === 2)).toBe(true);
    expect(h.app.view!.cur.col).toBe(2); // at TYPE, past the indent
    await h.keys("g", "shift+i");
    expect(await until(() => h.app.overlay?.kind === "list")).toBe(true);
    expect((h.app.overlay as ListOverlay).title).toBe("2 implementations");
    expect((h.app.overlay as ListOverlay).items.map((i) => i.label)).toEqual(["a.fk:3", "a.fk:4"]);
    await h.keys("down", "enter");
    expect(h.app.cursorLine(h.app.view!)).toBe(4);
    await h.app.run("note.open b.fk");
    expect(await until(() => (h.frame(), h.app.languages.servers!.isOpen(join(root, "b.fk"))))).toBe(true);
    await h.keys("g", "shift+i");
    expect(await until(() => h.app.messages.at(-1)?.text === "no implementation found here")).toBe(true);
    await h.app.languages.servers!.stopAll();
  });

  test("a file tree-sitter has no outline of takes its server's symbols as its outline, nested; again as it changes (19.14)", async () => {
    const root = makeVault();
    writeFileSync(join(root, "a.fk"), "function first\n  method inner\nfunction second\n");
    const h = await harness({ root, open: "a.fk", config: served });
    h.app.languages.startServers();
    h.frame();
    const outline = () => h.app.outlineView.rows().map((r) => `${r.level}:${r.text}`);
    expect(await until(() => (h.frame(), outline().length === 3))).toBe(true);
    expect(outline()).toEqual(["1:first", "2:inner", "1:second"]);
    h.app.view!.buf.edit(h.app.view!.buf.source.length, 0, "function third\n");
    expect(await until(() => (h.frame(), outline().length === 4))).toBe(true);
    await h.app.languages.servers!.stopAll();
  });

  test("in a note slipbox answers itself: shift+k where a link lands, g d follows it, g r its backlinks", async () => {
    const root = makeVault();
    const h = await harness({ root, open: "index.md" });
    const view = h.app.view!;
    const row = h.app.currentLayout(view).links.findIndex((l) => l.target === "notes/alpha.md#section-one");
    const link = h.app.currentLayout(view).links[row]!;
    h.app.moveCursor(view, { row: link.line, col: link.col });
    await h.keys("shift+k");
    expect(h.app.floating?.kind).toBe("hover");
    expect(h.app.floating!.title).toBe("notes/alpha.md › Section One");
    expect(h.app.floating!.view.buf.source).toStartWith("## Section One\n\nBack to [index](../index.md)");
    await h.keys("escape");
    await h.keys("g", "d");
    expect(h.app.view!.buf.rel).toBe("notes/alpha.md");
    await h.keys("g", "r");
    expect((h.app.overlay as ListOverlay).title).toMatch(/^Linking to alpha\.md \(\d+\)$/);
  });

  test("shift+k on a path link reads its #fragment: a block's ^id, a heading written percent-encoded (20.2)", async () => {
    const root = makeVault();
    writeFileSync(
      join(root, "claims.md"),
      "# Claims\n\nThe first claim holds. ^claim-one\n\n## The Plan\n\nShip it.\n",
    );
    writeFileSync(join(root, "cites.md"), "[c](claims.md#^claim-one)\n\n[p](claims.md#The%20Plan)\n");
    const h = await harness({ root, open: "cites.md" });
    const view = h.app.view!;
    const hoverOn = async (target: string) => {
      const link = h.app.currentLayout(view).links.find((l) => l.target === target)!;
      h.app.moveCursor(view, { row: link.line, col: link.col });
      await h.keys("shift+k");
      expect(h.app.floating?.kind).toBe("hover");
      const got = { title: h.app.floating!.title, source: h.app.floating!.view.buf.source };
      await h.keys("escape");
      return got;
    };
    expect(await hoverOn("claims.md#^claim-one")).toEqual({
      title: "claims.md ^claim-one",
      source: "The first claim holds.\n",
    });
    const plan = await hoverOn("claims.md#The%20Plan");
    expect(plan.title).toBe("claims.md › The Plan");
    expect(plan.source).toStartWith("## The Plan\n\nShip it.");
  });

  test("shift+k on a link to a heading or block that isn't there says so, and shows the note's top, where it opens (DF-D26)", async () => {
    const root = makeVault();
    writeFileSync(join(root, "my_claims.md"), "---\nk: v\n---\n# Claims\n\nThe first claim holds. ^claim-one\n");
    writeFileSync(join(root, "cites.md"), "[h](my_claims.md#No%20*Such*%20Plan) [[my_claims#^gone]]\n");
    const h = await harness({ root, open: "cites.md", width: 140 });
    const view = h.app.view!;
    const hoverOn = async (nth: number) => {
      const link = h.app.currentLayout(view).links[nth]!;
      h.app.moveCursor(view, { row: link.line, col: link.col });
      await h.keys("shift+k");
      expect(h.app.floating?.kind).toBe("hover");
      const got = { title: h.app.floating!.title, frame: h.frame() };
      expect(h.app.floating!.view.buf.source).toEndWith("\n\n# Claims\n\nThe first claim holds. ^claim-one\n");
      await h.keys("escape");
      return got;
    };
    const heading = await hoverOn(0);
    expect(heading.title).toBe("my_claims.md"); // where it lands: the note, not a heading it hasn't
    expect(heading.frame).toContain('No heading "No *Such* Plan" in my_claims.md: the link opens the note at its top.');
    expect(heading.frame).not.toContain("(nothing there)");
    const block = await hoverOn(1);
    expect(block.title).toBe("my_claims.md");
    expect(block.frame).toContain("No block ^gone in my_claims.md: the link opens the note at its top.");
  });
});
