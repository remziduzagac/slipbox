// TUI bootstrap (3.1): locate the root, build the graph, start OpenTUI, route input to the app.
// Imported lazily by main.ts only when stdout and stdin are terminals (9.3).

import { type CliRenderer, createCliRenderer, type KeyEvent, NativeSession } from "@opentui/core";
import { flag, parseArgs } from "../../../cli/args.ts";
import { loadConfig } from "../../../core/application/config/config.ts";
import { Graph, openGraph } from "../../../core/workspace/graph/graph.ts";
import { sanitize } from "../../../core/foundation/text/sanitize.ts";
import { setWidthMethod } from "../../../core/foundation/text/width.ts";
import { statSync, writeSync } from "node:fs";
import { join, resolve } from "node:path";
import { dataHome, stateHome } from "../../../core/foundation/platform/paths.ts";
import { installedBy, readChannel } from "../../../core/application/distribution/install.ts";
import { RELEASE } from "../../../core/application/distribution/release.ts";
import { upgrade, upgradeSaid } from "../../../core/application/distribution/update.ts";
import { handOver, nextLaunch, startedPath, takeNote } from "../../../core/application/distribution/restart.ts";
import { windowsDriveNote } from "../../../core/foundation/platform/wsl.ts";
import { VERSION } from "../../../version.ts";
import {
  elsewhereAt,
  homeAt,
  isHome,
  isVaultRoot,
  recordLocation,
  rootAt,
  configFilesFor,
  setRootMarkers,
  VaultError,
  type VaultLocation,
} from "../../../core/workspace/vaults/vault.ts";
import { setTrustedRoots } from "../../../core/workspace/vaults/trust.ts";
import { baseAtOpen } from "../../../core/workspace/git/gitbase.ts";
import { App, type AppOptions } from "../../app/runtime/app.ts";
import { type CameBack, cameBack, type Place } from "../../app/distribution/updates.ts";
import { keyName } from "../input/keys.ts";
import type { Canvas } from "./canvas.ts";
import { AppRenderable, Pictures, toRGBA } from "./opentui.ts";
import { checkNewFile, openingPath } from "./open-path.ts";
import { FrameTrace } from "./trace.ts";

/** What the App starts with, all found before the screen is taken. */
export type Start = Omit<AppOptions, "host">;

/** Where a restart left off (UPG-D4), when it's still there: its vault, home, or Elsewhere's folder. */
function placed(p: Place): VaultLocation | null {
  try {
    if (!statSync(p.root).isDirectory()) return null;
  } catch {
    return null;
  }
  if (p.mode === "home") return isHome(p.root) ? homeAt(p.root) : null;
  if (p.mode === "folder") return elsewhereAt(p.root);
  return isVaultRoot(p.root) ? rootAt(p.root) : null;
}

/**
 * Everything before the screen is taken: the root found (one that can't be is said in a line, and the
 * exit code returned), its config, the machine told it has seen the root — a named folder moved here by
 * hand adopting its state before the graph opens on it, and the App told it moved (21.8) — the graph.
 * Started by a restart (`back`, UPG-D4): where it left off, in place of the arguments' path and `--root`, its window's
 * session, and `--base` not applied again — a start's instruction, already kept for its branch.
 */
