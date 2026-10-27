// Renames (20.x): a note, a heading, a folder or a vault renamed or moved, every link to it rewritten — previewed
// first, applied as one change, undone as one.

import { dirname, join, relative, sep } from "node:path";
import { Graph } from "../../../core/workspace/graph/graph.ts";
import { reachedAgain, tuiReach } from "../../documents/navigation/peek.ts";
import { planConvert } from "../../../core/workspace/links/convert.ts";
import {
  type Ambiguous,
  type Applied,
  applyPlan,
  moveTarget,
  planHeadingRename,
  planNoteRename,
  planUndo,
  type RenamePlan,
} from "../../../core/workspace/mutations/rename/rename.ts";
import { vaultConfigFile } from "../../../core/workspace/vaults/registry.ts";
import { recordLocation, rootAt } from "../../../core/workspace/vaults/vault.ts";
import type { App, ListItem, PromptOverlay } from "../../app/runtime/app.ts";

/** Renames and their previews. */
export class Renaming {
  constructor(readonly app: App) {}

  // -------------------------------------------------------------------------------------------
  // Renames (17.15, 7.1–7.3)

  /**
   * A rename's preview (7.2): every line it changes, in every vault, and the warnings (7.3); enter
   * carries it out, esc leaves everything as it was. Refused while a file it touches is unsaved.
   */
  preview(
    make: () => RenamePlan,
    apply: (plan: RenamePlan) => void = (plan) => this.apply(plan),
    /** Rows of the plan's own (the converter's links to pick for), and what enter on one does: true when it's theirs. */
    extra?: (plan: RenamePlan) => { items: ListItem[]; pick: (item: ListItem) => boolean },
  ): void {
    let plan: RenamePlan;
    try {
      plan = make();
    } catch (err) {
      return this.app.message("warn", (err as Error).message);
    }
    // What it rewrites, and what it moves: a folder's every file (its open buffers are replaced by the moved files').
    const touched = new Set([
      ...plan.files.map((f) => f.abs),
      ...(plan.move ? [plan.move.from] : []),
      ...(plan.moves ?? []).map(([from]) => join(this.app.loc.root, from)),
    ]);
    const dirty = this.app.dirtyBuffers().filter((b) => touched.has(b.abs));
    if (dirty.length)
      return this.app.message(
        "warn",
        `unsaved: ${dirty.map((b) => this.app.displayName(b)).join(", ")} — save first: the ${plan.kind === "replace" ? "replace rewrites" : "rename rewrites or moves"} ${dirty.length === 1 ? "it" : "them"}`,
      );
    const n = plan.files.reduce((k, f) => k + f.edits.length, 0);
    const more = extra?.(plan);
    const items: ListItem[] = [
      ...plan.warnings.map((w) => ({ label: `! ${w}`, data: plan })),
      ...(more?.items ?? []),
      ...plan.skipped.map((s) => ({ label: `skipped ${s.shown}:${s.line}`, detail: s.reason, data: plan })),
      // A replace's edit can span lines: each break shown.
      ...plan.files.flatMap((f) =>
        f.edits.map((e) => ({
          label: `${f.shown}:${e.line}`,
          detail: `${e.before.trim().replace(/\n/g, " ⏎ ")}  →  ${e.after.trim().replace(/\n/g, " ⏎ ")}`,
          data: plan,
        })),
      ),
    ];
    if (!plan.files.length)
      items.push({
        label:
          plan.kind === "relink"
            ? "no broken link points where a file moved from"
            : plan.kind === "convert"
              ? "nothing left to convert"
              : plan.kind === "replace"
                ? "nothing to replace"
                : "no links to change",
        data: plan,
      });
    const what =
      plan.kind === "note" || plan.kind === "heading"
        ? `${plan.from} → ${plan.to}`
        : plan.kind === "folder"
          ? `${plan.from}/ → ${plan.to}/`
          : plan.kind === "vault"
            ? `name ${plan.from} → ${plan.to}`
            : plan.kind === "make-vault"
              ? `${plan.from}/ → a vault of its own${plan.to !== plan.from ? `, called ${plan.to}` : ""}`
              : plan.kind === "unmake-vault"
                ? `${plan.from}/ → part of ${plan.to}`
                : plan.kind === "convert"
                  ? "links → plain paths"
                  : plan.kind === "replace"
                    ? `${JSON.stringify(plan.from)} → ${JSON.stringify(plan.to)}`
                    : "relink";
    this.app.overlays.openList({
      title: `${plan.undo ? "undo: " : ""}${what}: ${n} change${n === 1 ? "" : "s"} in ${plan.files.length} file${plan.files.length === 1 ? "" : "s"} — enter: do it, esc: cancel`,
      items,
      filterable: false,
      footer: true,
      accept: (item) => {
        if (!more?.pick(item)) apply(plan);
      },
    });
  }

