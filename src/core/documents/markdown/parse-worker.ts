// A thread that parses chunks of a big note (plan 15.1): texts in, their nodes out as JSON — a
// string crosses between threads faster than a structured clone of the trees.

import { parseChunk } from "./parse.ts";

declare const self: Worker;

self.onmessage = (e: MessageEvent<{ id: number; chunks: { text: string; first: boolean }[] }>) => {
  const { id, chunks } = e.data;
  try {
    self.postMessage({ id, json: JSON.stringify(chunks.map((c) => parseChunk(c.text, c.first))) });
  } catch (err) {
    self.postMessage({ id, error: String(err) });
  }
};
