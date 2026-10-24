// Where you are (WSP-D4, WSP-D5), driven headlessly as tests/tui.test.ts drives the rest (the harness:
// tests/tui-harness.ts): what the top bar's middle says in each place, its cutting to fit, the span it's kept in, its
// two click targets, and the status line saying it only while the top bar doesn't.

import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ListOverlay } from "../src/tui/app.ts";
import { fitLocation } from "../src/tui/draw-topbar.ts";
import { stringWidth } from "../src/core/width.ts";
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

test("location narrowing drops tracking, branch, count, then shortens zoom and workspace", () => {
  const items = [
    { id: "top:zoom", text: "≡ ~/notes", role: "topbar" as const },
    { id: "top:vault", text: "◈ kestrel", role: "topbar" as const },
    { id: "top:branch", text: "⎇ main ↑2 ↓1", compact: "⎇ main", role: "topbar" as const },
    { id: "top:changed", text: "● 3", role: "topbar" as const },
  ];
  const fit = (width: number) => fitLocation(items, width, "│");
  expect(fit(80)).toEqual(items);
  expect(fit(45).find((item) => item.id === "top:branch")?.text).toBe("⎇ main");
  expect(fit(34).map((item) => item.id)).toEqual(["top:zoom", "top:vault", "top:changed"]);
  expect(fit(28).map((item) => item.id)).toEqual(["top:zoom", "top:vault"]);
  expect(fit(20)[0]!.text).toContain("…");
  const fitted = fit(20);
  expect(fitted.reduce((width, item) => width + stringWidth(item.text) + 2, 3)).toBeLessThanOrEqual(20);
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
    for (const [glyphs, width] of (["nerd", "unicode", "ascii"] as const).flatMap((glyphs) =>
      [25, 40].map((width) => [glyphs, width] as const),
    )) {
      const h = await harness({
        width,
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
      for (const r of regions) expect(r.x + r.w).toBeLessThanOrEqual(width);
    }
  });
});

test("a real index job cancelled from the list warns and can resume", async () => {
  const h = await harness();
  h.app.graph.build(true, "lazy");
  const pending = h.app.graph.pendingCount;
  expect(pending).toBeGreaterThan(1);
  h.app.watch.indexInBackground();
  await h.app.run("background.open");
  expect((h.app.overlay as ListOverlay).items.some((item) => item.label === "Indexing")).toBe(true);
  await h.keys("enter");
  await h.app.watch.whenIndexed();
  expect(h.app.background.tasks.size).toBe(0);
  expect(h.app.graph.pendingCount).toBeGreaterThan(0);
  expect(h.app.messages.at(-1)?.text).toContain("indexing cancelled");
  await Bun.sleep(10);
  h.app.watch.indexInBackground();
  await h.app.watch.whenIndexed();
  expect(h.app.graph.pendingCount).toBe(0);
  expect(h.app.background.tasks.size).toBe(0);
});
