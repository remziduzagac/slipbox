// The per-view live-preview cache record.

import type { Block } from "../../../../core/rendering/layout/markdown/live.ts";
import type { Layout } from "../../../../core/rendering/layout/ir.ts";

/** What live preview composes from: a render, the blocks of its parse, and which one is active. */
export interface LiveBase {
  rendered: Layout;
  width: number;
  wrap: boolean;
  /** Its code blocks too wide kept whole, to scroll sideways (`[render] code_wrap`). */
  codeScroll: boolean;
  caption: "bottom" | "top";
  /** Its pictures' key, as its window showed them (PIC). */
  pictures: string;
  /** The buffer version the render was made from, and the one the block was last matched to. */
  renderedVersion: number;
  version: number;
  blocks: Block[];
  /** The active block in the render's numbering, and now (grown or shrunk by typing). */
  old: Block;
  active: Block;
  /** The text around the block when the render was made: typing must leave it alone. */
  before: string;
  after: string;
  lineCount: number;
  composed?: { key: string; layout: Layout };
  /** The whole piece around a line when it fits the lens — a code cell (24.16), a note's innermost section — or null:
   *  the lens opens on one alone, and moves to the next whole rather than gathering it. */
  unit?: (line: number) => Block | null;
}
