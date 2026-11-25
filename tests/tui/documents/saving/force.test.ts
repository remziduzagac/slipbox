import { describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_CONFIG } from "../../../../src/core/application/config/config.ts";
import { openGraph } from "../../../../src/core/workspace/graph/graph.ts";
import { initVault, locateVault } from "../../../../src/core/workspace/vaults/vault.ts";
import { makeSandbox, makeVault, harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
const sandbox = makeSandbox();

type Harness = Awaited<ReturnType<typeof harness>>;
const ex = (h: Harness, s: string) => h.keys(":", ...[...s].map((c) => (c === " " ? "space" : c)), "enter");

describe("review cycle 5 (TUI, behaviour no test had pinned)", () => {
  test(":e! reverts, :w! writes over a change on disk, :noh clears the highlights", async () => {
    const root = makeVault();
    const file = join(root, "e.md");
    writeFileSync(file, "one\n");
    const h = await harness({ root, open: "e.md" });
    const v = h.app.view!;
    await h.keys("space", "n", "v", "shift+a", "X", "escape");
    await ex(h, "e!");
    expect(v.buf.source).toBe("one\n");
    expect(v.buf.dirty).toBe(false);
    await h.keys("shift+a", "Y", "escape");
    writeFileSync(file, "theirs\n");
    const t = Date.now() / 1000 + 5;
    (await import("node:fs")).utimesSync(file, t, t);
    await ex(h, "w!");
    expect(readFileSync(file, "utf8")).toBe("oneY\n");
    await h.keys("/", "o", "n", "e", "enter");
    expect(v.find?.matches.length).toBeGreaterThan(0);
    await ex(h, "noh");
    expect(v.find?.matches.length ?? 0).toBe(0);
  });
});

describe("a forced save refuses a read-only tab, as a save does", () => {
  test(":w! on another vault's note kept from a peek writes nothing, said why: the file on disk as it was", async () => {
    const base = mkdtempSync(join(sandbox, "kept-"));
    const notes = join(base, "notes");
    const other = join(base, "other");
    mkdirSync(notes);
    mkdirSync(other);
    writeFileSync(join(notes, "index.md"), "# Index\n\n[design](../other/design.md)\n");
    const file = join(other, "design.md");
    writeFileSync(file, "# Design\n\nShip.\n");
    initVault(notes, "fnotes");
    initVault(other, "fother");
    openGraph(locateVault({ root: other }), DEFAULT_CONFIG, true);
    const h = await harness({ root: notes, open: "index.md" });
    await h.keys("tab", "enter", "t");
    const buf = h.app.view!.buf;
    expect(buf.abs).toBe(file);
    expect(buf.readOnly).toBe("read-only here: fother's — go into fother to edit it");
    // Changed on disk since it was kept: a write would put the tab's text over it.
    writeFileSync(file, "# Design\n\nChanged out there.\n");
    const was = statSync(file).ino;
    await ex(h, "w!");
    expect(readFileSync(file, "utf8")).toBe("# Design\n\nChanged out there.\n");
    expect(statSync(file).ino).toBe(was);
    expect(h.app.messages.at(-1)?.text).toBe(`${buf.key} not written: ${buf.readOnly}`);
  });

  test(":w! on a file you may not write writes nothing, said why: the file not replaced", async () => {
    if (process.getuid?.() === 0) return; // root may write anything: nothing is read-only
    const root = makeVault();
    const file = join(root, "locked.md");
    writeFileSync(file, "# Locked\n");
    chmodSync(file, 0o444);
    const h = await harness({ root, open: "locked.md" });
    const buf = h.app.view!.buf;
    expect(buf.readOnly).toBe("locked.md is read-only: you may not write it (no permission)");
    // Its folder takes a rename: replacing the file would succeed, were it tried.
    const was = statSync(file).ino;
    await ex(h, "w!");
    expect(statSync(file).ino).toBe(was);
    expect(readFileSync(file, "utf8")).toBe("# Locked\n");
    expect(h.app.messages.at(-1)?.text).toBe(`locked.md not written: ${buf.readOnly}`);
  });
});
