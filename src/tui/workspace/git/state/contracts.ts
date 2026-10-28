// Inputs and shared state actually used by Git cache/read collaborators; the controller owns these live values.
import type { Config } from "../../../../core/application/config/config.ts";
import type { Checkout } from "../../../../core/workspace/git/git.ts";
import type { GitState } from "../../../../core/workspace/git/branches/gitops.ts";
import type { Track } from "../../../../core/workspace/git/branches/gitremote.ts";
import type { StatusEntry } from "../../../../core/workspace/git/staging/gitstage.ts";
import type { VaultLocation } from "../../../../core/workspace/vaults/vault.ts";

export interface GitReadHost {
  readonly app: {
    readonly loc: VaultLocation;
    readonly live: boolean;
    now(): number;
    readonly host: { requestRender(): void };
    readonly explorer: { invalidateTree(): void };
  };
  states: Map<string, GitState> | null;
  folders: Map<string, GitState>;
  generation: number;
  entries: StatusEntry[] | null;
  track: Track | null;
}

export interface GitBaseHost {
  readonly generation: number;
  readonly app: {
    readonly config: Pick<Config, "git">;
    message(level: "warn", text: string): void;
  };
}

export interface GitStagedHost {
  readonly checkout: Checkout | null;
  readonly generation: number;
  readonly states: Map<string, GitState> | null;
  readonly app: {
    readonly loc: Pick<VaultLocation, "root">;
    readonly config: Pick<Config, "git">;
    readonly host: { requestRender(): void };
  };
}
