// Export output staged privately: the worker streams here; only its owner publishes into the destination (10.x).
import { randomUUID } from "node:crypto";
import { closeSync, constants, mkdirSync, openSync, readdirSync, rmSync, writeSync } from "node:fs";
import { mkdir, mkdtemp, open, rename, rm, stat } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { climbsOut } from "../../foundation/platform/fsutil.ts";
import { ensureCacheHome } from "../../foundation/platform/paths.ts";
import { alive } from "../../foundation/platform/processes.ts";

// Normal process exit (including the TUI's immediate quit) must not leave document copies behind.
const privatePaths = new Set<string>();
let exitHook = false;
function track(path: string): void {
  privatePaths.add(path);
  if (!exitHook) {
    exitHook = true;
    process.once("exit", () => {
      for (const owned of privatePaths) {
        try {
          rmSync(owned, { recursive: true, force: true });
        } catch {}
      }
    });
  }
}

/** What a slipbox that ended without its exit hook (killed, crashed) left in `exports/`: named by its process, which is
 *  gone, so it goes now. Once a process. */
let swept = false;
function sweep(exports: string): void {
  if (swept) return;
  swept = true;
  try {
    for (const name of readdirSync(exports)) {
      const pid = Number(/^(\d+)-/.exec(name)?.[1]);
      if (pid && pid !== process.pid && !alive(pid)) rmSync(join(exports, name), { recursive: true, force: true });
    }
  } catch {}
}

export const EXPORT_CHUNK = 64 * 1024;
export type ExportSink = (chunk: Uint8Array) => void;
export interface ExportManifest {
  bytes: number;
  files: { path: string; bytes: number }[];
}

/** A sink writes through one fixed-size window, including partial writes; it never queues document bytes in JS. */
export function fileSink(file: string): { write: ExportSink; close: () => void; bytes: () => number } {
  const fd = openSync(file, "wx", 0o600);
  let size = 0;
  let closed = false;
  return {
    write(chunk) {
      if (closed) throw Error("export sink closed");
      let at = 0;
      while (at < chunk.byteLength) {
        const n = writeSync(fd, chunk, at, Math.min(EXPORT_CHUNK, chunk.byteLength - at));
        if (!n) throw Error("export write made no progress");
        at += n;
        size += n;
      }
    },
    bytes: () => size,
    close() {
      if (closed) return;
      closed = true;
      closeSync(fd);
    },
  };
}

/** Only worker-generated numeric names reach the spool; attachment paths are used at publication, never here. */
export class ExportSpool {
  readonly manifest: ExportManifest = { bytes: 0, files: [] };
  constructor(readonly dir: string) {}
  async document(write: (sink: ExportSink) => Promise<void>): Promise<void> {
    const file = fileSink(join(this.dir, "document"));
    try {
      await write(file.write);
      this.manifest.bytes = file.bytes();
    } finally {
      file.close();
    }
  }
  attachment(path: string, write: (sink: ExportSink) => void): void {
    const file = fileSink(join(this.dir, `asset-${this.manifest.files.length}`));
    try {
      write(file.write);
      this.manifest.files.push({ path, bytes: file.bytes() });
    } finally {
      file.close();
    }
  }
}

function manifest(value: unknown): ExportManifest {
  const out = value as ExportManifest | null;
  const size = (n: unknown) => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
  if (!out || !size(out.bytes) || !Array.isArray(out.files)) throw Error("invalid staged export");
  const seen = new Set<string>();
  for (const file of out.files) {
    if (
      !file ||
      !size(file.bytes) ||
      typeof file.path !== "string" ||
      !file.path ||
      isAbsolute(file.path) ||
      climbsOut(file.path) ||
      file.path.includes("\0") ||
      seen.has(file.path)
    )
      throw Error("invalid export attachment");
    seen.add(file.path);
  }
  return out;
}

/** Completed output on disk, not a second document-sized buffer on the UI thread. Always dispose after use. */
export class PreparedExport {
  private disposed = false;
  private constructor(
    readonly dir: string,
    readonly manifest: ExportManifest,
  ) {}

