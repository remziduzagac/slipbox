// Completion and signature state held by the current App/view.

import type { CompletionItem } from "vscode-languageserver-protocol";
import type { LinkStyle } from "../../../../core/workspace/links/convention.ts";
import type { View } from "../../../app/runtime/app.ts";

export interface CompletionState {
  view: View;
  /** Where the word being completed starts: a text offset. */
  from: number;
  items: CompletionItem[];
  /** The items the typed word keeps, best first. */
  shown: CompletionItem[];
  selected: number;
  /** The server said its list was partial: typing asks it again. */
  incomplete: boolean;
  /** A link's target being completed (20.13), in this style: slipbox's list, no server's. */
  links?: LinkStyle;
  /** A link's: where its target's line starts, and what's before the target on it, its indent aside: an indent leaves
   *  both. */
  lineStart?: number;
  before?: string;
  /** A link's words typed so far, each with the items it matched in the list's order: a word typed on from one
   *  matches no other. */
  steps?: { typed: string; matched: CompletionItem[] }[];
  /** A word completed from the open files' words (25.5): narrowed by how it starts, kept in their order. */
  words?: boolean;
}

/** A signature being typed: its label, and the active parameter's span in it. */
export interface SignatureState {
  view: View;
  label: string;
  active: [number, number] | null;
}
