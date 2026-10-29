// Chunk boundaries, list seams and shifted positions, retaining original admission rules.

import type { Root } from "mdast";
import { ORIGIN } from "./contracts.ts";

/** A chunk ends before an ATX heading only after at least this many lines: fewer, larger parses. */
const CHUNK_LINES = 40;

const LIST_ITEM = /^(?:[-*+]|\d{1,9}[.)])(?:[ \t]|$)/;

const BLOCK_TAGS =
  "address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul";

/** CommonMark's HTML block kind 6: a block-level tag, which may even interrupt a paragraph. */
const HTML_BLOCK = new RegExp(`^ {0,3}</?(?:${BLOCK_TAGS})(?:[\\s/>]|$)`, "i");

/** Kind 7: a line that is one whole tag, starting a block (it can't interrupt a paragraph). */
const HTML_TAG_LINE =
  /^ {0,3}(?:<[A-Za-z][A-Za-z0-9-]*(?:\s+[A-Za-z_:][\w.:-]*(?:\s*=\s*(?:[^\s"'=<>`]+|'[^']*'|"[^"]*"))?)*\s*\/?>|<\/[A-Za-z][A-Za-z0-9-]*\s*>)\s*$/;

/** HTML block kinds 1–5, which blank lines don't end, at a line's start. */
const HTML_OPEN = /^ {0,3}(<!--|<\?|<!\[CDATA\[|<![A-Za-z]|<(?:script|pre|style|textarea)(?=[\s>]|$))/i;

/** A list item at the first column with something in it (an empty one can't interrupt a paragraph). */
const FULL_ITEM = /^(?:[-*+]|\d{1,9}[.)])[ \t]+\S/;

/**
 * Where the note can be parsed in pieces with the same result as whole, outside frontmatter,
 * fenced code and the HTML blocks that run across blank lines (comments, `<script>`, `<pre>`,
 * `<style>`, `<textarea>`, `<?`, `<!X`, CDATA):
 *
 * - before a line that starts at its first column, after a blank line: whatever came before has
 *   ended (a list item's content would be indented, a lazy line needs no blank before it);
 * - before a list item at the first column, right after a line of the list, when the block these
 *   lines belong to began as such a list (after a blank line, a fence or a heading) — not text, not
 *   an HTML block that happens to hold a `- ` line: the list goes on in the next chunk, and
 *   `mergeLists` joins the two halves again.
 *
 * Returns the first line (0-based) of each chunk.
 */
export function chunkStarts(lines: string[], min = CHUNK_LINES): number[] {
  const starts = [0];
  let fence: string | null = null;
  let front = lines[0]?.replace(/\r$/, "") === "---" || lines[0]?.replace(/\r$/, "") === "+++";
  const frontEnd = lines[0]?.replace(/\r$/, "") === "+++" ? /^\+\+\+\s*$/ : /^(---|\.\.\.)\s*$/;
  /** An open HTML block of kinds 1–5 (comments, <script>…): what ends it. */
  let html: Pick<RegExp, "test"> | null = null;
  /** An open HTML block of kinds 6–7: a blank line ends it. */
  let htmlToBlank = false;
  /** A lone tag where a paragraph might go on: HTML or text, either way ended by a blank line. */
  let unsure = false;
  /** The line after a blank line, a heading, a closed fence or HTML block: a block starts here. */
  let fresh = true;
  /** The current block began, at such a start, as a list at the first column, and nothing in it
   *  since has been anything but its items and their indented lines. */
  let inList = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (front) {
      if (i > 0 && frontEnd.test(line)) {
        front = false;
        fresh = true;
      }
      continue;
    }
    if (html) {
      if (html.test(line)) {
        html = null;
        fresh = true;
      }
      continue;
    }
    // A maths block's `$$` is a fence too (12.11) — unless more `$` follow on its line: `$$x$$` is text.
    let f = /^\s{0,3}(`{3,}|~{3,}|\${2,})/.exec(line);
    if (f && f[1]![0] === "$" && !fence && line.slice(f[0].length).includes("$")) f = null;
    if (fence) {
      if (f && f[1]![0] === fence[0] && f[1]!.length >= fence.length && !line.slice(f[0].length).trim()) {
        fence = null;
        fresh = true;
      }
      continue;
    }
    if (!line.trim()) {
      fresh = true;
      htmlToBlank = false;
      unsure = false;
      continue;
    }
    if (htmlToBlank) continue;
    const open = HTML_OPEN.exec(line);
    const opensHtml = open && !htmlEnd(open[1]!).test(line.slice(open.index + open[0].length));
    if (unsure) {
      // HTML or a paragraph's text: a fence or an unclosed comment here is one or the other, and
      // which decides where every later line belongs. Past that, the note stays whole.
      if (f || opensHtml) return starts;
      continue;
    }
    const startsBlock = fresh;
    fresh = false;
    // (A list that starts at a number other than 1 is text after indented code: not certain.)
    if (startsBlock) inList = FULL_ITEM.test(line) && !/^\d/.test(line.replace(/^0*1(?=[.)])/, ""));
    // Never before an empty item ("1." alone) or, after a blank line, an ordered one not starting
    // at 1: what those are depends on what came before (after indented code, a paragraph).
    const risky =
      (LIST_ITEM.test(line) && !FULL_ITEM.test(line)) ||
      (startsBlock && /^\d{1,9}[.)]/.test(line) && !/^0*1[.)]/.test(line));
    if (i - starts[starts.length - 1]! >= min && /^\S/.test(line) && !risky) {
      const prev = lines[i - 1] ?? "";
      // After a blank line, anything; after text, only the next item of a list at the first column.
      if (
        !prev.trim() ||
        (inList && !startsBlock && FULL_ITEM.test(line) && (FULL_ITEM.test(prev) || /^\s/.test(prev)))
      )
        starts.push(i);
    }
    if (f) {
      fence = f[1]!;
      inList = false;
      continue;
    }
    // HTML kinds 1–5 run to their end marker, across blank lines.
    if (opensHtml) {
      html = htmlEnd(open[1]!);
      inList = false;
      continue;
    }
    // Kind 6 (a block-level tag, which may interrupt a paragraph) runs to the next blank line; so
    // does kind 7 (a lone tag) where a block starts — elsewhere it may be a paragraph's text.
    if (HTML_BLOCK.test(line) || (startsBlock && HTML_TAG_LINE.test(line))) {
      htmlToBlank = true;
      inList = false;
      continue;
    }
    if (HTML_TAG_LINE.test(line)) {
      unsure = true;
      inList = false;
      continue;
    }
    // A heading starts a block after it; anything else at the first column that isn't an item, or
    // anything the list's items don't usually hold, ends the certainty that this is one list.
    if (/^ {0,3}#{1,6}(\s|$)/.test(line)) {
      fresh = true;
      inList = false;
    } else if ((/^\S/.test(line) && !FULL_ITEM.test(line)) || /^\s*(?:[<|=]|[-*_](?:\s*[-*_]){2,}\s*$)/.test(line))
      inList = false;
  }
  return starts;
}

/** What ends an HTML block of kinds 1–5, from its opening. Kind 1 (<script>, <pre>, <style>,
 *  <textarea>) ends at the end tag of any of the four. */
export function htmlEnd(tag: string): Pick<RegExp, "test"> {
  const t = tag.toLowerCase();
  const literal =
    t === "<!--" ? "-->" : t === "<?" ? "?>" : t.startsWith("<![cdata[") ? "]]>" : t.startsWith("<!") ? ">" : null;
  return literal === null ? /<\/(?:script|pre|style|textarea)>/i : { test: (line: string) => line.includes(literal) };
}

/**
 * A list the chunking cut in two, joined again: at each seam, a list ending one chunk and a list
 * starting the next are one list when the whole note would make them one — both ordered or both
 * not, with the same marker (`-` `*` `+`, or `.` `)`). A blank line between them makes it loose.
 * The halves are copied, never changed: cached chunks share them.
 */
export function mergeLists(children: Root["children"], seams: number[], lines: string[]): void {
  for (let k = seams.length - 1; k >= 0; k--) {
    const at = seams[k]!;
    const a = children[at - 1];
    const b = children[at];
    if (a?.type !== "list" || b?.type !== "list" || a.ordered !== b.ordered) continue;
    const marker = (l: { position?: { start: { line: number } } }) => {
      const m = /^\s*(?:\d{1,9}([.)])|([-*+]))/.exec(lines[(l.position?.start.line ?? 1) - 1] ?? "");
      return m?.[1] ?? m?.[2] ?? "";
    };
    if (marker(a) !== marker(b)) continue;
    const endA = a.position?.end.line ?? 0;
    const startB = b.position?.start.line ?? 0;
    const gap = lines.slice(endA, startB - 1).some((l) => !l.trim());
    const merged = {
      ...a,
      [ORIGIN]: undefined, // a new block: nothing cached is it
      spread: !!(a.spread || b.spread || gap),
      children: [...a.children, ...b.children],
      position: a.position && b.position ? { start: a.position.start, end: b.position.end } : a.position,
    };
    children.splice(at - 1, 2, merged);
  }
}

/** A copy of `nodes` with every position moved down `delta` lines (offsets aren't kept). */
export function shifted<T>(nodes: T[], delta: number): T[] {
  const copy = (n: unknown): unknown => {
    const node = n as {
      position?: { start: { line: number; column: number }; end: { line: number; column: number } };
      children?: unknown[];
    };
    const out: Record<string, unknown> = { ...(node as object) };
    if (node.position)
      out.position = {
        start: { line: node.position.start.line + delta, column: node.position.start.column },
        end: { line: node.position.end.line + delta, column: node.position.end.column },
      };
    if (node.children) out.children = node.children.map(copy);
    return out;
  };
  return nodes.map(copy) as T[];
}
