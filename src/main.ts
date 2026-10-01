#!/usr/bin/env bun
// Entry point. Chooses a face: a known subcommand runs the CLI; anything else opens the TUI —
// but only when stdout is a terminal (9.3). The TUI is imported lazily so the CLI never loads
// OpenTUI's native renderer.

import { parseArgs } from "./cli/args.ts";
import { CLI_COMMANDS, defaultIo, EXIT, runCli } from "./cli/cli.ts";

/** The Bun slipbox needs: better-sqlite3 (the search index) panics the process on Bun 1.3. */
const BUN_FLOOR = ">=1.4.2";

async function main(): Promise<number> {
  if (!Bun.semver.satisfies(Bun.version, BUN_FLOOR)) {
    process.stderr.write(`slipbox: needs Bun 1.4.2 or later (this is ${Bun.version}): SQLite, for search, crashes older ones\n`);
    return EXIT.error;
  }
  const argv = process.argv.slice(2);
  // The LSP (11.2) owns stdout: nothing but the protocol may reach it, so it starts before the CLI.
  if (argv[0] === "lsp") return lsp(argv.slice(1));
  let args: ReturnType<typeof parseArgs>;
  try {
    // Parse the way the CLI does, so a flag's value (`--root .`) is never taken for the command.
    args = parseArgs(argv);
  } catch {
    return runCli(argv, defaultIo()); // reports the usage error
  }
  const first = args.positional[0];
  const wantsCli =
    (first !== undefined && CLI_COMMANDS.has(first)) || ["help", "version", "json"].some((f) => args.flags.has(f));
  if (wantsCli) return runCli(argv, defaultIo());

  // `slipbox open [path]` is the explicit spelling of the default.
  const tuiArgs = first === "open" ? argv.filter((_, i) => i !== argv.indexOf("open")) : argv;
  if (!process.stdout.isTTY || !process.stdin.isTTY) {
    process.stderr.write(
      "slipbox: not starting the TUI — stdin/stdout is not a terminal.\n" +
        "         For scripts and agents use a subcommand, e.g. `slipbox render <note>` (see `slipbox help`).\n",
    );
    return EXIT.usage;
  }
  const { runTui } = await import("./tui/run.ts");
  return runTui(tuiArgs);
}

/**
 * `slipbox lsp [--config <file>]`: serve vaults to an editor on stdio. `--stdio` and
 * `--clientProcessId` are what editors pass by habit: taken and ignored (the parent is watched
 * through `initialize`'s process id).
 */
async function lsp(argv: string[]): Promise<number> {
  let configFile: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--config") configFile = argv[++i];
    else if (a.startsWith("--config=")) configFile = a.slice("--config=".length);
    else if (a === "--clientProcessId") i++;
    else if (a === "--stdio" || a.startsWith("--clientProcessId=")) continue;
    else {
      process.stderr.write(`slipbox lsp: unknown argument ${a} (it takes --config <file>)\n`);
      return EXIT.usage;
    }
  }
  const { runLsp } = await import("./lsp/server.ts");
  const code = await runLsp({ input: process.stdin, output: process.stdout, configFile });
  // Watchers and timers would keep the process alive once the editor has gone.
  process.exit(code);
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (err) => {
    process.stderr.write(`slipbox: ${(err as Error).stack ?? err}\n`);
    process.exitCode = EXIT.error;
  },
);
