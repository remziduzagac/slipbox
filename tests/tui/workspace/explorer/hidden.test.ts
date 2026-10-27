import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import { DEFAULT_CONFIG } from "../../../../src/core/application/config/config.ts";
import { makeSandbox, harness, statusRow, type Harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
const sandbox = makeSandbox();

describe("hidden files in the explorer (files.hidden, shift+h)", () => {
  /**
   * A notes vault in a repository: index.md, docs/a.md; hidden, .github/workflows/ci.yml, .notes/todo.md (linking
   * index.md), .prettierrc.json; inner/, a repository of its own holding .cache/x.json.
   */
  const hiddenVault = () => {
    const root = realpathSync(mkdtempSync(join(sandbox, "hidden-")));
    const w = (rel: string, text: string) => {
      mkdirSync(dirname(join(root, rel)), { recursive: true });
      writeFileSync(join(root, rel), text);
    };
    w(".slipbox/config.toml", `[vault]\nid = "hid${randomBytes(4).toString("hex")}"\n`);
    w("index.md", "# Index\n");
    w("docs/a.md", "# A\n");
    w(".github/workflows/ci.yml", "on: push\n");
    w(".notes/todo.md", "# Todo\n\n[index](../index.md)\n");
    w(".prettierrc.json", "{}\n");
    w("inner/b.md", "# B\n");
    w("inner/.cache/x.json", "{}\n");
    for (const dir of [root, join(root, "inner")]) Bun.spawnSync(["git", "init", "-q"], { cwd: dir });
    return root;
  };
  const names = (h: Harness) => h.app.explorer.rows().map((r) => `${"  ".repeat(r.depth)}${r.name}`);
  const rowOf = (h: Harness, name: string) => h.app.explorer.rows().findIndex((r) => r.name === name);
  /** The status line with the explorer's cursor on the row named `name`. */
  const statusOn = (h: Harness, name: string) => {
    h.app.region = "sidebar";
    h.app.sidebar.selected = rowOf(h, name);
    return statusRow(h.frame());
  };

  test("off by default, nothing hidden listed; files.hidden lists them ⊘, said hidden, .slipbox slipbox's own, .git never", async () => {
    expect(DEFAULT_CONFIG.files.hidden).toBe(false);
    const root = hiddenVault();
    const off = await harness({ root, open: "index.md" });
    expect(off.app.ui.hidden_files).toBe(false);
    expect(names(off)).toEqual(["docs", "inner", "index.md"]);
    const h = await harness({ root, open: "index.md", config: (c) => (c.files.hidden = true) });
    expect(names(h)).toEqual([".github", ".notes", ".slipbox", "docs", "inner", ".prettierrc.json", "index.md"]);
    // By their paths, as the busy folders are: not this vault's to change, never indexed.
    expect(h.app.explorer.rows()[rowOf(h, ".github")]).toMatchObject({
      kind: "dir",
      path: join(root, ".github"),
      outside: true,
      leftOut: "hidden",
    });
    h.app.sidebar.selected = rowOf(h, ".notes");
    expect(h.app.explorer.item()).toBeNull();
    expect(statusOn(h, ".github")).toContain("⊘ not indexed: hidden");
    expect(statusOn(h, ".prettierrc.json")).toContain("⊘ not indexed: hidden");
    expect(statusOn(h, ".slipbox")).toContain("⊘ not indexed: slipbox's own folder");
    expect(statusOn(h, "docs")).not.toContain("not indexed");
    // Unfolded, a level at a time, the reason carried down; a repository's own unfolded in place: its hidden ones
    // too, its .git never.
    for (const name of [".github", "inner"]) {
      h.app.sidebar.selected = rowOf(h, name);
      h.app.explorer.action("expand");
    }
    expect(names(h)).toEqual([
      ".github",
      "  workflows",
      ".notes",
      ".slipbox",
      "docs",
      "inner",
      "  .cache",
      "  b.md",
      ".prettierrc.json",
      "index.md",
    ]);
    expect(statusOn(h, "workflows")).toContain("⊘ not indexed: hidden");
    expect(statusOn(h, ".cache")).toContain("⊘ not indexed: hidden");
    // Nothing of them indexed by being listed.
    expect([...h.app.graph.notes.keys()].filter((p) => p.startsWith("."))).toEqual([]);
  });

  test("shift+h shows and hides them, said, the selection on its row; :hidden and the UI settings toggle it too", async () => {
    const h = await harness({ root: hiddenVault(), open: "index.md" });
    await h.keys("space", "e"); // focus the explorer
    h.app.sidebar.selected = rowOf(h, "docs");
    await h.keys("shift+h");
    expect(h.app.messages.at(-1)?.text).toBe("explorer: hidden files shown");
    expect(h.app.ui.hidden_files).toBe(true);
    expect(names(h)).toContain(".github");
    expect(h.app.explorer.rows()[h.app.sidebar.selected]?.name).toBe("docs");
    await h.keys("shift+h");
    expect(h.app.messages.at(-1)?.text).toBe("explorer: hidden files not shown");
    expect(names(h)).not.toContain(".github");
    expect(h.app.explorer.rows()[h.app.sidebar.selected]?.name).toBe("docs");
    // Kept for the vault as a UI setting is, against its config value.
    await h.keys("shift+h");
    expect(h.app.settings.uiOverrides.hidden_files).toEqual({ value: true, base: false });
    // :hidden, from the note.
    expect(h.app.aliases.hidden).toBe("explorer.toggle_hidden");
    await h.keys("escape", ":", ...[..."hidden"], "enter");
    expect(h.app.messages.at(-1)?.text).toBe("explorer: hidden files not shown");
    expect(names(h)).not.toContain(".github");
    // The UI settings list it with its value; picked, it changes.
    await h.keys("space", "u", "u");
    expect(h.frame()).toMatch(/Hidden files in the explorer +off/);
    await h.keys(...[..."hidden"], "enter");
    expect(h.app.ui.hidden_files).toBe(true);
    expect(names(h)).toContain(".github");
  });

  test("hidden again, a view zoomed into a hidden folder goes out to the folder holding it", async () => {
    const root = hiddenVault();
    const h = await harness({ root, open: "index.md", config: (c) => (c.files.hidden = true) });
    h.app.explorer.zoomTo(join(root, ".github", "workflows"));
    expect(names(h)).toEqual(["ci.yml"]);
    await h.app.run("explorer.toggle_hidden");
    expect(h.app.explorer.top).toBe(root);
    expect(names(h)).toEqual(["docs", "inner", "index.md"]);
  });

  test("a vault's own config can turn it on, read again live", async () => {
    const root = hiddenVault();
    const cfg = join(root, "user.toml");
    writeFileSync(cfg, "");
    const h = await harness({ root, open: "index.md", configFile: cfg });
    h.app.settings.reload();
    expect(names(h)).not.toContain(".github");
    writeFileSync(join(root, ".slipbox", "config.toml"), "[files]\nhidden = true\n");
    h.app.settings.reload();
    expect(h.app.messages.filter((m) => m.level === "warn").map((m) => m.text)).toEqual([]);
    expect(h.app.config.files.hidden).toBe(true);
    expect(names(h)).toContain(".github");
  });

  test("a hidden file opened from its row joins the vault's index (20.8); one of .slipbox opens, never indexed", async () => {
    const root = hiddenVault();
    const h = await harness({ root, open: "index.md", config: (c) => (c.files.hidden = true) });
    const open = async (...path: string[]) => {
      h.app.region = "sidebar"; // the explorer's keys
      for (const name of path.slice(0, -1)) {
        h.app.sidebar.selected = rowOf(h, name);
        if (!h.app.explorer.expanded.has(h.app.explorer.rows()[h.app.sidebar.selected]!.path)) await h.keys("l");
      }
      h.app.sidebar.selected = rowOf(h, path.at(-1)!);
      await h.keys("o");
    };
    expect(h.app.graph.notes.has(".notes/todo.md")).toBe(false);
    await open(".notes", "todo.md");
    expect(h.app.view!.buf.rel).toBe(".notes/todo.md");
    expect(h.app.graph.notes.has(".notes/todo.md")).toBe(true);
    expect(h.app.graph.backlinks("index.md").map((b) => b.from)).toContain(".notes/todo.md");
    expect(h.app.info.rows().find((r) => r.key === "index")).toBeUndefined();
    // Its row, revealed, by its path in the hidden folder's; the folder still ⊘.
    expect(h.app.explorer.rows()[h.app.sidebar.selected]?.path).toBe(join(root, ".notes", "todo.md"));
    expect(statusOn(h, "todo.md")).not.toContain("not indexed");
    expect(statusOn(h, ".notes")).toContain("⊘ not indexed: hidden");
    // A data file: the vault's file now, as a link would make it.
    await open(".github", "workflows", "ci.yml");
    expect(h.app.view!.buf.rel).toBe(".github/workflows/ci.yml");
    expect(h.app.graph.known(".github/workflows/ci.yml")).toBe(true);
    expect(h.app.info.rows().find((r) => r.key === "index")).toBeUndefined(); // not its folder's ⊘ any more
    // A note made in a hidden folder by its path: listed once, in that folder's rows, its folder still the row by its
    // path.
    await h.app.run("note.create /.notes/later");
    expect(h.app.view!.buf.rel).toBe(".notes/later.md");
    expect(names(h).filter((n) => n.trim() === ".notes")).toHaveLength(1);
    expect(
      h.app.explorer
        .rows()
        .filter((r) => r.name === "later.md")
        .map((r) => r.path),
    ).toEqual([join(root, ".notes", "later.md")]);
    // slipbox's own: opened, never the vault's.
    await open(".slipbox", "config.toml");
    expect(h.app.view!.buf.abs).toBe(join(root, ".slipbox", "config.toml"));
    expect(h.app.view!.buf.rel).toBeNull();
    expect(h.app.graph.known(".slipbox/config.toml")).toBe(false);
    expect(h.app.info.rows().find((r) => r.key === "index")?.value).toBe("not indexed: slipbox's own folder");
  });

  test("home as before: its walk leaves hidden folders out; listed, ⊘ hidden, nothing in them indexed, opened or not", async () => {
    const { homeAt } = await import("../../../../src/core/workspace/vaults/vault.ts");
    const home = realpathSync(mkdtempSync(join(sandbox, "home-")));
    mkdirSync(join(home, ".config", "tool"), { recursive: true });
    writeFileSync(join(home, "a.md"), "# A\n");
    writeFileSync(join(home, ".config", "tool", "t.md"), "# T\n\n[a](../../a.md)\n");
    const before = process.env.HOME;
    process.env.HOME = home;
    try {
      const h = await harness({ loc: homeAt(home), open: "a.md", config: (c) => (c.files.hidden = true) });
      expect(h.app.graph.filter.exclusion(".config", true)).toBe("hidden");
      expect(names(h)).toEqual([".config", "a.md"]);
      expect(statusOn(h, ".config")).toContain("⊘ not indexed: hidden");
      await h.keys("l");
      h.app.sidebar.selected = rowOf(h, "tool");
      await h.keys("l");
      h.app.sidebar.selected = rowOf(h, "t.md");
      await h.keys("o");
      expect(h.app.view!.buf.abs).toBe(join(home, ".config", "tool", "t.md"));
      expect(h.app.view!.buf.rel).toBeNull();
      expect(h.app.graph.known(".config/tool/t.md") || h.app.graph.reached.has(".config/tool/t.md")).toBe(false);
      expect(h.app.info.rows().find((r) => r.key === "index")?.value).toBe("not indexed: hidden");
    } finally {
      process.env.HOME = before;
    }
  });
});
