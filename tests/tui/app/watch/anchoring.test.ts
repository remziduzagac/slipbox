import { describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeSandbox, makeVault, harness, rowText } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("external changes (5.3, 5.4) and anchoring (3.5)", () => {
  test("a clean buffer reloads silently and the cursor keeps its place", async () => {
    const h = await harness({ open: "samples/handbook/operations-handbook.md", height: 20 });
    await h.keys("]", "]", "]", "]");
    const before = rowText(h);
    const file = join(h.root, "samples", "handbook", "operations-handbook.md");
    writeFileSync(file, `# Inserted by an agent\n\n${"A new paragraph.\n\n".repeat(20)}${readFileSync(file, "utf8")}`);
    h.app.watch.applyChanges({
      changes: [{ rel: "samples/handbook/operations-handbook.md", kind: "changed", isNote: true }],
      rescan: false,
    });
    h.frame();
    expect(rowText(h)).toBe(before);
    expect(h.frame()).toContain("↻");
  });
  test("a new note turns an unresolved link resolved; deletion is surfaced", async () => {
    const h = await harness();
    const role = () =>
      h.app
        .currentLayout(h.app.view!)
        .lines.flatMap((l) => l.spans)
        .find((s) => s.text.includes("missing-note"))!.role;
    expect(role()).toBe("link_unresolved");
    writeFileSync(join(h.root, "missing-note.md"), "# now exists\n");
    h.app.watch.applyChanges({ changes: [{ rel: "missing-note.md", kind: "created", isNote: true }], rescan: false });
    expect(role()).toBe("link");
    await h.app.run("note.open missing-note.md");
    rmSync(join(h.root, "missing-note.md"));
    h.app.watch.applyChanges({ changes: [{ rel: "missing-note.md", kind: "deleted", isNote: true }], rescan: false });
    expect(h.frame()).toContain("deleted on disk");
  });
  test("the real watcher: write, temp-and-rename, create, delete", async () => {
    const root = makeVault();
    const h = await harness({
      root,
      open: "notes/beta.md",
      watch: true,
      config: (c) => ((c.watch.debounce_ms = 30), (c.watch.poll_ms = 100)),
    });
    const until = async (pred: () => boolean) => {
      const end = Date.now() + 25_000;
      while (!pred() && Date.now() < end) await new Promise((r) => setTimeout(r, 20));
    };
    try {
      writeFileSync(join(root, "notes", "beta.md"), "# Beta v2\n");
      await until(() => h.app.view!.buf.source === "# Beta v2\n");
      expect(h.app.view!.buf.source).toBe("# Beta v2\n");
      writeFileSync(join(root, "notes", ".beta.tmp"), "# Beta v3\n");
      renameSync(join(root, "notes", ".beta.tmp"), join(root, "notes", "beta.md"));
      await until(() => h.app.view!.buf.source === "# Beta v3\n");
      expect(h.app.view!.buf.source).toBe("# Beta v3\n");
      mkdirSync(join(root, "fresh"));
      writeFileSync(join(root, "fresh", "new.md"), "# New\n");
      await until(() => h.app.graph.notes.has("fresh/new.md"));
      expect(h.app.graph.notes.has("fresh/new.md")).toBe(true);
      rmSync(join(root, "notes", "beta.md"));
      await until(() => h.app.view!.buf.deleted);
      expect(h.app.view!.buf.deleted).toBe(true);
    } finally {
      h.app.quit();
    }
  });
});
