// Git state letters shared by row data and drawing.
import type { GitState } from "../../../core/workspace/git/branches/gitops.ts";

/** A file's git state as the explorer marks it (5.11). */
export const GIT_MARK: Record<GitState, string> = {
  new: "+",
  modified: "M",
  renamed: "R",
  deleted: "D",
  conflict: "!",
};
