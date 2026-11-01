import { afterAll, expect, setDefaultTimeout, test } from "bun:test";
import { compilePattern, findAll } from "../../../../src/core/documents/editing/replace.ts";
import { confirmRest, matchText, stopRegexJobs } from "../../../../src/core/workspace/search/regex-jobs.ts";
import { prefixWidths, stringWidth } from "../../../../src/core/foundation/text/width.ts";
import { WorkerRequests } from "../../../../src/core/foundation/workers/worker-requests.ts";
import { makeCoreSandbox } from "../../../support/core-sandbox.ts";
import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";

setDefaultTimeout(UNIT_TIMEOUT_MS);
makeCoreSandbox();
afterAll(stopRegexJobs);

test("worker matching preserves captures, smartcase, whole words, Unicode and CRLF anchors", async () => {
  const cases = [
    { text: "Cat cat CAT", query: "(cat)", whole: false },
    { text: "Cat cat CAT", query: "Cat", whole: false },
    { text: "cat scatter cat_ cat", query: "cat", whole: true },
    { text: "α😀\r\nβ😀\r\n", query: "^|$", whole: false },
    { text: "aaa\r\n", query: "a*", whole: false },
    { text: "ab b", query: "(a)?b", whole: false },
  ];
  for (const c of cases) {
    const re = compilePattern(c.query, { regex: true, whole: c.whole });
    if (typeof re === "string") throw new Error(re);
    expect((await matchText(c.text, re, { regex: true, empty: true })).matches).toEqual(
      findAll(c.text, re, 0, c.text.length, true),
    );
  }
});

test("a nonresponding matcher is interrupted; the request behind it gets a fresh worker and its own deadline", async () => {
  let stopped = 0;
  let respond = false;
  const requests = new WorkerRequests(
    () => {
      const worker = {
        onmessage: null as ((e: MessageEvent) => void) | null,
        postMessage(message: { id: number }) {
          if (respond)
            queueMicrotask(() =>
              worker.onmessage?.(
                new MessageEvent("message", { data: { id: message.id, matches: [], limited: false } }),
              ),
            );
        },
        terminate() {
          stopped++;
        },
      };
      return worker as unknown as Worker;
    },
    { deadline: 40 },
  );
  let ticks = 0;
  const timer = setInterval(() => ticks++, 5);
  try {
    const options = { regex: true, requests };
    const first = matchText("ordinary text", /text/u, options).catch((e) => e.message);
    const queued = matchText("ordinary text", /text/u, options).catch((e) => e.message);
    expect(await first).toContain("deadline");
    expect(await queued).toContain("deadline");
    expect(ticks).toBeGreaterThan(1);
    expect(stopped).toBe(2); // each one's own worker stopped at its own deadline
    respond = true;
    expect(await matchText("ordinary text", /text/u, options)).toMatchObject({ matches: [] });
  } finally {
    clearInterval(timer);
    requests.dispose();
  }
});

test("confirming all takes every remaining match, in time: no limit, and linear in the matches", async () => {
  for (const n of [4000, 12_000]) {
    const text = "cat and dog\n".repeat(n);
    const edits = await confirmRest(
      text,
      { re: /cat/gu, replacement: "cow", global: true, range: [0, text.length], pos: 0 },
      "\n",
    );
    expect(edits).toHaveLength(n);
    expect(edits.at(-1)).toEqual({ from: (n - 1) * 12, length: 3, text: "cow" });
  }
});

test("a regex has the time its input needs: a big note's every match is found and sent before its deadline", async () => {
  const deadlines: number[] = [];
  const requests = {
    request: <T>(_request: object, opts: { deadline?: number } = {}) => {
      deadlines.push(opts.deadline ?? 0);
      return Promise.resolve({ matches: [], limited: false } as T);
    },
  };
  await matchText("a short note\n", /note/gu, { regex: true, requests });
  await matchText("a line of ordinary text\n".repeat(180_000), /\w+/gu, { regex: true, requests });
  expect(deadlines[0]).toBeGreaterThan(0);
  expect(deadlines[0]).toBeLessThan(1600); // a regex that never ends still stops within 1.5 s on a short note
  expect(deadlines[1]).toBeGreaterThan(5000); // 4.3 million characters: a second more for each million
});

test("captures that outgrow their text are refused, never written; a find is cut short instead", async () => {
  // Each place's lookahead captures the rest of the line: the answer grows as the square of the line.
  const line = `${"a".repeat(20_000)}\n`;
  const re = /(?=(.*))/gu;
  expect(await matchText(line, re, { regex: true, empty: true }).catch((e: Error) => e.message)).toContain(
    "no replacement was made",
  );
  const shown = await matchText(line, re, { regex: true, empty: true, partial: true });
  expect(shown.limited).toBe(true);
  expect(shown.matches.length).toBeGreaterThan(0);
});

test("confirm all computes capture-sensitive edits before changing the buffer and respects zero-width CRLF", async () => {
  expect(
    await confirmRest("cat cat\n", { re: /(c)at/gu, replacement: "$1ow", global: true, range: [0, 8], pos: 0 }, "\n"),
  ).toEqual([
    { from: 0, length: 3, text: "cow" },
    { from: 4, length: 3, text: "cow" },
  ]);
  expect(
    await confirmRest("a\r\nb\r\n", { re: /^/gmu, replacement: "> ", global: true, range: [0, 6], pos: 0 }, "\r\n"),
  ).toEqual([
    { from: 0, length: 0, text: "> " },
    { from: 5, length: 0, text: "> " },
  ]);
});

test("match columns preserve prefix widths at ASCII, combining and emoji boundaries", () => {
  for (const text of ["one cat two cat", "á😀👨‍👩‍👧‍👦z", "字 é text"]) {
    const offsets = Array.from({ length: text.length + 1 }, (_, i) => i);
    expect(prefixWidths(text, offsets)).toEqual(offsets.map((at) => stringWidth(text.slice(0, at))));
  }
});