export function prepare(argv: string[], back: CameBack | null = null): Start | number {
  const args = parseArgs(argv);
  const path = args.positional[0];
  // Where roots are (21.1), and which may run their own code (23.x), are your config's to say,
  // `--config` included: read before finding one.
  const yours = loadConfig({ configFile: flag(args, "config") }).config;
  setRootMarkers(yours.walk.root_markers);
  setTrustedRoots(yours.trust.roots);
  const at = back?.place ? placed(back.place) : null;
  let loc: VaultLocation;
  let opening: ReturnType<typeof openingPath> | null = null;
  try {
    opening = at ? null : openingPath(path, flag(args, "root"));
    loc = at ?? opening!.loc;
  } catch (err) {
    // A missing directory or invalid --root: said in a line, as the CLI says it, before
    // the screen is taken — and its exit code, the CLI's EXIT.notFound.
    if (!(err instanceof VaultError)) throw err;
    process.stderr.write(sanitize(`slipbox: ${err.message}\n`));
    return 3;
  }
  const loaded = loadConfig({ ...configFilesFor(loc), configFile: flag(args, "config") });
  try {
    if (opening?.newFile) checkNewFile(loc, loaded.config);
  } catch (err) {
    if (!(err instanceof VaultError)) throw err;
    process.stderr.write(sanitize(`slipbox: ${err.message}\n`));
    return 3;
  }
  const warnings = [...loaded.warnings];
  const notes: string[] = [];
  // `--base <ref>` (GIT-D10, D255): the branch here measured against it, kept as "Compare against…" keeps it. A ref
  // that names no commit is said in a line, as a missing path is, before the screen is taken.
  const base = at ? undefined : flag(args, "base");
  if (base !== undefined) {
    const kept = baseAtOpen(loc.root, base);
    if ("error" in kept) {
      process.stderr.write(sanitize(`slipbox: ${kept.error}\n`));
      return 3;
    }
    if ("warn" in kept) warnings.push(kept.warn);
    else notes.push(kept.note);
  }
  const recorded = recordLocation(loc);
  if (loc.note) warnings.push(loc.note);
  // In WSL, notes on a Windows drive (14.12): what's noticed there, and what isn't, said once.
  const onWindows = windowsDriveNote(loc.root);
  if (onWindows) warnings.push(onWindows);
  return {
    loc,
    config: loaded.config,
    // Home's built by the screen as it starts, once, with what it asks for: the folder opened, its tabs' (VV-D2). Any
    // other's before the screen is taken.
    graph: loc.mode === "home" ? new Graph(loc, loaded.config) : openGraph(loc, loaded.config, true, "lazy"),
    warnings,
    notes,
    open: at ? null : (loc.file ?? null),
    newFile: opening?.newFile,
    themeName: flag(args, "theme"),
    configFile: flag(args, "config"),
    // A folder opened: the explorer's view starts there, in its vault (VV-D5); a restart's, home's folder it had open.
    folder: at
      ? at.mode === "home" && back?.place?.homeFolder
        ? join(at.root, back.place.homeFolder)
        : undefined
      : opening?.folder
        ? opening.folder
        : path && !loc.file
          ? resolve(path)
          : undefined,
    recorded,
    ...(back ? { restarted: { session: at ? back.session : null, said: back.said } } : {}),
  };
}

/** Whether this is a compiled binary: its modules are inside it (`bun build --compile`'s file system). */
const COMPILED = /^file:\/\/\/(\$bunfs|[A-Za-z]:\/~BUN)\//.test(import.meta.url);

/**
 * How long OpenTUI may take to give the terminal back at quit. Its teardown goes out behind what's queued before it —
 * a picture's megabytes take seconds over a slow link — and once this has passed OpenTUI cancels the rest, teardown and
 * all (its own wait is a second).
 */
export const CLOSE_WAIT_MS = 10_000;

/**
 * The terminal given back when OpenTUI's teardown didn't go out: a string terminator, ending a picture's sequence cut
 * short, and the end of a frame cut short (synchronized output); then OpenTUI's own teardown as 0.6.8 writes it — the
 * cursor shown, attributes and the pointer's shape reset, the keyboard's protocol undone (Kitty's popped, or xterm's
 * modifyOtherKeys reset), mouse reporting, bracketed paste and focus reports off, the main screen back, palette reports
 * off, the title, the cursor's colour and shape reset. Each undoes what OpenTUI's setup turns on, and does nothing
 * where it didn't; grapheme clustering (2027) stays on, as OpenTUI's own teardown leaves it. A test holds this to what
 * OpenTUI writes, so an upgrade that changes that says so.
 */
export const RESTORE =
  "\x1b\\\x1b[?2026l" +
  "\x1b[?25h\x1b[0m\x1b]22;\x1b\\\x1b[<u\x1b[>4;0m\x1b[?1003l\x1b[?1002l\x1b[?1000l\x1b[?1006l\x1b[?2004l\x1b[?1004l" +
  "\x1b[?1049l\x1b[?2031l\x1b]0;\x07\x1b]12;default\x07\x1b]112\x07\x1b[0 q\x1b[?25h";

/** `text` to the terminal now, after whatever it was sent: a slow one waited for (a while), one gone left be. */
function toTerminal(text: string): void {
  const bytes = Buffer.from(text);
  const until = Date.now() + 2_000;
  for (let at = 0; at < bytes.length; ) {
    try {
      at += writeSync(1, bytes, at);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EAGAIN" || Date.now() > until) return;
      Bun.sleepSync(5);
    }
  }
}

