import { describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FRAME_SHOWN, FrameTrace, traced } from "../../../../src/tui/shell/terminal/trace.ts";
import { makeSandbox } from "../../../tui-harness.ts";

// The terminal tests' trace as slipbox writes it (trace.ts): its lines, and the marks after its frames.

const dir = makeSandbox();

/** An output that takes nothing while `full`, and is idle once the test says (`idle`); the marks it took, read. */
function output() {
  const marks: string[] = [];
  const waits: (() => void)[] = [];
  const out = {
    full: false,
    write: (bytes: Uint8Array) => {
      if (out.full) return false;
      marks.push(new TextDecoder().decode(bytes));
      return true;
    },
    idle: () => new Promise<void>((resolve) => waits.push(resolve)),
    gone: () => false,
  };
  /** The output idle again: its waits over. */
  const idle = async () => {
    out.full = false;
    for (const go of waits.splice(0)) go();
    await Bun.sleep(0);
  };
  return { out, marks, waits, idle };
}

let files = 0;
const traceOf = (o: ReturnType<typeof output>) => {
  const file = join(dir, `trace-${++files}`);
  writeFileSync(file, "");
  const t = new FrameTrace(file, o.out);
  const lines = () => readFileSync(file, "utf8").split("\n").filter(Boolean);
  const mark = (n: number) => `\x1b]${FRAME_SHOWN};${t.run};${n}\x07`;
  return { t, lines, mark };
};

describe("the frame trace", () => {
  test("a key says the frames painted before it; a frame written, the paints in it, marked after it", () => {
    const o = output();
    const { t, lines, mark } = traceOf(o);
    t.paint();
    t.frame();
    t.key();
    t.paint();
    t.paint(); // painted again before it was written: one frame, the latest paint
    t.frame();
    expect(lines()).toEqual([`frame ${t.run} 1`, `key ${t.run} 1`, `frame ${t.run} 3`]);
    expect(o.marks).toEqual([mark(1), mark(3)]);
    expect(lines().map(traced)).toEqual([
      { kind: "frame", run: t.run, n: 1 },
      { kind: "key", run: t.run, n: 1 },
      { kind: "frame", run: t.run, n: 3 },
    ]);
    expect(traced("app.escape")).toBeNull();
  });

  test("a frame written with nothing newly painted in it isn't traced or marked", () => {
    const o = output();
    const { t, lines } = traceOf(o);
    t.paint();
    t.frame();
    t.frame();
    expect(lines()).toHaveLength(1);
    expect(o.marks).toHaveLength(1);
  });

  test("the start in (SD-T10): a ready line with the frame just painted, the one a test waits to see", () => {
    const o = output();
    const { t, lines } = traceOf(o);
    t.paint();
    t.frame();
    t.paint();
    t.ready();
    t.frame();
    expect(lines().map(traced)).toEqual([
      { kind: "frame", run: t.run, n: 1 },
      { kind: "ready", run: t.run, n: 2 },
      { kind: "frame", run: t.run, n: 2 },
    ]);
  });

  test("each slipbox a run of its own: a restart in place numbers from 1 again, under another name", () => {
    const a = traceOf(output()).t;
    const b = traceOf(output()).t;
    expect(a.run).not.toBe(b.run);
  });

  test("a mark the output had no room for is written once it's idle, with its own frame's number, not a later paint's", async () => {
    const o = output();
    const { t, mark } = traceOf(o);
    t.paint();
    o.out.full = true;
    t.frame(); // frame 1 written; its mark, no room
    t.paint(); // frame 2 painted, not yet written
    expect(o.marks).toEqual([]);
    await o.idle();
    expect(o.marks).toEqual([mark(1)]);
  });

  test("one wait for room at a time, whatever frames come meanwhile: then the latest written's mark", async () => {
    const o = output();
    const { t, mark } = traceOf(o);
    o.out.full = true;
    for (let i = 0; i < 3; i++) {
      t.paint();
      t.frame();
    }
    expect(o.waits).toHaveLength(1);
    await o.idle();
    expect(o.marks).toEqual([mark(3)]);
    expect(o.waits).toHaveLength(0);
  });
});
