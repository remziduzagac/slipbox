// Catalog and mutation prompts for the current workspace; the switch transaction stays in Vaults.
import { existsSync } from "node:fs";
import { dirname, join, posix, relative } from "node:path";
import type { Graph } from "../../../core/workspace/graph/graph.ts";
import { openVault } from "../../../core/workspace/links/reach.ts";
import {
  type Applied,
  applyPlan,
  planMakeVault,
  planRelink,
  planUnmakeVault,
  planVaultRename,
} from "../../../core/workspace/mutations/rename/rename.ts";
import { tildePath } from "../../../core/workspace/vaults/names.ts";
import {
  copyAvailable,
  folderIdentity,
  type NamedFolder,
  pointerName,
  readFolders,
  repositoryCopies,
  setDefaultCopy,
  suggestFolderName,
} from "../../../core/workspace/vaults/folders.ts";
import { initVault, rootAt, vaultAt, vaultOf, type VaultLocation } from "../../../core/workspace/vaults/vault.ts";
import type { Anchor } from "../../../core/workspace/session/position.ts";
import type { ExplorerItem } from "../explorer/contracts.ts";
import type { Explorer } from "../explorer/explorer.ts";
import type { Renaming } from "../explorer/renaming.ts";
import type { Overlays } from "../../shell/overlays/overlays.ts";
import type { ListItem } from "../../shell/overlays/list-types.ts";
import { vaultChoices } from "./vault-list.ts";

/** Live workspace access and only the interactions these prompts use. */
interface VaultPromptContext {
  readonly loc: VaultLocation;
  readonly graph: Graph;
  readonly view: { readonly buf: { readonly abs: string } } | null;
  readonly overlay: { kind: string; text?: string } | null;
  readonly explorer: Pick<Explorer, "folderTarget" | "focused" | "item">;
  readonly overlays: Pick<Overlays, "prompt" | "openList">;
  readonly renaming: Pick<Renaming, "preview">;
  readonly saving: { canLeave(): boolean };
  message(level: "info" | "warn" | "error", text: string): void;
}

type SwitchVault = (target: VaultLocation, open: string | null, anchor?: Anchor, how?: { folder?: string }) => boolean;

/** Vault catalog, copy choices and mutation previews, reading the workspace when invoked. */
export class VaultPrompts {
  constructor(
    private readonly app: VaultPromptContext,
    private readonly switchVault: SwitchVault,
  ) {}

  /** `space v m` in a vault (18.13): the explorer's selected folder (or this note's) made a vault. */
  makeHere(): void {
    const f = this.app.explorer.folderTarget();
    if (!f) return;
    if (f.vault)
      return this.app.message(
        "info",
        `${f.rel} is a vault already — space v shift+m makes it part of the vault holding it`,
      );
    this.makeItem(f);
  }

  /** `space v shift+m` (18.13): the explorer's selected vault, or this one, made a plain folder of the vault holding it. */
  unmakeHere(): void {
    const item = this.app.explorer.focused() ? this.app.explorer.item() : null;
    if (item?.vault) return this.unmakeItem(item);
    if (item)
      return this.app.message(
        "info",
        "to make a vault part of this one, select a nested vault (its folder has its own icon)",
      );
    this.unmakeThis();
  }

