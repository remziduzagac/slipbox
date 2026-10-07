// TUI bootstrap (3.1): locate the root, build the graph, start OpenTUI, route input to the app.
// Imported lazily by main.ts only when stdout and stdin are terminals (9.3).

import { createCliRenderer, type KeyEvent } from "@opentui/core";
import { flag, parseArgs } from "../cli/args.ts";
import { loadConfig } from "../core/config.ts";
import { openGraph } from "../core/graph.ts";
import { sanitize } from "../core/sanitize.ts";
import { setWidthMethod } from "../core/width.ts";
import { resolve } from "node:path";
import { locateVault, recordLocation, configFilesFor, setRootMarkers, VaultError, type VaultLocation } from "../core/vault.ts";
import { setTrustedRoots } from "../core/trust.ts";
import { App, type AppOptions } from "./app.ts";
import { keyName } from "./keys.ts";
import { AppRenderable, toRGBA } from "./opentui.ts";

/** What the App starts with, all found before the screen is taken. */
export type Start = Omit<AppOptions, "host">;

/**
 * Everything before the screen is taken: the root found (one that can't be is said in a line, and the
 * exit code returned), its config, the machine told it has seen the root — a named folder moved here by
 * hand adopting its state before the graph opens on it, and the App told it moved (21.8) — the graph.
 */
export function prepare(argv: string[]): Start | number {
  const args = parseArgs(argv);
  const path = args.positional[0];
  // Where roots are (21.1), and which may run their own code (23.x), are your config's to say,
  // `--config` included: read before finding one.
  const yours = loadConfig({ configFile: flag(args, "config") }).config;
  setRootMarkers(yours.walk.root_markers);
  setTrustedRoots(yours.trust.roots);
  let loc: VaultLocation;
  try {
    loc = locateVault({ root: flag(args, "root"), path });
  } catch (err) {
    // A path that isn't there, a --root that isn't one: said in a line, as the CLI says it, before
    // the screen is taken — and its exit code, the CLI's EXIT.notFound.
    if (!(err instanceof VaultError)) throw err;
    process.stderr.write(sanitize(`slipbox: ${err.message}\n`));
    return 3;
  }
  const loaded = loadConfig({ ...configFilesFor(loc), configFile: flag(args, "config") });
  const recorded = recordLocation(loc);
  const warnings = [...loaded.warnings];
  if (loc.note) warnings.push(loc.note);
  return {
    loc,
    config: loaded.config,
    graph: openGraph(loc, loaded.config, true, "lazy"),
    warnings,
    open: loc.file ?? null,
    themeName: flag(args, "theme"),
    configFile: flag(args, "config"),
    // A loose folder opened without a file (`slipbox ~`): the named folders first (17.14, 21.10).
    launcher: loc.mode === "folder" && !loc.file,
    // A folder of a root opened: the explorer starts there.
    folder: path && !loc.file ? resolve(path) : undefined,
    recorded,
  };
}

export async function runTui(argv: string[]): Promise<number> {
  const start = prepare(argv);
  if (typeof start === "number") return start;

  const renderer = await createCliRenderer({
    exitOnCtrlC: false,
    useMouse: start.config.ui.mouse,
    // Mouse movement drives hover highlighting on buttons, tabs and entries.
    enableMouseMovement: true,
    targetFps: 60,
    autoFocus: false,
  });

  let resolveDone: (code: number) => void = () => {};
  const done = new Promise<number>((r) => (resolveDone = r));

  const app = new App({
    ...start,
    host: {
      requestRender: () => renderer.requestRender(),
      // SLIPBOX_CLIPBOARD=file keeps copies off the real clipboard (core/clipboard.ts).
      osc52: (text) => process.env.SLIPBOX_CLIPBOARD !== "file" && renderer.copyToClipboardOSC52(text),
      quit: () => {
        renderer.destroy();
        resolveDone(0);
      },
      setTitle: (t) => renderer.setTerminalTitle(t),
      setMouse: (on) => {
        renderer.useMouse = on;
      },
      // The editor gets the terminal: the renderer stops drawing and reading keys until it exits.
      runForeground: (argv) => {
        renderer.suspend();
        try {
          const r = Bun.spawnSync({ cmd: argv, stdio: ["inherit", "inherit", "inherit"] });
          return r.exitCode ?? 1;
        } catch (err) {
          return (err as Error).message;
        } finally {
          renderer.resume();
          renderer.requestRender();
        }
      },
      // An editor elsewhere: no terminal of ours, not waited for.
      runDetached: async (argv) => {
        try {
          const p = Bun.spawn({ cmd: argv, stdio: ["ignore", "ignore", "ignore"] });
          return await p.exited;
        } catch (err) {
          return (err as Error).message;
        }
      },
    },
  });

  renderer.useMouse = app.ui.mouse;
  // Only when it changes: setBackgroundColor requests another render, so calling it on every
  // paint redraws the screen at the frame rate forever.
  let bg: string | null = null;
  // How the terminal counts a cluster's columns, as OpenTUI found it asking — an answer that may come
  // after the first frame: slipbox counts the same way, or rows drift inside the frame OpenTUI lays out.
  let counted: string | null = null;
  const view = new AppRenderable(renderer, (canvas) => {
    if (renderer.widthMethod !== counted) {
      counted = renderer.widthMethod;
      setWidthMethod(counted === "wcwidth" ? "wcwidth" : "unicode");
      app.widthsChanged();
    }
    if (app.theme.bg !== bg) {
      bg = app.theme.bg;
      renderer.setBackgroundColor(toRGBA(bg === "default" ? null : bg, false));
    }
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
  // Bracketed paste arrives as one event, not keys: into the list filter or prompt.
  renderer.keyInput.on("paste", (p: { bytes: Uint8Array }) => {
    app.paste(new TextDecoder().decode(p.bytes));
    renderer.requestRender();
  });
  renderer.on("resize", (w: number, h: number) => {
    app.resize(w, h);
    renderer.requestRender();
  });
  renderer.requestRender();

  // Every signal that ends the process saves positions and the session first.
  const onSignal = () => app.quit();
  const signals = ["SIGTERM", "SIGHUP", "SIGINT", "SIGQUIT", "SIGPIPE"] as const;
  for (const s of signals) process.once(s, onSignal);
  const code = await done;
  for (const s of signals) process.off(s, onSignal);
  return code;
}
