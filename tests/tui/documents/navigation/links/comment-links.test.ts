import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeSandbox, makeVault, harness } from "../../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("links in code comments in the TUI (16.10)", () => {
  test("a comment's path is drawn as a link; enter opens it, `path:line` at that line", async () => {
    const root = makeVault();
    writeFileSync(join(root, "lib.py"), "a = 1\nb = 2\nc = 3\n");
    writeFileSync(join(root, "run.py"), "# see lib.py:3 and notes/alpha.md\nx = 1\n");
    const h = await harness({ root, open: "run.py", width: 100, config: (c) => (c.render.code = false) });
    const v = h.app.view!;
    for (let i = 0; i < 100 && v.buf.syntax?.version !== v.buf.version; i++) {
      h.frame();
      await Bun.sleep(10);
    }
    expect(v.buf.syntax!.links.map((l) => l.target)).toEqual(["lib.py", "notes/alpha.md"]);
    const c = h.canvas();
    const y = c.rows.findIndex((r) => r.join("").includes("# see lib.py"));
    const x = c.line(y).indexOf("lib.py");
    expect(c.styles[y]![x]!.underline).toBe(true); // the link role
    h.app.moveCursor(v, { row: 0, col: 7 });
    await h.keys("enter");
    expect(v.buf.rel).toBe("lib.py");
    expect(h.app.currentLayout(v).lines[v.cur.row]!.src).toBe(3);
    await h.app.run("history.back");
    h.app.moveCursor(v, { row: 0, col: 20 });
    await h.keys("enter");
    expect(v.buf.rel).toBe("notes/alpha.md");
  });
});
