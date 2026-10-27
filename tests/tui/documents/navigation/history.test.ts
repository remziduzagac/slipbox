import { describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeSandbox, makeVault, harness, statusRow, rowStarting } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("links and history", () => {
  test("tab puts the cursor on a link (] l too); enter, gf follow; ctrl+o back, space h n forward; alt+arrows by words", async () => {
    const h = await harness();
    await h.keys("tab");
    expect(statusRow(h.frame())).toContain("→ notes/alpha.md (resolved)");
    await h.keys("tab", "shift+tab"); // on and back
    expect(statusRow(h.frame())).toContain("→ notes/alpha.md (resolved)");
    await h.keys("enter");
    expect(h.app.view!.buf.rel).toBe("notes/alpha.md");
    await h.keys("ctrl+o");
    expect(h.app.view!.buf.rel).toBe("index.md");
    await h.keys("space", "h", "n");
    expect(h.app.view!.buf.rel).toBe("notes/alpha.md");
    await h.keys("ctrl+o");
    expect(h.app.view!.buf.rel).toBe("index.md");
    // alt+← / alt+→ move by words, as macOS's option+arrows — and alt+b / alt+f, what its terminals send for them
    // (meta-b, meta-f) — never through history.
    const v = h.app.view!;
    h.app.moveCursor(v, { row: rowStarting(h, "Links:"), col: 0 });
    const moves: number[] = [];
    for (const key of ["alt+right", "alt+f", "alt+b", "alt+left"]) {
      await h.keys(key);
      moves.push(v.cur.col);
    }
    expect(h.app.view!.buf.rel).toBe("index.md");
    expect(moves[0]).toBeGreaterThan(0);
    expect(moves[1]).toBeGreaterThan(moves[0]!);
    expect(moves.slice(2)).toEqual([moves[0]!, 0]);
    await h.keys("g", "g", "]", "l", "g", "f");
    expect(h.app.view!.buf.rel).toBe("notes/alpha.md");
  });
  test("enter off a link follows the row's first link; ctrl+enter (space l t) into a new tab, as a browser's ctrl+click", async () => {
    const h = await harness();
    h.app.moveCursor(h.app.view!, { row: rowStarting(h, "Links:"), col: 0 });
    await h.keys("enter");
    expect(h.app.view!.buf.rel).toBe("notes/alpha.md");
    await h.keys("ctrl+o");
    h.app.moveCursor(h.app.view!, { row: rowStarting(h, "Links:"), col: 0 });
    await h.keys("ctrl+enter");
    expect(h.app.tabs.map((t) => t.views.map((v) => v.buf.rel))).toEqual([["index.md"], ["notes/alpha.md"]]);
    expect(h.app.activeTab).toBe(1);
    h.app.activeTab = 0;
    h.app.moveCursor(h.app.view!, { row: rowStarting(h, "Links:"), col: 0 });
    await h.keys("space", "l", "t");
    expect(h.app.tabs).toHaveLength(3);
    expect(h.app.view!.buf.rel).toBe("notes/alpha.md");
  });
  test("a new tab from a split (ctrl+t c): the window moves out into a tab of its own, its place and history with it; the split gone", async () => {
    const h = await harness();
    await h.keys("tab", "space", "l", "s"); // index.md's first link into the split
    expect(h.app.tab!.views).toHaveLength(2);
    await h.keys("tab", "enter"); // on from there, for a back to come with the window
    const first = h.app.view!.buf.rel;
    const moved = h.app.view!;
    const back = moved.back.length;
    await h.keys("ctrl+t", "c");
    expect(h.app.tabs.map((t) => t.views.map((v) => v.buf.rel))).toEqual([["index.md"], [first]]);
    expect(h.app.view).toBe(moved); // the window itself, not a copy
    expect(h.app.view!.back.length).toBe(back);
    // No split: a new tab with this note, as before.
    await h.keys("ctrl+t", "c");
    expect(h.app.tabs).toHaveLength(3);
    expect(h.app.tabs[2]!.views[0]!.buf.rel).toBe(first);
  });

  test("space l: n y s b l", async () => {
    const h = await harness();
    await h.keys("space", "l", "n");
    expect(h.app.linking.linkUnderCursor()).toBeGreaterThanOrEqual(0);
    await h.keys("space", "l", "y");
    expect(h.copied.at(-1)).toEndWith("/notes/alpha.md");
    await h.keys("space", "l", "s");
    expect(h.app.tab!.views).toHaveLength(2);
    expect(h.app.view!.buf.rel).toBe("notes/alpha.md");
    await h.keys("space", "l", "b");
    expect(h.frame()).toContain("Linking to alpha.md");
    await h.keys("escape", "space", "l", "l");
    expect(h.frame()).toContain("Links from alpha.md");
  });
  test("history list jumps anywhere in the timeline", async () => {
    const h = await harness();
    await h.app.run("note.open notes/alpha.md");
    await h.app.run("note.open notes/beta.md");
    await h.keys("space", "h", "h");
    expect(h.frame()).toContain("History");
    // In the left panel, not a popup: focused, the current place selected and marked.
    expect(h.app.overlay).toBeNull();
    expect(h.app.leftView).toBe("history");
    expect(h.app.region).toBe("sidebar");
    const rows = h.app.history.rows();
    expect(rows[h.app.sidebar.selected]!.here).toBe(true);
    expect(h.frame()).toContain("here");
    await h.keys("down", "down", "enter");
    expect(h.app.view!.buf.rel).toBe("index.md");
    await h.keys("space", "h", "n");
    expect(h.app.view!.buf.rel).toBe("notes/alpha.md");
  });
  test("history: a click selects an entry, a double-click jumps there", async () => {
    const h = await harness();
    await h.app.run("note.open notes/alpha.md");
    await h.app.run("note.open notes/beta.md");
    await h.keys("space", "h", "h");
    h.frame();
    const sb = h.app.geometry!.sidebar!;
    const rows = h.app.history.rows();
    const i = rows.findIndex((r) => r.path === "index.md");
    expect(i).toBeGreaterThanOrEqual(0);
    const y = sb.y + i - h.app.sidebar.scroll;
    const at = (type: string) => h.app.mouse.handle({ type, x: sb.x + 4, y, button: 0 });
    at("down");
    at("up");
    expect(h.app.sidebar.selected).toBe(i); // selected…
    expect(h.app.view!.buf.rel).toBe("notes/beta.md"); // …not jumped to
    at("down");
    at("up");
    expect(h.app.view!.buf.rel).toBe("index.md"); // the double-click jumps
  });
  test("unresolved, external and attachment links", async () => {
    const root = makeVault();
    writeFileSync(
      join(root, "amb.md"),
      "[nothing-here](nothing-here.md) [web](https://example.invalid) ![diagram](attachments/diagram.png)\n",
    );
    const h = await harness({ root, open: "amb.md" });
    await h.keys("enter"); // the cursor starts on [nothing-here]
    // No such note: the new-note prompt, its name typed already.
    expect(h.app.overlay).toMatchObject({ kind: "prompt", text: "nothing-here" });
    await h.keys("escape");
    await h.keys("tab", "enter");
    expect(h.copied.at(-1)).toBe("https://example.invalid");
    await h.keys("tab", "enter");
    expect(h.copied.at(-1)).toEndWith("attachments/diagram.png");
  });
  test("a link to a note seen to move is broken: following it says where it went and the fix, and offers no new note (20.2)", async () => {
    const root = makeVault();
    writeFileSync(join(root, "plan.md"), "# The plan\n\nSteps only this note has.\n");
    writeFileSync(join(root, "cites.md"), "[p](plan.md)\n");
    const h = await harness({ root, open: "cites.md" });
    mkdirSync(join(root, "moved"));
    writeFileSync(join(root, "moved", "plan.md"), "# The plan\n\nSteps only this note has.\n");
    rmSync(join(root, "plan.md"));
    h.app.graph.removeFile("plan.md");
    const st = statSync(join(root, "moved", "plan.md"));
    h.app.graph.updateFile("moved/plan.md", {
      rel: "moved/plan.md",
      abs: join(root, "moved", "plan.md"),
      size: st.size,
      mtimeMs: st.mtimeMs,
    });
    await h.keys("enter");
    expect(h.app.view!.buf.rel).toBe("cites.md");
    expect(h.app.overlay).toBeNull();
    expect(h.app.messages.at(-1)?.text).toBe("broken link: plan.md — moved to moved/plan.md: space l r relinks it");
  });
  test("clicking a link follows it", async () => {
    const h = await harness();
    const v = h.app.view!;
    const pane = h.app.geometry!.panes[0]!;
    const link = h.app.currentLayout(v).links.find((l) => l.target === "notes/beta.md")!;
    const x = pane.textX + link.col + 1;
    const y = pane.y + link.line - v.top;
    h.app.mouse.handle({ type: "down", x, y, button: 0 });
    h.app.mouse.handle({ type: "up", x, y, button: 0 });
    await new Promise((r) => setTimeout(r, 10));
    expect(h.app.view!.buf.rel).toBe("notes/beta.md");
  });
});
