// Screen geometry records below drawing composition.

import type { Rect, Hot } from "../geometry.ts";
import type { CellStyle } from "../../../../core/rendering/layout/style.ts";
import type { View } from "../../../app/runtime/app.ts";
import type { SaveAsGeometry } from "../../../documents/saving/saveas.ts";
import type { DialogGeometry } from "../../overlays/dialog.ts";

export interface PaneGeom extends Rect {
  view: View;
  /** Screen column of layout column 0. */
  textX: number;
}

/** A border the mouse can drag to resize something. */
export interface Separator extends Rect {
  kind: "sidebar" | "outline" | "split-side" | "split-stacked" | "problems";
  /** The area the split divides (for split separators). */
  area?: Rect;
}

export interface ScrollbarGeom extends Rect {
  /** A window's scrollbar, or a side pane's. */
  view?: View;
  /** The window's horizontal scrollbar (wrapping off): its position moves the view sideways. */
  horizontal?: boolean;
  /** A code block's own horizontal scrollbar, on its last row (`[render] code_wrap`): its key, the block it moves. */
  block?: string;
  pane?: "sidebar" | "outline";
  total: number;
}

export interface Geometry {
  panes: PaneGeom[];
  /** The explorer's and the outline's lists (under their titles), and the whole panes. */
  sidebar: Rect | null;
  outline: Rect | null;
  sidebarPane: Rect | null;
  outlinePane: Rect | null;
  tabs: (Rect & { index: number })[];
  overlay: (Rect & { listY: number; rows: number }) | null;
  hot: Hot[];
  separators: Separator[];
  scrollbars: ScrollbarGeom[];
  /** The pictures drawn (PIC), each where it shows: a click there is the picture's — its window, its first row drawn
   *  over. */
  pictures: (Rect & { view: View; row: number; file: string })[];
  tabStrip: Rect | null;
  /** The which-key popup, with its margin: clicks there never reach what's under it. */
  popup: Rect | null;
  /** Where each window's breadcrumb hangs its path from (its `…`, else its icon), by the window's index: kept when a
   *  popup over it takes its clicks — `space f b` with the which-key popup drawn after `space f` (#40). */
  crumbAnchors: Record<number, { x: number; y: number }>;
  /** Horizontal rules (row `y`, columns [x0, x1)) and the vertical borders they may meet. */
  rules: { y: number; x0: number; x1: number }[];
  verticals: { x: number; y0: number; y1: number; style: CellStyle }[];
  /** Find's prompt is drawn in its window (its find row), not on the bottom line. */
  findInWindow?: boolean;
  /** A question's floating window, with its margin: clicks there never reach what's under it. */
  dialog?: Rect | null;
  /** The floating editor's box (3.20), with its margin. */
  floating?: Rect | null;
  /** Completion's popup (19.16): no hit area under it can be clicked through it. */
  completion?: Rect | null;
  /** Where the active window's cursor is on screen: completion's popup hangs from it (19.16). */
  cursor?: { x: number; y: number } | null;
  /** The git panel's rows, drawn: the pointer there holds the repositories' order (`GitPanel.drawnRows`). */
  gitRows?: Rect | null;
  /** The hover the git panel drew its rows by, taken to its rows as they are (`Steady.hotNow`). */
  gitHover?: string | null;
  /** The Problems panel (1.7), at the bottom, under its rule: clicks and the wheel there are its. */
  problems?: Rect | null;
  /** How many of its entries it shows at once: the wheel's page. */
  problemsPage?: number;
  /** The Save As window's parts (10.14): clicks and the wheel there are its. */
  saveas?: SaveAsGeometry | null;
  /** The top bar said where you are (WSP-D4): the status line, drawn after it, leaves it out (WSP-D5). */
  /** A dialog of choices (UPG): its box and its rows, for clicks. */
  choices?: DialogGeometry | null;
}
