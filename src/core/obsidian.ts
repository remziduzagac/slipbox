// Obsidian's own marks (DF-D17): `==highlight==`, drawn highlighted, and `%%comment%%`, hidden while reading — shown
// as typed in source mode and the lens, where the text is the file's. A micromark extension, as wikilinks and tags are:
// never read inside code, `\==` and `\%%` stay text, and every node carries its source position.
//
// - A highlight pairs as GitHub's `~~strike~~` does: exactly two `=`, the opening one not before a space, the closing
//   one not after one (`a == b` is text). What's inside is read as any text is: `==**bold**==`, a link.
// - A comment pairs any two `%%` of a paragraph, spaces or not (`%% a note %%`), across its lines. What's inside is
//   read too, so a link in a comment is still a link — renamed with its note — only not drawn.
// - A comment over blank lines — a paragraph starting with a `%%` that closes nothing, up to the block ending with one
//   (a list whose last item does: a `%%` right after a list is its lazy line) — is a block of its own (`commentBlock`),
//   whatever is between: made after the parse, where the blocks are.

import type { Parent, PhrasingContent, RootContent } from "mdast";

export interface Highlight extends Parent {
  type: "highlight";
  children: PhrasingContent[];
}

/** A comment inside a paragraph: its content read, never drawn. */
export interface Comment extends Parent {
  type: "comment";
  children: PhrasingContent[];
}

/** A comment over blank lines: the blocks between its `%%`s, theirs included. */
export interface CommentBlock extends Parent {
  type: "commentBlock";
  children: RootContent[];
}

declare module "mdast" {
  interface PhrasingContentMap {
    highlight: Highlight;
    comment: Comment;
  }
  interface BlockContentMap {
    commentBlock: CommentBlock;
  }
  interface RootContentMap {
    highlight: Highlight;
    comment: Comment;
    commentBlock: CommentBlock;
  }
}

const EQUALS = 61;
const PERCENT = 37;

// Minimal structural types for micromark's tokenizer API (as in wikilink.ts): its packages aren't direct dependencies.
type Code = number | null;
type State = (code: Code) => State | undefined;
interface Point {
  line: number;
  column: number;
  offset: number;
  _index: number;
  _bufferIndex: number;
}
interface Token {
  type: string;
  start: Point;
  end: Point;
  _open?: boolean;
  _close?: boolean;
}
interface Context {
  previous: Code;
  events: Event[];
  parser: { constructs: { insideSpan: { null?: { resolveAll?: Resolver }[] } } };
}
type Event = ["enter" | "exit", Token, Context];
type Resolver = (events: Event[], context: Context) => Event[];
interface Effects {
  enter(type: string): Token;
  exit(type: string): Token;
  consume(code: Code): void;
}

/** What a character beside a marker is, as CommonMark's flanking rules ask: white space (1), punctuation (2), else. */
function classify(code: Code): 1 | 2 | undefined {
  if (code === null || code < 0 || code === 32) return 1;
  const ch = String.fromCodePoint(code);
  if (/\s/u.test(ch)) return 1;
  if (/[\p{P}\p{S}]/u.test(ch)) return 2;
  return undefined;
}

/** A run of exactly two `marker`s, as a sequence that may open or close: `flanking` as a highlight's, else always. */
function sequence(marker: number, kind: string, flanking: boolean) {
  return function tokenize(this: Context, effects: Effects, ok: State, nok: State): State {
    const previous = this.previous;
    const events = this.events;
    let size = 0;
    const more: State = (code) => {
      if (code === marker) {
        if (size > 1) return nok(code);
        effects.consume(code);
        size++;
        return more;
      }
      if (size < 2) return nok(code);
      const token = effects.exit(`${kind}SequenceTemporary`);
      if (flanking) {
        const before = classify(previous);
        const after = classify(code);
        token._open = !after || (after === 2 && Boolean(before));
        token._close = !before || (before === 2 && Boolean(after));
      } else token._open = token._close = true;
      return ok(code);
    };
    return (code) => {
      // Never from inside a longer run (`===`), unless what's before it was escaped.
      if (previous === marker && events[events.length - 1]?.[1].type !== "characterEscape") return nok(code);
      effects.enter(`${kind}SequenceTemporary`);
      return more(code);
    };
  };
}

/** `items` put into `list` at `start` in place of `remove` of its own, in chunks (a long paragraph's events). */
function splice<T>(list: T[], start: number, remove: number, items: T[]): void {
  list.splice(start, remove);
  for (let k = 0; k < items.length; k += 10000) list.splice(start + k, 0, ...items.slice(k, k + 10000));
}

