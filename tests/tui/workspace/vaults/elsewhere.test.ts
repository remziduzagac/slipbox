import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tildePath } from "../../../../src/core/foundation/platform/paths.ts";
import { makeSandbox, makeVault, harness, statusRow, topRow, whereNow } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
const sandbox = makeSandbox();

describe("Elsewhere: no-vault (VV-D3)", () => {
  /** A folder outside home and every vault: a note linking to another, and a folder beside it. */
  const nowhere = () => {
    const dir = realpathSync(mkdtempSync(join(sandbox, "elsewhere-")));
    writeFileSync(join(dir, "a.md"), "# A\n\n[b](b.md)\n");
    writeFileSync(join(dir, "b.md"), "# B\n\nBee.\n");
    mkdirSync(join(dir, "deep"));
    writeFileSync(join(dir, "deep", "c.md"), "# C\n");
    return dir;
  };

  test("opened there: Elsewhere on the top bar, its files by their whole paths, and what needs an index said missing", async () => {
    const { elsewhereAt } = await import("../../../../src/core/workspace/vaults/vault.ts");
    const dir = nowhere();
    writeFileSync(join(dir, "broken.md"), "[gone](gone.md)\n"); // a link that reaches nothing: never counted here
    const h = await harness({ loc: elsewhereAt(dir, join(dir, "b.md")), open: join(dir, "b.md") });
    expect(h.app.view!.buf.key).toBe(join(dir, "b.md"));
    expect(h.app.view!.buf.readOnly).toBeNull();
    expect(whereNow(h)).toBe("Elsewhere");
    expect(topRow(h.frame())).toContain("Elsewhere");
    expect(statusRow(h.frame())).toMatch(/b\.md/);
    expect(statusRow(h.frame())).not.toContain("Elsewhere"); // said once (WSP-D5)
    // No index: backlinks and search say so, never an empty list.
    await h.app.run("backlinks.open");
    expect(h.app.overlay).toBeNull();
    expect(h.app.messages.at(-1)!.text).toBe(
      "no backlinks in Elsewhere: it has no index — a note in a vault or home has them",
    );
    await h.app.run("search.open");
    expect(h.app.overlay).toBeNull();
    expect(h.app.messages.at(-1)!.text).toContain("Elsewhere has no index to search");
    expect(h.app.info.rows().find((r) => r.key === "backlinks")?.value).toBe("none in Elsewhere: it has no index");
    expect(h.app.info.rows().find((r) => r.key === "vault")?.value).toBe(
      "Elsewhere — outside home and every vault: no index",
    );
    // Its notes listed a folder at a time: the explorer by whole paths, nothing walked.
    expect(h.app.graph.dirs).toEqual([""]);
    expect(h.app.explorer.rows().map((r) => r.path)).toEqual(
      ["deep", "a.md", "b.md", "broken.md"].map((n) => join(dir, n)),
    );
    // Nor a check of its notes' links across them: the Problems panel's All tab says why.
    h.app.problems.open("all");
    expect(h.app.problems.rows()).toEqual([]);
    expect(h.app.problems.count()).toBe(0);
    expect(h.frame()).toContain("Elsewhere has no index: no check of its notes' links");
    h.app.problems.close();
    // A file of Elsewhere's in another folder opens here: it's one place.
    const other = nowhere();
    h.app.open(join(other, "a.md"));
    expect(h.app.loc.mode).toBe("folder");
    expect(h.app.view!.buf.abs).toBe(join(other, "a.md"));
    // Its relative links followed from its folder; one to another folder of Elsewhere's opens here too, never a peek.
    await h.keys("tab", "enter");
    expect(h.app.view!.buf.abs).toBe(join(other, "b.md"));
    writeFileSync(join(other, "far.md"), `[far](${join(dir, "a.md")})\n`);
    h.app.open(join(other, "far.md"));
    await h.keys("tab", "enter");
    expect(h.app.floating).toBeNull();
    expect(h.app.view!.buf.abs).toBe(join(dir, "a.md"));
  });

  test("a file of Elsewhere's opened in a vault — a session's tab, say — is Elsewhere's: read-only here", async () => {
    const dir = nowhere();
    const h = await harness({ root: makeVault(), open: "index.md" });
    const buf = h.app.buffer(join(dir, "a.md"))!;
    expect(buf.elsewhere?.vault).toBe("Elsewhere");
    expect(buf.readOnly).toBe("read-only here: Elsewhere's — o goes there, to edit it");
  });

  test("going in from a vault and out again: each its own tabs, Elsewhere's one set wherever its files are", async () => {
    const dir = nowhere();
    const root = makeVault();
    const h = await harness({ root, open: "index.md" });
    // Chosen (:e), a file of Elsewhere's goes into Elsewhere, as into a vault (VV-D4): its own tabs.
    await h.app.run(`note.open ${join(dir, "a.md")}`);
    expect(h.app.loc).toMatchObject({ mode: "folder", root: dir });
    expect(h.app.tabs.map((t) => t.views[0]!.buf.key)).toContain(join(dir, "a.md"));
    expect(h.app.view!.buf.key).toBe(join(dir, "a.md"));
    expect(h.app.messages.some((m) => m.text === `Elsewhere — ${tildePath(join(dir, "a.md"))}`)).toBe(true);
    // Back into the vault: its tabs.
    expect(h.app.vaults.back()).toBe(true);
    expect(h.app.loc.root).toBe(root);
    expect(h.app.tabs.map((t) => t.views[0]!.buf.rel)).toEqual(["index.md"]);
    // Elsewhere again, from another folder: the same tabs, the new file among them.
    const other = nowhere();
    h.app.open(join(other, "b.md"));
    expect(h.app.loc).toMatchObject({ mode: "folder", root: other });
    expect(h.app.tabs.map((t) => t.views[0]!.buf.key)).toContain(join(dir, "a.md"));
    expect(h.app.view!.buf.abs).toBe(join(other, "b.md"));
  });

  test("peeked at from a vault: Elsewhere naming it, its backlinks said missing; t keeps it read-only, o goes into Elsewhere", async () => {
    const dir = nowhere();
    const root = makeVault();
    writeFileSync(join(root, "out.md"), `# Out\n\n[a](${join(dir, "a.md")})\n`);
    const h = await harness({ root, open: "out.md" });
    await h.keys("tab", "enter");
    expect(h.app.floating?.kind).toBe("peek");
    expect(h.app.floating!.title).toBe(`Elsewhere › ${join(dir, "a.md")}`);
    expect(h.app.view!.buf.source).toContain("no backlinks in Elsewhere — it has no index");
    // Its relative links are followed from its folder, inside the peek.
    await h.keys("tab", "enter");
    expect(h.app.view!.buf.abs).toBe(join(dir, "b.md"));
    await h.keys("t");
    expect(h.app.view!.buf.readOnly).toBe("read-only here: Elsewhere's — o goes there, to edit it");
    expect(h.app.loc.root).toBe(root);
    await h.app.run("peek.go");
    expect(h.app.loc).toMatchObject({ mode: "folder", root: dir });
    expect(h.app.view!.buf.abs).toBe(join(dir, "b.md"));
    expect(h.app.view!.buf.readOnly).toBeNull();
  });
});
