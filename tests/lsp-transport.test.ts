import { expect, test } from "bun:test";
import { ServerTransport } from "../src/core/documents/servers/transport.ts";
const frame = (text: string) => Buffer.from(`Content-Length: ${Buffer.byteLength(text)}\r\n\r\n${text}`);
function through(chunks: Buffer[], cap = 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new ServerTransport(cap, 128);
    const output: Buffer[] = [];
    reader.on("data", (chunk) => {
      output.push(chunk);
    });
    reader.on("error", reject);
    reader.on("end", () => resolve(Buffer.concat(output).toString()));
    for (const chunk of chunks) reader.write(chunk);
    reader.end();
  });
}
test("transport preserves split headers, UTF-8 bodies and adjacent responses", async () => {
  const messages = Buffer.concat([frame('{"text":"木"}'), frame('{"ok":true}')]);
  expect(await through(Array.from(messages, (byte) => Buffer.from([byte])))).toBe(messages.toString());
});
test("transport rejects output exceeding its configured budget before forwarding the body", async () => {
  expect(through([frame("x".repeat(100))], 20)).rejects.toThrow("message limit");
});
test("transport settles incomplete responses and limits accumulated headers", async () => {
  expect(through([Buffer.from("Content-Length: 10\r\n\r\nx")])).rejects.toThrow("incomplete");
  expect(through([Buffer.from("X".repeat(130))])).rejects.toThrow("header limit");
});
