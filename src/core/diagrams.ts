// Layout reads completed diagrams synchronously; rendering happens in a bounded background queue.
import { AsyncLocalStorage } from "node:async_hooks";
import { diagramStore } from "./diagram-cache.ts";
import { BATCH_DIAGRAM_POLICY, DiagramJobs } from "./diagram-jobs.ts";
import type { DrawingColors, Drawn } from "./diagram-render.ts";
import { notifyLoaded } from "./lazy.ts";
// Types alone from the renderer: it runs in its worker, never here (`bun run check:boundary`).
export type { DrawingColors, Drawn } from "./diagram-render.ts";

export const MERMAID = "mermaid";
const interactive = new DiagramJobs(() => notifyLoaded(MERMAID), undefined, {}, diagramStore);
const context = new AsyncLocalStorage<DiagramJobs>();
const jobs = () => context.getStore() ?? interactive;

/** Noninteractive output gets a separate cache and longer deadlines, never changing the screen's budget. */
export async function withMermaidBatch<T>(run: () => Promise<T>): Promise<T> {
  const batch = new DiagramJobs(() => {}, undefined, BATCH_DIAGRAM_POLICY, diagramStore);
  try {
    return await context.run(batch, run);
  } finally {
    batch.dispose();
  }
}

/** Wait for diagrams requested by layout, including failures. The CLI repeats layout until all requested results are ready. */
export async function loadMermaid(): Promise<true> {
  await jobs().settle();
  return true;
}

export function drawMermaid(source: string, width: number, ascii: boolean, scroll = false): Drawn | null {
  const value = jobs().get({ kind: "text", source, width, ascii, scroll });
  if (value === undefined) return null;
  return value && typeof value !== "string" ? value : { why: "not drawn" };
}

export function mermaidSvg(source: string, colors: DrawingColors, family: string | null): string | null {
  if (!family) return null;
  const value = jobs().get({ kind: "svg", source, colors, family });
  return typeof value === "string" ? value : null;
}

export function mermaidPending(): boolean {
  return jobs().busy();
}
