// Renames and moves (17.15, with 7.1–7.3; blueprint/design/links.md § Renames and moves): a note or
// folder renamed or moved, with its links rewritten in every root this machine reaches; a root
// named — as byte-range edits at the positions the index recorded, never a re-serialised file
// (7.6). A plan is made first, to preview (7.2); it names the git trees that already have changes
// (7.3); applying it checks that no file it touches changed since.
//
// Here, the moves and the relink planned. A plan's shape is rename-plan.ts's, one link's rewriting
// rename-links.ts's; a folder named or made a vault is rename-vaults.ts's, a heading renamed
// rename-heading.ts's; carrying a plan out and undoing it, rename-apply.ts's. All of it is imported from here.

export { RenameError, Collector, dirtyTrees } from "./rename-plan.ts";
export type { Edit, FileChange, RenamePlan, Ambiguous } from "./rename-plan.ts";
export { planVaultRename, planMakeVault, planUnmakeVault } from "./rename-vaults.ts";
export { loggedRenames, planUndo, applyPlan, outside } from "./rename-apply.ts";
export type { Applied } from "./rename-apply.ts";
export { planHeadingRename } from "./rename-heading.ts";
export { moveTarget, fileInTheWay } from "./planning/targets.ts";
export { planNoteRename, planFolderMove } from "./planning/files.ts";
export { planVaultFolderMove, linksIntoFolder } from "./planning/nested.ts";
export { planRelink } from "./planning/relink.ts";
