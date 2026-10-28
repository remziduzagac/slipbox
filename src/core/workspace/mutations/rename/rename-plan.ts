// A rename's plan (7.2): what it changes, file by file and line by line, before anything is written — its shape,
// the collector that reads each file once and edits it in turn, and the git trees that have changes already (7.3).

export { RenameError, type Edit, type FileChange, type RenamePlan, type Ambiguous } from "./collecting/contracts.ts";
export {
  whereItLeads,
  notRewritten,
  landsHidden,
  mayRewrite,
  shownFor,
  walkSkips,
  sameEntry,
  relinkSaid,
} from "./collecting/policy.ts";
export { Collector } from "./collecting/collector.ts";
export { dirtyTrees } from "./collecting/dirty-trees.ts";
