// libc, reached through `bun:ffi` (D221): opened once a process, from the first candidate that opens, and kept. Bun's
// crash reports are switched off through it (crash-reports.ts), and a restart replaces the process through it
// (restart.ts: `execve`, `close_range`, `tcflush`, errno).

import { CString, dlopen, FFIType, type Pointer, read } from "bun:ffi";

/** Where libc is, by platform: glibc's soname; musl's libc is its loader; macOS's is in libSystem. Tried in order. */
export function libcCandidates(platform: string = process.platform, arch: string = process.arch): string[] {
  if (platform === "darwin") return ["/usr/lib/libSystem.B.dylib", "libc.dylib"];
  if (platform === "linux") {
    const machine = arch === "x64" ? "x86_64" : arch === "arm64" ? "aarch64" : arch;
    return ["libc.so.6", `/lib/ld-musl-${machine}.so.1`, "libc.so"];
  }
  return [];
}

/** What every libc slipbox reaches has. */
const COMMON = {
  getenv: { args: [FFIType.ptr], returns: FFIType.ptr },
  setenv: { args: [FFIType.ptr, FFIType.ptr, FFIType.i32], returns: FFIType.i32 },
  execve: { args: [FFIType.ptr, FFIType.ptr, FFIType.ptr], returns: FFIType.i32 },
  tcflush: { args: [FFIType.i32, FFIType.i32], returns: FFIType.i32 },
};

export interface Libc {
  /** The library opened: one of `libcCandidates`. */
  path: string;
  getenv(name: string): string | null;
  setenv(name: string, value: string): boolean;
  execve(file: Buffer, argv: BigUint64Array, envp: BigUint64Array): number;
  tcflush(fd: number, queue: number): number;
  /** Linux's `close_range` (glibc 2.34, Linux 5.11): null where it's missing. */
  closeRange: ((first: number, last: number, flags: number) => number) | null;
  /** errno now, from `__errno_location` (Linux) or `__error` (macOS); null when it can't be read. */
  errno(): number | null;
}

const cstr = (s: string): Buffer => Buffer.from(`${s}\0`);

/** One optional symbol of `path`, opened on its own: a libc without it is still a libc. */
function optional<T>(open: () => T): T | null {
  try {
    return open();
  } catch {
    return null;
  }
}

let opened: Libc | null | undefined;

/** libc, opened once; null when no candidate opens (FFI or libc missing). */
export function libc(): Libc | null {
  if (opened !== undefined) return opened;
  opened = null;
  for (const path of libcCandidates()) {
    let symbols: ReturnType<typeof dlopen<typeof COMMON>>["symbols"];
    try {
      symbols = dlopen(path, COMMON).symbols;
    } catch {
      continue; // the next candidate
    }
    const closeRange =
      process.platform === "linux"
        ? optional(
            () =>
              dlopen(path, { close_range: { args: [FFIType.u32, FFIType.u32, FFIType.i32], returns: FFIType.i32 } })
                .symbols.close_range,
          )
        : null;
    const errnoAt = optional(() =>
      process.platform === "darwin"
        ? dlopen(path, { __error: { args: [], returns: FFIType.ptr } }).symbols.__error
        : dlopen(path, { __errno_location: { args: [], returns: FFIType.ptr } }).symbols.__errno_location,
    );
    opened = {
      path,
      getenv: (name) => {
        const p = symbols.getenv(cstr(name));
        return p ? new CString(p as Pointer).toString() : null;
      },
      setenv: (name, value) => symbols.setenv(cstr(name), cstr(value), 1) === 0,
      execve: (file, argv, envp) => symbols.execve(file, argv, envp) as number,
      tcflush: (fd, queue) => symbols.tcflush(fd, queue) as number,
      closeRange: closeRange ? (first, last, flags) => closeRange(first, last, flags) : null,
      errno: () => {
        const at = errnoAt?.();
        return at ? read.i32(at as Pointer) : null;
      },
    };
    return opened;
  }
  return null;
}
