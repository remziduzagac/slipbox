import { describe, expect, test } from "bun:test";
import { TextCanvas } from "../../../../src/tui/shell/terminal/canvas.ts";
import { makeSandbox, harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("what keymap.md and tui.md promise (review: docs against the tests)", () => {
  test("messages: four boxes at most; info marked ·, unless it brings its own symbol; 4 s, an error 8 s", async () => {
    const h = await harness({ width: 120, height: 40 });
    let now = 1_000_000;
    (h.app as unknown as { now: () => number }).now = () => now;
    const boxes = () => (h.frame(), h.app.geometry!.hot.filter((r) => r.id.startsWith("toast:")));
    const boxText = (i: number) => {
      const b = boxes()[i]!;
      return h
        .frame()
        .split("\n")
        [b.y + 1]!.slice(b.x, b.x + b.w);
    };
    h.app.message("error", "first, an error");
    h.app.message("info", "plain info");
    expect(boxText(0)).toContain("· plain info");
    h.app.message("info", "↻ notes/alpha.md reloaded");
    expect(boxText(0)).toContain("│ ↻ notes/alpha.md reloaded");
    expect(boxText(0)).not.toContain("·");
    h.app.message("warn", "a fourth");
    h.app.message("warn", "a fifth");
    expect(boxes()).toHaveLength(4);
    expect(h.app.toasts.map((t) => t.text)).toEqual(["a fifth", "a fourth", "↻ notes/alpha.md reloaded", "plain info"]);
    expect(h.app.messages.some((m) => m.text === "first, an error")).toBe(true); // in the list still
    // Times: an info message goes after 4 s, an error stays 8 s — from when they're drawn.
    h.app.dismissToasts();
    h.app.message("error", "broke");
    h.app.message("info", "fyi");
    h.frame();
    now += 4_001;
    h.app.message("info", "later");
    expect(h.app.toasts.map((t) => t.text)).toEqual(["later", "broke"]); // the info gone after 4 s
    now += 3_000;
    h.app.message("info", "at 7 s");
    expect(h.app.toasts.map((t) => t.text)).toEqual(["at 7 s", "later", "broke"]); // the error still
    now += 999;
    h.app.message("info", "at 8 s");
    expect(h.app.toasts.map((t) => t.text)).toEqual(["at 8 s", "at 7 s", "later"]); // gone after 8 s
    // Said while slipbox was busy, no frame drawn for longer than it shows (#40): still there to be seen, then its 4 s.
    h.app.dismissToasts();
    h.app.message("warn", "said while busy");
    now += 10_000;
    h.app.message("info", "next");
    expect(h.app.toasts.map((t) => t.text)).toEqual(["next", "said while busy"]);
    expect(h.frame()).toContain("said while busy");
    now += 3_999;
    h.frame(); // drawn again: its time still counts from the first
    expect(h.app.toasts.map((t) => t.text)).toContain("said while busy");
    now += 1;
    h.app.message("info", "then gone");
    expect(h.app.toasts.map((t) => t.text)).toEqual(["then gone"]);
  });

  test("a message asks for its frame as it's said, wherever from; one said while a frame is drawn asks for none, the next one does", async () => {
    const h = await harness({ width: 80, height: 24 });
    // The frames asked for by a message itself, not by whatever else is going on.
    let saying = false;
    let frames = 0;
    h.app.host.requestRender = () => void (saying && frames++);
    const say = h.app.message.bind(h.app);
    h.app.message = (...m: Parameters<typeof h.app.message>) => {
      saying = true;
      try {
        say(...m);
      } finally {
        saying = false;
      }
    };
    h.app.message("info", "said in the background");
    expect(frames).toBe(1);
    // A frame that fails says so while it's drawn: it asks for no other frame from inside one.
    const canvas = new TextCanvas(80, 24);
    let broken = true;
    for (const k of ["cell", "ascii"] as const) {
      const real = canvas[k].bind(canvas) as (...a: unknown[]) => void;
      (canvas as unknown as Record<string, (...a: unknown[]) => void>)[k] = (...a) => {
        if (broken) {
          broken = false;
          throw new Error("a broken cell");
        }
        real(...a);
      };
    }
    frames = 0;
    h.app.draw(canvas);
    expect(h.app.messages.at(-1)?.text).toBe("drawing failed: a broken cell");
    expect(frames).toBe(0);
    // The frame over, a message asks for one again.
    h.app.message("info", "said after it");
    expect(frames).toBe(1);
    // Said anywhere a frame is painted (the host paints around App.draw too): none.
    frames = 0;
    h.app.whileDrawing(() => h.app.message("info", "said while painting"));
    expect(frames).toBe(0);
    // A paint that fails outside App.draw (the host's own part of it): over all the same, the next message asks.
    expect(() =>
      h.app.whileDrawing(() => {
        throw new Error("the host's paint failed");
      }),
    ).toThrow("the host's paint failed");
    h.app.message("info", "said after a failed paint");
    expect(frames).toBe(1);
  });
});
