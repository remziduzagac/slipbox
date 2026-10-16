// Links followed only when you say so (VV-D6), in the TUI: a link leading out of the vault open — out of home, or any
// in Elsewhere — is shown as one (`→ /mnt/disk/data  not followed`) and asked about the first time it's opened: follow
// it (kept, by link and target, in slipbox's state), just look (read-only, this once, nothing of it indexed), or no.
// A followed target is asked whether it answers before it's walked, in the background: one that doesn't is given up
// on, said so.

import { rootLabel, tildePath } from "../core/names.ts";
import {
  agentsWarning,
  answered,
  blockingLink,
  linkKey,
  linkSaid,
  PROBE_MS,
  probe,
  probeFollowed,
  setLinkAnswer,
} from "../core/symlinks.ts";
import { isInside } from "../core/vault.ts";
import { LINK_REASON } from "../core/walk.ts";
import { stringWidth, truncate, truncateStart } from "../core/width.ts";
import type { App, ListItem } from "./app.ts";
import type { TreeRow } from "./explorer.ts";

/** What answering a link was for: a note opened, a folder unfolded — run once it's followed, or looked at. */
type Then = () => void;

/** The answers the question offers (VV-D6). */
export type LinkChoice = "follow" | "look" | "no";

/** Links out of the vault open, followed only when you say so. */
export class Following {
  constructor(readonly app: App) {}

  /** Links looked at, this once (VV-D6), by their key: read-only, nothing of them indexed — until you leave. */
  readonly looking = new Set<string>();

  /** What's under way in the background — a target asked whether it answers — for tests to wait on. */
  pending: Promise<void> | null = null;

  /**
   * The link keeping `abs` from being read here (VV-D6): one on its way leading out of the vault open — out of home,
   * any in Elsewhere — that you haven't followed nor are looking at. Null when none, or when `abs` is another vault's
   * (read in a peek, as that vault has it).
   */
  blocked(abs: string): { link: string; target: string | null } | null {
    const loc = this.app.loc;
    if (loc.mode !== "folder" && !isInside(loc.root, abs)) return null;
    return blockingLink(loc, abs, { looking: (k) => this.looking.has(k) });
  }

  /** The link being looked at that `abs` is read through, when it is: the file read-only, never indexed. */
  lookedAt(abs: string): string | null {
    const loc = this.app.loc;
    if (!this.looking.size || (loc.mode !== "folder" && !isInside(loc.root, abs))) return null;
    return blockingLink(loc, abs)?.link ?? null;
  }

  /** Opening `abs` (VV-D6): a link not followed on its way asks first — true when it does; `then`, once answered. */
  gate(abs: string, then: Then): boolean {
    const b = this.blocked(abs);
    if (!b) return false;
    this.ask(b.link, b.target, then);
    return true;
  }

  /**
   * The question (VV-D6): follow it, just look, or no — what a yes allows where you are, and, when what it leads to is
   * hidden or outside home, that agents will see what's followed.
   */
  ask(link: string, target: string | null, then?: Then): void {
    if (!target) return this.app.message("warn", `${linkSaid(link, null)}: nothing to follow`);
    const loc = this.app.loc;
    const where = rootLabel(loc);
    const allows =
      loc.mode === "home"
        ? "read, indexed and written to as home's"
        : loc.mode === "vault"
          ? `read and indexed as ${where}'s, never written to: it's outside the vault`
          : "read and written as the file system allows";
    const warn = agentsWarning(target);
    const items: ListItem[] = [
      { label: "Follow it", detail: `${allows} — kept for this link and where it leads`, hotkey: "f", data: "follow" },
      { label: "Just look", detail: "read-only, this once: nothing of it indexed", hotkey: "l", data: "look" },
      { label: "No", detail: "not followed; asked again when you open it", hotkey: "n", data: "no" },
    ];
    if (warn)
      items.unshift({
        label: `${warn}: agents see what's followed — search, the context bundle, the command line`,
        header: true,
        data: null,
      });
    this.app.overlays.openList({
      title:
        loc.mode === "folder"
          ? `${linkSaid(link, target)} is a link: follow it?`
          : `${linkSaid(link, target)} leads out of ${where}: follow it?`,
      items,
      filterable: false,
      footer: true,
      accept: (item) => this.answer(link, target, item.data as LinkChoice, then),
    });
  }

