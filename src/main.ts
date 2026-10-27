#!/usr/bin/env bun
// Entry point. Chooses a face: a known subcommand runs the CLI; anything else opens the TUI —
// but only when stdout is a terminal (9.3). The TUI is imported lazily so the CLI never loads
// OpenTUI's native renderer.

import { crashReportsOff } from "./core/application/distribution/crash-reports.ts";
import { parseArgs } from "./cli/args.ts";
import { CLI_COMMANDS, defaultIo, EXIT, runCli } from "./cli/cli.ts";

// First: Bun's own crash reports off, in the C environment its crash handler reads (D221).
crashReportsOff();

/** The Bun slipbox is built and tested on: older ones lack what it uses (`node:sqlite` for search, the compile flags). */
const BUN_FLOOR = ">=1.4.2";

async function main(): Promise<number> {
  if (!Bun.semver.satisfies(Bun.version, BUN_FLOOR)) {
    process.stderr.write(`slipbox: needs Bun 1.4.2 or later (this is ${Bun.version})\n`);
    return EXIT.error;
  }
  const argv = process.argv.slice(2);
  // The LSP face is gone (20.23): an editor still starting it is told why, in its log.
  if (argv[0] === "lsp") {
    process.stderr.write(
      "slipbox lsp was removed: links are plain paths now, which editors' own markdown servers follow\n",
    );
    return EXIT.usage;
  }
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

main().then(
  (code) => {
    process.exitCode = code;
  },
  (err) => {
    process.stderr.write(`slipbox: ${(err as Error).stack ?? err}\n`);
    process.exitCode = EXIT.error;
  },
);
