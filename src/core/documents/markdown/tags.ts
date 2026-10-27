// Tags (plan 1.6): `#tag` in a note's text, as Obsidian writes them — letters, digits, `_`, `-`,
// and `/` for nesting (`#project/alpha`), not digits only, after a space or at a line's start — and
// the frontmatter's `tags:`. A micromark extension, as wikilinks are: never read inside code, a URL
// (`page#part`) or a heading's `#` marker; each tag a node with its source position.

import type { Literal } from "mdast";

export interface Hashtag extends Literal {
  type: "hashtag";
  /** The tag's name, without its `#`. */
  value: string;
}

declare module "mdast" {
  interface PhrasingContentMap {
    hashtag: Hashtag;
  }
  interface RootContentMap {
    hashtag: Hashtag;
  }
}

const HASH = 35;
const TAG_CHAR = /^[\p{L}\p{N}\p{M}_\-/]$/u;
const DIGIT = /^\p{N}$/u;

/** A character a tag's name may hold. */
export function isTagChar(ch: string): boolean {
  return TAG_CHAR.test(ch);
}

/** A tag's name as written, cleaned: no `#`, no trailing `/`; null when it can't be one (empty, digits only). */
export function tagName(raw: string): string | null {
  const name = raw.trim().replace(/^#/, "").replace(/\/+$/, "");
  if (!name || ![...name].every(isTagChar) || [...name].every((c) => DIGIT.test(c) || c === "/")) return null;
  return name;
}

/** The key tags are grouped by: `#Project` and `#project` are one tag. */
export function tagKey(name: string): string {
  return name.normalize("NFC").toLowerCase();
}

// Minimal structural types for micromark's tokenizer API (as in wikilink.ts).
type Code = number | null;
type State = (code: Code) => State | undefined;
interface Effects {
  enter(type: string): unknown;
  exit(type: string): unknown;
  consume(code: Code): void;
}

const tagChar = (code: Code) => code !== null && code >= 0 && TAG_CHAR.test(String.fromCodePoint(code));

function tokenize(this: { previous: Code }, effects: Effects, ok: State, nok: State): State {
  const previous = this.previous;
  let word = false;

  const start: State = (code) => {
    // After a space or at a line's start (micromark's line endings and virtual spaces are < 0).
    if (!(previous === null || previous < 0 || previous === 32 || previous === 9)) return nok(code);
    effects.enter("hashtag");
    effects.consume(code);
    return first;
  };

  const first: State = (code) => {
    if (!tagChar(code)) return nok(code);
    return name(code);
  };

  const name: State = (code) => {
    if (tagChar(code)) {
      if (!DIGIT.test(String.fromCodePoint(code!)) && code !== 47) word = true;
      effects.consume(code);
      return name;
    }
    if (!word) return nok(code);
    effects.exit("hashtag");
    return ok(code);
  };

  return start;
}

const construct = { name: "hashtag", tokenize, add: "before" as const };

export const hashtagSyntax = { text: { [HASH]: construct } };

// mdast-util-from-markdown extension. `this` is the compile context.
interface CompileContext {
  enter(node: unknown, token: unknown): void;
  exit(token: unknown): void;
  sliceSerialize(token: unknown): string;
}

export const hashtagFromMarkdown = {
  enter: {
    hashtag(this: CompileContext, token: unknown) {
      const node: Hashtag = { type: "hashtag", value: this.sliceSerialize(token).slice(1).replace(/\/+$/, "") };
      this.enter(node, token);
    },
  },
  exit: {
    hashtag(this: CompileContext, token: unknown) {
      this.exit(token);
    },
  },
};

/** unified plugin: register the syntax and the mdast conversion. */
export function remarkHashtag(this: { data(): Record<string, unknown[]> }) {
  const data = this.data();
  (data.micromarkExtensions ??= []).push(hashtagSyntax);
  (data.fromMarkdownExtensions ??= []).push(hashtagFromMarkdown);
}

/** The tags written in a line of source, with where each starts (UTF-16): source mode's links. */
export function tagsInLine(text: string): { index: number; length: number; name: string }[] {
  const out: { index: number; length: number; name: string }[] = [];
  for (const m of text.matchAll(/(^|[ \t])#([\p{L}\p{N}\p{M}_\-/]+)/gu)) {
    const name = tagName(m[2]!);
    if (!name) continue;
    const index = m.index + m[1]!.length;
    out.push({ index, length: m[2]!.length + 1, name });
  }
  return out;
}
