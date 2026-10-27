import { expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homeAt, rootAt } from "../../../../src/core/workspace/vaults/vault.ts";
import { readStale } from "../../../../src/core/workspace/git/merge/stale.ts";
import { loadSession } from "../../../../src/core/workspace/session/position.ts";
import { recordRoot } from "../../../../src/core/workspace/vaults/registry.ts";
import { vaultChoices } from "../../../../src/tui/workspace/vaults/vault-list.ts";
import type { ListOverlay } from "../../../../src/tui/app/runtime/app.ts";
import { harness, makeSandbox, makeVault } from "../../../tui-harness.ts";

makeSandbox();

test("vault switch choices: stay, save all, discard and return from disk", async () => {
  for (const choice of ["stay", "save", "discard"] as const) {
    const a = makeVault();
    const b = makeVault();
    const original = readFileSync(join(a, "index.md"), "utf8");
    const h = await harness({ root: a, open: "index.md" });
    await h.keys("ctrl+k", "i", "x", "escape");
    expect(h.app.view!.buf.dirty).toBe(true);
    expect(h.app.vaults.switchVault(rootAt(b), null)).toBe(false);
    expect((h.app.overlay as ListOverlay).items.map((item) => item.label)).toEqual([
      "Save all and go",
      "Discard and go",
      "Stay",
    ]);
    await h.app.run(`vault.switch_${choice}`);
    if (choice === "stay") {
      expect(h.app.loc.root).toBe(a);
      expect(h.app.view!.buf.dirty).toBe(true);
    } else {
      expect(h.app.loc.root).toBe(b);
      expect(readFileSync(join(a, "index.md"), "utf8")).toBe(choice === "save" ? `x${original}` : original);
      expect(loadSession(rootAt(a))?.tabs.length).toBeGreaterThan(0);
      h.app.vaults.back();
      expect(h.app.loc.root).toBe(a);
      expect(h.app.view!.buf.source).toBe(choice === "save" ? `x${original}` : original);
      expect(h.app.view!.buf.dirty).toBe(false);
    }
  }
});

test("a failed save keeps the vault and its unsaved buffer", async () => {
  const a = makeVault();
  const h = await harness({ root: a });
  await h.keys("ctrl+k", "i", "x", "escape");
  const buffer = h.app.view!.buf;
  const write = h.app.writeBuffer;
  h.app.writeBuffer = () => {
    h.app.message("error", "write refused");
    return false;
  };
  try {
    h.app.vaults.switchVault(rootAt(makeVault()), null);
    await h.app.run("vault.switch_save");
    expect(h.app.loc.root).toBe(a);
    expect(h.app.view!.buf).toBe(buffer);
    expect(buffer.dirty).toBe(true);
  } finally {
    h.app.writeBuffer = write;
  }
});

/** Strong data ownership reachable through controller fields (functions/WeakMaps don't expose their captures). */
function owns(root: object, target: object): boolean {
  const seen = new Set<object>();
  const pending = [root];
  while (pending.length) {
    const value = pending.pop()!;
    if (value === target) return true;
    if (seen.has(value)) continue;
    seen.add(value);
    const children =
      value instanceof Map
        ? [...value.keys(), ...value.values()]
        : value instanceof Set
          ? [...value]
          : Object.values(value);
    for (const child of children) if (child && typeof child === "object") pending.push(child);
  }
  return false;
}

test("alternating vaults releases old notes, parses and index owners; history keeps only positions", async () => {
  const a = makeVault();
  const b = makeVault();
  const h = await harness({ root: a });
  for (let i = 0; i < 4; i++) {
    const buffer = h.app.view!.buf;
    const parsed = buffer.parsed;
    const graph = h.app.graph;
    const index = h.app.search.index;
    h.app.search.open("Index");
    h.app.completion = null;
    expect(h.app.vaults.switchVault(rootAt(i % 2 ? a : b), null)).toBe(true);
    await h.app.search.whenIndexed();
    expect(owns(h.app, buffer)).toBe(false);
    expect(owns(h.app, parsed)).toBe(false);
    expect(owns(h.app, graph)).toBe(false);
    if (index) expect(owns(h.app, index)).toBe(false);
    expect(h.app.vaults.trail.every((entry) => typeof entry.path === "string")).toBe(true);
  }
});

