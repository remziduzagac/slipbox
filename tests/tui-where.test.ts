// Where you are (WSP-D4, WSP-D5), driven headlessly as tests/tui.test.ts drives the rest (the harness:
// tests/tui-harness.ts): what the top bar's middle says in each place, its cutting to fit, the span it's kept in, its
// two click targets, and the status line saying it only while the top bar doesn't.

import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ListOverlay } from "../src/tui/app.ts";
import { fitWhere, type Where } from "../src/tui/where.ts";
import { stringWidth } from "../src/core/width.ts";
import { harness, makeSandbox, statusRow, topRow, whereNow, type Harness } from "./tui-harness.ts";

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

describe("where you are on the top bar (WSP-D4)", () => {
  test("a named vault without git: its name, no branch, centred; said once, not on the status line (WSP-D5)", async () => {
    const h = await harness({ width: 120 });
    const top = topRow(h.frame());
    expect(top).toContain("◈ fixture");
    expect(top).not.toContain(" · ");
    expect(statusRow(h.frame())).not.toContain("fixture");
    const v = hot(h, "top:vault")!;
    expect(Math.abs(v.x + v.w / 2 - 60)).toBeLessThanOrEqual(1);
    expect(hot(h, "top:branch")).toBeUndefined();
  });

  test("a vault by its path, in a repository: its branch, dim; a branch switched while it runs, followed", async () => {
    const root = realpathSync(mkdtempSync(join(sandbox, "by-path-")));
    writeFileSync(join(root, "index.md"), "# Index\n");
    if (git(root, "init", "-q", "-b", "main").exitCode !== 0) return;
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "first");
    const h = await harness({ root, width: 200 });
    expect(topRow(h.frame())).toContain(`◈ ${whereNow(h)}`);
    expect(whereNow(h)).toBe(`${root} · main`);
    const b = hot(h, "top:branch")!;
    expect(h.canvas().styles[b.y]![b.x + 2]!.fg).toBe(h.app.theme.roles.status_dim.fg!);
    // Each switch dates HEAD apart: headOf reads it again when its mtime moves, and two writes in one clock tick
    // could share one.
    const switched = (n: number, ...args: string[]) => {
      git(root, "switch", "-q", ...args);
      const at = new Date(Date.now() + n * 1000);
      utimesSync(join(root, ".git", "HEAD"), at, at);
    };
    switched(1, "-c", "topic");
    expect(topRow(h.frame())).toContain(" · topic");
    // A detached head: its commit.
    switched(2, "--detach");
    const commit = git(root, "rev-parse", "--short=7", "HEAD").stdout.toString().trim();
    expect(topRow(h.frame())).toContain(` · ${commit}`);
  });

  test("home as ~, and a folder of it opened by name after it (VV-D2)", async () => {
    const { homeAt } = await import("../src/core/vault.ts");
    const home = realpathSync(mkdtempSync(join(sandbox, "home-")));
    mkdirSync(join(home, "notes"));
    writeFileSync(join(home, "README.md"), "# Home\n");
    writeFileSync(join(home, "notes", "inbox.md"), "# Inbox\n");
    const before = process.env.HOME;
    process.env.HOME = home;
    try {
      const top = await harness({ loc: homeAt(home), open: "README.md" });
      expect(topRow(top.frame())).toContain("◈ ~");
      expect(topRow(top.frame())).not.toContain("›");
      const folder = await harness({ loc: homeAt(home), open: null, folder: join(home, "notes") });
      expect(folder.app.homeFolder).toBe("notes");
      expect(topRow(folder.frame())).toContain("◈ ~ › notes");
      // The workspace is part of the vault's target.
      expect(hot(folder, "top:vault")!.w).toBe("◈ ~ › notes".length);
    } finally {
      process.env.HOME = before;
    }
  });

  test("Elsewhere, without the glyph", async () => {
    const { elsewhereAt } = await import("../src/core/vault.ts");
    const dir = realpathSync(mkdtempSync(join(sandbox, "elsewhere-")));
    writeFileSync(join(dir, "a.md"), "# A\n");
    const h = await harness({ loc: elsewhereAt(dir, join(dir, "a.md")), open: join(dir, "a.md") });
    const top = topRow(h.frame());
    expect(top).toContain("Elsewhere");
    expect(top).not.toContain("◈");
  });

  test("a name of wide characters", async () => {
    const root = named("日本語のノート");
    const h = await harness({ root: root!, width: 120 });
    expect(topRow(h.frame())).toContain("◈ 日本語のノート");
  });

  test("kept 2 columns clear of the chip, the outline's button and indexing…, moved only as far as it must", async () => {
    const root = named("a-vault-named-at-some-length", true);
    if (!root) return;
    // The left rail off: the explorer's button before the chip. The right rail and the breadcrumb off: the outline's
    // button on the bar.
    const h = await harness({
      root,
      width: 60,
      config: (c) => {
        c.ui.left_rail = false;
        c.ui.right_rail = false;
        c.ui.breadcrumb = false;
      },
    });
    h.app.indexing = 3;
    const top = topRow(h.frame());
    expect(top).toContain("indexing 3…");
    const chip = hot(h, "btn:palette")!;
    const outline = hot(h, "btn:outline")!;
    const v = hot(h, "top:vault")!;
    const b = hot(h, "top:branch");
    expect(hot(h, "btn:explorer")!.x).toBeLessThan(chip.x);
    expect(v.x).toBeGreaterThanOrEqual(chip.x + chip.w + 2);
    const end = b ? b.x + b.w : v.x + v.w;
    expect(end).toBeLessThanOrEqual(top.indexOf("indexing 3…") - 2);
    expect(outline.y).toBe(0);
    expect(outline.x).toBeGreaterThan(top.indexOf("indexing 3…"));
    // Cut to fit between them: the branch gone, the name cut from its end.
    expect(top).not.toContain("a-vault-named-at-some-length");
    expect(top).toMatch(/◈ a-vault-named-at-s[^ ]*… {3}indexing/); // 2 columns beyond its padding, as the chip's
    expect(b).toBeUndefined();
  });

  test("with Nerd glyphs: the vault's target covers the glyph by its width, the branch's starts right after", async () => {
    const root = named("osprey", true);
    if (!root) return;
    const h = await harness({ root, width: 120, config: (c) => (c.render.glyphs = "nerd") });
    const glyph = h.app.glyphs.vault;
    expect(glyph).toBe("\u{f125f}");
    expect(topRow(h.frame())).toContain(`${glyph} osprey · main`);
    const v = hot(h, "top:vault")!;
    const b = hot(h, "top:branch")!;
    expect(v.w).toBe(stringWidth(`${glyph} osprey`));
    expect(b.x).toBe(v.x + v.w);
    expect(b.w).toBe(stringWidth(" · main"));
  });

  test("hovered: the part under the mouse in hover", async () => {
    const h = await harness({ width: 120 });
    const v = hot(h, "top:vault")!;
    h.app.mouse.hover = "top:vault";
    expect(h.canvas().styles[v.y]![v.x]!.bg).toBe(h.app.theme.roles.hover.bg!);
  });

  test("the vault clicked: the named folders, enter goes into one, the bar naming it", async () => {
    const kestrel = named("kestrel");
    await harness({ root: kestrel! }); // seen, so named
    const h = await harness({ width: 120 });
    click(h, "top:vault");
    const list = h.app.overlay as ListOverlay;
    expect(list.title).toMatch(/^Folders \(\d+\) — enter goes into one$/);
    const i = list.items.findIndex((it) => it.label === "kestrel");
    expect(i).toBeGreaterThanOrEqual(0);
    await h.keys(...Array<string>(i).fill("down"), "enter");
    expect(h.app.loc.root).toBe(kestrel!);
    expect(topRow(h.frame())).toContain(`${h.app.glyphs.vault} kestrel`); // its config's glyphs, the harness's left
  });

  test("the branch clicked: the branches' menu, as the status line's was (GIT-D8)", async () => {
    const root = named("osprey", true);
    if (!root) return;
    const h = await harness({ root, width: 120 });
    expect(topRow(h.frame())).toContain("◈ osprey · main");
    click(h, "top:branch");
    const list = h.app.overlay as ListOverlay;
    expect(list.items.map((i) => i.label)).toContain("Fetch");
  });
});

