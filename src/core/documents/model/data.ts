// Data files as documents (plan 16.11–16.13, D108).
//
// A data file is read into the same tree a note is: sections become headings (so the outline,
// the breadcrumb and `[[file.toml#section]]` work unchanged), each key a `dataField` node on its
// own source lines (so the lens edits one key, with its comment), records a table, comment lines
// a `dataComment`. Nothing here ever re-serializes a value: editing is always on the text.
//
// TOML, INI and .env are read line by line (their structure is lines), and validated by a real
// parser where there is one (smol-toml); YAML and JSON come from `yaml`'s document tree, which
// keeps positions and comments; JSON is validated by JSON.parse. CSV/TSV is one table.

import type { ParsedData } from "./data/contracts.ts";
import { readToml } from "./data/readers/toml.ts";
import { readIni } from "./data/readers/ini.ts";
import { readYaml } from "./data/readers/yaml.ts";
import { readDelimited } from "./data/readers/delimited.ts";
import { firstLine } from "./data/nodes.ts";

export function parseData(format: string, source: string): ParsedData {
  try {
    switch (format) {
      case "toml":
        return readToml(source);
      case "ini":
        return readIni(source);
      case "yaml":
        return readYaml(source, false);
      case "json":
        return readYaml(source, true);
      case "csv":
        return readDelimited(source, ",");
      case "tsv":
        return readDelimited(source, "\t");
      default:
        return { tree: { type: "root", children: [] }, error: `no reader for ${format}` };
    }
  } catch (err) {
    return { tree: { type: "root", children: [] }, error: firstLine((err as Error).message) };
  }
}

export type { DataField, TreePlace, DataComment, ParsedData, CellLink } from "./data/contracts.ts";
export { stripJsonComments } from "./data/readers/json.ts";
export { dataOutline } from "./data/outline.ts";
export { type DataLink, fieldLink, dataLinks } from "./data/links.ts";
