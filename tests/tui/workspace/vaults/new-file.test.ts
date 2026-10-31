import { afterEach, describe, expect, spyOn, test } from "bun:test";
import * as fs from "node:fs";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { App } from "../../../../src/tui/app/runtime/app.ts";
import { prepare, type Start } from "../../../../src/tui/shell/terminal/run.ts";
import { TextCanvas } from "../../../../src/tui/shell/terminal/canvas.ts";
import { makeSandbox, makeVault } from "../../../tui-harness.ts";

const sandbox = makeSandbox();
const apps: App[] = [];
afterEach(() => {
  for (const app of apps.splice(0)) app.quit();
});

function prepared(path: string, root?: string, configFile?: string): Start {
  const start = prepare([path, ...(root ? ["--root", root] : []), ...(configFile ? ["--config", configFile] : [])]);
  if (typeof start === "number") throw new Error(`startup exited ${start}`);
  return start;
}

function started(path: string, root?: string, configFile?: string) {
  const start = prepared(path, root, configFile);
  start.config.lint.enabled = "off";
  start.config.index.background = false;
  start.config.search.engine = "scan";
  let quit = false;
  const app = new App({
    ...start,
    watch: false,
    host: {
      requestRender() {},
      osc52: () => true,
      quit: () => {
        quit = true;
      },
    },
  });
  apps.push(app);
  const frame = () => {
    const c = new TextCanvas(160, 34);
    app.draw(c);
    return c.toString();
  };
  return { app, start, frame, quit: () => quit };
}

