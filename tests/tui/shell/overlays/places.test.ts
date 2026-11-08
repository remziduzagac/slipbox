import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ListOverlay } from "../../../../src/tui/app/runtime/app.ts";
import { openPlace } from "../../../../src/tui/shell/overlays/places.ts";
import { type Harness, harness, makeSandbox, makeVault } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

/** A note of `n` list items, one a line, the one at line `at` saying `needle`. */
function longNote(n: number, at: number, needle: string): string {
  return Array.from({ length: n }, (_, i) => (i + 1 === at ? `- ${needle} here` : `- item ${i + 1}`)).join("\n");
}

const list = (h: Harness) => h.app.overlay as ListOverlay;
const settle = () => new Promise((r) => setTimeout(r, 30));

/** The frame's rows. */
const rows = (h: Harness) => h.frame().split("\n");

/** Whether the preview is drawn: the list's geometry spans more than the list. */
const previewed = (h: Harness) => {
  h.frame();
  return !!h.app.geometry?.overlay?.box;
};

describe("lists of places (EG-D2): the preview", () => {
  test("find in every note: each row's place is its file, its line and the match on it", async () => {
    const h = await harness({ open: "notes/alpha.md" });
    await h.app.run("find.vault Section One");
    const o = list(h);
    expect(o.places).toBe("find");
    const item = o.filtered.find((e) => e.item.label === "notes/alpha.md:7")!.item;
    expect(item.place).toEqual({
      abs: join(h.root, "notes/alpha.md"),
      line: 7,
      range: [3, 14],
      text: "Section One",
    });
  });

  test("the preview lands at the hit a third of the way down, its text marked as a link under the cursor is", async () => {
    const root = makeVault();
    writeFileSync(join(root, "long.md"), longNote(80, 55, "quetzal"));
    const h = await harness({ root, open: "index.md" });
    await h.app.run("find.vault quetzal");
    const o = list(h);
    h.frame();
    await settle(); // read off the keys
    h.frame();
    const shown = h.app.preview.show(o, o.filtered[o.selected]!.item.place);
    if (!("view" in shown)) throw new Error(`no window: ${shown.said}`);
    const v = shown.view;
    expect(v.preview?.line).toBe(55);
    expect(v.cur.row - v.top).toBe(Math.floor(v.height / 3));
    // The word itself, in link_focus's colours, in the preview right of the list (whose row says it too).
    const c = h.canvas();
    const right = h.app.geometry!.overlay!.x + h.app.geometry!.overlay!.w;
    const cells = (y: number) => c.rows[y]!.map((g) => g || " ").join("");
    const y = c.rows.findIndex((_, i) => cells(i).indexOf("quetzal here", right) >= 0);
    const marked = c.rows[y]!.map((g, i) => (c.styles[y]![i]?.bg === h.app.theme.roles.link_focus.bg ? g : "")).join(
      "",
    );
    expect(marked).toBe("quetzal");
  });

  test("a note open with unsaved text is previewed as typed; one not open is read off the keys, `reading…` first", async () => {
    const h = await harness({ open: "notes/alpha.md" });
    await h.keys("shift+g", "o", ..."unsavedword", "escape");
    expect(h.app.view!.buf.dirty).toBe(true);
    await h.keys("ctrl+p", "a", "l", "p", "h", "a");
    expect(rows(h).join("\n")).toContain("unsavedword");
    await h.keys("escape", "ctrl+p", "b", "e", "t", "a");
    expect(rows(h).join("\n")).toContain("reading…");
    await settle();
    expect(rows(h).join("\n")).not.toContain("reading…");
    expect(rows(h).join("\n")).toContain("▌ Beta");
  });

  test("a file the selection moved on from before it was read is dropped: back on it, it's read again", async () => {
    const h = await harness({ open: "index.md" });
    await h.keys("ctrl+p", "n", "o", "t", "e", "s", "/");
    const first = list(h).selected;
    await h.keys("down");
    await settle();
    await h.keys("up");
    expect(list(h).selected).toBe(first);
    expect(rows(h).join("\n")).toContain("reading…");
  });

  test("ctrl+t hides it for every list of places until it's pressed again; a click on `ctrl+t hide` too", async () => {
    const h = await harness({ open: "notes/beta.md" });
    await h.keys("space", "l", "b");
    expect(previewed(h)).toBe(true);
    await h.keys("ctrl+t");
    expect(previewed(h)).toBe(false);
    expect(rows(h).join("\n")).toContain("ctrl+t show");
    await h.keys("escape", "ctrl+p");
    expect(previewed(h)).toBe(false);
    // The button in the list's bottom border, clicked: shown again.
    const t = h.app.geometry!.overlay!.toggle!;
    h.app.mouse.handle({ type: "down", x: t.x + 1, y: t.y, button: 0 });
    h.app.mouse.handle({ type: "up", x: t.x + 1, y: t.y, button: 0 });
    expect(previewed(h)).toBe(true);
    expect(h.app.overlay?.kind).toBe("list");
    // A click in the preview leaves the list open; one outside both closes it.
    const box = h.app.geometry!.overlay!.box!;
    h.app.mouse.handle({ type: "down", x: box.x + box.w - 3, y: box.y + 3, button: 0 });
    expect(h.app.overlay?.kind).toBe("list");
    h.app.mouse.handle({ type: "down", x: 1, y: box.y + box.h + 1, button: 0 });
    expect(h.app.overlay).toBeNull();
  });

  test("beside the list from ui.narrow_width; under it on a narrower screen; the palette and menus have none", async () => {
    const wide = await harness({ open: "notes/beta.md", width: 120 });
    await wide.keys("space", "l", "b");
    wide.frame();
    const g = wide.app.geometry!.overlay!;
    expect(g.box!.x + g.box!.w).toBeGreaterThan(g.x + g.w + 20);
    expect(g.box!.h).toBe(g.h);
    const narrow = await harness({ open: "notes/beta.md", width: 80 });
    await narrow.keys("space", "l", "b");
    narrow.frame();
    const n = narrow.app.geometry!.overlay!;
    expect(n.box!.w).toBe(n.w);
    expect(n.box!.h).toBeGreaterThan(n.h + 7);
    await narrow.keys("escape", ":");
    expect(previewed(narrow)).toBe(false);
  });
});

