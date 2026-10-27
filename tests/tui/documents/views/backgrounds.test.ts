import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeSandbox, makeVault, harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("block backgrounds", () => {
  test("a code block's text sits on the block's background, not the page's; the cursor band covers both", async () => {
    const root = makeVault();
    writeFileSync(join(root, "p.md"), "text\n\n```\ncode here\n```\n\nmore\n");
    const h = await harness({ root, open: "p.md", width: 80, height: 20 });
    const pane = h.app.geometry!.panes[0]!;
    const v = h.app.view!;
    const row = h.app.currentLayout(v).lines.findIndex((l) =>
      l.spans
        .map((x) => x.text)
        .join("")
        .includes("code here"),
    );
    const y = pane.y + row - v.top;
    expect(h.canvas().styles[y]![pane.textX + 3]!.bg).toBe(h.app.theme.roles.code_block.bg!);
    h.app.moveCursor(v, { row, col: 0 });
    expect(h.canvas().styles[y]![pane.textX + 3]!.bg).toBe(h.app.theme.roles.cursor_line.bg!);
  });
});
