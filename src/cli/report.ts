// `slipbox report` (RPT-D5): the facts a bug report asks for, and the bug form's address filled in with them — for
// you to open, or for an agent writing an issue (`--json`). Run before any vault is looked for, as `--version` is: a
// report is often of a vault that won't open. It reads no vault's config, writes nothing, reaches no network; it
// never asks the terminal who it is.

import {
  factFields,
  factSources,
  factsMarkdown,
  FACT_IDS,
  formAddress,
  LABEL,
  reportFacts,
  reportRepo,
} from "../core/report.ts";
import type { Io, Result } from "./common.ts";

export function report(io: Io): Result {
  // The size only of a terminal: piped, the columns are the pipe's reader's, not the terminal slipbox draws in.
  const size = io.isTTY && io.columns && io.rows ? { cols: io.columns, rows: io.rows } : null;
  const facts = reportFacts(factSources({ env: io.env, size }));
  const fields = factFields(facts);
  const url = formAddress(reportRepo(), fields);
  const width = Math.max(...FACT_IDS.map((id) => LABEL[id].length));
  const human = [
    ...FACT_IDS.map((id) => `${LABEL[id].padEnd(width)}  ${fields[id]}`),
    "",
    "The bug form, these filled in (nothing has been sent):",
    url,
    "",
  ].join("\n");
  return { data: { facts, fields, body: factsMarkdown(fields), url }, human };
}