  /** An answer taken: kept (follow, no) or for this once (look); then what opening it was for. */
  answer(link: string, target: string, what: LinkChoice, then?: Then): void {
    const said = linkSaid(link, target);
    if (what === "no") {
      setLinkAnswer(link, "no");
      this.app.explorer.invalidateTree();
      return this.app.message("info", `${said}: not followed`);
    }
    if (what === "look") {
      this.looking.add(linkKey(link));
      this.app.explorer.invalidateTree();
      this.app.message("info", `just looking at ${said}: read-only, nothing of it indexed`);
      return then?.();
    }
    setLinkAnswer(link, "follow");
    this.pending = this.follow(link, target, then);
  }

  /** A link followed: its target asked whether it answers, in the background; then the vault walked again with it. */
  private async follow(link: string, target: string, then?: Then): Promise<void> {
    const ok = answered(target) === true || (await probe(target));
    if (this.app.quitting) return;
    const said = linkSaid(link, target);
    if (!ok) {
      this.app.message("warn", `${said} didn't answer in ${PROBE_MS / 1000} s: not followed for now`);
      return this.app.host.requestRender();
    }
    this.walkAgain();
    this.app.message("info", `following ${said}`);
    then?.();
    this.app.host.requestRender();
  }

  /** The vault walked again, a link followed now: Elsewhere has nothing to walk. */
  walkAgain(): void {
    if (this.app.loc.mode !== "folder") this.app.watch.applyChanges({ changes: [], rescan: true });
    this.app.explorer.invalidateTree();
  }

  /**
   * The vault open's followed links (VV-D6), their targets asked whether they answer, in the background — at the
   * start, and going into a vault: walked again with those that do; those that don't given up on, said so.
   */
  probe(): void {
    const loc = this.app.loc;
    if (loc.mode === "folder") return;
    this.pending = probeFollowed(loc.root).then((r) => {
      if (this.app.loc !== loc || this.app.quitting) return;
      if (r.answered.length) this.walkAgain();
      for (const g of r.gaveUp)
        this.app.message(
          "warn",
          `${linkSaid(g.link, g.target)} didn't answer in ${PROBE_MS / 1000} s: not followed for now`,
        );
      if (r.answered.length || r.gaveUp.length) this.app.host.requestRender();
    });
  }

  /** Gone into another vault: what was looked at is behind you. */
  left(): void {
    this.looking.clear();
  }

  /** Once what's under way is done (tests). */
  async settled(): Promise<void> {
    while (this.pending) {
      const p = this.pending;
      await p;
      if (this.pending === p) this.pending = null;
    }
  }

  /**
   * What an explorer row says of the link it is (VV-D6), dimmed after its name, in `room` columns: where it leads — cut
   * from the front, its last folders kept — and, not walked, that it isn't followed, or that you're only looking, or
   * that its target isn't answering. Null for a row that isn't a link.
   */
  describe(row: TreeRow, room = Number.POSITIVE_INFINITY): string | null {
    const l = row.link;
    if (!l) return null;
    if (!l.target) return "→ nowhere";
    const state =
      !l.reason || l.reason === LINK_REASON.within
        ? ""
        : this.looking.has(linkKey(this.app.explorer.rowAbs(row)))
          ? "  just looking"
          : l.reason === LINK_REASON.waiting
            ? "  not answering"
            : "  not followed";
    const to = tildePath(l.target);
    // Short of room, the state stays and the place gives way, down to its `…`; shorter still, cut from the end.
    const text = `→ ${truncateStart(to, Math.max(1, room - 2 - stringWidth(state)))}${state}`;
    return stringWidth(text) > room ? truncate(text, room) : text;
  }
}
