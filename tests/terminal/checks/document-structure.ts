// Heading renames and document types.

import { type Check, leader, opened } from "../check.ts";

export const DOCUMENT_STRUCTURE: Check[] = [
  {
    area: "reading",
    name: "headings: space n h renames the heading the cursor is in — a preview of each link to it, enter, every link rewritten",
    covers: { cases: ["headings"], commands: ["heading.rename"] },
    options: { open: "equipment/telescope-comparison.md" },
    run: async (s) => {
      await s.ex("13");
      await s.see(/§ Telescope comparison › Fleet at a glance/);
      await leader(s, "n", "h");
      await s.see('rename the heading "Fleet at a glance" to:');
      await s.keys("ctrl+u");
      await s.type("The fleet");
      await s.keys("enter");
      await s.see(/Fleet at a glance → equipment\/telescope-comparison\.md#The/);
      await s.see("people/kenji-mori.md:20");
      await s.keys("enter");
      await s.file("equipment/telescope-comparison.md", (t) => t.includes("\n## The fleet\n"), "the heading renamed");
      await s.file(
        "people/kenji-mori.md",
        (t) => t.includes("(../equipment/telescope-comparison.md#the-fleet)") && !t.includes("#fleet-at-a-glance"),
        "Kenji's link to it rewritten",
      );
      await s.see(/§ Telescope comparison › The fleet/);
    },
  },

  {
    area: "reading",
    name: "document types: space f d lists them with their notes; :type adr the ADRs in order, each its status; ] t and [ t step through them",
    covers: { cases: ["notes"], commands: ["type.list", "type.next", "type.prev"] },
    options: { home: true, startAt: "home/work/kestrel/docs/adr/0002-route-engine-in-rust.md" },
    run: async (s) => {
      await leader(s, "f", "d");
      await s.see("Document types");
      await s.see(/adr\s+4 notes/);
      await s.keys("escape");
      // A list captures the titles indexed when it opens. Reopen until every title is ready; the top bar's
      // spinner reports work without the old "indexing" label.
      await s.retry(
        async () => {
          if (s.rowOf("adr — 4 notes") >= 0) await s.keys("escape");
          await s.ex("type adr");
          await s.see("adr — 4 notes");
        },
        () => [1, 2, 3, 4].every((n) => s.rowOf(`ADR ${n}:`) >= 0),
        "all four indexed ADR titles",
        1000,
        30_000,
      );
      await s.see(/1 +ADR 1: Offline-first sync with an op log +accepted · docs\/adr\/0001-offline-first-sync\.md/);
      await s.see(/4 +ADR 4: A retry budget for the sync queue +proposed · docs\/adr\/0004-retry-budget\.md/);
      await s.keys("escape");
      await s.keys("]", "t");
      await opened(s, "docs/adr/0003-sharing-links.md");
      await s.keys("]", "t");
      await opened(s, "docs/adr/0004-retry-budget.md");
      await s.keys("[", "t");
      await s.keys("[", "t");
      await s.keys("[", "t");
      await opened(s, "docs/adr/0001-offline-first-sync.md");
    },
  },
];
