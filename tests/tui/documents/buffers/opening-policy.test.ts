import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_CONFIG } from "../../../../src/core/application/config/config.ts";
import { locateVault } from "../../../../src/core/workspace/vaults/vault.ts";
import { NoteBuffer } from "../../../../src/tui/documents/buffers/buffer.ts";
import { BufferOpening, type BufferOpeningContext } from "../../../../src/tui/documents/buffers/opening.ts";
import { makeCoreSandbox } from "../../../support/core-sandbox.ts";

const sandbox = makeCoreSandbox();

function fixture() {
  const root = mkdtempSync(join(sandbox, "opening-"));
  mkdirSync(join(root, ".slipbox"));
  writeFileSync(join(root, ".slipbox/config.toml"), '[vault]\nname = "opening"\n');
  writeFileSync(join(root, "one.md"), "# One\n");
  const known = new Set<string>();
  const messages: string[] = [];
  let renders = 0;
  const context: BufferOpeningContext = {
    loc: locateVault({ root }),
    config: structuredClone(DEFAULT_CONFIG),
    graph: { known: (key) => known.has(key) },
    buffers: new Map(),
    following: { blocked: () => null, lookedAt: () => null },
    scratch: { location: () => ({ path: join(root, "scratch.md") }) },
    host: { requestRender: () => renders++ },
    message: (_level, text) => messages.push(text),
    claim: (buffer) => opening.claim(buffer),
  };
  const opening = new BufferOpening(context, { vaultGraph: () => null });
  return { root, context, opening, known, messages, renders: () => renders };
}

test("buffer admission reuses path identity and claims against the live graph only after a reload", () => {
  const f = fixture();
  const buffer = f.opening.buffer("one.md")!;
  expect(f.opening.buffer(join(f.root, "one.md"))).toBe(buffer);
  expect(buffer.rel).toBeNull();
  f.known.add("one.md");
  writeFileSync(buffer.abs, "# A longer replacement\n");
  f.opening.claimKnown();
  expect(buffer.rel).toBeNull();
  expect(f.renders()).toBe(0);
  expect(buffer.load()).toBe(true);
  f.opening.claimKnown();
  expect(buffer.rel).toBe("one.md");
  expect(f.renders()).toBe(1);
  expect(f.context.buffers.size).toBe(1);
});

test("buffer admission rejects binary extensions and binary bytes without caching a buffer", () => {
  const f = fixture();
  writeFileSync(join(f.root, "image.png"), "image");
  writeFileSync(join(f.root, "code.ts"), "text\u0000binary");
  expect(f.opening.buffer("image.png")).toBeNull();
  expect(f.opening.buffer("code.ts")).toBeNull();
  expect(f.context.buffers.size).toBe(0);
  expect(f.messages).toEqual([
    "image.png is a binary file; slipbox opens text",
    "code.ts holds binary bytes; slipbox opens text",
  ]);
});

test("buffer admission refuses to claim virtual and foreign buffers", () => {
  const f = fixture();
  const buffer = f.opening.buffer("one.md")!;
  f.known.add("one.md");
  buffer.virtual = { save: () => false };
  expect(f.opening.claim(buffer)).toBe(false);
  buffer.virtual = null;
  buffer.elsewhere = { vault: "other", graph: null, rel: null };
  expect(f.opening.claim(buffer)).toBe(false);
  expect(buffer.rel).toBeNull();
  expect(f.renders()).toBe(0);
  expect(buffer).toBeInstanceOf(NoteBuffer);
});
