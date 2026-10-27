import { TEST_BUDGETS } from "../../../support/timeouts.ts";
import { afterEach, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { grammar } from "../../../../src/core/documents/syntax/syntax.ts";
import { stopSyntaxThread } from "../../../../src/core/documents/syntax/syntax-thread.ts";
import { locateVault } from "../../../../src/core/workspace/vaults/vault.ts";
import { harness, makeSandbox, makeVault } from "../../../tui-harness.ts";

makeSandbox();
test(
  "the syntax pass leaves the event loop available and installs only the current revision",
  async () => {
    await grammar("typescript");
    const root = makeVault();
    writeFileSync(join(root, "large.ts"), "export const initial = 1;\n");
    const h = await harness({
      root,
      open: "large.ts",
      config: (c) => {
        c.render.code = false;
      },
    });
    const buf = h.app.view!.buf;
    const source = Array.from(
      { length: 10000 },
      (_, i) => `export function item${i}(x: number) { return x + ${i}; }\n`,
    ).join("");
    buf.loadText(source);
    // The screen's turns while the pass is on the thread: a pass on this one would leave none between its start and its
    // answer. Counted, not timed, so a CI runner that stalls for seconds can't fail it (a 7.6 s gap on macOS once).
    const pending = (h.app.languages as unknown as { syntaxPending: Map<unknown, unknown> }).syntaxPending;
    let turnsWhilePending = 0;
    const heartbeat = setInterval(() => {
      if (pending.has(buf)) turnsWhilePending++;
    }, 5);
    try {
      h.app.languages.ensureSyntax(buf);
      const deadline = performance.now() + 15000;
      while (buf.syntax?.version !== buf.version && performance.now() < deadline) await Bun.sleep(5);
      expect(buf.syntax?.version).toBe(buf.version);
      expect(buf.syntax!.outline).toHaveLength(10000);
      expect(turnsWhilePending).toBeGreaterThan(0);
      buf.loadText(source + "\nexport const superseded = true;\n");
      h.app.languages.ensureSyntax(buf);
      await Bun.sleep(10);
      buf.loadText("export function latestRevision() { return 1; }\n");
      h.app.languages.ensureSyntax(buf);
      const end = performance.now() + 5000;
      while (buf.syntax?.version !== buf.version && performance.now() < end) await Bun.sleep(5);
      expect(buf.syntax?.outline.map((entry) => entry.name)).toEqual(["latestRevision"]);
    } finally {
      clearInterval(heartbeat);
      h.app.languages.stopSyntax?.();
    }
  },
  TEST_BUDGETS.syntaxUiPass,
);

const real = globalThis.Worker;
/** Each syntax thread started from now on: a stand-in that crashes, answers with an error or never answers (`kind`),
 *  or a real one; the other threads stay real. Each one started is in `made`. */
function syntaxThreads(kind: "crash" | "error" | "silent" | "real") {
  const made: { terminated: boolean; sent: number }[] = [];
  class Stand {
    onmessage: ((e: MessageEvent) => void) | null = null;
    onerror: ((e: unknown) => void) | null = null;
    terminated = false;
    sent = 0;
    constructor() {
      made.push(this);
    }
    postMessage(m: { id: number }) {
      this.sent++;
      if (kind === "silent") return; // working on it, for longer than anyone waits
      setTimeout(() => {
        if (this.terminated) return;
        if (kind === "crash") this.onerror?.({ message: "out of memory" });
        else this.onmessage?.(new MessageEvent("message", { data: { id: m.id, error: "code could not be parsed" } }));
      }, 1);
    }
    terminate() {
      this.terminated = true;
    }
  }
  stopSyntaxThread();
  (globalThis as { Worker: unknown }).Worker = function Worker(url: string | URL, opts?: WorkerOptions) {
    if (!String(url).includes("syntax-worker")) return new real(url, opts);
    if (kind !== "real") return new Stand();
    made.push({ terminated: false, sent: 0 });
    return new real(url, opts);
  };
  return made;
}
type Harness = Awaited<ReturnType<typeof harness>>;
/** The apps a test made: their passes let go of after it, none reaching the next test's threads. */
const apps: Harness[] = [];
afterEach(() => {
  for (const h of apps.splice(0)) h.app.languages.stopSyntax();
  (globalThis as { Worker: unknown }).Worker = real;
  stopSyntaxThread();
});

const codeHarness = async (text = "export function first() { return 1; }\n") => {
  const root = makeVault();
  writeFileSync(join(root, "code.ts"), text);
  const h = await harness({ root, open: "code.ts", config: (c) => (c.render.code = false) });
  apps.push(h);
  return h;
};
const unavailable = (h: Harness) =>
  h.app.messages.filter((m) => m.text.startsWith("code structure unavailable")).map((m) => m.text);
/** Drawn until the code's structure is its text's or another failure is said, at most `ms`. */
const settled = async (h: Harness, ms = 5000) => {
  const said = unavailable(h).length;
  for (const end = performance.now() + ms; performance.now() < end; ) {
    h.frame();
    const buf = h.app.view!.buf;
    if (buf.syntax?.version === buf.version || unavailable(h).length > said) return;
    await Bun.sleep(10);
  }
};
const sent = (made: { sent: number }[]) => made.reduce((n, w) => n + w.sent, 0);

test("one syntax thread for the process: apps started one after another share it, none left running beside it", async () => {
  const made = syntaxThreads("real");
  for (const name of ["one", "two", "three"]) {
    const h = await codeHarness(`export function ${name}() { return 1; }\n`);
    await settled(h);
    expect(h.app.view!.buf.syntax?.outline.map((e) => e.name)).toEqual([name]);
  }
  expect(made.length).toBe(1);
});

describe("the syntax thread failing", () => {
  test("for its own reason (a crash): why said once, and how to retry; opened again, the structure comes", async () => {
    syntaxThreads("crash");
    const h = await codeHarness();
    await settled(h);
    expect(h.app.view!.buf.syntax).toBeNull();
    expect(unavailable(h)).toEqual([
      "code structure unavailable: worker stopped unexpectedly: out of memory — open it again to retry",
    ]);
    // Drawn again: not tried again, not said again.
    for (let i = 0; i < 5; i++) {
      h.frame();
      await Bun.sleep(10);
    }
    expect(unavailable(h).length).toBe(1);
    // The thread back; the file opened again: parsed.
    syntaxThreads("real");
    h.app.open("index.md");
    h.app.open("code.ts");
    await settled(h);
    expect(h.app.view!.buf.syntax?.outline.map((e) => e.name)).toEqual(["first"]);
    expect(unavailable(h).length).toBe(1);
  });

  test("on the code itself (the thread's own answer): why said; opened again, not asked again; edited, asked", async () => {
    const made = syntaxThreads("error");
    const h = await codeHarness();
    await settled(h);
    expect(unavailable(h)).toEqual(["code structure unavailable: code could not be parsed"]);
    const asked = sent(made);
    expect(asked).toBe(1);
    h.app.open("index.md");
    h.app.open("code.ts");
    for (let i = 0; i < 5; i++) {
      h.frame();
      await Bun.sleep(10);
    }
    expect(sent(made)).toBe(asked);
    // An edit is a new text: asked again, once its typing pauses.
    h.app.view!.buf.edit(0, 0, "\n");
    for (let i = 0; i < 40 && sent(made) === asked; i++) {
      h.frame();
      await Bun.sleep(10);
    }
    expect(sent(made)).toBe(asked + 1);
  });

  test("a source over its limit: why said, and drawn without waiting for a key", async () => {
    const made = syntaxThreads("real");
    const line = "export const value = 1;\n";
    const h = await codeHarness(line.repeat(Math.ceil((4 * 1024 * 1024 + 1) / line.length)));
    let renders = 0;
    h.app.host.requestRender = () => void renders++;
    h.frame(); // its first draw, the pass after it
    for (let i = 0; i < 50 && !unavailable(h).length; i++) await Bun.sleep(5);
    expect(unavailable(h)).toEqual(["code structure unavailable: source exceeds parsing budget"]);
    expect(renders).toBeGreaterThan(0);
    expect(made.length).toBe(0); // never sent to the thread
  });
});

test("leaving the vault lets go of its code files' passes: the thread working on one stopped at once", async () => {
  const made = syntaxThreads("silent");
  const h = await codeHarness();
  for (let i = 0; i < 20 && !sent(made); i++) {
    h.frame();
    await Bun.sleep(5);
  }
  const working = made.filter((w) => w.sent > 0);
  expect(working.length).toBe(1);
  expect(h.app.vaults.switchVault(locateVault({ root: makeVault() }), null)).toBe(true);
  expect(working.map((w) => w.terminated)).toEqual([true]);
});
