// Documentation formats (plan 24.4): a doc comment's or a docstring's text read into one shape — prose, then a list
// of terms (each parameter, what it returns or yields, what it raises, other tags) — whatever convention wrote it:
// JSDoc, Google, NumPy, reStructuredText (Sphinx). The code view draws that shape the same way in every language, so
// a TypeScript function's documentation and a Python one's read alike.

export interface DocTag {
  /** A parameter's name, `returns`, `yields`, `raises`, or another tag's name. */
  term: string;
  type: string;
  desc: string;
  /** The text line it starts on (0-based). */
  line: number;
}

export interface DocText {
  /** The prose, as markdown: each line with the text line it came from (0-based). */
  body: { text: string; line: number }[];
  tags: DocTag[];
}

const GOOGLE =
  /^(Args|Arguments|Parameters|Params|Keyword Args|Keyword Arguments|Other Parameters|Attributes|Returns|Return|Yields|Yield|Raises|Raise|Exceptions)\s*:\s*$/;
const NUMPY = /^(Parameters|Other Parameters|Attributes|Returns|Yields|Raises)$/;
const lead = (s: string) => s.length - s.trimStart().length;

/** What a section's name makes of its entries: parameters by name, a return, or what it raises. */
function kindOf(section: string): "params" | "returns" | "yields" | "raises" {
  const s = section.toLowerCase();
  if (s.startsWith("return")) return "returns";
  if (s.startsWith("yield")) return "yields";
  if (s.startsWith("raise") || s.startsWith("exception")) return "raises";
  return "params";
}

/**
 * A documentation text (its markers already gone, dedented) read into prose and terms. `jsdoc`: `@tags` from the first
 * one on; a docstring: Google's sections (`Args:`), NumPy's (`Parameters` over dashes) or reST's fields (`:param x:`),
 * wherever they are, the rest prose; `block`: prose.
 */
export function readDoc(lines: string[], style: "jsdoc" | "docstring" | "block" | "lines"): DocText {
  if (style === "jsdoc" || style === "lines") return readJsdoc(lines);
  if (style === "block") return { body: lines.map((text, line) => ({ text, line })), tags: [] };
  const tags: DocTag[] = [];
  const taken = new Set<number>();
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i]!.trim();
    // Google: `Args:`, its entries indented under it.
    const google = GOOGLE.exec(t);
    // NumPy: `Parameters`, a line of dashes under it, its entries at the section's indentation.
    const numpy = NUMPY.test(t) && /^\s*-{3,}\s*$/.test(lines[i + 1] ?? "") ? t : null;
    if (google || numpy) {
      const kind = kindOf(google ? google[1]! : numpy!);
      const base = lead(lines[i]!);
      const start = numpy ? i + 2 : i + 1;
      let end = start;
      while (
        end < lines.length &&
        (!lines[end]!.trim() ||
          (google
            ? lead(lines[end]!) > base
            : !(NUMPY.test(lines[end]!.trim()) && /^\s*-{3,}\s*$/.test(lines[end + 1] ?? ""))))
      )
        end++;
      while (end > start && !lines[end - 1]!.trim()) end--;
      for (let k = i; k < end; k++) taken.add(k);
      readSection(lines.slice(start, end), start, kind, numpy !== null, tags);
      i = end - 1;
      continue;
    }
    // reST: `:param name: what`, `:type name: T`, `:returns: what`, `:rtype: T`, `:raises E: when`.
    const field = /^:(\w+)(?:\s+([^:]+?))?:\s*(.*)$/.exec(t);
    if (field) {
      const [, f, arg = "", rest = ""] = field;
      const words = arg.trim().split(/\s+/);
      taken.add(i);
      if (/^(param|parameter|arg|argument|key|keyword)$/.test(f!))
        tags.push({
          term: words.at(-1)!,
          type: words.length > 1 ? words.slice(0, -1).join(" ") : "",
          desc: rest,
          line: i,
        });
      else if (f === "type") {
        const p = tags.find((x) => x.term === arg.trim());
        if (p) p.type = rest;
      } else if (/^returns?$/.test(f!)) tags.push({ term: "returns", type: "", desc: rest, line: i });
      else if (f === "rtype") {
        const r = tags.find((x) => x.term === "returns");
        if (r) r.type = rest;
        else tags.push({ term: "returns", type: rest, desc: "", line: i });
      } else if (/^(raises?|except|exception)$/.test(f!))
        tags.push({ term: "raises", type: arg.trim(), desc: rest, line: i });
      else tags.push({ term: f!, type: "", desc: `${arg ? `${arg.trim()} ` : ""}${rest}`.trim(), line: i });
      // Its description going on, indented, on the lines after it.
      while (
        i + 1 < lines.length &&
        lines[i + 1]!.trim() &&
        lead(lines[i + 1]!) > lead(lines[i]!) &&
        !lines[i + 1]!.trim().startsWith(":")
      ) {
        tags[tags.length - 1]!.desc += ` ${lines[++i]!.trim()}`;
        taken.add(i);
      }
    }
  }
  const body = lines.map((text, line) => ({ text: rest(text), line })).filter((l) => !taken.has(l.line));
  while (body.length && !body[body.length - 1]!.text.trim()) body.pop();
  return { body, tags };
}

