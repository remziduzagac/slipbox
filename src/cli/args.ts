// Argument parsing. Deliberately tiny: flags may appear anywhere, `--x=v` and `--x v` both work,
// `--` ends flags.

export interface Args {
  positional: string[];
  flags: Map<string, string | true>;
}

/** Flags that take a value, and boolean flags. Anything else is a usage error. */
export const VALUED = new Set(["root", "config", "color", "width", "theme", "from", "ref", "lang", "if-unchanged", "glyphs", "lines", "line", "server", "name"]);
const BOOLEAN = new Set(["all", "files", "json", "plain", "snippet", "stdin", "help", "version", "regex", "whole", "ignore-case", "first", "first-per-line", "dry-run", "create", "append", "paragraph", "allow-empty", "check", "uncheck", "private", "lint"]);

export class UsageError extends Error {}

// Text that starts with a dash (a list item: "- 22:10 seeing") reads as an option.
const DASH_HINT = " (text or a pattern starting with - goes after --: slipbox write note --append -- '- item')";

export function parseArgs(argv: string[]): Args {
  const positional: string[] = [];
  const flags = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--") {
      positional.push(...argv.slice(i + 1));
      break;
    }
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      const name = eq >= 0 ? a.slice(2, eq) : a.slice(2);
      if (VALUED.has(name)) {
        const v = eq >= 0 ? a.slice(eq + 1) : argv[++i];
        if (v === undefined) throw new UsageError(`--${name} needs a value`);
        // An empty value is never meant: an empty --if-unchanged would check nothing, an empty
        // --root would quietly mean the current directory.
        if (v === "") throw new UsageError(`--${name} needs a value (it was empty)`);
        flags.set(name, v);
      } else {
        if (!BOOLEAN.has(name)) throw new UsageError(`unknown option: --${name}${DASH_HINT}`);
        if (eq >= 0) throw new UsageError(`--${name} does not take a value`);
        flags.set(name, true);
      }
      continue;
    }
    if (a === "-h") {
      flags.set("help", true);
      continue;
    }
    if (a === "-V") {
      flags.set("version", true);
      continue;
    }
    if (a.startsWith("-") && a.length > 1) throw new UsageError(`unknown option: ${a}${DASH_HINT}`);
    positional.push(a);
  }
  return { positional, flags };
}

export function flag(args: Args, name: string): string | undefined {
  const v = args.flags.get(name);
  return typeof v === "string" ? v : undefined;
}

export function has(args: Args, name: string): boolean {
  return args.flags.has(name);
}