test("the switch list includes unnamed known vaults, without changing pointer choices", async () => {
  const root = makeVault();
  writeFileSync(join(root, ".slipbox", "config.toml"), '[vault]\nid = "0123456789abcdef"\n');
  recordRoot({ path: root, kind: "vault" });
  const rows = vaultChoices();
  expect(rows.some((item) => (item.data as { root?: string } | null)?.root === root)).toBe(true);
});

test("home folders restore their workspace and worktrees group under the repository", async () => {
  const home = makeVault();
  mkdirSync(join(home, "notes"), { recursive: true });
  writeFileSync(join(home, "notes", "a.md"), "# Home note\n");
  const before = process.env.HOME;
  process.env.HOME = home;
  try {
    const h = await harness({ loc: homeAt(home), folder: join(home, "notes"), open: "notes/a.md" });
    const other = makeVault();
    h.app.vaults.switchVault(rootAt(other), null);
    const tree = makeVault();
    recordRoot({ path: tree, kind: "vault", worktree: { main: other, name: "topic" } });
    const rows = vaultChoices();
    const folder = rows.find((row) => row.label === "notes" && row.hint === "home")!;
    expect(folder).toBeDefined();
    const child = rows.findIndex((row) => (row.data as { root?: string } | null)?.root === tree);
    expect(rows[child]!.indent).toBe(1);
    expect(rows.slice(0, child).some((row) => row.header && row.detail === other)).toBe(true);
    h.app.vaults.openFolders();
    const list = h.app.overlay as ListOverlay;
    await h.keys("/", "n", "o", "t", "e", "s");
    expect(list.input).toBe("notes");
    expect(list.filtered.some((entry) => entry.item.label === "notes")).toBe(true);
    list.accept(folder);
    expect(h.app.loc.root).toBe(home);
    expect(h.app.homeFolder).toBe("notes");
    expect(h.app.view!.buf.abs).toBe(join(home, "notes", "a.md"));
  } finally {
    process.env.HOME = before;
  }
});

test("explorer zoom does not switch the home workspace or its tabs", async () => {
  const home = makeVault();
  const before = process.env.HOME;
  process.env.HOME = home;
  try {
    const h = await harness({ loc: homeAt(home), folder: join(home, "notes"), open: "notes/alpha.md" });
    const tabs = h.app.tabs;
    const buffer = h.app.view!.buf;
    h.app.explorer.zoomTo(home);
    expect(h.app.homeFolder).toBe("notes");
    expect(h.app.tabs).toBe(tabs);
    expect(h.app.view!.buf).toBe(buffer);
    h.app.explorer.zoomTo(join(home, "notes"));
    expect(h.app.homeFolder).toBe("notes");
    expect(h.app.tabs).toBe(tabs);
  } finally {
    process.env.HOME = before;
  }
});

test("back after an unsaved choice consumes its stop once; stay preserves it", async () => {
  for (const choice of ["save", "discard", "stay"] as const) {
    const a = makeVault();
    const b = makeVault();
    const h = await harness({ root: a });
    h.app.vaults.switchVault(rootAt(b), null);
    await h.keys("ctrl+k", "i", "x", "escape");
    expect(h.app.vaults.back()).toBe(true);
    await h.app.run(`vault.switch_${choice}`);
    expect(h.app.loc.root).toBe(choice === "stay" ? b : a);
    expect(h.app.vaults.trail.length).toBe(choice === "stay" ? 1 : 0);
  }
});

test("dirty advisory is republished for the same relative path in a new vault", async () => {
  const a = makeVault();
  const b = makeVault();
  const h = await harness({ root: a, open: "index.md" });
  await h.keys("ctrl+k", "i", "x", "escape");
  h.app.session.publishDirty();
  expect(readStale(rootAt(a)).map((entry) => entry.path)).toContain("index.md");
  h.app.vaults.switchVault(rootAt(b), join(b, "index.md"));
  await h.app.run("vault.switch_discard");
  h.app.view!.buf.edit(0, 0, "x", 0);
  h.app.session.publishDirty();
  expect(readStale(rootAt(b)).map((entry) => entry.path)).toContain("index.md");
});
