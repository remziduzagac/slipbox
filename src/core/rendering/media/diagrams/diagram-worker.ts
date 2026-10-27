// Diagram layout belongs off the UI thread. Its owner enforces each request's deadline.
import { loadMermaid, renderSvg, renderText } from "./diagram-render.ts";
import type { DiagramRequest } from "./diagram-jobs.ts";

declare const self: Worker;

await loadMermaid();
self.onmessage = (e: MessageEvent<{ id: number; request: DiagramRequest }>) => {
  const { id, request: r } = e.data;
  try {
    const value =
      r.kind === "text" ? renderText(r.source, r.width, r.ascii, r.scroll) : renderSvg(r.source, r.colors, r.family);
    if (JSON.stringify(value).length > 524288) self.postMessage({ id, value: { why: "render limit reached" } });
    else self.postMessage({ id, value });
  } catch {
    self.postMessage({ id, value: { why: "not drawn" } });
  }
};
self.postMessage({ ready: true });
