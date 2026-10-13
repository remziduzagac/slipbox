// The terminal tests' own harness (tests/terminal/): the keys as a terminal sends them, and the headless terminal
// reading back what a program draws and answering what it asks (TT-T1).

import { describe, expect, test } from "bun:test";
import { encodeKey } from "./terminal/keys.ts";
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
