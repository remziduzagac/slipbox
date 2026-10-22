// TUI bootstrap (3.1): locate the root, build the graph, start OpenTUI, route input to the app.
// Imported lazily by main.ts only when stdout and stdin are terminals (9.3).

import { createCliRenderer, type KeyEvent } from "@opentui/core";
import { flag, parseArgs } from "../cli/args.ts";
import { loadConfig } from "../core/config.ts";
import { openGraph } from "../core/graph.ts";
import { sanitize } from "../core/sanitize.ts";
import { setWidthMethod } from "../core/width.ts";
import { appendFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { dataHome, stateHome } from "../core/paths.ts";
import { installedBy, readChannel } from "../core/install.ts";
import { RELEASE } from "../core/release.ts";
import { dailyUpdateCheck } from "../core/update.ts";
import { windowsDriveNote } from "../core/wsl.ts";
import { VERSION } from "../version.ts";
import {
  locateVault,
  recordLocation,
  configFilesFor,
  setRootMarkers,
  VaultError,
  type VaultLocation,
} from "../core/vault.ts";
import { setTrustedRoots } from "../core/trust.ts";
import { App, type AppOptions } from "./app.ts";
import { keyName } from "./keys.ts";
import type { Canvas } from "./canvas.ts";
import { AppRenderable, Pictures, toRGBA } from "./opentui.ts";

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
  // In WSL, notes on a Windows drive (14.12): what's noticed there, and what isn't, said once.
  const onWindows = windowsDriveNote(loc.root);
  if (onWindows) warnings.push(onWindows);
  return {
    loc,
    config: loaded.config,
    graph: openGraph(loc, loaded.config, true, "lazy"),
    warnings,
    open: loc.file ?? null,
    themeName: flag(args, "theme"),
    configFile: flag(args, "config"),
    // A folder opened: the explorer's view starts there, in its vault (VV-D5).
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
    // Pictures sent compressed (12.7): OpenTUI numbers them by the order they're drawn in, so one is sent again when
    // those above it in view change — a third of the bytes, measured scrolling the pictures demo.
    kittyImageTransport: "zlib",
  });

  let resolveDone: (code: number) => void = () => {};
  const done = new Promise<number>((r) => (resolveDone = r));
  const cell = () => {
    const r = renderer.resolution;
    return r && renderer.terminalWidth > 0 && renderer.terminalHeight > 0
      ? { width: r.width / renderer.terminalWidth, height: r.height / renderer.terminalHeight }
      : null;
  };
  // Pictures (12.x): drawn where the terminal speaks Kitty graphics or sixel, as OpenTUI found it asking. Kitty's as
  // Unicode placeholders (12.7): sent once through OpenTUI's own output — so in step with its frames (a private
  // method: checked at each OpenTUI upgrade) — then drawn as text.
  const write = (s: string) => void (renderer as unknown as { writeOut(chunk: string): boolean }).writeOut(s);
  const pictures = new Pictures(
    () => {
      const c = renderer.capabilities;
      return c?.kitty_graphics ? "kitty" : c?.sixel ? "sixel" : null;
    },
    { write, cell },
  );

  const app = new App({
    ...start,
    host: {
      requestRender: () => renderer.requestRender(),
      // SLIPBOX_CLIPBOARD=file keeps copies off the real clipboard (core/clipboard.ts).
      osc52: (text) => process.env.SLIPBOX_CLIPBOARD !== "file" && renderer.copyToClipboardOSC52(text),
      quit: () => {
        pictures.releaseAll();
        renderer.destroy();
        resolveDone(0);
      },
      setTitle: (t) => renderer.setTerminalTitle(t),
      images: {
        supported: () => pictures.protocol() !== null,
        size: (path) => pictures.size(path),
        cell,
        placeholders: () => pictures.usesPlaceholders(),
      },
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

  // A release's daily update check (14.4): your own config's say, never a folder's — a network request is yours to
  // allow — and DO_NOT_TRACK's. Said when there's a newer one; the CLI never asks. The installer's install follows its
  // channel (GR-D15); any other, stable releases.
  const yours = loadConfig({ configFile: start.configFile }).config;
  const by = installedBy(process.execPath, dataHome(), VERSION);
  void dailyUpdateCheck({
    release: RELEASE,
    version: VERSION,
    enabled: yours.update.check,
    env: process.env,
    stateFile: join(stateHome(), "update.json"),
    by,
    channel: by === "installer" ? readChannel(dataHome()) : "stable",
  }).then((said) => {
    if (said) app.message("info", said);
  });

  renderer.useMouse = app.ui.mouse;
  // Only when it changes: setBackgroundColor requests another render, so calling it on every
  // paint redraws the screen at the frame rate forever.
  let bg: string | null = null;
  // How the terminal counts a cluster's columns, as OpenTUI found it asking — an answer that may come
  // after the first frame: slipbox counts the same way, or rows drift inside the frame OpenTUI lays out.
  let counted: string | null = null;
  // Whether pictures are drawn, and at what cell size — answers that may come after the first frame: notes laid out
  // again when they do.
  const picturesNow = () => `${pictures.protocol() ?? "-"}:${JSON.stringify(cell())}`;
  let picturesSeen = picturesNow();
  // The terminal tests (SLIPBOX_TRACE), beside the commands run: a `key` line for every key and paste once handled,
  // a `frame` line for every frame painted. A test reads the screen once a frame follows its last key: a loaded
  // machine reads keys late, and draws late.
  const trace = process.env.SLIPBOX_TRACE;
  const handled = trace ? () => appendFileSync(trace, "key\n") : () => {};
  const painted = trace ? () => appendFileSync(trace, "frame\n") : () => {};
  const paint = (canvas: Canvas) => {
    if (renderer.widthMethod !== counted) {
      counted = renderer.widthMethod;
      setWidthMethod(counted === "wcwidth" ? "wcwidth" : "unicode");
      app.widthsChanged();
    }
    if (picturesNow() !== picturesSeen) {
      picturesSeen = picturesNow();
      app.pictures.changed();
    }
    if (app.theme.bg !== bg) {
      bg = app.theme.bg;
      renderer.setBackgroundColor(toRGBA(bg === "default" ? null : bg, false));
    }
    app.draw(canvas);
    painted();
  };
  const view = new AppRenderable(renderer, paint, pictures);
  renderer.root.add(view);
  view.onMouse = (e) => {
    app.mouse.handle({
      type: e.type,
      x: e.x,
      y: e.y,
      button: e.button,
      scroll: e.scroll,
      shift: e.modifiers?.shift,
      ctrl: e.modifiers?.ctrl,
    });
    renderer.requestRender();
  };
  renderer.keyInput.on("keypress", (k: KeyEvent) => {
    if (k.eventType === "release") return;
    void app.input.handleKey(keyName(k)).finally(handled);
  });
  // Bracketed paste arrives as one event, not keys: into the list filter or prompt.
  renderer.keyInput.on("paste", (p: { bytes: Uint8Array }) => {
    app.input.paste(new TextDecoder().decode(p.bytes));
    renderer.requestRender();
    handled();
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
