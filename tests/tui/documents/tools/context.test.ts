import { describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { makeSandbox, makeVault, harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
makeSandbox();

describe("vaults in the TUI (17.x)", () => {
  test("space s c copies the note's context for an agent: it, what it links to, what links to it — unsaved notes saved first (9.7)", async () => {
    const root = makeVault();
    writeFileSync(join(root, "ctx.md"), "# Ctx\n\nSee [beta](notes/beta.md).\n");
    writeFileSync(join(root, "back.md"), "Back to [ctx](ctx.md).\n");
    const h = await harness({ root, open: "ctx.md" });
    // An edit not saved yet: a handoff saves it (4.10), so the bundle has what's on screen.
    await h.keys(
      "shift+g",
      "shift+a",
      ...[..." and [alpha](notes/alpha.md)"].map((c) => (c === " " ? "space" : c)),
      "escape",
    );
    expect(h.app.view!.buf.dirty).toBe(true);
    await h.keys("space", "s", "c");
    expect(h.app.view!.buf.dirty).toBe(false);
    expect(readFileSync(join(root, "ctx.md"), "utf8")).toBe(
      "# Ctx\n\nSee [beta](notes/beta.md). and [alpha](notes/alpha.md)\n",
    );
    const text = h.copied.at(-1)!;
    expect(text).toStartWith("# Context: ctx.md\n");
    /** The files in a bundle, by their reference lines (a note's own headings are inside its fence). */
    const files = (t: string) => [...t.matchAll(/^`([^`:]+)(?::[\d-]+)?` — /gm)].map((m) => m[1]);
    expect(files(text)).toEqual(["ctx.md", "notes/beta.md", "notes/alpha.md", "back.md"]);
    expect(text).toContain(
      "`ctx.md:1-3` — asked for\n\n```markdown\n# Ctx\n\nSee [beta](notes/beta.md). and [alpha](notes/alpha.md)\n```",
    );
    expect(h.app.messages.at(-1)!.text).toBe(
      `copied the context of ctx.md: 4 files (2 linked, 1 linking to it), ${text.length} characters`,
    );
    // [context] says how far: no backlinks, nothing linked.
    h.app.config.context = { depth: 0, backlinks: false, limit: 25 };
    await h.keys("space", "s", "c");
    expect(files(h.copied.at(-1)!)).toEqual(["ctx.md"]);
  });

  test("space s c with an unsaved note changed on disk copies nothing and says which note, and how to resolve it", async () => {
    const root = makeVault();
    writeFileSync(join(root, "ctx.md"), "# Ctx\n");
    const h = await harness({ root, open: "ctx.md" });
    await h.keys("shift+g", "shift+a", "!", "escape");
    expect(h.app.view!.buf.dirty).toBe(true);
    writeFileSync(join(root, "ctx.md"), "# Ctx, rewritten by an agent\n");
    expect(h.app.view!.buf.changedOnDisk()).toBe(true);
    const copies = h.copied.length;
    await h.keys("space", "s", "c");
    expect(h.copied.length).toBe(copies);
    expect(h.app.messages.at(-1)).toMatchObject({
      level: "warn",
      text: "context: ctx.md changed on disk while unsaved — ␣ n c resolves it first",
    });
    expect(readFileSync(join(root, "ctx.md"), "utf8")).toBe("# Ctx, rewritten by an agent\n");
  });

  test("space s c with an unsaved note that can't be written copies nothing and blames the write, not a conflict", async () => {
    const root = makeVault();
    mkdirSync(join(root, "ro"));
    writeFileSync(join(root, "ro", "a.md"), "# A\n");
    const h = await harness({ root, open: "ro/a.md" });
    await h.keys("shift+g", "shift+a", "!", "escape");
    expect(h.app.view!.buf.dirty).toBe(true);
    chmodSync(join(root, "ro", "a.md"), 0o444);
    chmodSync(join(root, "ro"), 0o555);
    try {
      const copies = h.copied.length;
      await h.keys("space", "s", "c");
      expect(h.copied.length).toBe(copies);
      expect(h.app.messages.at(-1)).toMatchObject({
        level: "warn",
        text: "context: ro/a.md couldn't be saved — not copying",
      });
      expect(h.app.messages.some((m) => m.level === "error" && m.text.startsWith("can't write ro/a.md"))).toBe(true);
    } finally {
      chmodSync(join(root, "ro"), 0o755);
      chmodSync(join(root, "ro", "a.md"), 0o644);
    }
  });
});
