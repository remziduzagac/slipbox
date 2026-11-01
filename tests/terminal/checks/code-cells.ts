// Additional language outlines and code cell actions.

import { type Check, type LeftOut, leader, pos, SCRATCH_FLOATING, signed, TSC } from "../check.ts";
import { line, outlinePicker } from "../support/reading.ts";

export const CODE_CELLS: Check[] = [
  {
    area: "reading",
    name: "code: beyond the grammars — Java in source mode, no outline; a Dockerfile's stages its outline; a Vue component's parts, each with its definitions",
    covers: { cases: ["code-misc", "classify"], commands: ["outline.pick"] },
    options: { home: true, startAt: "home/work/kestrel/legacy/GpxParser.java" },
    run: async (s) => {
      await s.status("SOURCE");
      await s.see("public class GpxParser {");
      await leader(s, "f", "o");
      await s.see(/no headings/);
      await s.restart({ startAt: "home/work/kestrel/Dockerfile" });
      await s.see("FROM rust:latest AS engine");
      await outlinePicker(s, "Dockerfile");
      await s.see("engine (rust:latest)");
      await s.see("deps (python:3.12-slim)");
      await s.keys("escape");
      await s.restart({ startAt: "home/Downloads/recipe-card-demo/RecipeCard.vue" });
      await outlinePicker(s, "RecipeCard.vue");
      await s.see(/│ template\s/);
      await s.see(/│ script setup lang="ts"/);
      await s.see(/│ {3}Recipe\s/);
      await s.see(/│ style scoped lang="scss"/);
      await s.see(/│ {3}\.card\s/);
    },
  },

  {
    area: "reading",
    name: "code cells: z a folds one to its header and opens it again; space k y copies its lines, space k s adds it to the scratch, space k e edits it in the lens, space k p its problems",
    covers: {
      cases: ["code-files"],
      commands: ["cell.fold", "cell.copy", "cell.scratch", "cell.edit", "cell.problems"],
    },
    options: { home: true, startAt: "home/work/kestrel/src/routes/name.ts" },
    run: async (s) => {
      const text = s.read("~/work/kestrel/src/routes/name.ts").split("\n");
      const badge = text.findIndex((l) => l.startsWith("export function badge")) + 1;
      const end = text.indexOf("}", badge) + 1;
      await s.see("export function badge(name: string): string {");
      await line(s, badge);
      // Folded to its header, and open again by the same key.
      await s.keys("z", "a");
      await s.notSee("export function badge(name: string): string {");
      await s.see("function: badge");
      await s.keys("z", "a");
      await s.see("export function badge(name: string): string {");
      // Its lines, as the file has them.
      await line(s, badge);
      await leader(s, "k", "y");
      await s.message(`copied badge — lines ${badge}–${end}`);
      await s.until(
        () => s.clipboard() === text.slice(badge - 1, end).join("\n"),
        3000,
        "the cell's lines on the clipboard",
      );
      // In the scratch, with its path and lines, for an agent.
      await leader(s, "k", "s");
      await s.message(`badge — lines ${badge}–${end} added to the scratch`);
      // Shown at once, floating (#43), typing a note (D229); esc then q, back at the cell.
      await s.see(SCRATCH_FLOATING);
      await s.keys("escape", "q");
      await s.notSee(SCRATCH_FLOATING);
      // Its problem (a syntax error slipbox found itself): the Problems panel on it.
      await leader(s, "k", "p");
      await s.status("PROBLEMS");
      await s.see(signed(`{error} ${badge + 2}:`));
      await s.keys("q");
      await s.until(() => !s.statusLine().includes("PROBLEMS"), 3000, "the Problems panel closed");
      // The lens on its lines whole.
      await line(s, badge);
      await leader(s, "k", "e");
      await s.status(/^ READ·LENS │ NORMAL /);
      await s.see(`source · lines ${badge}–${end}`);
    },
  },

  {
    area: "reading",
    name: "code cells: space k r — where the cell's definition is used, from TypeScript's own server",
    covers: { cases: ["code-ts"], commands: ["cell.references"] },
    options: {
      open: "software/nightjar/src/server.ts",
      config: `[lsp]\nenabled = true\n\n[language-server.typescript]\ncommand = ${JSON.stringify(TSC)}\n`,
    },
    run: async (s) => {
      await s.see("byNight(night: string): Frame[] {");
      const text = s.read("software/nightjar/src/server.ts").split("\n");
      const use = text.findIndex((l) => l.includes("archive.byNight(night)")) + 1;
      await line(s, text.findIndex((l) => l.includes("byNight(night: string)")) + 1);
      await leader(s, "k", "r");
      await s.see(/1 reference/, 20_000);
      await s.see(`software/nightjar/src/server.ts:${use}`);
      await s.keys("enter");
      await s.until(() => pos(s).line === use, 3000, `on its use, line ${use}`);
    },
  },
];

export const LEFT_OUT_READING: LeftOut = {
  commands: {
    "cell.fold_unchanged":
      "GIT's terminal checks come in one pass when the workstream is done; " +
      "tests/tui/workspace/git/signs.test.ts's 'space k d folds' runs it",
  },
};