  /**
   * This vault, nested in another, made a plain folder of it (18.11, `space v shift+m` from a note): the
   * preview from the vault holding it; then into that vault, the note still open.
   */
  unmakeThis(): void {
    const holder = this.app.loc.mode === "vault" ? vaultOf(dirname(this.app.loc.root)) : null;
    if (!holder)
      return this.app.message(
        "info",
        `${this.app.loc.name ?? this.app.loc.root} isn't inside another vault: only a vault nested in another becomes part of the vault holding it`,
      );
    // Refused before anything changes when the switch into the holder would be: never a root
    // whose .slipbox/ is gone, still open.
    if (!this.app.saving.canLeave()) return;
    const parent = openVault(holder);
    const rel = relative(holder, this.app.loc.root);
    const open = this.app.view?.buf.abs ?? null;
    this.app.renaming.preview(
      () => planUnmakeVault(parent, rel),
      (plan) => {
        if (!this.app.saving.canLeave()) return; // changed while the preview showed
        let applied: Applied;
        try {
          applied = applyPlan(parent, plan);
        } catch (err) {
          return this.app.message("error", (err as Error).message);
        }
        const n = plan.files.reduce((k, f) => k + f.edits.length, 0);
        this.switchVault(vaultAt(holder), open && existsSync(open) ? open : null);
        this.app.message(
          "info",
          `made ${rel}/ part of ${plan.to} (its .slipbox/ is in the trash): ${n} change${n === 1 ? "" : "s"} in ${applied.written.length} file${applied.written.length === 1 ? "" : "s"}`,
        );
      },
    );
  }

  /**
   * A folder given a `.slipbox/` of its own — a root (18.11): its name asked, a distinct one suggested,
   * none when cleared (21.10); then the preview of the links that would stop reaching across, fixed. A
   * loose folder's: the choice `vault.init` gives, and into it.
   */
  makeItem(item: ExplorerItem): void {
    const abs = join(this.app.loc.root, item.rel);
    if (this.app.loc.mode === "folder") return this.choices(abs);
    this.app.overlays.prompt(`give ${item.rel}/ its .slipbox/, called (empty: no name): `, (name) => {
      this.app.renaming.preview(() => planMakeVault(this.app.graph, item.rel, name.trim() || null));
    });
    if (this.app.overlay?.kind === "prompt") this.app.overlay.text = suggestFolderName(abs, this.app.loc.name);
  }

  /** A vault nested here made a plain folder of this one (18.11): the preview, then done. */
  unmakeItem(item: ExplorerItem): void {
    this.app.renaming.preview(() => planUnmakeVault(this.app.graph, item.rel));
  }

  /** A nested root's name (`R`, the row's button): its `.slipbox/` name, which pointers use (17.15, 21.10: `slipbox name`); links are paths and don't change. */
  renameItem(item: ExplorerItem): void {
    if (!item.vault)
      return this.app.message("info", "R names a nested vault: select one (its folder has its own icon)");
    const root = join(this.app.loc.root, item.rel);
    const name = rootAt(root).name ?? posix.basename(item.rel);
    this.app.overlays.prompt(`name ${name}, as pointers name it: `, (text) => {
      const typed = text.trim();
      if (!typed || typed === name) return;
      this.app.renaming.preview(() => planVaultRename(rootAt(root), typed));
    });
    this.app.overlay!.text = name;
  }

  /**
   * A second copy of this folder seen (21.6): which one links to its name open — asked once, the
   * answer remembered; dismissed, the first found stays, and it isn't asked again.
   */
  askDefaultCopy(): void {
    const ident = this.app.loc.mode === "vault" ? folderIdentity(this.app.loc.root) : null;
    const f = ident ? readFolders().find((x) => x.key === ident.key) : undefined;
    const here = f?.copies.filter((c) => copyAvailable(c.path)) ?? [];
    if (!f?.ask || here.length < 2) return;
    this.app.overlays.openList({
      title: `${f.name}: ${here.length} copies on this machine — which do links to it open?`,
      items: here.map((c) => ({
        label: tildePath(c.path),
        hint: c.path === f.default ? "links open it now" : undefined,
        data: c.path,
      })),
      selected: Math.max(
        0,
        here.findIndex((c) => c.path === f.default),
      ),
      filterable: false,
      accept: (item) => {
        setDefaultCopy(f.key, item.data as string);
        this.app.message("info", `links to ${f.name} open ${tildePath(item.data as string)}`);
      },
      cancel: () => setDefaultCopy(f.key, null),
    });
  }

