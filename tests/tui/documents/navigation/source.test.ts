import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeSandbox, makeVault, harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("review cycle 2 (TUI navigation)", () => {
  test("enter follows a link in source mode and in the lens", async () => {
    for (const mode of ["v", "l"]) {
      const root = makeVault();
      writeFileSync(join(root, "s.md"), "# S\n\nSee [alpha](notes/alpha.md) and [beta](notes/beta.md).\n");
      const h = await harness({ root, open: "s.md", width: 100, height: 30 });
      const v = h.app.view!;
      await h.keys("space", "n", mode);
      h.app.moveCursor(v, {
        row: h.app.currentLayout(v).lines.findIndex(
          (l) =>
            l.srcMap &&
            l.spans
              .map((x) => x.text)
              .join("")
              .includes("See ["),
        ),
        col: 0,
      });
      await h.keys("f", "[", "enter");
      expect(h.app.view!.buf.rel).toBe("notes/alpha.md");
    }
  });
});

describe("review cycle 5 (TUI, behaviour no test had pinned)", () => {
  const LINKS =
    "# M\n\n[to alpha](notes/alpha.md) [two](notes/alpha.md#section-two) [far](#far) [broken](nope.pdf)\n\nfiller\n\n## Far\n\nend\n";

  test("in source mode the markdown link under the cursor is followed too", async () => {
    const root = makeVault();
    writeFileSync(join(root, "m.md"), LINKS);
    const h = await harness({ root, open: "m.md", width: 160, height: 40 });
    await h.keys("space", "n", "v", "j", "j", "l", "l", "enter");
    expect(h.app.view!.buf.rel).toBe("notes/alpha.md");
  });
});
