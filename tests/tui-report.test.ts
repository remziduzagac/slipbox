// Reporting a problem in the TUI (RPT): the report's window, the screen and place kept and added on your say, and its
// sending — each way faked: the browser's opener by the host, gh by a script on PATH.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { isWsl } from "../src/core/foundation/platform/wsl.ts";
import { join } from "node:path";
import { canonKey } from "../src/core/application/commands/registry.ts";
import { tildePath } from "../src/core/workspace/vaults/names.ts";
import { GUIDE, readReport, SCREEN_INTRO, WHERE_INTRO } from "../src/core/application/distribution/report.ts";
import { NoteBuffer } from "../src/tui/buffer.ts";
import { placeAt } from "../src/tui/editing.ts";
import type { ListOverlay } from "../src/tui/app/runtime/app.ts";
import { TextCanvas } from "../src/tui/shell/terminal/canvas.ts";
import { type Harness, harness, makeSandbox, makeVault } from "./tui-harness.ts";

const sandbox = makeSandbox();

/** The report's window's text. */
const text = (h: Harness) => h.app.view!.buf.source;
const said = (h: Harness) => h.app.messages.at(-1)?.text ?? "";
const type = (h: Harness, s: string) => h.keys(...[...s].map((ch) => (ch === " " ? "space" : ch)));

/** Everything under a folder, as text: nothing of a report may be in it. */
function allText(dir: string): string {
  let out = "";
  for (const e of readdirSync(dir, { withFileTypes: true, recursive: true }))
    if (e.isFile()) out += readFileSync(join(e.parentPath, e.name), "utf8");
  return out;
}

const PATH = process.env.PATH;
/** The browser's opener here: macOS's own, WSL's, else a display's. */
const OPENER = process.platform === "darwin" ? "open" : isWsl() ? "wslview" : "xdg-open";
afterEach(() => {
  process.env.PATH = PATH;
});

