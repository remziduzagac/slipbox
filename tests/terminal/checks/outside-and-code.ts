// What comes from outside (agents' edits, the watcher, the CLI beside the TUI), language servers, linters, the
// problems panel, and export (TT-T7).

import type { Check, LeftOut } from "../check.ts";

export const OUTSIDE_AND_CODE: Check[] = [];

export const LEFT_OUT_OUTSIDE_AND_CODE: LeftOut = {};
