import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, test } from "bun:test";
import { DEFAULT_GROUPS, DEFAULT_KEYS, keyChar, parseGroup } from "../../../../src/tui/shell/input/keys.ts";
import { makeSandbox, harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("which-key", () => {
  test("the leader shows the popup at once, with group names; backspace goes up; esc cancels", async () => {
    const h = await harness();
    const f = await h.keys("space");
    expect(h.app.input.whichKey).toBe(true);
    expect(f).toContain("+links");
    expect(f).toContain("+history");
    const f2 = await h.keys("l");
    expect(f2).toContain("links");
    expect(f2).toContain("Backlinks");
    await h.keys("backspace");
    expect(h.app.pending).toEqual(["space"]);
    await h.keys("escape");
    expect(h.app.pending).toEqual([]);
    expect(h.app.input.whichKey).toBe(false);
  });
  test("layout: framed like the other popups; at most three columns of key → name + explanation", async () => {
    const h = await harness({ width: 160, height: 40 });
    await h.keys("space");
    const rows = h.frame().split("\n");
    const head = rows.findIndex((r) => r.includes("┌─ ␣ › leader "));
    expect(head).toBeGreaterThan(0);
    const left = rows[head]!.indexOf("┌");
    expect(rows[head + 1]!.slice(left + 1, rows[head + 1]!.lastIndexOf("│")).trim()).toBe(""); // a blank row inside, above
    expect(rows[head + 2]!.slice(left)).toMatch(/^│ \S+ +→ \+\w+/);
    expect(rows[head + 3]).toContain("rename, actions, format"); // +code's explanation, under its name
    const arrows = rows[head + 2]!.split("→").length - 1;
    expect(arrows).toBeLessThanOrEqual(3);
    const foot = rows.findIndex((r, i) => i > head && r.includes("└"));
    expect(rows[foot]).toContain("backspace up · esc cancel"); // the hint in the bottom border
    expect(rows[foot - 1]!.slice(left + 1, rows[foot - 1]!.lastIndexOf("│")).trim()).toBe(""); // and a blank row above it
    // The same margin as the other popups: a row above and below, two columns aside.
    expect(rows[head - 1]!.slice(left - 2, left + 10).trim()).toBe("");
    expect(rows[head + 2]!.slice(left - 2, left)).toBe("  ");
    const status = rows.length - 1;
    expect(rows[status - 1]!.startsWith("━━━")).toBe(true); // the frame's bottom rule
    expect(
      rows[status - 2]!.slice(
        h.app.panels.leftRailWidth,
        rows[status - 2]!.length - h.app.panels.rightRailWidth,
      ).trim(),
    ).toBe(""); // the popup's margin row (between the rails)
    // Centred.
    const right = rows[head]!.lastIndexOf("┐");
    expect(Math.abs(left - (160 - 1 - right))).toBeLessThanOrEqual(1);
  });
  test("keys with the same action share an entry; short screens drop the explanations", async () => {
    const h = await harness({ width: 160, height: 40 });
    const f = await h.keys("space", "w", "r");
    expect(f).toContain("h left");
    expect(f).toContain("q enter escape");
    const short = await harness({ width: 60, height: 14 });
    const s2 = await short.keys("space");
    expect(s2).toContain("+find");
    expect(s2).not.toContain("notes, headings, tags, text, commands");
  });
  test("group names and explanations come from [groups]", async () => {
    const h = await harness({ config: (c) => (c.groups = { "leader l": "LINKS: everything about links" }) });
    const f = await h.keys("space");
    expect(f).toContain("+LINKS");
    expect(f).toContain("everything about links");
  });
  test("leader explanations survive the About and Background entries at normal terminal size", async () => {
    const h = await harness({ width: 120, height: 30 });
    const f = await h.keys("space");
    expect(f).toContain("About slipbox");
    expect(f).toContain("Background work");
    expect(f).toContain("rename, actions, format");
    expect(f).not.toContain("more ·");
    const popup = h.app.geometry!.popup!;
    expect(popup.x).toBeGreaterThanOrEqual(0);
    expect(popup.x + popup.w).toBeLessThanOrEqual(120);
  });
  test("the explanations of g, z, [ and ] name every key under them", () => {
    for (const prefix of ["g", "z", "[", "]"]) {
      const { desc } = parseGroup(DEFAULT_GROUPS[prefix]!);
      const named = [...desc.matchAll(/\(([^)]*)\)/g)].flatMap((m) => m[1]!.split(" "));
      const under = Object.keys(DEFAULT_KEYS)
        .filter((k) => k.startsWith(`${prefix} `))
        .map((k) => keyChar(k.slice(prefix.length + 1)) ?? k);
      for (const k of under) expect([prefix, k, named.includes(k)]).toEqual([prefix, k, true]);
    }
  });
  test("a top-level prefix's popup says its group's explanation in its title, which nothing else shows (DF-D31)", async () => {
    const h = await harness({
      width: 200,
      height: 40,
      config: (c) => (
        (c.input.which_key_delay_ms = 10),
        (c.keys = { "g q a": "note.save" }),
        (c.groups = { y: "yank: what's copied", "g q": "quick: a group under g" })
      ),
    });
    const title = async (...keys: string[]) => {
      await h.keys(...keys);
      await new Promise((r) => setTimeout(r, 40));
      const row = h
        .frame()
        .split("\n")
        .find((r) => r.includes("┌─ "));
      await h.keys("escape");
      return row?.slice(row.indexOf("┌─ ") + 3, row.lastIndexOf(" ─")).trim();
    };
    for (const prefix of ["z", "[", "]", "g"]) {
      const { name, desc } = parseGroup(DEFAULT_GROUPS[prefix]!);
      expect(await title(prefix)).toBe(`${prefix} › ${name}: ${desc}`); // the box as wide as it, room allowing
    }
    expect(await title("y")).toBe("y › yank: what's copied"); // [groups]' too
    // Under the leader or another prefix, a group's explanation is in the popup above it, beside its name: the title
    // its name alone.
    expect(await title("space", "l")).toBe("␣ l › links");
    expect(await title("g", "q")).toBe("g q › quick");
    // A narrower screen cuts it, in the popup's width.
    const narrow = await harness({ width: 90, height: 40, config: (c) => (c.input.which_key_delay_ms = 10) });
    await narrow.keys("z");
    await new Promise((r) => setTimeout(r, 40));
    const row = narrow
      .frame()
      .split("\n")
      .find((r) => r.includes("┌─ "))!;
    expect(row).toContain("z › scroll: the cursor's line");
    expect(row).toContain("…");
    expect(row.trimEnd().endsWith("┐")).toBe(true);
  });
  test("other prefixes show it only after the delay", async () => {
    const h = await harness({ config: (c) => (c.input.which_key_delay_ms = 50) });
    await h.keys("y");
    expect(h.app.input.whichKey).toBe(false);
    await new Promise((r) => setTimeout(r, 90));
    expect(h.app.input.whichKey).toBe(true);
    expect(h.frame()).toContain("Copy note path");
  });
});

