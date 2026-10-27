import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ListOverlay } from "../../../../src/tui/app/runtime/app.ts";
import { makeSandbox, makeVault, harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("document types (22.2, 22.3)", () => {
  const setup = async (open = "docs/adr/0001-use-sqlite.md") => {
    const root = makeVault();
    const files: Record<string, string> = {
      "docs/adr/0001-use-sqlite.md": "---\nstatus: Accepted\n---\n# Use SQLite\n",
      "docs/adr/0002-use-json.md": "# Use JSON\n\nStatus: Superseded by [0003](0003-node-sqlite.md)\n",
      "docs/adr/0003-node-sqlite.md": "# node:sqlite\n\n## Status\n\nAccepted\n",
      "skills/broken/SKILL.md": "---\nname: 42\n---\n# Broken\n",
    };
    for (const [rel, text] of Object.entries(files)) {
      mkdirSync(join(root, rel, ".."), { recursive: true });
      writeFileSync(join(root, rel), text);
    }
    return { root, h: await harness({ root, open }) };
  };

  test("space f d lists the types with their notes; a type's notes in order, each its status; one opens", async () => {
    const { h } = await setup();
    await h.keys("space", "f", "d");
    const list = h.app.overlay as ListOverlay;
    expect(list.title).toBe("Document types (2)");
    expect(list.items.map((i) => [i.label, i.hint])).toEqual([
      ["adr", "3 notes"],
      ["skill", "1 note, 1 breaking its rules"],
    ]);
    list.selected = 0;
    await h.keys("enter");
    const notes = h.app.overlay as ListOverlay;
    expect(notes.title).toBe("adr — 3 notes");
    expect(notes.items.map((i) => [i.label, i.hint])).toEqual([
      ["1  Use SQLite", "Accepted · docs/adr/0001-use-sqlite.md"],
      [
        "2  Use JSON",
        "Superseded by [0003](0003-node-sqlite.md) → docs/adr/0003-node-sqlite.md · docs/adr/0002-use-json.md",
      ],
      ["3  node:sqlite", "Accepted · docs/adr/0003-node-sqlite.md"],
    ]);
    notes.selected = 2;
    await h.keys("enter");
    expect(h.app.view!.buf.rel).toBe("docs/adr/0003-node-sqlite.md");
    // :type name goes straight to its notes.
    await h.app.run("type.list skill");
    expect((h.app.overlay as ListOverlay).title).toBe("skill — 1 note");
  });

  test("] t / [ t: the next and previous of this note's type, in its order; said at the ends, and off a type", async () => {
    const { h } = await setup();
    await h.keys("]", "t");
    expect(h.app.view!.buf.rel).toBe("docs/adr/0002-use-json.md");
    expect(h.app.messages.at(-1)?.text).toBe("adr 2 of 3 — Superseded by [0003](0003-node-sqlite.md)");
    await h.keys("]", "t");
    expect(h.app.view!.buf.rel).toBe("docs/adr/0003-node-sqlite.md");
    await h.keys("]", "t");
    expect(h.app.view!.buf.rel).toBe("docs/adr/0003-node-sqlite.md");
    expect(h.app.messages.at(-1)?.text).toBe("the last adr (3)");
    await h.keys("[", "t");
    expect(h.app.view!.buf.rel).toBe("docs/adr/0002-use-json.md");
    h.app.open("index.md");
    await h.keys("]", "t");
    expect(h.app.view!.buf.rel).toBe("index.md");
    expect(h.app.messages.at(-1)?.text).toBe("index.md is of no document type: space f d lists them");
  });

  test("frontmatter breaking its type's rules (22.2): in the note's problems, and the panel's All under Frontmatter — opened at its line", async () => {
    const { h } = await setup("skills/broken/SKILL.md");
    expect(
      h.app.problems
        .ofFile()
        .filter((p) => p.code === "frontmatter")
        .map((p) => `${p.start.line}: ${p.message}`),
    ).toEqual(['1: skill: "description" is missing', '2: skill: "name" should be a string, not a number']);
    h.app.open("index.md");
    const rows = h.app.problems.rows();
    const at = rows.findIndex((r) => r.section === "Frontmatter" && r.heading);
    expect(rows[at]!.label).toBe("Frontmatter (2)");
    expect(rows.slice(at + 1, at + 4).map((r) => r.label)).toEqual(["skills/broken/SKILL.md", "L1", "L2"]);
    expect(h.app.problems.count()).toBeGreaterThanOrEqual(2);
    h.app.problems.panel.tab = "all";
    h.app.problems.clickRow(at + 3, 1);
    expect(h.app.view!.buf.rel).toBe("skills/broken/SKILL.md");
    expect(h.app.cursorLine(h.app.view!)).toBe(2);
    // Fixed and saved: gone from the panel at once.
    h.app.writeBuffer(h.app.view!.buf, "---\nname: broken\ndescription: fixed now\n---\n# Broken\n");
    expect(h.app.problems.rows().some((r) => r.section === "Frontmatter")).toBe(false);
  });
});
