// The named command list (0.8) as data, with each command's CLI parity (plan "Principles").
//
// The TUI binds implementations to these ids; the CLI lists them (`slipbox commands`). Every
// command either names the CLI invocation that reaches the same state change, or is marked an
// interaction — cursor, scroll, selection, focus, panes, overlays — the one stated exception
// class. A test enforces that nothing is left undeclared, so parity cannot quietly decay.
//
// The specs and their independent contract live in src/core/commands/; this file composes the one list,
// built from them in registration order.

import type { CommandSpec } from "./commands/contracts";
import { MOTION_SPECS } from "./commands/motion";
import { WINDOW_SPECS } from "./commands/windows";
import { GIT_SPECS } from "./commands/git";
import { EDITING_SPECS } from "./commands/editing";
import { UI_SPECS } from "./commands/ui";
import { FILE_SPECS } from "./commands/files";

export const COMMAND_SPECS: CommandSpec[] = [
  ...MOTION_SPECS,
  ...WINDOW_SPECS,
  ...GIT_SPECS,
  ...EDITING_SPECS,
  ...UI_SPECS,
  ...FILE_SPECS,
];

export function commandSpec(id: string): CommandSpec | undefined {
  return COMMAND_SPECS.find((c) => c.id === id);
}

/**
 * The groups commands are listed under in help and the palette: the sections of
 * docs/manual/keys.md, in its order. The first group whose pattern matches an id wins.
 */
export const COMMAND_GROUPS: { title: string; ids: RegExp }[] = [
  { title: "Cursor", ids: /^(cursor|scroll|picture)\./ },
  { title: "Selection & copy", ids: /^(visual\.(char|line|swap|yank|exit)$|copy\.|app\.escape$)/ },
  { title: "Links & history", ids: /^(link\.|links\.|backlinks\.|peek\.|history\.|change\.|lsp\.)/ },
  { title: "Windows", ids: /^window\./ },
  { title: "Tabs", ids: /^tab\./ },
  { title: "Explorer", ids: /^explorer\./ },
  { title: "Outline", ids: /^(outline\.(cycle|toggle)$|footnotes?\.)/ },
  {
    title: "Find",
    ids: /^(find\.|switcher\.|search\.|tag\.list$|type\.|outline\.pick$|breadcrumb\.path$|palette\.|note\.open$)/,
  },
  {
    title: "Editing",
    ids: /^(task\.|edit\.|spell\.|shell\.|visual\.(delete|change|indent|outdent|comment)$|view\.(source|live|mode_read|mode_lens|mode_source)$|lens\.|note\.(save|save_all|save_force|revert|resolve)$|app\.(save_quit|quit_force)$)/,
  },
  { title: "UI", ids: /^(ui\.|theme\.|glyphs\.|background\.|html\.)/ },
  { title: "Scratch", ids: /^(scratch\.|context\.copy$)/ },
  { title: "Code cells", ids: /^cell\./ },
  { title: "Git", ids: /^git\./ },
  {
    title: "Note, folder, app",
    ids: /^(note\.|folder\.|folders\.|root\.|heading\.|rename\.|trash\.|problems\.|info\.|vault\.|config\.|messages\.|help\.|app\.)/,
  },
];

export function commandGroup(id: string): string {
  return COMMAND_GROUPS.find((g) => g.ids.test(id))?.title ?? "Other";
}
