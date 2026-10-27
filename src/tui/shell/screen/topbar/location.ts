import type { App } from "../../../app/runtime/app.ts";
import type { Role } from "../../../../core/rendering/theme/theme.ts";
import { sanitize } from "../../../../core/foundation/text/sanitize.ts";
import { tildePath } from "../../../../core/workspace/vaults/names.ts";
import { whereOf } from "./where.ts";
import type { LocationItem } from "./fit-location.ts";

export function locationItems(app: App): LocationItem[] {
  const w = whereOf(app);
  const g = app.glyphs;
  const workspace = app.homeFolder ?? (app.loc.mode === "home" ? "~" : w.vault);
  const count = new Set(app.git.entries?.map((entry) => entry.path)).size;
  return [
    { text: `${g.explorerButton} ${sanitize(tildePath(app.explorer.top))}`, id: "top:zoom", role: "topbar" },
    { text: `${g.vault} ${sanitize(workspace)}`, id: "top:vault", role: "topbar" },
    ...(w.branch
      ? [
          {
            text: `${g.branch} ${w.branch}${w.track ? ` ${w.track}` : ""}${w.op ? ` ${w.op}` : ""}`,
            compact: `${g.branch} ${w.branch}${w.op ? ` ${w.op}` : ""}`,
            id: "top:branch",
            role: "status_dim" as Role,
          },
        ]
      : []),
    ...(count ? [{ text: `${g.changed} ${count}`, id: "top:changed", role: "git_modified" as Role }] : []),
  ];
}
