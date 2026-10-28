// Git panel buttons, standing and footer hints read the same live context and key bindings.
import { OPERATIONS } from "../../../../../core/workspace/git/branches/gitrebase.ts";
import { sections } from "../../../../../core/workspace/git/staging/gitstage.ts";
import { sanitize } from "../../../../../core/foundation/text/sanitize.ts";
import { operationNow } from "../../../../../core/workspace/git/branches/operation-status.ts";
import type { PanelButton, PanelRow } from "../contracts.ts";
import type { PanelPresentationHost } from "../contracts.ts";

export class PanelPresentation {
  constructor(private readonly host: PanelPresentationHost) {}
  get app() {
    return this.host.app;
  }

  /** Where the branch stands against its base, as the panel's top says it: `↑5 on main`; null for the base itself. */
  standing(): { ahead: number; behind: number; base: string } | null {
    const here = this.host.branches.here();
    const st = here ? this.host.branches.statsOf(here) : null;
    return st?.base ? { ahead: st.ahead, behind: st.behind, base: st.base } : null;
  }

  /** The buttons at the panel's top (GIT-D8), as the repository stands: commit with what's staged, the remote's; the
   *  review while a change isn't staged, the merge screen while a file's in conflict; while a merge or a rebase is
   * under  way, continue, skip (a rebase's) and abort. */
  buttons(): PanelButton[] {
    const app = this.app;
    const g = app.glyphs.git;
    const work = sections(app.git.entries ?? []);
    const staged = work.staged.length;
    const t = app.git.track;
    const up = !!t?.upstream && !t.gone;
    const label = (glyph: string, text: string) => (glyph ? `${glyph} ${text}` : text);
    const op = operationNow(app);
    return [
      {
        id: "commit",
        label: label(g.commit, `Commit${staged ? ` ${staged}` : ""}`),
        action: "commit",
        desc: "commits what's staged with the box's message; with none, in the editor",
      },
      { id: "amend", label: "Amend", action: "amend", desc: "amends the last commit with what's staged" },
      ...(up
        ? [
            {
              id: "pull",
              label: label(app.glyphs.gitBehind, `Pull${t!.behind ? ` ${t!.behind}` : ""}`),
              action: "pull",
              desc: `brings in ${sanitize(t!.upstream!)}'s new commits; where both sides moved, asks how`,
            },
          ]
        : []),
      {
        id: "push",
        label: label(app.glyphs.gitAhead, up ? `Push${t!.ahead ? ` ${t!.ahead}` : ""}` : "Publish"),
        action: "push",
        desc: up ? `pushes to ${sanitize(t!.upstream!)}` : "pushes the branch to origin, and tracks it there",
      },
      { id: "fetch", label: label(g.fetch, "Fetch"), action: "fetch", desc: "fetches the remote's new commits" },
      { id: "stash", label: "Stash", action: "stash", desc: "the stashes: the changes stashed, or one brought back" },
      // The review (GIT-D3), while there's a change not staged; the merge screen (GIT-D5), while a file's in conflict.
      ...(work.unstaged.length || work.untracked.length
        ? [{ id: "review", label: "Review", action: "review", desc: "the changes not staged, a hunk at a time" }]
        : []),
      ...(work.conflicted.length
        ? [
            {
              id: "resolve",
              label: `Resolve ${work.conflicted.length}`,
              action: "resolve",
              desc: "the files in conflict, on the merge screen: a conflict at a time",
            },
          ]
        : []),
      // A merge, a rebase, a cherry-pick or a revert under way (GIT-D6): carried on, a commit left out (not a merge's),
      // or given up.
      ...(op
        ? [
            { id: "continue", label: "Continue", action: "continue", desc: OPERATIONS[op.kind].carryOn },
            ...(OPERATIONS[op.kind].skip
              ? [{ id: "skip", label: "Skip", action: "skip", desc: OPERATIONS[op.kind].skip! }]
              : []),
            {
              id: "abort",
              label: "Abort",
              action: "abort",
              desc: `the branch back where it was before the ${OPERATIONS[op.kind].noun}`,
            },
          ]
        : []),
    ];
  }

  /** The footer's keys for a row (GIT-D12): what its keys do to it, the commonest first. */
  footer(row: PanelRow | undefined): [string, string][] {
    const k = (action: string, what: string): [string, string][] => {
      const key = this.host.keyFor(action);
      return key ? [[key, what]] : [];
    };
    if (!row || row.kind === "note")
      return this.app.git.checkout
        ? [
            ...k("commit", "commit"),
            ...k("fetch", "fetch"),
            // A merge, a rebase, a cherry-pick or a revert under way (GIT-D6): `shift+r` offers continue, skip and
            // abort.
            ...(operationNow(this.app) ? k("rebase", "continue…") : []),
          ]
        : k("go", "go in");
    switch (row.kind) {
      case "heading": {
        const s = row.section;
        return [
          ...k("open", this.host.folded.has(s) ? "unfold" : "fold"),
          ...(s === "unstaged" || s === "untracked" ? k("stage", "stage all") : []),
          ...(s === "staged" ? k("unstage", "unstage all") : []),
          ...(s === "unstaged" ? k("discard", "discard all") : []),
          ...(s === "unstaged" || s === "untracked" ? k("review", "review") : []),
          ...(s === "conflicted" ? k("resolve", "merge screen") : []),
          ...(s === "branches" ? k("new_branch", "new branch") : []),
        ];
      }
      case "file":
      case "change":
        return [
          ...(row.section === "conflicted" ? k("resolve", "merge screen") : []),
          ...(row.section === "staged" ? k("unstage", "unstage") : k("stage", "stage")),
          ...(row.section === "unstaged" || row.section === "untracked" ? k("discard", "discard") : []),
          ...k("open", "diff"),
          ...(row.section === "unstaged" || row.section === "untracked" ? k("review", "review") : []),
          ...(row.kind === "file" ? k("expand", "changes") : []),
          ...k("go", "open"),
          ...k("menu", "more"),
        ];
      case "ahead":
      case "bfile":
      case "rfile":
        return [...k("open", "diff"), ...(row.kind !== "bfile" ? k("go", "open") : []), ...k("menu", "more")];
      case "thisfile":
        return k("open", row.label.toLowerCase());
      case "branch":
        return [
          ...k("open", row.open ? "fold" : "open up"),
          ...(row.branch.worktree && !row.branch.here ? k("go", "go in") : []),
          ...k("merge", "merge…"),
          // The branch checked out here, rebased onto the base (GIT-D6).
          ...(row.branch.here ? k("rebase", "rebase…") : []),
          ...(row.branch.worktree && !row.branch.here && !row.branch.worktree.main ? k("discard", "remove") : []),
          ...k("menu", "more"),
        ];
      case "bline":
      case "bsub":
      case "bbuttons":
        return [...k("collapse", "fold"), ...k("menu", "more")];
      case "repo":
        return [...k("open", row.open ? "fold" : "open up"), ...k("go", "go in"), ...k("menu", "more")];
      case "rcheckout":
        return [...k("open", "go in"), ...k("menu", "more")];
    }
  }
}
