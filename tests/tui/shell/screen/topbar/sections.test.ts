// The top bar's sections (#104, D269): the branding and an upgrade's badge at the left, both About; Where you are at
// the right, next to the work and the messages; About's basics, run from it with the keys as you have them.

import { describe, expect, test } from "bun:test";
import type { ListOverlay } from "../../../../../src/tui/app/runtime/app.ts";
import { harness, makeSandbox, topRow, type Harness } from "../../../../tui-harness.ts";

makeSandbox();

/** A hot region drawn this frame. */
const hot = (h: Harness, id: string) => {
  h.frame();
  return h.app.geometry!.hot.find((r) => r.id === id);
};
const click = (h: Harness, id: string) => {
  const r = hot(h, id)!;
  h.app.mouse.handle({ type: "down", x: r.x, y: r.y, button: 0 });
  h.app.mouse.handle({ type: "up", x: r.x, y: r.y, button: 0 });
  h.frame();
};
const list = (h: Harness) => h.app.overlay as ListOverlay;

describe("the top bar's sections (#104)", () => {
  test("the messages said since their list was opened, counted beside the work, coloured by the worst of them", async () => {
    const h = await harness({ width: 160 });
    const segment = () => {
      const r = hot(h, "top:messages")!;
      return {
        text: topRow(h.frame())
          .slice(r.x, r.x + r.w)
          .trim(),
        fg: h.canvas().styles[r.y]![r.x + 1]!.fg,
      };
    };
    const roles = h.app.theme.roles;
    expect(segment()).toEqual({ text: "✉ 0", fg: roles.status_dim.fg! });
    h.app.message("info", "copied");
    expect(segment()).toEqual({ text: "✉ 1", fg: roles.topbar.fg ?? h.app.theme.fg });
    h.app.message("warn", "a link is broken");
    expect(segment()).toEqual({ text: "✉ 2", fg: roles.problem_warn.fg! });
    h.app.message("error", "the save failed");
    expect(segment().fg).toBe(roles.problem_error.fg!);
    // A click opens the list: all of it seen, the count back to 0.
    click(h, "top:messages");
    expect(list(h).title).toBe("Messages");
    await h.keys("escape");
    expect(segment().text).toBe("✉ 0");
    // space m too.
    h.app.message("info", "saved");
    await h.keys("space", "m", "escape");
    expect(segment().text).toBe("✉ 0");
  });

  test("Where you are at the right, right next to the work and the messages, which end the bar", async () => {
    const h = await harness({ width: 160, config: (c) => (c.ui.left_rail = false) });
    const vault = hot(h, "top:vault")!;
    const work = hot(h, "top:work")!;
    const messages = hot(h, "top:messages")!;
    // The vault's segment ends the section (no repository here), one cell and the section's ends from the work's.
    expect(work.x - (vault.x + vault.w)).toBeLessThanOrEqual(4);
    expect(messages.x).toBeGreaterThan(work.x);
    expect(topRow(h.frame()).trimEnd().endsWith("✉ 0")).toBe(true);
    expect(topRow(h.frame()).slice(0, 12)).toBe(" slipbox    ");
  });

  test("About's basics: what it is; help and the palette run from it, the which-key's leader, all as configured", async () => {
    const h = await harness({
      width: 160,
      config: (c) => {
        c.input.leader = ",";
        c.keys = { "leader h": "help.open" };
      },
    });
    click(h, "top:brand");
    const rows = list(h).items;
    expect(rows[0]!.label).toBe("Read, review and edit what your coding agent writes, in your terminal.");
    const row = (label: string) => rows.find((r) => r.label.startsWith(label))!;
    expect(row("All keys and commands").keys).toContain(", h");
    expect(row("The which-key").keys).toEqual([","]);
    expect(row("The which-key").informational).toBe(true);
    // Enter on a basic runs it: the palette, then (About again) help.
    list(h).selected = rows.indexOf(row("The command palette"));
    await h.keys("enter");
    expect(list(h).title).not.toBe("About slipbox");
    expect(h.app.overlay?.kind).toBe("list");
    await h.keys("escape");
    await h.app.run("app.about");
    list(h).selected = list(h).items.indexOf(list(h).items.find((r) => r.data === "help.open")!);
    await h.keys("enter");
    expect(h.app.overlay && "title" in h.app.overlay ? h.app.overlay.title : null).not.toBe("About slipbox");
  });
});
