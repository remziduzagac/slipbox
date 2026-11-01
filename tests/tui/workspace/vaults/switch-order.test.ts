import { expect, spyOn, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { rootAt } from "../../../../src/core/workspace/vaults/vault.ts";
import type { ListOverlay } from "../../../../src/tui/shell/overlays/list-types.ts";
import { harness, makeSandbox, makeVault } from "../../../tui-harness.ts";

makeSandbox();

test("vault switching cancels old work before resetting identity and restores before publishing", async () => {
  const a = makeVault();
  const b = makeVault();
  const { app } = await harness({ root: a });
  const graph = app.graph;
  const visits = app.vaults.visits;
  const events: { name: string; root: string; oldGraph: boolean; buffers: number }[] = [];
  const mark = (name: string) =>
    events.push({ name, root: app.loc.root, oldGraph: app.graph === graph, buffers: app.buffers.size });
  const save = app.session.save.bind(app.session);
  const cancel = app.background.cancelAll.bind(app.background);
  const leave = app.languages.leaveVault.bind(app.languages);
  const reset = app.feed.reset.bind(app.feed);
  const follow = app.watch.followGraph.bind(app.watch);
  const restore = app.session.restore.bind(app.session);
  const publish = app.session.publishState.bind(app.session);
  const spies = [
    spyOn(app.session, "save").mockImplementation(() => (mark("save"), save())),
    spyOn(app.background, "cancelAll").mockImplementation(() => (mark("cancel"), cancel())),
    spyOn(app.languages, "leaveVault").mockImplementation(() => (mark("leave"), leave())),
    spyOn(app.feed, "reset").mockImplementation(() => (mark("reset"), reset())),
    spyOn(app.watch, "followGraph").mockImplementation(() => (mark("follow"), follow())),
    spyOn(app.session, "restore").mockImplementation(() => (mark("restore"), restore())),
    spyOn(app.session, "publishState").mockImplementation(() => (mark("publish"), publish())),
  ];
  try {
    app.git.entries = [];
    app.gitPanel.message = "old commit";
    app.region = "sidebar";
    expect(app.vaults.switchVault(rootAt(b), join(b, "index.md"))).toBe(true);
    expect(events.map((event) => event.name)).toEqual([
      "save",
      "cancel",
      "leave",
      "reset",
      "follow",
      "restore",
      "publish",
    ]);
    expect(events.slice(0, 3).every((event) => event.root === a && event.oldGraph && event.buffers > 0)).toBe(true);
    expect(events[3]).toEqual({ name: "reset", root: b, oldGraph: true, buffers: 0 });
    expect(events.slice(4, 6).every((event) => event.root === b && !event.oldGraph && event.buffers === 0)).toBe(true);
    expect(events.at(-1)).toMatchObject({ name: "publish", root: b, oldGraph: false });
    expect(app.vaults.visits).toBe(visits + 1);
    expect(app.view!.buf.abs).toBe(join(b, "index.md"));
    expect(app.git.entries).toBeNull();
    expect(app.gitPanel.message).toBe("");
    expect(String(app.region)).toBe("content");
    expect(app.vaults.trail.at(-1)?.root).toBe(a);
  } finally {
    for (const spy of spies) spy.mockRestore();
  }
});

test("canceling an unsaved switch clears only the pending choice and leaves the workspace live", async () => {
  const a = makeVault();
  const { app } = await harness({ root: a });
  const buffer = app.view!.buf;
  buffer.edit(0, 0, "unsaved ");
  const graph = app.graph;
  const visits = app.vaults.visits;
  const cancel = spyOn(app.background, "cancelAll");
  try {
    expect(app.vaults.switchVault(rootAt(makeVault()), null)).toBe(false);
    (app.overlay as ListOverlay).cancel!();
    app.vaults.chooseSwitch("discard");
    expect(app.loc.root).toBe(a);
    expect(app.graph).toBe(graph);
    expect(app.view!.buf).toBe(buffer);
    expect(buffer.dirty).toBe(true);
    expect(app.vaults.visits).toBe(visits);
    expect(app.vaults.trail).toEqual([]);
    expect(cancel).not.toHaveBeenCalled();
  } finally {
    cancel.mockRestore();
  }
});

test("vault prompts read the current workspace after a switch and return focus to its content", async () => {
  const a = makeVault();
  const b = makeVault();
  const config = join(b, "nested-vault", ".slipbox", "config.toml");
  writeFileSync(config, readFileSync(config, "utf8").replace("fixture-nested", "destination-inner"));
  const { app } = await harness({ root: a });
  app.vaults.switchVault(rootAt(b), null);
  const prompt = spyOn(app.overlays, "prompt");
  try {
    app.vaults.renameItem({ rel: "nested-vault", vault: true, dir: true });
    expect(prompt.mock.calls.at(-1)?.[0]).toContain("name destination-inner");
    app.vaults.openFolders();
    const list = app.overlay as ListOverlay;
    expect(list).toMatchObject({ slashFilter: true, keepGroups: true });
    const destination = list.items.find((item) => (item.data as { root?: string } | null)?.root === a)!;
    expect(destination).toBeDefined();
    list.accept(destination);
    expect(app.loc.root).toBe(a);
    expect(app.region).toBe("content");
    expect(app.vaults.visits).toBe(2);
  } finally {
    prompt.mockRestore();
  }
});
