// Parser inputs, positions and extracted document structures; no loading or tree ownership.
import type { Language, Node, Parser, Query } from "web-tree-sitter";

export type Grammar =
  | "typescript"
  | "tsx"
  | "javascript"
  | "python"
  | "bash"
  | "lua"
  | "go"
  | "rust"
  | "swift"
  | "html"
  | "css"
  | "scss"
  | "php"
  | "dockerfile"
  | "vue"
  | "svelte"
  | "astro"
  | "ruby"
  | "c"
  | "cpp";

export interface Loaded {
  grammar: Grammar;
  parser: Parser;
  language: Language;
  defs: Query | null;
  comments: Query;
  strings: Query;
  /** Its text objects' query (EG-D6, `grammar/textobjects.ts`); null: it has none. */
  objects: Query | null;
}

/** A text object of code (EG-D6), as UTF-16 offsets into the text parsed: the whole (`a`) and its inside (`i`): a
 *  body's, between its braces where it has them; an argument's own text, its whole with the comma between it and the
 *  next (or the one before). */
export interface CodeObject {
  kind: "function" | "class" | "argument" | "block";
  from: number;
  to: number;
  inner: [number, number];
}

/** What the structure keys read of code (EG-D6, EG-D7): its text objects, and every named node's range as pairs of
 *  offsets (`from, to, from, to…`), a node left out where it covers what its parent does. */
export interface CodeStructure {
  objects: CodeObject[];
  nodes: Int32Array;
}

export interface OutlineEntry {
  name: string;
  kind: string;
  /** 1-based source line. */
  line: number;
  depth: number;
}

export interface SyntaxError {
  /** 1-based line; 0-based UTF-16 columns within it (end on the same line). */
  line: number;
  from: number;
  to: number;
  message: string;
}

export interface Span {
  /** 1-based line; UTF-16 columns in that line, `to` exclusive (past the end: to the line's end). */
  line: number;
  from: number;
  to: number;
  kind: "string" | "comment";
}

export interface Comment {
  line: number;
  column: number;
  text: string;
}

/** A position: 0-based row, UTF-16 column. */
export interface Pos {
  row: number;
  column: number;
}

/** An outline entry before its depth is known: where it starts and ends. */
export interface Entry {
  name: string;
  kind: string;
  start: Pos;
  end: Pos;
}

/** A part of a file in another language (16.22): its text's node, its grammar, its highlighting. */
export interface Part {
  /** The node holding its text (a `<script>`'s raw text, Astro's frontmatter). */
  text: Node;
  /** The element it's in, an outline entry of its own; null: none (a PHP file's HTML). */
  section: { name: string; node: Node } | null;
  grammar: Grammar | null;
  /** highlight.js's name for its lines; null: the file's own. */
  highlight: string | null;
}

/** A definition as the code view draws it (24.3): its kind, the line it starts on, its name's place, its depth. */
export interface CodeDef {
  kind: "function" | "class" | "type" | "value";
  /** 1-based. */
  line: number;
  /** Its name: a 1-based line, 0-based UTF-16 columns. */
  name: { line: number; from: number; to: number };
  /** How many definitions it's inside. */
  depth: number;
  /** The line its block starts on: its decorators' first, else its own. */
  top: number;
  /** Its last line. */
  end: number;
  /** The column it starts at: its indentation. */
  column: number;
  /** What its language calls it (24.9): `function`, `method`, `class`, `struct`, `impl`, `trait`… — its cell's header's
   *  word. */
  term?: string;
}

/**
 * Documentation (24.4): a doc comment (`/** … *\/`), a docstring (Python's first string in a body), or a plain block
 * comment — its 1-based first and last lines, and the column it's drawn at.
 */
export interface CodeDoc {
  start: number;
  end: number;
  column: number;
  /** `lines`: a run of line comments holding tags (`@param`), read as JSDoc is (24.9). */
  style: "jsdoc" | "docstring" | "block" | "lines";
  /** A docstring of a definition: drawn before this line (the definition's block), as documentation is elsewhere. */
  before?: number;
}

/** A comment that isn't documentation (24.4): a line comment, or a block comment on one line; `trailing`: after code. */
export interface CodeComment {
  line: number;
  column: number;
  end: number;
  trailing: boolean;
}

/** A run of imports (24.5): its 1-based first and last lines, and the modules it imports. Or a header folded as one
 *  (24.22): a licence, its name; a "generated" banner, what generated it. */
export interface CodeImports {
  start: number;
  end: number;
  modules: string[];
  kind?: "license" | "generated";
}

/** What the code view knows of a file beyond its tokens (24.x): its definitions, doc comments and imports. */
export interface CodeModel {
  defs: CodeDef[];
  docs: CodeDoc[];
  comments: CodeComment[];
  imports: CodeImports[];
}

export interface CommentLink {
  /** 1-based line; 0-based UTF-16 columns of the token in it. */
  line: number;
  from: number;
  to: number;
  /** A URL, or a path as written (no `:line`). */
  target: string;
  url: boolean;
  /** `path:42`: the line it points at. */
  at: number | null;
}
