// Validate framing before the protocol reader retains or parses a response.
import { Transform, type TransformCallback } from "node:stream";

/** A response slipbox can't read. `atEnd`: its output stopped mid-message — it is exiting, and its exit says why. */
export class FramingError extends Error {
  constructor(
    message: string,
    readonly atEnd = false,
  ) {
    super(message);
  }
}

export class ServerTransport extends Transform {
  private header = "";
  private remaining = 0;
  constructor(
    private messageBytes = 16 * 1024 * 1024,
    private headerBytes = 8192,
  ) {
    super();
  }
  override _transform(chunk: Buffer, _encoding: BufferEncoding, done: TransformCallback): void {
    try {
      let offset = 0;
      while (offset < chunk.length) {
        if (this.remaining) {
          const size = Math.min(this.remaining, chunk.length - offset);
          this.push(chunk.subarray(offset, offset + size));
          this.remaining -= size;
          offset += size;
          continue;
        }
        this.header += String.fromCharCode(chunk[offset++]!);
        if (this.header.length > this.headerBytes) throw new FramingError("server response header limit exceeded");
        if (!this.header.endsWith("\r\n\r\n")) continue;
        const lengths = this.header.split("\r\n").filter((line) => /^Content-Length:/i.test(line));
        const raw = lengths[0]?.slice(lengths[0].indexOf(":") + 1).trim() ?? "";
        const size = Number(raw);
        if (lengths.length !== 1 || !/^\d+$/.test(raw) || !Number.isSafeInteger(size) || size <= 0)
          throw new FramingError("invalid server response length");
        if (size > this.messageBytes) throw new FramingError("server response message limit exceeded");
        this.remaining = size;
        this.push(Buffer.from(this.header, "latin1"));
        this.header = "";
      }
      done();
    } catch (error) {
      done(error as Error);
    }
  }
  override _flush(done: TransformCallback): void {
    done(this.header || this.remaining ? new FramingError("incomplete server response", true) : undefined);
  }
}