describe("the report's window (RPT-D1)", () => {
  test("space r opens it: the facts in it, no screen, no place, typing on the title's line", async () => {
    const h = await harness();
    const frame = await h.keys("space", "r");
    expect(h.app.floating?.kind).toBe("report");
    expect(frame).toContain("Report a problem");
    expect(frame).toContain("ctrl+s sends it or adds the screen · esc · q leaves it");
    const t = text(h);
    expect(t.startsWith(GUIDE)).toBe(true);
    expect(t).toContain("### What happened");
    expect(t).toMatch(/### Version\n\n\d+\.\d+\.\d+ \(/);
    expect(t).toMatch(/### Terminal\n\n.*120×30/);
    expect(SCREEN_INTRO.test(t) || WHERE_INTRO.test(t)).toBe(false);
    expect(h.app.view!.insert).toBe(true);
    await type(h, "It froze");
    expect(t.split("\n")[2]).toBe("");
    expect(text(h).split("\n")[2]).toBe("It froze");
    // Never "unsaved": it's never saved anywhere.
    expect(frame.split("\n").at(-1)).toContain("‹ report ›");
    expect((await h.keys("escape")).split("\n").at(-1)).not.toContain("unsaved");
  });

  test("keys sent at once with space r land in the report, never in the note under it", async () => {
    const h = await harness();
    const note = h.app.tabView!.buf.source;
    const burst = Promise.all(["space", "r", "B", "u", "r", "s", "t"].map((k) => h.app.input.handleKey(canonKey(k))));
    // The frame the report opens on comes after the keys, as a terminal's would.
    setTimeout(() => h.frame(), 30);
    await burst;
    h.frame();
    expect(h.app.floating?.kind).toBe("report");
    expect(text(h).split("\n")[2]).toBe("Burst");
    expect(h.app.tabView!.buf.source).toBe(note);
  });

  test(":report and help's Report a problem open it too", async () => {
    const h = await harness();
    await type(h, ":report");
    await h.keys("enter");
    expect(h.app.floating?.kind).toBe("report");
    await h.keys("escape", "escape");
    expect(h.app.floating).toBeNull();
    await h.keys("?");
    await type(h, "report a problem");
    await h.keys("enter");
    expect(h.app.floating?.kind).toBe("report");
  });

  test("left, focus goes back where it was opened from: the explorer", async () => {
    const h = await harness();
    const region = () => h.app.region;
    h.app.region = "sidebar";
    h.frame();
    await h.keys("space", "r");
    expect(region()).toBe("content");
    await h.keys("escape", "escape");
    expect(h.app.floating).toBeNull();
    expect(region()).toBe("sidebar");
  });

  test("asked twice before its frame (screen, then where): both added", async () => {
    const h = await harness();
    await h.app.run("help.report screen");
    await h.app.run("help.report where");
    h.frame();
    expect(readReport(text(h)).added).toEqual({ screen: true, where: true });
  });

  test("no frame after space r: the keys after it wait a moment, once, then go on as before", async () => {
    const h = await harness();
    await h.app.run("help.report");
    const t0 = Date.now();
    await h.app.input.handleKey(canonKey("j"));
    expect(Date.now() - t0).toBeGreaterThanOrEqual(200);
    const t1 = Date.now();
    await h.app.input.handleKey(canonKey("k"));
    expect(Date.now() - t1).toBeLessThan(150);
  });

  test("esc twice leaves it; opened again, it's as it was left", async () => {
    const h = await harness();
    await h.keys("space", "r");
    await type(h, "Crash");
    await h.keys("escape");
    expect(h.app.floating?.kind).toBe("report");
    await h.keys("escape");
    expect(h.app.floating).toBeNull();
    await h.keys("space", "r");
    expect(text(h).split("\n")[2]).toBe("Crash");
    // Reopened, it isn't typing: it's as it was left.
    expect(h.app.view!.insert).toBe(false);
    await h.keys("q");
    expect(h.app.floating).toBeNull();
  });

  test("quit isn't refused by it, nothing is autosaved, nothing of it is on disk", async () => {
    const h = await harness();
    await h.keys("space", "r");
    await type(h, "a secret title");
    await h.keys("escape");
    expect(h.app.dirtyBuffers()).toEqual([]);
    expect([...h.app.buffers.values()].some((b) => b.source.includes("a secret title"))).toBe(false);
    h.app.saving.requestQuit();
    expect(h.quit.called).toBe(true);
    expect(allText(sandbox)).not.toContain("a secret title");
  });

  test("an argument it doesn't know is refused; send outside a report says how to start one", async () => {
    const h = await harness();
    await h.app.run("help.report nope");
    expect(said(h)).toBe("report: nope? — :report screen or :report where adds one");
    expect(h.app.floating).toBeNull();
    await h.app.run("help.report_send");
    expect(said(h)).toBe("no report — space r starts one");
    await h.keys("space", "r");
    await h.keys("escape", "escape");
    await h.app.run("help.report_send copy");
    expect(said(h)).toBe("the report isn't open — space r opens it");
    await h.keys("space", "r");
    await h.app.run("help.report_send post");
    expect(said(h)).toBe("report: post? — browser, address, seen, copy or gh");
  });

  test("the palette lists its arguments", async () => {
    const h = await harness();
    await type(h, ":report ");
    const items = (h.app.overlay as ListOverlay).filtered.map((f) => f.item.label);
    expect(items.some((l) => l.includes("screen"))).toBe(true);
    expect(items.some((l) => l.includes("where"))).toBe(true);
  });
});

describe("the screen and where you were (RPT-D2)", () => {
  test("the screen: the frame after the command, without the palette or help that ran it; added in full, once", async () => {
    const h = await harness();
    const before = h.frame();
    await h.keys("?");
    await type(h, "report a problem");
    await h.keys("enter");
    expect(SCREEN_INTRO.test(text(h))).toBe(false);
    await h.app.run("help.report screen");
    const t = text(h);
    expect(t).toContain("The screen, 120×30, as the report opened:\n\n```text\n");
    const screen = t.slice(t.indexOf("```text\n") + 8, t.lastIndexOf("\n```"));
    expect(screen).toBe(before.replace(/\n+$/, ""));
    expect(screen).not.toContain("All keys and commands");
    expect(t.indexOf("### What slipbox sees")).toBeGreaterThan(t.indexOf("### Terminal"));
    await h.app.run("help.report screen");
    expect(said(h)).toBe("the screen is in the report already");
    expect(t.split("The screen, ").length).toBe(2);
  });

  test("u takes it out in one step, and it can be added again", async () => {
    const h = await harness();
    await h.keys("space", "r");
    await type(h, "T");
    await h.keys("escape");
    const typed = text(h);
    await h.app.run("help.report screen");
    expect(SCREEN_INTRO.test(text(h))).toBe(true);
    await h.keys("u");
    expect(text(h)).toBe(typed);
    await h.app.run("help.report screen");
    expect(SCREEN_INTRO.test(text(h))).toBe(true);
  });

  test("added while typing: its own undo step, the typing kept", async () => {
    const h = await harness();
    await h.keys("space", "r");
    await type(h, "Crash");
    expect(h.app.view!.insert).toBe(true);
    await h.keys("ctrl+s", "s");
    expect(SCREEN_INTRO.test(text(h))).toBe(true);
    expect(h.app.view!.insert).toBe(false);
    await h.keys("u");
    expect(SCREEN_INTRO.test(text(h))).toBe(false);
    expect(text(h).split("\n")[2]).toBe("Crash");
  });

  test("where you were: a note's path, line and text, and how it was shown; no file, said", async () => {
    const h = await harness();
    await h.keys("j", "j");
    const line = h.app.cursorLine(h.app.view!);
    const src = h.app.view!.buf.source.split("\n")[line - 1]!;
    await h.app.run("help.report where");
    h.frame();
    const t = text(h);
    expect(t).toContain(`Where it was:\n\n\`\`\`text\nindex.md, line ${line}, rendered\n${src}\n\`\`\``);
    // Not added twice: the menu's entry gone, the command says so.
    await h.app.run("help.report where");
    expect(said(h)).toBe("where you were is in the report already");
    // Adding left typing: ctrl+s, not esc first (which would leave the window).
    await h.keys("ctrl+s");
    expect((h.app.overlay as ListOverlay).items.some((i) => i.data === "where")).toBe(false);
    expect((h.app.overlay as ListOverlay).items.some((i) => i.data === "screen")).toBe(true);
  });

  test('where you were in a peek: its file, in its vault, never "no file was open"', async () => {
    const h = await harness();
    const file = join(sandbox, "other-vault-note.md");
    writeFileSync(file, "first\n");
    const buf = new NoteBuffer(null, file, `peek:${file}`);
    buf.kind = { group: "note", format: "markdown" };
    buf.virtual = { save: () => true };
    buf.readOnly = "a peek is read-only — o goes there, to edit it";
    buf.elsewhere = { vault: "research", graph: null, rel: "notes/other.md" };
    buf.loadText("first\n");
    h.app.floating = { kind: "hover", view: h.app.makeView(buf), title: "Peek" };
    h.frame();
    await h.app.run("help.report where");
    h.frame();
    expect(text(h)).toContain("Where it was:\n\n```text\nresearch: notes/other.md, line 1, rendered\nfirst\n```");
  });

  test("where you were: a window with no file, and a file outside the vault", async () => {
    const h = await harness();
    h.app.overlays.openHover("A hover's text", "Hover");
    h.frame();
    await h.app.run("help.report where");
    h.frame();
    expect(h.app.floating?.kind).toBe("report");
    expect(text(h)).toContain("Where it was:\n\n```text\nno file was open\n```");
    const outside = join(sandbox, "outside.md");
    writeFileSync(outside, "first\n\nsecond line\n");
    const h2 = await harness({ open: outside });
    await h2.keys("G");
    await h2.app.run("help.report where");
    h2.frame();
    expect(text(h2)).toContain(
      `Where it was:\n\n\`\`\`text\n${tildePath(outside)}, line 3, rendered\nsecond line\n\`\`\``,
    );
  });

  test("a note's own fences can't end it, and a fence left open refuses it", async () => {
    const h = await harness();
    h.app.view!.buf.edit(0, 0, "````md\n```js\nx\n```\n````\n");
    h.frame();
    await h.keys("g", "g");
    await h.keys("space", "r");
    await type(h, "T");
    await h.keys("escape");
    await h.app.run("help.report where");
    expect(text(h)).toContain("Where it was:\n\n`````text\n");
    expect(text(h)).toContain("\n````md\n`````");
    await h.keys("u");
    // A fence opened in What happened, never closed.
    await h.keys("G", "o");
    await type(h, "```");
    await h.keys("escape");
    await h.app.run("help.report screen");
    expect(said(h)).toBe("report: a fence is left open in the report: close it first");
    expect(SCREEN_INTRO.test(text(h))).toBe(false);
  });

  test("a note's line that reads as the screen's first line doesn't count as the screen added", async () => {
    const h = await harness();
    h.app.view!.buf.edit(0, 0, "The screen, 120×30, as the report opened:\n\n");
    h.frame();
    await h.keys("g", "g");
    await h.app.run("help.report where");
    h.frame();
    expect(text(h)).toContain("Where it was:\n\n```text\nindex.md, line 1, rendered\nThe screen, 120×30");
    await h.keys("ctrl+s");
    expect((h.app.overlay as ListOverlay).items.some((i) => i.data === "screen")).toBe(true);
    await h.keys("s");
    // The note's own line, in where it was, and the screen's first line: two, one of them added.
    expect(text(h).split("\nThe screen, 120×30, as the report opened:\n").length).toBe(3);
    await h.keys("ctrl+s");
    expect((h.app.overlay as ListOverlay).items.some((i) => i.data === "screen")).toBe(false);
  });

  test("drawing failing: the report opens all the same, the frame saying so kept", async () => {
    const h = await harness();
    // Something drawing calls: where you are on the top bar reads the branch.
    const branch = h.app.git.branch.bind(h.app.git);
    h.app.git.branch = () => {
      throw new Error("boom");
    };
    await h.app.run("help.report screen");
    h.app.draw(new TextCanvas(120, 30));
    expect(h.app.floating?.kind).toBe("report");
    expect(text(h)).toContain("The screen, 120×30, as the report opened:\n\n```text\nslipbox: drawing failed: boom");
    h.app.git.branch = branch;
  });

  test("the screen asked for with none kept: said, never the place in its stead", async () => {
    const h = await harness();
    await h.keys("space", "r", "escape");
    (h.app.report as unknown as { screen: null }).screen = null;
    await h.app.run("help.report screen");
    expect(said(h)).toBe("no screen kept: space r keeps one as it opens");
    expect(readReport(text(h)).added).toEqual({ screen: false, where: false });
  });

  test("a read-only window over a real file (a peek): a task toggled there is refused, said; the file kept", async () => {
    const h = await harness();
    const file = join(h.root, "notes", "tasks.md");
    writeFileSync(file, "- [ ] one\n");
    const buf = new NoteBuffer(null, file, `peek:${file}`);
    buf.kind = { group: "note", format: "markdown" };
    buf.virtual = { save: () => true };
    buf.readOnly = "a peek is read-only — o goes there, to edit it";
    buf.loadText("- [ ] one\n");
    h.app.floating = { kind: "hover", view: h.app.makeView(buf), title: "Peek" };
    h.frame();
    await h.app.run("task.toggle");
    expect(said(h)).toBe("a peek is read-only — o goes there, to edit it");
    expect(readFileSync(file, "utf8")).toBe("- [ ] one\n");
    // And writing it any other way is refused, said.
    expect(h.app.writeBuffer(buf, "- [x] one\n")).toBe(false);
    expect(said(h)).toBe(`peek:${file} is the floating window's, not a file: not written`);
  });

  test("opened over the merge screen of the conflict prompt's (m): its question back once typing stops, never under the title", async () => {
    const root = makeVault();
    const file = join(root, "c.md");
    writeFileSync(file, "one\n");
    const h = await harness({ root, open: "c.md" });
    const v = h.app.view!;
    await h.keys("g", "g", "shift+a", "!", "escape");
    writeFileSync(file, "one#\n");
    const future = Date.now() / 1000 + 5;
    utimesSync(file, future, future);
    h.app.watch.reloadBuffer(v.buf);
    await h.keys("m");
    expect(h.app.floating?.kind).toBe("merge");
    await h.keys("space", "r");
    expect(h.app.floating?.kind).toBe("report");
    // Typing its title: the letters are the title's, never the question's answers (m, l, k, d).
    expect(h.app.overlay).toBeNull();
    await type(h, "my title, loaded");
    expect(text(h).split("\n")[2]).toBe("my title, loaded");
    expect(v.buf.source).toBe("one!\n");
    expect(v.buf.dirty).toBe(true);
    // Typing stopped: the question again, as for any conflict that comes while typing.
    await h.keys("escape", "j");
    expect((h.app.overlay as ListOverlay).title).toContain("changed on disk");
    expect(h.app.floating?.kind).toBe("report");
    expect(v.buf.source).toBe("one!\n");
  });

  test("an edit that saves after it (a link put in) never opens the menu; a task in the report toggles in its text", async () => {
    const h = await harness();
    await h.keys("space", "r", "escape");
    const v = h.app.view!;
    const at = text(h).indexOf("### What happened\n\n") + "### What happened\n\n".length;
    // As a link inserted from the picker, or a footnote added, is: edits, then a save.
    h.app.views.applyNoteEdits([{ at, length: 0, text: "- [ ] a task" }], "edited");
    h.frame();
    expect(h.app.overlay).toBeNull();
    expect(text(h)).toContain("- [ ] a task");
    // Saved (nothing to write), so clean: toggled in its text all the same, there being no file.
    expect(v.buf.dirty).toBe(false);
    const line = text(h).split("\n").indexOf("- [ ] a task");
    placeAt(h.app, v, v.buf.lineStarts()[line]!);
    h.frame();
    await h.app.run("task.toggle");
    expect(text(h)).toContain("- [x] a task");
    expect(said(h)).not.toContain("can't read");
  });

  test("the menu adds them too: s and w", async () => {
    const h = await harness();
    await h.keys("space", "r", "escape", "ctrl+s", "s");
    expect(SCREEN_INTRO.test(text(h))).toBe(true);
    await h.keys("ctrl+s", "w");
    expect(WHERE_INTRO.test(text(h))).toBe(true);
    await h.keys("ctrl+s");
    const keys = (h.app.overlay as ListOverlay).items.map((i) => i.hotkey);
    expect(keys).not.toContain("s");
    expect(keys).not.toContain("w");
  });
});

describe("sending (RPT-D3, RPT-D4)", () => {
  /** A harness whose host opens a browser by `answer`'s exit, and records what it ran. */
  async function withOpener(answer: number | string | "never", env: Record<string, string> = {}) {
    const ran: string[][] = [];
    const h = await harness();
    h.app.host.runDetached = (argv) => {
      ran.push(argv);
      return answer === "never" ? new Promise(() => {}) : Promise.resolve(answer);
    };
    const saved = { ...process.env };
    Object.assign(process.env, { DISPLAY: ":0", SSH_CONNECTION: "", SSH_CLIENT: "", SSH_TTY: "", ...env });
    const bin = join(sandbox, `bin-${Math.random().toString(36).slice(2)}`);
    mkdirSync(bin);
    for (const p of ["xdg-open", "open", "wslview"]) {
      writeFileSync(join(bin, p), "#!/bin/sh\nexit 0\n");
      chmodSync(join(bin, p), 0o755);
    }
    process.env.PATH = bin;
    const restore = () => {
      for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
      Object.assign(process.env, saved);
    };
    return { h, ran, restore };
  }

  test("ctrl+s: the menu by what this machine can do, nothing sent", async () => {
    const { h, restore } = await withOpener(0);
    try {
      await h.keys("space", "r", "escape", "ctrl+s");
      const o = h.app.overlay as ListOverlay;
      expect(o.title).toBe("Send the report — nothing has left yet");
      expect(o.items.map((i) => i.hotkey).filter(Boolean)).toEqual(["o", "a", "c", "s", "w"]);
      expect(h.copied).toEqual([]);
    } finally {
      restore();
    }
  });

  test("the browser: opened on the address, the report's fields in it; over SSH, none, the address copied", async () => {
    const { h, ran, restore } = await withOpener(0);
    try {
      await h.keys("space", "r");
      await type(h, "Crash");
      await h.keys("escape");
      await h.app.run("help.report_send browser");
      expect(ran).toHaveLength(1);
      expect(ran[0]![0]).toBe(OPENER);
      const url = new URL(ran[0]![1]!);
      expect(url.searchParams.get("title")).toBe("Crash");
      expect(url.searchParams.get("template")).toBe("bug_report.yml");
      expect(said(h)).toBe("the bug form is opening in your browser");
      expect(h.copied).toEqual([]);
      process.env.SSH_TTY = "/dev/pts/3";
      await h.keys("ctrl+s");
      expect((h.app.overlay as ListOverlay).items.some((i) => i.data === "browser")).toBe(false);
      await h.keys("escape");
      await h.app.run("help.report_send browser");
      expect(ran).toHaveLength(1);
      expect(h.copied.at(-1)).toBe(url.href);
    } finally {
      restore();
    }
  });

  test("the opener failing: the address copied instead, why said", async () => {
    const { h, restore } = await withOpener(3);
    try {
      await h.keys("space", "r", "escape");
      await h.app.run("help.report_send browser");
      expect(h.copied.at(-1)).toStartWith("https://github.com/");
      await Bun.sleep(50);
      expect(said(h)).toContain(`${OPENER} exited with 3`);
    } finally {
      restore();
    }
  });

  test.if(process.platform === "linux")("WSL: explorer.exe's 1 isn't a failure", async () => {
    const wsl = await withOpener(1, { WSL_DISTRO_NAME: "Ubuntu" });
    try {
      // explorer.exe when there's no wslview.
      rmSync(join(process.env.PATH!, "wslview"));
      writeFileSync(join(process.env.PATH!, "explorer.exe"), "#!/bin/sh\nexit 1\n");
      chmodSync(join(process.env.PATH!, "explorer.exe"), 0o755);
      await wsl.h.keys("space", "r", "escape");
      await wsl.h.app.run("help.report_send browser");
      expect(wsl.ran[0]![0]).toBe("explorer.exe");
      expect(said(wsl.h)).toBe("the bug form is opening in your browser");
      expect(wsl.h.copied).toEqual([]);
    } finally {
      wsl.restore();
    }
  });

  test("copies: the address, What slipbox sees when it doesn't fit, the report as written; one at a time", async () => {
    const { h, restore } = await withOpener(0);
    try {
      await h.keys("space", "r");
      await type(h, "Crash");
      await h.keys("escape");
      await h.app.run("help.report_send copy");
      expect(h.copied.at(-1)).toBe(text(h).slice(GUIDE.length + 2));
      await h.app.run("help.report_send address");
      expect(new URL(h.copied.at(-1)!).searchParams.get("title")).toBe("Crash");
      // A screen too big for the address: left out of it, said, and v copies it.
      h.app.view!.buf.edit(text(h).length, 0, `\n### What slipbox sees\n\n${"x".repeat(6000)}\n`);
      await h.keys("ctrl+s");
      const o = h.app.overlay as ListOverlay;
      expect(o.items.find((i) => i.data === "address")?.detail).toBe("filled in but What slipbox sees: v copies it");
      await h.keys("v");
      await Bun.sleep(20);
      expect(h.copied.at(-1)).toBe("x".repeat(6000));
      // Two at once: the second waits its turn, refused.
      const n = h.copied.length;
      const first = h.app.report.send("copy");
      const second = h.app.report.send("address");
      await Promise.all([first, second]);
      expect(h.copied.length).toBe(n + 1);
      expect(h.app.messages.some((m) => m.text === "still copying — wait for it")).toBe(true);
    } finally {
      restore();
    }
  });

  test("text above the first heading that no field holds: no address, said; the copy still", async () => {
    const { h, restore } = await withOpener(0);
    try {
      await h.keys("space", "r");
      await type(h, "Crash");
      await h.keys("enter");
      await type(h, "more words here");
      await h.keys("escape", "ctrl+s");
      const o = h.app.overlay as ListOverlay;
      expect(o.items[0]!.header).toBe(true);
      expect(o.items.map((i) => i.hotkey).filter(Boolean)).toEqual(["c", "s", "w"]);
      await h.keys("escape");
      await h.app.run("help.report_send address");
      expect(said(h)).toBe(
        "report: text above the first heading belongs to no field: the address would lose it — move it under one; c copies the report",
      );
    } finally {
      restore();
    }
  });

  test("a fence left open: no address, said in the menu; the copy and gh still", async () => {
    const { h, restore } = await withOpener(0);
    try {
      await h.keys("space", "r");
      await type(h, "Crash");
      await h.keys("escape", "/");
      await type(h, "### What happened");
      await h.keys("enter", "o");
      await type(h, "```");
      await h.keys("escape", "ctrl+s");
      const o = h.app.overlay as ListOverlay;
      expect(o.items[0]!.label).toBe("A fence is left open: where each field ends isn't clear — close it");
      expect(o.items.map((i) => i.hotkey).filter(Boolean)).toEqual(["c", "s", "w"]);
      await h.keys("escape");
      await h.app.run("help.report_send browser");
      expect(h.copied).toEqual([]);
    } finally {
      restore();
    }
  });

  test(":w! in the report writes nothing anywhere: it's :w, the menu", async () => {
    const h = await harness();
    await h.keys("space", "r");
    await type(h, "never on disk");
    await h.keys("escape");
    await h.app.run("note.save_force");
    expect((h.app.overlay as ListOverlay).title).toBe("Send the report — nothing has left yet");
    expect(allText(sandbox)).not.toContain("never on disk");
    // Its name was `report:`, written where slipbox ran, before (#5's review).
    for (const name of ["report", "report:"]) expect(existsSync(join(process.cwd(), name))).toBe(false);
    // Nor through any other way of writing a buffer.
    expect(h.app.writeBuffer(h.app.view!.buf, "never on disk either")).toBe(false);
  });
});

describe("gh (RPT-D4)", () => {
  // A token in the environment names its own account: none, here, but the fakes'.
  const tokens = { GH_TOKEN: process.env.GH_TOKEN, GITHUB_TOKEN: process.env.GITHUB_TOKEN };
  beforeEach(() => {
    delete process.env.GH_TOKEN;
    delete process.env.GITHUB_TOKEN;
  });
  afterEach(() => {
    for (const [k, v] of Object.entries(tokens)) if (v !== undefined) process.env[k] = v;
  });

  /** A fake gh on PATH: what it's given kept in `dir`, its answer to `issue create` as told. */
  function fakeGh(answer: string, account = "echo octo-cat") {
    const dir = join(sandbox, `gh-${Math.random().toString(36).slice(2)}`);
    mkdirSync(join(dir, "home"), { recursive: true });
    writeFileSync(
      join(dir, "gh"),
      `#!/bin/sh\nif [ "$1" = config ]; then ${account}; exit; fi\nprintf '%s\\n' "$@" > "${dir}/argv"\npwd > "${dir}/cwd"\ncat > "${dir}/input"\n${answer}\n`,
    );
    chmodSync(join(dir, "gh"), 0o755);
    // Its own folder first; the system's after, for its `cat`.
    process.env.PATH = `${dir}:/usr/bin:/bin`;
    return dir;
  }

  async function report(h: Harness, title: string, happened: string): Promise<void> {
    await h.keys("space", "r");
    await type(h, title);
    await h.keys("escape");
    const t = text(h);
    const at = t.indexOf("### What happened\n\n") + "### What happened\n\n".length;
    h.app.view!.buf.edit(at, 0, happened);
  }

  test("absent from PATH: no entry", async () => {
    process.env.PATH = join(sandbox, "nothing");
    const h = await harness();
    await h.keys("space", "r", "escape", "ctrl+s");
    expect((h.app.overlay as ListOverlay).items.some((i) => i.data === "gh")).toBe(false);
  });

  test("the yes-or-no names the title, the repository, the account, and that anyone can read it; no runs nothing", async () => {
    const dir = fakeGh("echo https://github.com/me/x/issues/7");
    const h = await harness();
    h.app.home = join(dir, "home");
    await report(h, "Crash on open", "it froze");
    await h.app.run("help.report_send gh");
    const o = h.app.overlay as { kind: string; label: string };
    expect(o.kind).toBe("prompt");
    expect(o.label).toBe('Post "Crash on open" on remziduzagac/slipbox as octo-cat? Anyone can read it.');
    await h.keys("n");
    expect(readdirSync(dir)).not.toContain("argv");
    expect(h.app.floating?.kind).toBe("report");
  });

  test("posted: the argument vector, the text as confirmed on its input, from home; the draft dropped", async () => {
    const dir = fakeGh("echo https://github.com/remziduzagac/slipbox/issues/77");
    const h = await harness();
    h.app.home = join(dir, "home");
    await report(h, "Crash on open", "it froze");
    const body = text(h).split("\n").slice(3).join("\n").replace(/^\n+/, "").replace(/\s+$/, "");
    await h.app.run("help.report_send gh");
    await h.keys("y");
    expect(h.app.floating).toBeNull();
    expect(h.app.report.posting).toBe(true);
    await h.app.run("help.report");
    expect(said(h)).toBe("posting the report with gh… — wait for it");
    for (let i = 0; i < 100 && h.app.report.posting; i++) await Bun.sleep(20);
    expect(said(h)).toBe("posted: https://github.com/remziduzagac/slipbox/issues/77");
    expect(readFileSync(join(dir, "argv"), "utf8")).toBe(
      "issue\ncreate\n--repo\ngithub.com/remziduzagac/slipbox\n--title\nCrash on open\n--body-file\n-\n",
    );
    expect(readFileSync(join(dir, "input"), "utf8")).toBe(`${body}\n`);
    expect(readFileSync(join(dir, "cwd"), "utf8").trim()).toEndWith("/home");
    // Dropped: a new report starts afresh.
    await h.keys("space", "r");
    expect(text(h).split("\n")[2]).toBe("");
  });

  test("what the question names is what's posted: the report as it is after gh's account is read", async () => {
    const dir = fakeGh("echo https://github.com/remziduzagac/slipbox/issues/78", "sleep 0.4; echo octo-cat");
    const h = await harness();
    h.app.home = join(dir, "home");
    await report(h, "Old title", "it froze");
    const asking = h.app.run("help.report_send gh");
    // Edited while gh is asked for its account.
    await Bun.sleep(100);
    expect(text(h).split("\n")[2]).toBe("Old title");
    h.app.view!.buf.edit(text(h).indexOf("Old title"), "Old title".length, "New title");
    await asking;
    expect((h.app.overlay as unknown as { label: string }).label).toBe(
      'Post "New title" on remziduzagac/slipbox as octo-cat? Anyone can read it.',
    );
    await h.keys("y");
    for (let i = 0; i < 100 && h.app.report.posting; i++) await Bun.sleep(20);
    expect(readFileSync(join(dir, "argv"), "utf8")).toContain("--title\nNew title\n");
  });

  test("keys typed while gh was asked (typing on, say): the question not opened, so a y among them posts nothing", async () => {
    const dir = fakeGh("echo https://github.com/remziduzagac/slipbox/issues/80", "sleep 0.4; echo octo-cat");
    const h = await harness();
    h.app.home = join(dir, "home");
    await report(h, "Crash", "it froze");
    // ctrl+s while typing, g, and typing on: "...yes".
    await h.keys("A");
    const asking = h.app.run("help.report_send gh");
    await Bun.sleep(50);
    await type(h, " yes");
    await asking;
    expect(h.app.overlay).toBeNull();
    expect(said(h)).toBe("gh is ready: ctrl+s, g in the report asks again");
    await h.keys("y");
    expect(readdirSync(dir)).not.toContain("argv");
  });

  test("a key that came while gh's own key waited its turn (sent at once, a fast typist): typed meanwhile too", async () => {
    const dir = fakeGh("echo https://github.com/remziduzagac/slipbox/issues/81", "sleep 0.4; echo octo-cat");
    const h = await harness();
    h.app.home = join(dir, "home");
    await report(h, "Crash", "it froze");
    // All three taken before g is handled: g waits behind ctrl+s, and j behind g.
    const keys = ["ctrl+s", "g", "j"].map((k) => h.app.input.handleKey(k));
    await Promise.all(keys);
    for (let i = 0; i < 100 && !said(h).startsWith("gh is ready") && !h.app.overlay; i++) await Bun.sleep(20);
    expect(h.app.overlay).toBeNull();
    expect(said(h)).toBe("gh is ready: ctrl+s, g in the report asks again");
    expect(readdirSync(dir)).not.toContain("argv");
  });

  test("closed, or something opened over it, while gh was asked: nothing asked over that, said", async () => {
    const dir = fakeGh("echo https://github.com/remziduzagac/slipbox/issues/79", "sleep 0.4; echo octo-cat");
    const h = await harness();
    h.app.home = join(dir, "home");
    await report(h, "Crash", "it froze");
    const asking = h.app.run("help.report_send gh");
    await Bun.sleep(50);
    await h.keys("escape");
    await asking;
    expect(h.app.overlay).toBeNull();
    expect(said(h)).toBe("the report was closed: ctrl+s, g in it asks again");
    await h.keys("space", "r");
    const again = h.app.run("help.report_send gh");
    await Bun.sleep(50);
    await h.keys(":");
    const palette = h.app.overlay;
    await again;
    expect(h.app.overlay).toBe(palette);
    expect(said(h)).toBe("gh is ready: ctrl+s, g in the report asks again");
    expect(readdirSync(dir)).not.toContain("argv");
  });

  test("opening it failing, from the frame's drawing: said, and drawing goes on", async () => {
    const h = await harness();
    const make = h.app.makeView.bind(h.app);
    h.app.makeView = () => {
      throw new Error("no view");
    };
    await h.app.run("help.report");
    expect(() => h.app.draw(new TextCanvas(120, 30))).not.toThrow();
    expect(said(h)).toBe("report: couldn't open it: no view");
    h.app.makeView = make;
    expect(h.app.floating).toBeNull();
  });

  test("failed: gh's words said, the draft kept; no account, or no title or What happened, asked first", async () => {
    const dir = fakeGh("echo 'HTTP 422: Validation Failed' >&2; exit 1");
    const h = await harness();
    h.app.home = join(dir, "home");
    await h.keys("space", "r", "escape");
    await h.app.run("help.report_send gh");
    expect(said(h)).toBe("gh: write a title (the line after the guide) and What happened first");
    // A title alone isn't enough.
    await h.keys("g", "g", "j", "j");
    await h.keys("i");
    await type(h, "Crash");
    await h.keys("escape");
    const n = h.app.messages.length;
    await h.app.run("help.report_send gh");
    expect(h.app.messages.length).toBe(n + 1);
    expect(said(h)).toBe("gh: write a title (the line after the guide) and What happened first");
    expect(h.app.overlay).toBeNull();
    await h.keys("escape", "escape");
    const h2 = await harness();
    h2.app.home = join(dir, "home");
    await report(h2, "Crash", "it froze");
    await h2.app.run("help.report_send gh");
    await h2.keys("y");
    for (let i = 0; i < 100 && h2.app.report.posting; i++) await Bun.sleep(20);
    expect(said(h2)).toBe("gh: HTTP 422: Validation Failed — the report is kept (space r)");
    await h2.keys("space", "r");
    expect(text(h2).split("\n")[2]).toBe("Crash");
    fakeGh("true", "exit 1");
    await h2.app.run("help.report_send gh");
    expect(said(h2)).toBe("gh has no account for github.com here — gh auth login first");
    // A comment left open: GitHub would hide what's after it, so not posted.
    h2.app.view!.buf.edit(text(h2).indexOf("Crash") + "Crash".length, 0, "\n<!-- unclosed");
    await h2.app.run("help.report_send gh");
    expect(said(h2)).toBe("gh: a comment (<!--) is left open: GitHub hides everything after it — close it with -->");
  });
});
