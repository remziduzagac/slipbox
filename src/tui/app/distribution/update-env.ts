import type { Channel, InstalledBy } from "../../../core/application/distribution/install.ts";
import type { ReleaseBuild } from "../../../core/application/distribution/release.ts";

/** What slipbox knows of itself and where it keeps things: `tui/shell/terminal/run.ts`'s, a test's own. */
export interface UpdateEnv {
  release: ReleaseBuild | null;
  version: string;
  by: InstalledBy;
  /** The installer's install's channel; any other follows stable releases. */
  channel: Channel;
  /** The installer's data folder. */
  data: string;
  /** This binary: `slipbox upgrade --json` is run with it. */
  execPath: string;
  /** The file it was started by, as the shell found it (`startedPath`): one put by hand is watched there. */
  startedBy: string | null;
  /** slipbox's state folder: `update.json`, a background upgrade's answer. */
  stateDir: string;
  env: Record<string, string | undefined>;
  /** Your own config's `[update] check`, read again. */
  checkOn: () => boolean;
  fetcher?: (url: string, init?: RequestInit) => Promise<Response>;
}
