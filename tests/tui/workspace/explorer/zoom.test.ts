import { describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { DEFAULT_CONFIG } from "../../../../src/core/application/config/config.ts";
import { tildePath } from "../../../../src/core/foundation/platform/paths.ts";
import { makeSandbox, harness, type Harness } from "../../../tui-harness.ts";

// The model harness applies the file-local timeout and sandbox policy.
const sandbox = makeSandbox();

describe("the explorer's view (VV-D5)", () => {
  /** A folder of vaults: a notes vault, a repository, a plain folder, a loose note and a picture. */
  const place = () => {
    const P = mkdtempSync(join(sandbox, "place-"));
    mkdirSync(join(P, "notes", ".slipbox"), { recursive: true });
    mkdirSync(join(P, "notes", "sub"));
    mkdirSync(join(P, "notes", "other"));
    writeFileSync(join(P, "notes", "a.md"), "# A\n");
    writeFileSync(join(P, "notes", "data.json"), "{}\n");
    writeFileSync(join(P, "notes", "script.py"), "print(1)\n");
    writeFileSync(join(P, "notes", "sub", "b.md"), "# B\n");
    writeFileSync(join(P, "notes", "other", "c.md"), "# C\n");
    mkdirSync(join(P, "code", ".git"), { recursive: true });
    writeFileSync(join(P, "code", "main.ts"), "export {};\n");
    mkdirSync(join(P, "loose"));
    writeFileSync(join(P, "loose", "x.md"), "# X\n");
    writeFileSync(join(P, "readme.md"), "# Readme\n");
    writeFileSync(join(P, "pic.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]));
    return P;
  };
  const shown = (h: Harness) =>
    h.app.explorer
      .rows()
      .map((r) => `${"  ".repeat(r.depth)}${r.name}${r.root?.here ? " (here)" : r.kind === "root" ? " (vault)" : ""}`);
  const select = async (h: Harness, name: string) => {
    h.app.leftView = "explorer";
    h.app.sidebar.selected = h.app.explorer.rows().findIndex((r) => r.name === name);
    h.app.region = "sidebar";
  };
  /** The breadcrumb as drawn: the explorer's row under its title. */
  const crumbRow = (h: Harness) => {
    const f = h.frame().split("\n");
    const list = h.app.geometry!.sidebar!;
    return [...f[list.y - 1]!].slice(list.x, list.x + list.w).join("");
  };
  /** A folder of the breadcrumb, clicked. */
  const clickCrumb = (h: Harness, abs: string) => {
    h.frame();
    const hot = h.app.geometry!.hot.find((r) => r.id === `xcrumb:${abs}`);
    if (!hot) throw new Error(`no breadcrumb for ${abs}: ${crumbRow(h)}`);
    h.app.mouse.handle({ type: "down", x: hot.x, y: hot.y, button: 0 });
    h.app.mouse.handle({ type: "up", x: hot.x, y: hot.y, button: 0 });
  };

  test("files.show auto: notes and data files in a notes vault, every text file in a repository; no .. above", async () => {
    const P = place();
    const h = await harness({
      root: join(P, "notes"),
      open: "a.md",
      config: (c) => (c.files.show = DEFAULT_CONFIG.files.show),
    });
    expect(DEFAULT_CONFIG.files.show).toBe("auto");
    expect(h.app.explorer.filesShown()).toBe("renderable");
    expect(shown(h)).toEqual(["other", "sub", "a.md", "data.json"]);
    const code = await harness({
      root: join(P, "code"),
      open: null,
      config: (c) => (c.files.show = DEFAULT_CONFIG.files.show),
    });
    expect(code.app.explorer.filesShown()).toBe("all");
    expect(shown(code)).toEqual(["main.ts"]);
  });

  test("x/y opened shows y, vault x named in the breadcrumb; - zooms out, y unfolded and selected; the breadcrumb and z zoom back in", async () => {
    const P = place();
    const { prepare } = await import("../../../../src/tui/shell/terminal/run.ts");
    const start = prepare([join(P, "notes", "sub")]);
    if (typeof start === "number") throw new Error(`exit ${start}`);
    expect(start.folder).toBe(join(P, "notes", "sub"));
    const h = await harness({ root: join(P, "notes"), open: null, folder: join(P, "notes", "sub") });
    expect(h.app.explorer.top).toBe(join(P, "notes", "sub"));
    expect(shown(h)).toEqual(["b.md"]);
    // The breadcrumb: the folders down to the view, the vault open marked as one and current.
    const crumbs = h.app.explorer.crumbs();
    expect(crumbs.at(-1)).toMatchObject({ abs: join(P, "notes", "sub"), label: "sub", past: false });
    expect(crumbs.at(-2)).toMatchObject({ abs: join(P, "notes"), label: "notes", vault: true, current: true });
    expect(crumbs[0]!.label).toBe(P.startsWith(`${homedir()}/`) ? "~" : "/");
    expect(crumbRow(h)).toContain(`◈ notes › sub ›`);
    // -: a folder up, the folder it showed unfolded and selected.
    await select(h, "b.md");
    await h.keys("-");
    expect(h.app.explorer.top).toBe(join(P, "notes"));
    expect(shown(h)).toEqual(["other", "sub", "  b.md", "a.md", "data.json"]);
    expect(h.app.explorer.rows()[h.app.sidebar.selected]!.name).toBe("sub");
    // The folder zoomed out of stays in the breadcrumb, dimmed past the view: a click zooms back in.
    expect(h.app.explorer.crumbs().at(-1)).toMatchObject({ label: "sub", past: true });
    expect(crumbRow(h)).toMatch(/◈ notes › sub\s*$/);
    clickCrumb(h, join(P, "notes", "sub"));
    expect(h.app.explorer.top).toBe(join(P, "notes", "sub"));
    // An ancestor clicked zooms out to it.
    clickCrumb(h, join(P, "notes"));
    expect(h.app.explorer.top).toBe(join(P, "notes"));
    // z on a folder zooms in on it; on a file, on its folder; the breadcrumb's way down is the new one.
    await select(h, "other");
    await h.keys("z");
    expect(h.app.explorer.top).toBe(join(P, "notes", "other"));
    expect(shown(h)).toEqual(["c.md"]);
    expect(h.app.explorer.crumbs().at(-1)).toMatchObject({ label: "other", past: false });
    await h.keys("-");
    await select(h, "b.md");
    await h.keys("z");
    expect(h.app.explorer.top).toBe(join(P, "notes", "sub"));
    // Nothing above /.
    h.app.explorer.zoomTo("/");
    await h.keys("-");
    expect(h.app.explorer.top).toBe("/");
    expect(h.app.messages.at(-1)!.text).toBe("the explorer is zoomed out fully: nothing is above /");
  });

  test("the breadcrumb above home names the view: from /, home by its name, the trail in home past it", async () => {
    const P = place();
    const before = process.env.HOME;
    process.env.HOME = P;
    try {
      const h = await harness({ root: join(P, "notes"), open: null });
      await select(h, "sub");
      await h.keys("-");
      expect(h.app.explorer.crumbs().map((c) => [c.label, c.past])).toEqual([
        ["~", false],
        ["notes", true],
      ]);
      await h.keys("-");
      const view = dirname(P);
      expect(h.app.explorer.top).toBe(view);
      const crumbs = h.app.explorer.crumbs();
      expect(crumbs[0]).toMatchObject({ abs: "/", label: "/" });
      expect(crumbs.find((c) => !c.past)).toBeDefined();
      expect(crumbs.findLast((c) => !c.past)).toMatchObject({ abs: view, label: basename(view) });
      expect(crumbs.slice(-2).map((c) => [c.label, c.past])).toEqual([
        [basename(P), true],
        ["notes", true],
      ]);
      expect(crumbRow(h)).toContain(`… › ${basename(view)} › `); // the view drawn, the trail giving way first
      h.app.explorer.zoomTo("/");
      expect(h.app.explorer.crumbs()[0]).toMatchObject({ abs: "/", past: false });
    } finally {
      process.env.HOME = before;
    }
  });

  test("- past the vault: it highlighted, its tree under it; l unfolds another vault in place, enter goes into it (VV-D4)", async () => {
    const P = place();
    const h = await harness({ root: join(P, "notes"), open: "a.md", config: (c) => (c.files.show = "auto") });
    await select(h, "a.md");
    await h.keys("-");
    expect(h.app.explorer.top).toBe(P);
    expect(h.app.loc.root).toBe(join(P, "notes")); // the vault open is still this one
    // A level at a time: the folders (vaults by their icon), then the files; the vault open unfolded, marked.
    expect(shown(h)).toEqual([
      "code (vault)",
      "loose",
      "notes (here)",
      "  other",
      "  sub",
      "  a.md",
      "  data.json",
      "readme.md",
    ]);
    expect(h.app.explorer.rows()[h.app.sidebar.selected]!.name).toBe("notes");
    h.app.region = "content"; // not drawn selected
    const c = h.canvas();
    const list = h.app.geometry!.sidebar!;
    const y = list.y + h.app.explorer.rows().findIndex((r) => r.root?.here) - h.app.sidebar.scroll;
    const x = [...c.toString().split("\n")[y]!].join("").indexOf("notes");
    expect(c.styles[y]![x]!.fg).toBe(h.app.theme.roles.sidebar_active.fg!);
    // A plain folder unfolds a level; nothing of this vault's to rename or delete there.
    await select(h, "loose");
    await h.keys("l");
    expect(shown(h)).toContain("  x.md");
    await select(h, "x.md");
    expect(h.app.explorer.item()).toBeNull();
    // Another vault unfolds in place with l, the vault open unchanged; enter goes into it, the view staying.
    await select(h, "code");
    await h.keys("l");
    expect(shown(h)).toContain("  main.ts");
    expect(h.app.loc.root).toBe(join(P, "notes"));
    await select(h, "main.ts");
    await h.keys("enter");
    expect(h.app.loc.root).toBe(join(P, "code"));
    expect(h.app.view!.buf.abs).toBe(join(P, "code", "main.ts"));
    expect(h.app.explorer.top).toBe(P);
    expect(shown(h).slice(0, 3)).toEqual(["code (here)", "  main.ts", "loose"]);
    expect(shown(h)).toContain("notes (vault)");
    // h folds the vault open, l unfolds it; z zooms in on it.
    await select(h, "code");
    await h.keys("h");
    expect(shown(h).slice(0, 2)).toEqual(["code (here)", "loose"]);
    await h.keys("l");
    expect(shown(h)).toContain("  main.ts");
    await h.keys("z");
    expect(h.app.explorer.top).toBe(join(P, "code"));
    expect(shown(h)).toEqual(["main.ts"]);
    // enter on another vault's row goes into it.
    await h.keys("-");
    await select(h, "notes");
    await h.keys("enter");
    expect(h.app.loc.root).toBe(join(P, "notes"));
  });

  test("~ listed a level at a time: l unfolds a folder of it in place, h from a row in it folds it again", async () => {
    const P = place();
    const before = process.env.HOME;
    process.env.HOME = P;
    try {
      const { elsewhereAt } = await import("../../../../src/core/workspace/vaults/vault.ts");
      const h = await harness({ loc: elsewhereAt(P), open: null });
      expect(h.app.explorer.crumbs().map((c) => c.label)).toEqual(["~"]);
      await select(h, "loose");
      await h.keys("l");
      expect(shown(h)).toContain("  x.md");
      await select(h, "x.md");
      await h.keys("h");
      expect(shown(h)).not.toContain("  x.md");
      expect(h.app.explorer.rows()[h.app.sidebar.selected]!.name).toBe("loose");
    } finally {
      process.env.HOME = before;
    }
  });

  test("a note opened outside the view: it zooms out to the common parent, only the two paths unfolded", async () => {
    const P = place();
    const h = await harness({ root: join(P, "notes"), open: null, folder: join(P, "notes", "sub") });
    expect(h.app.explorer.top).toBe(join(P, "notes", "sub"));
    h.app.explorer.expanded.add("elsewhere"); // unfolded once, out of sight: folded by the zoom
    await h.app.run("note.open other/c.md");
    expect(h.app.view!.buf.rel).toBe("other/c.md");
    expect(h.app.explorer.top).toBe(join(P, "notes"));
    expect([...h.app.explorer.expanded].sort()).toEqual(["other", "sub"]);
    expect(shown(h)).toEqual(["other", "  c.md", "sub", "  b.md", "a.md", "data.json"]);
    expect(h.app.explorer.rows()[h.app.sidebar.selected]!.path).toBe("other/c.md");
    // The breadcrumb leads back where you went.
    expect(h.app.explorer.crumbs().at(-1)).toMatchObject({ abs: join(P, "notes", "other"), past: true });
    // Inside the view, nothing zooms.
    await h.app.run("note.open sub/b.md");
    expect(h.app.explorer.top).toBe(join(P, "notes"));
  });

  test("a file you may not write opens read-only and says so; a folder you may not read says why (VV-D5)", async () => {
    if (process.getuid?.() === 0) return; // root may write anything: nothing to refuse
    const P = place();
    chmodSync(join(P, "notes", "a.md"), 0o444);
    mkdirSync(join(P, "locked"));
    chmodSync(join(P, "locked"), 0o000);
    try {
      const h = await harness({ root: join(P, "notes"), open: "a.md" });
      expect(h.app.view!.buf.readOnly).toBe("a.md is read-only: you may not write it (no permission)");
      expect(h.app.messages.some((m) => m.text === "a.md is read-only: you may not write it (no permission)")).toBe(
        true,
      );
      await h.keys("shift+g", "shift+a", "!");
      expect(h.app.view!.buf.dirty).toBe(false);
      expect(readFileSync(join(P, "notes", "a.md"), "utf8")).toBe("# A\n");
      // Zoomed out to it: unfolded, then zoomed into, it says why — and stays as it was.
      await h.keys("escape");
      await select(h, "a.md");
      await h.keys("-");
      await select(h, "locked");
      await h.keys("l");
      expect(h.app.messages.at(-1)!.text).toBe(
        `can't read ${tildePath(join(P, "locked"))}: you may not read it (no permission)`,
      );
      expect(h.app.explorer.expanded.has(join(P, "locked"))).toBe(false);
      h.app.messages.length = 0;
      await h.keys("z");
      expect(h.app.messages.at(-1)!.text).toBe(
        `can't read ${tildePath(join(P, "locked"))}: you may not read it (no permission)`,
      );
      expect(h.app.explorer.top).toBe(P);
      // Opened on it: said at once.
      const { elsewhereAt } = await import("../../../../src/core/workspace/vaults/vault.ts");
      const at = await harness({ loc: elsewhereAt(join(P, "locked")), open: null });
      expect(at.app.messages.some((m) => m.text.startsWith(`can't read ${tildePath(join(P, "locked"))}:`))).toBe(true);
    } finally {
      chmodSync(join(P, "locked"), 0o755);
      chmodSync(join(P, "notes", "a.md"), 0o644);
    }
  });
});
