// Command specs: source control (git.*).

import type { CommandSpec } from "../command-specs";

const I = null; // interaction: needs a human at a terminal

export const GIT_SPECS: CommandSpec[] = [
  {
    id: "git.changes",
    title: "Changed on this branch",
    cli: "slipbox changed [--base <ref>]",
    desc: "What this branch changed against the base (main), committed or not; enter shows a file's diff",
  },
  {
    id: "git.view",
    title: "The git panel: open, focus, close",
    cli: I,
    desc: "Source control in the left panel: the changed files to stage, discard and commit, by keys or by mouse; what the branch changed; the branches and their worktrees; the other repositories in the view",
  },
  {
    id: "git.branches",
    title: "Branches",
    cli: I,
    desc: "The branches, this one marked: one checked out — unsaved notes saved or kept first — or a new one made from here",
  },
  {
    id: "git.blame",
    title: "Who changed this line",
    cli: I,
    desc: "The cursor's line's last commit — its author, date and message — in a floating window (blame of the last commit)",
  },
  {
    id: "git.history",
    title: "This file's history",
    cli: I,
    desc: "Its commits, newest first, through renames: one read as it was, or its diff to the text now",
  },
  {
    id: "git.commit",
    title: "Commit",
    cli: I,
    desc: "What's staged committed: the message in a floating editor, ctrl+s commits; in a vault not trusted, no hooks and not signed",
  },
  {
    id: "git.amend",
    title: "Amend the last commit",
    cli: I,
    desc: "The last commit's message in a floating editor: ctrl+s amends it with what's staged",
  },
  {
    id: "git.fetch",
    title: "Fetch",
    cli: I,
    desc: "Fetches the branch's remote in the background; the branch's ↓ then says how far behind its upstream it is",
  },
  {
    id: "git.pull",
    title: "Pull",
    cli: I,
    desc: "Brings in the upstream's new commits, unsaved notes saved or kept first; where both sides moved, asks: merge, rebase or nothing",
  },
  {
    id: "git.push",
    title: "Push",
    cli: I,
    desc: "Pushes the branch to its upstream; with none, asks to push it to origin and track it there. In a vault not trusted, no hook runs",
  },
  {
    id: "git.stash",
    title: "Stashes",
    cli: I,
    desc: "The stashes: the changes stashed with a message, or one popped, applied or dropped (after asking)",
  },
  // Reviewing a change, a hunk at a time (GIT-D3): source control's v; the keys inside a review.
  {
    id: "git.review",
    title: "Review the changes",
    cli: I,
    desc: "The working tree's changes against what's staged, a hunk at a time, every changed file: keep, revert or note each",
  },
  {
    id: "git.review_keep",
    title: "Keep this change (review)",
    cli: I,
    desc: "In a review: stages the change shown, and goes on to the next",
  },
  {
    id: "git.review_revert",
    title: "Revert this change (review)",
    cli: I,
    desc: "In a review: the change's lines back as staged, the file saved at once (u in it brings them back); unsaved typing, skipped",
  },
  {
    id: "git.review_note",
    title: "Note this change for the agent (review)",
    cli: I,
    desc: "In a review: asks for a note, and adds the change to the scratch with its file, lines and diff",
  },
  {
    id: "git.review_next",
    title: "Next change (review)",
    cli: I,
    desc: "In a review: the next change, across the files",
  },
  {
    id: "git.review_prev",
    title: "Previous change (review)",
    cli: I,
    desc: "In a review: the change before",
  },
  {
    id: "git.review_go",
    title: "Go to the change (review)",
    cli: I,
    desc: "In a review: ends it, and opens the file at the change",
  },
  // The merge screen (GIT-D5): x on a conflicted file; the keys on it.
  {
    id: "git.merge_screen",
    title: "Settle the conflicts",
    cli: I,
    desc: "The merge screen: a file in conflict (this note, or the first) settled a conflict at a time, then saved and staged",
  },
  {
    id: "git.merge_ours",
    title: "Take yours (merge screen)",
    cli: I,
    desc: "On the merge screen: the conflict settled with your side",
  },
  {
    id: "git.merge_theirs",
    title: "Take theirs (merge screen)",
    cli: I,
    desc: "On the merge screen: the conflict settled with their side",
  },
  {
    id: "git.merge_both",
    title: "Take both, yours first (merge screen)",
    cli: I,
    desc: "On the merge screen: the conflict settled with both sides, yours first",
  },
  {
    id: "git.merge_both_theirs",
    title: "Take both, theirs first (merge screen)",
    cli: I,
    desc: "On the merge screen: the conflict settled with both sides, theirs first",
  },
  {
    id: "git.merge_edit",
    title: "Edit in the lens (merge screen)",
    cli: I,
    desc: "On the merge screen: the result in the file, unsaved, the lens opened at the conflict to settle it by hand",
  },
  {
    id: "git.merge_agent",
    title: "Send the conflict to the agent (merge screen)",
    cli: I,
    desc: "On the merge screen: the conflict, its base and the lines around it into the scratch, with a note",
  },
  {
    id: "git.merge_next",
    title: "Next conflict (merge screen)",
    cli: I,
    desc: "On the merge screen: the next conflict",
  },
  {
    id: "git.merge_prev",
    title: "Previous conflict (merge screen)",
    cli: I,
    desc: "On the merge screen: the conflict before",
  },
  {
    id: "git.merge_save",
    title: "Save the merged file (merge screen)",
    cli: I,
    desc: "On the merge screen: once every conflict is settled, the file saved as it shows",
  },
  {
    id: "git.merge_stage",
    title: "Stage the merged file (merge screen)",
    cli: I,
    desc: "On the merge screen: the saved file staged, which tells git it's resolved; the next file in conflict opens",
  },
  // Rebasing onto the base, and a merge or rebase under way (GIT-D6).
  {
    id: "git.rebase",
    title: "Rebase onto the base",
    cli: I,
    desc: "Rebases this branch onto the base's tip, after asking; while a merge or rebase is under way, continue, skip or abort it",
  },
  {
    id: "git.continue",
    title: "Continue the merge or rebase",
    cli: I,
    desc: "Once no file is in conflict: a rebase's next commit replayed, or a merge's commit made",
  },
  {
    id: "git.skip",
    title: "Skip this commit (rebase)",
    cli: I,
    desc: "Leaves the rebase's current commit out, and replays the next",
  },
  {
    id: "git.abort",
    title: "Abort the merge or rebase",
    cli: I,
    desc: "Gives up the merge or rebase under way: the branch back where it was before it",
  },
  {
    id: "git.change_next",
    title: "Next change against what's staged",
    cli: I,
    desc: "Moves to the next line the gutter marks changed against git's index, around the end (]c)",
  },
  {
    id: "git.change_prev",
    title: "Previous change against what's staged",
    cli: I,
    desc: "Moves to the change before the cursor, around the start ([c)",
  },
  {
    id: "git.change_preview",
    title: "Preview the change",
    cli: I,
    desc: "The change on the cursor's line as a diff — its lines as staged, then as they are — in a floating window",
  },
  {
    id: "git.change_undo",
    title: "Undo the change",
    cli: I,
    desc: "Puts the change's lines back as staged: one undo step, left unsaved",
  },
  {
    id: "git.diff",
    title: "Diff this note against the base",
    cli: "slipbox diff <note> [--base <ref>]",
    desc: "This note's changes on the branch, against where it left main; enter goes to the line",
  },
  {
    id: "git.diff_view",
    title: "Switch the diff: its blocks before and after, or its lines",
    cli: I,
    desc: "In a note's diff: its changed blocks before and after, or its lines as source (tab there); [git] diff picks the first",
  },
  {
    id: "git.worktrees",
    title: "Open in another worktree",
    cli: "slipbox worktrees",
    desc: "The repository's checkouts by branch; enter opens this note in the one picked",
  },
  {
    id: "git.merge_review",
    title: "Review a merge's links",
    cli: "slipbox merge-review <branch> [--into <ref>]",
    desc: "Before a merge: the links git's tentative result would break, each with its cause and fix; enter goes to one",
  },
];
