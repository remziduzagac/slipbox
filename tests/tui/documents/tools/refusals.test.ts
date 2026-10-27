import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeSandbox, makeVault, harness, type Harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("review (tui): the app's floating windows, new paths, roots and repeats", () => {
  const type = async (h: Harness, text: string) => {
    for (const c of text) await h.keys(c === " " ? "space" : c);
  };
  const last = (h: Harness) => h.app.messages.at(-1)!;

  const fnSetup = async (source: string | Buffer) => {
    const root = makeVault();
    writeFileSync(join(root, "fn.md"), source);
    const h = await harness({ root, open: "fn.md", width: 140 });
    return { root, h, read: () => readFileSync(join(root, "fn.md"), "utf8") };
  };

  test("footnotes and the properties editor never bring back a note deleted on disk, nor edit one that isn't UTF-8", async () => {
    const a = await fnSetup("# N\n\nSome words.\n");
    const file = join(a.root, "fn.md");
    const buf = a.h.app.view!.buf;
    // Gone while the question is open.
    await a.h.app.run("footnote.add");
    await type(a.h, "hi");
    rmSync(file);
    a.h.app.watch.reloadBuffer(buf, true);
    expect(buf.deleted).toBe(true);
    await a.h.keys("enter");
    expect(existsSync(file)).toBe(false);
    expect(last(a.h)).toMatchObject({ level: "warn", text: "fn.md was deleted on disk — not editing" });
    // Gone before: not asked.
    await a.h.app.run("footnote.add");
    expect(a.h.app.overlay).toBeNull();
    await a.h.app.run("note.properties");
    expect(a.h.app.floating).toBeNull();
    expect(existsSync(file)).toBe(false);
    // Gone while the properties are edited: not written, and the editor closes.
    const p = await fnSetup("# N\n\nSome words.\n");
    await p.h.app.run("note.properties");
    await p.h.keys("i");
    await type(p.h, "title: T");
    rmSync(join(p.root, "fn.md"));
    p.h.app.watch.reloadBuffer(p.h.app.tab!.views[0]!.buf, true);
    await p.h.keys("escape", "escape");
    expect(p.h.app.floating).toBeNull();
    expect(existsSync(join(p.root, "fn.md"))).toBe(false);
    // Not valid UTF-8: unchanged, never dirty.
    const u = await fnSetup(
      Buffer.concat([Buffer.from("# N\n\nSome words é"), Buffer.from([0xff]), Buffer.from(".\n")]),
    );
    const ub = u.h.app.view!.buf;
    await u.h.app.run("footnote.add");
    expect(u.h.app.overlay).toBeNull();
    await u.h.app.run("note.properties");
    expect(u.h.app.floating).toBeNull();
    expect(ub.dirty).toBe(false);
  });
});
