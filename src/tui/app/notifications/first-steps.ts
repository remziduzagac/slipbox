// First steps (FR1, FR4): how to begin, said in the keys that are true for the view the note is in. The hint at a
// machine's first start is shown once, kept as a file in the state folder, and stays until the first key.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { stateHome } from "../../../core/foundation/platform/paths.ts";
import { cannotEdit } from "../../documents/editing/source/policy.ts";
import type { App } from "../runtime/app.ts";

/** The file whose presence says the hint has been shown on this machine. */
export function firstStepsFile(state = stateHome()): string {
  return join(state, "first-steps");
}

/**
 * The keys that start typing from the view the cursor is in, or null where none do: no note, a side panel, a note that
 * cannot be edited (read-only, another vault's, deleted, not UTF-8). From the
 * rendered view `i` first opens the lens, and the next types; with `[editor] edit_in = "source"` the first does. In the
 * lens and in source, `i` types.
 */
export function typingKeys(app: App): string | null {
  const view = app.view;
  if (!view || app.region !== "content" || view.insert || cannotEdit(view)) return null;
  if (view.source || view.live) return "i";
  return app.config.editor.edit_in === "source" ? "i" : "i i";
}

/** The "not bound" message's tail: how to type from here, then where the keys are listed. */
export function notBoundHelp(app: App): string {
  const keys = typingKeys(app);
  return keys ? `type with ${keys}, ? lists keys` : "? lists keys";
}

/** The hint's words: how to start typing, open the menu, list the keys and run a command. */
export function firstStepsText(app: App): string | null {
  if (!app.view) return null;
  const keys = typingKeys(app);
  const typing = keys === null ? [] : [keys === "i i" ? "i i types (the first opens the lens)" : `${keys} types`];
  return `To begin: ${[...typing, `${app.leader} menu`, "? keys", ": commands"].join(" · ")}`;
}

/** Shows the hint the first time slipbox is started on this machine with a note open, and records that it was. */
export function showFirstSteps(app: App): void {
  // A key typed while slipbox started has come first: not shown, not recorded, so the next start shows it.
  if (app.notifications.inputSeen) return;
  const file = firstStepsFile();
  if (existsSync(file)) return;
  const text = firstStepsText(app);
  if (!text) return;
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, "shown\n");
  } catch {
    return; // nowhere to record it: never shown, rather than shown at every start
  }
  app.notifications.hint(text);
}
