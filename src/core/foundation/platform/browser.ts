// A browser opened on an address (RPT-D3): the platform's own way, as an argument vector (13.2) — `open` on macOS;
// in WSL, `wslview`, else Windows' `explorer.exe`; elsewhere `xdg-open`, when there's a display. None over SSH: it
// would open on that machine, not yours. The one place slipbox opens a browser, because it's what you chose: a link
// in a note is still copied, never opened (design/tui.md § Following links).

import { overSsh } from "../../application/distribution/report.ts";
import { isWsl } from "./wsl.ts";

export interface Opener {
  /** The program, as it's said: `xdg-open`. */
  name: string;
  argv: (url: string) => string[];
  /** The exit codes that mean it opened: `explorer.exe` answers 1 when it worked. */
  ok: number[];
}

export interface OpenerSources {
  env: Record<string, string | undefined>;
  platform: string;
  wsl: boolean;
  /** OpenTUI found it's over SSH. */
  remote: boolean;
  onPath: (program: string) => boolean;
}

export function openerSources(over: Partial<OpenerSources> = {}): OpenerSources {
  const env = over.env ?? process.env;
  return {
    env,
    platform: process.platform,
    wsl: isWsl(env),
    remote: false,
    // PATH as it is now (Bun.which alone reads the start-up one).
    onPath: (p) => !!Bun.which(p, { PATH: env.PATH ?? "" }),
    ...over,
  };
}

const program = (name: string, ok = [0]): Opener => ({ name, argv: (url) => [name, url], ok });

/** How this machine opens a browser, or null when it can't here: over SSH, without a display, without an opener. */
export function browserOpener(s: OpenerSources = openerSources()): Opener | null {
  if (overSsh(s.env) || s.remote) return null;
  if (s.platform === "darwin") return program("open");
  if (s.wsl) {
    if (s.onPath("wslview")) return program("wslview");
    return s.onPath("explorer.exe") ? program("explorer.exe", [0, 1]) : null;
  }
  if (!s.env.DISPLAY && !s.env.WAYLAND_DISPLAY) return null;
  return s.onPath("xdg-open") ? program("xdg-open") : null;
}
