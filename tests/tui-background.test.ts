import { describe, expect, test } from "bun:test";
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ListOverlay } from "../src/tui/app/runtime/app.ts";
import type { UpdateEnv } from "../src/tui/app/distribution/updates.ts";
import { harness, makeSandbox, makeVault, topRow } from "./tui-harness.ts";

const sandbox = makeSandbox();
const list = (app: { overlay: unknown }) => app.overlay as ListOverlay;

function environment(version = "0.5.1", by: UpdateEnv["by"] = "installer"): UpdateEnv {
  return {
    version,
    by,
    channel: version.includes("-preview.") ? "preview" : "stable",
    data: join(sandbox, String(Math.random())),
    execPath: "/unused/slipbox",
    startedBy: null,
    stateDir: sandbox,
    env: {},
    checkOn: () => false,
    release: { repo: "remziduzagac/slipbox" } as UpdateEnv["release"],
  };
}

describe("work and version (#94)", () => {
  test("idle, busy, paused and preview bar items; upgrade has its own green role", async () => {
    const h = await harness({ width: 220 });
    h.app.updates.env = environment();
    expect(topRow(h.frame())).toContain(" 0 ");
    expect(topRow(h.frame())).toContain("0.5.1");
    const done = h.app.background.begin("Indexing", () => {}, { pause: () => {} });
    expect(topRow(h.frame())).toContain(" 1 ");
    const id = [...h.app.background.tasks.keys()][0]!;
    await h.app.run(`background.pause ${id}`);
    expect(topRow(h.frame())).toContain(" 1 ");
    h.app.updates.env = environment("0.5.2-preview.202610251200.gabcdef1");
    expect(topRow(h.frame())).toContain("0.5.2-P");
    expect(topRow(h.frame())).not.toContain("abcdef1");
    h.app.updates.available = "0.5.2";
    const canvas = h.canvas();
    const hit = h.app.geometry!.hot.find((r) => r.id === "top:upgrade")!;
    expect(canvas.styles[hit.y]![hit.x]!.fg).toBe(h.app.theme.roles.upgrade_available.fg!);
    done();
  });

  test("live work rows show progress, elapsed time and only supported controls; keys act and stay open", async () => {
    let now = 5000;
    const h = await harness({ width: 160, now: () => now });
    let stopped = 0;
    let restarted = 0;
    let paused = false;
    const done = h.app.background.begin("Indexing 0/100 files", () => stopped++, {
      restart: () => restarted++,
      pause: (value) => {
        paused = value;
      },
    });
    h.app.background.begin("Exporting x.pdf", () => {}, { restart: () => {} });
    h.app.background.begin("Downloading slipbox", () => {}, { canStop: () => false });
    await h.keys("space", "b");
    const o = list(h.app);
    expect(o.title).toBe("Background work");
    expect(o.items.map((r) => r.label)).toEqual([
      "Indexing 0/100 files",
      "Stop",
      "Restart",
      "Pause",
      "Exporting x.pdf",
      "Stop",
      "Restart",
      "Downloading slipbox",
    ]);
    expect(o.items[0]!.detail).toContain("s");
    expect(h.frame()).toContain("Indexing 0/100 files · 0 s");
    await h.keys("p");
    expect(paused).toBe(true);
    expect(list(h.app).items[0]!.detail).toContain("paused");
    expect(h.frame()).toContain("paused · 0 s");
    expect(list(h.app).items.some((r) => r.label === "Resume")).toBe(true);
    now += 3000;
    done.update("Indexing 30/100 files");
    expect(h.frame()).toContain("paused · 3 s");
    expect(list(h.app).items[0]!.label).toBe("Indexing 30/100 files");
    await h.keys("p");
    expect(paused).toBe(false);
    await h.keys("r");
    expect(stopped).toBe(1);
    expect(restarted).toBe(1);
    done(); // A late completion cannot overwrite stopped.
    expect(h.app.background.recent[0]!.outcome).toBe("stopped");
    await h.keys("escape");
    expect(h.app.overlay).toBeNull();
    h.app.background.cancelAll();
  });

  test("recent keeps five completions and older failures until dismissed, with no controls retained", async () => {
    const h = await harness();
    h.app.background.begin("Fetching origin", () => {})("failed", "remote unavailable\u001b[31m");
    for (let i = 0; i < 8; i++) h.app.background.begin(`Export ${i}`, () => {}, { restart: () => {} })();
    expect(h.app.background.recent).toHaveLength(6);
    expect(h.app.background.recent[0]!.label).toBe("Export 7");
    const failed = h.app.background.recent.at(-1)!;
    expect(failed).toMatchObject({ outcome: "failed", error: "remote unavailable" });
    expect(failed).not.toHaveProperty("restart");
    await h.app.run(`background.dismiss ${failed.id}`);
    expect(h.app.background.recent).toHaveLength(5);
    const committed = h.app.background.begin("Export publication", () => {});
    committed();
    committed("failed", "rename failed");
    expect(h.app.background.recent[0]).toMatchObject({ outcome: "failed", error: "rename failed" });
  });

  test("a real index pauses before its slices, resumes, and restarts after stop", async () => {
    const h = await harness();
    h.app.graph.build(true, "lazy");
    const pending = h.app.graph.pendingCount;
    h.app.watch.indexInBackground();
    const id = [...h.app.background.tasks.keys()][0]!;
    await h.app.run(`background.pause ${id}`);
    await Bun.sleep(80);
    expect(h.app.graph.pendingCount).toBe(pending);
    expect(h.app.background.rows().some((r) => r.detail?.includes("paused"))).toBe(true);
    await h.app.run(`background.pause ${id}`);
    await h.app.watch.whenIndexed();
    expect(h.app.graph.pendingCount).toBe(0);
    for (const note of h.app.graph.notes.values()) {
      writeFileSync(h.app.graph.abs(note.rel), `# Note\nChanged\n`);
    }
    h.app.graph.build(true, "lazy");
    h.app.watch.indexInBackground();
    const next = [...h.app.background.tasks.keys()][0]!;
    writeFileSync(join(h.root, "restart-found.md"), "# Found by reindex\n");
    await h.app.run(`background.restart ${next}`);
    await h.app.watch.whenIndexed();
    expect(h.app.graph.pendingCount).toBe(0);
    expect(h.app.background.recent.some((r) => r.outcome === "stopped")).toBe(true);
    expect(h.app.graph.notes.has("restart-found.md")).toBe(true);
  });

  test("a real fetch restarts after its aborted child exits and keeps the next failure", async () => {
    const root = makeVault();
    const git = (...args: string[]) => Bun.spawnSync(["git", "-C", root, ...args]);
    expect(git("init", "-q", "-b", "main").exitCode).toBe(0);
    expect(git("remote", "add", "origin", join(root, "missing-remote")).exitCode).toBe(0);
    const h = await harness({ root });
    await h.app.run("git.fetch");
    const id = [...h.app.background.tasks.keys()][0]!;
    expect(id).toBeDefined();
    await h.app.run(`background.restart ${id}`);
    for (let i = 0; i < 300 && h.app.background.recent.length < 2; i++) await Bun.sleep(10);
    const tasks = h.app.background.recent.filter((task) => task.label.startsWith("Fetching"));
    expect(tasks.map((task) => task.outcome)).toEqual(["failed", "stopped"]);
    expect(tasks[0]!.error).toContain("missing-remote");
    expect(h.app.background.tasks.size).toBe(0);
  });

  test("about shows full stable/preview versions, channel, recorded predecessor and package-manager instructions", async () => {
    const h = await harness();
    const env = environment();
    mkdirSync(join(env.data, "versions", env.version), { recursive: true });
    symlinkSync(`versions/${env.version}`, join(env.data, "current"));
    writeFileSync(join(env.data, "versions", env.version, "previous.json"), JSON.stringify({ version: "0.5.0" }));
    h.app.updates.env = env;
    await h.keys("space", "a");
    expect(list(h.app).items.map((r) => r.label)).toEqual([
      "slipbox 0.5.1",
      "Channel: stable",
      "Previous version: 0.5.0",
    ]);
    expect(h.frame()).toContain("slipbox 0.5.1");
    expect(h.frame()).not.toContain("nothing here");
    await h.keys("escape");
    h.app.updates.available = "0.5.2";
    await h.app.run("app.about");
    expect(list(h.app).items.some((r) => r.data === "app.upgrade")).toBe(true);
    expect(h.app.updates.releaseNotes()).toBe("https://github.com/remziduzagac/slipbox/releases/tag/v0.5.2");
    h.app.updates.env = environment("0.5.2-preview.202610251200.gabcdef1", "homebrew");
    await h.app.run("app.about");
    const rows = list(h.app).items;
    expect(rows[0]!.label).toContain("202610251200.gabcdef1");
    expect(rows[1]!.label).toBe("Channel: preview");
    expect(rows.some((r) => r.label.includes("brew upgrade slipbox"))).toBe(true);
    expect(rows.some((r) => r.data === "app.upgrade")).toBe(false);
    h.app.updates.available = "0.5.3-preview.202610251201.gabcdef2";
    expect(h.app.updates.releaseNotes()).toEndWith("/tag/preview-202610251201-abcdef2");
  });
});