describe("opening a new file (#168)", () => {
  test("a new file in an existing folder starts empty and clean; quitting makes nothing", () => {
    const root = makeVault();
    const path = join(root, "notes/coffee.md");
    const h = started(path);
    const b = h.app.view!.buf;
    expect(h.start.loc.root).toBe(root);
    expect(h.app.explorer.top).toBe(dirname(path));
    expect(b.source).toBe("");
    expect(b.dirty).toBe(false);
    expect(b.newFile).toBe(true);
    expect(b.deleted).toBe(false);
    expect(b.changedOnDisk()).toBe(false);
    expect(h.frame()).toContain("notes/coffee.md [new]");
    h.app.saving.requestQuit();
    expect(h.quit()).toBe(true);
    expect(existsSync(path)).toBe(false);
  });

  test("missing parents stay absent until save, then join the index and explorer", async () => {
    const root = makeVault();
    const path = join(root, "notes/2027/plans/coffee.md");
    const h = started(path);
    expect(h.start.folder).toBe(join(root, "notes"));
    expect(h.app.explorer.top).toBe(join(root, "notes"));
    expect(existsSync(join(root, "notes/2027"))).toBe(false);
    const b = h.app.view!.buf;
    b.edit(0, 0, "# Coffee\n");
    h.app.saving.requestQuit();
    expect(h.quit()).toBe(false);
    expect(h.app.messages.at(-1)!.text).toContain("unsaved changes");
    await h.app.run("note.save");
    expect(readFileSync(path, "utf8")).toBe("# Coffee\n");
    expect(b.newFile).toBe(false);
    expect(b.dirty).toBe(false);
    expect(b.rel).toBe("notes/2027/plans/coffee.md");
    expect(h.app.graph.notes.has(b.rel!)).toBe(true);
    expect(h.app.graph.dirs).toContain("notes/2027/plans");
    expect(h.frame()).not.toContain("[new]");
    expect(h.app.messages.at(-1)!.text).toContain("saved notes/2027/plans/coffee.md");
  });

  test.each(["coffee", "coffee.unknown", "tasks.toml", "app.py"])("%s follows :new's extension rules", (name) => {
    const root = makeVault();
    const expected = name === "coffee" || name === "coffee.unknown" ? `${name}.md` : name;
    const h = started(join(root, name));
    expect(h.start.open).toBe(join(root, expected));
    expect(h.app.view!.buf.abs).toBe(join(root, expected));
    expect(h.app.view!.buf.newFile).toBe(true);
    expect(existsSync(join(root, expected))).toBe(false);
  });

  test("saving an untouched new buffer explicitly makes an empty file", async () => {
    const path = join(makeVault(), "empty.md");
    const h = started(path);
    await h.app.run("note.save");
    expect(readFileSync(path, "utf8")).toBe("");
    expect(h.app.view!.buf.newFile).toBe(false);
  });

  test("an existing normalized name opens its text", () => {
    const root = makeVault();
    writeFileSync(join(root, "coffee.md"), "# Existing\n");
    const h = started(join(root, "coffee"));
    expect(h.app.view!.buf.source).toBe("# Existing\n");
    expect(h.app.view!.buf.newFile).toBe(false);
  });

  test("the nearest existing ancestor's nested vault wins, including with --root", () => {
    const outer = makeVault();
    const inner = join(outer, "nested-vault");
    for (const root of [undefined, outer]) {
      const h = started(join(inner, "future/deep/plan.md"), root);
      expect(h.start.loc.root).toBe(inner);
      expect(h.app.explorer.top).toBe(inner);
      expect(h.app.view!.buf.key).toBe("future/deep/plan.md");
    }
  });

  test("Elsewhere uses the nearest existing folder and saves new parents there", () => {
    const dir = mkdtempSync(join(sandbox, "loose-"));
    const path = join(dir, "future/plan.md");
    const config = join(dir, "config.toml");
    writeFileSync(config, '[walk]\nroot_markers = [".new-file-test-root"]\n');
    const h = started(path, undefined, config);
    expect(h.start.loc).toMatchObject({ mode: "folder", root: dir, file: path });
    expect(h.app.saving.save(h.app.view!.buf)).toBe(true);
    expect(readFileSync(path, "utf8")).toBe("");
  });

  test("a new file under home belongs to home, and its first save reaches the index", () => {
    const home = mkdtempSync(join(sandbox, "home-"));
    mkdirSync(join(home, "notes"));
    const previous = process.env.HOME;
    process.env.HOME = home;
    try {
      const path = join(home, "notes/future/plan.md");
      const h = started(path);
      expect(h.start.loc).toMatchObject({ mode: "home", root: home, file: path });
      expect(h.app.explorer.top).toBe(join(home, "notes"));
      expect(h.app.saving.save(h.app.view!.buf)).toBe(true);
      expect(h.app.view!.buf.rel).toBe("notes/future/plan.md");
      expect(h.app.graph.notes.has("notes/future/plan.md")).toBe(true);
    } finally {
      process.env.HOME = previous;
    }
  });

  test("never-indexed names, outside --root, / as root and missing trailing-slash folders refuse before the screen", () => {
    const root = makeVault();
    writeFileSync(join(root, ".gitignore"), "target/\n");
    mkdirSync(join(root, "target"));
    const stderr = spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      for (const args of [
        [join(root, "target/debug/plan.md")],
        [join(root, ".git/plan.md")],
        [join(sandbox, "outside.md"), "--root", root],
        [join(root, "new.md"), "--root", "/"],
        [join(root, "missing/") + "/"],
      ])
        expect(prepare(args)).toBe(3);
      expect(stderr.mock.calls.map((c) => c[0]).join("")).toContain("no such directory");
      expect(existsSync(join(root, "target/debug"))).toBe(false);
    } finally {
      stderr.mockRestore();
    }
  });

  test("a new path through a symlink out of the vault refuses before the screen", () => {
    const root = makeVault();
    const outside = mkdtempSync(join(sandbox, "outside-"));
    symlinkSync(outside, join(root, "linked"));
    const stderr = spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      expect(prepare([join(root, "linked/new.md")])).toBe(3);
      expect(readdirSync(outside)).toEqual([]);
    } finally {
      stderr.mockRestore();
    }
  });

  test("walk.exclude remains allowed and saving says not indexed", async () => {
    const root = makeVault();
    writeFileSync(join(root, ".slipbox/config.toml"), '[walk]\nexclude = ["drafts/"]\n');
    const h = started(join(root, "drafts/plan.md"));
    h.app.view!.buf.edit(0, 0, "Plan\n");
    await h.app.run("note.save");
    expect(readFileSync(join(root, "drafts/plan.md"), "utf8")).toBe("Plan\n");
    expect(h.app.graph.notes.has("drafts/plan.md")).toBe(false);
    expect(h.app.messages.at(-1)!.text).toContain("not indexed: walk.exclude");
  });

  test("an intervening file asks before saving, and can be loaded with undo preserved", () => {
    const path = join(makeVault(), "collision.md");
    const h = started(path);
    const b = h.app.view!.buf;
    b.edit(0, 0, "Mine\n");
    writeFileSync(path, "Theirs\n");
    expect(h.app.saving.save(b)).toBe(false);
    expect(readFileSync(path, "utf8")).toBe("Theirs\n");
    expect(h.app.overlay?.kind).toBe("list");
    h.app.saving.resolveConflict(b, "l");
    expect(b.source).toBe("Theirs\n");
    expect(b.newFile).toBe(false);
    b.undo();
    expect(b.source).toBe("Mine\n");
  });

  test("a watcher notification about an untouched new file asks instead of replacing the buffer", () => {
    const path = join(makeVault(), "watched.md");
    const h = started(path);
    const b = h.app.view!.buf;
    writeFileSync(path, "Theirs\n");
    h.app.watch.reloadBuffer(b);
    expect(b.source).toBe("");
    expect(b.newFile).toBe(true);
    expect(h.app.overlay?.kind).toBe("list");
    expect(readFileSync(path, "utf8")).toBe("Theirs\n");
  });

  test("keeping a first-save collision requires confirmation before writing over it", () => {
    const path = join(makeVault(), "keep.md");
    const h = started(path);
    const b = h.app.view!.buf;
    b.edit(0, 0, "Mine\n");
    writeFileSync(path, "Theirs\n");
    expect(h.app.saving.save(b)).toBe(false);
    h.app.overlay = null;
    h.app.saving.resolveConflict(b, "k");
    expect(h.app.saving.save(b)).toBe(false);
    expect(readFileSync(path, "utf8")).toBe("Theirs\n");
    const confirm = h.app.overlay as App["overlay"];
    expect(confirm?.kind).toBe("list");
    if (confirm?.kind !== "list") throw new Error("expected overwrite confirmation");
    confirm.accept(confirm.items.find((i) => i.data === "y")!);
    expect(readFileSync(path, "utf8")).toBe("Mine\n");
    expect(b.newFile).toBe(false);
    expect(b.dirty).toBe(false);
    expect(h.app.graph.notes.has("keep.md")).toBe(true);
  });

  test("an untouched new file can reopen its disk conflict with note.resolve", async () => {
    const path = join(makeVault(), "resolve.md");
    const h = started(path);
    const b = h.app.view!.buf;
    writeFileSync(path, "Theirs\n");
    h.app.watch.reloadBuffer(b);
    const prompt = h.app.overlay;
    expect(prompt?.kind).toBe("list");
    if (prompt?.kind !== "list") throw new Error("expected disk conflict");
    h.app.overlay = null;
    prompt.cancel?.();
    expect(b.dirty).toBe(false);
    await h.app.run("note.resolve");
    const reopened = h.app.overlay as App["overlay"];
    expect(reopened?.kind).toBe("list");
    expect(b.source).toBe("");
    expect(b.newFile).toBe(true);
    expect(readFileSync(path, "utf8")).toBe("Theirs\n");
  });

  test("a folder occupying the normalized new name refuses before the screen", () => {
    const root = makeVault();
    mkdirSync(join(root, "coffee.md"));
    const stderr = spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      const result = prepare([join(root, "coffee")]);
      expect(typeof result).toBe("number");
      expect(result).toBe(3);
      expect(stderr.mock.calls.map((c) => c[0]).join("")).toContain("is a folder");
      const folder = prepared(join(root, "coffee.md"));
      expect(folder.newFile).toBe(false);
      expect(folder.open).toBeNull();
      expect(folder.folder).toBe(join(root, "coffee.md"));
    } finally {
      stderr.mockRestore();
    }
  });

  test("a file appearing during the atomic first save is never replaced", () => {
    const path = join(makeVault(), "race.md");
    const h = started(path);
    const b = h.app.view!.buf;
    b.edit(0, 0, "Mine\n");
    const link = fs.linkSync;
    const publish = spyOn(fs, "linkSync").mockImplementation((from, to) => {
      if (String(to) === path) writeFileSync(path, "Won the race\n");
      return link(from, to);
    });
    try {
      expect(h.app.saving.save(b)).toBe(false);
      expect(readFileSync(path, "utf8")).toBe("Won the race\n");
      expect(b.newFile).toBe(true);
      expect(b.dirty).toBe(true);
      expect(h.app.overlay?.kind).toBe("list");
      expect(readdirSync(dirname(path)).some((n) => n.includes(".slipbox-") && n.endsWith(".tmp"))).toBe(false);
    } finally {
      publish.mockRestore();
    }
  });
});
