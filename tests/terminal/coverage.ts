// What the terminal checks cover, and what they don't (TT-D4): every command (core/command-specs.ts) and every area
// of the reference set (`examples/home/CASES.md`'s `###` headings under "By area") has a check that covers it, or is
// left out with its reason. `bun tests/terminal/coverage.ts [area]` lists what's uncovered, by the area that owns it;
// tests/terminal-coverage.test.ts fails while anything is.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { COMMAND_SPECS } from "../../src/core/command-specs.ts";
import { type Area, CLI_CASES, type Check } from "./check.ts";
import { CHECKS, LEFT_OUT } from "./checks/index.ts";

/** The reference set's areas: the `###` headings of CASES.md's "By area" part. */
export function caseAreas(): string[] {
  const text = readFileSync(join(import.meta.dir, "..", "..", "examples", "home", "CASES.md"), "utf8");
  const part = text.slice(text.indexOf("\n## By area"), text.indexOf("\n## Commands"));
  return [...part.matchAll(/^### (.+)$/gm)].map((m) => m[1]!.trim());
}

/** Which area's task owns a command, by its group (`edit` of `edit.insert`). */
const COMMAND_OWNERS: Record<string, Area> = {
  ...Object.fromEntries(
    ["edit", "visual", "copy", "change", "lens", "scratch", "spell", "task", "cursor", "scroll", "view"].map((g) => [
      g,
      "editing" as const,
    ]),
  ),
  ...Object.fromEntries(
    [
      "window",
      "tab",
      "history",
      "breadcrumb",
      "outline",
      "find",
      "search",
      "switcher",
      "palette",
      "ui",
      "help",
      "messages",
      "explorer",
      "tag",
      "config",
      "app",
    ].map((g) => [g, "navigating" as const]),
  ),
  ...Object.fromEntries(
    ["theme", "glyphs", "cell", "info", "footnotes", "footnote", "heading", "type"].map((g) => [g, "reading" as const]),
  ),
  ...Object.fromEntries(
    ["link", "links", "backlinks", "peek", "note", "folder", "folders", "root", "vault", "trash", "rename", "git"].map(
      (g) => [g, "links-and-files" as const],
    ),
  ),
  ...Object.fromEntries(["lsp", "problems", "shell", "context"].map((g) => [g, "outside-and-code" as const])),
};

/** Which area's task owns a CASES.md area; `cli` for the command line's own, which tests/cli.test.ts covers. */
const CASE_OWNERS: Record<string, Area | "cli"> = {
  ...Object.fromEntries(
    [
      "headings",
      "paragraphs",
      "inline",
      "lists",
      "quotes",
      "callouts",
      "code",
      "rules",
      "tables",
      "wrapping",
      "width",
      "frontmatter",
      "html",
      "footnotes",
      "embeds",
      "data",
      "encoding",
      "hostile",
      "big",
      "theme",
      "glyphs",
      "notes",
      "classify",
      "toml",
      "ini",
      "yaml",
      "json",
      "csv",
      "data-modes",
      "code-ts",
      "code-js",
      "code-py",
      "code-go",
      "code-rs",
      "code-sh",
      "code-lua",
      "code-misc",
      "text-files",
      "themes",
      "yaml-frontmatter",
      "samples-existing",
      "unicode",
      "info",
      "properties",
      "large",
      "rendering-in-tui",
      "status",
      "words",
      "opening",
      "samples-meta",
      "code-files",
      "colors",
    ].map((a) => [a, "reading" as const]),
  ),
  ...Object.fromEntries(
    [
      "editing",
      "tasks-tags",
      "cursor",
      "selection",
      "copy",
      "changes",
      "lens",
      "source-mode",
      "tasks",
      "save",
      "autosave",
      "conflict",
      "scratch",
      "new-note",
      "safety",
    ].map((a) => [a, "editing" as const]),
  ),
  ...Object.fromEntries(
    [
      "explorer",
      "search",
      "history",
      "windows",
      "breadcrumb",
      "tabs",
      "outline",
      "find",
      "replace",
      "vault-find",
      "switcher",
      "palette",
      "help",
      "which-key",
      "ui",
      "tags",
      "keys",
      "lists-prompts",
      "questions",
      "mouse",
      "index",
      "config",
    ].map((a) => [a, "navigating" as const]),
  ),
  ...Object.fromEntries(
    [
      "links",
      "links-data",
      "mixed-roots",
      "fragments",
      "rename",
      "trash",
      "copy-move",
      "vault",
      "git",
      "multiple-roots",
      "convert-links",
      "links/forms",
      "links/fragments",
      "links/wikilinks",
      "links/conventions",
      "links/roots",
      "links/travel",
      "links/named-folders",
      "links/git",
      "links/index",
      "links/moves",
      "links/backlinks",
      "links/search",
      "links/state",
      "links/misc",
    ].map((a) => [a, "links-and-files" as const]),
  ),
  ...Object.fromEntries(
    ["watching", "context", "problems", "lint", "lsp", "reload", "agent"].map((a) => [a, "outside-and-code" as const]),
  ),
  // The command line's own: tests/cli.test.ts covers them, left out of the terminal's (index.ts says so).
  ...Object.fromEntries(CLI_CASES.map((a) => [a, "cli" as const])),
};

/** The area that owns a command or a case area (`cli` for the command line's; `?` for one nobody was given). */
export const ownerOfCommand = (id: string): Area | "?" => COMMAND_OWNERS[id.split(".")[0]!] ?? "?";
export const ownerOfCase = (area: string): Area | "cli" | "?" => CASE_OWNERS[area] ?? "?";

export interface Coverage {
  /** Commands no check runs and none left out, and case areas likewise. */
  uncovered: { commands: string[]; cases: string[] };
  /** What a check or a left-out list names that doesn't exist: a typo, or something renamed. */
  unknown: string[];
  /** Left out, yet a check covers it: the left-out entry is stale. */
  stale: string[];
}

export function coverage(checks: Check[] = CHECKS, left = LEFT_OUT): Coverage {
  const commands = COMMAND_SPECS.map((c) => c.id);
  const cases = caseAreas();
  const ran = new Set(checks.flatMap((c) => c.covers.commands ?? []));
  const met = new Set(checks.flatMap((c) => c.covers.cases ?? []));
  const unknown = [
    ...[...ran].filter((c) => !commands.includes(c)).map((c) => `command ${c} (a check)`),
    ...[...met].filter((c) => !cases.includes(c)).map((c) => `case area ${c} (a check)`),
    ...Object.keys(left.commands)
      .filter((c) => !commands.includes(c))
      .map((c) => `command ${c} (left out)`),
    ...Object.keys(left.cases)
      .filter((c) => !cases.includes(c))
      .map((c) => `case area ${c} (left out)`),
  ];
  const stale = [
    ...Object.keys(left.commands)
      .filter((c) => ran.has(c))
      .map((c) => `command ${c}`),
    ...Object.keys(left.cases)
      .filter((c) => met.has(c))
      .map((c) => `case area ${c}`),
  ];
  return {
    uncovered: {
      commands: commands.filter((c) => !ran.has(c) && !(c in left.commands)),
      cases: cases.filter((c) => !met.has(c) && !(c in left.cases)),
    },
    unknown,
    stale,
  };
}

/** The uncovered, grouped by the area that owns each: `area: command x, case area y`. */
export function report(c: Coverage, only?: string): string {
  const by = new Map<string, string[]>();
  const add = (owner: string, what: string) => by.set(owner, [...(by.get(owner) ?? []), what]);
  for (const id of c.uncovered.commands) add(ownerOfCommand(id), `command ${id}`);
  for (const a of c.uncovered.cases) add(ownerOfCase(a), `case area ${a}`);
  const lines: string[] = [];
  for (const [owner, items] of [...by].sort()) {
    if (only && owner !== only) continue;
    lines.push(`${owner} (${items.length}):`, ...items.map((i) => `  ${i}`));
  }
  if (c.unknown.length) lines.push("not found:", ...c.unknown.map((u) => `  ${u}`));
  if (c.stale.length) lines.push("left out, yet covered:", ...c.stale.map((u) => `  ${u}`));
  return lines.join("\n");
}

if (import.meta.main) {
  const c = coverage();
  const text = report(c, process.argv[2]);
  console.log(text || "everything covered");
  process.exit(text ? 1 : 0);
}