describe("where you are on the status line, only while the top bar doesn't say it (WSP-D5)", () => {
  test("the top bar hidden: the status line says it, its click the branches' menu; zen: neither", async () => {
    const root = named("heron", true);
    if (!root) return;
    const h = await harness({ root, width: 120 });
    expect(statusRow(h.frame())).not.toContain("heron");
    expect(hot(h, "status:branch")).toBeUndefined();
    await h.app.run("ui.top_bar");
    expect(h.app.ui.top_bar).toBe(false);
    expect(statusRow(h.frame())).toContain("heron · main");
    click(h, "status:branch");
    expect((h.app.overlay as ListOverlay).items.map((i) => i.label)).toContain("Fetch");
    await h.keys("escape");
    await h.app.run("ui.top_bar");
    h.app.ui.zen = true;
    const f = h.frame();
    expect(topRow(f)).not.toContain("heron");
    expect(statusRow(f)).not.toContain("heron");
  });

  test("home's folder on the status line too, without the glyph", async () => {
    const { homeAt } = await import("../src/core/vault.ts");
    const home = realpathSync(mkdtempSync(join(sandbox, "home-")));
    mkdirSync(join(home, "notes"));
    writeFileSync(join(home, "notes", "inbox.md"), "# Inbox\n");
    const before = process.env.HOME;
    process.env.HOME = home;
    try {
      const h = await harness({
        loc: homeAt(home),
        open: null,
        folder: join(home, "notes"),
        config: (c) => (c.ui.top_bar = false),
      });
      expect(statusRow(h.frame())).toContain("~ › notes");
      expect(statusRow(h.frame())).not.toContain("◈");
    } finally {
      process.env.HOME = before;
    }
  });

  test("no note open (a folder of home with none), the bar hidden: the status line says where all the same", async () => {
    const { homeAt } = await import("../src/core/vault.ts");
    const home = realpathSync(mkdtempSync(join(sandbox, "home-")));
    mkdirSync(join(home, "empty"));
    const before = process.env.HOME;
    process.env.HOME = home;
    try {
      const h = await harness({ loc: homeAt(home), open: null, folder: join(home, "empty") });
      expect(h.app.view).toBeNull();
      expect(topRow(h.frame())).toContain("◈ ~ › empty");
      expect(statusRow(h.frame())).not.toContain("empty");
      h.app.ui.top_bar = false;
      expect(statusRow(h.frame())).toContain("~ › empty");
    } finally {
      process.env.HOME = before;
    }
  });

  test("a screen too narrow for either: neither says it", async () => {
    const h = await harness({ width: 18 });
    const f = h.frame();
    expect(topRow(f)).not.toContain("◈");
    expect(statusRow(f)).not.toContain("fix");
  });
});