/**
 * OpenTUI's renderer as slipbox runs it (on the process's terminal unless given others), the output it writes through,
 * and `closed`: settled once the terminal is given back, by OpenTUI's teardown or else by `restore` writing RESTORE.
 */
export async function openRenderer(o: {
  mouse: boolean;
  stdin?: NodeJS.ReadStream;
  stdout?: NodeJS.WriteStream;
  closeWaitMs?: number;
  restore?: (text: string) => void;
}): Promise<{ session: NativeSession; renderer: CliRenderer; closed: Promise<void> }> {
  const stdout = o.stdout ?? process.stdout;
  // The output OpenTUI writes its frames through, made here (as it would make it) so that slipbox holds it: Kitty's
  // pictures are sent through it, in order with the frames (12.7).
  const session = new NativeSession(stdout, { closeTimeoutMs: o.closeWaitMs ?? CLOSE_WAIT_MS });
  const renderer = await createCliRenderer({
    ...(o.stdin ? { stdin: o.stdin } : {}),
    stdout,
    nativeSession: session,
    exitOnCtrlC: false,
    useMouse: o.mouse,
    // Mouse movement drives hover highlighting on buttons, tabs and entries.
    enableMouseMovement: true,
    targetFps: 60,
    autoFocus: false,
    // Pictures sent compressed (12.7): OpenTUI numbers them by the order they're drawn in, so one is sent again when
    // those above it in view change — a third of the bytes, measured scrolling the pictures demo.
    kittyImageTransport: "zlib",
  });
  // Raw mode is off as `destroy()` returns; the rest of OpenTUI's teardown — the main screen back, the mouse let go — is
  // written after it. `closed` resolves once that's out, and rejects when it isn't: the terminal failed, or
  // CLOSE_WAIT_MS passed and OpenTUI cancelled what was left, the terminal not restored. Then it's restored here.
  const restore = o.restore ?? toTerminal;
  const closed = renderer.closed.catch(() => {
    try {
      restore(RESTORE);
    } catch {
      // the terminal gone: nothing to give back
    }
  });
  return { session, renderer, closed };
}

