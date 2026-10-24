// The window header (HDR): the row atop each window — a split's name, the breadcrumb, the mode's buttons, ▤ — its
// buttons as a radio group (HDR-D2), the two settings that hide the breadcrumb and the header apart (HDR-D3), and how
// the buttons give way in a narrow window (HDR-D4). Driven headlessly through the harness (tests/tui-harness.ts).

import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { commandGroup, COMMAND_SPECS } from "../src/core/command-specs.ts";
import { TextCanvas } from "../src/tui/canvas.ts";
import { BACKGROUND_PARSE } from "../src/tui/buffer.ts";
import { crumbLeast, type Geometry } from "../src/tui/draw.ts";
import { modeButtons } from "../src/tui/draw-header.ts";
import { drawPane } from "../src/tui/draw-pane.ts";
import { openDiff } from "../src/tui/diffview.ts";
import { type ViewMode, viewMode } from "../src/tui/lens.ts";
import { type Harness, harness, makeSandbox, statusRow } from "./tui-harness.ts";

makeSandbox();

const NOTE = "samples/handbook/operations-handbook.md";
const TEXT = "notes/plain.txt"; // a text file: no rendered view (written by `textHarness`)
const PYTHON = "samples/software/halley/reduce.py"; // code as a document
const YAML = "samples/software/halley/targets.yaml";
const BROKEN = "samples/scratch/broken-config.json";

type Button = {
  id: string;
  x: number;
  y: number;
  w: number;
  label: string;
  state: "selected" | "enabled" | "disabled";
};

/** Window `w`'s mode buttons as drawn: each one's label and whether it's selected, enabled or disabled, by its colour. */
function buttons(h: Harness, w = 0): Button[] {
  const c = h.canvas(); // one frame, drawn once: the buttons as it shows them
  const r = h.app.theme.roles;
  return h.app
    .geometry!.hot.filter((b) => b.id.startsWith(`mode:${w}:`))
    .map((b) => {
      const fg = c.styles[b.y]![b.x + 1]!.fg;
      const state =
        fg === r.topbar_button_on.fg ? "selected" : fg === r.topbar_button_disabled.fg ? "disabled" : "enabled";
      return {
        ...b,
        label: c.rows[b.y]!.slice(b.x, b.x + b.w)
          .join("")
          .trim(),
        state,
      };
    });
}

/** The selected button's label, and every button's state, as `Read:selected Lens:enabled …`. */
const states = (h: Harness, w = 0) =>
  buttons(h, w)
    .map((b) => `${b.label}:${b.state}`)
    .join(" ");

/** A click (down and up) on window `w`'s button for `which`. */
function click(h: Harness, which: "read" | "lens" | "source", w = 0): void {
  h.frame();
  const b = h.app.geometry!.hot.find((x) => x.id === `mode:${w}:${which}`);
  if (!b) throw new Error(`no ${which} button in window ${w}`);
  h.app.mouse.handle({ type: "down", x: b.x + 1, y: b.y, button: 0 });
  h.app.mouse.handle({ type: "up", x: b.x + 1, y: b.y, button: 0 });
}

const lastMessage = (h: Harness) => h.app.messages.at(-1);

/** A harness on a text file of its own vault, which has no rendered view. */
async function textHarness(): Promise<Harness> {
  const h = await harness({ open: NOTE, width: 120, height: 30 });
  writeFileSync(join(h.root, TEXT), "a plain text file\nwith two lines\n");
  await h.app.run(`note.open ${TEXT}`);
  expect(h.app.view!.buf.name).toBe("plain.txt");
  return h;
}

/** Every mode `setViewMode` is asked for, in order. */
function spyModes(h: Harness): ViewMode[] {
  const asked: ViewMode[] = [];
  const set = h.app.lens.setViewMode.bind(h.app.lens);
  h.app.lens.setViewMode = (v, m) => {
    asked.push(m);
    set(v, m);
  };
  return asked;
}

