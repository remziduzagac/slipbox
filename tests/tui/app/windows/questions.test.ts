import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { makeSandbox, makeVault, harness, statusRow, type Harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("questions float in a window of their own", () => {
  const ask = (h: Harness) => h.app.overlay as import("../../../../src/tui/app/runtime/app.ts").PromptOverlay;
  const click = (h: Harness, x: number, y: number) => {
    h.app.mouse.handle({ type: "down", x, y, button: 0 });
    h.app.mouse.handle({ type: "up", x, y, button: 0 });
  };
  const clickHot = (h: Harness, id: string) => {
    const r = h.app.geometry!.hot.find((x) => x.id === id)!;
    click(h, r.x + 1, r.y);
  };

  test("a prompt: the question, the answer typed under it, OK and Cancel clicked; outside it cancels; too small: the status line", async () => {
    const root = makeVault();
    const h = await harness({ root, open: "notes/alpha.md" });
    await h.keys("ctrl+n");
    const d = h.app.geometry!.dialog!;
    for (const ch of "fresh") await h.keys(ch);
    const f = h.frame().split("\n");
    expect(f[d.y + 2]).toContain("new note in notes/");
    expect(f[d.y + 3]).toContain("› fresh");
    expect(f.slice(d.y, d.y + d.h).join("\n")).toMatch(/OK {2}enter.*Cancel {2}esc/);
    expect(f.at(-1)).toContain("READ"); // the status line stays
    // A long answer keeps its end in view.
    for (const ch of "-and-a-rather-long-name-to-type-in-here-far-past-the-width-of-the-window-and-its-end")
      await h.keys(ch);
    expect(h.frame().split("\n")[d.y + 3]).toContain("its-end");
    clickHot(h, "dlg:cancel");
    expect(h.app.overlay).toBeNull();
    expect(
      existsSync(
        join(
          root,
          "notes",
          "fresh-and-a-rather-long-name-to-type-in-here-far-past-the-width-of-the-window-and-its-end.md",
        ),
      ),
    ).toBe(false);
    // OK, clicked: done.
    await h.keys("ctrl+n");
    for (const ch of "fresh") await h.keys(ch);
    clickHot(h, "dlg:ok");
    expect(existsSync(join(root, "notes", "fresh.md"))).toBe(true);
    // A click outside the window cancels.
    await h.keys("escape", "ctrl+n");
    for (const ch of "other") await h.keys(ch);
    click(h, 1, h.app.geometry!.dialog!.y + h.app.geometry!.dialog!.h + 2);
    expect(h.app.overlay).toBeNull();
    expect(existsSync(join(root, "notes", "other.md"))).toBe(false);
    // A screen too small for the window: over the status line, as before.
    const small = await harness({ root, open: "notes/alpha.md", height: 8 });
    await small.keys("ctrl+n");
    expect(small.app.geometry!.dialog ?? null).toBeNull();
    expect(statusRow(small.frame())).toContain("new note in notes/");
  });

  test("a yes-or-no: y and n answer, the buttons too; enter isn't an answer", async () => {
    const root = makeVault();
    const h = await harness({ root, open: "notes/alpha.md" });
    let asked = 0;
    const said: { v: boolean | null } = { v: null };
    const question = () => {
      asked++;
      h.app.overlays.confirm(
        "Really?",
        () => (said.v = true),
        () => (said.v = false),
      );
    };
    question();
    let f = h.frame().split("\n");
    const d = h.app.geometry!.dialog!;
    expect(f[d.y + 2]).toContain("Really?");
    expect(f.slice(d.y, d.y + d.h).join("\n")).not.toContain("›"); // nothing to type
    await h.keys("enter", "x");
    expect(ask(h).confirm).toBe(true);
    await h.keys("n");
    expect(said.v).toBe(false);
    question();
    await h.keys("y");
    expect(said.v).toBe(true);
    question();
    h.frame();
    clickHot(h, "dlg:cancel");
    expect(said.v).toBe(false);
    question();
    h.frame();
    clickHot(h, "dlg:ok");
    expect(said.v).toBe(true);
    expect(asked).toBe(4);
    // Too small to float: the status line says how to answer.
    const small = await harness({ root, open: "notes/alpha.md", height: 8 });
    small.app.overlays.confirm("Really?", () => {});
    f = small.frame().split("\n");
    expect(f.at(-1)).toContain("Really? y / n");
  });

  test("ctrl+shift+n makes a folder, as space d n does", async () => {
    const root = makeVault();
    const h = await harness({ root, open: "notes/alpha.md" });
    await h.keys("ctrl+shift+n");
    expect(ask(h).label).toBe("new folder in notes/");
    for (const ch of "ideas") await h.keys(ch);
    await h.keys("enter");
    expect(existsSync(join(root, "notes", "ideas"))).toBe(true);
  });
});
