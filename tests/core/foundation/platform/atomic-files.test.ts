import { expect, spyOn, test } from "bun:test";
import * as fs from "node:fs";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";

import { DEFAULT_CONFIG } from "../../../../src/core/application/config/config.ts";
import {
  atomicWrite,
  STALE_TEMP_MS,
  sweepTemps,
  tempPath,
  tempRandom,
} from "../../../../src/core/foundation/platform/fsutil.ts";
import { openGraph } from "../../../../src/core/workspace/graph/graph.ts";

import { cacheDir, stateDir } from "../../../../src/core/foundation/platform/paths.ts";

import { Redirects } from "../../../../src/core/workspace/links/redirects.ts";

import { initVault, locateVault } from "../../../../src/core/workspace/vaults/vault.ts";

import { makePeekFixture } from "../../../support/tui/peek-fixture.ts";

// File-owned peek setup retains its model sandbox and afterEach mock reset.
const { sandbox } = makePeekFixture();

let made = 0;

/** Two vaults: notes, open here, links into app; app's index made as of now, unless `index` is false. */
function twoVaults(files: Record<string, string> = {}, index = true) {
  const n = ++made;
  const base = mkdtempSync(join(sandbox, "peek-"));
  const notes = join(base, "notes");
  const app = join(base, "app");
  const all: Record<string, string> = {
    "notes/index.md": "# Index\n\n[design](../app/design.md)\n",
    "app/design.md": "# Design\n\nShip.\n",
    "app/links.md": "See [design](design.md).\n",
    ...files,
  };
  for (const [rel, text] of Object.entries(all)) {
    mkdirSync(dirname(join(base, rel)), { recursive: true });
    writeFileSync(join(base, rel), text);
  }
  initVault(notes, `pnotes${n}`);
  initVault(app, `papp${n}`);
  if (index) openGraph(locateVault({ root: app }), DEFAULT_CONFIG, true);
  return { base, notes, app, n };
}

test("two writes of a file never share a temporary file, within a millisecond or from two threads, its name no longer than it was (#10)", () => {
  const now = Date.now;
  Date.now = () => 1;
  try {
    const a = tempPath("/v/index.json");
    const b = tempPath("/v/index.json");
    expect(a).not.toBe(b);
    expect(a).toContain(`-${process.pid}-0-`);
  } finally {
    Date.now = now;
  }
  // As long at most as the process and the millisecond made it: a note named near the 255-byte limit still saves.
  const name = "n".repeat(200);
  expect(basename(tempPath(`/v/${name}.md`)).length).toBeLessThanOrEqual(
    `.${name}.md.slipbox-${process.pid}-${Date.now()}.tmp`.length,
  );
});

test("a write never goes through what's already at its temporary file's name: another name taken", () => {
  const dir = mkdtempSync(join(sandbox, "tmp-"));
  const victim = join(dir, "victim.txt");
  writeFileSync(victim, "as it was\n");
  const target = join(dir, "note.md");
  const names = ["aaaaaaaa", "bbbbbbbb"];
  const random = tempRandom.next;
  tempRandom.next = () => names.shift() ?? "cccccccc";
  try {
    // Something already at the name the first write would take.
    symlinkSync(victim, join(dir, `.note.md.slipbox-${process.pid}-0-aaaaaaaa.tmp`));
    atomicWrite(target, "the note\n");
  } finally {
    tempRandom.next = random;
  }
  expect(readFileSync(target, "utf8")).toBe("the note\n");
  expect(readFileSync(victim, "utf8")).toBe("as it was\n");
});

test("a write that fails leaves no temporary file behind (a full disk)", () => {
  const dir = mkdtempSync(join(sandbox, "fail-"));
  // What can't be written: the write throws, as on a full disk.
  expect(() => atomicWrite(join(dir, "note.md"), {} as unknown as Uint8Array)).toThrow();
  expect(readdirSync(dir).filter((n) => n.endsWith(".tmp"))).toEqual([]);
});

test("a temporary file left beside a vault's index or its redirects is swept at their next write (#10)", () => {
  const { app } = twoVaults();
  const loc = locateVault({ root: app });
  const hour = new Date(Date.now() - 2 * STALE_TEMP_MS);
  const stale = (dir: string, name: string) => {
    mkdirSync(dir, { recursive: true });
    const f = join(dir, `.${name}.slipbox-1-7-deadbeef.tmp`);
    writeFileSync(f, "{");
    utimesSync(f, hour, hour);
    return f;
  };
  const index = stale(cacheDir(loc), "index.json");
  const redirects = stale(stateDir(loc), "redirects.json");
  writeFileSync(join(app, "more.md"), "# More\n");
  openGraph(loc, DEFAULT_CONFIG, true);
  expect(existsSync(index)).toBe(false);
  new Redirects(join(stateDir(loc), "redirects.json")).add([["a.md", "b.md"]]);
  expect(existsSync(redirects)).toBe(false);
});

test("a write that fails says why, and leaves no temporary file behind, even when closing it fails too (a failing disk)", () => {
  const dir = mkdtempSync(join(sandbox, "close-"));
  const real = fs.closeSync;
  const close = spyOn(fs, "closeSync").mockImplementation((fd) => {
    real(fd);
    throw Object.assign(new Error("EIO: i/o error, close"), { code: "EIO" });
  });
  const write = spyOn(fs, "writeSync").mockImplementation(() => {
    throw Object.assign(new Error("ENOSPC: no space left on device, write"), { code: "ENOSPC" });
  });
  try {
    expect(() => atomicWrite(join(dir, "note.md"), "text")).toThrow("ENOSPC");
    expect(readdirSync(dir)).toEqual([]);
    write.mockRestore();
    // Written, and its close failing: never renamed into place, nothing left behind.
    expect(() => atomicWrite(join(dir, "note.md"), "text")).toThrow("EIO");
    expect(readdirSync(dir)).toEqual([]);
  } finally {
    close.mockRestore();
    write.mockRestore();
  }
});

test("a temporary file only minutes old isn't swept: another writer's, on a share whose clock is behind (#10)", () => {
  const dir = mkdtempSync(join(sandbox, "skew-"));
  const f = join(dir, ".index.json.slipbox-1-7-deadbeef.tmp");
  writeFileSync(f, "{");
  const minutes = new Date(Date.now() - 10 * 60_000);
  utimesSync(f, minutes, minutes);
  sweepTemps(dir, "index.json");
  expect(existsSync(f)).toBe(true);
  const hours = new Date(Date.now() - 2 * STALE_TEMP_MS);
  utimesSync(f, hours, hours);
  sweepTemps(dir, "index.json");
  expect(existsSync(f)).toBe(false);
});
