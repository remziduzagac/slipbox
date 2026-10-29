import { expect, test } from "bun:test";
import { utf8 } from "../../../../src/core/rendering/export/encoding.ts";
import { EXPORT_CHUNK } from "../../../../src/core/rendering/export/spool.ts";

test("UTF-8 encoding of empty text emits no chunk", () => {
  const chunks: Uint8Array[] = [];
  utf8("", (chunk) => chunks.push(chunk));
  expect(chunks).toEqual([]);
});

test("UTF-8 encoding preserves lone surrogates and pairs at window boundaries", () => {
  const text = `${"x".repeat(Math.floor(EXPORT_CHUNK / 3) - 1)}😀\ud800a\udc00漢`;
  const chunks: Uint8Array[] = [];
  utf8(text, (chunk) => chunks.push(Uint8Array.from(chunk)));
  expect(Buffer.concat(chunks)).toEqual(Buffer.from(new TextEncoder().encode(text)));
  expect(chunks.length).toBeGreaterThan(1);
  expect(chunks.every((chunk) => chunk.byteLength <= EXPORT_CHUNK)).toBe(true);
});

test("UTF-8 encoding propagates the sink refusal unchanged before further output", () => {
  const failure = new Error("sink refused");
  let calls = 0;
  let caught: unknown;
  try {
    utf8("x".repeat(EXPORT_CHUNK), () => {
      calls++;
      throw failure;
    });
  } catch (error) {
    caught = error;
  }
  expect(caught).toBe(failure);
  expect(calls).toBe(1);
});
