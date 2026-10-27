import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Config } from "../../../../src/core/application/config/config.ts";
import { makeSandbox, makeVault, harness, rowStarting } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("find: n / N from the cursor, * / # the word under it", () => {
  const note = "# T\n\nalpha beta\n\nalphabet gamma\n\nbeta alpha\n\nend alpha\n";
  const setup = async () => {
    const root = makeVault();
    writeFileSync(join(root, "find.md"), note);
    const h = await harness({ root, open: "find.md", width: 80, height: 24 });
    const rowOf = (text: string) => rowStarting(h, text);
    return { h, rowOf };
  };
  test("n and N go to the match after / before the cursor, wherever it has moved; they wrap", async () => {
    const { h, rowOf } = await setup();
    const v = h.app.view!;
    await h.keys("/", "a", "l", "p", "h", "a", "enter"); // alpha, alphabet, alpha, alpha
    expect(v.find!.matches.length).toBe(4);
    // Move the cursor down past two matches: n goes to the next one after it, not after the first.
    h.app.moveCursor(v, { row: rowOf("beta alpha"), col: 0 });
    await h.keys("n");
    expect(v.cur).toEqual({ row: rowOf("beta alpha"), col: 5 });
    await h.keys("n");
    expect(v.cur.row).toBe(rowOf("end alpha"));
    await h.keys("n"); // wraps to the top
    expect(v.cur).toEqual({ row: rowOf("alpha beta"), col: 0 });
    expect(h.app.transient!.text).toContain("from the top");
    await h.keys("shift+n"); // and back round to the bottom
    expect(v.cur.row).toBe(rowOf("end alpha"));
    expect(h.app.transient!.text).toContain("from the bottom");
  });
  test("* and # search for the whole word under the cursor, forward and backward", async () => {
    const { h, rowOf } = await setup();
    const v = h.app.view!;
    h.app.moveCursor(v, { row: rowOf("alpha beta"), col: 2 }); // inside "alpha"
    await h.keys("*");
    expect(v.find!.query).toBe("alpha");
    expect(v.find!.whole).toBe(true);
    expect(v.find!.matches.length).toBe(3); // not "alphabet"
    expect(v.cur).toEqual({ row: rowOf("beta alpha"), col: 5 });
    await h.keys("n");
    expect(v.cur.row).toBe(rowOf("end alpha"));
    await h.keys("#");
    expect(v.cur).toEqual({ row: rowOf("beta alpha"), col: 5 });
    // Off a word: the next word on the row.
    h.app.moveCursor(v, { row: rowOf("beta alpha"), col: 4 }); // the space
    await h.keys("*");
    expect(v.find!.query).toBe("alpha");
  });
});

describe("review cycle 3 (TUI)", () => {
  const src = async (text: string, config?: (c: Config) => void, width = 100, height = 30) => {
    const root = makeVault();
    writeFileSync(join(root, "e.md"), text);
    const h = await harness({ root, open: "e.md", width, height, config });
    await h.keys("space", "n", "v");
    const v = h.app.view!;
    return {
      h,
      v,
      root,
      at: (row: number, col: number) => h.app.moveCursor(v, { row, col }),
      ex: (cmd: string) => h.keys(":", ...[...cmd].map((c) => (c === " " ? "space" : c)), "enter"),
    };
  };
  test("incremental search goes back where it began when nothing matches; the replace count follows typing", async () => {
    const { h, v } = await src("alpha\nbeta\ngamma alpha\n");
    await h.keys("/", "g", "a", "m");
    expect(v.cur.row).toBe(2);
    await h.keys("x");
    expect(v.cur.row).toBe(0);
    await h.keys("escape", "ctrl+h", "a", "l", "p");
    expect((h.app.overlay as { replace?: { total: number } }).replace!.total).toBe(2);
  });
  test("the find row keeps room for the query in a narrow window, and shows its end", async () => {
    const h = await harness({
      open: "index.md",
      width: 40,
      height: 16,
      config: (c) => ((c.ui.sidebar = false), (c.ui.outline = false)),
    });
    await h.keys("/", ...[..."abcdefghijklmnopqrstuvwxyz"]);
    const row = h
      .frame()
      .split("\n")
      .find((r) => r.includes("› "))!;
    expect(row).toContain("xyz");
    const pane = h.app.geometry!.panes[0]!;
    for (const hot of h.app.geometry!.hot.filter((x) => x.id.startsWith("findopt:")))
      expect(hot.x).toBeGreaterThanOrEqual(pane.x);
  });
});
