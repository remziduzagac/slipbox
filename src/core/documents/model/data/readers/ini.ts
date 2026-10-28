// INI/env sections and line values, deliberately distinct from TOML validation.

import type { Root, RootContent } from "mdast";
import type { ParsedData } from "../contracts.ts";
import { alignKeys, heading, kindOf, pos, standsAlone } from "../nodes.ts";

export function readIni(source: string): ParsedData {
  const lines = source.split("\n");
  const out: RootContent[] = [];
  let pending: { text: string[]; line: number } | null = null;
  const flushComment = () => {
    if (pending)
      out.push({
        type: "dataComment",
        text: pending.text.join("\n"),
        position: pos(pending.line, pending.line + pending.text.length - 1),
      } as unknown as RootContent);
    pending = null;
  };
  let error: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i]!.replace(/\r$/, "").trim();
    if (!t) {
      flushComment();
      continue;
    }
    // `!` too: Java's .properties comments.
    if (/^[#;!]/.test(t)) {
      pending ??= { text: [], line: i + 1 };
      pending.text.push(t.replace(/^[#;!]\s?/, ""));
      continue;
    }
    const section = /^\[\s*([^\]]+?)\s*\]$/.exec(t);
    if (section) {
      flushComment();
      out.push(heading(section[1]!.split(".").length, section[1]!, i + 1));
      continue;
    }
    const kv = /^(?:export\s+)?([^=:]+?)\s*[=:]\s*(.*)$/.exec(t);
    if (!kv && !/^[\w.-]+$/.test(t)) {
      error ??= `line ${i + 1}: neither a section, a key nor a comment`;
      flushComment();
      continue;
    }
    const keyLine = i + 1;
    const key = kv ? kv[1]! : t;
    let value = kv ? kv[2]! : "";
    // A value ending in an odd run of backslashes goes on, on the next line when it's indented
    // (.properties): joined, its indent dropped. Not indented, it's a line of its own — an INI's
    // `dir = C:\` is a Windows path.
    while (/(^|[^\\])(\\\\)*\\$/.test(value) && /^[ \t]+\S/.test(lines[i + 1] ?? ""))
      value = `${value.slice(0, -1)}${lines[++i]!.replace(/\r$/, "").trim()}`;
    let comment: string | null = null;
    // Quoted, the value ends at its closing quote: a # or ; inside is its own, one after is a
    // comment (`URL="https://x#top"   # where sync goes`).
    const quoted = /^"(.*?)"\s*(?:[#;]\s?(.*))?$|^'(.*?)'\s*(?:[#;]\s?(.*))?$/.exec(value);
    if (quoted) comment = (quoted[2] ?? quoted[4])?.trim() || null;
    else {
      const c = /\s[#;]\s?(.*)$/.exec(value);
      if (c) {
        comment = c[1]!.trim() || null;
        value = value.slice(0, c.index).trim();
      }
    }
    if (comment || standsAlone(pending, out)) flushComment();
    const first = pending ? pending.line : keyLine;
    comment ??= pending ? pending.text.join(" ") : null;
    pending = null;
    out.push({
      type: "dataField",
      key,
      value: quoted ? (quoted[1] ?? quoted[3])! : value,
      kind: quoted ? "string" : kindOf(value),
      comment,
      keyWidth: 0,
      keyLine,
      position: pos(first, i + 1),
    } as unknown as RootContent);
  }
  flushComment();
  const tree: Root = { type: "root", children: out };
  alignKeys(tree.children);
  return { tree, error };
}
