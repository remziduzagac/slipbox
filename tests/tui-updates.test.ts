// The TUI's side of upgrading and restarting (UPG): the dialog of choices and checkboxes.
import { describe, expect, test } from "bun:test";
import { openDialog, type DialogOverlay } from "../src/tui/dialog.ts";
import { PASTE } from "../src/tui/vim.ts";
import { harness, makeSandbox } from "./tui-harness.ts";

makeSandbox();

/** The update offer's shape: three choices, a checkbox that goes with the last. */
function offer(h: Awaited<ReturnType<typeof harness>>, unasked = false) {
  const answers: { choice: string; ticked: string[] }[] = [];
  let cancelled = 0;
  const o = openDialog(h.app, {
    title: "slipbox 0.6.0 is out",
    text: "This is 0.5.0.",
    choices: [
      { id: "now", label: "Upgrade and restart", help: "Quits, upgrades and starts 0.6.0 where you were." },
      { id: "later", label: "Upgrade, restart later", help: "Upgrades beside the TUI; :restart starts it." },
      { id: "not", label: "Not now", help: "Asked again at the next check." },
    ],
    checkboxes: [
      {
        id: "skip",
        label: "Skip this version",
        help: "Not asked again until a newer one.",
        ticked: false,
        with: ["not"],
      },
    ],
    escape: "not now",
    unasked,
    done: (choice, ticked) => answers.push({ choice, ticked: [...ticked] }),
    cancel: () => cancelled++,
  });
  return { o, answers, cancelled: () => cancelled };
}

describe("the dialog (UPG-T3)", () => {
  test("drawn framed: its text, its choices with the first marked, its checkbox, the row's help, its keys", async () => {
    const h = await harness();
    offer(h);
    const f = h.frame();
    expect(f).toContain("slipbox 0.6.0 is out");
    expect(f).toContain("This is 0.5.0.");
    expect(f).toContain("● Upgrade and restart");
    expect(f).toContain("○ Upgrade, restart later");
    expect(f).toContain("○ Not now");
    expect(f).toContain("☐ Skip this version");
    expect(f).toContain("Quits, upgrades and starts 0.6.0 where you were.");
    expect(f).toContain("enter: do it · space: tick · esc: not now");
  });

  test("keys: the cursor moves over the choices and the checkbox, marking a choice; space ticks; enter does it", async () => {
    const h = await harness();
    const { o, answers } = offer(h);
    let f = await h.keys("j");
    expect(f).toContain("● Upgrade, restart later");
    expect(f).toContain("Upgrades beside the TUI; :restart starts it.");
    // Onto the checkbox: Not now stays marked; its help shown; space ticks it.
    f = await h.keys("tab", "down", "space");
    expect(o.chosen).toBe(2);
    expect(f).toContain("● Not now");
    expect(f).toContain("☑ Skip this version");
    expect(f).toContain("Not asked again until a newer one.");
    // Wrapping: from the checkbox down to the first choice; the checkbox dimmed there, so not taken.
    await h.keys("ctrl+n");
    expect(o.cursor).toBe(0);
    await h.keys("enter");
    expect(answers).toEqual([{ choice: "now", ticked: [] }]);
    expect(h.app.overlay).toBeNull();
  });

  test("a dimmed checkbox doesn't tick; with its choice, it's taken; up wraps to the last row", async () => {
    const h = await harness();
    const { o, answers } = offer(h);
    await h.keys("k");
    expect(o.cursor).toBe(3);
    expect(o.chosen).toBe(0);
    await h.keys("space");
    expect(o.checkboxes[0]!.ticked).toBe(false);
    await h.keys("k", "j", "space", "enter");
    expect(answers).toEqual([{ choice: "not", ticked: ["skip"] }]);
  });

  test("esc cancels; a paste does nothing", async () => {
    const h = await harness();
    const { cancelled } = offer(h);
    await h.app.input.handleKey(`${PASTE}not a note`);
    expect(h.app.overlay?.kind).toBe("dialog");
    await h.keys("escape");
    expect(h.app.overlay).toBeNull();
    expect(cancelled()).toBe(1);
  });

  test("the mouse: a click on a choice does it, on the checkbox ticks it, outside cancels", async () => {
    const h = await harness();
    const { o, answers, cancelled } = offer(h);
    h.frame();
    const rows = () => h.app.geometry!.choices!.rows;
    const click = (x: number, y: number) => h.app.mouse.handle({ type: "down", x, y, button: 0 });
    const box = rows()[3]!;
    click(box.x + 2, box.y);
    expect(o.checkboxes[0]!.ticked).toBe(false); // dimmed: Upgrade and restart is marked
    const not = rows()[2]!;
    h.app.mouse.handle({ type: "move", x: not.x, y: not.y, button: 0 });
    expect(h.app.overlay).not.toBeNull();
    click(not.x + 2, not.y);
    expect(answers).toEqual([{ choice: "not", ticked: [] }]);
    const again = offer(h);
    h.frame();
    click(0, 0);
    expect(h.app.overlay).toBeNull();
    expect(again.cancelled()).toBe(1);
    expect(cancelled()).toBe(0);
  });

  test("opened on its own, it drops the keys and clicks that arrived in its first half second, by when they arrived", async () => {
    let clock = 1_000_000;
    const h = await harness({ now: () => clock });
    const { o, answers } = offer(h, true);
    // A key typed for the note as it opened: dropped, however late its turn comes.
    clock += 300;
    await h.keys("enter");
    expect(h.app.overlay).toBe(o as DialogOverlay);
    await h.app.overlays.key(o, "enter", o.openedAt - 50);
    expect(h.app.overlay).not.toBeNull();
    h.frame();
    const first = h.app.geometry!.choices!.rows[0]!;
    h.app.mouse.handle({ type: "down", x: first.x + 2, y: first.y, button: 0 });
    expect(answers).toEqual([]);
    // Half a second on: answered.
    clock += 300;
    await h.keys("j", "enter");
    expect(answers).toEqual([{ choice: "later", ticked: [] }]);
    // Asked for: answered at once.
    const asked = offer(h, false);
    await h.keys("enter");
    expect(asked.answers).toEqual([{ choice: "now", ticked: [] }]);
  });

  test("a key that arrived as it opened is dropped though its turn comes later (queued behind one a parse held)", async () => {
    let clock = 1_000_000;
    const h = await harness({ now: () => clock });
    const { o, answers } = offer(h, true);
    let parsed = () => {};
    const parse = new Promise<void>((r) => (parsed = r));
    h.app.views.parses.add(parse);
    clock += 50;
    const first = h.app.input.handleKey("j");
    const second = h.app.input.handleKey("enter");
    clock += 2000;
    h.app.views.parses.delete(parse);
    parsed();
    await Promise.all([first, second]);
    expect(answers).toEqual([]);
    expect(o.cursor).toBe(0);
    expect(h.app.overlay?.kind).toBe("dialog");
  });

  test("ASCII's glyphs: (*) and ( ), [ ] and [x]", async () => {
    const h = await harness({ config: (c) => (c.render.glyphs = "ascii") });
    offer(h);
    const f = await h.keys("j", "j", "j", "space");
    expect(f).toContain("(*) Not now");
    expect(f).toContain("( ) Upgrade and restart");
    expect(f).toContain("[x] Skip this version");
  });
});