  /**
   * Make a loose folder `dir` a vault (`vault.init`): the choice, as a list. A git checkout is a vault
   * already (20.3), so a loose folder is never one: `.slipbox/` is the only way.
   */
  choices(dir: string): void {
    const items: ListItem[] = [
      {
        label: "Give it .slipbox/",
        detail: "settings of its own — committed with the folder like any file; :name names it for pointers",
        data: "vault",
      },
      { label: "Cancel", detail: "", data: "no" },
    ];
    this.app.overlays.openList({
      title: `${dir} is a folder without .slipbox/ — give it one?`,
      items,
      filterable: false,
      footer: true,
      accept: (item) => (item.data === "no" ? undefined : this.make(dir, false)),
    });
  }

  /** The links a move by hand broke, in and out of the root (20.17): their fix previewed — never written unasked. */
  offerMovedRelink(): void {
    if (this.app.overlay) return;
    try {
      if (planRelink(this.app.graph).files.length) this.app.renaming.preview(() => planRelink(this.app.graph));
    } catch {}
  }

  /** Give `dir` a `.slipbox/` and go into it, the note open (17.18). */
  make(dir: string, privately: boolean): void {
    const open = this.app.view?.buf.abs ?? null;
    let r: ReturnType<typeof initVault>;
    try {
      r = initVault(dir, undefined, { private: privately });
    } catch (err) {
      return this.app.message("warn", (err as Error).message);
    }
    this.switchVault(rootAt(r.root), open && existsSync(open) && open.startsWith(`${r.root}/`) ? open : null);
    this.app.message(
      "info",
      `${tildePath(r.root)} has its .slipbox/ now${r.excluded ? ` (private: in ${r.excluded})` : ""} — :name names it for pointers`,
    );
  }

  /** The named folders (`:folders`, `space v v`): enter goes into one (17.10). */
  openFolders(): void {
    const choices = vaultChoices();
    this.app.overlays.openList({
      title: "Vaults — enter goes into one; / filters",
      slashFilter: true,
      items: choices,
      keepGroups: true,
      accept: (item) => {
        const choice = item.data as { root: string; folder?: string };
        this.switchVault(vaultAt(choice.root), null, undefined, { folder: choice.folder });
      },
    });
  }

  /** Which copy a named folder's links open here (`:folders-default`; `slipbox folders default`). */
  chooseDefaultCopy(): void {
    // A repository's copies, a clone with a .slipbox/ name of its own among them (DF-D30).
    const all = readFolders();
    const copiesOf = (f: NamedFolder) => repositoryCopies(f, all);
    const list = all.filter((f) => copiesOf(f).length > 1);
    if (!list.length)
      return this.app.message("info", "no named folder has two copies here: each one's links open the only one");
    const pick = (f: NamedFolder) =>
      this.app.overlays.openList({
        title: `${f.name}: which copy do links open?`,
        filterable: false,
        selected: Math.max(
          0,
          copiesOf(f).findIndex((c) => c.path === f.default),
        ),
        items: copiesOf(f).map((c) => ({
          label: tildePath(c.path),
          hint: c.path === f.default ? "links open it" : copyAvailable(c.path) ? undefined : "not here",
          data: c.path,
        })),
        accept: (copy) => {
          setDefaultCopy(f.key, copy.data as string);
          this.app.message("info", `links to ${f.name} open ${tildePath(copy.data as string)}`);
        },
      });
    const ident = this.app.loc.mode === "vault" ? folderIdentity(this.app.loc.root) : null;
    const mine = list.find((f) => f.key === ident?.key);
    if (mine || list.length === 1) return pick(mine ?? list[0]!);
    this.app.overlays.openList({
      title: "Which folder's copies?",
      items: list.map((f) => ({ label: pointerName(f, list), hint: `${copiesOf(f).length} copies`, data: f })),
      accept: (item) => pick(item.data as NamedFolder),
    });
  }
}
