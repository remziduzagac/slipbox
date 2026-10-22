import type { PaintRequest, PaintResult } from "./paint-jobs.ts";
import { loadTypesetter } from "./typeset.ts";
import { loadRasterizer } from "./svg.ts";

declare const self: Worker;
self.onmessage = async (event: MessageEvent<{ id: number; request: PaintRequest }>) => {
  const { id, request } = event.data;
  let value: PaintResult = null;
  try {
    if (request.kind === "math") {
      const t = await loadTypesetter();
      value = t?.(request.source, request.color, request.inline) ?? null;
    } else if (request.kind === "size" || request.kind === "png") {
      const r = await loadRasterizer();
      const size = r?.size(request.source);
      if (
        size &&
        size.width > 0 &&
        size.height > 0 &&
        size.width <= 16384 &&
        size.height <= 16384 &&
        size.width * size.height <= 16_000_000
      ) {
        if (request.kind === "size") value = size;
        else if (
          Number.isFinite(request.width) &&
          request.width > 0 &&
          request.width <= 4096 &&
          (request.width * request.width * size.height) / size.width <= 4_000_000
        )
          value = r?.png(request.source, request.width) ?? null;
      }
    }
    const bytes =
      value instanceof Uint8Array ? value.byteLength : typeof value === "string" ? Buffer.byteLength(value) : 32;
    if (bytes > 8 * 1024 * 1024) value = null;
  } catch {}
  self.postMessage({ id, value });
};

self.postMessage({ ready: true });
