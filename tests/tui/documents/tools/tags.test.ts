import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ListOverlay } from "../../../../src/tui/app/runtime/app.ts";
import { makeSandbox, makeVault, harness, statusRow, type Harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("tags (1.6)", () => {
  const setup = async () => {
    const root = makeVault();
    writeFileSync(join(root, "tagged.md"), "# Tagged\n\nAbout #cupola/hatch and #notion.\n");
    writeFileSync(join(root, "other-tagged.md"), "---\ntags: [cupola]\n---\n# Other\n\n#Notion too\n");
    return { root, h: await harness({ root, open: "tagged.md" }) };
  };
  const onTag = (h: Harness, name: string) => {
    const v = h.app.view!;
    const l = h.app.currentLayout(v).links.find((x) => x.kind === "tag" && x.target === name)!;
    h.app.moveCursor(v, { row: l.line, col: l.col });
  };

  test("space f t lists the tags with their counts; a tag lists its notes; one opens", async () => {
    const { h } = await setup();
    await h.keys("space", "f", "t");
    const list = h.app.overlay as ListOverlay;
    expect(list.title).toMatch(/^Tags \(\d+\)/);
    const dome = list.items.find((i) => i.label === "#cupola")!;
    expect(dome.hint).toBe("2 notes"); // tagged.md's #cupola/hatch counts for #cupola
    expect(list.items.find((i) => i.label === "#cupola/hatch")).toMatchObject({ indent: 1, hint: "1 note" });
    expect(list.items.find((i) => i.label === "#Notion")!.hint).toBe("2 notes"); // #notion is #Notion, as first written (by path)
    list.selected = list.filtered.findIndex((e) => e.item === dome);
    await h.keys("enter");
    const notes = h.app.overlay as ListOverlay;
    expect(notes.title).toBe("#cupola — 2 notes");
    expect(notes.items.map((i) => i.data)).toEqual(["other-tagged.md", "tagged.md"]);
    await h.keys("enter");
    expect(h.app.view!.buf.rel).toBe("other-tagged.md");
    // A save shows at once: a tag written in is listed.
    h.app.writeBuffer(h.app.view!.buf, "---\ntags: [cupola]\n---\n# Other\n\n#Notion and #freshly-added\n");
    await h.keys("space", "f", "t");
    expect((h.app.overlay as ListOverlay).items.some((i) => i.label === "#freshly-added")).toBe(true);
  });

  test("a #tag in the text: its own colour; followed, its notes — rendered and in source mode; :tag name too", async () => {
    const { h } = await setup();
    onTag(h, "notion");
    expect(statusRow(h.frame())).toContain("→ #notion");
    await h.app.run("link.follow");
    expect((h.app.overlay as ListOverlay).title).toBe("#Notion — 2 notes");
    await h.keys("escape");
    // Source mode: the tag in the text.
    await h.app.run("view.source");
    const v = h.app.view!;
    const row = h.app.currentLayout(v).lines.findIndex((l) =>
      l.spans
        .map((s) => s.text)
        .join("")
        .includes("#cupola/hatch"),
    );
    const text = h.app
      .currentLayout(v)
      .lines[row]!.spans.map((s) => s.text)
      .join("");
    h.app.moveCursor(v, { row, col: [...text.slice(0, text.indexOf("#cupola/hatch") + 2)].length });
    await h.app.run("link.follow");
    expect((h.app.overlay as ListOverlay).title).toBe("#cupola/hatch — 1 note");
    await h.keys("escape", ":");
    for (const c of "tag cupola") await h.keys(c === " " ? "space" : c);
    await h.keys("enter");
    expect((h.app.overlay as ListOverlay).title).toBe("#cupola — 2 notes");
  });
});
