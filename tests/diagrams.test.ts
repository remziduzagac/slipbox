import { describe, expect, test } from "bun:test";
import { glyphsFor } from "../src/core/glyphs.ts";
import { renderMarkdown } from "../src/core/layout/render.ts";
import { BATCH_DIAGRAM_POLICY, DiagramJobs, type DiagramRequest } from "../src/core/diagram-jobs.ts";
import { drawMermaid, loadMermaid, mermaidSvg, mermaidPending, withMermaidBatch } from "../src/core/diagrams.ts";
import { load, onLoaded } from "../src/core/foundation/platform/lazy.ts";

// Worker timing tests always start cold; persistent-cache behavior is covered separately.
process.env.SLIPBOX_DIAGRAM_CACHE = "off";

const ask = (source: string, width = 60): DiagramRequest => ({
  kind: "text",
  source,
  width,
  ascii: false,
  scroll: false,
});
const worker = () => new Worker(new URL("./fixtures/diagram/worker.ts", import.meta.url).href);

describe("background diagrams", () => {
  test("layout returns before rendering, signals arrival and reuses the result", async () => {
    let arrivals = 0;
    const off = onLoaded((name) => {
      if (name === "mermaid") arrivals++;
    });
    try {
      await loadMermaid();
      expect(drawMermaid("graph TD\n  A[Background] --> B[Ready]", 60, false)).toBeNull();
      await loadMermaid();
      const drawn = drawMermaid("graph TD\n  A[Background] --> B[Ready]", 60, false);
      expect(drawn).toHaveProperty("rows");
      expect(arrivals).toBeGreaterThan(0);
      expect(drawMermaid("graph TD\n  A[Background] --> B[Ready]", 60, false)).toBe(drawn);
    } finally {
      off();
    }
  });

  test("a non-yielding job times out while timers run, retries once, is remembered, and the next job succeeds", async () => {
    let ticks = 0;
    const clock = setInterval(() => ticks++, 5);
    const jobs = new DiagramJobs(() => {}, worker, { deadline: 40 });
    try {
      expect(jobs.get(ask("slow"))).toBeUndefined();
      expect(jobs.get(ask("next"))).toBeUndefined();
      await jobs.settle();
      expect(ticks).toBeGreaterThan(1);
      expect(jobs.get(ask("slow"))).toEqual({ why: "took too long to draw" });
      expect(jobs.get(ask("next"))).toEqual({ rows: ["next"] });
    } finally {
      clearInterval(clock);
    }
  });

  test("worker errors settle callers and do not poison subsequent work", async () => {
    const jobs = new DiagramJobs(() => {}, worker);
    jobs.get(ask("crash"));
    jobs.get(ask("after"));
    await jobs.settle();
    expect(jobs.get(ask("crash"))).toHaveProperty("why");
    expect(jobs.get(ask("after"))).toEqual({ rows: ["after"] });
  });

  test("requests deduplicate; source and rendering options identify separate results", async () => {
    let arrivals = 0;
    const jobs = new DiagramJobs(() => arrivals++, worker);
    jobs.get(ask("one"));
    jobs.get(ask("one"));
    jobs.get(ask("one", 30));
    jobs.get(ask("two"));
    await jobs.settle();
    expect(arrivals).toBe(3);
    expect(jobs.get(ask("one"))).toEqual({ rows: ["one"] });
    expect(jobs.get(ask("two"))).toEqual({ rows: ["two"] });
  });

  test("source, queue and cache have limits", async () => {
    const jobs = new DiagramJobs(() => {}, worker);
    expect(jobs.get(ask("x".repeat(32769)))).toHaveProperty("why");
    for (let n = 0; n < 8; n++) jobs.get(ask(`queued ${n}`));
    expect(jobs.get(ask("overflow"))).toBeUndefined();
    await jobs.settle();
    for (let n = 0; n < 40; n++) {
      jobs.get(ask(`cached ${n}`));
      await jobs.settle();
    }
    expect(jobs.get(ask("cached 39"))).toEqual({ rows: ["cached 39"] });
    expect(jobs.get(ask("cached 0"))).toEqual({ rows: ["cached 0"] });
    await jobs.settle();
  });

  test("SVG also renders outside layout and preserves its colors", async () => {
    const colors = { bg: "#101010", fg: "#e0e0e0", line: "#707070", accent: "#3080f0", muted: "#909090" };
    expect(mermaidSvg("graph TD\n A[Picture] --> B", colors, "DejaVu Sans")).toBeNull();
    await loadMermaid();
    expect(mermaidSvg("graph TD\n A[Picture] --> B", colors, "DejaVu Sans")).toContain("#e0e0e0");
  });
});

