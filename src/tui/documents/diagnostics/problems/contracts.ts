// Problem-panel rows, tabs and per-tab selection records.

import type { LinkProblem } from "../../../../core/workspace/graph/graph.ts";
import type { LintIssue } from "../../../../core/documents/diagnostics/lint.ts";

/** One row of the Problems panel's All tab (1.7): a section's heading, a note with problems under it, or a problem. */
export interface ProblemRow {
  section: string;
  heading: boolean;
  /** A note's row (its problems under it): its path. */
  note?: string;
  /** What's shown first: a heading's name and count, a note's path, a problem's line (`L12`). */
  label: string;
  /** How it's written, and why it's a problem. */
  detail: string;
  text: string;
  folded: boolean;
  link?: LinkProblem;
  /** A linter's finding (3.21). */
  lint?: LintIssue;
  /** A file in a merge's conflict (5.12), at its first marker. */
  conflict?: { path: string; line: number };
  /** Frontmatter that breaks its document type's rules (22.2), at its line. */
  frontmatter?: { path: string; line: number };
}

/**
 * The Problems panel (1.7, 19.8), full width at the bottom: in tabs, the file on screen's problems — from every
 * source, each with its line — and the root's (its links' and lint's, its conflicts, its orphans). Each tab keeps its
 * selection, its first row shown and its filter (`/`).
 */
export interface ProblemsPanel {
  shown: boolean;
  tab: "file" | "all";
  /** Its height, its tabs' row included, as resized (resize mode, a drag of its rule); null: a third of the screen. */
  height: number | null;
  file: PanelList;
  all: PanelList;
}

/** One of the Problems panel's lists: its selection, its first row shown, its filter and whether keys go to it. */
export interface PanelList {
  selected: number;
  scroll: number;
  filter: string;
  filtering: boolean;
}
