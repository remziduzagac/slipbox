// Move through peek history, keep tabs and change its display size.

import { readText } from "../../../../core/foundation/platform/fsutil.ts";
import { rootLabel, tildePath } from "../../../../core/workspace/vaults/names.ts";
import { linkSaid } from "../../../../core/workspace/vaults/symlinks.ts";
import { locateVault, type VaultLocation } from "../../../../core/workspace/vaults/vault.ts";
import type { App } from "../../../app/runtime/app.ts";
import { here, peekOf } from "./state.ts";
import { goThere, unfollowed } from "./paths.ts";
import { notRead } from "./presentation.ts";
import { show } from "./opening.ts";

/** `ctrl+o` (back) and forward inside the peek: the file a link moved it from, where it was read. */
export function peekStep(app: App, dir: "back" | "forward"): void {
  const p = peekOf(app);
  if (!p) return;
  const from = dir === "back" ? p.back : p.fwd;
  const to = here(app)!;
  const place = from.at(-1);
  if (!place)
    return app.message(
      "info",
      dir === "back" ? "the peek's first place — esc closes it, o goes there" : "no later place in the peek",
    );
  // Read as a link to it is: not through a link not followed, which can have changed since (VV-D6).
  const b = unfollowed(app, place.abs, place.loc);
  let text: string;
  if (b) text = notRead(b, rootLabel(place.loc));
  else
    try {
      text = readText(place.abs).text;
    } catch {
      from.pop();
      return app.message("warn", `${tildePath(place.abs)} is gone`);
    }
  from.pop();
  const back = dir === "back" ? p.back : [...p.back, to];
  const fwd = dir === "back" ? [...p.fwd, to] : p.fwd;
  show(
    app,
    {
      abs: place.abs,
      loc: place.loc,
      back,
      fwd,
      full: p.full,
      ...(b ? { unread: true } : {}),
      ...(place.rows && !b ? { rows: place.rows } : {}),
    },
    text,
    place.top,
    place.cursor,
  );
}

/** `o` in a peek: go there, where it's read. On a tab kept from a peek, into its vault, at the same place. */
export function peekGo(app: App): void {
  const f = app.floating;
  if (f?.kind === "peek") return goThere(app, f.peek.abs, f.peek.loc, { ...f.view.curAnchor.anchor });
  const v = app.view;
  if (!v?.buf.elsewhere) return app.message("info", "nothing to go to: o goes where a peek's file is");
  let loc: VaultLocation;
  try {
    loc = locateVault({ path: v.buf.abs });
  } catch {
    return app.message("warn", `${tildePath(v.buf.abs)} is gone`);
  }
  goThere(app, v.buf.abs, loc, { ...v.curAnchor.anchor });
}

/**
 * `t` in a peek: keep it as a tab here — the file read-only, marked with its vault's name (its tab, its path),
 * Elsewhere's too (VV-D3).
 */
export function peekKeep(app: App): void {
  const f = app.floating;
  if (f?.kind !== "peek") return app.message("info", "t keeps a peek as a tab: there's no peek open");
  const { abs, loc, label } = f.peek;
  // A tab reads it: not through a link its place hasn't followed (VV-D6).
  const b = unfollowed(app, abs, loc);
  if (b)
    return app.message("warn", `${linkSaid(b.link, b.target)} isn't followed in ${label} — o goes there to choose`);
  const top = { ...f.view.topAnchor };
  const cursor = { ...f.view.curAnchor };
  app.overlays.closeFloating();
  const open = app.buffers.get(abs);
  const buf = open ?? app.buffer(abs);
  if (!buf) return;
  // Another vault's file is marked so by `buffer` (VV-D7), Elsewhere's too (VV-D3).
  if (!open && !buf.elsewhere && loc.mode === "folder") {
    buf.elsewhere = { vault: label, graph: null, rel: null };
    buf.readOnly = `read-only here: ${label}'s — o goes there, to edit it`;
  }
  const i = app.tabs.findIndex((t) => t.views.some((v) => v.buf === buf));
  if (i >= 0) {
    app.activeTab = i;
    const t = app.tabs[i]!;
    t.active = t.views.findIndex((v) => v.buf === buf);
  } else {
    app.tabs.push({
      views: [app.makeView(buf, top, cursor)],
      active: 0,
      orientation: "side",
      ratio: app.config.ui.split_ratio,
    });
    app.activeTab = app.tabs.length - 1;
  }
  app.region = "content";
  app.message("info", `${app.displayName(buf)}: kept as a tab, ${buf.readOnly ? "read-only" : "as it was open"}`);
}

/** `z` in a peek: the whole screen, or most of it again. */
export function peekFill(app: App): void {
  const p = peekOf(app);
  if (!p) return app.message("info", "z fills the screen with a peek: there's no peek open");
  p.full = !p.full;
  app.floating!.view.layoutKey = "";
}