test("worker startup failure and oversized output settle as source fallbacks", async () => {
  const missing = new DiagramJobs(
    () => {},
    () => {
      throw new Error("unavailable");
    },
  );
  missing.get(ask("one"));
  await missing.settle();
  expect(missing.get(ask("one"))).toHaveProperty("why");
  const large = new DiagramJobs(() => {}, worker);
  large.get(ask("large"));
  await large.settle();
  expect(large.get(ask("large"))).toHaveProperty("why");
});

test("a worker that never becomes ready meets the startup deadline", async () => {
  let stopped = false;
  const jobs = new DiagramJobs(
    () => {},
    () =>
      ({
        terminate: () => {
          stopped = true;
        },
      }) as unknown as Worker,
    { deadline: 40, startup: 20 },
  );
  jobs.get(ask("ordinary"));
  await jobs.settle();
  expect(stopped).toBe(true);
  expect(jobs.get(ask("ordinary"))).toHaveProperty("why");
});

test("a late answer from a replaced worker cannot overwrite another request", async () => {
  type Fake = {
    onmessage: ((e: MessageEvent) => void) | null;
    onerror: ((e: Event) => void) | null;
    postMessage: (m: { id: number }) => void;
    terminate: () => void;
    id: number;
  };
  const workers: Fake[] = [];
  const factory = () => {
    const w: Fake = {
      onmessage: null,
      onerror: null,
      id: 0,
      postMessage: (m) => {
        w.id = m.id;
      },
      terminate: () => {},
    };
    workers.push(w);
    return w as unknown as Worker;
  };
  const jobs = new DiagramJobs(() => {}, factory);
  jobs.get(ask("old"));
  jobs.get(ask("new"));
  const old = workers[0]!;
  const late = old.onmessage!;
  old.onmessage!(new MessageEvent("message", { data: { ready: true } }));
  old.onerror!(new Event("error"));
  const next = workers[1]!;
  next.onmessage!(new MessageEvent("message", { data: { ready: true } }));
  late(new MessageEvent("message", { data: { id: old.id, value: { rows: ["wrong"] } } }));
  next.onmessage!(new MessageEvent("message", { data: { id: next.id, value: { rows: ["new"] } } }));
  await jobs.settle();
  expect(jobs.get(ask("old"))).toHaveProperty("why");
  expect(jobs.get(ask("new"))).toEqual({ rows: ["new"] });
});

test("temporary queue saturation admits the remaining diagrams after draining", async () => {
  const jobs = new DiagramJobs(() => {}, worker);
  const requests = Array.from({ length: 40 }, (_, n) => ask(`diagram ${n}`));
  let results = requests.map((request) => jobs.get(request));
  while (jobs.busy()) {
    await jobs.settle();
    results = requests.map((request) => jobs.get(request));
  }
  expect(results).toEqual(requests.map((request) => ({ rows: [request.source] })));
  expect(requests.map((request) => jobs.get(request))).toEqual(results);
});

