import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { ListOverlay } from "../../../../src/tui/app/runtime/app.ts";
import { placeIn } from "../../../../src/tui/documents/editing/shellrun.ts";
import { makeSandbox, makeVault, harness, type Harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("commands run by your shell (25.7)", () => {
  let shell: string | undefined;
  beforeAll(() => {
    shell = process.env.SHELL;
    process.env.SHELL = "/bin/sh";
  });
  afterAll(() => {
    process.env.SHELL = shell;
  });
  const vault = (files: Record<string, string>) => {
    const root = makeVault();
    for (const [rel, text] of Object.entries(files)) writeFileSync(join(root, rel), text);
    return root;
  };
  const until = async (ok: () => boolean, ms = 25_000) => {
    for (const t = Date.now(); !ok() && Date.now() - t < ms; ) await Bun.sleep(20);
    return ok();
  };
  /** Typed on the `:` line, then enter: the command run, waited for. */
  const ex = async (h: Harness, line: string) => {
    await h.keys(":", ...[...line].map((c) => (c === " " ? "space" : c)), "enter");
    expect(await until(() => h.app.shellJob === null)).toBe(true);
  };
  const list = (h: Harness) => h.app.overlay as ListOverlay;

  test(":!cmd: run in the root's folder, % the file's path; its output in a window, enter on a path:line opens it there", async () => {
    const root = vault({ "c1.md": "one\n\ntwo\n\nthree\n" });
    const h = await harness({ root, open: "c1.md", width: 120, height: 30 });
    await ex(h, "!echo out; sleep 0.1; echo err >&2; ls %; printf 'c1.md:5:x\\n'");
    expect(list(h).title).toBe("$ echo out; sleep 0.1; echo err >&2; ls %; printf 'c1.md:5:x\\n' — exit 0");
    expect(list(h).items.map((i) => i.label)).toEqual(["out", "err", "c1.md", "c1.md:5:x"]);
    await h.keys("down", "down", "down", "enter");
    expect(h.app.overlay).toBeNull();
    expect(h.app.view!.buf.rel).toBe("c1.md");
    expect(h.app.currentLayout(h.app.view!).lines[h.app.view!.cur.row]!.src).toBe(5);
    // Its errors among its output where it wrote them, however quickly: through one pipe (D264). Read from two, every
    // line of one came before every line of the other.
    await ex(h, "!i=0; while [ $i -lt 20 ]; do echo o$i; echo e$i >&2; i=$((i+1)); done");
    expect(list(h).items.map((i) => i.label)).toEqual(Array.from({ length: 20 }, (_, i) => [`o${i}`, `e${i}`]).flat());
    await h.keys("escape");
    // A failing one says so in its title; one printing nothing, in a message.
    await ex(h, "!echo no; exit 4");
    expect(list(h).title).toBe("$ echo no; exit 4 — exit 4");
    await h.keys("escape");
    await ex(h, "!true");
    expect(h.app.messages.at(-1)?.text).toBe("true: exit 0, no output");
    // A line naming a file of the root and a line: that file there; one outside the root, or a folder, nothing.
    mkdirSync(join(root, "sub"), { recursive: true });
    const outside = join(root, "..", `outside-${basename(root)}.md`);
    writeFileSync(outside, "x\n");
    expect(placeIn(h.app, "c1.md:5:x")).toEqual({ rel: "c1.md", line: 5 });
    expect(placeIn(h.app, `${join(root, "c1.md")}:2`)).toEqual({ rel: "c1.md", line: 2 });
    expect([
      placeIn(h.app, `${outside}:1:`),
      placeIn(h.app, `../${basename(outside)}:1:`),
      placeIn(h.app, "sub:1:"),
      placeIn(h.app, "c1.md"),
    ]).toEqual([null, null, null, null]);
    // From the palette by name: the `:` line asks for the command, ! typed; the filter, .! without a selection.
    await h.app.run("shell.run");
    expect((h.app.overlay as ListOverlay).input).toBe("!");
    await h.keys("escape");
    await h.app.run("shell.filter");
    expect((h.app.overlay as ListOverlay).input).toBe(".!");
    await h.keys("escape");
    // Quitting stops what runs.
    let stopped = false;
    h.app.shellJob = { command: "x", stop: () => (stopped = true) };
    h.app.quit();
    expect(stopped).toBe(true);
  });

  test("% with no file open: said, nothing run; a filter's lines in the note's own line endings, its last line's break as it was", async () => {
    const root = vault({ "c4.md": "pear\r\napple\r\n", "c5.md": "b\na" });
    const none = await harness({ root, width: 120, height: 30 });
    await none.app.run("tab.close_all");
    expect(none.app.view).toBeNull();
    await ex(none, "!echo %");
    expect(none.app.messages.at(-1)?.text).toBe("% is the file's path: this window has none");
    const h = await harness({ root, open: "c4.md", width: 120, height: 30 });
    await ex(h, "%!sort");
    expect(h.app.view!.buf.source).toBe("apple\r\npear\r\n");
    // Output without its last line break: given one, as the lines had.
    await ex(h, "%!printf x");
    expect(h.app.view!.buf.source).toBe("x\r\n");
    h.app.openInNewTab("c5.md");
    await ex(h, "%!sort");
    expect(h.app.view!.buf.source).toBe("a\nb");
  });

  test(":%!, :.!, :N,M!, and ! on a selection: the lines through the command, one undo step; a failing one leaves them", async () => {
    const root = vault({ "c2.md": "pear\napple\nfig\n" });
    const h = await harness({ root, open: "c2.md", width: 120, height: 30 });
    await ex(h, "%!sort");
    expect(h.app.view!.buf.source).toBe("apple\nfig\npear\n");
    expect(h.app.messages.at(-1)?.text).toBe("3 lines through sort");
    await h.keys("u");
    expect(h.app.view!.buf.source).toBe("pear\napple\nfig\n");
    await h.app.run("cursor.goto_line 2");
    await ex(h, ".!tr a-z A-Z");
    expect(h.app.view!.buf.source).toBe("pear\nAPPLE\nfig\n");
    await ex(h, "1,2!rev");
    expect(h.app.view!.buf.source).toBe("raep\nELPPA\nfig\n");
    // More than a window keeps (2 MB), less than a filter takes (32 MB): put in, not refused.
    await ex(h, "3!head -c 2200000 /dev/zero | tr '\\0' x | fold -w 100");
    expect(h.app.messages.at(-1)?.text).toBe("1 line through head -c 2200000 /dev/zero | tr '\\0' x | fold -w 100");
    expect(h.app.view!.buf.source.length).toBe("raep\nELPPA\n".length + 2_200_000 + 22_000);
    await h.keys("u");
    expect(h.app.view!.buf.source).toBe("raep\nELPPA\nfig\n");
    // What it writes to its errors stays out of the lines it gives back (a window's merges them, D264).
    await ex(h, "3!echo warning >&2; tr a-z A-Z");
    expect(h.app.view!.buf.source).toBe("raep\nELPPA\nFIG\n");
    await h.keys("u");
    expect(h.app.view!.buf.source).toBe("raep\nELPPA\nfig\n");
    // A failing filter: the lines as they were, its output shown.
    await ex(h, "%!echo bad >&2; exit 2");
    expect(h.app.view!.buf.source).toBe("raep\nELPPA\nfig\n");
    expect(list(h).items.map((i) => i.label)).toEqual(["bad"]);
    await h.keys("escape");
    expect(h.app.messages.at(-1)?.text).toBe("echo bad >&2; exit 2: exit 2 — the 3 lines left as they were");
    // ! on a selection: the `:` line with '<,'>! typed.
    await h.app.run("cursor.goto_line 2");
    await h.keys("shift+v", "j", "!");
    expect((h.app.overlay as ListOverlay).input).toBe("'<,'>!");
    await h.keys(..."sort".split(""), "enter");
    expect(await until(() => h.app.shellJob === null)).toBe(true);
    expect(h.app.view!.buf.source).toBe("raep\nELPPA\nfig\n"); // sorted as they were: E before f
    expect(h.app.messages.at(-1)?.text).toBe("2 lines through sort");
    expect([h.app.view!.sel, h.app.view!.visual]).toEqual([null, null]);
    // A line past the end: said.
    await ex(h, "9!sort");
    expect(h.app.messages.at(-1)?.text).toBe("line 9 isn't in the note (it has 3)");
  });

  test("one at a time: another refused while it runs; shell.stop ends it; a text changed meanwhile isn't overwritten", async () => {
    const root = vault({ "c3.md": "b\na\n" });
    const h = await harness({ root, open: "c3.md", width: 120, height: 30 });
    await h.keys(":", ..."!sleep".split(""), "space", "5", "enter");
    expect(h.app.shellJob?.command).toBe("sleep 5");
    await h.keys(":", ..."!true".split(""), "enter");
    expect(h.app.messages.at(-1)?.text).toBe("still running: sleep 5 — stop it first (shell.stop)");
    await h.app.run("shell.stop");
    expect(await until(() => h.app.shellJob === null)).toBe(true);
    expect(h.app.messages.at(-1)?.text).toBe("sleep 5: stopped (SIGTERM), no output");
    // A filter whose text changes while it runs: left alone.
    await h.keys(":", ..."%!sleep".split(""), "space", ..."0.3;".split(""), "space", ..."sort".split(""), "enter");
    h.app.view!.buf.edit(0, 0, "c\n");
    expect(await until(() => h.app.shellJob === null)).toBe(true);
    expect(h.app.view!.buf.source).toBe("c\nb\na\n");
    expect(h.app.messages.at(-1)?.text).toBe(
      "the text changed while sleep 0.3; sort ran — the 2 lines left as they were",
    );
    await h.app.run("shell.stop");
    expect(h.app.messages.at(-1)?.text).toBe("no command running");
  });

  test("typed at the `:` line, :!cmd and :N,M!cmd run as the commands shell.run and shell.filter, as :s and :42 do: the trace of commands run counts them", async () => {
    const root = vault({ "c6.md": "b\na\n" });
    const h = await harness({ root, open: "c6.md", width: 120, height: 30 });
    const ran: string[] = [];
    const run = h.app.run.bind(h.app);
    h.app.run = (spec: string) => (ran.push(spec), run(spec));
    await ex(h, "!true");
    await ex(h, "1,2!sort");
    expect(ran.filter((spec) => spec.startsWith("shell."))).toEqual(["shell.run true", "shell.filter 1,2!sort"]);
    expect(h.app.view!.buf.source).toBe("a\nb\n");
  });
});
