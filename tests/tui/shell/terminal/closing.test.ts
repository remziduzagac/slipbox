import { describe, expect, test } from "bun:test";
import { Readable, Writable } from "node:stream";
import { makeSandbox } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

/** A terminal at the end of a link: each piece of output taken `ms` after it was sent; everything that came, kept. */
function terminal(ms: number) {
  let text = "";
  const out = new Writable({
    highWaterMark: 16384,
    write(chunk: Buffer, _encoding, done) {
      text += chunk.toString("latin1");
      setTimeout(done, ms);
    },
  });
  return { out: out as unknown as NodeJS.WriteStream, text: () => text };
}

const keys = () => new Readable({ read() {} }) as unknown as NodeJS.ReadStream & Readable;

/** A picture as slipbox sends one, Kitty's graphics: two megabytes of it. */
const picture = new TextEncoder().encode(`\x1b_Ga=t,f=100,i=1,q=2;${"A".repeat(2_000_000)}\x1b\\`);

/** What a modern terminal answers OpenTUI's questions with: Kitty's keyboard protocol, and each mode asked about known. */
const MODERN =
  "\x1b[?0u\x1b[?1004;2$y\x1b[?2004;2$y\x1b[?2026;2$y\x1b[?2027;2$y\x1b[?2031;2$y\x1b[?1016;2$y\x1b[?62;22c";

/** The escape sequences in `text`, each whole: control sequences and operating-system commands. */
const sequences = (text: string) =>
  text.match(/\x1b(?:\[[\x20-\x3f]*[\x40-\x7e]|\][^\x07\x1b]*(?:\x07|\x1b\\))/g) ?? [];

async function until(what: () => boolean): Promise<void> {
  for (const end = Date.now() + 5_000; !what(); ) {
    if (Date.now() > end) throw new Error("not in time");
    await Bun.sleep(10);
  }
}

describe("the terminal given back at quit", () => {
  test("a picture still on its way to a slow terminal when the wait runs out: the terminal is given back all the same", async () => {
    // OpenTUI's close, out of time, cancels what's left — its own teardown with it — and left the terminal on slipbox's
    // screen, the mouse reported and a picture's sequence open, swallowing the shell's output.
    const { openRenderer, RESTORE } = await import("../../../../src/tui/shell/terminal/run.ts");
    const term = terminal(100);
    const restored: string[] = [];
    const { session, renderer, closed } = await openRenderer({
      mouse: true,
      stdin: keys(),
      stdout: term.out,
      closeWaitMs: 300,
      restore: (text) => restored.push(text),
    });
    expect(session.write(picture)).toBe(true);
    renderer.destroy();
    await closed;
    expect(term.text()).not.toContain("\x1b[?1049l");
    expect(restored).toEqual([RESTORE]);
  });

  test("a picture taking seconds to reach a slow terminal: OpenTUI's own teardown follows it", async () => {
    // A 64 KB piece taken every 60 ms: two megabytes in about two seconds, longer than OpenTUI's own wait of a second.
    const { openRenderer } = await import("../../../../src/tui/shell/terminal/run.ts");
    const term = terminal(60);
    const restored: string[] = [];
    const { session, renderer, closed } = await openRenderer({
      mouse: true,
      stdin: keys(),
      stdout: term.out,
      restore: (text) => restored.push(text),
    });
    expect(session.write(picture)).toBe(true);
    const at = Date.now();
    renderer.destroy();
    await closed;
    expect(Date.now() - at).toBeGreaterThan(1_000);
    expect(restored).toEqual([]);
    const text = term.text();
    expect(text.indexOf("\x1b[?1049l")).toBeGreaterThan(text.lastIndexOf("AAAA\x1b\\"));
  });

  test("the terminal restored as OpenTUI restores it: every mode its setup turned on is turned off", async () => {
    // The restore is OpenTUI's teardown written by slipbox: an upgrade that turns on something new, or gives it back
    // otherwise, fails here until it is matched.
    const { openRenderer, RESTORE } = await import("../../../../src/tui/shell/terminal/run.ts");
    for (const answers of ["", MODERN]) {
      const term = terminal(0);
      const stdin = keys();
      const { renderer, closed } = await openRenderer({ mouse: true, stdin, stdout: term.out, restore: () => {} });
      if (answers) stdin.push(answers);
      renderer.requestRender();
      await until(
        () => term.text().includes(answers ? "\x1b[>5u" : "\x1b[>4;1m") && term.text().endsWith("\x1b[?2026l"),
      );
      await Bun.sleep(50);
      const setup = term.text();
      renderer.destroy();
      await closed;
      const teardown = term.text().slice(setup.length);
      expect(teardown).toContain("\x1b[?1049l");
      for (const s of sequences(teardown)) expect(RESTORE).toContain(s);
      // Grapheme clustering (2027) OpenTUI's own teardown leaves on, and so does the restore.
      const modes = new Set([...setup.matchAll(/\x1b\[\?([\d;]+)h/g)].flatMap((m) => m[1]!.split(";")));
      expect(modes).toContain("1049");
      for (const mode of modes) if (mode !== "2027") expect(RESTORE).toContain(`\x1b[?${mode}l`);
      if (/\x1b\[>\d+u/.test(setup)) expect(RESTORE).toContain("\x1b[<u");
      if (/\x1b\[>4;[12]m/.test(setup)) expect(RESTORE).toContain("\x1b[>4;0m");
      if (answers) expect(modes).toContain("1004");
    }
  });
});
