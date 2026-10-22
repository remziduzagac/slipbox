import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import packageInfo from "../package.json";
import { DiagramCache, diagramKey } from "../src/core/diagram-cache.ts";
import { BATCH_DIAGRAM_POLICY, DiagramJobs, type DiagramRequest } from "../src/core/diagram-jobs.ts";
import { Database } from "../src/core/sqlite.ts";

const dirs: string[] = [];
const caches: DiagramCache[] = [];
const jobs: DiagramJobs[] = [];
const request = (source: string, width = 60): DiagramRequest => ({
  kind: "text",
  source,
  width,
  ascii: false,
  scroll: false,
});
const worker = () => new Worker(new URL("./fixtures/diagram/worker.ts", import.meta.url).href);
function file(): string {
  const dir = mkdtempSync(join(tmpdir(), "slipbox-diagram-cache-"));
  dirs.push(dir);
  return join(dir, "diagrams.db");
}
function open(path: string, bytes?: number, entries?: number): DiagramCache {
  const cache = DiagramCache.open(path, bytes, entries);
  expect(cache).not.toBeNull();
  caches.push(cache!);
  return cache!;
}
function owner(cache: DiagramCache, batch = false): DiagramJobs {
  const j = new DiagramJobs(
    () => {},
    worker,
    batch ? BATCH_DIAGRAM_POLICY : {},
    () => cache,
  );
  jobs.push(j);
  return j;
}
afterEach(() => {
  for (const j of jobs.splice(0)) j.dispose();
  for (const cache of caches.splice(0)) cache.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

test("completed text and SVG drawings are synchronous hits after reopening the disk cache", async () => {
  const path = file();
  const first = open(path);
  const screen = owner(first);
  expect(screen.get(request("saved drawing"))).toBeUndefined();
  await screen.settle();
  screen.dispose();
  first.close();
  caches.splice(caches.indexOf(first), 1);
  const reopened = open(path);
  const cold = owner(reopened, true);
  expect(cold.get(request("saved drawing"))).toEqual({ rows: ["saved drawing"] });
  expect(cold.busy()).toBe(false);
  const svg: DiagramRequest = {
    kind: "svg",
    source: "graph TD\n A --> B",
    family: "Test Font",
    colors: { bg: "#000000", fg: "#ffffff", line: "#777777", accent: "#333333", muted: "#888888" },
  };
  reopened.put(diagramKey(svg), "<svg>cached picture</svg>");
  expect(cold.get(svg)).toBe("<svg>cached picture</svg>");
});

test("cache keys include slipbox's and the renderer library's versions and every text/picture option", () => {
  const base = request("diagram");
  const keys = [base, request("changed"), request("diagram", 40), { ...base, ascii: true }, { ...base, scroll: true }];
  expect(new Set(keys.map(diagramKey)).size).toBe(keys.length);
  const version = packageInfo.dependencies["beautiful-mermaid"];
  const before = diagramKey(base);
  try {
    packageInfo.dependencies["beautiful-mermaid"] = "test-version";
    expect(diagramKey(base)).not.toBe(before);
  } finally {
    packageInfo.dependencies["beautiful-mermaid"] = version;
  }
  // An upgrade of slipbox alone draws afresh: its own handling of a drawing may have changed.
  const own = packageInfo.version;
  try {
    packageInfo.version = "0.0.0-test";
    expect(diagramKey(base)).not.toBe(before);
  } finally {
    packageInfo.version = own;
  }
  expect(diagramKey(base)).toBe(before);
  const svg: DiagramRequest = {
    kind: "svg",
    source: base.source,
    family: "Font One",
    colors: { bg: "#000000", fg: "#ffffff", line: "#777777", accent: "#333333", muted: "#888888" },
  };
  expect(diagramKey(svg)).not.toBe(diagramKey({ ...svg, family: "Font Two" }));
  for (const key of Object.keys(svg.colors) as (keyof typeof svg.colors)[]) {
    expect(diagramKey(svg)).not.toBe(diagramKey({ ...svg, colors: { ...svg.colors, [key]: "#010101" } }));
  }
});

test("persistent screen timeouts do not suppress longer batch rendering", async () => {
  const cache = open(file());
  const screen = new DiagramJobs(
    () => {},
    worker,
    { deadline: 20, timeoutRetries: 0 },
    () => cache,
  );
  jobs.push(screen);
  screen.get(request("finite"));
  await screen.settle();
  expect(screen.get(request("finite"))).toEqual({ why: "took too long to draw" });
  const another = new DiagramJobs(
    () => {},
    worker,
    { deadline: 20, timeoutRetries: 0 },
    () => cache,
  );
  jobs.push(another);
  expect(another.get(request("finite"))).toEqual({ why: "took too long to draw" });
  expect(another.busy()).toBe(false);
  const batch = owner(cache, true);
  expect(batch.get(request("finite"))).toBeUndefined();
  await batch.settle();
  expect(batch.get(request("finite"))).toEqual({ rows: ["finite"] });
});

test("disk cache bounds entry count and serialized bytes and tolerates corrupt/unavailable caches", () => {
  const path = file();
  const cache = open(path, 100, 2);
  cache.put("one", { rows: ["one"] });
  cache.put("two", { rows: ["two"] });
  cache.put("three", { rows: ["three"] });
  expect(cache.get("one")).toBeUndefined();
  expect(cache.get("three")).toEqual({ rows: ["three"] });
  cache.put("too-large", { rows: ["x".repeat(100)] });
  expect(cache.get("too-large")).toBeUndefined();
  const db = new Database(path);
  const totals = db.prepare("select count(*) as count, sum(bytes) as bytes from drawings").get() as {
    count: number;
    bytes: number;
  };
  expect(totals.count).toBeLessThanOrEqual(2);
  expect(totals.bytes).toBeLessThanOrEqual(100);
  db.prepare("insert or replace into drawings values (?, ?, ?, ?)").run("bad", "not JSON", 8, Date.now());
  expect(cache.get("bad")).toBeUndefined();
  db.prepare("update drawings set data = ? where key = ?").run('{"rows":[42]}', "bad");
  expect(cache.get("bad")).toBeUndefined();
  db.close();
  const blocked = file();
  writeFileSync(blocked, "not a database");
  expect(DiagramCache.open(blocked)).toBeNull();
});

test("transient worker startup failures are retried in a new session", async () => {
  const cache = open(file());
  const failed = new DiagramJobs(
    () => {},
    () => {
      throw new Error("temporary failure");
    },
    {},
    () => cache,
  );
  jobs.push(failed);
  failed.get(request("retry"));
  await failed.settle();
  expect(failed.get(request("retry"))).toEqual({ why: "diagram worker unavailable" });
  const next = owner(cache);
  expect(next.get(request("retry"))).toBeUndefined();
  await next.settle();
  expect(next.get(request("retry"))).toEqual({ rows: ["retry"] });
});

test("fresh processes reuse production text and SVG caches without pending work", () => {
  const cacheRoot = file().replace(/\/diagrams\.db$/, "");
  const script = `
    import { drawMermaid, mermaidSvg, loadMermaid, mermaidPending } from "./src/core/diagrams.ts";
    const source = "graph TD\\n A[AcrossProcesses] --> B[Ready]";
    const colors = {bg:"#000000",fg:"#ffffff",line:"#777777",accent:"#333333",muted:"#888888"};
    const text = drawMermaid(source, 70, false);
    const svg = mermaidSvg(source, colors, "DejaVu Sans");
    if (process.env.CACHE_TEST_WARM === "yes" && (!text || !svg || mermaidPending())) throw Error("not a warm hit");
    await loadMermaid();
    if (!drawMermaid(source, 70, false)?.rows || !mermaidSvg(source, colors, "DejaVu Sans")) throw Error("not rendered");
    console.log("ready");
  `;
  for (const warm of ["no", "yes"]) {
    const result = Bun.spawnSync([process.execPath, "--eval", script], {
      cwd: join(import.meta.dir, ".."),
      env: { ...process.env, XDG_CACHE_HOME: cacheRoot, SLIPBOX_DIAGRAM_CACHE: "on", CACHE_TEST_WARM: warm },
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(result.stderr.toString()).toBe("");
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString().trim()).toBe("ready");
  }
});
