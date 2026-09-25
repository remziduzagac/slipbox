// Command registry (plan 0.8). Every user-facing action is a named command. The palette lists
// them, keymaps bind to their ids, config remaps them, and later the modal editing layer and
// plugins consume the same registry. Generic over the context so the core stays face-agnostic.

export interface Command<Ctx> {
  /** Stable dotted id, e.g. `link.follow`. This is what keymaps and config refer to. */
  id: string;
  title: string;
  description?: string;
  /** Hidden commands are bindable but not listed in the palette. */
  hidden?: boolean;
  /** When false, the palette greys the command out. */
  enabled?: (ctx: Ctx) => boolean;
  run: (ctx: Ctx, arg?: string) => void | Promise<void>;
}

export class CommandRegistry<Ctx> {
  private readonly commands = new Map<string, Command<Ctx>>();

  register(cmd: Command<Ctx>): void {
    if (this.commands.has(cmd.id)) throw new Error(`command registered twice: ${cmd.id}`);
    this.commands.set(cmd.id, cmd);
  }

  registerAll(cmds: Command<Ctx>[]): void {
    for (const c of cmds) this.register(c);
  }

  get(id: string): Command<Ctx> | undefined {
    return this.commands.get(id);
  }

  list(): Command<Ctx>[] {
    return [...this.commands.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  /** Run by id. `spec` may carry an argument after a space: `theme.set dracula`. */
  async run(ctx: Ctx, spec: string): Promise<boolean> {
    const space = spec.indexOf(" ");
    const id = space < 0 ? spec : spec.slice(0, space);
    const arg = space < 0 ? undefined : spec.slice(space + 1);
    const cmd = this.commands.get(id);
    if (!cmd) return false;
    if (cmd.enabled && !cmd.enabled(ctx)) return true;
    await cmd.run(ctx, arg);
    return true;
  }
}

// -----------------------------------------------------------------------------------------------
// Key names. One canonical spelling, so what the terminal reports and what config says compare
// equal: lowercase, modifiers in the order ctrl, alt, shift, cmd, then the key.
// `G` is `shift+g`; punctuation (`$`, `{`, `?`) names itself, its shift implied.

const MOD_ALIASES: Record<string, string> = {
  ctrl: "ctrl", control: "ctrl",
  alt: "alt", option: "alt", opt: "alt", meta: "alt",
  shift: "shift",
  cmd: "cmd", command: "cmd", super: "cmd", win: "cmd",
};
const MOD_ORDER = ["ctrl", "alt", "shift", "cmd"];
const KEY_ALIASES: Record<string, string> = {
  esc: "escape", return: "enter", cr: "enter", ret: "enter",
  pgdn: "pagedown", pgup: "pageup", "page_down": "pagedown", "page_up": "pageup",
  del: "delete", bs: "backspace", spc: "space", " ": "space", bar: "|", pipe: "|", minus: "-",
};

/** Canonical form of one key token (`Shift+Alt+Left` → `alt+shift+left`, `G` → `shift+g`). */
export function canonKey(token: string, leader = "space"): string {
  const t = token.trim();
  if (!t) return t;
  if (t.toLowerCase() === "leader") return canonKey(leader, "space");
  // Split on "+", but a trailing "+" is the plus key itself ("ctrl++").
  let parts = t.split("+");
  if (t.endsWith("++")) parts = [...t.slice(0, -2).split("+"), "+"];
  else if (t === "+") parts = ["+"];
  let key = parts.pop() ?? "";
  const mods = new Set<string>();
  for (const p of parts) {
    const m = MOD_ALIASES[p.toLowerCase()];
    if (m) mods.add(m);
  }
  if (key.length === 1 && key >= "A" && key <= "Z") {
    mods.add("shift");
    key = key.toLowerCase();
  } else if (key.length > 1) {
    key = key.toLowerCase();
    key = KEY_ALIASES[key] ?? key;
  } else key = KEY_ALIASES[key] ?? key;
  return [...MOD_ORDER.filter((m) => mods.has(m)), key].join("+");
}

/** Canonical form of a key sequence: space-separated tokens, `leader` substituted. */
export function canonSeq(seq: string, leader = "space"): string {
  return seq
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((k) => canonKey(k, leader))
    .join(" ");
}

/** Keymap: key sequences → command specs. Built from defaults plus config overrides. */
export class Keymap {
  private readonly bindings = new Map<string, string>();

  /**
   * @param defaults sequence → command spec, in config notation (`leader l n`)
   * @param overrides the same, from config; `""` unbinds a default
   * @param leader the leader key, substituted for `leader`
   */
  constructor(defaults: Record<string, string>, overrides: Record<string, string> = {}, leader = "space") {
    for (const [k, v] of Object.entries(defaults)) this.bindings.set(canonSeq(k, leader), v);
    for (const [k, v] of Object.entries(overrides)) {
      if (v === "") this.bindings.delete(canonSeq(k, leader));
      else this.bindings.set(canonSeq(k, leader), v);
    }
  }

  lookup(seq: string): string | undefined {
    return this.bindings.get(seq);
  }

  /** True when `seq` is a strict prefix of some binding — the dispatcher then waits for more keys. */
  isPrefix(seq: string): boolean {
    const p = `${seq} `;
    for (const k of this.bindings.keys()) if (k.startsWith(p)) return true;
    return false;
  }

  /** Bindings one key deeper than `prefix` (`""` for the top level): the which-key listing. */
  children(prefix: string): { key: string; spec: string | null; group: boolean }[] {
    const p = prefix ? `${prefix} ` : "";
    const next = new Map<string, { spec: string | null; group: boolean }>();
    for (const [seq, spec] of this.bindings) {
      if (!seq.startsWith(p)) continue;
      const rest = seq.slice(p.length).split(" ");
      const key = rest[0]!;
      const cur = next.get(key) ?? { spec: null, group: false };
      if (rest.length === 1) cur.spec = spec;
      else cur.group = true;
      next.set(key, cur);
    }
    return [...next.entries()].map(([key, v]) => ({ key, ...v }));
  }

  keysFor(commandSpec: string): string[] {
    const out: string[] = [];
    for (const [k, v] of this.bindings) if (v === commandSpec) out.push(k);
    return out;
  }

  entries(): [string, string][] {
    return [...this.bindings.entries()];
  }
}
