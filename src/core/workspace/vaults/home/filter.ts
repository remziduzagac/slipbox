// Home-specific filter construction, shared by cache reuse and live walks.

import type { Config } from "../../../application/config/config.ts";
import type { VaultLocation } from "../vault.ts";
import { WalkFilter } from "../../walk/filtering/filter.ts";

/** Home's filter (VV-D2): its skip list, your config's extensions, exclusions and size cap. */
export function homeFilter(loc: Pick<VaultLocation, "root">, config: Pick<Config, "walk">): WalkFilter {
  return new WalkFilter(loc.root, config.walk, { home: true });
}
