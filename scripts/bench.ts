// Timings for the paths that grow with a note's size (plan 15.1): bun scripts/bench.ts [filter…]
//
// Generates big notes in a temporary vault, drives the TUI model headlessly (as tests/tui.test.ts
// does) and the CLI as a process, and prints the median of a few runs of each. Nothing outside the
// temporary directory is touched; the config, state, cache and data go there too, and no linter or
// server runs (or is installed) while it's timed.

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "slipbox-bench-"));
process.env.XDG_STATE_HOME = join(dir, "state");
process.env.XDG_CACHE_HOME = join(dir, "cache");
process.env.XDG_CONFIG_HOME = join(dir, "config");
process.env.XDG_DATA_HOME = join(dir, "data");
process.env.SLIPBOX_CLIPBOARD = "file";
delete process.env.SLIPBOX_CONFIG;

const { canonKey } = await import("../src/core/application/commands/registry.ts");
const { DEFAULT_CONFIG } = await import("../src/core/application/config/config.ts");
const { openGraph } = await import("../src/core/graph.ts");
const { locateVault } = await import("../src/core/workspace/vaults/vault.ts");
const { App } = await import("../src/tui/app.ts");
const { TextCanvas } = await import("../src/tui/canvas.ts");

const vault = join(dir, "vault");
const MAIN = join(import.meta.dir, "..", "src", "main.ts");

/** A note of `n` lines of the usual mixture: headings, prose, lists, tasks, code, tables. */
function mixed(n: number): string {
  const out: string[] = [];
  for (let i = 0; out.length < n; i++) {
    out.push(`## Section ${i}`, "");
    out.push(
      `Some prose for section ${i}, with **bold**, a [[link-${i % 50}]] and \`code\`; long enough to wrap at eighty columns once.`,
      "",
    );
    out.push(`- item ${i} one`, `- item ${i} two`, `  - nested ${i}`, `- [ ] task ${i}`, "");
    if (i % 5 === 0) out.push("```ts", `const x${i} = ${i};`, `function f${i}() { return x${i}; }`, "```", "");
    if (i % 7 === 0) out.push("| a | b | c |", "| --- | --- | --- |", `| ${i} | cell ${i} | more text ${i} |`, "");
  }
  return `${out.slice(0, n).join("\n")}\n`;
}

const notes: Record<string, string> = {
  "small.md": mixed(200),
  "k1.md": mixed(1000),
  "k20.md": mixed(20000),
  "tasks20k.md": Array.from({ length: 20000 }, (_, i) => `- [ ] task number ${i} with a little text`).join("\n") + "\n",
};
const { mkdirSync } = await import("node:fs");
mkdirSync(join(vault, ".slipbox"), { recursive: true });
for (const [name, text] of Object.entries(notes)) writeFileSync(join(vault, name), text);

const filters = process.argv.slice(2);
const want = (name: string) => !filters.length || filters.some((f) => name.includes(f));

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}

async function makeApp(open: string, width = 120, height = 40) {
  const config = structuredClone(DEFAULT_CONFIG);
  config.ui.restore_session = false;
  config.editor.autosave_ms = 0;
  config.lint.enabled = "off";
  config.lsp.enabled = false;
  const loc = locateVault({ root: vault });
  const graph = openGraph(loc, config, false, "lazy");
  const app = new App({
    loc,
    config,
    graph,
    host: { requestRender() {}, osc52: () => true, quit() {} },
    open,
    watch: false,
  });
  let w = width;
  let h = height;
  const frame = () => app.draw(new TextCanvas(w, h));
  const key = async (k: string) => {
    await app.input.handleKey(canonKey(k));
    frame();
  };
  frame();
  // A big note parses on other threads (15.1): its first frame says so; then it's drawn.
  await app.views.whenParsed();
  frame();
  return { app, key, frame, resize: (nw: number, nh: number) => ((w = nw), (h = nh), frame()) };
}

async function time(fn: () => Promise<void> | void): Promise<number> {
  const t = performance.now();
  await fn();
  return performance.now() - t;
}

const rows: [string, string][] = [];
async function bench(name: string, run: () => Promise<number[]>): Promise<void> {
  if (!want(name)) return;
  const xs = await run();
  const line = `${median(xs).toFixed(1).padStart(8)} ms   (min ${Math.min(...xs).toFixed(1)}, max ${Math.max(...xs).toFixed(1)}, n=${xs.length})`;
  rows.push([name, line]);
  console.log(`${name.padEnd(44)} ${line}`);
}

