// The configuration in the TUI: the keymaps, the theme and glyphs built from it, the UI settings (`space u`) and
// the overrides a session keeps, and the live reload of the config files when one is saved.

import { canonKey, canonSeq, Keymap, unknownModifiers } from "../core/commands.ts";
import { type Config, loadConfig } from "../core/config.ts";
import { glyphsFor, type Glyphs } from "../core/glyphs.ts";
import { Graph } from "../core/graph.ts";
import { lintCommand } from "../core/lint.ts";
import { userConfigFile } from "../core/paths.ts";
import type { UiOverride } from "../core/position.ts";
import { applyColorOverrides, loadTheme, type Theme } from "../core/theme/index.ts";
import { configFilesFor, setRootMarkers } from "../core/vault.ts";
import { setTrustedRoots } from "../core/trust.ts";
import {
  DEFAULT_ALIASES,
  DEFAULT_EXPLORER_KEYS,
  DEFAULT_GROUPS,
  DEFAULT_KEYS,
  DEFAULT_OUTLINE_KEYS,
  DEFAULT_FOOTNOTE_KEYS,
  FOOTNOTE_ACTIONS,
  DEFAULT_INFO_KEYS,
  INFO_ACTIONS,
  DEFAULT_PEEK_KEYS,
  DEFAULT_RESIZE_KEYS,
  DEFAULT_VISUAL_KEYS,
  DEFAULT_SOURCE_KEYS,
  EXPLORER_ACTIONS,
  OUTLINE_ACTIONS,
  RESIZE_ACTIONS,
  parseGroup,
} from "./keys.ts";
import type { App, UiState } from "./app.ts";
import { uiDefaults } from "./app.ts";
import { existsSync, statSync } from "node:fs";

/** The configuration: keys, theme, glyphs, the UI settings, and live reload. */
export class Settings {
  constructor(readonly app: App) {}

  /** UI settings changed in this session, with the config value each overrode. */
  uiOverrides: Record<string, UiOverride> = {};
  readonly lastGood = new Map<string, Record<string, unknown>>();
  /** Which file set each setting taken, for saying where one came from (the links' convention, 21.4). */
  origins: Record<string, string> = {};
  private stamps = new Map<string, number>();

  // -------------------------------------------------------------------------------------------
  // Configuration: keys, theme, glyphs, and live reload.

