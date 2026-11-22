import { describe, expect, test } from "bun:test";
import { closeSync, constants, openSync, readSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Readable, Writable } from "node:stream";
import { makeSandbox } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
const sandbox = makeSandbox();

/** A terminal at the end of a link: each piece of output taken `ms` after it was sent; everything that came, kept.
 *  `say`: what slipbox writes to it straight, as it gives the terminal back. */
function terminal(ms: number) {
  let text = "";
  const out = new Writable({
    highWaterMark: 16384,
    write(chunk: Buffer, _encoding, done) {
      text += chunk.toString("latin1");
      setTimeout(done, ms);
    },
  });
  return { out: out as unknown as NodeJS.WriteStream, text: () => text, say: (t: string) => (text += t) };
}

/** A terminal that takes what it's sent until `stall()`, then nothing more: the piece it was given then, not taken. */
function stalling() {
  let text = "";
  let stalled = false;
  const out = new Writable({
    highWaterMark: 16384,
    write(chunk: Buffer, _encoding, done) {
      text += chunk.toString("latin1");
      if (!stalled) done();
    },
  });
  return { out: out as unknown as NodeJS.WriteStream, text: () => text, stall: () => (stalled = true) };
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

/** A modern terminal's answers (`MODERN`), saying grapheme clustering was on (1) or off (2) before slipbox started. */
const clustering = (on: boolean) => MODERN.replace("\x1b[?2027;2$y", `\x1b[?2027;${on ? 1 : 2}$y`);

describe("the terminal given back at quit", () => {
  test("a picture still on its way to a slow terminal when the wait runs out: a string terminator, then the rest", async () => {
    // Out of time, OpenTUI drops what's still queued and writes its teardown, saying it was late — with no string
    // terminator first, so the picture cut short can take it in. slipbox ends the picture and gives the terminal back
    // again, but for the keyboard protocol's pop: a second would pop that of whatever ran slipbox.
    const { openRenderer } = await import("../../../../src/tui/shell/terminal/run.ts");
    const term = terminal(30);
    const restored: string[] = [];
    const { session, closed, quit } = await openRenderer({
      mouse: true,
      stdin: keys(),
      stdout: term.out,
      closeWaitMs: 400,
      restore: (text) => {
        restored.push(text);
        term.say(text);
      },
    });
    expect(session.write(picture)).toBe(true);
    quit();
    await closed;
    const text = term.text();
    expect(text.length).toBeLessThan(picture.length);
    expect(text.indexOf("\x1b[?1049l")).toBeGreaterThan(text.lastIndexOf("AAAA"));
    expect(restored).toHaveLength(1);
    const ours = text.lastIndexOf(restored[0]!);
    expect(ours).toBeGreaterThan(text.lastIndexOf("AAAA"));
    expect(text.slice(ours)).toStartWith("\x1b\\");
    expect(text.split("\x1b[<u").length - 1).toBeLessThanOrEqual(1);
    expect(restored[0]).not.toContain("\x1b[<u");
  });

  test("a terminal whose writer never finishes: given back by slipbox once the quit's bound has passed", async () => {
    // Writing to the process's own terminal, OpenTUI's close can wait for ever on a write the terminal never takes.
    // Here OpenTUI would give up after two seconds; the bound, a third of one, comes first.
    const { openRenderer } = await import("../../../../src/tui/shell/terminal/run.ts");
    const term = stalling();
    const restored: string[] = [];
    const { session, renderer, closed, quit } = await openRenderer({
      mouse: true,
      stdin: keys(),
      stdout: term.out,
      quitBoundMs: 300,
      restore: (text) => restored.push(text),
    });
    expect(session.write(picture)).toBe(true);
    term.stall();
    const at = Date.now();
    quit();
    await closed;
    expect(Date.now() - at).toBeGreaterThanOrEqual(290);
    expect(Date.now() - at).toBeLessThan(1_500);
    // All of it: OpenTUI's close stopped, its teardown dropped with what was queued, the keyboard protocol's pop too.
    expect(restored).toHaveLength(1);
    expect(restored[0]).toStartWith("\x1b\\");
    expect(restored[0]).toContain("\x1b[?1049l");
    expect(restored[0]!.split("\x1b[<u")).toHaveLength(2);
    expect(term.text()).not.toContain("\x1b[<u");
    // OpenTUI's close, stopped, gives nothing back a second time.
    await renderer.closed.catch(() => {});
    await Bun.sleep(50);
    expect(restored).toHaveLength(1);
  });

  test("the terminal given back before slipbox quits: no bound armed, nothing stopped", async () => {
    // OpenTUI destroys the renderer itself when the terminal fails or hangs up, and gives it back. slipbox's quit after
    // that arms nothing: it would stop a session that's over. Destroyed here as OpenTUI would destroy it.
    const { openRenderer } = await import("../../../../src/tui/shell/terminal/run.ts");
    const term = terminal(0);
    const restored: string[] = [];
    const { session, renderer, closed, quit } = await openRenderer({
      mouse: true,
      stdin: keys(),
      stdout: term.out,
      quitBoundMs: 100,
      restore: (text) => restored.push(text),
    });
    let stopped = 0;
    const dispose = session.dispose.bind(session);
    session.dispose = () => {
      stopped++;
      dispose();
    };
    renderer.destroy();
    await closed;
    expect(term.text()).toContain("\x1b[?1049l");
    quit();
    await Bun.sleep(300);
    expect(stopped).toBe(0);
    expect(restored).toEqual([]);
  });

  test("a destroy OpenTUI puts off while a renderable's cleanup runs: the quit ended by its bound all the same", async () => {
    // OpenTUI defers its destroy, its `destroy` event and `renderer.closed` until that cleanup is done; its session
    // closes meanwhile, its teardown out. Deferred here as such a cleanup would defer it.
    const { openRenderer } = await import("../../../../src/tui/shell/terminal/run.ts");
    const term = terminal(0);
    const restored: string[] = [];
    // The console as it is before OpenTUI takes it over, and gives it back as its destroy ends.
    const shown = console;
    const { renderer, closed, quit } = await openRenderer({
      mouse: true,
      stdin: keys(),
      stdout: term.out,
      quitBoundMs: 300,
      restore: (text) => restored.push(text),
    });
    const root = renderer.root as unknown as { _cleanupInProgress: boolean; _deferredCleanup?: (() => void)[] };
    root._cleanupInProgress = true;
    let destroyed = false;
    renderer.once("destroy", () => {
      destroyed = true;
    });
    const at = Date.now();
    quit();
    expect(await Promise.race([closed.then(() => true), Bun.sleep(3_000).then(() => false)])).toBe(true);
    expect(Date.now() - at).toBeLessThan(1_500);
    expect(destroyed).toBe(false);
    // Its teardown out already: nothing written a second time, the keyboard protocol's pop least of all.
    expect(term.text()).toContain("\x1b[?1049l");
    expect(restored).toEqual([]);
    // The cleanup done, OpenTUI's destroy goes on: its scene, the session over, says so — kept off the console.
    root._cleanupInProgress = false;
    const error = shown.error;
    shown.error = () => {};
    try {
      for (const resume of root._deferredCleanup?.splice(0) ?? []) resume();
    } finally {
      shown.error = error;
    }
    await renderer.closed;
    expect(destroyed).toBe(true);
  });

  test("grapheme clustering given back as the terminal had it: off where it was off, left on where it was on", async () => {
    // OpenTUI asks the terminal at setup (DECRPM 2027), turns clustering on, and its teardown turns it off only where
    // the terminal said it was off; so does slipbox's.
    const { clusteringOff, openRenderer } = await import("../../../../src/tui/shell/terminal/run.ts");
    // Each answer as OpenTUI 0.9.0's teardown takes it: none, set, reset, set or reset for good, not known.
    const answers = [null, 1, 2, 3, 4, 0] as const;
    const counting = (b: number | null) => (b === 0 || b === 4 ? "wcwidth" : "unicode");
    expect(answers.map((b) => clusteringOff(b, counting(b)))).toEqual([true, false, true, false, false, false]);
    for (const on of [false, true]) {
      const term = stalling();
      const stdin = keys();
      const restored: string[] = [];
      const { renderer, closed, quit } = await openRenderer({
        mouse: true,
        stdin,
        stdout: term.out,
        quitBoundMs: 300,
        restore: (text) => restored.push(text),
      });
      stdin.push(clustering(on));
      renderer.requestRender();
      await until(() => term.text().includes("\x1b[>5u") && term.text().endsWith("\x1b[?2026l"));
      expect(term.text()).toContain("\x1b[?2027h");
      // A later answer, the mode as OpenTUI left it, says nothing of how the terminal had it.
      stdin.push(`\x1b[?2027;${on ? 2 : 1}$y`);
      await Bun.sleep(50);
      term.stall();
      quit();
      await closed;
      expect(restored).toHaveLength(1);
      expect({ on, off: restored[0]!.includes("\x1b[?2027l") }).toEqual({ on, off: !on });
      await renderer.closed.catch(() => {});
    }
  });

  test("written to the terminal opened again, never blocking: one that takes nothing is left within seconds", async () => {
    // The process's own descriptor blocks: a terminal that stopped reading would hold the quit for as long. A pipe that
    // nobody reads stands for it, its buffer filled.
    const { toTerminal } = await import("../../../../src/tui/shell/terminal/run.ts");
    const pipe = join(sandbox, "terminal");
    expect(Bun.spawnSync(["mkfifo", pipe]).exitCode).toBe(0);
    const reader = openSync(pipe, constants.O_RDONLY | constants.O_NONBLOCK);
    try {
      const at = Date.now();
      toTerminal("x".repeat(1_000_000), pipe);
      expect(Date.now() - at).toBeLessThan(3_000);
      const got = Buffer.alloc(16);
      expect(readSync(reader, got)).toBeGreaterThan(0);
    } finally {
      closeSync(reader);
    }
  });

  test("stdout not a terminal: written to it as it is, where its own writes stop, never elsewhere", async () => {
    // A file open for writing at its start, longer than what's written: opened again, it would be written over at its
    // start, or added to at its end.
    const out = join(sandbox, "stdout.txt");
    writeFileSync(out, "X".repeat(20));
    const run = join(import.meta.dir, "../../../../src/tui/shell/terminal/run.ts");
    const script = `import { writeSync } from "node:fs"; import { toTerminal } from ${JSON.stringify(run)};
      writeSync(1, "0123456789\\n"); toTerminal("ab");`;
    const r = Bun.spawnSync(["sh", "-c", `"$0" -e "$1" 1<> "$2"`, process.execPath, script, out]);
    expect(r.exitCode).toBe(0);
    expect(await Bun.file(out).text()).toBe(`0123456789\nab${"X".repeat(7)}`);
  });

  test("a terminal that takes nothing more at quit: given back by slipbox, within seconds", async () => {
    // OpenTUI waits a second for it to take something, drops the rest, waits a second more for its teardown to go out,
    // then gives up, the terminal not restored: slipbox writes the teardown itself.
    const { openRenderer, RESTORE } = await import("../../../../src/tui/shell/terminal/run.ts");
    const term = stalling();
    const restored: string[] = [];
    const { session, closed, quit } = await openRenderer({
      mouse: true,
      stdin: keys(),
      stdout: term.out,
      restore: (text) => restored.push(text),
    });
    expect(session.write(picture)).toBe(true);
    term.stall();
    const at = Date.now();
    quit();
    await closed;
    expect(Date.now() - at).toBeLessThan(5_000);
    expect(term.text()).not.toContain("\x1b[?1049l");
    expect(restored).toEqual([RESTORE]);
  });

  test("a picture taking seconds to reach a slow terminal, within the wait: OpenTUI's own teardown follows it", async () => {
    // A 64 KB piece taken every 60 ms: two megabytes in about two seconds, the picture whole, then the teardown.
    const { openRenderer } = await import("../../../../src/tui/shell/terminal/run.ts");
    const term = terminal(60);
    const restored: string[] = [];
    const { session, closed, quit } = await openRenderer({
      mouse: true,
      stdin: keys(),
      stdout: term.out,
      // A wait of its own: OpenTUI counts its close wait from the close here, a stream standing in for the terminal,
      // and from each write only on a real one, where its one-second default sees such a picture through.
      closeWaitMs: 5_000,
      restore: (text) => restored.push(text),
    });
    expect(session.write(picture)).toBe(true);
    const at = Date.now();
    quit();
    await closed;
    expect(Date.now() - at).toBeGreaterThan(1_000);
    expect(restored).toEqual([]);
    const text = term.text();
    expect(text).toContain("AAAA\x1b\\");
    expect(text.indexOf("\x1b[?1049l")).toBeGreaterThan(text.lastIndexOf("AAAA\x1b\\"));
  });

  test("the terminal restored as OpenTUI restores it: every mode its setup turned on is turned off", async () => {
    // The restore is OpenTUI's teardown written by slipbox: an upgrade that turns on something new, or gives it back
    // otherwise, fails here until it is matched.
    const { openRenderer, RESTORE } = await import("../../../../src/tui/shell/terminal/run.ts");
    for (const answers of ["", MODERN]) {
      const term = terminal(0);
      const stdin = keys();
      const { renderer, closed, quit } = await openRenderer({
        mouse: true,
        stdin,
        stdout: term.out,
        restore: () => {},
      });
      if (answers) stdin.push(answers);
      renderer.requestRender();
      await until(
        () => term.text().includes(answers ? "\x1b[>5u" : "\x1b[>4;1m") && term.text().endsWith("\x1b[?2026l"),
      );
      await Bun.sleep(50);
      const setup = term.text();
      quit();
      await closed;
      const teardown = term.text().slice(setup.length);
      expect(teardown).toContain("\x1b[?1049l");
      for (const s of sequences(teardown)) expect(RESTORE).toContain(s);
      const modes = new Set([...setup.matchAll(/\x1b\[\?([\d;]+)h/g)].flatMap((m) => m[1]!.split(";")));
      expect(modes).toContain("1049");
      for (const mode of modes) expect(RESTORE).toContain(`\x1b[?${mode}l`);
      if (/\x1b\[>\d+u/.test(setup)) expect(RESTORE).toContain("\x1b[<u");
      if (/\x1b\[>4;[12]m/.test(setup)) expect(RESTORE).toContain("\x1b[>4;0m");
      if (answers) expect(modes).toContain("1004");
    }
  });
});
