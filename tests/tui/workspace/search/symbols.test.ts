import { describe, expect, test } from "bun:test";
import { chmodSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ListOverlay } from "../../../../src/tui/app/runtime/app.ts";
import { makeSandbox, makeVault, harness, statusRow } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
const sandbox = makeSandbox();

describe("the switcher's workspace symbols (19.14)", () => {
  const until = async (ok: () => boolean, ms = 25_000) => {
    for (const t = Date.now(); !ok() && Date.now() - t < ms; ) await Bun.sleep(20);
    return ok();
  };

  test("# in a note: the vault's headings, by name; enter opens the note there", async () => {
    const root = makeVault();
    writeFileSync(join(root, "deep.md"), "# Deep\n\nintro\n\n## Zebra crossing\n\ntext\n");
    const h = await harness({ root });
    await h.keys("ctrl+p", "#", "z", "e", "b");
    const o = h.app.overlay as ListOverlay;
    expect(o.filtered.map((e) => [e.item.label, e.item.detail])).toEqual([["Zebra crossing", "deep.md:5"]]);
    await h.keys("enter");
    expect(h.app.view!.buf.rel).toBe("deep.md");
    expect(statusRow(h.frame())).toMatch(/L5:/);
    // Without #: notes and files by name, as ever.
    await h.keys("ctrl+p", "d", "e", "e", "p");
    expect((h.app.overlay as ListOverlay).filtered[0]!.item.label).toBe("deep.md");
  });

  test("# in a code file: its servers' workspace symbols, asked as typed; enter opens the file at the symbol", async () => {
    const root = makeVault();
    writeFileSync(join(root, "a.fk"), "start\nfunction alpha\nfunction beta\n  method alpine\n");
    const launcher = join(sandbox, "fake-ls-launcher-ws");
    writeFileSync(
      launcher,
      `#!/usr/bin/env node\nawait import(${JSON.stringify(join(import.meta.dir, "../../../fixtures", "fake-lsp.ts"))});\n`,
    );
    chmodSync(launcher, 0o755);
    const h = await harness({
      root,
      open: "a.fk",
      config: (c) => {
        c["language-server"] = { fake: { command: launcher, args: ["--stdio"] } };
        c.language = [{ name: "fake", "file-types": ["fk"], "language-servers": ["fake"] }];
      },
    });
    h.app.languages.startServers();
    h.frame();
    expect(await until(() => (h.frame(), h.app.languages.servers!.list()[0]?.state === "running"))).toBe(true);
    await h.keys("ctrl+p", "#", "a", "l");
    const shown = () =>
      ((h.app.overlay as ListOverlay | null)?.filtered ?? []).map((e) => [e.item.label, e.item.hint, e.item.detail]);
    expect(await until(() => shown().length === 2)).toBe(true);
    expect(shown()).toEqual([
      ["alpha", "function", "a.fk:2"],
      ["alpine", "method", "a.fk:4"],
    ]);
    await h.keys("p", "h"); // asked again as it's typed
    expect(await until(() => shown().length === 1)).toBe(true);
    expect(shown()[0]![0]).toBe("alpha");
    await h.keys("backspace", "backspace");
    expect(await until(() => shown().length === 2)).toBe(true);
    // An older query's answer, arriving after a later one's, is dropped.
    await h.keys("backspace", "backspace", "z");
    await Bun.sleep(250); // asked, answered late
    await h.keys("backspace", "a", "l");
    expect(await until(() => shown().length === 2)).toBe(true);
    await Bun.sleep(400);
    expect(shown().length).toBe(2);
    await h.keys("down", "enter");
    expect(statusRow(h.frame())).toMatch(/L4:10\b/);
    await h.app.languages.servers!.stopAll();
  });
});
