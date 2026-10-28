// Git panel, branch and repository row records and read/presentation capabilities; no controller composition.
import type { Changed } from "../../../../core/workspace/git/branches/gitops.ts";
import type { StatusEntry } from "../../../../core/workspace/git/staging/gitstage.ts";
import type { Branch } from "../../../../core/workspace/git/branches/gitbranches.ts";
import type { Checkout } from "../../../../core/workspace/git/git.ts";
import type { RepoFound } from "../../../../core/workspace/git/gitrepos.ts";
import type { GitChange } from "../../../../core/workspace/git/gitsigns.ts";
import type { Config } from "../../../../core/application/config/config.ts";
import type { BranchStats } from "../../../../core/workspace/git/branches/gitbranches.ts";
import type { Track } from "../../../../core/workspace/git/branches/gitremote.ts";
import type { OperationContext } from "../../../../core/workspace/git/branches/operation-status.ts";
import type { Glyphs } from "../../../../core/rendering/theme/glyphs.ts";

/** A section of the panel: the working tree's four; the branch's, this file's; the branches, the merged and older among
 *  them; the other repositories, the rest of home's. */
export type SectionId = GitSection | "ahead" | "file" | "branches" | "older" | "repos" | "home";

export interface HeadingRow {
  kind: "heading";
  section: SectionId;
  label: string;
}

/** A line that says something, not a row to act on: "nothing uncommitted", "asking git…". */
export interface NoteRow {
  kind: "note";
  text: string;
}

/** A file this branch changed against its base (GIT-D8): its vault path (null outside the vault). */
export interface AheadRow {
  kind: "ahead";
  file: Changed;
  rel: string | null;
  base: string;
}

/** One of this file's own: its diff against the base, its history, who changed the cursor's line. */
export interface ThisFileRow {
  kind: "thisfile";
  command: "git.diff" | "git.history" | "git.blame";
  label: string;
}

export type PanelRow =
  | HeadingRow
  | NoteRow
  | FileRow
  | ChangeRow
  | AheadRow
  | ThisFileRow
  | BranchViewRow
  | RepoViewRow;

/** A button at the panel's top (GIT-D8): what it says, the action its key runs, what it does. */
export interface PanelButton {
  id: string;
  label: string;
  action: string;
  desc: string;
}

/** A branch's row; `open` while it's opened up in place. */
export interface BranchRow {
  kind: "branch";
  branch: Branch;
  open: boolean;
}

/** A line under a branch opened up: its worktree's folder, or that the folder is gone. */
export interface BranchLineRow {
  kind: "bline";
  branch: Branch;
  text: string;
  gone: boolean;
}

/** A branch's buttons, opened up: `[Open] [Merge…]`, or `[Check out here] [Open in a worktree] [Merge…]`. */
export interface BranchButtonsRow {
  kind: "bbuttons";
  branch: Branch;
  buttons: { action: string; label: string }[];
}

/** A file a branch changed: against its base (committed), or in its worktree, not committed. */
export interface BranchFileRow {
  kind: "bfile";
  branch: Branch;
  against: "base" | "uncommitted";
  path: string;
  /** A rename's old path: what it was before. */
  from?: string;
  letter: string;
  base: string | null;
}

/** A label over a branch's files: "Uncommitted (2)", "Against main (5)"; `against`, which, as its files say. */
export interface BranchSubRow {
  kind: "bsub";
  branch: Branch;
  against: "base" | "uncommitted";
  label: string;
}

export type BranchViewRow = BranchRow | BranchLineRow | BranchButtonsRow | BranchFileRow | BranchSubRow;

/** What git has said of a branch's changes, opened up. */
export interface BranchFiles {
  key: string;
  base: Changed[] | null;
  uncommitted: StatusEntry[] | null;
}

/**
 * The branches as git last listed them, and which are merged: asked at `generation` of `root`, `asking` while that
 * answer isn't in; `answered`, the generation of the answer shown — an earlier one meanwhile.
 */
export interface BranchList {
  root: string;
  generation: number;
  branches: Branch[] | null;
  merged: Set<string>;
  asking: Promise<void> | null;
  answered: number;
}

/** Where a branch was asked for: the vault's visit (`Vaults.visits`), and how much you'd done in the panel by then
 *  (`GitPanel.touched`). */
export interface Asked {
  visit: number;
  touched: number;
}

/** A repository's row; `open` while it's opened up. */
export interface RepoRow {
  kind: "repo";
  repo: RepoFound;
  open: boolean;
}

/** One of a repository's checkouts, opened up: the main one, a worktree with its branch. */
export interface RepoCheckoutRow {
  kind: "rcheckout";
  repo: RepoFound;
  checkout: Checkout;
}

/** A file a checkout changed, not committed. */
export interface RepoFileRow {
  kind: "rfile";
  repo: RepoFound;
  checkout: Checkout;
  entry: StatusEntry;
}

export type RepoViewRow = RepoRow | RepoCheckoutRow | RepoFileRow;

export type GitSection = "conflicted" | "staged" | "unstaged" | "untracked";

/** A changed file in a section of the working tree: its state letter and name, its folder dimmed after it. */
export interface FileRow {
  kind: "file";
  section: GitSection;
  entry: StatusEntry;
  label: string;
  hint: string;
}

/** One change of a file opened up: where it is, its first line dimmed after it. */
export interface ChangeRow {
  kind: "change";
  section: GitSection;
  entry: StatusEntry;
  change: GitChange;
  label: string;
  hint: string;
}

/** Branch answers use the current generation/configuration and the same visit guard as their owner. */
export interface BranchReadHost {
  readonly app: {
    readonly loc: { root: string };
    readonly git: {
      readonly checkout: Checkout | null;
      readonly generation: number;
      readonly entries: StatusEntry[] | null;
      fallbackBase(checkout: Checkout): string | null;
    };
    readonly config: Pick<Config, "git">;
    readonly vaults: { readonly visits: number };
    readonly host: { requestRender(): void };
  };
  still(visit: number): boolean;
}

export interface BranchRowHost {
  readonly opened: Set<string>;
  readonly app: {
    now(): number;
    readonly gitPanel: { filter(): string; readonly folded: Set<SectionId> };
  };
  branches(): { branches: Branch[]; merged: Set<string> } | null;
  statsOf(branch: Branch): BranchStats | null;
  filesOf(branch: Branch, base: string | null): BranchFiles | null;
}

export interface PanelPresentationContext extends OperationContext {
  readonly glyphs: Pick<Glyphs, "git" | "gitAhead" | "gitBehind">;
  readonly git: OperationContext["git"] & {
    readonly entries: StatusEntry[] | null;
    readonly track: Track | null;
  };
}

export interface PanelPresentationHost {
  readonly app: PanelPresentationContext;
  readonly folded: Set<SectionId>;
  readonly branches: {
    here(): Branch | null;
    statsOf(branch: Branch): BranchStats | null;
  };
  keyFor(action: string): string | null;
}
