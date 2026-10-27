import { describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeSandbox, makeVault, harness, type Harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("the properties editor: a note's frontmatter in a floating window (3.20)", () => {
  const setup = async (source: string) => {
    const root = makeVault();
    writeFileSync(join(root, "p.md"), source);
    const h = await harness({ root, open: "p.md", width: 140, height: 36 });
    return { h, read: () => readFileSync(join(root, "p.md"), "utf8") };
  };
  const type = async (h: Harness, text: string) => {
    for (const c of text) await h.keys(c === " " ? "space" : c);
  };
  const ask = (h: Harness) => h.app.overlay as import("../../../../src/tui/app/runtime/app.ts").PromptOverlay;

  test("space n shift+p: the YAML in a floating editor with every editing key; esc closes it, writing back — one undo step in the note", async () => {
    const { h, read } = await setup("---\ntitle: T\ntags: [a]\n---\n# T\n\nBody.\n");
    await h.keys("space", "n", "shift+p");
    const f = h.app.floating!;
    expect(f.view.buf.source).toBe("title: T\ntags: [a]\n");
    expect(f.view.buf.kind).toEqual({ group: "data", format: "yaml" });
    expect(h.app.view).toBe(f.view); // the keys act on it
    const frame = h.frame();
    expect(frame).toContain("Properties — p.md (YAML)");
    expect(frame).toContain("esc · q closes, writing back");
    await h.keys("shift+g", "o");
    await type(h, "status: new");
    await h.keys("escape", "escape");
    expect(h.app.floating).toBeNull();
    expect(read()).toBe("---\ntitle: T\ntags: [a]\nstatus: new\n---\n# T\n\nBody.\n");
    expect(h.app.messages.at(-1)!.text).toBe("properties written to p.md");
    await h.keys("ctrl+z");
    expect(h.app.view!.buf.source).toBe("---\ntitle: T\ntags: [a]\n---\n# T\n\nBody.\n");
  });

  test("a CRLF note's frontmatter opens with its properties and is rewritten in place, CRLF kept", async () => {
    const { h, read } = await setup("---\r\ntitle: T\r\n---\r\n# T\r\n\r\nBody.\r\n");
    await h.app.run("note.properties");
    expect(h.app.floating!.view.buf.source).toBe("title: T\n");
    await h.keys("shift+g", "o");
    await type(h, "status: new");
    await h.keys("escape", "escape");
    expect(h.app.floating).toBeNull();
    expect(read()).toBe("---\r\ntitle: T\r\nstatus: new\r\n---\r\n# T\r\n\r\nBody.\r\n");
  });

  test("an empty frontmatter opens empty, never as the body up to a later rule; a property goes between its fences", async () => {
    const { h, read } = await setup("---\n---\n# T\n\ntext\n\n---\n\nmore\n");
    await h.app.run("note.properties");
    expect(h.app.floating!.view.buf.source).toBe("");
    await h.keys("i");
    await type(h, "title: X");
    await h.keys("escape", "escape");
    expect(h.app.floating).toBeNull();
    expect(read()).toBe("---\ntitle: X\n---\n# T\n\ntext\n\n---\n\nmore\n");
  });

  test("ctrl+s writes and stays; :q closes; a note without properties gets them first; emptied, they go", async () => {
    const { h, read } = await setup("# Plain\n\nBody.\n");
    await h.app.run("note.properties");
    expect(h.app.floating!.view.buf.source).toBe("");
    await h.keys("i");
    await type(h, "title: Fresh");
    await h.keys("escape", "ctrl+s");
    expect(read()).toBe("---\ntitle: Fresh\n---\n# Plain\n\nBody.\n");
    expect(h.app.floating).not.toBeNull(); // still open
    await h.keys("g", "g", "d", "d");
    await h.keys(":", "q", "enter");
    expect(h.app.floating).toBeNull();
    expect(read()).toBe("# Plain\n\nBody.\n");
  });

  test("text that doesn't parse, or properties changed meanwhile, ask first; TOML keeps its fences; the Info's e; a click outside closes", async () => {
    const { h, read } = await setup('+++\ntitle = "T"\n+++\n# T\n');
    await h.app.run("note.properties");
    expect(h.frame()).toContain("(TOML)");
    await h.keys("shift+g", "o");
    await type(h, "broken = ");
    await h.keys("escape", "escape");
    expect(ask(h)).toMatchObject({ confirm: true, label: expect.stringMatching(/^The properties don't parse/) });
    await h.keys("n");
    expect(h.app.floating).not.toBeNull(); // still editing
    await h.keys("d", "d", "o");
    await type(h, "draft = true");
    await h.keys("escape", "escape");
    expect(read()).toBe('+++\ntitle = "T"\ndraft = true\n+++\n# T\n');
    // Changed under it: asks before writing over.
    await h.keys("space", "n", "i", "e"); // the Info view's e
    expect(h.app.floating).not.toBeNull();
    const note = h.app.tab!.views[0]!.buf;
    note.edit(4, 0, "x");
    await h.keys("o");
    await type(h, "more = 1");
    await h.keys("escape", "escape");
    expect(ask(h).label).toMatch(/properties changed while you edited them/);
    await h.keys("y");
    expect(h.app.floating).toBeNull();
    expect(read()).toBe('+++\ntitle = "T"\nmore = 1\ndraft = true\n+++\n# T\n'); // yours over theirs (the x)
    // A click outside its box closes it.
    await h.app.run("note.properties");
    h.frame();
    h.app.mouse.handle({ type: "down", x: 1, y: 30, button: 0 });
    h.app.mouse.handle({ type: "up", x: 1, y: 30, button: 0 });
    expect(h.app.floating).toBeNull();
  });

  test("quitting writes the properties back first (ctrl+q, :x); text that doesn't parse asks, the app kept; :wa writes them", async () => {
    const { h, read } = await setup("---\ntitle: A\n---\n# A\n");
    await h.app.run("note.properties");
    await h.keys("o");
    await type(h, "x: 1");
    await h.keys("escape", "ctrl+q");
    expect(read()).toBe("---\ntitle: A\nx: 1\n---\n# A\n");
    expect(h.quit.called).toBe(true);
    // Not parsing: asked, still open, not quit.
    const b = await setup("---\ntitle: A\n---\n# A\n");
    await b.h.app.run("note.properties");
    await b.h.keys("o");
    await type(b.h, "broken: [");
    await b.h.keys("escape", ":", "x", "enter");
    expect(ask(b.h)).toMatchObject({ confirm: true, label: expect.stringMatching(/^The properties don't parse/) });
    expect(b.h.quit.called).toBe(false);
    expect(b.read()).toBe("---\ntitle: A\n---\n# A\n");
    // :wa: written, and said so; the editor stays.
    const c = await setup("---\ntitle: A\n---\n# A\n");
    await c.h.app.run("note.properties");
    await c.h.keys("o");
    await type(c.h, "y: 2");
    await c.h.keys("escape", ":", "w", "a", "enter");
    expect(c.read()).toBe("---\ntitle: A\ny: 2\n---\n# A\n");
    expect(c.h.app.messages.at(-1)!.text).toBe("saved 1 note");
    expect(c.h.app.floating).not.toBeNull();
  });

  test("a click on another tab (or a side pane) closes it, writing back, and does nothing else", async () => {
    const { h, read } = await setup("---\ntitle: A\n---\n# A\n");
    await h.app.run("tab.new");
    await h.app.run("note.open index.md");
    await h.app.run("tab.prev");
    expect(h.app.activeTab).toBe(0);
    await h.app.run("note.properties");
    await h.keys("o");
    await type(h, "x: 1");
    await h.keys("escape");
    h.frame();
    const tab = h.app.geometry!.tabs.find((t) => t.index === 1)!;
    h.app.mouse.handle({ type: "down", x: tab.x + 1, y: tab.y, button: 0 });
    h.app.mouse.handle({ type: "up", x: tab.x + 1, y: tab.y, button: 0 });
    expect(h.app.floating).toBeNull();
    expect(h.app.activeTab).toBe(0); // the click was the editor's closing
    expect(read()).toBe("---\ntitle: A\nx: 1\n---\n# A\n");
    // The explorer: likewise.
    h.app.panels.showSidebar(true);
    await h.app.run("note.properties");
    await h.keys("shift+g", "o");
    await type(h, "z: 3");
    await h.keys("escape");
    h.frame();
    const sb = h.app.geometry!.sidebarPane!;
    h.app.region = "content";
    h.app.mouse.handle({ type: "down", x: sb.x + 1, y: sb.y + 1, button: 0 });
    h.app.mouse.handle({ type: "up", x: sb.x + 1, y: sb.y + 1, button: 0 });
    expect(h.app.floating).toBeNull();
    expect(h.app.region).toBe("content");
    expect(read()).toBe("---\ntitle: A\nx: 1\nz: 3\n---\n# A\n");
  });
});

describe("review (tui): the app's floating windows, new paths, roots and repeats", () => {
  const type = async (h: Harness, text: string) => {
    for (const c of text) await h.keys(c === " " ? "space" : c);
  };

  const fnSetup = async (source: string | Buffer) => {
    const root = makeVault();
    writeFileSync(join(root, "fn.md"), source);
    const h = await harness({ root, open: "fn.md", width: 140 });
    return { root, h, read: () => readFileSync(join(root, "fn.md"), "utf8") };
  };

  test("properties: a yes from ctrl+s (text that doesn't parse, or changed meanwhile) writes them and keeps the editor open", async () => {
    const { h, read } = await fnSetup('+++\ntitle = "T"\n+++\n# T\n');
    await h.app.run("note.properties");
    await h.keys("shift+g", "o");
    await type(h, "broken = ");
    await h.keys("escape", "ctrl+s");
    expect((h.app.overlay as import("../../../../src/tui/app/runtime/app.ts").PromptOverlay).label).toMatch(
      /^The properties don't parse/,
    );
    await h.keys("y");
    expect(read()).toBe('+++\ntitle = "T"\nbroken =\n+++\n# T\n');
    expect(h.app.floating).not.toBeNull();
    expect(h.app.floating!.view.buf.dirty).toBe(false);
    h.app.tab!.views[0]!.buf.edit(4, 0, "x");
    await h.keys("o");
    await type(h, "more = 1");
    await h.keys("escape", "ctrl+s");
    expect((h.app.overlay as import("../../../../src/tui/app/runtime/app.ts").PromptOverlay).label).toMatch(
      /properties changed while you edited them/,
    );
    await h.keys("y");
    expect(read()).toContain("more = 1");
    expect(h.app.floating).not.toBeNull();
    expect(h.app.floating!.view.buf.dirty).toBe(false);
  });
});
