// An OpenTUI frame buffer for a test to draw into and read back. Since OpenTUI 0.6 every buffer has an owner: without a
// renderer, a native context of its own, here one for the whole run.
import { OptimizedBuffer, ResourceContext, type WidthMethod } from "@opentui/core";

let owner: ResourceContext | null = null;

/** A `width` × `height` buffer, its widths counted by `method`; the test destroys it. */
export function frameBuffer(width: number, height: number, method: WidthMethod = "unicode"): OptimizedBuffer {
  owner ??= new ResourceContext({ objectCapacity: 64, renderCellsMax: 1 << 16 });
  return OptimizedBuffer.create(width, height, method, { owner });
}
