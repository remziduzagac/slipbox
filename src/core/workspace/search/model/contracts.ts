// Search document/query/hit records, shared below dispatch.

/** A line of a file, with its number (1-based): a section merged from others isn't contiguous. */
export interface DocLine {
  line: number;
  text: string;
}

/**
 * A section a hit can land in (scout's model, Stage 4): a node of the file's containment tree — a
 * heading owns everything to the next heading as high — kept when its own text is in the size band,
 * split when it's over, merged into its parent when it's under; the root (`§:file`) always kept.
 */
export interface DocSection {
  /** scout's name for it, after the path's `#`: the heading chain (`Auth/How auth works`), or `§:file`, `§:part~2`, `§:chunk~3`. */
  name: string;
  /** Its heading's text ("" for the root and the pieces cut from it). */
  heading: string;
  /** Its first and last line (1-based): a range for jumping to and for matching a scout result's. */
  line: number;
  end: number;
  /** Its own text and what merged into it, line by line, in document order. */
  lines: DocLine[];
  /** Its own text's tokens, as bytes / 4 (slipbox has no tokenizer, nor needs one). */
  tokens: number;
  /** Over the band and couldn't be split (one long paragraph): kept whole. */
  oversized: boolean;
}

/** What search reads of a file: its title, aliases, tags and headings, and its sections. */
export interface Doc {
  title: string;
  aliases: string[];
  tags: string[];
  /** Every heading, its line and text, in order: the index's headings column, and a hit's nearest. */
  headings: { line: number; text: string }[];
  /** The sections a hit is cited by, cut to the band (scout's). */
  sections: DocSection[];
  /**
   * Where a hit opens is found finer: each heading's own text, uncut and unmerged (a data file's, each
   * blank-line paragraph) — the band merges a short note into one section, and the hit would open at
   * any word rather than among most of them.
   */
  units: DocLine[][];
}

/** A node of the containment tree, as it's built and then cut to the band. */
export interface Node {
  heading: string;
  level: number;
  /** Its own lines; text merged into it is appended, a part at a time. */
  lines: DocLine[];
  /** Its text as scout hashes and measures it: its own, then each absorbed part, joined by a blank line. */
  text: string;
  children: Node[];
}

// -------------------------------------------------------------------------------------------
// The query
export interface QueryTerm {
  text: string;
  /** Written in quotes: its words together, in order. */
  phrase: boolean;
  /** `word*`: words starting so. */
  prefix: boolean;
  /** `-word`: notes with it are left out. */
  not: boolean;
  /** `title:word`: in the note's title (or an alias). */
  title: boolean;
}

export interface SearchQuery {
  terms: QueryTerm[];
  /** `#tag`, `tag:x`: notes carrying it (or a tag nested under it). */
  tags: string[];
  /** `path:folder/`: files whose path starts so. */
  paths: string[];
}

// -------------------------------------------------------------------------------------------
// Searching
export interface SearchHit {
  path: string;
  /** Where to open it: the first line with one of the words, in the section with most of them (1-based), and its column. */
  line: number;
  column: number;
  /** The nearest heading at or above that line ("" above the first). */
  heading: string;
  /**
   * The section it's in, as scout names and bounds it (Stage 4): a scout result for the same file
   * and range is the same hit — what a search that adds scout's results dedupes on.
   */
  section: { name: string; line: number; end: number };
  /** Higher is better. */
  score: number;
  /** That line, cut around the match; `marks` say where the words are in it. */
  snippet: string;
  marks: [number, number][];
  /** Other sections of the file with some of the words. */
  more: number;
}

export interface SearchResult {
  engine: "index" | "scan";
  /** No file had every word: these have some of them. */
  relaxed: boolean;
  hits: SearchHit[];
}

// -------------------------------------------------------------------------------------------
// The scan: the same query over the files themselves, until the index is there
export interface Scanned {
  path: string;
  group: "note" | "data";
  text: string;
  doc: Doc;
}
