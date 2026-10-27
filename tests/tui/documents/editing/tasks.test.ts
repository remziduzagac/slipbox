import { describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeSandbox, makeVault, harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("task toggle (ctrl+l, a click on [ ])", () => {
  const note = "# Tasks\n\n- [ ] parent task\n  - [x] child task\n    with a second line\n- plain item\n";
  const setup = async () => {
    const root = makeVault();
    writeFileSync(join(root, "tasks.md"), note);
    const h = await harness({ root, open: "tasks.md", width: 80, height: 24 });
    return { h, root, file: join(root, "tasks.md") };
  };
  test("ctrl+l ticks the innermost task item holding the cursor, on disk; the view keeps its place", async () => {
    const { h, file } = await setup();
    const v = h.app.view!;
    // The child's continuation row belongs to the child.
    const row = h.app.currentLayout(v).lines.findIndex((l) =>
      l.spans
        .map((s) => s.text)
        .join("")
        .includes("with a second line"),
    );
    h.app.moveCursor(v, { row, col: 0 });
    await h.keys("ctrl+l");
    expect(readFileSync(file, "utf8")).toBe(note.replace("[x] child", "[ ] child"));
    expect(v.cur.row).toBe(row); // anchored across the reload
    const parent = h.app.currentLayout(v).lines.findIndex((l) =>
      l.spans
        .map((s) => s.text)
        .join("")
        .includes("parent task"),
    );
    h.app.moveCursor(v, { row: parent, col: 4 });
    await h.keys("ctrl+l");
    expect(readFileSync(file, "utf8")).toContain("- [x] parent task");
    expect(h.app.transient!.text).toBe("done ✓");
    // Not on a task: a message, no write.
    const plain = h.app.currentLayout(v).lines.findIndex((l) =>
      l.spans
        .map((s) => s.text)
        .join("")
        .includes("plain item"),
    );
    h.app.moveCursor(v, { row: plain, col: 0 });
    const before = readFileSync(file, "utf8");
    await h.keys("ctrl+l");
    expect(readFileSync(file, "utf8")).toBe(before);
    expect(h.app.transient!.text).toContain("no task here");
  });
  test("in source mode and the lens, ctrl+l ticks the task item holding the cursor's line, the innermost", async () => {
    const { h, file } = await setup();
    const v = h.app.view!;
    await h.app.run("view.source");
    await h.keys("g", "g", "j", "j", "j", "j"); // line 5: the child's second line
    await h.keys("ctrl+l");
    expect(readFileSync(file, "utf8")).toBe(note.replace("[x] child", "[ ] child"));
    expect(h.app.transient!.text).toBe("not done");
    await h.keys("k", "k"); // line 3: the parent's marker
    await h.keys("ctrl+l");
    expect(readFileSync(file, "utf8")).toBe(note.replace("[x] child", "[ ] child").replace("[ ] parent", "[x] parent"));
    await h.keys("shift+g"); // the plain item: none
    const before = readFileSync(file, "utf8");
    await h.keys("ctrl+l");
    expect(readFileSync(file, "utf8")).toBe(before);
    expect(h.app.transient!.text).toContain("no task here");
    // The lens, with unsaved changes: in the text, the file left alone.
    await h.app.run("view.source");
    await h.keys("space", "n", "l", "g", "g", "j", "j");
    expect(v.live).toBe(true);
    await h.keys("shift+a", "!", "escape", "ctrl+l");
    expect(v.buf.source).toBe(before.replace("- [x] parent task", "- [ ] parent task!"));
    expect(h.app.transient!.text).toBe("not done (unsaved)");
    expect(readFileSync(file, "utf8")).toBe(before);
  });
  test("a click on the checkbox toggles it; a changed file is reloaded first, not toggled", async () => {
    const { h, file } = await setup();
    const v = h.app.view!;
    h.frame();
    const pane = h.app.geometry!.panes[0]!;
    const layout = h.app.currentLayout(v);
    const row = layout.lines.findIndex((l) => l.spans.some((s) => s.task?.line === 3));
    let col = 0;
    for (const s of layout.lines[row]!.spans) {
      if (s.task) break;
      col += s.text.length;
    }
    const y = pane.y + row - v.top;
    h.app.mouse.handle({ type: "down", x: pane.textX + col, y, button: 0 });
    h.app.mouse.handle({ type: "up", x: pane.textX + col, y, button: 0 });
    expect(readFileSync(file, "utf8")).toContain("- [x] parent task");
    // Someone else rewrites the file: the next toggle reloads instead of writing blind.
    writeFileSync(file, "# Moved\n\n\n" + readFileSync(file, "utf8"));
    const future = Date.now() / 1000 + 5;
    (await import("node:fs")).utimesSync(file, future, future);
    h.app.moveCursor(v, { row, col: 0 });
    await h.keys("ctrl+l");
    expect(h.app.transient!.text).toContain("changed on disk");
    expect(readFileSync(file, "utf8")).toContain("- [x] parent task");
  });
});