/** reST's inline markup as markdown: ``code`` and :role:`name` as code. */
function rest(text: string): string {
  return text.replace(/``([^`]+)``/g, "`$1`").replace(/:[\w:]+:`([^`]+)`/g, "`$1`");
}

/** A Google or NumPy section's entries, as terms. */
function readSection(
  lines: string[],
  first: number,
  kind: "params" | "returns" | "yields" | "raises",
  numpy: boolean,
  out: DocTag[],
): void {
  const items = lines.filter((l) => l.trim());
  if (!items.length) return;
  const at = Math.min(...items.map(lead));
  let cur: DocTag | null = null;
  lines.forEach((l, k) => {
    const t = l.trim();
    if (!t) return;
    if (lead(l) > at && cur) {
      cur.desc += `${cur.desc ? " " : ""}${t}`;
      return;
    }
    const line = first + k;
    if (kind === "params") {
      // Google `name (type): what`; NumPy `name : type`, what on the lines under it.
      const m = numpy
        ? /^(\*{0,2}[\w.]+)\s*(?::\s*(.*))?$/.exec(t)
        : /^(\*{0,2}[\w.]+)\s*(?:\(([^)]*)\))?\s*:\s*(.*)$/.exec(t);
      cur = m
        ? { term: m[1]!, type: (numpy ? m[2] : m[2]) ?? "", desc: numpy ? "" : (m[3] ?? ""), line }
        : { term: t, type: "", desc: "", line };
    } else if (kind === "raises") {
      // Google `Error: when`; NumPy `Error`, when under it.
      const m = /^([\w.]+)\s*:?\s*(.*)$/.exec(t);
      cur = { term: "raises", type: m?.[1] ?? t, desc: m?.[2] ?? "", line };
    } else {
      // Google `type: what` (or just what); NumPy `type` (or `name : type`), what under it.
      const m = numpy ? /^(?:[\w]+\s*:\s*)?(.+)$/.exec(t) : /^([\w.[\], |]+):\s+(.*)$/.exec(t);
      cur = numpy
        ? { term: kind, type: m?.[1] ?? t, desc: "", line }
        : m
          ? { term: kind, type: m[1]!, desc: m[2]!, line }
          : { term: kind, type: "", desc: t, line };
    }
    out.push(cur);
  });
}

/** JSDoc: prose, then `@param {T} name - what`, `@returns what`, and other tags by their name — Javadoc's, PHPDoc's
 *  (`@param T $name`) and Doxygen's (`\param`) too, and LuaDoc's in line comments. */
function readJsdoc(lines: string[]): DocText {
  const at = lines.findIndex((t) => /^\s*[@\\]\w/.test(t));
  const body = (at < 0 ? lines : lines.slice(0, at)).map((text, line) => ({ text, line }));
  while (body.length && !body[body.length - 1]!.text.trim()) body.pop();
  const tags: DocTag[] = [];
  if (at < 0) return { body, tags };
  for (let k = at; k < lines.length; k++) {
    const t = lines[k]!.trim();
    const m = /^[@\\](\w+)\s*(\{[^}]*\})?\s*(.*)$/.exec(t);
    if (m) {
      const [, tag, type = "", rest = ""] = m;
      const param = /^(param|arg|argument|property|prop)$/.test(tag!);
      // PHPDoc's type comes before the name, `$` and all: `@param string $name who`.
      const php = param && !type ? /^([^\s$]+)\s+(\$\w+)\s*(?:-\s*)?(.*)$/.exec(rest) : null;
      const p = param && !php ? /^(\[?[\w$.]+(?:=[^\]]*)?\]?)\s*(?:-\s*)?(.*)$/.exec(rest) : null;
      const term = php ? php[2]! : p ? p[1]! : tag === "return" || tag === "returns" ? "returns" : tag!;
      tags.push({
        term,
        type: php ? php[1]! : type.replace(/^\{|\}$/g, ""),
        desc: php ? php[3]! : p ? p[2]! : rest,
        line: k,
      });
    } else if (t && tags.length) tags[tags.length - 1]!.desc += ` ${t}`;
  }
  return { body, tags };
}
