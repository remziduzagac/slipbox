import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { makeSandbox, makeVault, harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("regression: :e of a file written a moment ago", () => {
  test("opens it though the vault hasn't heard of it yet (the watcher not yet told); nothing outside the vault", async () => {
    const root = makeVault();
    const h = await harness({ root, open: "notes/alpha.md" });
    writeFileSync(join(root, "fresh.ts"), "export const x = 1;\n");
    writeFileSync(join(root, "fresh-note.md"), "# Fresh\n");
    expect(h.app.graph.filePaths()).not.toContain("fresh.ts"); // no watcher here: unknown, as in the race
    await h.app.run("note.open fresh.ts");
    expect(h.app.view!.buf.rel).toBe("fresh.ts");
    await h.app.run("note.open fresh-note.md");
    expect(h.app.view!.buf.rel).toBe("fresh-note.md");
    // Nor one the walk leaves out: it opens (D249), but it isn't the vault's.
    mkdirSync(join(root, "node_modules"), { recursive: true });
    writeFileSync(join(root, "node_modules", "dep.ts"), "");
    await h.app.run("note.open node_modules/dep.ts");
    expect(h.app.view!.buf.abs).toBe(join(root, "node_modules", "dep.ts"));
    expect(h.app.view!.buf.rel).toBeNull();
    expect(h.app.graph.filePaths()).not.toContain("node_modules/dep.ts");
    writeFileSync(join(dirname(root), "outside.ts"), "");
    await h.app.run("note.open ../outside.ts");
    expect(h.app.view!.buf.abs).toBe(join(root, "node_modules", "dep.ts"));
    expect(h.app.messages.at(-1)!.text).toBe('no note or file "../outside.ts"');
  });
});
