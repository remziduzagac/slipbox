// Clipboard (plan 8.5): OSC 52, then pbcopy / wl-copy / xclip, then write a file and print the path.
//
// OSC 52 is required, not optional: over SSH it is the only way to reach the *local* clipboard.
// It cannot be confirmed — terminals do not acknowledge it — so the result says so honestly.

import { closeSync, openSync, writeSync } from "node:fs";
import { join } from "node:path";
import { atomicWrite } from "./fsutil.ts";

/** Some terminals cap the OSC 52 payload; beyond this the file fallback is safer. */
export const OSC52_MAX_BASE64 = 100_000;

export interface CopyResult {
  methods: string[];
  /** Written when nothing else could take the text. */
  file: string | null;
  confirmed: boolean;
}

export function osc52Sequence(text: string): string | null {
  const b64 = Buffer.from(text, "utf8").toString("base64");
  if (b64.length > OSC52_MAX_BASE64) return null;
  return `\x1b]52;c;${b64}\x07`;
}

/** Write OSC 52 to the controlling terminal (never to stdout, which may be a pipe). */
export function osc52ToTty(text: string): boolean {
  const seq = osc52Sequence(text);
  if (!seq) return false;
  try {
    const fd = openSync("/dev/tty", "w");
    try {
      writeSync(fd, seq);
    } finally {
      closeSync(fd);
    }
    return true;
  } catch {
    return false;
  }
}

function localTools(): string[][] {
  const tools: string[][] = [];
  if (process.platform === "darwin") tools.push(["pbcopy"]);
  if (process.env.WAYLAND_DISPLAY) tools.push(["wl-copy"]);
  if (process.env.DISPLAY) tools.push(["xclip", "-selection", "clipboard"], ["xsel", "--clipboard", "--input"]);
  return tools;
}

function runTool(argv: string[], text: string): boolean {
  try {
    const bin = Bun.which(argv[0]!);
    if (!bin) return false;
    const r = Bun.spawnSync([bin, ...argv.slice(1)], { stdin: Buffer.from(text), stdout: "ignore", stderr: "ignore" });
    return r.exitCode === 0;
  } catch {
    return false;
  }
}

export interface CopyOptions {
  /** How to emit OSC 52; the TUI passes its own writer since it owns the terminal. */
  osc52?: (text: string) => boolean;
  /** Where to write the fallback file. */
  fallbackDir: string;
}

export function copyText(text: string, opts: CopyOptions): CopyResult {
  const methods: string[] = [];
  let confirmed = false;
  if ((opts.osc52 ?? osc52ToTty)(text)) methods.push("osc52");
  for (const tool of localTools()) {
    if (runTool(tool, text)) {
      methods.push(tool[0]!);
      confirmed = true;
      break;
    }
  }
  let file: string | null = null;
  if (!methods.length) {
    file = join(opts.fallbackDir, "clipboard.txt");
    atomicWrite(file, text);
    methods.push("file");
  }
  return { methods, file, confirmed };
}
