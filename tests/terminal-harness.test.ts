// The terminal tests' own harness (tests/terminal/): the keys as a terminal sends them, and the headless terminal
// reading back what a program draws and answering what it asks (TT-T1).

import { describe, expect, test } from "bun:test";
import { encodeKey } from "./terminal/keys.ts";
import { Session } from "./terminal/session.ts";
import { HeadlessTerminal } from "./terminal/terminal.ts";

describe("keys as a terminal sends them", () => {
  test("Kitty's protocol: escape a sequence of its own; ctrl and alt as CSI u; text, shifted or not, as itself", () => {
    const kitty = (k: string) => encodeKey(k, "kitty");
    expect(kitty("escape")).toBe("\x1b[27u");
    expect(kitty("j")).toBe("j");
    expect(kitty("G")).toBe("G");
    expect(kitty("shift+g")).toBe("G");
    expect(kitty("$")).toBe("$");
    expect(kitty("space")).toBe(" ");
    expect(kitty("enter")).toBe("\r");
    expect(kitty("tab")).toBe("\t");
    expect(kitty("backspace")).toBe("\x7f");
    expect(kitty("ctrl+q")).toBe("\x1b[113;5u");
    expect(kitty("alt+w")).toBe("\x1b[119;3u");
    expect(kitty("ctrl+shift+f")).toBe("\x1b[102;6u");
    expect(kitty("shift+ctrl+right")).toBe("\x1b[1;6C");
    expect(kitty("ctrl+enter")).toBe("\x1b[13;5u");
    expect(kitty("shift+tab")).toBe("\x1b[9;2u");
    expect(kitty("ctrl+space")).toBe("\x1b[32;5u");
    expect(kitty("up")).toBe("\x1b[A");
    expect(kitty("alt+shift+down")).toBe("\x1b[1;4B");
    expect(kitty("pagedown")).toBe("\x1b[6~");
    expect(kitty("shift+pageup")).toBe("\x1b[5;2~");
    expect(kitty("home")).toBe("\x1b[H");
    expect(kitty("f1")).toBe("\x1bOP");
    expect(kitty("ctrl++")).toBe("\x1b[43;5u");
  });
  test("a legacy terminal's: control characters, an escape before alt, CSI Z, modifyOtherKeys for the rest", () => {
    const legacy = (k: string) => encodeKey(k, "legacy");
    expect(legacy("escape")).toBe("\x1b");
    expect(legacy("ctrl+q")).toBe("\x11");
    expect(legacy("ctrl+p")).toBe("\x10");
    expect(legacy("alt+w")).toBe("\x1bw");
    expect(legacy("alt+enter")).toBe("\x1b\r");
    expect(legacy("shift+tab")).toBe("\x1b[Z");
    expect(legacy("ctrl+space")).toBe("\x00");
    expect(legacy("ctrl+enter")).toBe("\x1b[27;5;13~");
    expect(legacy("ctrl+shift+f")).toBe("\x1b[27;6;102~");
    expect(legacy("shift+g")).toBe("G");
    expect(legacy("ctrl+left")).toBe("\x1b[1;5D");
  });
  test("a name it doesn't know is an error, not a guess", () => {
    expect(() => encodeKey("hyper+x")).toThrow("unknown modifier");
    expect(() => encodeKey("pgdn")).toThrow("doesn't know");
  });
});

