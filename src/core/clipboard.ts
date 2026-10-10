// Clipboard (plan 8.5): OSC 52, then pbcopy / clip.exe (WSL, 14.12) / wl-copy / xclip, then write a file and print the
// path.
//
// OSC 52 is required, not optional: over SSH it is the only way to reach the *local* clipboard.
// It cannot be confirmed — terminals do not acknowledge it — so the result says so honestly.

import { closeSync, openSync, readFileSync, writeSync } from "node:fs";
import { join } from "node:path";
import { atomicWrite } from "./fsutil.ts";
import { isWsl } from "./wsl.ts";

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
  // WSL (14.12): Windows' own clipboard, reached whatever the Linux side has.
  if (isWsl()) tools.push(["clip.exe"]);
  if (process.env.WAYLAND_DISPLAY) tools.push(["wl-copy"]);
  if (process.env.DISPLAY) tools.push(["xclip", "-selection", "clipboard"], ["xsel", "--clipboard", "--input"]);
  return tools;
}

function runTool(argv: string[], text: string): boolean {
  try {
    // PATH as it is now (Bun.which alone reads the start-up one): a test's fake tools, never the real.
    const bin = Bun.which(argv[0]!, { PATH: process.env.PATH ?? "" });
    if (!bin) return false;
    // clip.exe reads its input in the console's code page, unless it starts with a byte-order mark: UTF-16 with one.
    const input = argv[0] === "clip.exe" ? Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, "utf16le")]) : Buffer.from(text);
    const r = Bun.spawnSync([bin, ...argv.slice(1)], { stdin: input, stdout: "ignore", stderr: "ignore" });
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
  // The same size cap whoever writes the sequence: terminals drop or choke on larger payloads,
  // and the local tools or the fallback file carry it instead.
  const fits = Buffer.byteLength(Buffer.from(text, "utf8").toString("base64")) <= OSC52_MAX_BASE64;
  // SLIPBOX_CLIPBOARD=file: never the real clipboard (the terminal's or the system's), only the
  // file — for tests, and anyone who wants that. A writer passed in is the caller's to honour it.
  const fileOnly = process.env.SLIPBOX_CLIPBOARD === "file";
  const osc52 = opts.osc52 ?? (fileOnly ? () => false : osc52ToTty);
  if (fits && osc52(text)) methods.push("osc52");
  for (const tool of fileOnly ? [] : localTools()) {
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

/** The tools that read the system clipboard, the counterparts of `localTools`. */
function readTools(): string[][] {
  const tools: string[][] = [];
  if (process.platform === "darwin") tools.push(["pbpaste"]);
  if (process.env.WAYLAND_DISPLAY) tools.push(["wl-paste", "--no-newline"]);
  if (process.env.DISPLAY) tools.push(["xclip", "-selection", "clipboard", "-o"], ["xsel", "--clipboard", "--output"]);
  // WSL (14.12): Windows' clipboard, by PowerShell — after the Linux side's, which answer faster where there are any.
  if (isWsl()) tools.push(["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Get-Clipboard -Raw"]);
  return tools;
}

/** What PowerShell printed of Windows' clipboard, as a note has it: the line it ends its output with gone, `\n` lines. */
export function fromPowerShell(out: string): string {
  return out.replace(/\r?\n$/, "").replace(/\r\n/g, "\n");
}

/**
 * The system clipboard's text (what `p` puts), or null when it can't be read: no tool answers
 * (over SSH, say) — the caller then uses its own register. With SLIPBOX_CLIPBOARD=file, the file
 * copies went to (tests never read the developer's clipboard).
 */
export function readClipboard(fallbackDir: string): string | null {
  if (process.env.SLIPBOX_CLIPBOARD === "file") {
    try {
      return readFileSync(join(fallbackDir, "clipboard.txt"), "utf8");
    } catch {
      return null;
    }
  }
  for (const tool of readTools()) {
    try {
      const bin = Bun.which(tool[0]!, { PATH: process.env.PATH ?? "" });
      if (!bin) continue;
      // PowerShell takes a while to start: given longer.
      const ps = tool[0] === "powershell.exe";
      const r = Bun.spawnSync([bin, ...tool.slice(1)], { stdout: "pipe", stderr: "ignore", timeout: ps ? 5000 : 1000 });
      if (r.exitCode === 0) {
        const text = new TextDecoder().decode(r.stdout);
        return ps ? fromPowerShell(text) : text;
      }
    } catch {}
  }
  return null;
}

