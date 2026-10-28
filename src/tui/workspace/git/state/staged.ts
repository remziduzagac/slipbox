// Per-buffer staged text and change memoization, using the controller's current generation and checkout.
import { relative, sep } from "node:path";
import { showLater } from "../../../../core/workspace/git/branches/gitops.ts";
import { type GitChange, gitChanges } from "../../../../core/workspace/git/gitsigns.ts";
import { isInside } from "../../../../core/workspace/vaults/vault.ts";
import type { NoteBuffer } from "../../../documents/buffers/buffer.ts";
import type { GitStagedHost } from "./contracts.ts";

export class GitStaged {
  constructor(private readonly host: GitStagedHost) {}
  get app() {
    return this.host.app;
  }

  /** Each open file's text as staged (26.1), by buffer: asked of git in the background, again when git has news. Null:
   *  a file git hasn't (untracked: every line added); "none": nothing to compare (ignored, outside the checkout). */
  private readonly staged = new WeakMap<NoteBuffer, { text: string | null | "none"; generation: number }>();

  private readonly stagedAsking = new WeakSet<NoteBuffer>();

  private readonly changeMemo = new WeakMap<
    NoteBuffer,
    { version: number; generation: number; changes: GitChange[] }
  >();

  /**
   * A file's changes against what's staged (26.1) — its text as it is now, unsaved typing included — or null where
   * there's nothing to compare: signs off, no checkout, a file outside the root, git not answered yet (it's asked now).
   */
  changesOf(view: { buf: NoteBuffer }): GitChange[] | null {
    const buf = view.buf;
    const c = this.host.checkout;
    // By its path, not the graph's name for it: a file just made is git's before the walk's.
    if (
      !this.app.config.git.signs ||
      !c ||
      buf.virtual ||
      !buf.abs ||
      !isInside(c.root, buf.abs) ||
      !isInside(this.app.loc.root, buf.abs)
    )
      return null;
    const known = this.staged.get(buf);
    if (known?.generation !== this.host.generation && !this.stagedAsking.has(buf)) {
      this.stagedAsking.add(buf);
      const generation = this.host.generation;
      const rel = relative(this.app.loc.root, buf.abs).split(sep).join("/");
      void showLater(c, "", relative(c.root, buf.abs)).then((text) => {
        this.stagedAsking.delete(buf);
        // Not staged: a file git doesn't have is all new; one it ignores, or can't show, has no signs.
        const untracked = text === null && this.host.states?.get(rel) === "new";
        this.staged.set(buf, { text: text ?? (untracked ? null : "none"), generation });
        this.app.host.requestRender();
      });
    }
    if (!known || known.text === "none") return null;
    const memo = this.changeMemo.get(buf);
    if (memo && memo.version === buf.version && memo.generation === known.generation) return memo.changes;
    const changes = gitChanges(known.text, buf.source);
    this.changeMemo.set(buf, { version: buf.version, generation: known.generation, changes });
    return changes;
  }

  /** A file's text as staged, as git last said it (26.1): null for a file git hasn't; undefined while it hasn't said. */
  stagedText(buf: NoteBuffer): string | null | undefined {
    const known = this.staged.get(buf);
    return !known || known.text === "none" ? undefined : known.text;
  }
}