  /** (Re)build every keymap, the groups and the aliases from defaults plus config. */
  applyKeys(): void {
    const c = this.app.config;
    // The leader: a real key, and not one already bound on its own (it would wait before acting).
    let leader = canonKey(c.input.leader || "space");
    if (unknownModifiers(leader).length) {
      this.app.message("warn", `config: input.leader "${c.input.leader}" isn't a key slipbox knows; using space`);
      leader = "space";
    } else if (leader !== "space" && DEFAULT_KEYS[leader] !== undefined) {
      this.app.message(
        "warn",
        `config: input.leader "${c.input.leader}" is also ${DEFAULT_KEYS[leader]}: that key now waits for more`,
      );
    }
    this.app.leader = leader;
    const { visual, explorer, outline, footnotes, info, resize, source, ...normal } = c.keys;
    this.app.keymap = new Keymap(DEFAULT_KEYS, normal as Record<string, string>, this.app.leader);
    this.app.visualKeys = new Keymap(DEFAULT_VISUAL_KEYS, visual ?? {}, this.app.leader);
    this.app.sourceKeys = new Keymap(DEFAULT_SOURCE_KEYS, source ?? {}, this.app.leader);
    this.app.explorerKeys = new Keymap(DEFAULT_EXPLORER_KEYS, explorer ?? {}, this.app.leader);
    this.app.problemsKeys = new Keymap(
      { ...DEFAULT_EXPLORER_KEYS, tab: "switch", "shift+tab": "switch" },
      explorer ?? {},
      this.app.leader,
    );
    this.app.outlineKeys = new Keymap(DEFAULT_OUTLINE_KEYS, outline ?? {}, this.app.leader);
    this.app.footnoteKeys = new Keymap(DEFAULT_FOOTNOTE_KEYS, footnotes ?? {}, this.app.leader);
    this.app.infoKeys = new Keymap(DEFAULT_INFO_KEYS, info ?? {}, this.app.leader);
    this.app.resizeKeys = new Keymap(DEFAULT_RESIZE_KEYS, resize ?? {}, this.app.leader);
    this.app.peekKeys = new Keymap(DEFAULT_PEEK_KEYS, {}, this.app.leader);
    // No prototype: a typed :toString or :constructor is an unknown alias, not Object's.
    this.app.aliases = Object.assign(Object.create(null) as Record<string, string>, DEFAULT_ALIASES);
    for (const [k, v] of Object.entries(c.aliases)) {
      if (v === "") delete this.app.aliases[k];
      else this.app.aliases[k] = v;
    }
    this.app.groups = new Map();
    for (const [k, v] of Object.entries({ ...DEFAULT_GROUPS, ...c.groups }))
      this.app.groups.set(canonSeq(k, this.app.leader), parseGroup(v));
    const ids = new Set(this.app.registry.list().map((x) => x.id));
    const bad = [...this.app.keymap.entries(), ...this.app.visualKeys.entries(), ...this.app.sourceKeys.entries()]
      .map(([, v]) => v.split(" ")[0]!)
      .filter((id) => !ids.has(id));
    for (const id of new Set(bad)) this.app.message("warn", `config: [keys] binds unknown command "${id}"`);
    for (const [a, v] of Object.entries(this.app.aliases))
      if (!ids.has(v.split(" ")[0]!)) this.app.message("warn", `config: [aliases] ${a} = unknown command "${v}"`);
    // Keys with a modifier slipbox doesn't know can never be pressed: say so.
    const tables: [string, Record<string, unknown>][] = [["keys", c.keys as Record<string, unknown>]];
    for (const sub of ["visual", "source", "explorer", "outline", "footnotes", "info", "resize"]) {
      const t = (c.keys as Record<string, unknown>)[sub];
      if (t && typeof t === "object") tables.push([`keys.${sub}`, t as Record<string, unknown>]);
    }
    for (const [table, map] of tables) {
      for (const k of Object.keys(map)) {
        const bad = unknownModifiers(k);
        if (bad.length)
          this.app.message(
            "warn",
            `config: [${table}] "${k}": unknown modifier ${bad.map((b) => `"${b}"`).join(", ")} (ctrl, alt, shift, cmd)`,
          );
      }
    }
    // The in-pane keymaps name actions, not commands: check them against their own lists.
    const panes: [string, Keymap, readonly string[]][] = [
      ["keys.explorer", this.app.explorerKeys, EXPLORER_ACTIONS],
      ["keys.outline", this.app.outlineKeys, OUTLINE_ACTIONS],
      ["keys.footnotes", this.app.footnoteKeys, FOOTNOTE_ACTIONS],
      ["keys.info", this.app.infoKeys, INFO_ACTIONS],
      ["keys.resize", this.app.resizeKeys, Object.keys(RESIZE_ACTIONS)],
    ];
    for (const [table, map, actions] of panes) {
      for (const a of new Set(map.entries().map(([, v]) => v)))
        if (!actions.includes(a))
          this.app.message("warn", `config: [${table}] binds unknown action "${a}" (${actions.join(", ")})`);
    }
  }

  applyTheme(): void {
    const t = this.themeNamed(this.app.ui.theme);
    for (const w of t.warnings) this.app.message("warn", w);
    this.app.theme = t.theme;
  }

  /** A theme by name with the config's `[colors]` overrides on top; always mono under NO_COLOR. */
  themeNamed(name: string): { theme: Theme; warnings: string[] } {
    const t = loadTheme(process.env.NO_COLOR ? "mono" : name);
    const o = applyColorOverrides(t.theme, this.app.config.colors);
    return { theme: o.theme, warnings: [...(t.warning ? [t.warning] : []), ...o.warnings] };
  }

  /** Change a UI setting from the TUI; remembered in the session against its config default. */
  setUi<K extends keyof UiState>(key: K, value: UiState[K]): void {
    this.app.ui[key] = value;
    const base = uiDefaults(this.app.config)[key];
    if (value === base) delete this.uiOverrides[key];
    else this.uiOverrides[key] = { value, base };
    this.applyUi(key);
  }

  private applyUi(key: keyof UiState): void {
    if (key === "theme") this.applyTheme();
    else if (key === "glyphs") this.app.glyphs = this.glyphSet(this.app.ui.glyphs);
    else if (key === "mouse") this.app.host.setMouse?.(this.app.ui.mouse);
    this.app.relayoutAll();
  }

  /** The glyph set for `mode`, with the frame's lines as `ui.lines` asks. */
  glyphSet(mode: string): Glyphs {
    return glyphsFor(mode, process.env, this.app.config.ui.lines);
  }

  private files(): string[] {
    // Yours, the enclosing roots' (20.7) and the root's own: a change to any is a reload.
    const { vaultFile, outerFiles } = configFilesFor(this.app.loc);
    return [
      this.app.configFile ?? process.env.SLIPBOX_CONFIG ?? userConfigFile(),
      ...outerFiles,
      ...(vaultFile ? [vaultFile] : []),
    ];
  }