describe("the window header's mode buttons (HDR-D2)", () => {
  test("Read · Lens · Source, one selected, following ctrl+k, space n l, esc and the editing keys", async () => {
    const h = await harness({ open: NOTE, width: 120, height: 30, config: (c) => (c.editor.edit_in = "live") });
    expect(states(h)).toBe("Read:selected Lens:enabled Source:enabled");
    await h.keys("ctrl+k");
    expect(states(h)).toBe("Read:enabled Lens:enabled Source:selected");
    await h.keys("ctrl+k");
    expect(states(h)).toBe("Read:selected Lens:enabled Source:enabled");
    await h.keys("space", "n", "l");
    expect(states(h)).toBe("Read:enabled Lens:selected Source:enabled");
    await h.keys("escape"); // esc in normal mode closes the lens
    expect(states(h)).toBe("Read:selected Lens:enabled Source:enabled");
    // An editing key opens the lens (edit_in = live), and its second press types: typing isn't a mode.
    await h.keys("i", "i");
    expect(h.app.view!.insert).toBe(true);
    expect(statusRow(h.frame())).toContain("INSERT");
    expect(states(h)).toBe("Read:enabled Lens:selected Source:enabled");
    await h.keys("escape");
    expect(states(h)).toBe("Read:enabled Lens:selected Source:enabled");
  });

  test("edit_in = source: an editing key selects Source, kept while typing", async () => {
    const h = await harness({ open: NOTE, width: 120, height: 30 });
    await h.keys("i");
    expect(h.app.view!.insert).toBe(true);
    expect(states(h)).toBe("Read:enabled Lens:enabled Source:selected");
  });

  test("every switch by a click goes straight there, says what the toggles say, and the chip agrees", async () => {
    const h = await harness({ open: NOTE, width: 120, height: 30 });
    const v = h.app.view!;
    const asked = spyModes(h);
    const CHIP = { rendered: "READ", live: "LENS", source: "SOURCE" } as const;
    const SAID = {
      rendered: "rendered",
      live: "the lens: the markdown around the cursor — esc closes it",
      source: "source — the note's markdown",
    } as const;
    const BUTTON = { rendered: "read", live: "lens", source: "source" } as const;
    const modes: ViewMode[] = ["rendered", "live", "source"];
    for (const from of modes)
      for (const to of modes) {
        if (from === to) continue;
        h.app.lens.setViewMode(v, from);
        asked.length = 0;
        click(h, BUTTON[to]);
        expect(viewMode(v)).toBe(to);
        expect(asked).toEqual([to]); // Lens from Source never through Read, and so on
        expect(lastMessage(h)?.text).toBe(SAID[to]);
        expect(statusRow(h.frame())).toContain(` ${CHIP[to]} `);
      }
  });

  test("the selected one clicked changes nothing; while typing, it ends typing as every click does, the text kept", async () => {
    const h = await harness({ open: NOTE, width: 120, height: 30, config: (c) => (c.editor.edit_in = "live") });
    const v = h.app.view!;
    const before = h.app.messages.length;
    click(h, "read");
    expect(viewMode(v)).toBe("rendered");
    expect(h.app.messages.length).toBe(before);
    await h.keys("i", "i", "Z", "q");
    expect(v.insert).toBe(true);
    click(h, "lens");
    expect(viewMode(v)).toBe("live");
    expect(v.insert).toBeFalsy();
    expect(v.buf.dirty).toBe(true);
    expect(v.buf.source).toContain("Zq");
  });

  test("a switch while typing stops typing first; the unsaved changes stay in the buffer", async () => {
    const h = await harness({ open: NOTE, width: 120, height: 30, config: (c) => (c.editor.edit_in = "live") });
    const v = h.app.view!;
    await h.keys("i", "i", "Q", "w");
    click(h, "source");
    expect(viewMode(v)).toBe("source");
    expect(v.insert).toBeFalsy();
    expect(v.buf.dirty).toBe(true);
    expect(v.buf.source).toContain("Qw");
    click(h, "read");
    expect(viewMode(v)).toBe("rendered");
    expect(v.buf.dirty).toBe(true);
  });

  test("a click in the other window of a split focuses it and switches it alone; its selected one only focuses", async () => {
    const h = await harness({ open: NOTE, width: 200, height: 30 });
    await h.keys("ctrl+w", "v");
    await h.app.run(`note.open ${YAML}`);
    const t = h.app.tab!;
    expect(t.views.length).toBe(2);
    const other = 1 - t.active;
    click(h, "source", other);
    expect(t.active).toBe(other);
    expect(viewMode(t.views[other]!)).toBe("source");
    expect(viewMode(t.views[1 - other]!)).toBe("rendered");
    expect(statusRow(h.frame())).toContain(" SOURCE ");
    // The first window's selected Read: focused, nothing else.
    click(h, "read", 1 - other);
    expect(t.active).toBe(1 - other);
    expect(viewMode(t.views[1 - other]!)).toBe("rendered");
    expect(viewMode(t.views[other]!)).toBe("source");
  });

  test("two windows on one file each have their own selection", async () => {
    const h = await harness({ open: NOTE, width: 200, height: 30 });
    await h.keys("ctrl+w", "v");
    const t = h.app.tab!;
    expect(t.views[0]!.buf).toBe(t.views[1]!.buf);
    click(h, "source", 1);
    expect(states(h, 1)).toBe("Read:enabled Lens:enabled Source:selected");
    expect(states(h, 0)).toBe("Read:selected Lens:enabled Source:enabled");
  });
});

