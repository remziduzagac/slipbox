import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeSandbox, makeVault, harness, rowStarting } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("the key map as agreed (vim first, desktop editors' ctrl keys, space for the rest)", () => {
  test("the clipboard: cuts reach it, p puts what it holds (the register when it holds nothing)", async () => {
    const { copyText } = await import("../../../../src/core/foundation/platform/clipboard.ts");
    const root = makeVault();
    writeFileSync(join(root, "c.md"), "alpha beta\n");
    const h = await harness({ root, open: "c.md" });
    const v = h.app.view!;
    await h.keys("space", "n", "v", "x");
    expect(h.copied.at(-1)).toBe("a"); // x is a cut: on the clipboard too
    await h.keys("p");
    expect(v.buf.source).toBe("lapha beta\n"); // nothing readable on the clipboard: the register
    // Something copied elsewhere (the clipboard file stands for the system clipboard here).
    const { stateDir } = await import("../../../../src/core/foundation/platform/paths.ts");
    copyText("ZED", { osc52: () => false, fallbackDir: stateDir(h.app.loc) });
    await h.keys("0", "shift+p");
    expect(v.buf.source).toBe("ZEDlapha beta\n");
    // A terminal paste in normal mode puts, as p does.
    h.app.input.paste("++");
    await h.keys("escape");
    expect(v.buf.source).toContain("++");
  });
  test("ctrl+x / ctrl+v, as every editor's beside ctrl+c: a selection cut, else the line; the clipboard pasted — as p, over a selection, while typing", async () => {
    const root = makeVault();
    writeFileSync(join(root, "c.md"), "alpha beta\ngamma\ndelta\n");
    const h = await harness({ root, open: "c.md" });
    const v = h.app.view!;
    await h.keys("space", "n", "v"); // source mode
    // A selection cut: what ctrl+c would have copied, taken out.
    await h.keys("shift+right", "shift+right", "ctrl+c");
    const copied = h.copied.at(-1);
    await h.keys("ctrl+x");
    expect([copied, h.copied.at(-1), v.buf.source]).toEqual(["alp", "alp", "ha beta\ngamma\ndelta\n"]);
    // Nothing selected: the cursor's line, whole.
    await h.keys("j", "ctrl+x");
    expect([h.copied.at(-1), v.buf.source]).toEqual(["gamma\n", "ha beta\ndelta\n"]);
    // ctrl+v: a line on the clipboard goes under the cursor's line, as p puts it.
    await h.keys("ctrl+v");
    expect(v.buf.source).toBe("ha beta\ndelta\ngamma\n");
    // Over a selection: the clipboard in its place — the clipboard unchanged (a paste isn't a cut).
    const { copyText } = await import("../../../../src/core/foundation/platform/clipboard.ts");
    const { stateDir } = await import("../../../../src/core/foundation/platform/paths.ts");
    copyText("ZED", { osc52: () => false, fallbackDir: stateDir(h.app.loc) });
    await h.keys("g", "g", "v", "l", "ctrl+v");
    expect(v.buf.source).toBe("ZED beta\ndelta\ngamma\n");
    await h.keys("shift+right", "ctrl+v"); // a shift-selection too: "D " (from the cursor's character, as ctrl+c copies)
    expect(v.buf.source).toBe("ZEZEDbeta\ndelta\ngamma\n");
    // While typing: at the cursor, as the terminal's own paste.
    await h.keys("shift+a", "space", "ctrl+v", "escape");
    expect(v.buf.source).toBe("ZEZEDbeta ZED\ndelta\ngamma\n");
    // Lines selected (V): the clipboard's text a line of its own in their place.
    await h.keys("j", "shift+v", "ctrl+v");
    expect(v.buf.source).toBe("ZEZEDbeta ZED\nZED\ngamma\n");
    // ctrl+k switches the view, as space n v.
    await h.keys("ctrl+k");
    expect(v.source).toBeFalsy();
    // Reading, a selection isn't cut: that's an edit, in source mode or the lens.
    for (const key of ["ctrl+x", "ctrl+v"]) {
      await h.keys("escape", "shift+right", key);
      expect(v.buf.source).toBe("ZEZEDbeta ZED\nZED\ngamma\n");
      expect(h.app.messages.at(-1)!.text).toBe("editing is in the lens (space n l) or source mode (ctrl+k)");
    }
    await h.keys("escape", "ctrl+k");
    expect(v.source).toBe(true);
  });
});

describe("lists and commands no test had run (the TUI model)", () => {
  test("y y with a mouse selection copies the selection, not the row, and ends it", async () => {
    const h = await harness({ open: "notes/alpha.md" });
    const pane = h.app.geometry!.panes[0]!;
    const row = rowStarting(h, "Back to");
    h.app.mouse.handle({ type: "down", x: pane.textX, y: pane.y + row, button: 0 });
    h.app.mouse.handle({ type: "drag", x: pane.textX + 6, y: pane.y + row, button: 0 });
    h.app.mouse.handle({ type: "up", x: pane.textX + 6, y: pane.y + row, button: 0 });
    h.copied.length = 0;
    await h.keys("y", "y");
    expect(h.copied).toEqual(["Back to"]);
    expect(h.app.view!.sel).toBeNull();
    await h.keys("y", "y"); // no selection now: the row
    expect(h.copied.at(-1)).toBe("Back to index and on to beta.");
  });
});
