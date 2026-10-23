// The terminal tests' own harness (tests/terminal/): the keys as a terminal sends them, and the headless terminal
// reading back what a program draws and answering what it asks (TT-T1).

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { COMMAND_SPECS } from "../src/core/command-specs.ts";
import { EXPLORER, explorerClosed, explorerOpen, mode, modeOf, OUTLINE, opened } from "./terminal/check.ts";
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

/** Until `ok`, or ten seconds (a loaded machine's start too): said if it never comes. */
async function until(ok: () => boolean, what: string): Promise<void> {
  for (const end = Date.now() + 10_000; !ok(); await Bun.sleep(5))
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
}

describe("the headless terminal", () => {
  const env = { PATH: process.env.PATH ?? "/usr/bin:/bin" };
  /**
   * What a script prints last, its end: an OSC no terminal knows, which draws nothing. Its exit is no sign its output
   * has been read: what it printed last can still be in the pseudo-terminal, and the quiet before it, already there.
   */
  const END = "\x1b]7777;end\x07";
  const printEnd = String.raw`printf '\033]7777;end\007'`;
  /** Until everything the script printed has been read and drawn: its end read, nothing left to draw. */
  const ended = (t: HeadlessTerminal) => until(() => t.output.includes(END) && t.drawn, "the script's end");
  /** Run `script` (sh) in a terminal of `cols`×`rows` to its end; the terminal, drawn. */
  const run = async (script: string, cols = 40, rows = 6) => {
    const t = new HeadlessTerminal({ cols, rows });
    t.spawn(["sh", "-c", `${script}\n${printEnd}`], { cwd: "/", env });
    await ended(t);
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
      printf '%s' "$a" | od -An -c | tr -d ' \n'
      ${printEnd}`;
    const said = async (graphics: boolean) => {
      const t = new HeadlessTerminal({ cols: 80, rows: 4, graphics });
      t.spawn(["sh", "-c", asker], { cwd: "/", env });
      await ended(t);
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
      printf '\033[2J\033[H%s' "$a"
      ${printEnd}`;
    t.spawn(["sh", "-c", asker], { cwd: "/", env });
    await until(() => t.kittyKeys, "the Kitty keyboard flags pushed");
    t.key("ctrl+q"); // the last of the 42 bytes
    await ended(t);
    const said = t.screen().join("").replace(/\s+/g, "");
    expect(said).toContain("[?0u"); // no flags yet
    expect(said).toContain("]11;rgb:1a1a/1b1b/2626");
    expect(said).toContain("[?5u"); // the flags pushed
    expect(said).toContain("[113;5u"); // ctrl+q, Kitty's way
    t.dispose();
  });
  test("a legacy terminal leaves the Kitty question unanswered, and keys go the old way", async () => {
    const t = new HeadlessTerminal({ cols: 60, rows: 4, keyboard: "legacy" });
    t.spawn(
      [
        "sh",
        "-c",
        String.raw`stty raw -echo; printf '\033[>5u'; a=$(dd bs=1 count=1 2>/dev/null | od -An -tx1); printf '%s' "$a"
        ${printEnd}`,
      ],
      { cwd: "/", env },
    );
    // The push read: unanswered, keys still go the old way.
    await until(() => t.output.includes("\x1b[>5u") && t.drawn, "the Kitty keyboard flags pushed");
    expect(t.kittyKeys).toBe(false);
    t.key("ctrl+q");
    await ended(t);
    expect(t.screen().join("").trim()).toBe("11");
    t.dispose();
  });
});

