// Where you are (WSP-D4, WSP-D5), driven headlessly as tests/tui.test.ts drives the rest (the harness:
// tests/tui-harness.ts): what the top bar's middle says in each place, its cutting to fit, the span it's kept in, its
// two click targets, and the status line saying it only while the top bar doesn't.

import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ListOverlay } from "../src/tui/app.ts";
import { fitWhere, type Where } from "../src/tui/where.ts";
import { harness, makeSandbox, statusRow, topRow, type Harness } from "./tui-harness.ts";

const sandbox = makeSandbox();

const git = (cwd: string, ...args: string[]) =>
  Bun.spawnSync(["git", "-c", "user.email=t@example.invalid", "-c", "user.name=t", "-C", cwd, ...args]);

/** A vault of its own name, a note in it; a repository on `main` when `repo`, one commit made. */
const named = (name: string, repo = false): string | null => {
  const dir = realpathSync(mkdtempSync(join(sandbox, "named-")));
  mkdirSync(join(dir, ".slipbox"));
  const id = Bun.hash(dir).toString(16).padStart(16, "0").slice(0, 16);
  writeFileSync(join(dir, ".slipbox", "config.toml"), `[vault]\nid = "${id}"\nname = "${name}"\n`);
  writeFileSync(join(dir, "index.md"), "# Index\n");
  if (!repo) return dir;
  if (git(dir, "init", "-q", "-b", "main").exitCode !== 0) return null;
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "first");
  return dir;
};

/** A hot region drawn this frame. */
const hot = (h: Harness, id: string) => {
  h.frame();
  return h.app.geometry!.hot.find((r) => r.id === id);
};
const click = (h: Harness, id: string) => {
  const r = hot(h, id)!;
  h.app.mouse.handle({ type: "down", x: r.x, y: r.y, button: 0 });
  h.app.mouse.handle({ type: "up", x: r.x, y: r.y, button: 0 });
  h.frame();
};

describe("where you are, cut to fit (WSP-D4)", () => {
  const parts: Where = {
    glyph: "◈ ",
    vault: "~/src/a-long-experiment",
    vaultPath: true,
    folder: null,
    sep: "›",
    branch: "feature/long-branch",
    at: false,
    track: "↑2 ↓1",
    op: "merging",
  };
  const fit = (w: Where, width: number) => {
    const f = fitWhere(w, width);
    return f ? f.vault + f.branch : null;
  };

  test("a part at a time: the path from the front, to 12 columns; ahead and behind; the branch, to 8, then gone; the operation; the vault, to 6; then nothing", () => {
    expect(fit(parts, 61)).toBe("◈ ~/src/a-long-experiment · feature/long-branch ↑2 ↓1 merging");
    expect(fit(parts, 60)).toBe("◈ …src/a-long-experiment · feature/long-branch ↑2 ↓1 merging");
    expect(fit(parts, 50)).toBe("◈ …-experiment · feature/long-branch ↑2 ↓1 merging");
    // Ahead and behind gone, the path has its room back: each stage cuts from the whole text.
    expect(fit(parts, 49)).toBe("◈ …-long-experiment · feature/long-branch merging");
    expect(fit(parts, 40)).toBe("◈ …-experiment · feature/long-b… merging");
    expect(fit(parts, 33)).toBe("◈ …-experiment · feature… merging");
    // A merge under way outlasts the branch: something's to finish (the review's finding, 2026-10-24).
    expect(fit(parts, 30)).toBe("◈ …c/a-long-experiment merging");
    expect(fit(parts, 23)).toBe("◈ …g-experiment merging");
    expect(fit(parts, 20)).toBe("◈ …a-long-experiment");
    expect(fit(parts, 14)).toBe("◈ …-experiment");
    expect(fit(parts, 13)).toBe("◈ …experiment");
    expect(fit(parts, 8)).toBe("◈ …iment");
    expect(fit(parts, 7)).toBeNull();
  });

  test("a worktree mid-rebase on a narrow bar: the rebase kept after the branch is gone", () => {
    const wt = { ...parts, vault: "kestrel", vaultPath: false, branch: "agent/sync-retry", at: true, track: "" };
    const rebasing = { ...wt, op: "rebasing 2/5" };
    expect(fit(rebasing, 40)).toBe("◈ kestrel@agent/sync-retry rebasing 2/5");
    expect(fit(rebasing, 30)).toBe("◈ kestrel rebasing 2/5");
    expect(fit(rebasing, 21)).toBe("◈ kestrel");
  });

  test("an empty branch, as a rebase's `refs/heads/` alone gives: nothing after the vault but what's under way", () => {
    const empty = { ...parts, vault: "kestrel", vaultPath: false, branch: "", track: "", op: "rebasing 1/2" };
    expect(fit(empty, 80)).toBe("◈ kestrel rebasing 1/2");
    expect(fit({ ...empty, at: true }, 80)).toBe("◈ kestrel rebasing 1/2");
  });

  test("the vault's part and the branch's apart: the two click targets", () => {
    expect(fitWhere(parts, 61)).toEqual({
      vault: "◈ ~/src/a-long-experiment",
      branch: " · feature/long-branch ↑2 ↓1 merging",
    });
    // A named worktree's branch after its name, its operation after that.
    const wt = {
      ...parts,
      vault: "kestrel",
      vaultPath: false,
      branch: "feat",
      at: true,
      track: "",
      op: "rebasing 2/5",
    };
    expect(fitWhere(wt, 80)).toEqual({ vault: "◈ kestrel", branch: "@feat rebasing 2/5" });
  });

  test("home's folder: after home, its path cut from the front to 12 columns, then gone before the vault is cut", () => {
    const home = { ...parts, vault: "~", folder: "projects/research/notes", branch: null, track: "", op: "" };
    expect(fit(home, 29)).toBe("◈ ~ › projects/research/notes");
    expect(fit(home, 20)).toBe("◈ ~ › …esearch/notes");
    expect(fit(home, 10)).toBe("◈ ~");
  });

  test("a name of wide characters, measured by its columns and cut from its end", () => {
    const wide = { ...parts, vault: "日本語のノート", vaultPath: false, branch: "main", track: "", op: "" };
    expect(fit(wide, 23)).toBe("◈ 日本語のノート · main");
    expect(fit(wide, 22)).toBe("◈ 日本語のノート");
    expect(fit(wide, 12)).toBe("◈ 日本語の…");
  });

  test("Elsewhere has no glyph: it's no vault", () => {
    const elsewhere = { ...parts, glyph: "", vault: "Elsewhere", vaultPath: false, branch: null, track: "", op: "" };
    expect(fit(elsewhere, 40)).toBe("Elsewhere");
  });
});

