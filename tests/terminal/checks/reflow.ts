// Reflow: `g q` and `g shift+q` on the reference set's unwrapped retro, to the product repository's markdownlint
// width (`MD013`'s `line_length`, 120); a selection's lines; `:reflow [width]` and `:unwrap`, a range typed or not.

import type { Check } from "../check.ts";
import type { Session } from "../session.ts";
import { findText, ready } from "./editing.ts";

const RETRO = "~/work/product/drafts/2.3-retro.md";

/** Its paragraph, task item and quote at 120 columns: each one line in the note, two here, the link kept whole. */
const AT_120: [string, string][] = [
  [
    "What went well: the [staged rollout](../releases/2.3-plan.md) held at 10% until the stalled-queue rate fell under 0.1%,",
    "and `sync_queue_stalled_total` told us before any rider did.",
  ],
  [
    "- [ ] Write up the retry budget for the sync worker, with the numbers from the",
    "  [September synthesis](../research/synthesis-2026-09.md) and the `retry_after_ms` defaults we settled on",
  ],
  [
    "> Malik: next time the status page text is written before the release, not during the incident, and `status.kestrel.dev`",
    "> is linked from [the product README](../README.md) as well.",
  ],
];

/** The paragraph and the quote at 40 columns: a link longer than that on a line of its own, unbroken. */
const PARAGRAPH_AT_40 = [
  "What went well: the",
  "[staged rollout](../releases/2.3-plan.md)",
  "held at 10% until the stalled-queue rate",
  "fell under 0.1%, and",
  "`sync_queue_stalled_total` told us",
  "before any rider did.",
];
const QUOTE_AT_40 = [
  "> Malik: next time the status page text",
  "> is written before the release, not",
  "> during the incident, and",
  "> `status.kestrel.dev` is linked from",
  "> [the product README](../README.md) as",
  "> well.",
];

/** A block's lines as the note keeps them: one, its continuations' quote marks and indents gone. */
const oneLine = (lines: string[]) => lines.map((l, i) => (i ? l.replace(/^(?:> |\s+)/, "") : l)).join(" ");

/** The note with these blocks' lines in place of each one line. */
const wrapped = (text: string, blocks: string[][]) =>
  blocks.reduce((t, b) => t.replace(oneLine(b), b.join("\n")), text);

/** SOURCE view, by its key (`ctrl+k`, which toggles it). */
async function source(s: Session): Promise<void> {
  if (!s.statusLine().includes("SOURCE")) await s.keys("ctrl+k");
  await s.status("SOURCE");
}

/** Saved, then the note on disk as `want`. */
async function saved(s: Session, want: string, what: string): Promise<void> {
  await s.keys("ctrl+s");
  await s.file(RETRO, (t) => t === want, what);
}

export const REFLOW: Check[] = [
  {
    area: "editing",
    name: "reflow: g q i p wraps an item, a quote and a paragraph to markdownlint's width; g shift+q i p joins each back",
    covers: {
      cases: ["editing"],
      commands: [
        "edit.op_reflow",
        "edit.op_unwrap",
        "visual.line",
        "visual.reflow",
        "visual.unwrap",
        "edit.reflow",
        "edit.unwrap",
        "note.save",
      ],
    },
    options: { home: true, startAt: "home/work/product/drafts/2.3-retro.md", size: { cols: 160, rows: 40 } },
    run: async (s) => {
      const before = s.read(RETRO);
      for (const b of [...AT_120, PARAGRAPH_AT_40, QUOTE_AT_40])
        s.expect(before.includes(`\n${oneLine(b)}\n`), `the retro has "${b[0]!.slice(0, 30)}…" on one line`);
      const at120 = wrapped(before, AT_120);
      await ready(s);
      await source(s);
      // Each to 120 columns, the width said with where it's from; the link that would cross it goes down whole.
      await findText(s, "What went well");
      await s.keys("g", "q", "i", "p");
      await s.message("120 columns");
      await s.message("MD013 in");
      for (const at of ["Write up the retry", "Malik: next time"]) {
        await findText(s, at);
        await s.keys("g", "q", "i", "p");
      }
      await saved(s, at120, "the paragraph, the item and the quote wrapped at 120");
      // g shift+q i p: each back to one line, from the quote, where g q left the cursor.
      await s.keys("g", "shift+q", "i", "p");
      await s.message("unwrapped 1 paragraph");
      for (const at of ["Write up the retry", "What went well"]) {
        await s.keys("g", "g");
        await findText(s, at);
        await s.keys("g", "shift+q", "i", "p");
      }
      await saved(s, before, "each joined back to one line");
      // A selection's lines: from the paragraph to the end wrapped together, then the whole note's joined back.
      await s.keys("g", "g");
      await findText(s, "What went well");
      await s.keys("shift+v", "shift+g", "g", "q");
      await s.message("wrapped 4 paragraphs");
      await saved(s, at120, "the selection's paragraphs wrapped at 120");
      await s.keys("g", "g", "shift+v", "shift+g", "g", "shift+q");
      await s.message("unwrapped 5 paragraphs");
      await saved(s, before, "the selection's paragraphs joined back");
      // :reflow 40 at the cursor; from a selection, its lines typed for you; :%unwrap, the whole note.
      await s.keys("g", "g");
      await findText(s, "What went well");
      await s.ex("reflow 40");
      await s.message("40 columns");
      await s.keys("g", "g");
      await findText(s, "Malik: next time");
      await s.keys("shift+v");
      await s.ex("reflow 40");
      await saved(s, wrapped(before, [PARAGRAPH_AT_40, QUOTE_AT_40]), "the paragraph and the quote wrapped at 40");
      await s.ex("%unwrap");
      await s.message("unwrapped 5 paragraphs");
      await saved(s, before, "the note joined back by :%unwrap");
    },
  },
];
