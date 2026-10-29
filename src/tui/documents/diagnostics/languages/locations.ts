// Protocol UTF-16 positions and original file-location opening.

import { offsetOf } from "../../editing/editing.ts";
import type { App, View } from "../../../app/runtime/app.ts";

/** A position in a source-mode view as the protocol counts it: line and UTF-16 character, from 0. */
export function position(app: Parameters<typeof offsetOf>[0], view: View): { line: number; character: number } {
  const at = offsetOf(app, view);
  const starts = view.buf.lineStarts();
  let line = starts.length - 1;
  while (line > 0 && starts[line]! > at) line--;
  return { line, character: at - starts[line]! };
}

/** Open a file (absolute) at a line and a UTF-16 character, from 0: a location a server gives. */
export function openLocation(
  app: Pick<App, "view" | "loc" | "open" | "placeAtLine" | "region">,
  abs: string,
  line: number,
  character: number,
): void {
  const inVault = abs.startsWith(`${app.loc.root}/`);
  const target = inVault ? abs.slice(app.loc.root.length + 1) : abs;
  app.open(target, { heading: null, headingIndex: 0, offset: 0, line: line + 1 });
  const v = app.view;
  if (!v || v.buf.abs !== abs) return;
  const start = v.buf.lineStarts()[line] ?? 0;
  const text = v.buf.source.slice(start, start + character);
  app.placeAtLine(v, line + 1, [...text].length + 1);
  app.region = "content";
}
