import { expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  cacheEntries,
  persistIndex,
  reuseEntries,
  stub,
} from "../../../../../src/core/workspace/graph/index/storage.ts";
import { cacheDir } from "../../../../../src/core/foundation/platform/paths.ts";
import { makeCoreSandbox } from "../../../../support/core-sandbox.ts";

makeCoreSandbox();
const file = (rel: string) => ({ rel, abs: join("/vault", rel), size: 5, mtimeMs: 10 });

test("index reuse mutates the authoritative maps, reuses good entries and reparses unreadable or changed ones", () => {
  const cached = { ...stub(file("cached.md")), flags: [] };
  const unreadable = { ...stub(file("bad.md")), flags: ["unreadable: denied"] };
  const notes = new Map([["obsolete.md", cached]]);
  const reached = new Set(["obsolete.md"]);
  const unparsed = new Map([["obsolete.md", file("obsolete.md")]]);
  const assets: string[] = [];
  const context = {
    notes,
    reached,
    filter: { isNoteName: (rel: string) => rel.endsWith(".md") },
    addAsset: (rel: string) => (assets.push(rel), true),
  };
  const files = [file("cached.md"), file("bad.md"), file("new.md")];
  expect(
    reuseEntries(
      context,
      unparsed,
      files,
      ["cached.md", "hidden.md", "image.png", "gone.md"],
      { "cached.md": cached, "bad.md": unreadable },
      (rel) => (rel === "gone.md" ? null : file(rel)),
    ),
  ).toBe(1);
  expect(context.notes).toBe(notes);
  expect(context.reached).toBe(reached);
  expect(notes.get("cached.md")).toBe(cached);
  expect([...notes.keys()]).toEqual(["cached.md", "bad.md", "new.md", "hidden.md"]);
  expect([...unparsed.keys()]).toEqual(["bad.md", "new.md", "hidden.md"]);
  expect([...reached]).toEqual(["hidden.md", "image.png"]);
  expect(assets).toEqual(["image.png"]);
});

test("persistence keeps disk underlays, omits pending/unreadable entries and preserves the cache format", () => {
  const disk = { ...stub(file("note.md")), flags: [], title: "Disk" };
  const visible = { ...disk, title: "Unsaved" };
  const entries = cacheEntries(
    new Map([
      ["note.md", visible],
      ["pending.md", disk],
      ["bad.md", { ...disk, flags: ["unreadable: denied"] }],
    ]),
    new Map([["pending.md", file("pending.md")]]),
    new Map([["note.md", { disk, text: "unsaved" }]]),
  );
  expect(entries).toEqual({ "note.md": disk });
  expect(entries["note.md"]).toBe(disk);
  const context = { loc: { key: "index-storage" }, reached: new Set(["hidden.md"]), branchNow: () => "dev" };
  expect(persistIndex(context, entries)).toBeGreaterThan(0);
  expect(JSON.parse(readFileSync(join(cacheDir(context.loc), "index.json"), "utf8"))).toEqual({
    version: 13,
    entries,
    branch: "dev",
    reached: ["hidden.md"],
  });
  const blocked = { ...context, loc: { key: "index-blocked" } };
  mkdirSync(join(cacheDir(blocked.loc), ".."), { recursive: true });
  writeFileSync(cacheDir(blocked.loc), "not a directory");
  expect(() => persistIndex(blocked, entries)).toThrow();
});
