// Inputs and row/cell contracts shared by the code-view layout owners.
import type { Severity } from "../../../documents/diagnostics/diagnostics.ts";
import type { Glyphs } from "../../theme/glyphs.ts";
import type { CodeDef, CodeDoc, OutlineEntry } from "../../../documents/syntax/syntax.ts";
import type { Role } from "../../theme/theme.ts";

export interface CodeLayoutOptions {
  /** Columns to lay out in; with `wrap` off, a line runs on and the layout is as wide as its longest. */
  width: number;
  wrap: boolean;
  glyphs: Glyphs;
  /** The runs of imports unfolded, by their first line. */
  open: ReadonlySet<number>;
  /** The cells folded to their header, by their first line. */
  folded?: ReadonlySet<number>;
  /** How a cell is drawn: in a box, or on a band. */
  cells?: "box" | "band";
  /** The file's problems, by the line each starts on: a cell's header counts its own. */
  problems?: readonly { line: number; severity: Severity }[];
  /** Whether a line is inside a string or comment that spans lines (its blank lines are its text: never folded). */
  inside?: (line: number) => boolean;
  /** The paths in the file's comments that name a file (16.10), by line: as written, and where each goes. In the
   *  comments' prose they're drawn as links, as source mode draws them. */
  paths?: readonly CommentPath[];
  /** The file's outline (16.8), as source mode heads it: the definitions' headings (the breadcrumb, `]]`) are its
   *  entries — a function inside a function, an impl by its outline's name — not only the cells. Without it, the
   *  cells'. */
  outline?: readonly OutlineEntry[];
}

/** A path in a comment that names a file: its line, its text as written (`notes/plan.md:12`), where it goes. */
export interface CommentPath {
  line: number;
  text: string;
  target: string;
}

/** A cell drawn: its grapheme, width, its offset in its line (UTF-16), its role and attributes. */
export interface Cell {
  g: string;
  w: number;
  at: number;
  role: Role;
  attrs: number;
}

/** Where a long line may break: before cell `i`, at bracket depth `depth`. */
export interface Break {
  i: number;
  depth: number;
}

/** Documentation a cell holds above its code: a doc comment or docstring, or a run of comment lines. */
export type DocPart = { doc: CodeDoc } | { comments: { from: number; to: number; column: number } };

/** A cell: its first and last lines (its documentation's with its code's), where it's drawn, what it's called. */
export interface CellSpec {
  from: number;
  to: number;
  /** Its code's first and last lines (after its documentation); the whole cell's when it has none. */
  code?: [number, number];
  /** Its documentation, drawn in it above its code. */
  docs?: DocPart[];
  /** Prose alone: a comment that documents nothing, a module's docstring — its documentation, no code. */
  prose?: boolean;
  column: number;
  mark: string;
  markRole: Role;
  title: string;
  /** The definition it is, for its name's and its kind's decoration; none for a run of statements. */
  def?: CodeDef;
  /** Its language's word for it (`struct`), before its name in its header, in place of `mark`. */
  term?: string;
}