describe("the headless terminal", () => {
  /** Run `script` (sh) in a terminal of `cols`×`rows` until it exits; the terminal, drawn. */
  const run = async (script: string, cols = 40, rows = 6) => {
    const t = new HeadlessTerminal({ cols, rows });
    const p = t.spawn(["sh", "-c", script], { cwd: "/", env: { PATH: process.env.PATH ?? "/usr/bin:/bin" } });
    await p.exited;
    for (let i = 0; i < 100 && (!t.drawn || performance.now() - t.lastOutput < 30); i++) await Bun.sleep(10);
    return t;
  };
  test("text and its colours read back: true colour, the palette, bold; wide characters once", async () => {
    const t = await run("printf '\\033[1;38;2;255;0;0mred\\033[0m \\033[44mblue\\033[0m \\033[38;5;208mo\\033[0m 字x'");
    expect(t.screen()[0]).toBe("red blue o 字x");
    const row = t.runs()[0]!;
    expect(row[0]).toEqual({ text: "red", fg: "#ff0000", bg: null, bold: true });
    expect(row.find((r) => r.text === "blue")).toEqual({ text: "blue", fg: null, bg: "44", bold: false });
    expect(row.find((r) => r.text === "o")?.fg).toBe("5;208");
    t.dispose();
  });
  test("each cell with its whole style, for the docs' screenshots: dim, italic, underline, struck, inverse; the palette by index", async () => {
    const t = await run("printf '\\033[2;3;4ma\\033[0;9;7;31mb\\033[0;48;5;208mc\\033[0;1;38;2;1;2;3m字\\033[0m'");
    const [a, b, c, wide, after] = t.cells()[0]!;
    const plain = { bold: false, dim: false, italic: false, underline: false, strike: false, inverse: false };
    expect(a).toEqual({ text: "a", width: 1, fg: null, bg: null, ...plain, dim: true, italic: true, underline: true });
    expect(b).toEqual({ text: "b", width: 1, fg: 1, bg: null, ...plain, strike: true, inverse: true });
    expect(c).toEqual({ text: "c", width: 1, fg: null, bg: 208, ...plain });
    // A wide character once, two cells wide; the empty cells after it, spaces.
    expect(wide).toEqual({ text: "字", width: 2, fg: "#010203", bg: null, ...plain, bold: true });
    expect(after).toEqual({ text: " ", width: 1, fg: null, bg: null, ...plain });
    expect(t.cells()[0]!.length).toBe(40 - 1);
    t.dispose();
  });
  test("Kitty's graphics, when it draws them: a query answered OK, as kitty answers it; otherwise left unanswered", async () => {
    // The query OpenTUI sends, then the cursor's place asked: what came back before that answer, printed.
    const asker = String.raw`
      stty raw -echo
      printf '\033_Gi=31337,s=1,v=1,a=q,t=d,f=24;AAAA\033\\\033[6n'
      a=""; c=""
      while [ "$c" != "R" ]; do a="$a$c"; c=$(dd bs=1 count=1 2>/dev/null); done
      printf '%s' "$a" | od -An -c | tr -d ' \n'`;
    const said = async (graphics: boolean) => {
      const t = new HeadlessTerminal({ cols: 80, rows: 4, graphics });
      const p = t.spawn(["sh", "-c", asker], { cwd: "/", env: { PATH: process.env.PATH ?? "/usr/bin:/bin" } });
      await p.exited;
      for (let i = 0; i < 100 && (!t.drawn || performance.now() - t.lastOutput < 30); i++) await Bun.sleep(10);
      const text = t.screen().join("");
      t.dispose();
      return text;
    };
    // od's way: the escape as 033.
    expect(await said(true)).toMatch(/^033_Gi=31337;OK033\\+033\[1;1$/);
    expect(await said(false)).toBe("033[1;1");
  });
  test("clusters kept whole, as a modern terminal does: an emoji and its selector, a flag, a ZWJ family two cells; a letter and its mark one", async () => {
    const text = "☄\ufe0fa🇯🇵b👩\u200d🔬ce\u0301d🔭e";
    const t = await run(`printf '%s' '${text}'`);
    expect(t.screen()[0]).toBe(text);
    expect(t.cursor().x).toBe(2 + 1 + 2 + 1 + 2 + 1 + 1 + 1 + 2 + 1);
    t.dispose();
  });
  test("the title and every OSC 52 copy kept", async () => {
    // Not String.raw: Bun writes the dash in a raw template's source as \u2014.
    const t = await run("printf '\\033]0;slipbox — home.md\\007\\033]52;c;aGk=\\007\\033]52;c;dGhlcmU=\\033\\\\'");
    expect(t.title).toBe("slipbox — home.md");
    expect(t.copies).toEqual(["hi", "there"]);
    t.dispose();
  });
  test("it answers as a modern terminal: the Kitty keyboard flags pushed, its colours; then keys go Kitty's way", async () => {
    const t = new HeadlessTerminal({ cols: 60, rows: 4 });
    // Ask, push flags, ask again; print the answers (and a key typed after) as text.
    const asker = String.raw`
      stty raw -echo
      printf '\033[?u\033]11;?\007\033[>5u\033[?u'
      a=$(dd bs=1 count=42 2>/dev/null | od -An -c | tr -s ' ')
      printf '\033[2J\033[H%s' "$a"`;
    const p = t.spawn(["sh", "-c", asker], { cwd: "/", env: { PATH: process.env.PATH ?? "/usr/bin:/bin" } });
    for (let i = 0; i < 100 && !t.kittyKeys; i++) await Bun.sleep(10);
    expect(t.kittyKeys).toBe(true);
    t.key("ctrl+q"); // the last of the 42 bytes
    await p.exited;
    for (let i = 0; i < 100 && (!t.drawn || performance.now() - t.lastOutput < 30); i++) await Bun.sleep(10);
    const said = t.screen().join("").replace(/\s+/g, "");
    expect(said).toContain("[?0u"); // no flags yet
    expect(said).toContain("]11;rgb:1a1a/1b1b/2626");
    expect(said).toContain("[?5u"); // the flags pushed
    expect(said).toContain("[113;5u"); // ctrl+q, Kitty's way
    t.dispose();
  });
  test("a legacy terminal leaves the Kitty question unanswered, and keys go the old way", async () => {
    const t = new HeadlessTerminal({ cols: 60, rows: 4, keyboard: "legacy" });
    const p = t.spawn(
      [
        "sh",
        "-c",
        String.raw`stty raw -echo; printf '\033[>5u'; a=$(dd bs=1 count=1 2>/dev/null | od -An -tx1); printf '%s' "$a"`,
      ],
      { cwd: "/", env: { PATH: process.env.PATH ?? "/usr/bin:/bin" } },
    );
    for (let i = 0; i < 100 && !t.output.includes("\x1b[>5u"); i++) await Bun.sleep(10);
    expect(t.kittyKeys).toBe(false);
    t.key("ctrl+q");
    await p.exited;
    for (let i = 0; i < 100 && (!t.drawn || performance.now() - t.lastOutput < 30); i++) await Bun.sleep(10);
    expect(t.screen().join("").trim()).toBe("11");
    t.dispose();
  });
});

describe("frames read whole (synchronized output)", () => {
  const env = { PATH: process.env.PATH ?? "/usr/bin:/bin" };
  /** Until the first row shows `text`, or a second goes by. */
  const shows = async (t: HeadlessTerminal, text: string) => {
    for (let i = 0; i < 100 && !t.screen()[0]!.includes(text); i++) await Bun.sleep(10);
  };

  test("a frame begun and not yet ended is said, until it ends", async () => {
    const t = new HeadlessTerminal({ cols: 40, rows: 4 });
    t.spawn(["sh", "-c", String.raw`printf '\033[?2026hhalf'; sleep 0.4; printf ' whole\033[?2026l'; sleep 2`], {
      cwd: "/",
      env,
    });
    await shows(t, "half");
    expect(t.screen()[0]).toBe("half");
    expect(t.midFrame).toBe(true);
    await shows(t, "whole");
    expect(t.midFrame).toBe(false);
    t.dispose();
  });

  test("one never ended is read as it is after a second: a program that never ends a frame stops no check", async () => {
    const t = new HeadlessTerminal({ cols: 40, rows: 4 });
    t.spawn(["sh", "-c", String.raw`printf '\033[?2026hstuck'; sleep 3`], { cwd: "/", env });
    await shows(t, "stuck");
    expect(t.midFrame).toBe(true);
    await Bun.sleep(1100);
    expect(t.midFrame).toBe(false);
    t.dispose();
  });

  test("a check's wait holds only between frames: what it waited for, with the rest of its frame", async () => {
    const s = new Session();
    try {
      s.term.spawn(["sh", "-c", String.raw`printf '\033[?2026hhalf'; sleep 0.4; printf ' whole\033[?2026l'; sleep 3`], {
        cwd: "/",
        env,
      });
      await s.until(() => s.text().includes("half"), undefined, "the frame's first half");
      expect(s.screen()[0]).toBe("half whole");
    } finally {
      s.cleanup();
    }
  });

  test("the quiet after a key isn't a pause in the middle of a frame", async () => {
    const s = new Session();
    try {
      const sent = performance.now();
      s.term.spawn(["sh", "-c", String.raw`printf '\033[?2026hhalf'; sleep 0.4; printf ' whole\033[?2026l'; sleep 3`], {
        cwd: "/",
        env,
      });
      await s.settle(sent);
      expect(s.screen()[0]).toBe("half whole");
    } finally {
      s.cleanup();
    }
  });
});
