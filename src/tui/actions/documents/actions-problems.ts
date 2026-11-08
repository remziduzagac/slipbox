// Problems where they are (`problem.*`, EG-D5): to the next one or the one before, the cursor's in full, and the
// problem window's own keys — `y` copies, `s` adds to the scratch.

import { type Run, withView } from "../actions.ts";
import {
  copyProblems,
  problemStep,
  scratchProblems,
  showProblems,
} from "../../documents/diagnostics/problems/at-cursor.ts";

/** Problems where they are (EG-D5). */
export function problemActions(): Record<string, Run> {
  return {
    "problem.next": (a) => withView(a, (v) => problemStep(a, v, 1)),
    "problem.prev": (a) => withView(a, (v) => problemStep(a, v, -1)),
    "problem.show": (a) => withView(a, (v) => showProblems(a, v)),
    "problem.copy": (a) => copyProblems(a),
    "problem.scratch": (a) => scratchProblems(a),
  };
}
