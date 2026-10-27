import { afterAll, expect } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { canonKey } from "../../../src/core/application/commands/registry.ts";
import { DEFAULT_CONFIG } from "../../../src/core/application/config/config.ts";
import { openGraph } from "../../../src/core/workspace/graph/graph.ts";

import { locateVault } from "../../../src/core/workspace/vaults/vault.ts";
import { App } from "../../../src/tui/app/runtime/app.ts";
import { TextCanvas } from "../../../src/tui/shell/terminal/canvas.ts";

/** The original Git-panel fixture, registered for the calling test file alone. */
export function makeGitPanelFixture() {
  const sandbox = mkdtempSync(join(tmpdir(), "slipbox-gitpanel-"));

  const saved = { ...process.env };

  process.env.XDG_STATE_HOME = join(sandbox, "state");

  process.env.XDG_CACHE_HOME = join(sandbox, "cache");

  process.env.XDG_CONFIG_HOME = join(sandbox, "config");

  process.env.XDG_DATA_HOME = join(sandbox, "data");

  process.env.SLIPBOX_CLIPBOARD = "file";

  delete process.env.SLIPBOX_CONFIG;

  afterAll(() => {
    for (const k of ["XDG_STATE_HOME", "XDG_CACHE_HOME", "XDG_CONFIG_HOME", "XDG_DATA_HOME", "SLIPBOX_CLIPBOARD"])
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    rmSync(sandbox, { recursive: true, force: true });
  });

  const git = (cwd: string, ...args: string[]) =>
    spawnSync("git", ["-c", "user.email=t@example.invalid", "-c", "user.name=t", "-C", cwd, ...args], {
      encoding: "utf8",
    }).stdout;

  /** A repository of two notes, committed on main; `feature` a branch with a commit of its own, checked out. */
  function repo(): string {
    const root = mkdtempSync(join(sandbox, "repo-"));
    mkdirSync(join(root, ".slipbox"));
    writeFileSync(join(root, ".gitignore"), ".slipbox/\n");
    writeFileSync(join(root, "a.md"), "# A\n\none\n");
    writeFileSync(join(root, "b.md"), "# B\n");
    git(root, "init", "-q", "-b", "main");
    // Who commits from the app: git won't without a name.
    git(root, "config", "user.email", "t@example.invalid");
    git(root, "config", "user.name", "t");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "start");
    git(root, "switch", "-q", "-c", "feature");
    writeFileSync(join(root, "c.md"), "# C\n");
    git(root, "add", "c.md");
    git(root, "commit", "-q", "-m", "c");
    return root;
  }

  const until = async (ok: () => boolean, ms = 10_000) => {
    for (const t = Date.now(); !ok() && Date.now() - t < ms; ) await Bun.sleep(20);
    return ok();
  };

  /** The app on `root`, `open` open, the git panel open and focused (unless `show` is false), git's answer in. */
  async function panel(root: string, open: string | null = "a.md", show = true, width = 140) {
    const config = structuredClone(DEFAULT_CONFIG);
    config.ui.restore_session = false;
    config.lint.enabled = "off";
    config.search.engine = "scan";
    config.index.background = false;
    config.render.glyphs = "unicode";
    config.ui.sidebar_width = 44;
    const loc = locateVault({ root });
    const app = new App({
      loc,
      config,
      graph: openGraph(loc, config, false),
      host: { requestRender() {}, osc52: () => true, quit: () => {}, fetch: () => Promise.reject(new Error("no")) },
      open,
      watch: false,
    });
    const frame = () => {
      const c = new TextCanvas(width, 40);
      app.draw(c);
      return c.toString();
    };
    const keys = async (...ks: string[]) => {
      for (const k of ks) {
        await app.input.handleKey(canonKey(k));
        frame();
      }
    };
    /** A click where the last frame drew the hot region `id`: SGR's press and release, button 0 (2 the right one). */
    const click = (id: string, button = 0) => {
      frame();
      const h = app.geometry!.hot.find((x) => x.id === id);
      expect(h).toBeDefined();
      app.mouse.handle({ type: "down", x: h!.x, y: h!.y, button });
      app.mouse.handle({ type: "up", x: h!.x, y: h!.y, button });
      frame();
    };
    if (show) await app.run("git.view");
    await app.git.refreshNow();
    frame();
    return { app, frame, keys, click };
  }

  /** Typed, a key a character (a space by its name). */
  const typed = (text: string) => [...text].map((c) => (c === " " ? "space" : c));

  /** The panel's row of a kind and label (or a file's path), by its index. */
  const rowOf = (app: App, test: (r: ReturnType<App["gitPanel"]["rows"]>[number]) => boolean) =>
    app.gitPanel.rows().findIndex(test);

  return { sandbox, git, repo, until, panel, typed, rowOf };
}