  /** A private folder for one export's output, in slipbox's cache folder (`exports/`): on disk, where the system's
   *  temporary folder may be memory (a tmpfs), and an export as big as it is would fill it. */
  static async directory(): Promise<string> {
    const exports = join(ensureCacheHome(), "exports");
    mkdirSync(exports, { recursive: true, mode: 0o700 });
    sweep(exports);
    const dir = await mkdtemp(join(exports, `${process.pid}-`));
    track(dir);
    return dir;
  }
  static async remove(dir: string): Promise<void> {
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
    privatePaths.delete(dir);
  }
  static async take(dir: string, value: unknown, signal?: AbortSignal): Promise<PreparedExport> {
    const out = manifest(value);
    for (const [i, expected] of [out.bytes, ...out.files.map((f) => f.bytes)].entries()) {
      signal?.throwIfAborted();
      const file = await open(
        join(dir, i === 0 ? "document" : `asset-${i - 1}`),
        constants.O_RDONLY | constants.O_NONBLOCK | (constants.O_NOFOLLOW ?? 0),
      );
      try {
        const info = await file.stat();
        if (!info.isFile() || info.size !== expected) throw Error("incomplete staged export");
      } finally {
        await file.close();
      }
    }
    signal?.throwIfAborted();
    return new PreparedExport(dir, out);
  }

  /** Copy with backpressure and cancellation, then atomically publish attachments first and the document last;
   *  `committing` is told once `signal` is read for the last time, as the document's rename begins: from then on, a
   *  cancel can't stop it. */
  async publish(
    target: string,
    revalidate: () => void,
    signal?: AbortSignal,
    committing?: () => void,
  ): Promise<string[]> {
    if (this.disposed) throw Error("export staging disposed");
    signal?.throwIfAborted();
    revalidate();
    const files = this.manifest.files.map((f) => join(dirname(target), f.path));
    if (files.includes(target)) throw Error("export attachment replaces document");
    const temps: { temp: string; target: string; mode: number }[] = [];
    const buffer = Buffer.allocUnsafe(EXPORT_CHUNK);
    try {
      for (const [i, destination] of [...files, target].entries()) {
        signal?.throwIfAborted();
        await mkdir(dirname(destination), { recursive: true });
        const temp = join(dirname(destination), `.slipbox-export-${randomUUID()}.tmp`);
        let mode = 0o644;
        try {
          mode = (await stat(destination)).mode & 0o7777;
        } catch {}
        temps.push({ temp, target: destination, mode });
        track(temp);
        const source = await open(join(this.dir, i === files.length ? "document" : `asset-${i}`), "r");
        try {
          const dest = await open(temp, "wx", 0o600);
          try {
            let copied = 0;
            while (true) {
              signal?.throwIfAborted();
              const { bytesRead } = await source.read(buffer, 0, buffer.length, null);
              if (!bytesRead) break;
              copied += bytesRead;
              let at = 0;
              while (at < bytesRead) {
                signal?.throwIfAborted();
                const { bytesWritten } = await dest.write(buffer, at, bytesRead - at);
                if (!bytesWritten) throw Error("export copy made no progress");
                at += bytesWritten;
              }
            }
            const expected = i === files.length ? this.manifest.bytes : this.manifest.files[i]!.bytes;
            if (copied !== expected) throw Error("incomplete staged export");
            await dest.sync();
          } finally {
            await dest.close();
          }
        } finally {
          await source.close();
        }
      }
      for (const [i, file] of temps.entries()) {
        signal?.throwIfAborted();
        revalidate();
        const handle = await open(file.temp, "r+");
        try {
          await handle.chmod(file.mode);
        } finally {
          await handle.close();
        }
        signal?.throwIfAborted();
        if (i === temps.length - 1) committing?.();
        revalidate();
        await rename(file.temp, file.target);
      }
      return files;
    } finally {
      for (const file of temps) {
        await rm(file.temp, { force: true });
        privatePaths.delete(file.temp);
      }
    }
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    await PreparedExport.remove(this.dir);
  }
}