describe("frames read whole (synchronized output)", () => {
  const env = { PATH: process.env.PATH ?? "/usr/bin:/bin" };
  /**
   * A frame in two halves, each drawn when the test sends a line: half drawn for as long as the test holds it, however
   * slow the machine. `>` first, once it listens (what's sent not echoed); the frame over it.
   */
  const halves = [
    "stty -echo",
    "printf '>'",
    "read a",
    String.raw`printf '\r\033[?2026hhalf'`,
    "read b",
    String.raw`printf ' whole\033[?2026l'`,
    "read c",
  ].join("; ");
  /** A frame waited for as long as the test holds it. */
  const HELD = Number.POSITIVE_INFINITY;

  test("a frame begun and not yet ended is said, until it ends", async () => {
    const t = new HeadlessTerminal({ cols: 40, rows: 4, frameMax: HELD });
    try {
      t.spawn(["sh", "-c", halves], { cwd: "/", env });
      await until(() => t.screen()[0] === ">", "the program to listen");
      t.write("\n");
      await until(() => t.screen()[0] === "half", "the frame's first half");
      expect(t.midFrame).toBe(true);
      t.write("\n");
      await until(() => !t.midFrame, "the frame's end");
      expect(t.screen()[0]).toBe("half whole");
    } finally {
      t.dispose();
    }
  });

  test("one never ended is read as it is after a second: a program that never ends a frame stops no check", async () => {
    let now = 5000; // the frames' clock, moved by hand
    const t = new HeadlessTerminal({ cols: 40, rows: 4, clock: () => now });
    try {
      t.spawn(["sh", "-c", String.raw`printf '\033[?2026hstuck'; read a`], { cwd: "/", env });
      await until(() => t.screen()[0] === "stuck", "the frame begun");
      expect(t.midFrame).toBe(true);
      now += 999;
      expect(t.midFrame).toBe(true);
      now += 1;
      expect(t.midFrame).toBe(false);
    } finally {
      t.dispose();
    }
  });

  test("a check's wait holds only between frames: what it waited for, with the rest of its frame", async () => {
    const s = new Session({ frameMax: HELD });
    try {
      s.term.spawn(["sh", "-c", halves], { cwd: "/", env });
      await until(() => s.screen()[0] === ">", "the program to listen");
      s.term.write("\n");
      // Waiting for the first half: over only once its frame is whole, the screen read as it ends.
      let seen: string | undefined;
      const waited = s
        .until(() => s.text().includes("half"), undefined, "the frame's first half")
        .then(() => {
          seen = s.screen()[0];
        });
      await until(() => s.screen()[0] === "half", "the frame's first half");
      await Bun.sleep(200); // the wait looks every 20 ms: it has looked, mid-frame, many times
      expect(seen).toBeUndefined();
      s.term.write("\n");
      await waited;
      expect(seen).toBe("half whole");
    } finally {
      s.cleanup();
    }
  });

  test("the quiet after a key isn't a pause in the middle of a frame", async () => {
    const s = new Session({ frameMax: HELD });
    try {
      s.term.spawn(["sh", "-c", halves], { cwd: "/", env });
      await until(() => s.screen()[0] === ">", "the program to listen");
      const sent = performance.now();
      s.term.write("\n"); // a key: its answer, a frame in two halves
      await until(() => s.screen()[0] === "half", "the answer's first half");
      // Settling (as long as it takes: its own limit isn't what's checked), the frame half drawn meanwhile.
      let seen: string | undefined;
      const settled = s.settle(sent, 60_000).then(() => {
        seen = s.screen()[0];
      });
      await Bun.sleep(200); // quiet, mid-frame, five times as long as settle's 40 ms
      expect(seen).toBeUndefined();
      s.term.write("\n");
      await settled;
      expect(seen).toBe("half whole");
    } finally {
      s.cleanup();
    }
  });
});

