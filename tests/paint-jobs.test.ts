import { expect, test } from "bun:test";
import { PaintJobs, type PaintRequest } from "../src/core/paint-jobs.ts";
import { loadTypesetter, typesetter } from "../src/core/typeset.ts";

const request: PaintRequest = { kind: "math", source: "x^2", color: "#123456", inline: false };
async function eventually<T>(read: () => T | undefined | null): Promise<T> {
  const end = performance.now() + 6000;
  while (performance.now() < end) {
    const value = read();
    if (value !== undefined && value !== null) return value;
    await Bun.sleep(5);
  }
  throw new Error("background painting did not finish");
}

test("painting has deadlines, deduplicates requests and ignores replaced workers", async () => {
  const workers: Array<{ onmessage: ((event: unknown) => void) | null; sent: unknown[]; terminate: () => void }> = [];
  let changes = 0;
  const jobs = new PaintJobs(
    () => changes++,
    () => {
      const worker = {
        onmessage: null,
        sent: [] as unknown[],
        postMessage(value: unknown) {
          this.sent.push(value);
        },
        terminate() {},
        ref() {},
        unref() {},
      };
      workers.push(worker);
      return worker as unknown as Worker;
    },
    25,
  );
  try {
    expect(jobs.get(request)).toBeUndefined();
    expect(jobs.get(request)).toBeUndefined();
    workers[0]!.onmessage?.({ data: { ready: true } });
    expect(workers[0]!.sent.length).toBe(1);
    await eventually(() => changes || null);
    expect(jobs.get(request)).toBeNull();
    const next: PaintRequest = { ...request, source: "y" };
    expect(jobs.get(next)).toBeUndefined();
    workers[0]!.onmessage?.({ data: { id: 1, value: "late" } });
    workers[1]!.onmessage?.({ data: { ready: true } });
    workers[1]!.onmessage?.({ data: { id: 2, value: "fresh" } });
    expect(jobs.get(next)).toBe("fresh");
    jobs.dispose();
    expect(jobs.get(next)).toBeNull();
  } finally {
    jobs.dispose();
  }
});

test("math conversion stays asynchronous even after MathJax was previously loaded", async () => {
  await loadTypesetter();
  const t = typesetter()!;
  expect(t("x^2", "#123456")).toBeNull();
  const value = await eventually(() => t("x^2", "#123456"));
  expect(value).toContain("<svg");
  expect(value).toContain("#123456");
});

test("SVG inspection and rasterization complete outside the painting call", async () => {
  const jobs = new PaintJobs(() => {});
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"><rect width="80" height="40" fill="red"/></svg>';
  try {
    const size: PaintRequest = { kind: "size", source: svg };
    expect(jobs.get(size)).toBeUndefined();
    expect(await eventually(() => jobs.get(size))).toEqual({ width: 80, height: 40 });
    const png = await eventually(() => jobs.get({ kind: "png", source: svg, width: 80 }));
    expect(png).toBeInstanceOf(Uint8Array);
    expect(Array.from((png as Uint8Array).slice(0, 4))).toEqual([137, 80, 78, 71]);
  } finally {
    jobs.dispose();
  }
});
