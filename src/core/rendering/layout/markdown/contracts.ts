// Markdown render options, cached blocks and embedded-note records.
import type { PhrasingContent, RootContent } from "mdast";
import type { Glyphs } from "../../theme/glyphs.ts";
import type { DrawingColors } from "../../media/diagrams/diagrams.ts";
import type { LayoutHeading, LayoutLink, Line, LinkStatus, Picture } from "../ir.ts";

export interface RenderOptions {
  /** Layout width in columns — the caller has already subtracted the inset (2.7). */
  width: number;
  /** Explicit color scheme for HTML picture alternatives; absent uses img. */
  htmlTheme?: "light" | "dark";
  /** TUI disclosure overrides by source line; absent means noninteractive, expanded. */
  htmlDetails?: ReadonlyMap<number, boolean>;
  glyphs: Glyphs;
  /** Append ` <url>` after external link text (for plain output). */
  showUrls: boolean;
  /** Link status for styling; without it every wikilink renders as resolved. */
  resolveLink?: (kind: "wiki" | "embed" | "markdown" | "image", target: string) => LinkStatus;
  /**
   * What an embed (`![[note]]`, `![[note#Heading]]`, `![[note#^block]]`; or written as a path,
   * `![text](note.md#heading)`, kind `image`, 20.1) shows, to draw it in place (1.11); null where it
   * isn't a note (a picture, a file, nothing): then it's a reference.
   */
  embed?: (target: string, heading: string | null, block: string | null, kind?: "embed" | "image") => Embedded | null;
  /** The note being drawn (absolute): an embed of it, however deep, is a loop. */
  embedFrom?: string;
  /** A picture alone in its paragraph (12.x), drawn above its caption box: its file and the cells it takes, fitted
   *  to `width` columns and its window less its `▣` line's `caption` rows (PIC-D1), or at its own size — or null (not
   *  a local image, no images here): its `▣ alt` alone, the floor. */
  picture?: (from: PictureSource, width: number, caption?: number) => Picture | null;
  /** What `picture` sizes for besides the width (PIC): a window's rows, the pictures it shows at their own size. A
   *  kept block that asked for a picture is laid out again when it changes. */
  pictureKey?: string;
  caption?: "bottom" | "top";
  /** Mermaid and a display's maths drawn as pictures (12.16, 12.17), as chosen where pictures are: in these colours. */
  drawings?: { mermaid: boolean; math: boolean; colors: DrawingColors & { math: string } };
  /** A code block too wide for its room keeps its lines whole, to scroll sideways in the window (`[render] code_wrap
   *  = "scroll"`, the TUI's); without it, each long line wraps, its rows after the first marked `↪` — what's printed
   *  (`slipbox render`), which has no window to scroll. */
  codeScroll?: boolean;
}

/**
 * Where a picture is, as the note writes it: a markdown image's URL — a path from the note's folder, or on the
 * internet — or a name, `![[dal.png]]` (12.13), found as a link to it is, with the size in pixels Obsidian's `|300`
 * (its width) or `|240x180` (the box it fits in) gives it. Or a file already found: an embedded note's picture, found
 * from where that note is (12.14).
 */
export type PictureSource =
  | { url: string; size?: PictureSize | null; maxWidth?: number }
  | { name: string; size: PictureSize | null }
  | { file: string; size: PictureSize | null; maxWidth?: number }
  /** An SVG slipbox drew (12.16, 12.17): a diagram's, sized as the terminal's words are, or a display's maths. */
  | { svg: string; kind: "diagram" | "math" };

export type PictureSize = { width: number; height: number | null };

/** A picture found: its file, or its address on the internet. */
export type FoundPicture = Exclude<PictureSource, { name: string }>;

/** A note embedded, as the caller found it: what to draw, and how its own links resolve. */
export interface Embedded {
  /** Absolute: what loops are told by. */
  path: string;
  /** Its name, and the heading or block embedded. */
  title: string;
  /** The blocks to draw; null when the heading or block named isn't there (`missing` says so). */
  nodes: RootContent[] | null;
  missing?: string;
  /** Its links' status, its embeds — from where it is, not from the note embedding it. */
  resolveLink?: RenderOptions["resolveLink"];
  embed?: RenderOptions["embed"];
  /** Its path in this root, for following its links from there; absent in another root. */
  from?: string;
  /** Where its pictures are (12.14): a path from its folder, a name from where it is — files; one on the internet as
   *  it's written. Without it, its pictures stay `▣ alt`. */
  locate?: (from: PictureSource) => FoundPicture | null;
}

/**
 * Top-level blocks' rows, kept between renders of the same note (a buffer keeps one, and drops it
 * when anything a render reads besides the text changes: the graph, the theme): a block the parse
 * reused — the same `ORIGIN` — is copied to where it now is, not rendered again (plan 15.1).
 */
export interface RenderCache {
  /** Width, glyphs, URLs and the note's definitions: a change drops every block. */
  key: string;
  blocks: WeakMap<object, CachedBlock>;
}

export interface CachedBlock {
  lines: Line[];
  links: LayoutLink[];
  headings: Omit<LayoutHeading, "line">[];
  /** The block's first source line when it was rendered. */
  src: number;
  /** What its pictures were sized for (`pictureKey`), when it asked for one. */
  pictures?: string;
}

/** An embed as written: a wikilink's (`![[…]]`), or a path's (`![…](note.md)`, 20.1). */
export interface EmbedRef {
  kind: "embed" | "image";
  target: string;
  heading: string | null;
  block: string | null;
  /** What its header links to: a wikilink's target, a path's whole URL (its fragment followed too). */
  link: string;
  node: PhrasingContent;
}
