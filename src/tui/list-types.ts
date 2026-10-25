// Shared picker and menu state.
import type { Role } from "../core/theme/theme.ts";

export interface ListItem {
  label: string;
  /** The label's colour (a diff's lines, a change's state), when not the list's. */
  role?: Role;
  detail?: string;
  /** Where to mark `detail` (UTF-16 ranges): a search hit's words. */
  detailMarks?: [number, number][];
  hint?: string;
  /** Key bindings, drawn as separate keycaps at the right (instead of `hint`). */
  keys?: string[];
  /** Further bindings, shown in the footer ("also"). */
  more?: string[];
  indent?: number;
  /** A group heading: drawn dim and bold, never selected. With `rule`, the line under a heading;
   * with an empty label, the blank row before one. */
  header?: boolean;
  rule?: boolean;
  /** A key that picks this item at once (a list that isn't filtered by typing): `l`, `k`… */
  hotkey?: string;
  /** Shown for where the matches are (a tree's parents): the selection starts past it. */
  context?: boolean;
  data: unknown;
}

export interface ListOverlay {
  kind: "list";
  title: string;
  input: string;
  filterable: boolean;
  /** A leading slash starts filtering without becoming part of the query. */
  slashFilter?: boolean;
  items: ListItem[];
  /** Items computed from the input instead of filtering `items` (the `:` prompt); null: `items` filtered. */
  source?: (input: string) => ListItem[] | null;
  filtered: { item: ListItem; positions: number[] }[];
  selected: number;
  scroll: number;
  accept: (item: ListItem) => unknown;
  /** Enter with the raw input, before `accept`; return true when handled (exact `:` aliases). */
  submit?: (input: string) => boolean | Promise<boolean>;
  move?: (item: ListItem) => void;
  cancel?: () => void;
  /** Show the selected item's `detail` in a footer line instead of beside its label. */
  footer?: boolean;
  /** While filtering, keep the group headings of the items that match (help). */
  keepGroups?: boolean;
  /** The wheel scrolled the view last: the selection follows the view, not the other way. */
  wheeled?: boolean;
  /** Key columns sized over the whole list (fixed-meaning columns), not per section. */
  alignKeysAcrossList?: boolean;
  /** A dropdown hanging under this cell (the breadcrumb's `…`) instead of a centred list. */
  anchor?: { x: number; y: number };
  /** With `anchor`: a menu — as narrow as its entries, from the cell's column (the explorer's …). */
  menu?: boolean;
  /** A tree's ← / →: fold or unfold the selected item (true when something changed; `source`
   *  then gives the rows again). */
  fold?: (item: ListItem, open: boolean) => boolean;
  /** `ctrl+a`: widen what the list covers (search: more vaults, 20.16); `source` then gives it again. */
  widen?: () => void;
}
