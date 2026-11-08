import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Problem } from "../../../../src/core/documents/diagnostics/diagnostics.ts";
import { makeSandbox, harness, statusRow, type Harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

/** Problems where they are (EG-D5): stepped through, the cursor's on the status line, in full in a window. */
describe("problems where they are (EG-D5)", () => {
  const NOTE = [
    "# Probe", //                                                  1
    "", //                                                         2
    "The first line has a problem in its middle here.", //          3
    "", //                                                         4
    "Another line, its problem at its start.", //                   5
    "", //                                                         6
    "A last line whose problem is past its end.", //                7
    "", //                                                         8
    "A picture that isn't there: ![pic](nope.png) at the end.", //  9
    "",
  ].join("\n");
  const setup = async (width = 140) => {
    const root = mkdtempSync(join(tmpdir(), "slipbox-at-cursor-"));
    mkdirSync(join(root, ".slipbox"));
    writeFileSync(join(root, "probe.md"), NOTE);
    return await harness({ root, open: "probe.md", width, height: 30 });
  };
  const problem = (line: number, column: number, to: number, severity: Problem["severity"], message: string) => ({
    start: { line, column },
    end: { line, column: to },
    severity,
    source: "fake",
    code: severity === "error" ? "E1" : null,
    message,
  });
  /** A stand-in server's problems on the note, for the text as it is. */
  const serve = (h: Harness, list: Problem[]) => {
    const v = h.app.view!;
    v.buf.serverProblems.set("fake", { version: v.buf.version, raw: [], list });
    v.layoutKey = "";
    h.frame();
  };
  const FOUR = [
    problem(3, 21, 28, "warning", "a problem in the middle"),
    problem(5, 1, 8, "error", "Cannot find name 'Another'.\n  Did you mean 'another'?"),
    problem(7, 43, 44, "warning", "a problem past the end"),
  ];
  const at = (h: Harness) => /L(\d+):(\d+)/.exec(statusRow(h.frame()))!.slice(1).map(Number);

  test("] d and [ d: SOURCE view by where each starts, on its first character, around the ends", async () => {
    const h = await setup();
    await h.app.run("view.source");
    serve(h, FOUR);
    // The broken picture, the note's own problem (a warning), is shown too: four in all.
    expect(h.app.problems.ofView(h.app.view!).length).toBe(4);
    await h.keys("]", "d");
    expect(at(h)).toEqual([3, 21]);
    await h.keys("]", "d");
    expect(at(h)).toEqual([5, 1]);
    // Past its line's end: on the line's last character — and the next one after it, never this one again.
    await h.keys("]", "d");
    expect(at(h)).toEqual([7, 42]);
    await h.keys("]", "d");
    expect(at(h)).toEqual([9, 29]);
    await h.keys("]", "d");
    expect(at(h)).toEqual([3, 21]); // around the end
    await h.keys("[", "d");
    expect(at(h)).toEqual([9, 29]); // around the start
    await h.keys("[", "d");
    expect(at(h)).toEqual([7, 42]);
    // Below `[diagnostics] severity` (warning), information isn't one: none to go to.
    serve(h, [problem(3, 1, 4, "info", "only information")]);
    expect(h.app.problems.ofView(h.app.view!).map((p) => p.severity)).toEqual(["warning"]);
  });

  test("a file with none says so", async () => {
    const root = mkdtempSync(join(tmpdir(), "slipbox-at-cursor-"));
    mkdirSync(join(root, ".slipbox"));
    writeFileSync(join(root, "clean.md"), "# Clean\n\nNothing wrong.\n");
    const h = await harness({ root, open: "clean.md" });
    await h.keys("]", "d");
    expect(h.app.messages.at(-1)?.text).toBe("no problems in this file");
    await h.keys("space", "c", "d");
    expect(h.app.messages.at(-1)?.text).toBe("no problem at the cursor — ] d goes to the next");
    expect(h.app.floating).toBeNull();
  });

  test("the status line says the cursor's problem: the worst, its sign, +n, in its colour; the counts stay", async () => {
    const h = await setup();
    await h.app.run("view.source");
    serve(h, [...FOUR, problem(5, 3, 6, "warning", "a lesser one inside it")]);
    expect(statusRow(h.frame())).not.toMatch(/problem in the middle|Cannot find/); // line 1: on none
    await h.keys("]", "d");
    expect(statusRow(h.frame())).toContain("⚠ a problem in the middle  ");
    await h.keys("]", "d");
    // Both at the cursor's column 3? Not yet: on column 1, only the error. Its lines on one line.
    expect(statusRow(h.frame())).toContain("✖ Cannot find name 'Another'. Did you mean 'another'?  ");
    await h.keys("l", "l");
    const row = statusRow(h.frame());
    expect(row).toContain("✖ Cannot find name 'Another'. Did you mean 'another'? +1  ");
    // In the error's colour, sign and all; the rest dim, as it was.
    const c = h.canvas();
    const y = c.height - 1;
    const x = [...row].indexOf("✖", [...row].indexOf("›"));
    expect(c.styles[y]![x]!.fg).toBe(h.app.theme.roles.error.fg!);
    expect(c.styles[y]![[...row].lastIndexOf("L")]!.fg).not.toBe(h.app.theme.roles.error.fg!);
    // The counts, as before.
    expect(row).toMatch(/✖ 1 {2}⚠ 4/);
    // Off it: gone.
    await h.keys("j");
    expect(statusRow(h.frame())).not.toContain("Cannot find");
  });

  test("short of room, the words and the tab count give way to it first, then it's cut; the place stays", async () => {
    const at = async (width: number) => {
      const h = await setup(width);
      await h.app.run("view.source");
      serve(h, FOUR);
      await h.app.run("tab.new");
      await h.app.run("tab.prev");
      await h.keys("]", "d", "]", "d");
      return statusRow(h.frame());
    };
    const MESSAGE = "✖ Cannot find name 'Another'. Did you mean 'another'?  ";
    // Room for all of it: the message, the words, the tab count, the place; the counts after the path.
    expect(await at(160)).toMatch(
      /✖ 1 {2}⚠ 3 .*✖ Cannot find name 'Another'\. Did you mean 'another'\? {2}\d+ words {2}tab 1\/2 {2}L5:1 /,
    );
    // Less: the words go first, then the tab count.
    const fewer = await at(124);
    expect([fewer.includes(MESSAGE), /\d+ words/.test(fewer), fewer.includes("tab 1/2")]).toEqual([true, false, true]);
    const less = await at(112);
    expect([less.includes(MESSAGE), less.includes("tab 1/2"), /L5:1 /.test(less)]).toEqual([true, false, true]);
    // Then it's cut to the room left, the counts and the place kept.
    const narrow = await at(90);
    expect(narrow).toMatch(/✖ Cannot find name[^…]*… {2}L5:1 /);
    expect(narrow).toMatch(/✖ 1 {2}⚠ 3/);
  });

  test("the rendered view: ] d onto a broken link as drawn; its message first, the link after it", async () => {
    const h = await setup();
    const v = h.app.view!;
    expect(v.source || v.live).toBeFalsy();
    serve(h, FOUR);
    await h.keys("[", "d"); // from the top, back around: the last, the picture's link
    const link = h.app.currentLayout(v).links[h.app.linking.linkUnderCursor(v)];
    expect(link).toMatchObject({ target: "nope.png", status: "unresolved" });
    const row = statusRow(h.frame());
    expect(row).toMatch(/⚠ broken link: nope\.png {2}→ nope\.png \(unresolved\)/);
    // Off the link on its line, a link's problem isn't the cursor's.
    await h.keys("0");
    expect(statusRow(h.frame())).not.toContain("broken link");
    // Another line's: on the text its line became.
    await h.keys("[", "d");
    expect(statusRow(h.frame())).toContain("⚠ a problem past the end");
    await h.keys("[", "d", "[", "d");
    expect(statusRow(h.frame())).toContain("⚠ a problem in the middle");
    await h.keys("]", "d");
    expect(statusRow(h.frame())).toContain("✖ Cannot find name");
  });

  test("space c d: each problem at the cursor in full; y copies, s adds to the scratch, esc closes", async () => {
    const h = await setup();
    await h.app.run("view.source");
    serve(h, [...FOUR, problem(5, 1, 3, "warning", "a *second* one_here")]);
    await h.keys("]", "d", "]", "d", "space", "c", "d");
    expect(h.app.floating).toMatchObject({ kind: "problem", path: "probe.md", title: "2 problems at probe.md:5" });
    const shown = h.frame();
    expect(shown).toContain("✖ error · fake E1 · probe.md:5:1");
    expect(shown).toContain("Cannot find name 'Another'.");
    expect(shown).toContain("Did you mean 'another'?"); // its own lines kept
    expect(shown).toContain("a *second* one_here"); // as written, never formatted
    expect(shown).toContain("y copies · s adds to the scratch · esc · q closes");
    await h.keys("y");
    await new Promise((r) => setTimeout(r, 50));
    expect(h.copied.at(-1)).toBe(
      "probe.md:5:1 error: Cannot find name 'Another'. Did you mean 'another'? (fake E1)\n" +
        "probe.md:5:1 warning: a *second* one_here (fake)",
    );
    await h.keys("s");
    expect(h.app.messages.at(-1)?.text).toMatch(/^2 problems added to the scratch.* — space s y copies it$/);
    const scratch = readFileSync(h.app.scratch.location().path, "utf8");
    expect(scratch).toContain("**At:** `probe.md:5:1-7`\n\n```text\nerror: Cannot find name 'Another'.\n");
    expect(scratch).toContain("**At:** `probe.md:5:1-2`\n\n```text\nwarning: a *second* one_here (fake)\n```");
    // Never opened, and its places never "changed since captured": the message is no line of the file.
    expect(h.app.floating?.kind).toBe("problem");
    await h.keys("escape");
    expect(h.app.floating).toBeNull();
    await h.keys("space", "s", "s");
    expect(h.app.problems.ofView(h.app.view!).filter((p) => p.code?.startsWith("place-"))).toEqual([]);
    await h.keys("q");
    // From the palette, out of the window: the cursor's.
    await h.app.run("problem.copy");
    await new Promise((r) => setTimeout(r, 50));
    expect(h.copied.at(-1)).toStartWith("probe.md:5:1 error: Cannot find name");
  });

  test("q closes the window too, and its keys are its own: y and s nowhere else", async () => {
    const h = await setup();
    await h.app.run("view.source");
    serve(h, FOUR);
    await h.keys("]", "d", "space", "c", "d");
    expect(h.app.floating?.kind).toBe("problem");
    await h.keys("q");
    expect(h.app.floating).toBeNull();
    expect(h.app.keymap.lookup("s")).not.toBe("problem.scratch");
    expect(h.app.keymap.lookup("y")).toBeUndefined();
  });
});
