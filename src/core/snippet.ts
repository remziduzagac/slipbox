// A language server's snippet (plan 25.8), in LSP's grammar: text, with tab stops (`$1`, `${1}`), placeholders
// (`${1:name}`, nested `${1:a ${2:b}}`), choices (`${1|one,two|}`: the first put in), variables (`$TM_FILENAME`,
// `${TM_SELECTED_TEXT:default}`) and `\$ \} \\` escapes; a transform (`${1/a/b/}`) is read and left out. Expanded: the
// text to put in — each new line indented as the line it goes on, a tab as the file indents — and each stop's places
// in it, `$0` last (the snippet's end where it has none), a stop written again (`$1 … $1`) a mirror of its
// placeholder, given its text.

/** A stop's places in the expanded text, `[from, to)`: the first where it's typed in, the rest mirrors. */
export interface SnippetStop {
  n: number;
  ranges: [number, number][];
}

export interface Snippet {
  text: string;
  /** In the order `tab` goes: 1, 2, … then 0. */
  stops: SnippetStop[];
}

export interface SnippetContext {
  /** The line's indentation, before each line after the first. */
  indent: string;
  /** One level of indentation, for each tab in the snippet. */
  unit: string;
  /** Variables by name (`TM_FILENAME`…); one not given: its default, else its name. */
  vars: Record<string, string>;
}

/** Expand a snippet's source: its text, and where its stops are in it. */
export function expandSnippet(src: string, ctx: SnippetContext): Snippet {
  let i = 0;
  let out = "";
  const stops = new Map<number, [number, number][]>();
  const put = (s: string) => {
    out += s.replace(/\t/g, ctx.unit).replace(/\n/g, `\n${ctx.indent}`);
  };
  const mark = (n: number, from: number) => stops.set(n, [...(stops.get(n) ?? []), [from, out.length]]);
  /** Literal text up to one of `stop`'s characters (unescaped), escapes read. */
  const text = (stop: string): string => {
    let s = "";
    while (i < src.length && !stop.includes(src[i]!) && !(src[i] === "$" && /[\d{_a-zA-Z]/.test(src[i + 1] ?? ""))) {
      if (src[i] === "\\" && i + 1 < src.length && "$}\\,|".includes(src[i + 1]!)) {
        s += src[i + 1];
        i += 2;
      } else s += src[i++];
    }
    return s;
  };
  /** Pieces until the closing `}` of a placeholder (or the end, at the top). */
  const pieces = (inside: boolean) => {
    while (i < src.length) {
      if (inside && src[i] === "}") return;
      if (src[i] === "$") {
        piece();
        continue;
      }
      put(text(inside ? "}" : ""));
    }
  };
  /** A `$…` at `i`: a stop, a placeholder, a choice or a variable; a `$` that's none of them, itself. */
  const piece = () => {
    const start = i;
    i++; // $
    const plain = /^(\d+|[_a-zA-Z][_a-zA-Z0-9]*)/.exec(src.slice(i));
    if (plain) {
      i += plain[0].length;
      return /^\d/.test(plain[0]) ? mark(Number(plain[0]), out.length) : put(variable(plain[0], undefined));
    }
    if (src[i] !== "{") return put("$");
    i++; // {
    const head = /^(\d+|[_a-zA-Z][_a-zA-Z0-9]*)/.exec(src.slice(i));
    if (!head) {
      i = start + 1;
      return put("$");
    }
    i += head[0].length;
    const isStop = /^\d/.test(head[0]);
    const from = out.length;
    const c = src[i];
    if (c === "}") {
      i++;
      return isStop ? mark(Number(head[0]), from) : put(variable(head[0], undefined));
    }
    if (c === ":") {
      i++;
      if (isStop) {
        pieces(true);
        i++; // }
        return mark(Number(head[0]), from);
      }
      // A variable's default: put in only where it has no value.
      const before = out;
      pieces(true);
      i++;
      const value = ctx.vars[head[0]];
      if (value !== undefined) out = before + value.replace(/\n/g, `\n${ctx.indent}`);
      return;
    }
    if (c === "|" && isStop) {
      i++;
      const choices: string[] = [];
      for (;;) {
        choices.push(text(",|"));
        if (src[i] === ",") i++;
        else break;
      }
      i += 2; // |}
      put(choices[0] ?? "");
      return mark(Number(head[0]), from);
    }
    if (c === "/") {
      // A transform, read past — its regex, its format (which has `${1:/upcase}`s of its own), its options — and
      // the stop (or variable) as it is.
      i++;
      while (i < src.length && src[i] !== "/") i += src[i] === "\\" ? 2 : 1;
      i++;
      for (let depth = 0; i < src.length && (depth > 0 || src[i] !== "/"); i++) {
        if (src[i] === "\\") i++;
        else if (src[i] === "$" && src[i + 1] === "{") depth++;
        else if (src[i] === "}" && depth > 0) depth--;
      }
      while (i < src.length && src[i] !== "}") i++;
      i++;
      return isStop ? mark(Number(head[0]), from) : put(variable(head[0], undefined));
    }
    // Not the grammar's: the text as written.
    i = start + 1;
    put("$");
  };
  const variable = (name: string, fallback: string | undefined) => ctx.vars[name] ?? fallback ?? name;
  pieces(false);
  // `$0` last; the snippet's end where it has none.
  if (!stops.has(0)) stops.set(0, [[out.length, out.length]]);
  // Each stop's placeholder first (it's typed there); its empty mirrors given its text, from the end back so the places
  // before each stay put — those after it, and those it's inside, moved along.
  for (const [n, ranges] of stops) {
    const main = ranges.find(([a, b]) => b > a) ?? ranges[0]!;
    stops.set(n, [main, ...ranges.filter((r) => r !== main)]);
  }
  const fills = [...stops.values()].flatMap((ranges) => ranges.slice(1).filter(([a, b]) => a === b && ranges[0]![1] > ranges[0]![0]).map((r) => ({ r, text: "", of: ranges[0]! })));
  for (const f of fills) f.text = out.slice(f.of[0], f.of[1]);
  for (const f of fills.sort((x, y) => y.r[0] - x.r[0])) {
    const at = f.r[0];
    const len = f.text.length;
    out = out.slice(0, at) + f.text + out.slice(at);
    for (const ranges of stops.values()) {
      for (const r of ranges) {
        if (r === f.r) r[1] += len;
        else if (r[0] >= at) (r[0] += len), (r[1] += len);
        else if (r[1] > at) r[1] += len;
      }
    }
  }
  const order = [...stops.keys()].filter((n) => n > 0).sort((a, b) => a - b);
  return { text: out, stops: [...order, 0].map((n) => ({ n, ranges: stops.get(n)! })) };
}

/** A snippet's text alone: what it puts in, stops and all, with nothing to tab through (no session). */
export function snippetText(src: string, ctx: SnippetContext): string {
  return expandSnippet(src, ctx).text;
}