describe("what the checks share (check.ts)", () => {
  const env = { PATH: process.env.PATH ?? "/usr/bin:/bin" };

  test("opened waits for the file open, not for the link under the cursor that names it", async () => {
    // The status line on a link to shelf/far.md, its note still open, as while a link out of the vault is followed only
    // once its target answers (VV-D6); a line from the test, then far.md open.
    const statusLines = [
      "stty -echo",
      "printf 'READ  notes  ‹ to-shelf.md ›  ● watching  → shelf/far.md (resolved)  L3:16 all'",
      "read a",
      // Not String.raw: Bun writes a raw template's ‹ as `‹`.
      "printf '\\r\\033[2KREAD  notes  ‹ shelf/far.md ›  ● watching  L1:1 all'",
      "read b",
    ].join("; ");
    const s = new Session();
    try {
      s.term.spawn(["sh", "-c", statusLines], { cwd: "/", env });
      await until(() => s.statusLine().includes("‹ to-shelf.md ›"), "the link's note on the status line");
      let done = false;
      const waited = opened(s, "shelf/far.md").then(() => {
        done = true;
      });
      await Bun.sleep(200); // a wait looks every 20 ms: it has looked many times
      expect(done).toBe(false);
      s.term.write("\n");
      await waited;
      expect(s.statusLine()).toContain("‹ shelf/far.md ›");
    } finally {
      s.cleanup();
    }
  });

  // The explorer as `space e` cycles it (panels.ts: opened and focused, focused, closed), on a screen behind its own
  // trace: a key is in the trace at once with a frame after it, but what it did is drawn LAG ms later, as a loaded
  // runner's slipbox paints before its terminal has caught up. Meanwhile the which-key popup drawn after `space` stays,
  // its line for `space e` the command's title, as slipbox's is (#18). Its frames are marked as slipbox's are
  // (synchronized output), so a wait reads each whole.
  const LAG = 400;
  const LABEL = COMMAND_SPECS.find((c) => c.id === "explorer.cycle")!.title;
  const cycling = [
    "stty -echo -icanon min 1 time 0",
    "pending=0",
    "draw() {",
    "  printf '\\033[?2026h\\033[2J\\033[H'",
    "  if [ $shown = 1 ]; then printf ' ≡  Explorer   +  +  │ home.md'; else printf '    home.md'; fi",
    "  if [ $pending = 1 ]; then printf '\\033[4;1H  │ e   → %s  │' \"$LABEL\"; chip='␣'",
    "  elif [ $focused = 1 ]; then chip=FILES; else chip=READ; fi",
    // No status line in zen: the frame's end alone.
    "  if [ $zen = 1 ]; then printf '\\033[?2026l'",
    "  else printf '\\033[8;1H %s  notes  ‹ home.md ›  L1:1\\033[?2026l' \"$chip\"; fi",
    "}",
    "draw",
    'while c=$(dd bs=1 count=1 2>/dev/null) && [ -n "$c" ]; do',
    "  if [ \"$c\" = ' ' ]; then pending=1; draw; printf 'key\\nframe\\n' >> \"$T\"",
    '  elif [ "$c" = e ] && [ $pending = 1 ]; then',
    '    pending=0; printf e >> "$PRESSED"',
    "    if [ $shown = 1 ] && [ $focused = 0 ]; then focused=1",
    "    elif [ $shown = 1 ]; then shown=0; focused=0",
    "    else shown=1; focused=1; fi",
    "    printf 'key\\nframe\\n' >> \"$T\"; sleep $LAG; draw",
    "  fi",
    "done",
  ].join("\n");
  const STARTS = { closed: [0, 0], open: [1, 0], focused: [1, 1] } as const;
  /** The fake explorer, started `closed`, `open` or `focused`, in zen or not; `presses()`, the `space e`s it took. */
  const explorer = async (start: keyof typeof STARTS, zen = false) => {
    const s = new Session({ size: { cols: 60, rows: 10 } });
    const pressed = join(s.dir, "pressed");
    const [shown, focused] = STARTS[start];
    try {
      s.term.spawn(["sh", "-c", cycling], {
        cwd: "/",
        env: {
          ...env,
          T: s.trace,
          PRESSED: pressed,
          LABEL,
          LAG: String(LAG / 1000),
          shown: `${shown}`,
          focused: `${focused}`,
          zen: zen ? "1" : "0",
        },
      });
      // Its first frame, read whole (its frames are marked).
      await s.until(() => s.rowOf("home.md") >= 0, undefined, "the fake explorer's first frame");
    } catch (err) {
      s.cleanup(); // the test's own cleanup is in the try it never reaches
      throw err;
    }
    const presses = () => (existsSync(pressed) ? readFileSync(pressed, "utf8") : "").length;
    return { s, presses };
  };

  test("the status line's mode is its chip when it names one, never the keys pending or an operator's", () => {
    for (const m of ["READ", "SOURCE", "INSERT", "V-LINE", "FILES", "GIT", "OUTLINE"])
      expect(modeOf(` ${m}  notes  ‹ home.md ›  L1:1`)).toBe(m);
    expect(modeOf(" FILES")).toBe("FILES"); // the chip alone, nothing drawn after it
    // The leader pending (Unicode's ␣, ASCII's SPC), F waiting for its character, an operator, a prompt, a file name.
    for (const line of [
      " ␣  notes  L1:1",
      " SPC  notes  L1:1",
      " F  notes  L1:1",
      " dT  notes  L1:1",
      ":write",
      "FILES.md",
    ])
      expect(modeOf(line)).toBeNull();
  });

  test("the panels' own titles, never the which-key popup's lines that name them", () => {
    // The popup's line for each key, its border Unicode's or ASCII's.
    for (const border of ["│", "|"]) {
      const popup = (id: string) => `  ${border} e   → ${COMMAND_SPECS.find((c) => c.id === id)!.title}  ${border}`;
      expect(EXPLORER.test(popup("explorer.cycle"))).toBe(false);
      expect(OUTLINE.test(popup("outline.cycle"))).toBe(false);
    }
    // As slipbox draws them: the explorer's buttons before its border (the Nerd Font's, ASCII's, none in a narrow
    // pane); the outline after the right panel's border, the right rail beside it, or blank to the edge, or nothing
    // drawn after it.
    expect(EXPLORER.test(" ≡  Explorer               󰝒  󰉗  │ 1 operations-handbook.md × │")).toBe(true);
    expect(EXPLORER.test(" =  Explorer               +  +>  | 1 operations-handbook.md x |")).toBe(true);
    expect(EXPLORER.test(" ≡  Explorer   │ 1 operations-handbook.md × │")).toBe(true);
    // A tab, or a note's line, that says "Explorer" in passing (the explorer closed); a note's line starting "Outline".
    expect(EXPLORER.test(" ≡  │ 1 Explorer guide.md × │ 2 home.md × │")).toBe(false);
    expect(EXPLORER.test(" ≡  │   12  the Explorer lists every note │ Outline")).toBe(false);
    expect(OUTLINE.test(" ≡  │ Outline of the plan, in brief")).toBe(false);
    expect(OUTLINE.test(" ±  󰉋 equipment     ● │ § Halden Ridge Observatory    │ Outline           󰋽")).toBe(true);
    expect(OUTLINE.test(" ±  󰉋 equipment     ● │ § Halden Ridge Observatory    │ Outline")).toBe(true);
    expect(OUTLINE.test(" +  equipment     * | § Halden Ridge Observatory    | Outline")).toBe(true);
  });

  test.each([
    ["closed", 1],
    ["open", 1],
    ["focused", 0],
  ] as const)("explorerOpen from %s presses space e %d times, never again on the which-key popup", async (start, n) => {
    const { s, presses } = await explorer(start);
    try {
      await explorerOpen(s);
      await Bun.sleep(LAG + 200); // a press too many, drawn by now
      expect(presses()).toBe(n);
      expect(mode(s)).toBe("FILES");
      expect(s.rowOf(EXPLORER)).toBeGreaterThanOrEqual(0);
    } finally {
      s.cleanup();
    }
  });

  test.each([
    ["open", 2],
    ["focused", 1],
    ["closed", 0],
  ] as const)(
    "explorerClosed from %s presses space e %d times, never again on the which-key popup",
    async (start, n) => {
      const { s, presses } = await explorer(start);
      try {
        await explorerClosed(s);
        await Bun.sleep(LAG + 200);
        expect(presses()).toBe(n);
        expect(mode(s)).toBe("READ");
        expect(s.rowOf(/Explorer/)).toBe(-1);
      } finally {
        s.cleanup();
      }
    },
  );

  test("explorerClosed with no status line (zen) leaves a closed explorer as it is", async () => {
    const { s, presses } = await explorer("closed", true);
    try {
      await explorerClosed(s);
      await Bun.sleep(LAG + 200);
      expect(presses()).toBe(0);
      expect(s.rowOf(/Explorer/)).toBe(-1);
    } finally {
      s.cleanup();
    }
  });
});
