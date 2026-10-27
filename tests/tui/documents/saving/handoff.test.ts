import { describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Host } from "../../../../src/tui/app/runtime/app.ts";
import { makeSandbox, makeVault, harness, rowStarting, type Harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("hand-off to an editor (space n e, space n s)", () => {
  test("space n e steps aside for the editor at the cursor's line, then reloads what it saved", async () => {
    const root = makeVault();
    const file = join(root, "notes", "alpha.md");
    const h = await harness({
      root,
      open: "notes/alpha.md",
      config: (c) => (c.editor.command = "myed +{line} {file}"),
    });
    const v = h.app.view!;
    h.app.moveCursor(v, { row: rowStarting(h, "Back to"), col: 0 });
    const line = h.app.cursorLine(v);
    const calls: string[][] = [];
    const host = (h.app as unknown as { host: Host }).host;
    host.runForeground = (argv) => {
      calls.push(argv);
      writeFileSync(file, readFileSync(file, "utf8").replace("Back to", "Edited, back to"));
      const future = Date.now() / 1000 + 5;
      require("node:fs").utimesSync(file, future, future);
      return 0;
    };
    await h.keys("space", "n", "e");
    expect(calls).toEqual([["myed", `+${line}`, file]]);
    expect(h.frame()).toContain("Edited, back to");
    host.runForeground = () => "no such file";
    await h.keys("space", "n", "e");
    expect(h.app.transient!.text).toContain("couldn't start myed");
  });
  test("space n s sends the note to the remote editor without waiting; unset, it says how", async () => {
    const h = await harness({ open: "notes/alpha.md", config: (c) => (c.editor.remote = []) });
    await h.keys("space", "n", "s");
    expect(h.app.transient!.text).toContain("[editor] remote");
    // nvim: open the file, then go to the line (its --remote has no +{line}); in order, each awaited.
    const n = await harness({
      open: "notes/alpha.md",
      config: (c) =>
        (c.editor.remote = [
          "nvim --server /tmp/s --remote {file}",
          "nvim --server /tmp/s --remote-send <C-\\><C-N>:{line}<CR>",
        ]),
    });
    const sent: string[][] = [];
    (n.app as unknown as { host: Host }).host.runDetached = async (argv) => (sent.push(argv), 0);
    await n.keys("space", "n", "s");
    await Bun.sleep(5);
    const line = n.app.cursorLine(n.app.view!);
    expect(sent.length).toBe(2);
    expect(sent[0]!.slice(0, 4)).toEqual(["nvim", "--server", "/tmp/s", "--remote"]);
    expect(sent[0]!.at(-1)).toEndWith("notes/alpha.md");
    expect(sent[1]).toEqual(["nvim", "--server", "/tmp/s", "--remote-send", `<C-\\><C-N>:${line}<CR>`]); // no file appended
    expect(n.app.transient!.text).toContain("sent to nvim");
    // A failing first command stops the rest.
    sent.length = 0;
    (n.app as unknown as { host: Host }).host.runDetached = async (argv) => (sent.push(argv), 1);
    await n.keys("space", "n", "s");
    await Bun.sleep(5);
    expect(sent.length).toBe(1);
    expect(n.app.transient!.text).toContain("exited with 1");
    // One string is one command.
    const one = await harness({
      open: "notes/alpha.md",
      configFile: undefined,
      config: (c) => (c.editor.remote = ["code -g {file}:{line}"]),
    });
    const got: string[][] = [];
    (one.app as unknown as { host: Host }).host.runDetached = async (argv) => (got.push(argv), 0);
    await one.keys("space", "n", "s");
    await Bun.sleep(5);
    expect(got[0]![2]).toMatch(/notes\/alpha\.md:\d+$/);
  });
});

describe("review (tui): the app's floating windows, new paths, roots and repeats", () => {
  const last = (h: Harness) => h.app.messages.at(-1)!;

  test("space n e and space n s from the properties editor hand off its note; from a hover, nothing", async () => {
    const h = await harness({
      config: (c) => ((c.editor.command = "myed +{line} {file}"), (c.editor.remote = ["rem {file}"])),
    });
    const host = (h.app as unknown as { host: Host }).host;
    const calls: string[][] = [];
    host.runForeground = (argv) => (calls.push(argv), 0);
    host.runDetached = async (argv) => (calls.push(argv), 0);
    const note = join(h.root, "index.md");
    h.app.properties.open();
    await h.app.run("note.edit");
    expect(h.app.floating).toBeNull();
    h.app.properties.open();
    await h.app.run("note.send");
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual(["myed", "+1", note]);
    expect(calls[1]).toContain(note);
    h.app.overlays.openHover("**x**", "Definition of foo");
    await h.app.run("note.edit");
    await h.app.run("note.send");
    expect(calls).toHaveLength(2);
    expect(last(h).text).toBe("nothing to hand off: this window isn't a file");
    expect(calls.flat().some((a) => a.includes("#properties") || a.includes("hover:"))).toBe(false);
  });
});
