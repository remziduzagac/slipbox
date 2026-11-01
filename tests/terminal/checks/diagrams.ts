// Background diagrams and pending source.

import { readFileSync } from "node:fs";
import type { Check } from "../check.ts";
import { edit } from "../support/reading.ts";

export const DIAGRAMS: Check[] = [
  {
    area: "reading",
    name: "diagrams: background layout arrives, an external edit replaces it, and navigation still works",
    covers: { cases: ["rendering-in-tui"] },
    run: async (s) => {
      const note = (label: string) => `# Diagram\n\n\`\`\`mermaid\ngraph TD\n  A[${label}] --> B[Ready]\n\`\`\`\n`;
      s.write("background-diagram.md", note("First"));
      await edit(s, "background-diagram.md");
      await s.notSee("A[First]", 5000);
      await s.see(/│\s+First\s+│/);
      s.write("background-diagram.md", note("Second"));
      await s.see(/│\s+Second\s+│/, 5000);
      await s.notSee("First");
      const many = Array.from({ length: 40 }, (_, n) => note(`Screen ${n}`)).join("\n");
      s.write("many-diagrams.md", many);
      await edit(s, "many-diagrams.md");
      await s.see(/│\s+Screen 0\s+│/, 5000);
      await s.keys("G");
      await s.see(/│\s+Screen 39\s+│/, 5000);
      await s.keys("g");
      await s.keys("g");
      await s.see(/│\s+Screen 0\s+│/, 5000);
      await edit(s, "home.md");
      await s.see("Halden Ridge Observatory");
    },
  },

  {
    area: "reading",
    name: "diagrams: a pending drawing labels its source until the bounded attempt settles",
    covers: { cases: ["rendering-in-tui"] },
    run: async (s) => {
      const source = readFileSync(new URL("../../fixtures/diagram/never-finishes.mmd", import.meta.url), "utf8");
      s.write("pending-diagram.md", `# Pending diagram\n\n\`\`\`mermaid\n${source}\`\`\`\n`);
      await edit(s, "pending-diagram.md");
      await s.see("mermaid — drawing…");
      await s.notSee("drawing…", 7000);
      await edit(s, "home.md");
      await s.see("Halden Ridge Observatory");
    },
  },
];
