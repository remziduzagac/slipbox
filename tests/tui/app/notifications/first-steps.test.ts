import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, rmSync } from "node:fs";
import {
  firstStepsFile,
  firstStepsText,
  notBoundHelp,
  showFirstSteps,
} from "../../../../src/tui/app/notifications/first-steps.ts";
import { firstStepsMarker } from "../../../terminal/first-steps-seen.ts";
import { harness } from "../../../tui-harness.ts";
import { makeSandbox } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

const fresh = async () => {
  rmSync(firstStepsFile(), { force: true });
  return harness({ open: "index.md", width: 120, height: 40 });
};
const hintBoxes = (h: Awaited<ReturnType<typeof fresh>>) => (h.frame(), h.app.toasts.filter((t) => t.sticky));

describe("first steps (FR1, FR4)", () => {
  test("the keys that start typing are the view's: i i from READ, i from the lens and source", async () => {
    const h = await fresh();
    const view = h.app.view!;
    view.live = false;
    view.source = false;
    h.app.config.editor.edit_in = "lens";
    expect(firstStepsText(h.app)).toBe(
      "To begin: i i types (the first opens the lens) · space menu · ? keys · : commands",
    );
    expect(notBoundHelp(h.app)).toBe("type with i i, ? lists keys");
    view.live = true;
    expect(firstStepsText(h.app)).toBe("To begin: i types · space menu · ? keys · : commands");
    expect(notBoundHelp(h.app)).toBe("type with i, ? lists keys");
    view.live = false;
    view.source = true;
    expect(notBoundHelp(h.app)).toBe("type with i, ? lists keys");
    view.source = false;
    h.app.config.editor.edit_in = "source";
    expect(notBoundHelp(h.app)).toBe("type with i, ? lists keys");
  });

  test("a note that cannot be edited names no typing keys", async () => {
    const h = await fresh();
    h.app.view!.buf.readOnly = "a peek is read-only";
    expect(firstStepsText(h.app)).toBe("To begin: space menu · ? keys · : commands");
    expect(notBoundHelp(h.app)).toBe("? lists keys");
  });

  test("shown once: recorded as it shows, never again", async () => {
    const h = await fresh();
    showFirstSteps(h.app);
    expect(hintBoxes(h).map((t) => t.text)).toEqual([firstStepsText(h.app)!]);
    expect(readFileSync(firstStepsFile(), "utf8")).toBe("shown\n");
    h.app.notifications.dropHint();
    expect(hintBoxes(h)).toEqual([]);
    const again = await harness({ open: "index.md", width: 120, height: 40 });
    showFirstSteps(again.app);
    expect(hintBoxes(again)).toEqual([]);
  });

  test("a key handled before it would show: not shown, and not recorded, so the next start shows it", async () => {
    const h = await fresh();
    await h.keys("j");
    showFirstSteps(h.app);
    expect(hintBoxes(h)).toEqual([]);
    expect(existsSync(firstStepsFile())).toBe(false);
  });

  test("four messages after it leave it showing", async () => {
    const h = await fresh();
    showFirstSteps(h.app);
    for (const n of ["a", "b", "c", "d"]) h.app.message("info", `message ${n}`);
    expect(h.app.toasts).toHaveLength(4);
    expect(h.app.toasts.some((t) => t.sticky)).toBe(true);
    expect(h.app.toasts.filter((t) => !t.sticky).map((t) => t.text)).toEqual(["message d", "message c", "message b"]);
  });

  test("a click or a scroll puts it away like a key; a click on it opens no empty messages list", async () => {
    for (const ev of [{ type: "scroll", scroll: { direction: "down", delta: 1 } }, { type: "down" }]) {
      const h = await fresh();
      showFirstSteps(h.app);
      const box = (h.frame(), h.app.geometry!.hot.find((r) => r.id === "toast:0")!);
      h.app.mouse.handle({
        ...ev,
        x: ev.type === "down" ? box.x + 1 : 40,
        y: ev.type === "down" ? box.y + 1 : 10,
        button: 0,
      });
      await new Promise((r) => setTimeout(r, 20)); // a command opened by the click would be up by now
      expect(hintBoxes(h)).toEqual([]);
      expect(h.app.overlay).toBeNull();
      expect(h.app.toasts.map((t) => t.text)).not.toContain("no messages"); // the empty list's answer
    }
  });

  test("the live harnesses mark it seen where the TUI looks", () => {
    expect(firstStepsMarker("/x/check")).toBe("/x/check/state/slipbox/first-steps");
    for (const file of ["tests/terminal/session.ts", "tests/terminal/herdr/session.ts"])
      expect(readFileSync(file, "utf8")).toContain("markFirstStepsSeen(this.dir)");
  });
});
