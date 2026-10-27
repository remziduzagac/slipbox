import { describe, expect, test } from "bun:test";
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeSandbox, makeVault, harness, statusRow, type Harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("embeds in the TUI (1.11)", () => {
  const setup = async () => {
    const root = makeVault();
    mkdirSync(join(root, "sub"), { recursive: true });
    writeFileSync(join(root, "host.md"), "# Host\n\n![inner](sub/inner.md)\n\nAfter.\n");
    writeFileSync(
      join(root, "sub", "inner.md"),
      "# Inner\n\nSee [the sibling](sibling.md), and [Deep](#deep).\n\n## Deep\n\nbottom\n",
    );
    writeFileSync(join(root, "sub", "sibling.md"), "# Sibling\n");
    return { root, h: await harness({ root, open: "host.md" }) };
  };
  const linkAt = (h: Harness, text: string) => h.app.currentLayout(h.app.view!).links.findIndex((l) => l.text === text);
  const follow = async (h: Harness, i: number) => {
    const l = h.app.currentLayout(h.app.view!).links[i]!;
    h.app.moveCursor(h.app.view!, { row: l.line, col: l.col });
    await h.keys("enter");
  };

  test("drawn in place; its links followed from where it is; its header opens it", async () => {
    const { h } = await setup();
    expect(h.frame()).toContain("▎ See the sibling, and Deep.");
    await follow(h, linkAt(h, "the sibling"));
    expect(h.app.view!.buf.rel).toBe("sub/sibling.md"); // beside the embedded note, not the host
    await h.keys("ctrl+o");
    await follow(h, linkAt(h, "Deep"));
    expect(h.app.view!.buf.rel).toBe("sub/inner.md"); // #deep is the embedded note's heading
    expect(statusRow(h.frame())).toMatch(/ L5:/);
    await h.keys("ctrl+o");
    await follow(h, linkAt(h, "inner"));
    expect(h.app.view!.buf.rel).toBe("sub/inner.md");
  });

  test("a [[#Heading]] wikilink inside an embed opens the embedded note at its heading, not the host's", async () => {
    const root = makeVault();
    writeFileSync(join(root, "host.md"), "# Host\n\n![[inner]]\n\n## Deep\n\nthe host's own\n");
    writeFileSync(join(root, "inner.md"), "# Inner\n\nOn to [[#Deep]].\n\n## Deep\n\nbottom\n");
    const h = await harness({ root, open: "host.md" });
    const l = h.app.currentLayout(h.app.view!).links.find((x) => x.kind === "wiki" && x.heading === "Deep")!;
    h.app.moveCursor(h.app.view!, { row: l.line, col: l.col });
    await h.keys("enter");
    expect(h.app.view!.buf.rel).toBe("inner.md");
    expect(statusRow(h.frame())).toMatch(/ L5:/);
  });

  test("the embedded note changed — on disk, or saved here — and the note showing it shows it now", async () => {
    const { root, h } = await setup();
    // On disk, as the watcher tells the graph.
    writeFileSync(join(root, "sub", "inner.md"), "# Inner\n\nrewritten by an agent\n");
    const st = statSync(join(root, "sub", "inner.md"));
    h.app.graph.updateFile("sub/inner.md", {
      rel: "sub/inner.md",
      abs: join(root, "sub", "inner.md"),
      size: st.size,
      mtimeMs: st.mtimeMs,
    });
    expect(h.frame()).toContain("▎ rewritten by an agent");
    // Saved here, in another tab.
    await h.app.run("tab.new");
    await h.app.run("note.open sub/inner.md");
    await h.keys(
      "space",
      "n",
      "v",
      "shift+g",
      "o",
      ...[..."and a line"].map((c) => (c === " " ? "space" : c)),
      "escape",
      "ctrl+s",
    );
    await h.app.run("tab.prev");
    expect(h.frame()).toContain("▎ rewritten by an agent and a line"); // one paragraph
  });
});
