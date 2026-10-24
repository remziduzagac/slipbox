// A window's modes (HDR-D2): their names and their order, in a module that imports nothing at load, so the lens, the
// header and the mouse find them whichever of them loads first (lens.ts → … → draw-header.ts → lens.ts is a cycle).

import type { View } from "./app.ts";

/** A window's mode: the rendered view (Read), live preview (the lens) or source mode. */
export type ViewMode = "rendered" | "source" | "live";

/** The modes as the window header's buttons name them, in order: the mode, its hit area's name, its label. */
export const MODES: readonly { mode: ViewMode; id: "read" | "lens" | "source"; label: string }[] = [
  { mode: "rendered", id: "read", label: "Read" },
  { mode: "live", id: "lens", label: "Lens" },
  { mode: "source", id: "source", label: "Source" },
];

/** The mode a window is in. */
export function viewMode(view: View): ViewMode {
  return view.source ? "source" : view.live ? "live" : "rendered";
}
