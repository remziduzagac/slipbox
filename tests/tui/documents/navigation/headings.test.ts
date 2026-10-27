import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeSandbox, makeVault, harness, rowText, statusRow, type Harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("review cycle 2 (TUI navigation)", () => {
  test("a #fragment followed in source mode finds a heading's {#id} while the note is saved", async () => {
    const root = makeVault();
    writeFileSync(
      join(root, "s.md"),
      `# S\n\nSee [go](#custom).\n\n${"filler\n\n".repeat(20)}## Setup {#custom}\n\nbody\n`,
    );
    const h = await harness({ root, open: "s.md", width: 100, height: 20 });
    const v = h.app.view!;
    await h.keys("space", "n", "v");
    expect(v.buf.dirty).toBe(false);
    h.app.moveCursor(v, {
      row: h.app.currentLayout(v).lines.findIndex((l) =>
        l.spans
          .map((x) => x.text)
          .join("")
          .includes("See ["),
      ),
      col: 0,
    });
    await h.keys("f", "[", "enter");
    expect(statusRow(h.frame())).not.toContain("no heading");
    expect(
      h.app
        .currentLayout(v)
        .lines[v.cur.row]!.spans.map((x) => x.text)
        .join(""),
    ).toContain("## Setup");
  });
});

describe("review cycle 4 (TUI)", () => {
  test("a footnote with capitals is followed; [Title](#title) finds a heading with a footnote mark", async () => {
    const root = makeVault();
    writeFileSync(
      join(root, "f.md"),
      "# Title[^1]\n\nSee[^Note] here and [Title](#title).\n\n[^Note]: The note text.\n[^1]: one\n",
    );
    const h = await harness({ root, open: "f.md", width: 100, height: 30 });
    const v = h.app.view!;
    const layout = () => h.app.currentLayout(v);
    const note = layout().links.findIndex((l) => l.kind === "footnote" && l.target.toLowerCase() === "note");
    h.app.moveCursor(v, { row: layout().links[note]!.line, col: layout().links[note]!.col });
    await h.keys("enter");
    expect(rowText(h)).toContain("The note text.");
    const title = layout().links.findIndex((l) => l.kind === "markdown" && l.target === "#title");
    h.app.moveCursor(v, { row: layout().links[title]!.line, col: layout().links[title]!.col });
    await h.keys("enter");
    expect(h.app.messages.some((m) => m.text.includes("no heading"))).toBe(false);
    expect(v.cur.row).toBe(0);
  });
});

describe("review cycle 5 (TUI, behaviour no test had pinned)", () => {
  const LINKS =
    "# M\n\n[to alpha](notes/alpha.md) [two](notes/alpha.md#section-two) [far](#far) [broken](nope.pdf)\n\nfiller\n\n## Far\n\nend\n";
  const follow = async (h: Harness, k: number) => {
    const v = h.app.view!;
    const l = h.app.currentLayout(v).links[k]!;
    h.app.moveCursor(v, { row: l.line, col: l.col });
    await h.keys("enter");
  };
  const at = (h: Harness) => ({ rel: h.app.view!.buf.rel, row: rowText(h).trim() });
  test("markdown links and heading anchors are followed to the place", async () => {
    const root = makeVault();
    writeFileSync(join(root, "m.md"), LINKS);
    const h = await harness({ root, open: "m.md", width: 160, height: 40 });
    const back = async () => {
      await h.app.run("history.back");
      expect(h.app.view!.buf.rel).toBe("m.md");
    };
    await follow(h, 0);
    expect(at(h).rel).toBe("notes/alpha.md");
    await back();
    await follow(h, 1);
    expect(at(h)).toMatchObject({ rel: "notes/alpha.md", row: expect.stringContaining("Section Two") });
    await back();
    await follow(h, 2);
    expect(at(h)).toMatchObject({ rel: "m.md", row: expect.stringContaining("Far") });
    await h.app.run("history.back");
    await follow(h, 3);
    expect(h.app.view!.buf.rel).toBe("m.md"); // a broken link opens nothing…
    expect(h.app.messages.some((m) => m.text.includes("nope.pdf"))).toBe(true); // …and says so
  });
});