test("longer noninteractive budgets are independent of remembered screen timeouts", async () => {
  let starts = 0;
  const screen = new DiagramJobs(
    () => {},
    () => {
      starts++;
      return worker();
    },
    { deadline: 20 },
  );
  screen.get(ask("finite"));
  await screen.settle();
  expect(starts).toBe(2);
  expect(screen.get(ask("finite"))).toEqual({ why: "took too long to draw" });
  await screen.settle();
  expect(starts).toBe(2);
  const batch = new DiagramJobs(() => {}, worker, { ...BATCH_DIAGRAM_POLICY, deadline: 300 });
  batch.get(ask("finite"));
  await batch.settle();
  expect(batch.get(ask("finite"))).toEqual({ rows: ["finite"] });
  screen.dispose();
  batch.dispose();
});

test("a full document cache preserves completed drawings and settles new requests as source", async () => {
  const jobs = new DiagramJobs(() => {}, worker, { ...BATCH_DIAGRAM_POLICY, cacheBudget: 80 });
  jobs.get(ask("first"));
  jobs.get(ask("second"));
  jobs.get(ask("third"));
  await jobs.settle();
  expect(jobs.get(ask("first"))).toEqual({ rows: ["first"] });
  expect(jobs.get(ask("second"))).toEqual({ rows: ["second"] });
  expect(jobs.get(ask("third"))).toEqual({ why: "document drawing cache full" });
  expect(jobs.busy()).toBe(false);
  jobs.dispose();
});

test("disposing an active batch settles queued callers and cannot restart its worker", async () => {
  let starts = 0;
  const jobs = new DiagramJobs(
    () => {},
    () => {
      starts++;
      return worker();
    },
  );
  jobs.get(ask("slow"));
  jobs.get(ask("queued"));
  const drained = jobs.settle();
  jobs.dispose();
  await drained;
  expect(jobs.busy()).toBe(false);
  expect(jobs.get(ask("later"))).toEqual({ why: "diagram renderer closed" });
  expect(starts).toBe(1);
});

test("lazy observers retain their screen context when an export loads an asset", async () => {
  const source = "graph TD\n A[ObserverContext] --> B";
  let arrivals = 0;
  const off = onLoaded((name) => {
    if (name === "diagram-observer-context") drawMermaid(source, 60, false);
    if (name === "mermaid") arrivals++;
  });
  try {
    await withMermaidBatch(async () => {
      await load("diagram-observer-context", async () => "ready");
    });
    expect(mermaidPending()).toBe(true);
    await loadMermaid();
    expect(drawMermaid(source, 60, false)).toHaveProperty("rows");
    expect(arrivals).toBeGreaterThan(0);
  } finally {
    off();
  }
});

test("noninteractive timeouts make one attempt per diagram and do not restart on repaint", async () => {
  let starts = 0;
  const jobs = new DiagramJobs(
    () => {},
    () => {
      starts++;
      return worker();
    },
    { ...BATCH_DIAGRAM_POLICY, deadline: 20 },
  );
  expect(BATCH_DIAGRAM_POLICY.deadline).toBe(5000);
  const requests = [ask("slow one"), ask("slow two"), ask("slow three")];
  for (const request of requests) jobs.get(request);
  await jobs.settle();
  expect(starts).toBe(3);
  for (const request of requests) expect(jobs.get(request)).toEqual({ why: "took too long to draw" });
  await jobs.settle();
  expect(starts).toBe(3);
  jobs.dispose();
});

test("pending Mermaid keeps its useful source and labels the block drawing until arrival", async () => {
  const source = "```mermaid\ngraph TD\n A[PendingLabel] --> B[Ready]\n```";
  const options = { width: 70, glyphs: glyphsFor("unicode"), showUrls: false };
  const text = () =>
    renderMarkdown(source, options)
      .lines.map((line) => line.spans.map((s) => s.text).join(""))
      .join("\n");
  const pending = text();
  expect(pending).toContain("mermaid — drawing…");
  expect(pending).toContain("A[PendingLabel]");
  await loadMermaid();
  const ready = text();
  expect(ready).not.toContain("drawing…");
  expect(ready).not.toContain("A[PendingLabel]");
  expect(ready).toContain("PendingLabel");
});