for (const note of ["k1.md", "k20.md"]) {
  await bench(`open ${note}: first frame`, async () => {
    const xs: number[] = [];
    for (let k = 0; k < 3; k++) {
      const config = structuredClone(DEFAULT_CONFIG);
      config.ui.restore_session = false;
      config.lint.enabled = "off";
      config.lsp.enabled = false;
      const loc = locateVault({ root: vault });
      const graph = openGraph(loc, config, false, "lazy");
      let app: InstanceType<typeof App> | null = null;
      xs.push(
        await time(() => {
          app = new App({
            loc,
            config,
            graph,
            host: { requestRender() {}, osc52: () => true, quit() {} },
            open: note,
            watch: false,
          });
          app.draw(new TextCanvas(120, 40));
        }),
      );
      await app!.views.whenParsed(); // not timed: the next run starts clean
    }
    return xs;
  });
  await bench(`open ${note} (parse + layout + draw)`, async () => {
    const xs: number[] = [];
    for (let k = 0; k < 3; k++) xs.push(await time(() => makeApp(note).then(() => {})));
    return xs;
  });
  await bench(`j in ${note} (read mode)`, async () => {
    const { key } = await makeApp(note);
    const xs: number[] = [];
    for (let k = 0; k < 20; k++) xs.push(await time(() => key("j")));
    return xs;
  });
  await bench(`type a key, source mode, ${note}`, async () => {
    const { key } = await makeApp(note);
    for (const k of ["space", "n", "v", "shift+g", "o"]) await key(k);
    await key("x");
    const xs: number[] = [];
    for (let k = 0; k < 20; k++) xs.push(await time(() => key("x")));
    return xs;
  });
  await bench(`type a key, source mode mid-note, ${note}`, async () => {
    const { key, app } = await makeApp(note);
    for (const k of ["space", "n", "v"]) await key(k);
    const half = Math.floor(app.view!.buf.lineStarts().length / 2);
    for (const k of [...String(half)]) await key(k);
    for (const k of ["shift+g", "o"]) await key(k);
    await key("x");
    const xs: number[] = [];
    for (let k = 0; k < 20; k++) xs.push(await time(() => key("x")));
    return xs;
  });
  await bench(`type a key, the lens, ${note}`, async () => {
    const { key } = await makeApp(note);
    for (const k of ["space", "n", "l", "shift+g", "o"]) await key(k);
    await key("x");
    const xs: number[] = [];
    for (let k = 0; k < 20; k++) xs.push(await time(() => key("x")));
    return xs;
  });
  await bench(`leave insert in the lens, ${note}`, async () => {
    const { key } = await makeApp(note);
    await key("space");
    await key("n");
    await key("l");
    const xs: number[] = [];
    for (let k = 0; k < 3; k++) {
      await key("o");
      await key("x");
      xs.push(await time(() => key("escape")));
    }
    return xs;
  });
  await bench(`resize (width change), ${note}`, async () => {
    const { resize } = await makeApp(note);
    const xs: number[] = [];
    for (let k = 0; k < 4; k++) xs.push(await time(() => resize(100 + k * 7 + 1, 40)));
    return xs;
  });
  await bench(`reload after an agent's write, ${note}`, async () => {
    const { app, frame } = await makeApp(note);
    const xs: number[] = [];
    for (let k = 0; k < 3; k++) {
      writeFileSync(join(vault, note), `${notes[note]}\nappended ${k}\n`);
      xs.push(await time(() => (app.watch.reloadBuffer(app.view!.buf), frame())));
    }
    writeFileSync(join(vault, note), notes[note]!);
    return xs;
  });
}

// The background index (15.1): a big note parses on other threads, and the main thread's share of the pass — its
// slices, and the big note's chunks put together — is timed here: the longest of a pass, three passes. The tests count
// that work rather than time it.
await bench("the background index: a big note's longest main-thread slice", async () => {
  const { app } = await makeApp("small.md");
  const g = app.graph;
  const pass = async () => {
    g.build(true, "lazy"); // every note unparsed, as at a cold start
    app.watch.indexInBackground();
    await app.watch.whenIndexed();
  };
  await pass(); // not timed: the other notes into the parse cache, so only the big note is new below
  let slices: number[] = [];
  const parseSome = g.parseSome.bind(g);
  g.parseSome = (ms, skip) => {
    const t = performance.now();
    const left = parseSome(ms, skip);
    slices.push(performance.now() - t);
    return left;
  };
  const entry = g.entry.bind(g);
  g.entry = (rel, chunks) => {
    const t = performance.now();
    const e = entry(rel, chunks);
    if (chunks) slices.push(performance.now() - t);
    return e;
  };
  const xs: number[] = [];
  for (let k = 0; k < 3; k++) {
    // Words of its own each time: no parse of it is in the parse cache.
    writeFileSync(join(vault, "bg.md"), mixed(20000).replaceAll("prose", `prose ${crypto.randomUUID()}`));
    slices = [];
    await pass();
    xs.push(Math.max(...slices));
  }
  rmSync(join(vault, "bg.md"));
  return xs;
});

