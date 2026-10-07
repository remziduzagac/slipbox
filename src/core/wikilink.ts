// Wikilinks and embeds as a micromark extension: `[[target#heading|alias]]` and `![[target]]`.
//
// Written here rather than taken from `remark-wiki-link`, which does not parse `![[embeds]]`.
// Being a real tokenizer keeps the properties that matter: inline code and fenced blocks are
// never scanned, `\[[escaped]]` stays literal, and every node carries its source position.

import type { Literal } from "mdast";

export interface WikiLink extends Literal {
  type: "wikiLink";
  /** Raw text between the brackets. */
  value: string;
  target: string;
  heading: string | null;
  block: string | null;
  alias: string | null;
  embed: boolean;
}

declare module "mdast" {
  interface PhrasingContentMap {
    wikiLink: WikiLink;
  }
  interface RootContentMap {
    wikiLink: WikiLink;
  }
}

const EXCLAMATION = 33;
const LEFT_BRACKET = 91;
const RIGHT_BRACKET = 93;

// Minimal structural types for micromark's tokenizer API; the package types are not a direct dep.
type Code = number | null;
type State = (code: Code) => State | undefined;
interface Effects {
  enter(type: string): unknown;
  exit(type: string): unknown;
  consume(code: Code): void;
}

function tokenize(this: unknown, effects: Effects, ok: State, nok: State): State {
  let opened = 0;
  let size = 0;

  const start: State = (code) => {
    effects.enter("wikiLink");
    effects.enter("wikiLinkMarker");
    if (code === EXCLAMATION) {
      effects.consume(code);
      return open;
    }
    return open(code);
  };

  const open: State = (code) => {
    if (code !== LEFT_BRACKET) return nok(code);
    effects.consume(code);
    opened++;
    if (opened < 2) return open;
    effects.exit("wikiLinkMarker");
    return data;
  };

  const data: State = (code) => {
    // No line endings (codes < 0 are micromark's virtual whitespace/eol), no nesting.
    if (code === null || code < 0 || code === 10 || code === 13 || code === LEFT_BRACKET) return nok(code);
    if (code === RIGHT_BRACKET) {
      if (size === 0) return nok(code);
      effects.exit("wikiLinkData");
      effects.enter("wikiLinkMarker");
      effects.consume(code);
      return close;
    }
    if (size === 0) effects.enter("wikiLinkData");
    // Keep `\]` inside data so `[[a\|b]]` (table-cell alias) survives.
    effects.consume(code);
    size++;
    return data;
  };

  const close: State = (code) => {
    if (code !== RIGHT_BRACKET) return nok(code);
    effects.consume(code);
    effects.exit("wikiLinkMarker");
    effects.exit("wikiLink");
    return ok;
  };

  return start;
}

const construct = { name: "wikiLink", tokenize, add: "before" as const };

export const wikiLinkSyntax = {
  text: { [LEFT_BRACKET]: construct, [EXCLAMATION]: construct },
};

/** Split `target#heading^block|alias` into its parts. `\|` is an alias divider too. */
export function parseWikiTarget(raw: string): Pick<WikiLink, "target" | "heading" | "block" | "alias"> {
  let rest = raw;
  let alias: string | null = null;
  const pipe = rest.search(/\\?\|/);
  if (pipe >= 0) {
    const m = rest.slice(pipe).match(/^\\?\|/)!;
    alias = rest.slice(pipe + m[0].length).trim() || null;
    rest = rest.slice(0, pipe);
  }
  let block: string | null = null;
  let heading: string | null = null;
  const caret = rest.indexOf("#^");
  if (caret >= 0) {
    block = rest.slice(caret + 2).trim() || null;
    rest = rest.slice(0, caret);
  } else {
    // `note^id` too, but only an id after the caret, and no heading before it: a caret in a heading
    // (`#O(n^2)`) or before what isn't an id (`f^(n)`) is the text's.
    const hat = rest.lastIndexOf("^");
    const id = rest.slice(hat + 1).trim();
    if (hat >= 0 && !rest.slice(0, hat).includes("#") && /^[A-Za-z0-9-]+$/.test(id)) {
      block = id;
      rest = rest.slice(0, hat);
    }
  }
  const hash = rest.indexOf("#");
  if (hash >= 0) {
    heading = rest.slice(hash + 1).trim() || null;
    rest = rest.slice(0, hash);
  }
  return { target: rest.trim(), heading, block, alias };
}

// mdast-util-from-markdown extension. `this` is the compile context.
interface CompileContext {
  enter(node: unknown, token: unknown): void;
  exit(token: unknown): void;
  sliceSerialize(token: unknown): string;
  stack: unknown[];
}

export const wikiLinkFromMarkdown = {
  enter: {
    wikiLink(this: CompileContext, token: unknown) {
      const raw = this.sliceSerialize(token);
      const embed = raw.startsWith("!");
      const inner = raw.slice(embed ? 3 : 2, -2);
      const node: WikiLink = { type: "wikiLink", value: inner, embed, ...parseWikiTarget(inner) };
      this.enter(node, token);
    },
  },
  exit: {
    wikiLink(this: CompileContext, token: unknown) {
      this.exit(token);
    },
  },
};

/** unified plugin: register the syntax and the mdast conversion. */
export function remarkWikiLink(this: { data(): Record<string, unknown[]> }) {
  const data = this.data();
  (data.micromarkExtensions ??= []).push(wikiLinkSyntax);
  (data.fromMarkdownExtensions ??= []).push(wikiLinkFromMarkdown);
}
