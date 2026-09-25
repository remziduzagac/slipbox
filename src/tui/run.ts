// TUI bootstrap (3.1): locate the vault, build the graph, start OpenTUI, route input to the app.
// Imported lazily by main.ts only when stdout and stdin are terminals (9.3).

import { createCliRenderer, type KeyEvent } from "@opentui/core";
import { flag, parseArgs } from "../cli/args.ts";
import { loadConfig } from "../core/config.ts";
import { openGraph } from "../core/graph.ts";
import { locateVault } from "../core/vault.ts";
import { App } from "./app.ts";
import { keyName } from "./keys.ts";
import { AppRenderable, toRGBA } from "./opentui.ts";

export async function runTui(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  const path = args.positional[0];
  const loc = locateVault({ root: flag(args, "root"), path });
  const loaded = loadConfig({ vaultRoot: loc.mode === "vault" ? loc.root : null, configFile: flag(args, "config") });
  const warnings = [...loaded.warnings];
  if (loc.note) warnings.push(loc.note);
  const graph = openGraph(loc, loaded.config, true, "lazy");
  const open = loc.file ?? null;

  const renderer = await createCliRenderer({
    exitOnCtrlC: false,
    useMouse: loaded.config.ui.mouse,
    // Mouse movement drives hover highlighting on buttons, tabs and entries.
    enableMouseMovement: true,
    targetFps: 60,
    autoFocus: false,
  });

  let resolveDone: (code: number) => void = () => {};
  const done = new Promise<number>((r) => (resolveDone = r));

  const app = new App({
    loc,
    config: loaded.config,
    graph,
    warnings,
    open,
    themeName: flag(args, "theme"),
    configFile: flag(args, "config"),
    host: {
      requestRender: () => renderer.requestRender(),
      osc52: (text) => renderer.copyToClipboardOSC52(text),
      quit: () => {
        renderer.destroy();
        resolveDone(0);
      },
      setTitle: (t) => renderer.setTerminalTitle(t),
      setMouse: (on) => {
        renderer.useMouse = on;
      },
    },
  });

  renderer.useMouse = app.ui.mouse;
  const view = new AppRenderable(renderer, (canvas) => {
    renderer.setBackgroundColor(toRGBA(app.theme.bg === "default" ? null : app.theme.bg, false));
    app.draw(canvas);
  });
  renderer.root.add(view);
  view.onMouse = (e) => {
    app.handleMouse({ type: e.type, x: e.x, y: e.y, button: e.button, scroll: e.scroll });
    renderer.requestRender();
  };
  renderer.keyInput.on("keypress", (k: KeyEvent) => {
    if (k.eventType === "release") return;
    void app.handleKey(keyName(k));
  });
  renderer.on("resize", (w: number, h: number) => {
    app.resize(w, h);
    renderer.requestRender();
  });
  const title = () => renderer.setTerminalTitle(`slipbox — ${app.view?.buf.key ?? loc.root}`);
  title();
  renderer.requestRender();

  const onSignal = () => app.quit();
  process.once("SIGTERM", onSignal);
  process.once("SIGHUP", onSignal);
  const code = await done;
  process.off("SIGTERM", onSignal);
  process.off("SIGHUP", onSignal);
  return code;
}