  recordStamps(): void {
    this.stamps = new Map(this.files().map((f) => [f, fileStamp(f)]));
  }

  /** True when a config file was created, changed or removed since the last load. */
  changedOnDisk(): boolean {
    for (const [f, before] of this.stamps) if (fileStamp(f) !== before) return true;
    return false;
  }

  /**
   * Reload config and apply what changed, live: keys, aliases, groups, theme and colour
   * overrides, every UI setting, render settings, the walk (rebuild), the watcher. A UI setting whose config value
   * changed takes the new value, replacing any session override of it.
   */
  reload(reason: "manual" | "file changed" = "manual"): void {
    this.recordStamps();
    const loaded = loadConfig({
      ...configFilesFor(this.app.loc),
      configFile: this.app.configFile,
      lastGood: this.lastGood,
    });
    this.origins = loaded.origins;
    this.app.info.cache = null; // the links' convention may say otherwise now
    this.app.input.clearPending(); // a sequence begun under the old keys means nothing under the new ones
    const before = this.app.config;
    const next = loaded.config;
    this.app.config = next;
    setRootMarkers(next.walk.root_markers); // where roots are, from now on (21.1): your config only
    setTrustedRoots(next.trust.roots); // and which may run their own code (23.x): yours only too
    this.app.languages.lintCmd = lintCommand(next.lint, this.app.loc.root, undefined, next.lsp.auto_install);
    const differs = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b);
    const changed = (Object.keys(next) as (keyof Config)[]).filter((s) => differs(before[s], next[s]));
    if (changed.includes("search") && !changed.includes("walk")) this.app.search.start();
    // Linters (19.19) tried again, and every file linted again, under the new ones.
    if (changed.some((s) => s === "linter" || s === "language" || s === "lint")) this.app.languages.relint();

    const oldUi = uiDefaults(before);
    const newUi = uiDefaults(next);
    for (const key of Object.keys(newUi) as (keyof UiState)[]) {
      if (differs(oldUi[key], newUi[key])) {
        delete this.uiOverrides[key];
        (this.app.ui as unknown as Record<string, unknown>)[key] = newUi[key];
        this.applyUi(key);
      }
    }
    if (before.ui.lines !== next.ui.lines) this.app.glyphs = this.glyphSet(this.app.ui.glyphs);
    if (before.ui.sidebar !== next.ui.sidebar) this.app.sidebar.visible = next.ui.sidebar;
    if (before.ui.outline !== next.ui.outline) this.app.outline.visible = next.ui.outline;
    if (before.ui.sidebar_width !== next.ui.sidebar_width) this.app.panels.sideW = next.ui.sidebar_width;
    if (before.ui.outline_width !== next.ui.outline_width) this.app.panels.outW = next.ui.outline_width;
    if (before.ui.split_ratio !== next.ui.split_ratio) for (const t of this.app.tabs) t.ratio = next.ui.split_ratio;
    if (changed.some((s) => s === "keys" || s === "aliases" || s === "groups" || s === "input")) this.applyKeys();
    if (changed.includes("colors") && !differs(oldUi.theme, newUi.theme)) this.applyTheme();
    if (changed.includes("render")) {
      for (const b of this.app.buffers.values()) b.invalidateLayouts();
      this.app.relayoutAll();
    }
    if (changed.includes("walk")) {
      this.app.graph = new Graph(this.app.loc, this.app.config).build(true, "lazy");
      this.app.graph.reach = this.app.reach;
      this.app.watch.followGraph();
      this.app.watch.indexInBackground();
      this.app.explorer.invalidateTree();
      for (const b of this.app.buffers.values()) b.invalidateLayouts();
      this.app.relayoutAll();
      this.app.watcher?.close();
      this.app.watcher = null;
      if (next.watch.enabled) this.app.watch.startWatcher();
    } else if (changed.includes("watch")) {
      this.app.watcher?.close();
      this.app.watcher = null;
      if (next.watch.enabled) this.app.watch.startWatcher();
    }
    for (const w of loaded.warnings) this.app.message("warn", w);
    this.app.message(
      "info",
      `config reloaded (${reason}) — ${changed.length ? `changed: ${changed.join(", ")}` : "no changes"}`,
    );
  }
}

function fileStamp(path: string): number {
  try {
    return existsSync(path) ? statSync(path).mtimeMs : -1;
  } catch {
    return -1;
  }
}
