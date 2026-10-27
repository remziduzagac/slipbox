import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeSandbox, makeVault, harness, rowText } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("review cycle 2 (TUI navigation)", () => {
  test("repeated headings: an entry prepended above doesn't move the reader to another entry", async () => {
    const root = makeVault();
    const entry = (n: string) =>
      `## Weather\n\n${Array.from({ length: 30 }, (_, i) => `${n} line ${i}`).join("\n\n")}\n`;
    writeFileSync(join(root, "log.md"), `# Log\n\n${entry("newer")}\n${entry("older")}`);
    const h = await harness({ root, open: "log.md", width: 100, height: 20 });
    const v = h.app.view!;
    h.app.moveCursor(v, {
      row: h.app.currentLayout(v).lines.findIndex((l) =>
        l.spans
          .map((x) => x.text)
          .join("")
          .includes("newer line 20"),
      ),
      col: 0,
    });
    h.frame();
    writeFileSync(join(root, "log.md"), `# Log\n\n${entry("newest")}\n${entry("newer")}\n${entry("older")}`);
    const future = Date.now() / 1000 + 5;
    (await import("node:fs")).utimesSync(join(root, "log.md"), future, future);
    h.app.watch.reloadBuffer(v.buf);
    h.frame();
    expect(rowText(h)).toContain("newer line 20");
  });
});