describe("permanent location bar (VB-T2)", () => {
  test("zoom and workspace are separate targets; focus opens the explorer without changing zoom", async () => {
    const h = await harness({ width: 160 });
    expect(topRow(h.frame())).toContain("◈ fixture");
    expect(hot(h, "top:zoom")).toBeDefined();
    expect(hot(h, "top:vault")).toBeDefined();
    h.app.panels.showSidebar(false);
    const zoom = h.app.explorer.top;
    click(h, "top:zoom");
    expect(h.app.panels.sidebarShown).toBe(true);
    expect(h.app.region).toBe("sidebar");
    expect(h.app.explorer.top).toBe(zoom);
    expect(statusRow(h.frame())).not.toContain("fixture");
    h.app.ui.zen = true;
    expect(topRow(h.frame())).toContain("slipbox");
    expect(hot(h, "top:zoom")).toBeDefined();
  });

  test("branch and changed files have separate targets and individual hover", async () => {
    const root = named("osprey", true);
    if (!root) return;
    const h = await harness({ root, width: 200 });
    writeFileSync(join(root, "index.md"), "# Changed\n");
    await h.app.git.refreshNow();
    expect(topRow(h.frame())).toContain("◈ osprey");
    expect(topRow(h.frame())).toContain("⎇ main");
    expect(topRow(h.frame())).toContain("● 1");
    const branch = hot(h, "top:branch")!;
    const changed = hot(h, "top:changed")!;
    expect(changed.x).toBeGreaterThan(branch.x + branch.w);
    h.app.mouse.hover = "top:changed";
    const canvas = h.canvas();
    expect(canvas.styles[changed.y]![changed.x]!.bg).toBe(h.app.theme.roles.hover.bg!);
    expect(canvas.styles[branch.y]![branch.x]!.bg).not.toBe(h.app.theme.roles.hover.bg!);
    click(h, "top:changed");
    expect(h.app.leftView).toBe("git");
    click(h, "top:branch");
    expect((h.app.overlay as ListOverlay).items.map((i) => i.label)).toContain("Fetch");
  });

  test("background tasks cancel individually and disappear on completion; upgrade stays after an offer", async () => {
    const h = await harness({ width: 220 });
    let cancelled = false;
    const done = h.app.background.begin("Export document", () => {
      cancelled = true;
    });
    const other = h.app.background.begin("Git fetch", () => {});
    expect(topRow(h.frame())).toMatch(/[◴◷◶◵] 2/);
    click(h, "top:work");
    expect((h.app.overlay as ListOverlay).items.map((i) => i.label)).toEqual(["Export document", "Git fetch"]);
    await h.keys("enter");
    expect(cancelled).toBe(true);
    expect(h.app.background.tasks.size).toBe(1);
    done();
    other();
    expect(hot(h, "top:work")).toBeUndefined();
    h.app.updates.available = "0.5.2";
    expect(topRow(h.frame())).toContain("⇡ 0.5.2");
    await h.keys("escape");
    expect(hot(h, "top:upgrade")).toBeDefined();
  });

  test("narrowing keeps zoom and workspace in every glyph set", async () => {
    for (const glyphs of ["nerd", "unicode", "ascii"] as const) {
      const h = await harness({
        width: 40,
        config: (c) => {
          c.render.glyphs = glyphs;
        },
      });
      h.app.updates.available = "0.5.2";
      h.app.background.begin("Indexing", () => {});
      h.frame();
      expect(hot(h, "top:zoom")).toBeDefined();
      expect(hot(h, "top:vault")).toBeDefined();
      expect(hot(h, "top:upgrade")).toBeUndefined();
      const regions = h.app.geometry!.hot.filter((r) => r.id.startsWith("top:"));
      for (const r of regions) expect(r.x + r.w).toBeLessThanOrEqual(40);
    }
  });
});
