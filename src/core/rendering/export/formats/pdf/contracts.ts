// PDF style, inline, atom, line and block contracts; no writer or document lifecycle.
import type { ExportPicture } from "../../assemble.ts";

export interface Style {
  underline?: boolean;
  bold?: boolean;
  italic?: boolean;
  mono?: boolean;
  strike?: boolean;
  /** Inline code: on a tint. */
  tint?: boolean;
  /** Obsidian's `==highlight==`: on a marker's yellow. */
  mark?: boolean;
  color?: string;
  size?: number;
  link?: string;
  goTo?: string;
}

export interface Run extends Style {
  text: string;
}

export /** A picture in a line: maths sits on the baseline as MathJax set it, anything else stands on it. */
interface InlinePicture extends Style {
  picture: ExportPicture;
  alt: string;
  math?: boolean;
}

export type Inline = Run | InlinePicture;

export /** Where blocks go: from `x`, `width` wide; their text's colour, the space after a paragraph, how deep in lists. */
interface Box {
  x: number;
  width: number;
  color?: string;
  gap?: number;
  depth?: number;
}

export /** What a line is made of: text in one font and style, or a picture; each as wide as it's drawn. */
type Atom =
  | (Style & {
      kind: "text";
      text: string;
      font: string;
      width: number;
      ascent: number;
      descent: number;
      space: boolean;
    })
  | (Style & { kind: "picture"; data: Buffer; width: number; height: number; drop: number; alt: string });

export interface Line {
  atoms: Atom[];
  /** Its width without the spaces it ends with. */
  width: number;
  ascent: number;
  descent: number;
}

export type FlowOptions = { align?: "left" | "center" | "right"; size?: number; gap?: number; keep?: boolean };
export type PdfFlow = (content: Inline[], box: Box, options?: FlowOptions) => void;
export interface PageFit {
  ensure(height: number): void;
}