/** Each closing sequence paired with the nearest opening one before it: the two and what's between them, a `kind`. */
function resolver(kind: string): Resolver {
  const temporary = `${kind}SequenceTemporary`;
  return (events, context) => {
    let index = -1;
    while (++index < events.length) {
      const close = events[index]!;
      if (close[0] !== "enter" || close[1].type !== temporary || !close[1]._close) continue;
      let open = index;
      while (open--) {
        const o = events[open]!;
        if (o[0] !== "exit" || o[1].type !== temporary || !o[1]._open) continue;
        close[1].type = o[1].type = `${kind}Sequence`;
        const whole: Token = { type: kind, start: { ...o[1].start }, end: { ...close[1].end } };
        const text: Token = { type: `${kind}Text`, start: { ...o[1].end }, end: { ...close[1].start } };
        const next: Event[] = [
          ["enter", whole, context],
          ["enter", o[1], context],
          ["exit", o[1], context],
          ["enter", text, context],
        ];
        // What's between, resolved on its own (emphasis inside, never across the edge).
        let between = events.slice(open + 1, index);
        const called = new Set<Resolver>();
        for (const c of context.parser.constructs.insideSpan.null ?? []) {
          if (!c.resolveAll || called.has(c.resolveAll)) continue;
          called.add(c.resolveAll);
          between = c.resolveAll(between, context);
        }
        for (const e of between) next.push(e);
        next.push(
          ["exit", text, context],
          ["enter", close[1], context],
          ["exit", close[1], context],
          ["exit", whole, context],
        );
        splice(events, open - 1, index - open + 3, next);
        index = open + next.length - 2;
        break;
      }
    }
    // A sequence that paired with nothing is its text.
    for (const e of events) if (e[1].type === temporary) e[1].type = "data";
    return events;
  };
}

const highlightConstruct = {
  name: "highlight",
  tokenize: sequence(EQUALS, "highlight", true),
  resolveAll: resolver("highlight"),
};
const commentConstruct = {
  name: "comment",
  tokenize: sequence(PERCENT, "comment", false),
  resolveAll: resolver("comment"),
};

export const obsidianSyntax = {
  text: { [EQUALS]: highlightConstruct, [PERCENT]: commentConstruct },
  insideSpan: { null: [highlightConstruct, commentConstruct] },
  // `==**bold**==`: emphasis may open and close beside a highlight's marker, as beside `~~`.
  attentionMarkers: { null: [EQUALS] },
};

// mdast-util-from-markdown extension. `this` is the compile context.
interface CompileContext {
  enter(node: unknown, token: unknown): void;
  exit(token: unknown): void;
}

export const obsidianFromMarkdown = {
  canContainEols: ["highlight", "comment"],
  enter: {
    highlight(this: CompileContext, token: unknown) {
      this.enter({ type: "highlight", children: [] } satisfies Highlight, token);
    },
    comment(this: CompileContext, token: unknown) {
      this.enter({ type: "comment", children: [] } satisfies Comment, token);
    },
  },
  exit: {
    highlight(this: CompileContext, token: unknown) {
      this.exit(token);
    },
    comment(this: CompileContext, token: unknown) {
      this.exit(token);
    },
  },
};

/** unified plugin: register the syntax and the mdast conversion. */
export function remarkObsidian(this: { data(): Record<string, unknown[]> }) {
  const data = this.data();
  (data.micromarkExtensions ??= []).push(obsidianSyntax);
  (data.fromMarkdownExtensions ??= []).push(obsidianFromMarkdown);
}

// ---------------------------------------------------------------------------------------------
// Comments over blank lines.

interface Node {
  type: string;
  children?: Node[];
  data?: Record<string, unknown>;
  position?: {
    start: { line: number; column: number; offset?: number };
    end: { line: number; column: number; offset?: number };
  };
}

/** Kinds of block that hold blocks: where a comment over blank lines is looked for too. */
const CONTAINERS = new Set(["blockquote", "list", "listItem", "footnoteDefinition"]);

/**
 * Each paragraph that starts with a `%%` pairing with nothing marked as opening a comment over blank lines, and one
 * that ends with one as closing it — from `text`, while the offsets are there: an escaped `\%%` is text, as is `%%%`.
 */
