// Bun's own crash reports, turned off (D221). Bun's crash handler decides whether to send a report to bun.report
// when it crashes, reading `BUN_ENABLE_CRASH_REPORTING` (and `BUN_CRASH_REPORT_URL`) from the C environment — which
// `process.env` doesn't write to. So the switch is set through libc's own `setenv`, by FFI, first thing at start.
// slipbox's one network call is the update check (D199); a crash still prints Bun's link, to file a report yourself.

import { CString, dlopen, FFIType, type Pointer } from "bun:ffi";

/** The two variables Bun's crash handler reads: either one set by you is left as you set it. */
export const CRASH_SWITCHES = ["BUN_ENABLE_CRASH_REPORTING", "BUN_CRASH_REPORT_URL"] as const;

/** Where libc is, by platform: glibc's soname; musl's libc is its loader; macOS's is in libSystem. Tried in order. */
export function libcCandidates(platform: string = process.platform, arch: string = process.arch): string[] {
  if (platform === "darwin") return ["/usr/lib/libSystem.B.dylib", "libc.dylib"];
  if (platform === "linux") {
    const machine = arch === "x64" ? "x86_64" : arch === "arm64" ? "aarch64" : arch;
    return ["libc.so.6", `/lib/ld-musl-${machine}.so.1`, "libc.so"];
  }
  return [];
}

export interface Libc {
  getenv(name: string): string | null;
  setenv(name: string, value: string): boolean;
}

const cstr = (s: string): Buffer => Buffer.from(`${s}\0`);

let opened: Libc | null | undefined;

/** libc's `getenv` and `setenv`, the C environment's own; null when no candidate opens (FFI or libc missing). */
export function libc(): Libc | null {
  if (opened !== undefined) return opened;
  opened = null;
  for (const path of libcCandidates()) {
    try {
      const { symbols } = dlopen(path, {
        getenv: { args: [FFIType.ptr], returns: FFIType.ptr },
        setenv: { args: [FFIType.ptr, FFIType.ptr, FFIType.i32], returns: FFIType.i32 },
      });
      opened = {
        getenv: (name) => {
          const p = symbols.getenv(cstr(name));
          return p ? new CString(p as Pointer).toString() : null;
        },
        setenv: (name, value) => symbols.setenv(cstr(name), cstr(value), 1) === 0,
      };
      return opened;
    } catch {
      // the next candidate
    }
  }
  return opened;
}

/**
 * Turns Bun's crash reports off: `BUN_ENABLE_CRASH_REPORTING=0` in the C environment, unless you set it or
 * `BUN_CRASH_REPORT_URL` yourself (an empty one counts as unset). Silent when libc can't be reached.
 */
export function crashReportsOff(): void {
  try {
    const c = libc();
    if (!c) return;
    if (CRASH_SWITCHES.some((name) => (c.getenv(name) ?? "") !== "")) return;
    c.setenv("BUN_ENABLE_CRASH_REPORTING", "0");
  } catch {
    // reporting stays as Bun has it
  }
}
