// Capabilities read by the permanent location group; the active client still owns every value.
import type { Glyphs } from "../../../../core/rendering/theme/glyphs.ts";
import type { VaultLocation } from "../../../../core/workspace/vaults/vault.ts";
import type { Track } from "../../../../core/workspace/git/branches/gitremote.ts";
import type { OperationContext } from "../../../../core/workspace/git/branches/operation-status.ts";

export interface WhereContext extends OperationContext {
  readonly loc: Pick<VaultLocation, "mode" | "name" | "root">;
  readonly glyphs: Pick<Glyphs, "gitAhead" | "gitBehind">;
  readonly git: OperationContext["git"] & { branch(): string | null; readonly track: Track | null };
}

export interface LocationContext extends WhereContext {
  readonly homeFolder: string | null;
  readonly explorer: { readonly top: string };
  readonly glyphs: WhereContext["glyphs"] & Pick<Glyphs, "explorerButton" | "vault" | "branch" | "changed">;
  readonly git: WhereContext["git"] & { readonly entries: readonly { readonly path: string }[] | null };
}