export function markCommentEnds(nodes: readonly unknown[], text: string): void {
  for (const n of nodes as Node[]) {
    if (n.type === "paragraph" && n.children?.length) {
      const first = n.children[0]!;
      const last = n.children[n.children.length - 1]!;
      const at = first.position?.start.offset;
      const end = last.position?.end.offset;
      if (first.type === "text" && at !== undefined && text.startsWith("%%", at) && text[at + 2] !== "%")
        (n.data ??= {}).commentOpens = true;
      if (
        last.type === "text" &&
        end !== undefined &&
        end >= 2 &&
        text.slice(end - 2, end) === "%%" &&
        text[end - 3] !== "%" &&
        text[end - 3] !== "\\"
      )
        (n.data ??= {}).commentCloses = true;
    }
    if (n.children && n.type !== "paragraph") markCommentEnds(n.children, text);
  }
}

/** A block that closes a comment over blank lines: a paragraph ending with a `%%` pairing with nothing — or a list or a
 *  quote whose last block does (a `%%` on the line after a list's last item is that item's, as a lazy line). */
function closes(n: Node): boolean {
  if (n.type === "paragraph") return !!n.data?.commentCloses;
  const last = CONTAINERS.has(n.type) ? n.children?.[n.children.length - 1] : undefined;
  return !!last && closes(last);
}

/**
 * Blocks with their comments over blank lines made blocks of their own: from a paragraph opening one to the next block
 * that closes one, at the same level. The nodes are never changed (a parse's cache shares them): a level that holds one
 * is a new array, its parents copies.
 */
export function blockComments<T>(nodes: T[]): T[] {
  const list = nodes as unknown as Node[];
  let out: Node[] | null = null;
  for (let i = 0; i < list.length; i++) {
    const n = list[i]!;
    if (n.type === "paragraph" && n.data?.commentOpens) {
      let j = i + 1;
      while (j < list.length && !closes(list[j]!)) j++;
      if (j < list.length) {
        out ??= list.slice(0, i);
        const start = n.position?.start;
        const end = list[j]!.position?.end;
        out.push({
          type: "commentBlock",
          children: list.slice(i, j + 1),
          ...(start && end ? { position: { start, end } } : {}),
        });
        i = j;
        continue;
      }
    }
    const kids = n.children && CONTAINERS.has(n.type) ? blockComments(n.children) : null;
    const m = kids && kids !== n.children ? { ...n, children: kids } : n;
    if (out) out.push(m);
    else if (m !== n) {
      out = list.slice(0, i);
      out.push(m);
    }
  }
  return (out ?? list) as unknown as T[];
}

// ---------------------------------------------------------------------------------------------
// Reading them.

/** A comment, in a paragraph or over blank lines: never drawn. */
export function isComment(n: { type: string }): boolean {
  return n.type === "comment" || n.type === "commentBlock";
}

/** A paragraph that holds nothing but comments (and the spaces and breaks around them): no paragraph to draw. */
export function onlyComments(children: readonly PhrasingContent[]): boolean {
  return (
    children.some((k) => k.type === "comment") &&
    children.every((k) => k.type === "comment" || k.type === "break" || (k.type === "text" && !k.value.trim()))
  );
}

/**
 * Inline content without its comments, the white space where one was made one: `a %%x%% b` is `a b`, a comment that
 * starts or ends a line leaves no space there. A new array and new text nodes; `nodes` as they were.
 */
export function withoutComments(nodes: readonly PhrasingContent[]): PhrasingContent[] {
  if (!nodes.some((n) => n.type === "comment")) return [...nodes];
  const out: PhrasingContent[] = [];
  let dropped = false;
  for (const n of nodes) {
    if (n.type === "comment") {
      dropped = true;
      continue;
    }
    let m = n;
    if (dropped && m.type === "text") {
      const prev = out[out.length - 1];
      if (!prev || prev.type === "break" || (prev.type === "text" && /\s$/.test(prev.value)))
        m = { ...m, value: m.value.replace(/^\s+/, "") };
      if (!m.value) continue;
      // `oil %%a note%%.`: the space before it goes too, where what follows closes the sentence.
      if (prev?.type === "text" && /\s$/.test(prev.value) && /^[.,;:!?)\]}…]/.test(m.value)) {
        const value = prev.value.replace(/\s+$/, "");
        if (value) out[out.length - 1] = { ...prev, value };
        else out.pop();
      }
    }
    dropped = false;
    out.push(m);
  }
  const last = out[out.length - 1];
  if (dropped && last?.type === "text") {
    const value = last.value.replace(/\s+$/, "");
    if (value) out[out.length - 1] = { ...last, value };
    else out.pop();
  }
  return out;
}