describe("lists of places (EG-D2): the last list again, and where a pick opens", () => {
  test("space ' brings the last list back as it was: its query, its rows not asked again, its selection", async () => {
    const h = await harness({ open: "index.md" });
    await h.keys("ctrl+p", "n", "o", "t", "e", "s", "down");
    const o = list(h);
    const { input, selected, filtered } = o;
    await h.keys("escape");
    expect(h.app.overlay).toBeNull();
    await h.keys("space", "'");
    expect(h.app.overlay).toBe(o);
    expect(list(h).input).toBe(input);
    expect(list(h).selected).toBe(selected);
    expect(list(h).filtered).toBe(filtered);
    // On a pick too.
    const pick = o.filtered[o.selected]!.item.data as string;
    await h.keys("enter");
    expect(h.app.view!.buf.rel).toBe(pick);
    await h.keys("space", "'");
    expect(h.app.overlay).toBe(o);
  });

  test("a list that isn't of places is never the last one; going into another vault drops it", async () => {
    const h = await harness({ open: "notes/beta.md" });
    await h.keys("space", "l", "b", "escape", ":", "escape");
    await h.keys("space", "'");
    expect(list(h).places).toBe("backlinks");
    await h.keys("escape");
    h.app.places.left();
    await h.keys("space", "'");
    expect(h.app.overlay).toBeNull();
    expect(h.app.messages.at(-1)?.text).toContain("no list of places to open again");
  });

  test("alt+enter asks where: h here, s the split, t a new tab; esc goes back to the list", async () => {
    const h = await harness({ open: "index.md" });
    const pick = async (key: string) => {
      await h.keys("ctrl+p", "b", "e", "t", "a", "alt+enter");
      expect(list(h).title).toBe("Open notes/beta.md where?");
      await h.keys(key);
    };
    await h.keys("ctrl+p", "b", "e", "t", "a", "alt+enter", "escape");
    expect(list(h).places).toBe("switcher");
    await h.keys("escape");
    await pick("h");
    expect(h.app.view!.buf.rel).toBe("notes/beta.md");
    expect(h.app.tabs.length).toBe(1);
    await h.keys("ctrl+o");
    await pick("s");
    expect(h.app.tab!.views.map((v) => v.buf.rel)).toEqual(["index.md", "notes/beta.md"]);
    await pick("t");
    expect(h.app.tabs.length).toBe(2);
    expect(h.app.view!.buf.rel).toBe("notes/beta.md");
  });

  test("from the palette, which closes the list: the last list's pick, asked where", async () => {
    const h = await harness({ open: "index.md" });
    await h.keys("ctrl+p", "b", "e", "t", "a", "escape");
    await h.app.run("list.open_where");
    expect(list(h).title).toBe("Open notes/beta.md where?");
    await h.keys("t");
    expect(h.app.tabs.length).toBe(2);
    expect(h.app.view!.buf.rel).toBe("notes/beta.md");
  });

  test("a pick of find in every note opens at its line in the split, on its match in SOURCE view", async () => {
    const h = await harness({ open: "index.md" });
    await h.app.run("find.vault Section One");
    const o = list(h);
    o.selected = o.filtered.findIndex((e) => e.item.label === "notes/alpha.md:7");
    await h.keys("alt+enter", "s");
    expect(h.app.view!.buf.rel).toBe("notes/alpha.md");
    expect(h.app.cursorLine(h.app.view!)).toBe(7);
    expect(h.app.tab!.views.length).toBe(2);
  });

  test("the links list opened again over another note opens where its link leads, not a link of that note", async () => {
    const h = await harness({ open: "notes/alpha.md" });
    await h.keys("space", "l", "l");
    const o = list(h);
    o.selected = o.filtered.findIndex((e) => e.item.label === "beta");
    expect(o.filtered[o.selected]!.item.place?.abs).toBe(join(h.root, "notes/beta.md"));
    await h.keys("escape");
    h.app.open("index.md");
    expect(h.app.view!.buf.rel).toBe("index.md");
    await h.keys("space", "'", "enter");
    expect(h.app.view!.buf.rel).toBe("notes/beta.md");
  });

  test("another vault's place opens in a peek, in the split as in a tab", async () => {
    const h = await harness({ open: "index.md" });
    openPlace(h.app, { abs: join(h.root, "nested-vault", "inner.md"), line: 1 }, "split");
    expect(h.app.floating?.kind).toBe("peek");
    expect(h.app.tab!.views.length).toBe(1);
  });
});
