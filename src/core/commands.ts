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

  /** Run by id. `id` may carry an argument after a space: `theme.set dracula`. */
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

/** Keymap: key sequences (space-separated keys) → command specs. Parsed from `[keys]` config. */
export class Keymap {
  private readonly bindings = new Map<string, string>();

  constructor(defaults: Record<string, string>, overrides: Record<string, string> = {}) {
    for (const [k, v] of Object.entries(defaults)) this.bindings.set(normaliseSeq(k), v);
    // An override of "" unbinds.
    for (const [k, v] of Object.entries(overrides)) {
      if (v === "") this.bindings.delete(normaliseSeq(k));
      else this.bindings.set(normaliseSeq(k), v);
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

  keysFor(commandSpec: string): string[] {
    const out: string[] = [];
    for (const [k, v] of this.bindings) if (v === commandSpec) out.push(k);
    return out;
  }

  entries(): [string, string][] {
    return [...this.bindings.entries()];
  }
}

function normaliseSeq(seq: string): string {
  return seq.trim().split(/\s+/).join(" ");
}
