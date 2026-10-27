import { UNIT_TIMEOUT_MS } from "../../../support/timeouts.ts";
import { describe, expect, setDefaultTimeout, test } from "bun:test";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { copyText } from "../../../../src/core/foundation/platform/clipboard.ts";
import { makeCoreSandbox } from "../../../support/core-sandbox.ts";

// File-local default: tests/support/timeouts.ts.
setDefaultTimeout(UNIT_TIMEOUT_MS);
makeCoreSandbox();

describe("review round 3 (core)", () => {
  test("OSC 52 is capped whoever writes it; the fallback carries big copies", () => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-clip-"));
    let sent = 0;
    const big = "x".repeat(200_000);
    const r = copyText(big, { osc52: () => ((sent += 1), true), fallbackDir: dir });
    expect(sent).toBe(0);
    expect(r.methods.length).toBeGreaterThan(0);
  });
});

describe("clipboard (8.5): OSC 52, the system's tools, then the file", () => {
  /**
   * Fake clipboard tools on a PATH of their own — never the real ones — with the display variables
   * that pick them and SLIPBOX_CLIPBOARD as given (unset when not). A tool copying writes `board`
   * beside it, a tool pasting prints it; each says in `ran` that it ran, with its arguments.
   */
  const withTools = async (
    tools: Record<string, "copy" | "paste" | "fail" | "both">,
    env: { WAYLAND_DISPLAY?: string; DISPLAY?: string; SLIPBOX_CLIPBOARD?: string; WSL_DISTRO_NAME?: string },
    fn: (dir: string) => void | Promise<void>,
  ) => {
    const dir = mkdtempSync(join(tmpdir(), "slipbox-cliptools-"));
    const body = {
      copy: '/bin/cat > "${0%/*}/board"',
      paste: '/bin/cat "${0%/*}/board"',
      fail: "exit 1",
      both: 'case "$*" in *-o*) /bin/cat "${0%/*}/board" ;; *) /bin/cat > "${0%/*}/board" ;; esac',
    };
    for (const [name, kind] of Object.entries(tools)) {
      writeFileSync(join(dir, name), `#!/bin/sh\necho "\${0##*/} $*" >> "\${0%/*}/ran"\n${body[kind]}\n`);
      chmodSync(join(dir, name), 0o755);
    }
    const keys = ["PATH", "WAYLAND_DISPLAY", "DISPLAY", "SLIPBOX_CLIPBOARD", "WSL_DISTRO_NAME"] as const;
    const was = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
    const set = (k: string, v: string | undefined) => (v === undefined ? delete process.env[k] : (process.env[k] = v));
    process.env.PATH = dir;
    for (const k of keys.slice(1)) set(k, env[k as keyof typeof env]);
    try {
      await fn(dir);
    } finally {
      for (const k of keys) set(k, was[k]);
      rmSync(dir, { recursive: true, force: true });
    }
  };
  const ran = (dir: string) =>
    existsSync(join(dir, "ran")) ? readFileSync(join(dir, "ran"), "utf8").trim().split("\n") : [];

  test("a copy goes by OSC 52 and the first tool that takes it, confirmed; a paste reads it back the same way", async () => {
    const { copyText, readClipboard } = await import("../../../../src/core/foundation/platform/clipboard.ts");
    const out = mkdtempSync(join(tmpdir(), "slipbox-clip-"));
    // X11: xclip fails, xsel takes it.
    await withTools({ xclip: "fail", xsel: "both" }, { DISPLAY: ":0" }, (dir) => {
      const r = copyText("héllo\n", { osc52: () => true, fallbackDir: out });
      expect(r).toEqual({ methods: ["osc52", "xsel"], file: null, confirmed: true });
      expect(readFileSync(join(dir, "board"), "utf8")).toBe("héllo\n");
      expect(existsSync(join(out, "clipboard.txt"))).toBe(false); // no file when something took it
      expect(readClipboard(out)).toBe("héllo\n");
      expect(ran(dir)).toEqual([
        "xclip -selection clipboard",
        "xsel --clipboard --input",
        "xclip -selection clipboard -o",
        "xsel --clipboard --output",
      ]);
    });
    // Wayland first, when both are there: wl-copy takes it and xsel never runs.
    await withTools(
      { "wl-copy": "copy", "wl-paste": "paste", xsel: "both" },
      { WAYLAND_DISPLAY: "wayland-0", DISPLAY: ":0" },
      (dir) => {
        expect(copyText("w", { osc52: () => false, fallbackDir: out })).toEqual({
          methods: ["wl-copy"],
          file: null,
          confirmed: true,
        });
        expect(readClipboard(out)).toBe("w");
        expect(ran(dir)).toEqual(["wl-copy ", "wl-paste --no-newline"]);
      },
    );
    rmSync(out, { recursive: true, force: true });
  });

  test("in WSL (14.12): a copy reaches Windows by clip.exe, in UTF-16; a paste by PowerShell, when the Linux side's don't answer", async () => {
    const { copyText, readClipboard, fromPowerShell } = await import(
      "../../../../src/core/foundation/platform/clipboard.ts"
    );
    const out = mkdtempSync(join(tmpdir(), "slipbox-clip-"));
    // WSLg's X tools there too: clip.exe takes the copy first, Windows' own clipboard whatever the Linux side does.
    await withTools({ "clip.exe": "copy", xsel: "both" }, { WSL_DISTRO_NAME: "Ubuntu", DISPLAY: ":0" }, (dir) => {
      expect(copyText("héllo ✓\n", { osc52: () => false, fallbackDir: out })).toEqual({
        methods: ["clip.exe"],
        file: null,
        confirmed: true,
      });
      // A byte-order mark, then UTF-16: clip.exe reads it as it is, not in the console's code page.
      expect(readFileSync(join(dir, "board"))).toEqual(
        Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("héllo ✓\n", "utf16le")]),
      );
      expect(ran(dir)).toEqual(["clip.exe"]);
    });
    // A paste: PowerShell's Get-Clipboard, only when nothing on the Linux side answers; its CRLF lines made LF.
    await withTools({}, { WSL_DISTRO_NAME: "Ubuntu" }, (dir) => {
      writeFileSync(
        join(dir, "powershell.exe"),
        `#!/bin/sh\necho "\${0##*/} $*" >> "\${0%/*}/ran"\nprintf 'one\\r\\ntwo\\r\\n\\r\\n'\n`,
      );
      chmodSync(join(dir, "powershell.exe"), 0o755);
      expect(readClipboard(out)).toBe("one\ntwo\n");
      expect(ran(dir)).toEqual([
        "powershell.exe -NoProfile -NonInteractive -Command [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Get-Clipboard -Raw",
      ]);
    });
    await withTools({ "wl-paste": "paste" }, { WSL_DISTRO_NAME: "Ubuntu", WAYLAND_DISPLAY: "wayland-0" }, (dir) => {
      writeFileSync(join(dir, "board"), "from wayland");
      writeFileSync(join(dir, "powershell.exe"), '#!/bin/sh\necho powershell >> "${0%/*}/ran"\n');
      chmodSync(join(dir, "powershell.exe"), 0o755);
      expect(readClipboard(out)).toBe("from wayland");
      expect(ran(dir)).toEqual(["wl-paste --no-newline"]);
    });
    // Not WSL: neither is asked.
    await withTools({ "clip.exe": "copy" }, {}, (dir) => {
      expect(copyText("x", { osc52: () => false, fallbackDir: out }).methods).toEqual(["file"]);
      expect(ran(dir)).toEqual([]);
    });
    expect(fromPowerShell("a\r\nb\r\n")).toBe("a\nb");
    expect(fromPowerShell("a\r\n\r\n")).toBe("a\n");
    expect(fromPowerShell("")).toBe("");
    rmSync(out, { recursive: true, force: true });
  });

  test("no tool answers (over SSH): OSC 52 alone, unconfirmed; without it the file; a paste finds nothing", async () => {
    const { copyText, readClipboard } = await import("../../../../src/core/foundation/platform/clipboard.ts");
    const out = mkdtempSync(join(tmpdir(), "slipbox-clip-"));
    // A display, but none of its tools installed; then no display at all, a tool there unasked.
    for (const [tools, env] of [
      [{}, { DISPLAY: ":0", WAYLAND_DISPLAY: "w" }],
      [{ xclip: "both" as const }, {}],
    ] as const) {
      await withTools(tools, env, (dir) => {
        expect(copyText("over ssh", { osc52: () => true, fallbackDir: out })).toEqual({
          methods: ["osc52"],
          file: null,
          confirmed: false,
        });
        expect(existsSync(join(out, "clipboard.txt"))).toBe(false);
        expect(copyText("no terminal", { osc52: () => false, fallbackDir: out })).toEqual({
          methods: ["file"],
          file: join(out, "clipboard.txt"),
          confirmed: false,
        });
        expect(readFileSync(join(out, "clipboard.txt"), "utf8")).toBe("no terminal");
        expect(readClipboard(out)).toBeNull(); // the fallback file isn't the clipboard
        expect(ran(dir)).toEqual([]);
      });
      rmSync(join(out, "clipboard.txt"), { force: true });
    }
    rmSync(out, { recursive: true, force: true });
  });

  test("SLIPBOX_CLIPBOARD=file: never the terminal's or the system's clipboard, only the file, read back", async () => {
    const { copyText, readClipboard } = await import("../../../../src/core/foundation/platform/clipboard.ts");
    const out = mkdtempSync(join(tmpdir(), "slipbox-clip-"));
    await withTools(
      { xclip: "both", "wl-copy": "copy", "wl-paste": "paste" },
      { DISPLAY: ":0", WAYLAND_DISPLAY: "w", SLIPBOX_CLIPBOARD: "file" },
      (dir) => {
        expect(readClipboard(out)).toBeNull(); // nothing copied yet
        expect(copyText("only here", { fallbackDir: out })).toEqual({
          methods: ["file"],
          file: join(out, "clipboard.txt"),
          confirmed: false,
        });
        expect(readClipboard(out)).toBe("only here");
        expect(ran(dir)).toEqual([]);
      },
    );
    rmSync(out, { recursive: true, force: true });
  });

  test("the OSC 52 sequence: the text in base64, capped where terminals choke — the cap's own size still sent", async () => {
    const { copyText, osc52Sequence, osc52ToTty, OSC52_MAX_BASE64 } = await import(
      "../../../../src/core/foundation/platform/clipboard.ts"
    );
    expect(osc52Sequence("hé")).toBe(`\x1b]52;c;${Buffer.from("hé").toString("base64")}\x07`);
    const atCap = "x".repeat((OSC52_MAX_BASE64 / 4) * 3); // exactly the cap in base64
    expect(osc52Sequence(atCap)).not.toBeNull();
    expect(osc52Sequence(`${atCap}x`)).toBeNull();
    expect(osc52ToTty(`${atCap}x`)).toBe(false); // too big: the terminal is never written
    const out = mkdtempSync(join(tmpdir(), "slipbox-clip-"));
    const sent: number[] = [];
    copyText(atCap, { osc52: (t) => (sent.push(t.length), true), fallbackDir: out });
    expect(sent).toEqual([atCap.length]);
    rmSync(out, { recursive: true, force: true });
  });
});