const env = { ...process.env, NO_COLOR: "1" };
const cli = (args: string[]) =>
  time(() => void Bun.spawnSync(["bun", MAIN, "--root", vault, ...args], { env, stdout: "ignore", stderr: "ignore" }));
await bench("cli: task tasks20k 10000 (a toggle)", async () => {
  const xs: number[] = [];
  for (let k = 0; k < 3; k++) xs.push(await cli(["task", "tasks20k", "10000"]));
  return xs;
});
await bench("cli: task tasks20k (the list)", async () => [
  await cli(["task", "tasks20k", "--json"]),
  await cli(["task", "tasks20k", "--json"]),
]);
await bench("cli: read k20", async () => [await cli(["read", "k20"]), await cli(["read", "k20"])]);
await bench("cli: render k20 --plain", async () => [
  await cli(["render", "k20", "--plain"]),
  await cli(["render", "k20", "--plain"]),
]);
await bench("cli: find link-7 (the vault)", async () => [await cli(["find", "link-7"]), await cli(["find", "link-7"])]);
await bench("cli: backlinks k1", async () => [await cli(["backlinks", "k1"]), await cli(["backlinks", "k1"])]);

// The parse cache by content (20.11): a vault of many notes indexed once, then a second copy of it —
// a worktree, a clone — indexed with the parse cache shared, and without it. Measured, not assumed.
// Skipped whole unless a filter wants one of its cases: writing and parsing the notes takes a while.
const FIRST = "2,000 notes, the first copy: parsed, the parse cache filled";
const FROM_CACHE = "2,000 notes, a second copy: from the parse cache";
const NO_CACHE = "2,000 notes, a second copy: parsed again (no cache)";
if ([FIRST, FROM_CACHE, NO_CACHE].some(want)) {
  const { cpSync, mkdirSync } = await import("node:fs");
  const { ParseCache } = await import("../src/core/parsecache.ts");
  const { Graph } = await import("../src/core/graph.ts");
  const { rootAt } = await import("../src/core/workspace/vaults/vault.ts");
  const many = join(dir, "many");
  mkdirSync(join(many, ".slipbox"), { recursive: true });
  // Each note's own text (a shared one would be parsed once, whatever the copy).
  for (let i = 0; i < 2000; i++)
    writeFileSync(
      join(many, `n${i}.md`),
      `# Note ${i}\n\n${mixed(120).replace(/link-(\d+)/g, `n${i % 97}`)}\nThe end of note ${i}.\n`,
    );
  const build = (root: string, cache: import("../src/core/parsecache.ts").ParseCache | null) =>
    time(async () => {
      const loc = rootAt(root);
      const g = new Graph(loc, DEFAULT_CONFIG).build(false, "lazy");
      for (const rel of g.notes.keys())
        (await import("../src/core/graph.ts")).extractNote({ rel, abs: join(root, rel), size: 0, mtimeMs: 0 }, cache);
    });
  const shared = ParseCache.open(join(dir, "cache", "bench-parsed.db"))!;
  // Filled whichever case is wanted: the copies are timed against a full cache.
  const filled = await build(many, shared);
  await bench(FIRST, async () => [filled]);
  if (want(FROM_CACHE) || want(NO_CACHE)) {
    const copies: number[] = [];
    const unshared: number[] = [];
    for (let k = 0; k < 3; k++) {
      const copy = join(dir, `copy-${k}`);
      cpSync(many, copy, { recursive: true });
      if (want(FROM_CACHE)) copies.push(await build(copy, shared));
      if (want(NO_CACHE)) unshared.push(await build(copy, null));
    }
    await bench(FROM_CACHE, async () => copies);
    await bench(NO_CACHE, async () => unshared);
  }
}

rmSync(dir, { recursive: true, force: true });
