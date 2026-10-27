// One foreground git read per app. Requests never reopen a result for an obsolete view or revision.
import { statSync } from "node:fs";
import { join } from "node:path";
import { headOf, headCommit } from "../../../core/workspace/git/git.ts";
import type { App } from "../../app/runtime/app.ts";
const active = new WeakMap<App, AbortController>();
export function beginGitRead(app: App, label: string, watchIndex = false) {
  active.get(app)?.abort();
  const controller = new AbortController();
  active.set(app, controller);
  const checkout = app.git.checkout;
  const root = checkout?.root;
  const indexState = () => {
    try {
      const s = statSync(join(checkout!.gitDir, "index"));
      return `${s.ino}:${s.size}:${s.mtimeMs}:${s.ctimeMs}`;
    } catch {
      return "";
    }
  };
  const index = checkout ? indexState() : "";
  const head = checkout ? JSON.stringify([headOf(checkout), headCommit(checkout)]) : "";
  const view = app.view;
  const version = view?.buf.version;
  const documentState = () => {
    try {
      const stat = statSync(view!.buf.abs);
      return `${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
    } catch {
      return "";
    }
  };
  const document = documentState();
  const location = app.loc.root;
  const overlay = app.overlay;
  app.message("info", `${label}…`);
  return {
    signal: controller.signal,
    current: () =>
      !controller.signal.aborted &&
      !app.quitting &&
      app.loc.root === location &&
      app.git.checkout?.root === root &&
      app.view === view &&
      view?.buf.version === version &&
      app.overlay === overlay &&
      documentState() === document &&
      (!checkout ||
        (JSON.stringify([headOf(checkout), headCommit(checkout)]) === head && (!watchIndex || indexState() === index))),
  };
}

export function cancelGitRead(app: App): void {
  active.get(app)?.abort();
  active.delete(app);
}