describe("review round 1", () => {
  test("which-key on a tiny screen stays inside its box and says what's hidden", async () => {
    const h = await harness({ width: 60, height: 14 });
    const rows = (await h.keys("space")).split("\n");
    const top = rows.findIndex((r) => r.includes("┌─"));
    const bottom = rows.findIndex((r, i) => i > top && r.includes("└"));
    const right = rows[top]!.lastIndexOf("┐");
    for (let y = top; y <= bottom; y++)
      expect(
        rows[y]!.slice(right + 1)
          .replace(/[▐┃━▤¹]/g, "")
          .trim(),
      ).toBe(""); // borders, the right rail
    expect(rows[bottom]).toMatch(/\+\d+ more/);
  });
  test(
    "which-key on a short screen drops its blank rows before its explanations",
    async () => {
      // At every height: blank rows inside the box only ever appear together with the explanations.
      for (let height = 12; height <= 40; height++) {
        const h = await harness({ width: 160, height });
        const rows = (await h.keys("space")).split("\n");
        const head = rows.findIndex((r) => r.includes("┌─ ␣ › leader"));
        if (head < 0) continue;
        const left = rows[head]!.indexOf("┌");
        const padded = rows[head + 1]!.slice(left + 1, rows[head + 1]!.lastIndexOf("│")).trim() === "";
        const described = rows.join("\n").includes("notes, headings, tags, text, commands");
        if (padded) expect(described).toBe(true);
      }
    },
    UNIT_TIMEOUT_MS,
  ); // 29 harnesses
});

describe("review round 2", () => {
  test("a which-key entry takes its click, not what's under the popup", async () => {
    const h = await harness({ open: "samples/people/partners-and-names.md", width: 120, height: 30 });
    await h.keys("ctrl+w", "s", "ctrl+w", "j");
    await h.keys("space");
    h.frame();
    for (const r of h.app.geometry!.hot.filter((x) => x.id.startsWith("wk:"))) {
      const at = h.app.geometry!.hot.find(
        (x) => x.x <= r.x + 1 && r.x + 1 < x.x + x.w && x.y <= r.y && r.y < x.y + x.h,
      )!;
      expect(at.id).toBe(r.id);
    }
  });
});

describe("review cycle 5 (TUI journeys: narrow screens)", () => {
  test("which-key on a narrow screen: every entry's click area is inside the box; a hover keeps its border", async () => {
    const h = await harness({ width: 40, height: 12 });
    await h.keys("space");
    const wk = h.app.geometry!.hot.filter((r) => r.id.startsWith("wk:"));
    expect(wk.length).toBeGreaterThan(0);
    const right = (y: number) => h.canvas().rows[y]!.lastIndexOf("│"); // the box's right border
    for (const r of wk) expect(r.x + r.w).toBeLessThanOrEqual(right(r.y));
    const last = wk.reduce((a, b) => (a.x + a.w > b.x + b.w ? a : b));
    const border = right(last.y);
    h.app.mouse.handle({ type: "move", x: last.x, y: last.y, button: 0 });
    h.frame();
    expect(h.canvas().rows[last.y]![border]).toBe("│");
  });
});
