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
    const input =
      argv[0] === "clip.exe"
        ? Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, "utf16le")])
        : Buffer.from(text);
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
  if (isWsl())
    tools.push([
      "powershell.exe",
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Get-Clipboard -Raw",
    ]);
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

/** External clipboard helpers run asynchronously; callbacks keep their existing file/OSC 52 fallback. */
async function clipboardTool(
  argv: string[],
  input: Uint8Array | undefined,
  signal?: AbortSignal,
): Promise<string | null> {
  const { spawn } = await import("node:child_process");
  const bin = Bun.which(argv[0]!, { PATH: process.env.PATH ?? "" });
  if (!bin || signal?.aborted || (input?.byteLength ?? 0) > 32 * 1024 * 1024) return null;
  return new Promise<string | null>((resolve) => {
    const child = spawn(bin, argv.slice(1), {
      stdio: [input ? "pipe" : "ignore", input ? "ignore" : "pipe", "ignore"],
      detached: process.platform !== "win32",
    });
    let output: Buffer[] = [];
    let bytes = 0;
    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", stop);
      child.stdout?.destroy();
      child.stdin?.destroy();
      output = [];
      resolve(value);
    };
    const stop = () => {
      try {
        if (process.platform !== "win32" && child.pid) process.kill(-child.pid, "SIGKILL");
        else child.kill("SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
      finish(null);
    };
    const timer = setTimeout(stop, argv[0] === "powershell.exe" ? 5000 : 1000);
    signal?.addEventListener("abort", stop, { once: true });
    child.on("error", () => finish(null));
    child.on("close", (code) => finish(code === 0 ? Buffer.concat(output).toString("utf8") : null));
    child.stdout?.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > 32 * 1024 * 1024) stop();
      else output.push(chunk);
    });
    child.stdin?.on("error", () => stop());
    if (input) child.stdin?.write(input);
    child.stdin?.end();
    if (signal?.aborted) stop();
  }).catch(() => null);
}

export async function copyTextAsync(text: string, opts: CopyOptions & { signal?: AbortSignal }): Promise<CopyResult> {
  if (opts.signal?.aborted) return { methods: [], file: null, confirmed: false };
  if (process.env.SLIPBOX_CLIPBOARD === "file") return copyText(text, opts);
  const methods: string[] = [];
  const osc52 = opts.osc52 ?? osc52ToTty;
  if (osc52Sequence(text) && osc52(text)) methods.push("osc52");
  for (const tool of localTools()) {
    if (opts.signal?.aborted) break;
    const input =
      tool[0] === "clip.exe"
        ? Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, "utf16le")])
        : Buffer.from(text);
    if ((await clipboardTool(tool, input, opts.signal)) !== null)
      return { methods: [...methods, tool[0]!], file: null, confirmed: true };
  }
  if (methods.length || opts.signal?.aborted) return { methods, file: null, confirmed: false };
  const file = join(opts.fallbackDir, "clipboard.txt");
  atomicWrite(file, text);
  return { methods: ["file"], file, confirmed: false };
}

export async function readClipboardAsync(fallbackDir: string, signal?: AbortSignal): Promise<string | null> {
  if (process.env.SLIPBOX_CLIPBOARD === "file") return readClipboard(fallbackDir);
  for (const tool of readTools()) {
    if (signal?.aborted) return null;
    const result = await clipboardTool(tool, undefined, signal);
    if (result !== null) return tool[0] === "powershell.exe" ? fromPowerShell(result) : result;
  }
  return null;
}

/** Image bytes need a native clipboard helper; OSC 52 carries text only. */
export async function copyImage(path: string): Promise<string | null> {
  if (process.env.SLIPBOX_CLIPBOARD === "file") return null;
  const { extname } = await import("node:path");
  const { readRegular } = await import("./fsutil.ts");
  const ext = extname(path).toLowerCase();
  let mime = (
    {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".svg": "image/svg+xml",
      ".tif": "image/tiff",
      ".tiff": "image/tiff",
    } as Record<string, string>
  )[ext];
  let bytes: Buffer;
  try {
    bytes = readRegular(path, 32 * 1024 * 1024);
  } catch {
    return null;
  }
  // Remote images have hashed cache names without extensions.
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) mime = "image/png";
  else if (bytes[0] === 255 && bytes[1] === 216) mime = "image/jpeg";
  else if (/^GIF8[79]a/.test(bytes.subarray(0, 6).toString("ascii"))) mime = "image/gif";
  else if (bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP")
    mime = "image/webp";
  else if (/<svg(?:\s|>)/i.test(bytes.subarray(0, 2048).toString("utf8"))) mime = "image/svg+xml";
  if (!mime) return null;
  if (process.env.WAYLAND_DISPLAY && (await clipboardTool(["wl-copy", "--type", mime], bytes)) !== null)
    return "wl-copy";
  if (
    process.env.DISPLAY &&
    (await clipboardTool(["xclip", "-selection", "clipboard", "-t", mime, "-i"], bytes)) !== null
  )
    return "xclip";
  if (process.platform === "darwin" && ["image/png", "image/jpeg", "image/tiff"].includes(mime)) {
    const type = mime === "image/png" ? "PNGf" : mime === "image/jpeg" ? "JPEG" : "TIFF";
    const script = `on run argv
set the clipboard to (read POSIX file (item 1 of argv) as «class ${type}»)
end run`;
    if ((await clipboardTool(["osascript", "-e", script, path], undefined)) !== null) return "osascript";
  }
  return null;
}