  /**
   * The converter (20.1): links made plain paths, previewed as a rename is. A link several notes
   * answer to is a row of its own: enter picks its note, and the plan is made again with the pick.
   */
  previewConvert(rels?: string[], picks: Map<string, string> = new Map()): void {
    this.preview(
      () => planConvert(this.app.graph, rels, picks),
      undefined,
      (plan) => ({
        items: (plan.ambiguous ?? []).map((a) => ({
          label: `pick ${a.shown}:${a.line}`,
          detail: `${a.written} — ${a.candidates.length} notes answer to it: enter picks one`,
          data: a,
        })),
        pick: (item) => {
          const a = item.data as Ambiguous | undefined;
          if (!a || !("candidates" in a)) return false;
          this.app.overlays.openList({
            title: `${a.written} in ${a.shown}:${a.line} — which note?`,
            items: a.candidates.map((c) => ({ label: c, data: c })),
            accept: (it) => {
              picks.set(a.key, it.data as string);
              this.previewConvert(rels, picks);
            },
          });
          return true;
        },
      }),
    );
  }

  /** Carry out a previewed rename; open notes follow it (the moved one under its new path). */
  apply(plan: RenamePlan): void {
    if ((plan.kind === "relink" || plan.kind === "convert" || plan.kind === "replace") && !plan.files.length) return;
    let applied: Applied;
    try {
      applied = applyPlan(this.app.graph, plan);
    } catch (err) {
      return this.app.message("error", (err as Error).message);
    }
    const byAbs = (abs: string) => [...this.app.buffers.values()].find((b) => b.abs === abs);
    // Every file that moved (a folder's: each in it): its open buffer, views, history and recents
    // follow it to its new path.
    const moved = new Set<string>();
    for (const [fromRel, toRel] of plan.moves ?? []) {
      const old = byAbs(join(this.app.loc.root, fromRel));
      if (!old) continue;
      const nb = this.app.buffer(toRel);
      if (nb) {
        for (const v of this.app.allViews()) {
          for (const l of [...v.back, ...v.fwd]) if (l.key === old.key) l.key = nb.key;
          if (v.buf === old) {
            Object.assign(v, this.app.makeView(nb, v.topAnchor, v.curAnchor), { back: v.back, fwd: v.fwd });
            this.app.lens.resetForBuffer(v);
          }
        }
        this.app.history.recentNotes = this.app.history.recentNotes.map((k) => (k === old.key ? nb.key : k));
        moved.add(nb.abs);
      }
      this.app.buffers.delete(old.key);
      this.app.languages.servers?.close(old.abs);
    }
    if (plan.move?.dir) {
      // The folder's folds and selection go with it.
      const [from, to] = [relative(this.app.loc.root, plan.move.from), relative(this.app.loc.root, plan.move.to)];
      this.app.explorer.expanded = new Set(
        [...this.app.explorer.expanded].map((d) =>
          d === from || d.startsWith(`${from}/`) ? to + d.slice(from.length) : d,
        ),
      );
      this.app.explorer.followMove(plan.move.from, plan.move.to);
    }
    // A cut that was pasted: done.
    if (
      plan.move &&
      this.app.files.clip?.mode === "cut" &&
      join(this.app.loc.root, this.app.files.clip.rel) === plan.move.from
    )
      this.app.files.clip = null;
    for (const abs of applied.written) {
      const b = byAbs(abs);
      if (b && !moved.has(b.abs)) this.app.watch.reloadBuffer(b);
    }
    if (plan.makeVault || plan.unmakeVault) {
      // A vault made or unmade (18.11): the walk changed where it was (applyPlan rebuilt the index);
      // the machine's vaults, as reached from here, too.
      this.app.reach = tuiReach(this.app, this.app.loc);
      this.app.graph.reach = this.app.reach;
      // Other vaults' files open here, as the new reach reaches them (#10).
      reachedAgain(this.app);
      if (this.app.live) this.app.watch.indexInBackground();
    }
    if (plan.vaults?.length) {
      // Vaults moved with a vault's folder (18.7): the machine's list, and this vault's own walk.
      for (const [, to] of plan.vaults) recordLocation(rootAt(to));
      this.app.graph.build(true, "lazy");
      if (this.app.live) this.app.watch.indexInBackground();
    }
    // A vault renamed: this one (its name here), or one nested in it (the explorer's dimmed name).
    const renamedConfig =
      plan.kind === "vault"
        ? plan.files.find((f) => f.abs.endsWith(`${sep}.slipbox${sep}config.toml`))?.abs
        : undefined;
    if (renamedConfig && renamedConfig !== vaultConfigFile(this.app.loc.root))
      recordLocation(rootAt(dirname(dirname(renamedConfig))));
    if (renamedConfig === vaultConfigFile(this.app.loc.root)) {
      this.app.loc = rootAt(this.app.loc.root);
      recordLocation(this.app.loc);
      this.app.reach = tuiReach(this.app, this.app.loc);
      this.app.graph = new Graph(this.app.loc, this.app.config, this.app.graph.askedFolders).build(true, "lazy");
      this.app.graph.reach = this.app.reach;
      reachedAgain(this.app);
      this.app.watch.followGraph();
      if (this.app.live) this.app.watch.indexInBackground();
    }
    this.app.files.afterFileOp();
    if (plan.move) this.app.explorer.select(relative(this.app.loc.root, plan.move.to));
    if (plan.makeVault || plan.unmakeVault) this.app.explorer.select(plan.from);
    const n = plan.files.reduce((k, f) => k + f.edits.length, 0);
    // A note or folder moved where the vault never indexes it (D246): said after where it went.
    const left =
      plan.move && (plan.kind === "note" || plan.kind === "folder")
        ? this.app.files.notIndexed(plan.move.to, plan.move.dir)
        : "";
    const what = plan.undo
      ? {
          note: `renamed ${plan.from} back to ${plan.to}${left}`,
          folder: `moved ${plan.from}/ back to ${plan.to}/${left}`,
          vault: `named the folder ${plan.from} back to ${plan.to}`,
          relink: "undid the relink",
          "make-vault": "",
          "unmake-vault": "",
          heading: `renamed the heading ${plan.from} back to ${plan.to}`,
          convert: "undid the conversion to plain paths",
          replace: `undid the replace of ${JSON.stringify(plan.to)} with ${JSON.stringify(plan.from)}`,
        }[plan.kind]
      : plan.kind === "note" || plan.kind === "heading"
        ? `renamed ${plan.from} → ${plan.to}${left}`
        : plan.kind === "folder"
          ? `moved ${plan.from}/ → ${plan.to}/${left}`
          : plan.kind === "vault"
            ? `named the folder ${plan.from} → ${plan.to}`
            : plan.kind === "make-vault"
              ? `made ${plan.from}/ a vault of its own${plan.to !== plan.from ? `, called ${plan.to}` : ""}`
              : plan.kind === "unmake-vault"
                ? `made ${plan.from}/ part of ${plan.to} (its .slipbox/ is in the trash)`
                : plan.kind === "convert"
                  ? "converted links to plain paths"
                  : plan.kind === "replace"
                    ? `replaced ${JSON.stringify(plan.from)} with ${JSON.stringify(plan.to)}`
                    : "relinked";
    this.app.message(
      "info",
      `${what}: ${n} change${n === 1 ? "" : "s"} in ${plan.files.length} file${plan.files.length === 1 ? "" : "s"}`,
    );
    for (const w of applied.warnings) this.app.message("warn", w);
  }

  /** Undo the vault's last rename, move or relink (7.4): its preview, then carried out as a rename is. */
  undo(): void {
    this.preview(() => planUndo(this.app.graph));
  }

  /** Ask for a note's new path, then preview its rename. */
  prompt(rel: string): void {
    this.app.overlays.prompt(`rename or move ${rel} to: `, (to) => {
      if (to.trim()) this.noteTo(rel, to.trim());
    });
    (this.app.overlay as PromptOverlay).text = rel.replace(/\.(md|markdown)$/i, "");
  }

  /** Preview a note's rename or move to a typed path: a folder there, or a path ending in `/`, is into it (DF-D4). */
  noteTo(rel: string, to: string): void {
    this.preview(() => planNoteRename(this.app.graph, rel, moveTarget(this.app.graph, rel, to)));
  }

  /** Ask for a heading's new name, then preview its rename (11.9): every link to it fixed. */
  promptHeading(rel: string, heading: string): void {
    this.app.overlays.prompt(`rename the heading "${heading}" to: `, (to) => {
      if (to.trim()) this.preview(() => planHeadingRename(this.app.graph, rel, heading, to.trim()));
    });
    (this.app.overlay as PromptOverlay).text = heading;
  }
}