export async function runTui(argv: string[]): Promise<number> {
  // A restart's note (UPG): where to come back to, and this window's session.
  const note = takeNote({ pid: process.pid, ppid: process.ppid });
  const start = prepare(argv, note ? cameBack(note, VERSION) : null);
  if (typeof start === "number") return start;
  // The file slipbox was started by, as the shell found it, asked before anything changes: a restart starts it again.
  const startedBy = startedPath(process.argv0, process.env.PATH ?? "", process.cwd());

  const { session, renderer, closed } = await openRenderer({ mouse: start.config.ui.mouse });
  let resolveDone: (code: number) => void = () => {};
  const done = new Promise<number>((r) => (resolveDone = r));
  const cell = () => {
    const r = renderer.resolution;
    return r && renderer.terminalWidth > 0 && renderer.terminalHeight > 0
      ? { width: r.width / renderer.terminalWidth, height: r.height / renderer.terminalHeight }
      : null;
  };
  // Pictures (12.x): drawn where the terminal speaks Kitty graphics or sixel, as OpenTUI found it asking. Kitty's as
  // Unicode placeholders (12.7): sent once through OpenTUI's own output — so in step with its frames — then drawn as
  // text. Output that's full takes nothing: the picture is sent at a frame drawn once it has room. (One is at most a
  // million pixels, the paint worker's cap: always less than the output can hold.)
  const encoder = new TextEncoder();
  const write = (s: string) => {
    try {
      if (session.write(encoder.encode(s))) return true;
    } catch {
      return false; // the renderer stopped or gone: no frame to send it with
    }
    if (!renderer.isDestroyed)
      void session.idle().then(
        () => renderer.requestRender(),
        () => {},
      );
    return false;
  };
  const pictures = new Pictures(
    () => {
      const c = renderer.capabilities;
      return c?.kitty_graphics ? "kitty" : c?.sixel ? "sixel" : null;
    },
    { write, cell },
  );

  const app = new App({
    ...start,
    // The explorer's folders listed and the watcher's looks off the main thread (T12, SD-T3): a slow disk never
    // freezes the screen.
    listOffThread: true,
    host: {
      requestRender: () => renderer.requestRender(),
      // SLIPBOX_CLIPBOARD=file keeps copies off the real clipboard (core/foundation/platform/clipboard.ts).
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
      // The editor gets the terminal: the renderer stops drawing and reading keys until it exits. Each step is the
      // terminal written to, and waited for: the main screen back before the editor starts, slipbox's after.
      runForeground: async (argv) => {
        try {
          await renderer.suspend();
        } catch (err) {
          return (err as Error).message;
        }
        try {
          const r = Bun.spawnSync({ cmd: argv, stdio: ["inherit", "inherit", "inherit"] });
          return r.exitCode ?? 1;
        } catch (err) {
          return (err as Error).message;
        } finally {
          await renderer.resume();
          renderer.requestRender();
        }
      },
      // A report's facts (RPT): what the terminal answered, as OpenTUI found it asking — copied, so nothing else
      // touches OpenTUI. Its name only from XTVERSION (else it's TERM_PROGRAM's, said apart); its "none" no finding.
      terminal: () => {
        const c = renderer.capabilities;
        if (!c) return null;
        const t = c.terminal;
        const xt = !!t?.from_xtversion;
        return {
          name: xt ? t.name || null : null,
          version: xt ? t.version || null : null,
          multiplexer: c.multiplexer === "none" || c.multiplexer === "unknown" ? null : c.multiplexer,
          remote: !!c.remote,
        };
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
  // allow — and DO_NOT_TRACK's. Offered when there's a newer one (UPG); the CLI never asks. The installer's install
  // follows its channel (GR-D15); any other, stable releases.
  const by = installedBy(process.execPath, dataHome(), VERSION);
  app.updates.env = {
    release: RELEASE,
    version: VERSION,
    by,
    channel: by === "installer" ? readChannel(dataHome()) : "stable",
    data: dataHome(),
    execPath: process.execPath,
    startedBy,
    stateDir: stateHome(),
    env: process.env,
    checkOn: () => loadConfig({ configFile: start.configFile }).config.update.check,
  };
  app.updates.start();

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
  // The terminal tests (SLIPBOX_TRACE, trace.ts), beside the commands run: a line for every key and paste once
  // handled, and one for every frame written, marked in the output after it. A test reads the screen once its terminal
  // has read the mark of a frame painted after its last key: a loaded machine reads keys late, draws late, and the
  // terminal reads what was written later still.
  const trace = process.env.SLIPBOX_TRACE
    ? new FrameTrace(process.env.SLIPBOX_TRACE, {
        write: (bytes) => session.write(bytes),
        idle: () => session.idle(),
        gone: () => renderer.isDestroyed,
      })
    : null;
  const handled = () => trace?.key();
  const painted = () => trace?.paint();
  // The whole of it one frame painted: a message said in any of it asks for no other (`App.whileDrawing`).
  const paint = (canvas: Canvas) =>
    app.whileDrawing(() => {
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
    });
  const view = new AppRenderable(renderer, paint, pictures, (e) => {
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
  });
  renderer.root.add(view);
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
  if (trace) renderer.on("frame", () => trace.frame());
  renderer.requestRender();

  // Every signal that ends the process saves positions and the session first.
  const onSignal = () => app.quit();
  const signals = ["SIGTERM", "SIGHUP", "SIGINT", "SIGQUIT", "SIGPIPE"] as const;
  for (const s of signals) process.once(s, onSignal);
  const code = await done;
  for (const s of signals) process.off(s, onSignal);
  // The screen given back before slipbox ends, or says anything more.
  await closed;
  const restart = app.updates.restartNote;
  const env = app.updates.env;
  if (!restart || !env) return code;
  // A restart (UPG-D2): the upgrade asked for, then the next slipbox in this process.
  await new Promise((r) => setTimeout(r, 0));
  process.stdin.pause();
  const release = RELEASE;
  return handOver({
    note: restart,
    upgrade:
      restart.upgrade && release
        ? (signal) =>
            upgrade({
              release,
              version: VERSION,
              data: env.data,
              execPath: process.execPath,
              env: process.env,
              signal,
            }).then((r) => `${upgradeSaid(r, env.channel)}${r.skills ? `\n${r.skills}` : ""}`)
        : null,
    launch: (upgradeFailed) =>
      nextLaunch({
        by: env.by,
        data: env.data,
        execPath: process.execPath,
        argv0: process.argv0,
        startedBy,
        script: COMPILED ? null : (process.argv[1] ?? null),
        upgradeFailed,
        args: process.argv.slice(2),
      }),
    env: process.env,
    say: (line) => process.stderr.write(sanitize(`${line}\n`)),
  });
}