describe("modes a window can't switch to are disabled (HDR-D2)", () => {
  test("a file with no rendered view: Source alone, Read and Lens disabled, a click saying why", async () => {
    const h = await textHarness();
    const v = h.app.view!;
    expect(states(h)).toBe("Read:disabled Lens:disabled Source:selected");
    for (const which of ["read", "lens"] as const) {
      click(h, which);
      expect(viewMode(v)).toBe("source");
      expect(lastMessage(h)).toMatchObject({ level: "info", text: "plain.txt has no rendered view: source mode" });
    }
  });

  test("code as a document has all three; [render] code = source makes it as a text file", async () => {
    const doc = await harness({ open: PYTHON, width: 120, height: 30 });
    expect(states(doc)).toBe("Read:selected Lens:enabled Source:enabled");
    click(doc, "lens");
    expect(lastMessage(doc)?.text).toBe("the lens: the code around the cursor — esc closes it");
    click(doc, "read");
    expect(lastMessage(doc)?.text).toBe("the code as a document");
    click(doc, "source");
    expect(lastMessage(doc)?.text).toBe("source — the file as written");
    const src = await harness({ open: PYTHON, width: 120, height: 30, config: (c) => (c.render.code = "source") });
    expect(states(src)).toBe("Read:disabled Lens:disabled Source:selected");
    click(src, "read");
    expect(lastMessage(src)?.text).toBe("reduce.py has no rendered view: source mode");
  });

  test("data that parses has all three; data that doesn't, Source alone, a click warning why", async () => {
    const ok = await harness({ open: YAML, width: 120, height: 30 });
    expect(states(ok)).toBe("Read:selected Lens:enabled Source:enabled");
    const bad = await harness({ open: BROKEN, width: 120, height: 30 });
    expect(states(bad)).toBe("Read:disabled Lens:disabled Source:selected");
    click(bad, "lens");
    expect(viewMode(bad.app.view!)).toBe("source");
    expect(lastMessage(bad)?.level).toBe("warn");
    expect(lastMessage(bad)?.text).toMatch(/^broken-config\.json doesn't parse — .+: source mode$/);
  });

  test("data that stops parsing while typed in the lens: Lens kept, Read by the last parse; Source once typing ends", async () => {
    // With the breadcrumb off too: nothing else asks for the layout before the buttons are drawn.
    for (const breadcrumb of [true, false]) {
      const h = await harness({
        open: YAML,
        width: 120,
        height: 30,
        config: (c) => ((c.editor.edit_in = "live"), (c.ui.breadcrumb = breadcrumb)),
      });
      const v = h.app.view!;
      await h.keys("i", "i", ":", " ", "[", "x");
      expect(v.insert).toBe(true);
      // While it's typed into, the buttons go by the last parse (it parsed): never judged mid-typing.
      expect(states(h)).toBe("Read:enabled Lens:selected Source:enabled");
      await h.keys("escape");
      expect(h.app.canRender(v.buf)).toBe(false);
      expect(states(h)).toBe("Read:disabled Lens:disabled Source:selected");
    }
  });

  test("typing in a data file's source parses it no more than before: the header asks no parse of a keystroke", async () => {
    const h = await harness({ open: YAML, width: 120, height: 30 });
    const v = h.app.view!;
    await h.keys("ctrl+k", "o");
    expect(v.insert).toBe(true);
    const parsedAt = () => (v.buf as unknown as { parsedVersion: number }).parsedVersion;
    const before = parsedAt();
    for (const k of ["a", ":", " ", "b"]) {
      await h.keys(k);
      h.frame();
    }
    expect(v.buf.version).toBeGreaterThan(before);
    expect(parsedAt()).toBe(before);
    // Typing over, a small file's buttons are of the text as it is: it parses.
    await h.keys("escape");
    h.frame();
    expect(parsedAt()).toBe(v.buf.version);
  });

  test("a big data file's source: edits in normal mode parse it no more either; the buttons go by its last parse", async () => {
    const h = await harness({ open: NOTE, width: 120, height: 30 });
    const big = `${Array.from({ length: 9000 }, (_, i) => `key${i}: "value number ${i} of a big file"`).join("\n")}\n`;
    expect(big.length).toBeGreaterThan(BACKGROUND_PARSE);
    writeFileSync(join(h.root, "big.yaml"), big);
    await h.app.run("note.open big.yaml");
    const v = h.app.view!;
    await h.keys("ctrl+k");
    const parsedAt = () => (v.buf as unknown as { parsedVersion: number }).parsedVersion;
    const before = parsedAt();
    await h.keys("x", "x");
    expect(states(h)).toBe("Read:enabled Lens:enabled Source:selected");
    expect(parsedAt()).toBe(before);
    // A click asks of the text as it is.
    click(h, "read");
    expect(viewMode(v)).toBe("rendered");
  });

  test("the selected Lens clicked while typing on data that stopped parsing: typing ends, and it's said once", async () => {
    const h = await harness({ open: YAML, width: 120, height: 30, config: (c) => (c.editor.edit_in = "live") });
    const v = h.app.view!;
    await h.keys("i", "i", ":", " ", "[", "x");
    const before = h.app.messages.length;
    click(h, "lens");
    h.frame();
    expect(v.insert).toBeFalsy();
    expect(viewMode(v)).toBe("source");
    expect(h.app.messages.slice(before).map((m) => m.level)).toEqual(["warn"]);
  });

  test("Read clicked while typing on data that stopped parsing: typing ends, the window goes to source mode, said once", async () => {
    const h = await harness({ open: YAML, width: 120, height: 30, config: (c) => (c.editor.edit_in = "live") });
    const v = h.app.view!;
    await h.keys("i", "i", ":", " ", "[", "x");
    const before = h.app.messages.length;
    click(h, "read");
    h.frame();
    expect(viewMode(v)).toBe("source");
    expect(h.app.messages.slice(before).map((m) => m.level)).toEqual(["warn"]);
  });

  test("in a split on one data file, a click in one window while the other's typing breaks it: said once", async () => {
    const h = await harness({ open: YAML, width: 200, height: 30, config: (c) => (c.editor.edit_in = "live") });
    await h.keys("ctrl+w", "v");
    const t = h.app.tab!;
    const [left, right] = [t.views[0]!, t.views[1]!];
    // The left in source mode; the right typing in the lens, breaking the data.
    t.active = 0;
    await h.keys("ctrl+k");
    t.active = 1;
    await h.keys("i", "i", ":", " ", "[", "x");
    expect(right.insert).toBe(true);
    const before = h.app.messages.length;
    click(h, "read", 0); // the left's Read: ending the right's typing says the data doesn't parse
    h.frame();
    expect(viewMode(left)).toBe("source");
    expect(viewMode(right)).toBe("source");
    expect(h.app.messages.slice(before).map((m) => m.level)).toEqual(["warn"]);
    // Clicked again: said again (a click of its own).
    click(h, "read", 0);
    expect(h.app.messages.slice(before).map((m) => m.level)).toEqual(["warn", "warn"]);
  });

  test("a file that stops parsing on a reload: the first frame's buttons say source mode, the breadcrumb off too", async () => {
    for (const breadcrumb of [true, false]) {
      const h = await harness({ open: YAML, width: 120, height: 30, config: (c) => (c.ui.breadcrumb = breadcrumb) });
      expect(states(h)).toBe("Read:selected Lens:enabled Source:enabled");
      writeFileSync(join(h.root, YAML), "a: : [x\n");
      await h.app.run("note.reload");
      expect(viewMode(h.app.view!)).toBe("rendered"); // not laid out again yet
      // One frame: the window laid out (to source mode) before its buttons are drawn, never a frame behind.
      expect(states(h)).toBe("Read:disabled Lens:disabled Source:selected");
    }
  });

  test("a window given another file: Read again for a note after a file with no rendered view, and back", async () => {
    const h = await textHarness();
    expect(states(h)).toBe("Read:disabled Lens:disabled Source:selected");
    await h.app.run(`note.open ${NOTE}`);
    expect(states(h)).toBe("Read:selected Lens:enabled Source:enabled");
    await h.app.run(`note.open ${TEXT}`);
    expect(states(h)).toBe("Read:disabled Lens:disabled Source:selected");
  });

  test("a drawn buffer can switch to nothing, and its floating window has no header", async () => {
    const h = await harness({ open: NOTE, width: 120, height: 30 });
    openDiff(h.app, { before: "a\nb\n", now: "a\nc\n", path: "x.txt", title: "x.txt" });
    const f = h.app.floating!.view;
    expect(f.buf.drawn).toBeDefined();
    for (const m of ["source", "live"] as const)
      expect(h.app.lens.refusal(f, m)).toEqual({ level: "info", text: "a diff is drawn one way" });
    expect(h.app.lens.refusal(f, viewMode(f))).toBeNull(); // the mode it's in is never refused
    h.frame();
    expect(h.app.geometry!.hot.filter((b) => b.id.startsWith("mode:-1:"))).toEqual([]);
  });

  test("Lens.refusal is null for the mode the window is in, and for every mode of a note", async () => {
    const h = await harness({ open: NOTE, width: 120, height: 30 });
    const v = h.app.view!;
    for (const m of ["rendered", "live", "source"] as const) expect(h.app.lens.refusal(v, m)).toBeNull();
    const s = await textHarness();
    expect(s.app.lens.refusal(s.app.view!, "source")).toBeNull();
  });
});

describe("the buttons' hover, and what covers them", () => {
  test("an enabled button is drawn hovered under the mouse; the selected and a disabled one never are", async () => {
    const h = await textHarness();
    const hover = h.app.theme.roles.hover.bg;
    const bgOf = (id: string) => {
      h.app.mouse.hover = id;
      h.frame();
      const b = h.app.geometry!.hot.find((x) => x.id === id)!;
      return h.canvas().styles[b.y]![b.x + 1]!.bg;
    };
    expect(bgOf("mode:0:read")).not.toBe(hover); // disabled
    expect(bgOf("mode:0:source")).not.toBe(hover); // selected
    const n = await harness({ open: NOTE, width: 120, height: 30 });
    n.app.mouse.hover = "mode:0:lens";
    n.frame();
    const b = n.app.geometry!.hot.find((x) => x.id === "mode:0:lens")!;
    expect(n.canvas().styles[b.y]![b.x + 1]!.bg).toBe(n.app.theme.roles.hover.bg ?? null);
  });

  test("the which-key popup over the header: no button under it can be clicked", async () => {
    const h = await harness({ open: NOTE, width: 120, height: 14 });
    h.frame();
    const before = h.app.geometry!.hot.filter((b) => b.id.startsWith("mode:"));
    await h.keys("space");
    h.frame();
    const popup = h.app.geometry!.popup!;
    expect(popup).toBeTruthy();
    const under = (b: { x: number; y: number; w: number }) =>
      b.y >= popup.y && b.y < popup.y + popup.h && b.x + b.w > popup.x && b.x < popup.x + popup.w;
    // The popup lies over the header's buttons (some at least), and none of those can be clicked through it.
    expect(before.filter(under).length).toBeGreaterThan(0);
    expect(h.app.geometry!.hot.filter((b) => b.id.startsWith("mode:") && under(b))).toEqual([]);
  });
});

describe("room: the buttons give way before the breadcrumb's innermost heading (HDR-D4)", () => {
  test("modeButtons: the widest form that leaves the breadcrumb its least room and margins, else the selected letter", () => {
    // No breadcrumb: full from 20 columns, letters from 9, the selected letter from 3.
    expect([20, 19, 9, 8, 3, 2].map((r) => modeButtons(r, 0))).toEqual([
      "full",
      "letters",
      "letters",
      "selected",
      "selected",
      "none",
    ]);
    // A breadcrumb wanting 14 columns, and one at each end: full from 36, letters from 25, the selected letter from 19.
    expect([36, 35, 25, 24, 19, 18, 3, 2].map((r) => modeButtons(r, 14))).toEqual([
      "full",
      "letters",
      "letters",
      "selected",
      "selected",
      "selected",
      "selected",
      "none",
    ]);
  });

  test("crumbLeast: the icon and a space, the innermost heading up to 8 columns, `… ›` before it from two headings", () => {
    const g = { crumb: "›", crumbIcon: "§" };
    expect(crumbLeast([], g)).toBe(0);
    // Never under the 4 columns a breadcrumb is drawn in: a heading one column wide keeps its place too.
    expect(crumbLeast([{ text: "A" }], g)).toBe(4);
    expect(modeButtons(25, crumbLeast([{ text: "A" }], g))).toBe("letters");
    expect(crumbLeast([{ text: "Brew" }], g)).toBe(2 + 4);
    expect(crumbLeast([{ text: "Brewing coffee" }], g)).toBe(2 + 8);
    expect(crumbLeast([{ text: "Coffee" }, { text: "Brewing coffee" }], g)).toBe(2 + 4 + 8);
    expect(crumbLeast([{ text: "A" }, { text: "B" }, { text: "Grind" }], g)).toBe(2 + 4 + 5);
  });

  test("a split narrowed: full, then letters, then the selected letter; the name and ▤ keep their places", async () => {
    const h = await harness({
      open: NOTE,
      width: 200,
      height: 30,
      config: (c) => ((c.ui.right_rail = false), (c.ui.sidebar = false)),
    });
    await h.keys("]", "]");
    await h.keys("ctrl+w", "v");
    const t = h.app.tab!;
    const forms = new Set<string>();
    for (const ratio of [0.5, 0.3, 0.2, 0.15, 0.12]) {
      t.ratio = 1 - ratio; // the second window, at the right, narrowed
      const bs = buttons(h, 1);
      forms.add(bs.map((b) => b.label).join(" "));
      h.frame();
      const c = h.canvas();
      const out = h.app.geometry!.hot.find((x) => x.id === "btn:outline")!;
      const pane = h.app.geometry!.panes.find((p) => p.view === t.views[1])!;
      const row = c.rows[out.y]!.join("");
      // ▤ at the far right; the window's name first on its header; the buttons between, ending where ▤ starts.
      expect(out.x + out.w).toBe(200);
      expect(row.slice(pane.x, pane.x + 8)).toBe(` ${h.app.displayName(t.views[1]!.buf).slice(0, 7)}`);
      if (bs.length) expect(bs.at(-1)!.x + bs.at(-1)!.w).toBe(out.x);
    }
    expect([...forms]).toEqual(expect.arrayContaining(["Read Lens Source", "R L S", "R"]));
  });

  test("the breadcrumb keeps its innermost heading while the buttons shorten; then it folds on", async () => {
    const h = await harness({ open: NOTE, width: 160, height: 30, config: (c) => (c.ui.right_rail = false) });
    await h.keys("]", "]", "]", "]");
    const crumbs = h.app.outlineView.breadcrumb(h.app.view!);
    expect(crumbs.length).toBeGreaterThan(1);
    await h.keys("ctrl+w", "v");
    const t = h.app.tab!;
    let lettersSeen = false;
    for (let r = 0.5; r >= 0.12; r -= 0.01) {
      t.ratio = 1 - r;
      const bs = buttons(h, 1);
      if (bs.length === 3 && bs[0]!.label === "R") {
        lettersSeen = true;
        // While the letters show, the breadcrumb keeps the innermost heading (cut to 8 at the least), in this window's
        // own columns (the other window's header shares the row).
        const pane = h.app.geometry!.panes.find((p) => p.view === t.views[1])!;
        const row = h.canvas().rows[bs[0]!.y]!.slice(pane.x, bs[0]!.x).join("");
        expect(row).toContain(crumbs.at(-1)!.text.slice(0, 6));
      }
    }
    expect(lettersSeen).toBe(true);
  });
});

describe("the two settings (HDR-D3)", () => {
  test("ui.breadcrumb = false keeps the header, its name, buttons and ▤; space f b's list then centred", async () => {
    const h = await harness({
      open: NOTE,
      width: 160,
      height: 30,
      config: (c) => ((c.ui.breadcrumb = false), (c.ui.right_rail = false)),
    });
    await h.keys("]", "]");
    await h.keys("ctrl+w", "v");
    const f = h.frame();
    expect(f).not.toContain("§");
    expect(states(h, 0)).toBe("Read:selected Lens:enabled Source:enabled");
    expect(states(h, 1)).toBe("Read:selected Lens:enabled Source:enabled");
    const out = h.app.geometry!.hot.find((x) => x.id === "btn:outline")!;
    expect(out.y).toBeGreaterThan(0); // on a header, not the top bar
    expect(buttons(h, 1)[0]!.y).toBe(out.y);
    expect(h.app.geometry!.crumbAnchors).toEqual({});
    await h.keys("space", "f", "b");
    expect(h.app.overlay?.kind).toBe("list");
  });

  test("ui.window_header = false removes the row: no buttons, ▤ on the top bar; with the breadcrumb on or off", async () => {
    for (const breadcrumb of [true, false]) {
      const h = await harness({
        open: NOTE,
        width: 120,
        height: 30,
        config: (c) => ((c.ui.window_header = false), (c.ui.breadcrumb = breadcrumb), (c.ui.right_rail = false)),
      });
      await h.keys("]", "]");
      const f = h.frame();
      expect(f).not.toContain("§");
      expect(buttons(h)).toEqual([]);
      expect(h.app.geometry!.hot.find((x) => x.id === "btn:outline")!.y).toBe(0);
    }
  });

  test("both settings in the UI list, toggled and remembered in the session like the others", async () => {
    const h = await harness({ open: NOTE, width: 120, height: 30 });
    await h.app.run("ui.window_header");
    expect(lastMessage(h)?.text).toBe("Window header: off");
    expect(h.app.settings.uiOverrides.window_header).toEqual({ value: false, base: true });
    expect(buttons(h)).toEqual([]);
    // Saved, and back on the next start in that folder.
    h.app.session.save();
    const again = await harness({ root: h.root, open: NOTE, width: 120, height: 30 });
    expect(again.app.ui.window_header).toBe(false);
    expect(buttons(again)).toEqual([]);
    await again.app.run("ui.window_header");
    again.app.session.save();
    await h.app.run("ui.window_header");
    expect(buttons(h).length).toBe(3);
    await h.app.run("ui.list");
    const o = h.app.overlay;
    expect(o?.kind).toBe("list");
    const labels = o?.kind === "list" ? o.items.map((i) => `${i.label}: ${i.hint}`) : [];
    expect(labels).toEqual(expect.arrayContaining(["Window header: on", "Breadcrumb: on"]));
  });

  test("zen mode and windows under 8 rows have no header, whatever the settings", async () => {
    const h = await harness({ open: NOTE, width: 120, height: 30 });
    await h.app.run("ui.zen");
    expect(buttons(h)).toEqual([]);
    await h.app.run("ui.zen");
    expect(buttons(h).length).toBe(3);
    const v = h.app.view!;
    const drawn = (rows: number) => {
      const c = new TextCanvas(80, rows);
      const geo: Geometry = {
        ...{ panes: [], sidebar: null, outline: null, sidebarPane: null, outlinePane: null, tabs: [], overlay: null },
        ...{ hot: [], separators: [], scrollbars: [], tabStrip: null, popup: null, crumbAnchors: {}, rules: [] },
        verticals: [],
      };
      drawPane(h.app, c, v, { x: 0, y: 0, w: 80, h: rows }, true, false, false, false, geo);
      return geo.hot.filter((b) => b.id.startsWith("mode:")).length;
    };
    expect(drawn(7)).toBe(0);
    expect(drawn(8)).toBe(3);
  });

  test("without colour, a disabled button is dim and italic, an enabled one dim, the selected one bold (HDR-D5)", async () => {
    const h = await harness({ open: NOTE, width: 120, height: 30, themeName: "mono" });
    writeFileSync(join(h.root, TEXT), "plain\n");
    const attrs = (label: string) => {
      const b = buttons(h).find((x) => x.label === label)!;
      const st = h.canvas().styles[b.y]![b.x + 1]!;
      return [st.bold && "bold", st.dim && "dim", st.italic && "italic"].filter(Boolean).join(" ");
    };
    expect([attrs("Read"), attrs("Lens")]).toEqual(["bold", "dim"]);
    await h.app.run(`note.open ${TEXT}`);
    expect([attrs("Read"), attrs("Source")]).toEqual(["dim italic", "bold"]);
  });

  test("[colors] breadcrumb_band still colours the header (HDR-D1)", async () => {
    const h = await harness({
      open: NOTE,
      width: 120,
      height: 30,
      config: (c) => (c.colors = { breadcrumb_band: { bg: "#123456" } }),
    });
    const b = buttons(h)[0]!;
    expect(h.canvas().styles[b.y]![b.x - 2]!.bg).toBe("#123456");
  });
});

describe("the commands that set a mode", () => {
  test("view.mode_read, view.mode_lens and view.mode_source: no CLI, under Editing, in their own mode nothing", async () => {
    for (const id of ["view.mode_read", "view.mode_lens", "view.mode_source"]) {
      const spec = COMMAND_SPECS.find((s) => s.id === id)!;
      expect(spec.cli).toBeNull();
      expect(commandGroup(id)).toBe("Editing");
    }
    const h = await harness({ open: NOTE, width: 120, height: 30 });
    const v = h.app.view!;
    const before = h.app.messages.length;
    await h.app.run("view.mode_read");
    expect(h.app.messages.length).toBe(before);
    await h.app.run("view.mode_source");
    expect(viewMode(v)).toBe("source");
    await h.app.run("view.mode_lens");
    expect(viewMode(v)).toBe("live");
    await h.app.run("view.mode_read");
    expect(viewMode(v)).toBe("rendered");
    // The toggles stay toggles.
    await h.app.run("view.source");
    await h.app.run("view.source");
    expect(viewMode(v)).toBe("rendered");
  });

  test("the scratch in the window on the right has the buttons; floating, it has no header", async () => {
    const right = await harness({ open: NOTE, width: 160, height: 30, config: (c) => (c.capture.open_in = "right") });
    await right.app.run("scratch.open");
    const t = right.app.tab!;
    const w = t.views.findIndex((x) => x.buf.name === "scratch.md");
    expect(w).toBeGreaterThanOrEqual(0);
    expect(states(right, w)).toBe("Read:selected Lens:enabled Source:enabled");
    const float = await harness({ open: NOTE, width: 160, height: 30 });
    await float.app.run("scratch.open");
    expect(float.app.floating?.kind).toBe("scratch");
    float.frame();
    expect(float.app.geometry!.hot.filter((b) => b.id.startsWith("mode:-1:"))).toEqual([]);
  });
});
