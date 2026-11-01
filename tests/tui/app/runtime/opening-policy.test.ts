import { expect, spyOn, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { App } from "../../../../src/tui/app/runtime/app.ts";
import { Settings } from "../../../../src/tui/app/settings/settings.ts";
import { Watch } from "../../../../src/tui/app/runtime/watch.ts";
import { Session } from "../../../../src/tui/workspace/session/session.ts";
import { Vaults } from "../../../../src/tui/workspace/vaults/vaults.ts";
import { harness, makeSandbox, makeVault } from "../../../tui-harness.ts";

makeSandbox();

test("opening policy keeps one buffer, independent view anchors and the App write gate", async () => {
  const h = await harness();
  const app = h.app;
  const first = app.view!;
  first.topAnchor = { heading: null, headingIndex: 0, offset: 0, line: 3 };
  first.curAnchor = { anchor: first.topAnchor, sub: 0, col: 2 };
  app.openInNewTab(join(h.root, "index.md"));
  const second = app.view!;
  expect(second.buf).toBe(first.buf);
  expect(app.buffers.get("index.md")).toBe(first.buf);
  expect(second.topAnchor).not.toBe(first.topAnchor);
  expect(second.curAnchor).not.toBe(first.curAnchor);
  second.buf.edit(0, 0, "Shared text\n");
  expect(first.buf.source).toStartWith("Shared text\n");
  const write = spyOn(app, "writeBuffer");
  try {
    expect(app.saving.save(second.buf)).toBe(true);
    expect(write).toHaveBeenCalledTimes(1);
    expect(readFileSync(join(h.root, "index.md"), "utf8")).toBe(first.buf.source);
    expect(first.buf.dirty).toBe(false);
  } finally {
    write.mockRestore();
  }
});

test("opening policy preserves pinned tabs, floating refusal and same-buffer anchor jumps", async () => {
  const h = await harness();
  const app = h.app;
  const first = app.view!;
  const anchor = { heading: null, headingIndex: 0, offset: 0, line: 3 };
  app.open("index.md", anchor);
  expect(app.view).toBe(first);
  expect(first.curAnchor.anchor.line).toBe(3);
  app.tab!.pinned = true;
  app.open("notes/beta.md");
  expect(app.tabs).toHaveLength(2);
  expect(first.buf.key).toBe("index.md");
  app.overlays.openHover("Hover", "Hover");
  const floating = app.floating;
  const close = spyOn(app.overlays, "closeFloating").mockReturnValue(false);
  try {
    app.open("index.md");
    expect(app.floating).toBe(floating);
    expect(app.tabs).toHaveLength(2);
    expect(app.tabView!.buf.key).toBe("notes/beta.md");
  } finally {
    close.mockRestore();
  }
});

test("opening policy gives explicit anchors precedence and survives source layout changes", async () => {
  const root = makeVault();
  writeFileSync(join(root, "policy.md"), "# Policy\n\nalpha beta gamma\n\nlast line\n");
  const h = await harness({ root, open: "policy.md" });
  const app = h.app;
  const anchor = { heading: null, headingIndex: 0, offset: 0, line: 3 };
  const cursor = { anchor, sub: 0, col: 4 };
  const view = app.makeView(app.view!.buf, anchor, cursor);
  expect(view.topAnchor).toBe(anchor);
  expect(view.curAnchor).toBe(cursor);
  view.source = true;
  app.tabs.push({ views: [view], active: 0, orientation: "side", ratio: 0.5 });
  app.activeTab = app.tabs.length - 1;
  app.placeAtLine(view, 3, 5);
  const before = structuredClone(view.curAnchor);
  expect(app.cursorLine(view)).toBe(3);
  expect(view.cur.col).toBe(4);
  app.widthsChanged();
  expect(view.layoutKey).toBe("");
  app.currentLayout(view);
  expect(view.curAnchor).toEqual(before);
  expect(app.cursorLine(view)).toBe(3);
});

test("App starts and disposes collaborators in order and quits once", async () => {
  const calls: string[] = [];
  const spies: { mockRestore(): void }[] = [];
  const follow = <T extends object, K extends keyof T>(object: T, key: K, label: string) => {
    const original = object[key] as (...args: unknown[]) => unknown;
    const spy = spyOn(object, key as never).mockImplementation(function (this: T, ...args: unknown[]) {
      calls.push(label);
      return original.apply(this, args);
    } as never);
    spies.push(spy);
  };
  try {
    follow(Vaults.prototype, "ask", "ask");
    follow(Watch.prototype, "followGraph", "follow graph");
    follow(Settings.prototype, "applyKeys", "keys");
    follow(Session.prototype, "restoreUiOverrides", "UI restore");
    follow(Settings.prototype, "applyTheme", "theme");
    follow(Settings.prototype, "glyphSet", "glyphs");
    follow(App.prototype, "openInNewTab", "open");
    follow(Session.prototype, "publishState", "publish");
    follow(Settings.prototype, "recordStamps", "stamps");
    const h = await harness();
    expect(calls).toEqual([
      "ask",
      "follow graph",
      "keys",
      "UI restore",
      "theme",
      "glyphs",
      "open",
      "publish",
      "stamps",
    ]);
    calls.length = 0;
    follow(h.app.pictures, "dispose", "pictures");
    follow(h.app.languages, "stopSyntax", "syntax");
    follow(h.app.languages, "stopTools", "tools");
    h.app.shellJob = { command: "owned", stop: () => calls.push("shell") };
    follow(h.app.exporter, "cancel", "export");
    follow(h.app.session, "save", "save session");
    follow(h.app.host, "quit", "host quit");
    h.app.quit();
    h.app.quit();
    expect(calls).toEqual(["pictures", "syntax", "tools", "shell", "export", "save session", "host quit"]);
    expect(h.quit.called).toBe(true);
    expect(h.app.quitting).toBe(true);
  } finally {
    for (const spy of spies.reverse()) spy.mockRestore();
  }
});
